import React from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LocalSvg } from 'react-native-svg/css';

export const TAB_BAR_STYLE = {
  backgroundColor: 'transparent',
  borderTopWidth: 0,
  elevation: 0,
  shadowOpacity: 0,
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
};

const BAR_HEIGHT = 62;
const BAR_WIDTH_RATIO = 0.86;
// Keep the capsule proportional on phone-sized screens without letting it
// become excessively wide in the desktop web preview.
const MAX_BAR_WIDTH = 420;
const PILL_INSET = 1;
const ICON_SIZE = 32;

export default function TabBar({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const focusedOptions = descriptors[state.routes[state.index].key].options;
  const tabBarStyle = focusedOptions.tabBarStyle;

  if (tabBarStyle && tabBarStyle.display === 'none') {
    return null;
  }

  // Leave a little extra breathing room below the capsule so the whole
  // navigation stays slightly above the bottom edge on every platform.
  const bottomInset = Math.max(insets.bottom, 18) + 8;
  const barWidth = Math.min(width * BAR_WIDTH_RATIO, MAX_BAR_WIDTH);
  const tabWidth = barWidth / state.routes.length;
  // Keep the selected pill aligned with the actual active tab. Setting is
  // the first tab, so it should remain selected when the Setting screen is
  // open instead of falling back to Home.
  const focusedIndex = state.index;
  const pillWidth = tabWidth;
  const pillHeight = BAR_HEIGHT - PILL_INSET * 2;
  const pillLeft = focusedIndex * tabWidth;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { paddingBottom: bottomInset }]}
    >
      <View style={[styles.bar, { width: barWidth, height: BAR_HEIGHT }]}>
        <View
          pointerEvents="none"
          style={[
            styles.selectedPill,
            {
              width: pillWidth,
              height: pillHeight,
              left: pillLeft,
              top: PILL_INSET,
            },
          ]}
        />

        <View style={styles.row}>
          {state.routes.map((route, index) => {
            const { options } = descriptors[route.key];
            const focused = state.index === index;
            const visuallyFocused = focusedIndex === index;
            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });

              if (!focused && !event.defaultPrevented) {
                navigation.navigate(
                  route.name,
                  route.name === 'Analyze'
                    ? { categoryId: null, investorType: null, customGroup: false }
                    : undefined,
                );
              } else if (focused && route.name === 'Analyze') {
                navigation.setParams({
                  categoryId: null,
                  investorType: null,
                  customGroup: false,
                });
              }
            };

            return (
              <Pressable
                key={route.key}
                accessibilityRole="button"
                accessibilityState={visuallyFocused ? { selected: true } : {}}
                accessibilityLabel={options.tabBarAccessibilityLabel || route.name}
                onPress={onPress}
                style={styles.tab}
              >
                {options.tabBarIconAsset ? (
                  <LocalSvg
                    asset={options.tabBarIconAsset}
                    width={ICON_SIZE}
                    height={ICON_SIZE}
                    pointerEvents="none"
                  />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    backgroundColor: 'transparent',
    zIndex: 100,
    elevation: 100,
  },
  bar: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    opacity: 1,
    backgroundColor: 'rgba(217, 217, 217, 0.5)',
    borderRadius: 50,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    overflow: 'hidden',
    boxShadow: 'inset 4px 4px 4px rgba(22, 22, 22, 0.5)',
  },
  selectedPill: {
    position: 'absolute',
    opacity: 1,
    backgroundColor: 'rgba(211, 231, 251, 0.4)',
    borderRadius: 50,
    borderWidth: 0,
    borderColor: 'transparent',
    backdropFilter: 'blur(4px)',
    boxShadow:
      'inset 2px 2px 4px rgba(255, 255, 255, 0.3), inset -2px -2px 4px rgba(22, 22, 22, 0.18)',
  },
  row: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
