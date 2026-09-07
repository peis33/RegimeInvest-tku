import React from 'react';
import { Image, Platform } from 'react-native';
import { LocalSvg } from 'react-native-svg/css';

/**
 * Keep the original SVG asset on every platform, but let the browser load it
 * as an image instead of expanding a large SVG into a React component tree.
 */
export default function AssetSvg({ asset, width, height, style, ...props }) {
  if (Platform.OS === 'web') {
    return (
      <Image
        source={asset}
        resizeMode="stretch"
        {...props}
        style={[{ width, height }, style]}
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
