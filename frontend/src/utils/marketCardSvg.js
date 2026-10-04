function readSvg(xml, prefix) {
  if (typeof xml !== 'string') throw new Error('Missing market card SVG');
  const root = xml.match(/<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/);
  const viewBox = root?.[1].match(/\bviewBox=["']([^"']+)["']/)?.[1]
    .trim().split(/[\s,]+/).map(Number);
  if (!viewBox || viewBox.length !== 4 || !viewBox.every(Number.isFinite)
    || viewBox[2] <= 0 || viewBox[3] <= 0) {
    throw new Error('Invalid market card SVG viewBox');
  }
  // Definitions from both files now share a root. Keep their IDs separate.
  const body = root[2]
    .replace(/\bid=(["'])([^"']+)\1/g, (_, quote, id) => `id=${quote}${prefix}${id}${quote}`)
    .replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${prefix}${id})`)
    .replace(/\b((?:xlink:)?href)=(["'])#([^"']+)\2/g,
      (_, name, quote, id) => `${name}=${quote}#${prefix}${id}${quote}`);
  return { body, viewBox };
}

function placeSvg({ body, viewBox }, x, y, width, height) {
  const [minX, minY, sourceWidth, sourceHeight] = viewBox;
  return `<g fill="none" transform="translate(${x} ${y}) scale(${width / sourceWidth} ${height / sourceHeight}) translate(${-minX} ${-minY})">${body}</g>`;
}

/** One root, not nested SVG views: the frame and animal share one native draw. */
export function composeMarketCardSvg({
  frameXml, animalXml, smallFrame = false, imageHeight, imageScale = 1, imageOffsetY = 0,
}) {
  if (![imageHeight, imageScale, imageOffsetY].every(Number.isFinite)
    || imageHeight <= 0 || imageScale <= 0) {
    throw new Error('Invalid market card artwork dimensions');
  }
  const frame = readSvg(frameXml, 'card_frame_');
  const animal = readSvg(animalXml, 'card_animal_');
  const animalWidth = 399 * imageScale;
  const animalHeight = imageHeight * imageScale;
  const enlarged = imageScale > 1;
  const top = (enlarged ? (419 - animalHeight) / 2 : Math.max(0, (419 - animalHeight) / 2))
    + imageOffsetY;
  const inset = smallFrame ? 20 : 0;
  const frameMarkup = placeSvg(frame, inset, inset, smallFrame ? 450 : 490, smallFrame ? 540 : 580);
  const animalMarkup = placeSvg(animal, 44.2856 + (399 - animalWidth) / 2,
    50.4559 + top, animalWidth, animalHeight);
  // Preserve the existing large bull's overflow; bear/snake stay in the image box.
  const clippedAnimal = enlarged ? animalMarkup
    : `<g clip-path="url(#card_image_bounds)">${animalMarkup}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="490" height="580" viewBox="0 0 490 580" fill="none"><defs><clipPath id="card_image_bounds"><rect x="44.2856" y="50.4559" width="399" height="419"/></clipPath></defs>${frameMarkup}${clippedAnimal}</svg>`;
}
