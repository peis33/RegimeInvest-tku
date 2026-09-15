import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import AssetSvg from './AssetSvg';

const LOGO = require('../assets/image/loading.svg');

export default function LaunchScreen() {
  const { width, height } = useWindowDimensions();
  const logoWidth = Math.min(width * 0.67, height * 0.60 * 385 / 746);
  const gridSize = Math.min(64, Math.max(36, width * 0.105));

  return (
    <View style={styles.screen} accessibilityLabel="股估估啟動畫面" accessibilityViewIsModal>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {Array.from({ length: Math.ceil(width / gridSize) }, (_, i) => (
          <View key={`v${i}`} style={[styles.vertical, { left: gridSize * (i + 0.6) }]} />
        ))}
        {Array.from({ length: Math.ceil(height / gridSize) }, (_, i) => (
          <View key={`h${i}`} style={[styles.horizontal, { top: gridSize * (i + 0.6) }]} />
        ))}
      </View>
      <View style={{ alignItems: 'center', transform: [{ translateY: -height * 0.05 }] }}>
        <AssetSvg asset={LOGO} width={logoWidth} height={logoWidth * 746 / 385} />
        <Text style={[styles.name, { fontSize: Math.min(48, width * 0.10), marginTop: height * 0.025 }]}>
          股估估
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#333533',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    elevation: 1000,
  },
  vertical: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: 'rgba(217,217,217,0.055)' },
  horizontal: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: 'rgba(217,217,217,0.055)' },
  name: { color: '#FFFFFF', fontWeight: '600', textShadowColor: '#607285', textShadowOffset: { width: 3, height: 3 }, textShadowRadius: 1 },
});
