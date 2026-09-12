import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCustomGroupDisplayName } from '../utils/customGroups';
import useViewportDimensions from '../hooks/useViewportDimensions';

const PRESSED_FEEDBACK_MS = 120;

const GROUP_ITEMS = [
  {
    id: 'semiconductor',
    label: '半導體產業',
    fill: 'rgba(217, 217, 217, 0.3)',
    pushedFill: '#727F99',
    strokeColor: 'rgba(217, 217, 217, 1)',
    textOpacity: 1,
  },
  {
    id: 'ElectronicComponents',
    label: '電子零件產業',
    fill: '#A0A8C0',
    pushedFill: '#727F99',
    strokeColor: 'rgba(217, 217, 217, 1)',
    textOpacity: 1,
  },
  {
    id: 'FinancialHolding',
    label: '金控產業',
    fill: '#A0A8C0',
    pushedFill: '#727F99',
    strokeColor: 'rgba(217, 217, 217, 1)',
    textOpacity: 1,
  },
];

const CUSTOM_GROUP_ITEM = {
  id: 'group',
  label: '客製群組+',
  fill: 'rgba(217, 217, 217, 0.2)',
  pushedFill: '#727F99',
  strokeColor: 'rgba(217, 217, 217, 0.6)',
  textOpacity: 0.6,
};

const INVESTOR_ITEMS = [
  {
    id: '大戶',
    label: '大戶',
    fill: '#A0A8C0',
    pushedFill: '#727F99',
    strokeColor: 'rgba(217, 217, 217, 1)',
    textOpacity: 1,
  },
  {
    id: '中間戶',
    label: '中間戶',
    fill: '#A0A8C0',
    pushedFill: '#727F99',
    strokeColor: 'rgba(217, 217, 217, 1)',
    textOpacity: 1,
  },
  {
    id: '小股民',
    label: '小股民',
    fill: '#A0A8C0',
    pushedFill: '#727F99',
    strokeColor: 'rgba(217, 217, 217, 1)',
    textOpacity: 1,
  },
];

const ALL_ITEM = {
  id: 'all',
  label: 'ALL',
  fill: '#A0A8C0',
  pushedFill: '#727F99',
  strokeColor: 'rgba(217, 217, 217, 1)',
  textOpacity: 1,
};

const INVESTOR_AND_GROUP_ITEMS = [
  ...INVESTOR_ITEMS,
  ...GROUP_ITEMS.map((item) => ({
    ...item,
    fill: '#A0A8C0',
    pushedFill: '#727F99',
  })),
  ALL_ITEM,
];

function ProgrammaticMenuButton({
  item,
  active,
  width,
  height,
  onPressIn,
  onPressOut,
  onPress,
  innerWidthOverride,
  innerHeightOverride,
}) {
  const innerWidth = innerWidthOverride || width * (174 / 198);
  const innerHeight = innerHeightOverride || height * (40 / 48);
  const verticalInset = (height - innerHeight) / 2;
  const fontSize = Math.max(13, height * 0.35);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.label}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onPress={onPress}
      style={{ width, height }}
    >
      <View
        pointerEvents="none"
        style={[
          styles.menuButton,
          {
            width: innerWidth,
            height: innerHeight,
            marginTop: verticalInset,
            borderRadius: Math.max(10, innerHeight * (15 / 40)),
            borderWidth: Math.max(1, width / 198),
            backgroundColor: active ? item.pushedFill : item.fill,
            borderColor: active
              ? 'rgba(217, 217, 217, 1)'
              : item.strokeColor,
            boxShadow: active
              ? 'inset 2px 2px 4px rgba(93, 106, 140, 1)'
              : '2px 2px 4px rgba(93, 106, 140, 1)',
          },
        ]}
      >
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.72}
          style={[
            styles.menuButtonText,
            {
              fontSize,
              lineHeight: fontSize * 1.2,
              opacity: item.textOpacity,
            },
          ]}
        >
          {item.label}
        </Text>
      </View>
    </Pressable>
  );
}

function DynamicGroupPanelBackground({ width, height }) {
  // Keep the original right-pane silhouette, but construct its path with the
  // runtime height. The pointer and corner radii stay tied to the width while
  // the lower body can grow for every additional custom-group row.
  const scale = width / 224;
  const leftRadius = 15 * scale;
  const bottomStart = height - leftRadius;
  const bodyTop = 36.0771 * scale;
  const bodyTopRight = bodyTop + leftRadius;
  const rightX = width - 1.368 * scale;
  const bottomRight = width - 16.368 * scale;
  const pointerBase = width - 18.037 * scale;
  const upperRight = width - 0.718 * scale;
  const topRightY = 49.7314 * scale;
  const curve = 6.71573 * scale;

  const path = [
    `M ${upperRight} ${topRightY}`,
    `C ${upperRight + 0.04 * scale} ${50.1748 * scale} ${rightX} ${50.6235 * scale} ${rightX} ${bodyTopRight}`,
    `V ${bottomStart}`,
    `C ${rightX} ${height - curve} ${width - 8.084 * scale} ${height} ${bottomRight} ${height}`,
    `H ${leftRadius}`,
    `C ${curve} ${height} 0 ${height - curve} 0 ${bottomStart}`,
    `V ${bodyTopRight}`,
    `C 0 ${bodyTop + curve} ${curve} ${bodyTop} ${leftRadius} ${bodyTop}`,
    `H ${pointerBase}`,
    `L ${width} 0`,
    `L ${upperRight} ${topRightY}`,
    'Z',
  ].join(' ');

  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      pointerEvents="none"
      style={styles.panelBackground}
    >
      <Path d={path} fill="#8793B5" />
    </Svg>
  );
}

function DynamicInvestorPanelBackground({ width, height }) {
  // Keep the original left-pane pointer, but let the lower body use the
  // runtime height required by the six-row menu.
  const scale = width / 223;
  const radius = 15 * scale;
  const bodyTop = 20.3867 * scale;
  const bodyTopRight = bodyTop + radius;
  const rightX = width - 0.368 * scale;
  const bottomStart = height - radius;
  const bottomRight = width - 15.368 * scale;
  const curve = 6.71573 * scale;
  const path = [
    `M ${9.91504 * scale} ${21.2705 * scale}`,
    `C ${11.5029 * scale} ${20.6984 * scale} ${13.215 * scale} ${bodyTop} ${15 * scale} ${bodyTop}`,
    `H ${207.632 * scale}`,
    `C ${215.916 * scale} ${bodyTop} ${rightX} ${bodyTopRight} ${rightX} ${bodyTopRight}`,
    `V ${bottomStart}`,
    `C ${rightX} ${height - curve} ${width - 8.084 * scale} ${height} ${bottomRight} ${height}`,
    `H ${15 * scale}`,
    `C ${6.71573 * scale} ${height} 0 ${height - curve} 0 ${bottomStart}`,
    `V ${bodyTopRight}`,
    `C 0 ${bodyTop + 14.418 * scale} ${0.033315 * scale} ${bodyTop + 13.845 * scale} ${0.0976562 * scale} ${bodyTop + 13.2813 * scale}`,
    'L 0 0',
    `L ${9.91504 * scale} ${21.2705 * scale}`,
    'Z',
  ].join(' ');

  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      pointerEvents="none"
      style={styles.panelBackground}
    >
      <Path d={path} fill="#8793B5" />
    </Svg>
  );
}

export default function AddGroupMenu({
  visible,
  onClose,
  onSelect,
  selectedId = null,
  anchor = null,
  variant = 'group',
  customGroups = [],
  includeCategories = false,
}) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useViewportDimensions();
  const [pressedId, setPressedId] = useState(null);
  const releaseTimerRef = useRef(null);
  const selectTimerRef = useRef(null);

  const activeId = pressedId || selectedId;

  const clearTimers = () => {
    if (releaseTimerRef.current) {
      clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
    }
    if (selectTimerRef.current) {
      clearTimeout(selectTimerRef.current);
      selectTimerRef.current = null;
    }
  };

  useEffect(() => {
    if (!visible) {
      clearTimers();
      setPressedId(null);
    }
  }, [visible]);

  useEffect(() => () => clearTimers(), []);

  if (!visible) {
    return null;
  }

  const isInvestorMenu = variant === 'investor';
  const customGroupItems = customGroups.map((group) => ({
    id: `custom:${group.id}`,
    label: getCustomGroupDisplayName(group, customGroups),
    fill: '#A0A8C0',
    pushedFill: '#727F99',
    strokeColor: 'rgba(217, 217, 217, 1)',
    textOpacity: 1,
  }));
  const items = isInvestorMenu
    ? includeCategories
      ? [
          ...INVESTOR_AND_GROUP_ITEMS.slice(0, -1),
          ...customGroupItems,
          ALL_ITEM,
        ]
      : INVESTOR_ITEMS
    : [...GROUP_ITEMS, ...customGroupItems, CUSTOM_GROUP_ITEM];
  const paneScale = isInvestorMenu ? 1 : 1;
  const panelWidth = Math.min(
    isInvestorMenu ? 168 * paneScale : 188,
    screenWidth * 0.63,
  );
  const basePanelHeight = isInvestorMenu
    ? panelWidth * (256 / 223)
    : panelWidth * (284 / 223);
  const buttonSizingPanelWidth = Math.min(188, screenWidth * 0.63);
  // The investor pane follows the reference ratio while the add pane keeps
  // its original button sizing.
  const slotWidth = isInvestorMenu
    ? panelWidth * (193 / 223)
    : buttonSizingPanelWidth * (188 / 223);
  const slotHeight = isInvestorMenu
    ? panelWidth * (48 / 223)
    : slotWidth * (48 / 198);
  // Keep the original row pitch stable while adding custom groups. This
  // makes the panel grow by exactly one row (button + gap) per extra item.
  const buttonGap = isInvestorMenu
    ? Math.max(8, panelWidth * (10 / 223))
    : Math.max(6, basePanelHeight * 0.028);
  const baseItemCount = isInvestorMenu ? 3 : 4;
  const groupExtraHeight = Math.max(0, items.length - baseItemCount) * (slotHeight + buttonGap);
  const panelHeight = isInvestorMenu
    ? basePanelHeight + (includeCategories ? groupExtraHeight : 0)
    : basePanelHeight + groupExtraHeight;
  const panelGap = 0;
  const verticalPad = Math.max(
    12,
    (panelHeight - slotHeight * items.length - buttonGap * (items.length - 1)) / 2,
  );
  // Both pane assets reserve their upper-left area for a pointer. Shift the
  // button group into the rectangular body instead of centering it in the
  // whole SVG bounding box.
  const triangleHeight = panelWidth * (isInvestorMenu ? 20 / 223 : 36 / 224);
  const verticalOffset = includeCategories
    ? 0
    : Math.min(
        triangleHeight * 0.65,
        // Keep a little breathing room below the last row. The SVG is
        // stretched with the calculated panel height, so this padding remains
        // visible as the number of custom-group rows changes.
        Math.max(0, verticalPad - 16),
      );
  const paddingTop = verticalPad + verticalOffset;
  const paddingBottom = Math.max(12, verticalPad - verticalOffset);
  const panelRight = anchor
    ? Math.max(
        8,
        screenWidth - anchor.x,
      )
    : Math.max(12, screenWidth * 0.04);
  const panelLeft = anchor
    ? Math.max(
        8,
        Math.min(
          screenWidth - panelWidth - 8,
          anchor.x,
        ),
      )
    : Math.max(12, screenWidth * 0.04);
  const panelTop = anchor
    ? Math.max(0, anchor.y + anchor.height + panelGap)
    : Math.max(12, screenWidth * 0.08);
  const bottomNavigationHeight = Math.max(insets.bottom, 18) + 8 + 62;
  const bottomNavigationGap = 8;
  const availablePanelHeight = Math.max(
    slotHeight + verticalPad * 2,
    screenHeight - panelTop - bottomNavigationHeight - bottomNavigationGap,
  );
  const naturalPanelHeight = panelHeight;
  const visiblePanelHeight = Math.min(naturalPanelHeight, availablePanelHeight);
  const isScrollable = naturalPanelHeight > visiblePanelHeight + 0.5;

  return (
    <>
      <View style={styles.overlay} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isInvestorMenu ? '關閉更多選單' : '關閉新增選單'}
          onPress={onClose}
          style={styles.backdrop}
        />
        <View
          pointerEvents="box-none"
          style={[
            styles.panelWrap,
            {
              width: panelWidth,
              height: visiblePanelHeight,
              ...(isInvestorMenu ? { left: panelLeft } : { right: panelRight }),
              top: panelTop,
            },
          ]}
        >
          {isInvestorMenu ? (
            <DynamicInvestorPanelBackground
              width={panelWidth}
              height={visiblePanelHeight}
            />
          ) : (
            <DynamicGroupPanelBackground
              width={panelWidth}
              height={visiblePanelHeight}
            />
          )}
          <ScrollView
            accessibilityLabel={isScrollable ? '可捲動群組選單' : undefined}
            bounces={false}
            nestedScrollEnabled
            overScrollMode="never"
            scrollEnabled={isScrollable}
            showsVerticalScrollIndicator={false}
            style={styles.buttonScroll}
            contentContainerStyle={[
              styles.buttonColumnContent,
              {
                minHeight: naturalPanelHeight,
                paddingTop,
                paddingBottom,
                gap: buttonGap,
              },
            ]}
          >
            {items.map((item) => (
              <ProgrammaticMenuButton
                key={item.id}
                item={item}
                active={activeId === item.id}
                width={slotWidth}
                height={slotHeight}
                innerWidthOverride={isInvestorMenu ? slotWidth : undefined}
                innerHeightOverride={
                  isInvestorMenu ? panelWidth * (41 / 223) : undefined
                }
                onPressIn={() => {
                  clearTimers();
                  setPressedId(item.id);
                }}
                onPressOut={() => {
                  // Keep the pushed style visible briefly after release so a
                  // click has the same feedback as a held press.
                  releaseTimerRef.current = setTimeout(() => {
                    setPressedId(null);
                    releaseTimerRef.current = null;
                  }, PRESSED_FEEDBACK_MS);
                }}
                onPress={() => {
                  clearTimeout(releaseTimerRef.current);
                  releaseTimerRef.current = null;
                  setPressedId(item.id);
                  selectTimerRef.current = setTimeout(() => {
                    selectTimerRef.current = null;
                    onSelect?.(item.id);
                  }, PRESSED_FEEDBACK_MS);
                }}
              />
            ))}
          </ScrollView>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 300,
    elevation: 300,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.42)',
  },
  panelWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    zIndex: 1,
    elevation: 1,
  },
  panelBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 0,
  },
  buttonScroll: {
    flex: 1,
    width: '100%',
    zIndex: 1,
  },
  buttonColumnContent: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuButton: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuButtonText: {
    color: '#FFFFFF',
    fontFamily: 'Goldman',
    fontWeight: '400',
    textAlign: 'center',
  },
});
