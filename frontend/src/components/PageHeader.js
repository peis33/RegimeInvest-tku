import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useViewportDimensions from '../hooks/useViewportDimensions';
import AssetSvg from './AssetSvg';

// Match Analyze's fixed category header, including safe-area and add-control height.
export default function PageHeader({ title, onBack, backgroundColor = '#596877' }) {
  const { width } = useViewportDimensions();
  const insets = useSafeAreaInsets();
  const controlHeight = Math.max(48, Math.min(74, Math.max(48, width * 0.13)) * 76 / 74);
  const fontSize = Math.max(28, Math.min(48, width * 0.08));
  return <View style={{ height: insets.top + 18 + controlHeight, flexShrink: 0, backgroundColor, zIndex: 2, elevation: 10 }}>
    <View pointerEvents="none" style={{ position: 'absolute', top: insets.top + 10, bottom: 8, left: 76, right: 76, alignItems: 'center', justifyContent: 'center' }}>
      <Text numberOfLines={1} style={{ fontSize, lineHeight: fontSize + 8, fontFamily: 'Goldman', fontWeight: '400', color: '#F1F1F1', textAlign: 'center' }}>{title}</Text>
    </View>
    {onBack && <Pressable accessibilityRole="button" accessibilityLabel="返回股票選擇" onPress={onBack}
      style={{ position: 'absolute', left: 16, top: insets.top + 10, width: 48, height: controlHeight, alignItems: 'center', justifyContent: 'center' }}>
      <AssetSvg asset={require('../assets/image/back.svg')} width={38} height={30} pointerEvents="none" />
    </Pressable>}
  </View>;
}
