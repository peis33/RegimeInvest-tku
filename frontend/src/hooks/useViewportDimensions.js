import { createContext, useContext, useEffect, useState } from 'react';
import { Platform, View, useWindowDimensions } from 'react-native';

const ViewportLayoutContext = createContext(null);

function readWebViewport() {
  if (typeof window === 'undefined') return null;

  const width = Number(window.innerWidth);
  const height = Number(window.innerHeight);

  return {
    width: Number.isFinite(width) && width > 0 ? width : null,
    height: Number.isFinite(height) && height > 0 ? height : null,
  };
}

/**
 * Returns the actual app viewport instead of document.clientWidth on Web.
 * clientWidth excludes a vertical scrollbar, which makes every centered
 * screen appear shifted left while the root canvas still spans the viewport.
 */
export default function useViewportDimensions() {
  const dimensions = useWindowDimensions();
  const measuredLayout = useContext(ViewportLayoutContext);
  const [webViewport, setWebViewport] = useState(readWebViewport);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;

    const updateViewport = () => {
      setWebViewport(readWebViewport());
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);

    return () => {
      window.removeEventListener('resize', updateViewport);
    };
  }, []);

  const measuredDimensions = measuredLayout || dimensions;

  if (Platform.OS === 'web' && webViewport) {
    return {
      ...measuredDimensions,
      width: webViewport.width || measuredDimensions.width,
      height: webViewport.height || measuredDimensions.height,
    };
  }

  return measuredDimensions;
}

export function ViewportProvider({ children, style }) {
  const [layout, setLayout] = useState(null);

  const handleLayout = (event) => {
    const { width, height } = event.nativeEvent.layout;
    if (!width || !height) return;

    setLayout((current) => {
      if (current && current.width === width && current.height === height) {
        return current;
      }

      return { width, height };
    });
  };

  return (
    <ViewportLayoutContext.Provider value={layout}>
      <View style={style} onLayout={handleLayout}>
        {children}
      </View>
    </ViewportLayoutContext.Provider>
  );
}
