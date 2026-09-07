import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BORDER_WIDTH, clamp, getGradient } from './PercentCircleGradient';

function toConicGradient(redPercent) {
  const gradient = getGradient(redPercent);
  const stops = gradient.colors
    .map(
      (color, index) =>
        `${color} ${(gradient.positions[index] * 360).toFixed(2)}deg`
    )
    .join(', ');

  // CSS 0deg starts at 12 o'clock. Keep Web aligned with Skia's -90deg.
  return `conic-gradient(from 0deg, ${stops})`;
}

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
  const holeSize = size - strokeWidth * 2 - BORDER_WIDTH;
  const percentFontSize = Math.round(size * fontScale);
  const percentLineHeight = Math.round(percentFontSize * 1.08);
  const labelFontSize = Math.max(
    minLabelFontSize,
    Math.round(size * labelFontScale),
  );

  return (
    <View style={styles.container} accessibilityRole="image">
      <View
        style={[
          styles.webRing,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundImage: toConicGradient(value),
          },
        ]}
      >
        <View
          style={[
            styles.webHole,
            {
              width: holeSize,
              height: holeSize,
              borderRadius: holeSize / 2,
            },
          ]}
        />
      </View>

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
  webRing: {
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: '#1B1D1B',
    borderWidth: BORDER_WIDTH,
    overflow: 'hidden',
  },
  webHole: {
    backgroundColor: '#2E2F2E',
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
  },
});
