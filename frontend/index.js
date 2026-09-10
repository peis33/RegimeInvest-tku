import { registerRootComponent } from 'expo';

import App from './App';

if (typeof document !== 'undefined') {
  const VIEWPORT_STYLE_ID = 'stock-app-viewport-style';

  const ensureViewportStyles = () => {
    if (document.getElementById(VIEWPORT_STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = VIEWPORT_STYLE_ID;
    style.textContent = `
      html, body, #root {
        box-sizing: border-box;
        width: 100vw;
        min-width: 0;
        max-width: 100vw;
        height: 100%;
        min-height: 100%;
        margin: 0;
        padding: 0;
      }

      html, body {
        overflow: hidden;
        overscroll-behavior: none;
      }

      #root * {
        scrollbar-width: none;
      }

      #root *::-webkit-scrollbar {
        width: 0;
        height: 0;
      }

      #root {
        position: relative;
        left: 0;
        right: 0;
      }
    `;
    document.head.appendChild(style);
  };

  const lockAppViewport = () => {
    ensureViewportStyles();

    const viewportElements = [
      document.documentElement,
      document.body,
      document.getElementById('root'),
    ].filter(Boolean);

    viewportElements.forEach((element) => {
      element.style.boxSizing = 'border-box';
      element.style.overflowX = 'hidden';
      element.style.overflowY = 'hidden';
      element.style.overscrollBehaviorX = 'none';
      element.style.overscrollBehaviorY = 'none';
      element.style.margin = '0';
      element.style.padding = '0';
      element.style.width = '100vw';
      element.style.minWidth = '0';
      element.style.maxWidth = '100vw';
      element.style.height = '100%';
      element.style.minHeight = '100%';
    });
  };

  lockAppViewport();
  if (!document.getElementById('root')) {
    const rootObserver = new MutationObserver(() => {
      if (document.getElementById('root')) {
        lockAppViewport();
        rootObserver.disconnect();
      }
    });
    rootObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(lockAppViewport);
  }
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
