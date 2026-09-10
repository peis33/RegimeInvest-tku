import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  Canvas,
  Circle,
  SweepGradient,
  vec,
} from '@shopify/react-native-skia';
import { BORDER_WIDTH, clamp, getGradient } from './PercentCircleGradient';

export default function PercentCircle({
  redPercent,
  size = 280,
  strokeWidth = 60,
  label = '耐久度:',
  valueText = null,
  fontScale = 0.24,
  labelFontScale = 0.045,
  minLabelFontSize = 12,
  children,
}) {
  const value = clamp(Number(redPercent) || 0, 0, 100);
  const center = size / 2;
  const radius = (size - strokeWidth - BORDER_WIDTH) / 2;
  const centerPoint = vec(center, center);
  const gradient = getGradient(value);
  const percentFontSize = Math.round(size * fontScale);
  const percentLineHeight = Math.round(percentFontSize * 1.08);
  const labelFontSize = Math.max(
    minLabelFontSize,
    Math.round(size * labelFontScale),
  );

  return (
    <View style={styles.container} accessibilityRole="image">
      <Canvas style={{ width: size, height: size }}>
        <Circle
          c={centerPoint}
          r={radius}
          color="#1B1D1B"
          style="stroke"
          strokeWidth={strokeWidth + BORDER_WIDTH}
        />

        <Circle
          c={centerPoint}
          r={radius}
          style="stroke"
          strokeWidth={strokeWidth}
        >
          <SweepGradient
            c={centerPoint}
            colors={gradient.colors}
            positions={gradient.positions}
            start={-90}
            end={270}
          />
        </Circle>
      </Canvas>

      {children}

      <View
        style={[styles.textContainer, { width: size, height: size }]}
      >
        <View style={styles.textGroup}>
          <Text
            style={[
              styles.percentText,
              { fontSize: percentFontSize, lineHeight: percentLineHeight },
            ]}
          >
            {valueText ?? `${Math.round(value)}%`}
          </Text>
          <Text
            style={[
              styles.labelText,
              {
                fontSize: labelFontSize,
                lineHeight: labelFontSize + 3,
                left: Math.round(percentFontSize * 0.18),
                top: -labelFontSize - 4,
              },
            ]}
          >
            {label}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    zIndex: 3,
  },
  textGroup: {
    position: 'relative',
    alignItems: 'center',
  },
  labelText: {
    position: 'absolute',
    fontFamily: 'Goldman',
    color: '#F5F5F5',
  },
  percentText: {
    color: '#FFFFFF',
    fontFamily: 'Goldman',
    fontWeight: '400',
    letterSpacing: 0,
    includeFontPadding: false,
  },
});
