const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const expoRoot = path.dirname(require.resolve('expo/package.json'));
const babel = require(require.resolve('@babel/core', { paths: [expoRoot] }));
const preset = require.resolve('babel-preset-expo', { paths: [expoRoot] });
const readAsset = (name) => readFileSync(path.join(root, 'src/assets/image', name), 'utf8');

function loadModule(file, mocks = {}, extraSource = '') {
  const filename = path.resolve(root, file);
  const code = babel.transformSync(readFileSync(filename, 'utf8') + extraSource, {
    filename, presets: [preset], caller: { name: 'market-card-tests', supportsStaticESM: false },
  }).code;
  const module = { exports: {} };
  const localRequire = (name) => {
    if (name in mocks) return mocks[name];
    if (name.startsWith('@babel/runtime/')) return require(require.resolve(name, { paths: [expoRoot] }));
    if (name.endsWith('.svg')) return name;
    throw new Error(`Unmocked import: ${name}`);
  };
  vm.runInNewContext(code, {
    module, exports: module.exports, require: localRequire, console,
    requestAnimationFrame: () => 1, cancelAnimationFrame: () => {},
  }, { filename });
  return module.exports;
}

const { composeMarketCardSvg } = loadModule('src/utils/marketCardSvg.js');
const jsx = (type, props) => ({ type, props });
const jsxMocks = { 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react/jsx-dev-runtime': { jsxDEV: jsx } };
const walk = (node) => !node || typeof node !== 'object' ? []
  : [node, ...[node.props?.children].flat(Infinity).flatMap(walk)];
const flatStyle = (style) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

// Use the installed SVG parser with non-native tag stubs. This checks structure,
// not iOS pixels or native compositor timing.
const tags = new Proxy({}, { get: (_, name) => name });
const { parse } = loadModule(require.resolve('react-native-svg/src/xml.tsx'), {
  ...jsxMocks, react: { Component: class {} }, './utils/fetchData': {}, './xmlTags': { tags },
});

const cases = [
  ['Frame_bigBull.svg', 'Bull.svg', 475 / 469, 1.2, -5],
  ['Frame_bigBear.svg', 'Bear.svg', 454 / 427],
  ['Frame_normalBull.svg', 'Bull.svg', 475 / 469, 1.2, -5],
  ['Frame_normalBear.svg', 'Bear.svg', 454 / 427],
  ['Frame_small.svg', 'Bull.svg', 475 / 469, 1.2, -5],
  ['Frame_small.svg', 'Bear.svg', 454 / 427],
  ['Frame_snake.svg', 'Sideways.svg', 575 / 447],
];

test('all seven regimes retain both artworks in exactly one SVG root', () => {
  for (const [frameName, animalName, aspectRatio, imageScale = 1, imageOffsetY = 0] of cases) {
    const frameXml = readAsset(frameName);
    const animalXml = readAsset(animalName);
    const xml = composeMarketCardSvg({ frameXml, animalXml, smallFrame: frameName === 'Frame_small.svg',
      imageHeight: 399 / aspectRatio, imageScale, imageOffsetY });
    assert.equal((xml.match(/<svg\b/g) || []).length, 1, `${frameName}: no independent/nested SVG views`);
    assert.equal((xml.match(/<path\b/g) || []).length,
      (frameXml.match(/<path\b/g) || []).length + (animalXml.match(/<path\b/g) || []).length);
    const ast = parse(xml);
    assert.equal(ast.tag, 'svg');
    assert.equal(walk({ props: { children: ast.children } }).filter((node) => node.type === 'svg').length, 0);
    const ids = [...xml.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(new Set(ids).size, ids.length, 'unique definitions');
    for (const [, reference] of xml.matchAll(/url\(#([^)]+)\)/g)) assert.ok(ids.includes(reference));
    assert.ok(xml.includes(frameName === 'Frame_small.svg' ? 'translate(20 20)' : 'translate(0 0)'));
    assert.equal(xml.includes('<g clip-path="url(#card_image_bounds)">'), imageScale <= 1);
  }
});

test('shared filter IDs are namespaced and invalid artwork cannot produce an empty frame', () => {
  const source = '<svg viewBox="0 0 10 10"><defs><filter id="glow"/></defs><path filter="url(#glow)" d="M0 0L10 10"/><use href="#glow"/></svg>';
  const xml = composeMarketCardSvg({ frameXml: source, animalXml: source, imageHeight: 399 });
  assert.ok(xml.includes('url(#card_frame_glow)'));
  assert.ok(xml.includes('url(#card_animal_glow)'));
  assert.ok(xml.includes('href="#card_animal_glow"'));
  assert.throws(() => composeMarketCardSvg({ frameXml: source, animalXml: null, imageHeight: 399 }));
  assert.throws(() => composeMarketCardSvg({ frameXml: source, animalXml: '<svg viewBox="0 0 0 0"></svg>', imageHeight: 399 }));
});

function hookHarness() {
  const slots = [];
  let cursor = 0;
  let pending = [];
  let stateUpdates = 0;
  const same = (a, b) => a?.length === b?.length && a?.every((value, index) => Object.is(value, b[index]));
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: initial };
      return [slots[index].value, (next) => {
        stateUpdates++;
        slots[index].value = typeof next === 'function' ? next(slots[index].value) : next;
      }];
    },
    useRef(value) { return slots[cursor++] ||= { current: value }; },
    useMemo(callback, deps) {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) slots[index] = { deps, value: callback() };
      return slots[index].value;
    },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect(callback, deps) {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) {
        const previous = slots[index];
        slots[index] = { deps };
        pending.push(() => { previous?.cleanup?.(); slots[index].cleanup = callback(); });
      }
    },
  };
  return { react, render(callback, ...args) {
    cursor = 0; pending = [];
    const result = callback(...args);
    pending.forEach((effect) => effect());
    return result;
  }, unmount() { slots.forEach((slot) => slot.cleanup?.()); }, updates: () => stateUpdates };
}

function loaderHarness() {
  const hooks = hookHarness();
  const requests = [];
  const useArtwork = loadModule('src/hooks/useMarketCardArtwork.js', {
    react: hooks.react,
    'react-native-svg/css': { loadLocalRawResource: (asset) => new Promise((resolve, reject) => {
      requests.push({ asset, resolve, reject });
    }) },
  }).default;
  return { ...hooks, requests, render: (...args) => hooks.render(useArtwork, ...args) };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

for (const first of [0, 1]) {
  test(`${first === 0 ? 'frame' : 'animal'} loads first: nothing is mounted until both files are ready`, async () => {
    const loader = loaderHarness();
    assert.equal(loader.render('frame', 'bull').artwork, null);
    loader.requests[first].resolve(first === 0 ? 'frameXml' : 'animalXml');
    await flush();
    assert.equal(loader.render('frame', 'bull').artwork, null);
    loader.requests[1 - first].resolve(first === 0 ? 'animalXml' : 'frameXml');
    await flush();
    const { artwork } = loader.render('frame', 'bull');
    assert.equal(artwork.frameXml, 'frameXml');
    assert.equal(artwork.animalXml, 'animalXml');
  });
}

test('changing regime ignores late responses from the old frame/animal pair', async () => {
  const loader = loaderHarness();
  loader.render('small', 'bull');
  loader.requests[0].resolve('oldFrame');
  await flush();
  assert.equal(loader.render('large', 'bear').artwork, null);
  loader.requests[1].resolve('oldBull');
  loader.requests[2].resolve('newFrame');
  await flush();
  assert.equal(loader.render('large', 'bear').artwork, null);
  loader.requests[3].resolve('newBear');
  await flush();
  assert.equal(loader.render('large', 'bear').artwork.animalXml, 'newBear');
  assert.equal(loader.render('normal', 'bear').artwork, null, 'changing only the frame hides the old pair too');
  const before = loader.updates();
  loader.unmount();
  loader.requests[4].resolve('normalFrame');
  loader.requests[5].resolve('newBear');
  await flush();
  assert.equal(loader.updates(), before, 'unmounted component is not updated');
});

test('load errors are visible and retry clears the previous error immediately', async () => {
  const loader = loaderHarness();
  loader.render('frame', 'bull');
  loader.requests[0].reject(new Error('load failure'));
  loader.requests[1].resolve('animalXml');
  await flush();
  const failed = loader.render('frame', 'bull');
  assert.equal(failed.artwork, null);
  assert.equal(failed.error.message, 'load failure');
  failed.retry();
  const retrying = loader.render('frame', 'bull');
  assert.equal(retrying.artwork, null);
  assert.equal(retrying.error, undefined);
  loader.requests[2].resolve('frameXml');
  loader.requests[3].resolve('animalXml');
  await flush();
  assert.ok(loader.render('frame', 'bull').artwork);
});

test('Home mounts one complete SVG, keeps footer readable and probabilities outside its animation', () => {
  const hooks = hookHarness();
  let artwork = null;
  const animated = [];
  const Home = loadModule('src/app/Home.js', {
    ...jsxMocks, react: hooks.react,
    'react-native': {
      View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView',
      StyleSheet: { create: (value) => value, absoluteFillObject: {} },
      Easing: { cubic: 'cubic', inOut: (value) => value },
      Animated: { View: 'AnimatedView', Value: class { setValue() {} interpolate(value) { return value; } },
        timing: (_, config) => { animated.push(config); return { start() {}, stop() {} }; } },
    },
    '@react-navigation/native': { useFocusEffect: (callback) => hooks.react.useEffect(callback, [callback]) },
    'react-native-safe-area-context': {}, '../components/AssetSvg': 'AssetSvg',
    '../components/InAppAlertBanner': {}, '../components/TabBar': {}, 'react-native-svg': {},
    'react-native-svg/css': { SvgCss: 'SvgCss' }, '../components/StockCharts': {},
    '../services/investmentApi': {}, '../context/AppSettingsContext': {}, '../hooks/useViewportDimensions': {},
    '../hooks/useMarketCardArtwork': () => ({ artwork }), '../utils/marketCardSvg': { composeMarketCardSvg },
  }, '\nexport { AnimatedMarketCard, ProbabilityBars, MARKET_FRAMES };');
  const props = { asset: 'bull', frame: Home.MARKET_FRAMES.small, width: 300, imageHeight: 300 * 469 / 475,
    imageScale: 1.2, imageOffsetY: -5, elapsedValue: '1', elapsedUnit: '天',
    remainingValue: '少於1', remainingUnit: '週', durationColor: '#F0B2B7' };
  let tree = hooks.render(Home.AnimatedMarketCard, props);
  assert.equal(walk(tree).filter((node) => node.type === 'SvgCss' || node.type === 'AssetSvg').length, 0);
  assert.equal(walk(tree).filter((node) => node.type === 'AnimatedView').length, 0);
  const pendingText = walk(tree).find((node) => node.type === 'Text');
  assert.equal(pendingText.props.children, '正在計算模型一、二，完成後會自動更新…');
  artwork = { frameXml: readAsset('Frame_small.svg'), animalXml: readAsset('Bull.svg') };
  for (const viewport of [320, 375, 393, 430, 768]) {
    const width = 399 * Math.min(viewport * 0.78, 460) / 460;
    tree = hooks.render(Home.AnimatedMarketCard, { ...props, width, imageHeight: width * 469 / 475 });
    const nodes = walk(tree);
    assert.equal(nodes.filter((node) => node.type === 'SvgCss').length, 1);
    assert.equal(nodes.filter((node) => node.type === 'AssetSvg').length, 0);
    const svg = nodes.find((node) => node.type === 'SvgCss');
    assert.ok(svg.props.xml.includes('card_animal_'));
    const texts = nodes.filter((node) => node.type === 'Text');
    assert.equal(texts.length, 7);
    texts.forEach((text) => assert.ok(flatStyle(text.props.style).lineHeight * 1.1 < 69 * width / 399));
    nodes.find((node) => node.type === 'AnimatedView').props.onLayout();
  }
  assert.equal(animated[0].useNativeDriver, true);
  assert.equal(flatStyle(tree.props.style).overflow, 'hidden');
  const source = readFileSync(path.join(root, 'src/app/Home.js'), 'utf8');
  assert.match(source, /<\/View>\s*<ProbabilityBars/);
  const probabilityPanel = Home.ProbabilityBars({ probabilities: [] });
  assert.equal(flatStyle(probabilityPanel.props.style).isolation, 'isolate');
});

test('Home scroll viewport extends behind tabs; only trailing content reserves navigation space', () => {
  const source = readFileSync(path.join(root, 'src/app/Home.js'), 'utf8');
  assert.match(source, /<ScrollView\s+style=\{styles\.screenScroll\}/);
  assert.doesNotMatch(source, /marginBottom:\s*getTabBarClearance/);
  assert.match(source, /paddingBottom:\s*getTabBarClearance\(insets\.bottom\)\s*\+\s*24/);
  assert.doesNotMatch(source, /載入市場卡牌中/);
  assert.match(source, /const modelStatusMessage = investmentRunPending\s*\? MODEL_PENDING_MESSAGE/);
});
