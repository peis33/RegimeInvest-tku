import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Platform } from 'react-native';
import { LocalSvg, loadLocalRawResource, SvgCss } from 'react-native-svg/css';

// XML loading and native drawing are separate events. Native Svg forwards
// onLayout to its root Group, which reports bounds after drawing its children.
function LoadedNativeSvg({ asset, onLoad, onRender, onError, onLayout, ...props }) {
  const [loaded, setLoaded] = useState(null);
  const reportedRender = useRef(null);
  const callbacks = useRef({ asset, loaded, onLoad, onRender, onError, onLayout });
  callbacks.current = { asset, loaded, onLoad, onRender, onError, onLayout };

  useEffect(() => {
    let active = true;
    loadLocalRawResource(asset)
      .then((xml) => {
        if (typeof xml !== 'string') throw new Error('Unable to load SVG asset');
        if (active) setLoaded({ asset, xml });
      })
      .catch((error) => {
        if (!active) return;
        if (callbacks.current.onError) callbacks.current.onError(error);
        else console.warn('Unable to load SVG asset', error);
      });
    return () => { active = false; };
  }, [asset]);

  useEffect(() => {
    if (loaded?.asset === asset) callbacks.current.onLoad?.();
  }, [asset, loaded]);

  const handleRender = useCallback((event) => {
    const current = callbacks.current;
    if (loaded?.asset !== asset || current.asset !== asset || current.loaded !== loaded) return;
    current.onLayout?.(event);
    const layout = event?.nativeEvent?.layout;
    if (!layout || layout.width <= 0 || layout.height <= 0 || reportedRender.current === loaded) return;
    reportedRender.current = loaded;
    current.onRender?.(event);
  }, [asset, loaded]);

  return (
    <SvgCss
      xml={loaded?.asset === asset ? loaded.xml : null}
      onLayout={handleRender}
      onError={onError}
      {...props}
    />
  );
}

/**
 * Keep the original SVG asset on every platform, but let the browser load it
 * as an image instead of expanding a large SVG into a React component tree.
 */
export default function AssetSvg({ asset, width, height, style, onLoad, onRender, ...props }) {
  if (Platform.OS === 'web') {
    return (
      <Image
        source={asset}
        resizeMode="stretch"
        onLoad={(event) => {
          onLoad?.(event);
          onRender?.(event);
        }}
        {...props}
        style={[{ width, height }, style]}
      />
    );
  }

  if (onLoad || onRender) {
    return (
      <LoadedNativeSvg
        asset={asset}
        width={width}
        height={height}
        style={style}
        onLoad={onLoad}
        onRender={onRender}
        {...props}
      />
    );
  }

  return (
    <LocalSvg
      asset={asset}
      width={width}
      height={height}
      style={style}
      {...props}
    />
  );
}
