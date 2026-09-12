import React, { useEffect, useState } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AssetSvg from './AssetSvg';
import { useAppSettings } from '../context/AppSettingsContext';
import useViewportDimensions from '../hooks/useViewportDimensions';

const DROPDOWN_ARROW_IMAGE = require('../assets/image/DropdownArrow.svg');

const COMPANY_OPTIONS = [
  '台積電',
  '聯發科',
  '聯詠',
  '台達電',
  '廣達',
  '富邦金',
  '聯電',
  '鴻海',
  '中華電',
  '國泰金',
  '兆豐金',
  '中信金',
  '中鋼',
  '長榮',
  '台塑',
  '第一金',
];

function Toggle({ value, onPress, scale = 1, disabled = false }) {
  const width = 63 * scale;
  const height = 23 * scale;
  const thumbSize = 21 * scale;

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel="觸價警示"
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.toggle,
        { width, height, borderRadius: height / 2 },
        value ? styles.toggleOn : styles.toggleOff,
      ]}
    >
      <View
        style={[
          styles.toggleThumb,
          {
            width: thumbSize,
            height: thumbSize,
            borderRadius: thumbSize / 2,
          },
          value
            ? [styles.thumbLeft, { marginLeft: scale }]
            : [styles.thumbRight, { marginRight: scale }],
        ]}
      />
    </Pressable>
  );
}

function NumericField({
  value,
  onChangeText,
  width = 88,
  scale = 1,
  radius = 50,
  containerStyle,
  editable = true,
}) {
  const height = 26 * scale;

  return (
    <View style={[styles.inputFrame, { width, height, borderRadius: radius }, containerStyle]}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        keyboardType="numeric"
        style={[
          styles.input,
          {
            width: '100%',
            height: '100%',
            fontSize: 16 * scale,
            lineHeight: 22 * scale,
            borderRadius: radius,
          },
        ]}
        textAlign="center"
        maxLength={8}
      />
      <View
        pointerEvents="none"
        style={[styles.inputInnerBorder, { borderRadius: Math.max(0, radius - 1) }]}
      />
    </View>
  );
}

function CompanyMenu({ anchor, menuWidth, uiScale, screenHeight, ruleId, onSelectCompany }) {
  const menuPadding = 14 * uiScale;
  const optionHeight = 28 * uiScale;
  const optionGap = 10 * uiScale;
  const fullMenuHeight =
    menuPadding * 2 +
    COMPANY_OPTIONS.length * optionHeight +
    (COMPANY_OPTIONS.length - 1) * optionGap;
  const screenMargin = 12 * uiScale;
  const availableBelow = screenHeight - (anchor.y + anchor.height) - screenMargin;
  const availableAbove = anchor.y - screenMargin;
  const openUpward = availableBelow < fullMenuHeight && availableAbove > availableBelow;
  const menuHeight = Math.max(
    160 * uiScale,
    Math.min(fullMenuHeight, openUpward ? availableAbove : availableBelow),
  );
  const menuTop = openUpward
    ? Math.max(screenMargin, anchor.y - menuHeight - 1)
    : anchor.y + anchor.height + 1;

  return (
    <View
      accessibilityRole="menu"
      style={[
        styles.companyMenu,
        {
          width: menuWidth,
          height: menuHeight,
          top: menuTop,
          left: anchor.x + (anchor.width - menuWidth) / 2,
        },
      ]}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: menuPadding, paddingHorizontal: 20 * uiScale }}
      >
        {COMPANY_OPTIONS.map((company, index) => (
          <Pressable
            key={company}
            accessibilityRole="menuitem"
            accessibilityLabel={company}
            onPress={() => onSelectCompany(ruleId, company)}
            style={({ pressed }) => [
              styles.companyOption,
              pressed ? styles.companyOptionPressed : null,
              {
                height: optionHeight,
                borderRadius: 15 * uiScale,
                marginBottom: index === COMPANY_OPTIONS.length - 1 ? 0 : optionGap,
              },
            ]}
          >
            <Text numberOfLines={1} style={[styles.companyOptionText, { fontSize: 14 * uiScale }]}>
              {company}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function SwipeToDelete({
  children,
  width,
  uiScale,
  showDividerBefore,
  showDividerAfter,
  showSpacingAfter,
  onDelete,
  onOpenChange,
  resetSignal,
  visible = true,
}) {
  const deleteWidth = Math.min(104, 84 * uiScale);
  const dividerExtension = 21 * uiScale;
  const topDividerGap = 15 * uiScale;
  const translateX = React.useRef(new Animated.Value(0)).current;
  const startX = React.useRef(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const animateTo = (toValue, nextOpen) => {
    setIsOpen(nextOpen);
    onOpenChange?.(nextOpen);
    Animated.spring(translateX, {
      toValue,
      useNativeDriver: false,
      bounciness: 0,
      speed: 24,
    }).start(() => {
      setIsOpen(nextOpen);
      setIsDragging(false);
    });
  };

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          const horizontalMove = Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.2;
          const enoughMove = Math.abs(gestureState.dx) > 8;
          return horizontalMove && enoughMove && (gestureState.dx < 0 || isOpen);
        },
        onPanResponderGrant: () => {
          setIsDragging(true);
          startX.current = isOpen ? -deleteWidth : 0;
        },
        onPanResponderMove: (_, gestureState) => {
          const nextX = Math.max(
            -deleteWidth,
            Math.min(0, startX.current + gestureState.dx),
          );
          translateX.setValue(nextX);
        },
        onPanResponderRelease: (_, gestureState) => {
          const finalX = startX.current + gestureState.dx;
          if (finalX < -deleteWidth * 0.45) {
            animateTo(-deleteWidth, true);
          } else {
            animateTo(0, false);
          }
        },
        onPanResponderTerminate: () => {
          animateTo(isOpen ? -deleteWidth : 0, isOpen);
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [deleteWidth, isOpen, translateX],
  );

  useEffect(() => {
    if (resetSignal > 0) {
      animateTo(0, false);
    }
  }, [resetSignal]);

  const deleteAreaExpanded = isOpen || isDragging;

  return (
    <View
      style={[
        styles.swipeRow,
        !visible ? styles.hidden : null,
        {
          width,
          marginBottom: showSpacingAfter ? 42 * uiScale : 0,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="刪除設定"
        onPress={onDelete}
        style={[
          styles.deleteAction,
          !deleteAreaExpanded ? styles.deleteActionHidden : null,
          {
            width: deleteWidth,
            top: deleteAreaExpanded ? -(showDividerBefore ? topDividerGap : dividerExtension) : 0,
            bottom: deleteAreaExpanded ? -dividerExtension : 0,
          },
        ]}
      >
        <Text
          style={[
            styles.deleteActionText,
            {
              fontSize: 24 * uiScale,
              lineHeight: 34 * uiScale,
              transform: [{ translateX: 6 * uiScale }],
            },
          ]}
        >
          {'刪\n除'}
        </Text>
      </Pressable>
      <Animated.View
        {...panResponder.panHandlers}
        style={[styles.swipeForeground, { width, transform: [{ translateX }] }]}
      >
        {deleteAreaExpanded ? (
          <>
            <View
              pointerEvents="none"
              style={[
                styles.swipeForegroundEdge,
                {
                  top: -(showDividerBefore ? topDividerGap : dividerExtension),
                  height: showDividerBefore ? topDividerGap : dividerExtension,
                },
              ]}
            />
            <View
              pointerEvents="none"
              style={[styles.swipeForegroundEdge, { bottom: -dividerExtension, height: dividerExtension }]}
            />
          </>
        ) : null}
        {children}
      </Animated.View>
      {showDividerBefore ? (
        <View
          pointerEvents="none"
          style={[styles.interRuleDivider, { top: -topDividerGap }]}
        />
      ) : null}
      {showDividerAfter ? (
        <View
          pointerEvents="none"
          style={[styles.interRuleDivider, { bottom: -21 * uiScale }]}
        />
      ) : null}
    </View>
  );
}

function RuleForm({
  rule,
  uiScale,
  contentWidth,
  inputWidth,
  dateInputWidth,
  textSize,
  pickerWidth,
  pickerHeight,
  screenWidth,
  isDeleteMode,
  menuOpen,
  onUpdate,
  onToggleMenu,
  showAlertToggle,
  alertEnabled,
  onToggleAlert,
}) {
  const update = (field, value) => onUpdate(rule.id, field, value);
  const pickerRef = React.useRef(null);

  const handleToggleMenu = () => {
    if (menuOpen) {
      onToggleMenu();
      return;
    }

    if (pickerRef.current?.measureInWindow) {
      pickerRef.current.measureInWindow((x, y, width, height) => {
        onToggleMenu({ x, y, width, height });
      });
      return;
    }

    onToggleMenu(null);
  };

  return (
    <View
      style={[
        styles.ruleBlock,
        {
          width: contentWidth,
          zIndex: menuOpen ? 50 : 1,
        },
      ]}
    >
      {showAlertToggle ? (
        <View
          style={[
            styles.alertRow,
            {
              // 與 Setting.js 上方的設定列使用相同的左右基準，讓標籤與開關對齊。
              width: screenWidth,
              marginLeft: -(screenWidth - contentWidth) / 2,
              height: 30 * uiScale,
              paddingLeft: 50 * uiScale,
              paddingRight: 53 * uiScale,
            },
          ]}
        >
          <Text style={[styles.label, { fontSize: 21 * uiScale, lineHeight: 30 * uiScale }]}>觸價警示</Text>
          <Toggle
            value={alertEnabled}
            onPress={onToggleAlert}
            scale={uiScale}
            disabled={isDeleteMode}
          />
        </View>
      ) : null}

      <View
        style={[
          styles.companyPickerLayer,
          {
            width: pickerWidth,
            height: pickerHeight,
            marginTop: 10 * uiScale,
            alignSelf: 'center',
            zIndex: menuOpen ? 50 : 1,
          },
          !alertEnabled ? styles.hidden : null,
        ]}
        ref={pickerRef}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="選擇公司"
          onPress={handleToggleMenu}
          disabled={isDeleteMode}
          style={[styles.companyPicker, { width: pickerWidth, height: pickerHeight }]}
        >
          <View pointerEvents="none" style={styles.companyPickerInnerBorder} />
          <Text
            numberOfLines={1}
            style={[
              styles.companyPlaceholder,
              {
                flex: 1,
                marginLeft: 20 * uiScale,
                marginRight: 42 * uiScale,
                fontSize: 16 * uiScale,
                textAlign: 'left',
              },
              rule.selectedCompany ? styles.companySelected : null,
            ]}
          >
            {rule.selectedCompany || '選擇公司'}
          </Text>
          <AssetSvg
            asset={DROPDOWN_ARROW_IMAGE}
            width={15 * uiScale}
            height={8 * uiScale}
            pointerEvents="none"
            style={[styles.dropdownArrow, { right: 24 * uiScale }]}
          />
        </Pressable>
      </View>

      <View style={[styles.fieldGroup, { marginTop: 25 * uiScale, paddingLeft: 53 * uiScale }, !alertEnabled ? styles.hidden : null]}>
        <View style={[styles.fieldRow, { height: 26 * uiScale, marginBottom: 11 * uiScale }]}>
          <Text numberOfLines={1} style={[styles.fieldLabel, { width: 82 * uiScale, marginRight: 4 * uiScale, fontSize: textSize, lineHeight: 26 * uiScale }]}>股價高達 $</Text>
          <NumericField value={rule.highPrice} onChangeText={(value) => update('highPrice', value)} width={inputWidth} scale={uiScale} editable={!isDeleteMode} />
        </View>
        <View style={[styles.fieldRow, { height: 26 * uiScale }]}>
          <Text numberOfLines={1} style={[styles.fieldLabel, { width: 82 * uiScale, marginRight: 4 * uiScale, fontSize: textSize, lineHeight: 26 * uiScale }]}>股價低於 $</Text>
          <NumericField value={rule.lowPrice} onChangeText={(value) => update('lowPrice', value)} width={inputWidth} scale={uiScale} editable={!isDeleteMode} />
        </View>
      </View>

      <View style={[styles.fieldGroup, styles.volumeGroup, { marginTop: 16 * uiScale, paddingLeft: 53 * uiScale }, !alertEnabled ? styles.hidden : null]}>
        <View style={[styles.fieldRow, { height: 26 * uiScale, marginBottom: 11 * uiScale }]}>
          <Text numberOfLines={1} style={[styles.fieldLabel, { width: 82 * uiScale, marginRight: 4 * uiScale, fontSize: textSize, lineHeight: 26 * uiScale }]}>成交量大於</Text>
          <NumericField value={rule.highVolume} onChangeText={(value) => update('highVolume', value)} width={inputWidth} scale={uiScale} editable={!isDeleteMode} />
        </View>
        <View style={[styles.fieldRow, { height: 26 * uiScale }]}>
          <Text numberOfLines={1} style={[styles.fieldLabel, { width: 82 * uiScale, marginRight: 4 * uiScale, fontSize: textSize, lineHeight: 26 * uiScale }]}>成交量大於</Text>
          <NumericField value={rule.lowVolume} onChangeText={(value) => update('lowVolume', value)} width={inputWidth} scale={uiScale} editable={!isDeleteMode} />
        </View>
      </View>

      <View style={[styles.dateRow, { marginTop: 26 * uiScale, paddingLeft: 40 * uiScale }, !alertEnabled ? styles.hidden : null]}>
        <Text style={[styles.dateLabel, { fontSize: Math.min(15, textSize), lineHeight: 26 * uiScale, marginHorizontal: 3 * uiScale }]}>至</Text>
        <NumericField value={rule.year} onChangeText={(value) => update('year', value)} width={dateInputWidth} scale={uiScale} radius={5} editable={!isDeleteMode} containerStyle={{ marginHorizontal: 5 * uiScale }} />
        <Text style={[styles.dateLabel, { fontSize: Math.min(15, textSize), lineHeight: 26 * uiScale, marginHorizontal: 3 * uiScale }]}>年</Text>
        <NumericField value={rule.month} onChangeText={(value) => update('month', value)} width={dateInputWidth} scale={uiScale} radius={5} editable={!isDeleteMode} containerStyle={{ marginHorizontal: 5 * uiScale }} />
        <Text style={[styles.dateLabel, { fontSize: Math.min(15, textSize), lineHeight: 26 * uiScale, marginHorizontal: 3 * uiScale }]}>月</Text>
        <NumericField value={rule.day} onChangeText={(value) => update('day', value)} width={dateInputWidth} scale={uiScale} radius={5} editable={!isDeleteMode} containerStyle={{ marginHorizontal: 5 * uiScale }} />
        <Text numberOfLines={1} style={[styles.dateLabel, { fontSize: Math.min(15, textSize), lineHeight: 26 * uiScale, marginHorizontal: 3 * uiScale }]}>日 為止</Text>
      </View>
    </View>
  );
}

/**
 * 原設定頁的觸價規則內容，現在可嵌入帳戶／Setting 頁的同一個捲動畫布。
 */
export default function TriggerRulesSection({
  onRuleCountChange,
  onDeleteModeChange,
  onContentHeightChange,
}) {
  const { width: screenWidth, height: screenHeight } = useViewportDimensions();
  const {
    triggerRules: rules,
    addTriggerRule,
    updateTriggerRule,
    removeTriggerRule,
  } = useAppSettings();
  // 以圖二的窄版設定頁作為上限，避免寬螢幕把觸價警示區塊放大到失去比例。
  const uiScale = Math.min(Math.max(screenWidth / 457, 0.85), 1);
  const contentWidth = Math.min(358, Math.max(280, screenWidth - 80));
  const inputWidth = Math.min(102, 108 * uiScale);
  const dateInputWidth = Math.min(48, 52 * uiScale);
  const textSize = 16 * uiScale;
  const pickerWidth = Math.min(216, contentWidth * 0.64);
  const pickerHeight = 29 * uiScale;
  const menuWidth = pickerWidth * 0.88;
  const [openDropdown, setOpenDropdown] = useState(null);
  const [deleteModeActive, setDeleteModeActive] = useState(false);
  const [swipeResetSignal, setSwipeResetSignal] = useState(0);
  const [alertEnabled, setAlertEnabled] = useState(() => rules[0]?.alertEnabled !== false);
  const storedAlertEnabled = rules[0]?.alertEnabled !== false;
  const hasEnabledRule = alertEnabled;

  useEffect(() => {
    onRuleCountChange?.(rules.length);
  }, [onRuleCountChange, rules.length]);

  useEffect(() => {
    onDeleteModeChange?.(deleteModeActive);
  }, [deleteModeActive, onDeleteModeChange]);

  useEffect(() => {
    setAlertEnabled(storedAlertEnabled);
  }, [storedAlertEnabled]);

  const updateRule = (ruleId, field, value) => {
    updateTriggerRule(ruleId, { [field]: value });
  };

  const toggleAlert = () => {
    const nextValue = !alertEnabled;
    setAlertEnabled(nextValue);
    rules.forEach((rule) => updateTriggerRule(rule.id, { alertEnabled: nextValue }));
    setOpenDropdown(null);
  };

  const addRule = () => {
    if (deleteModeActive) return;

    addTriggerRule();
    setOpenDropdown(null);
  };

  const removeRule = (ruleId) => {
    const lastRuleDeleted = rules.length === 1 && rules[0].id === ruleId;

    removeTriggerRule(ruleId);
    setOpenDropdown(null);

    if (lastRuleDeleted) {
      setDeleteModeActive(false);
      setSwipeResetSignal((current) => current + 1);
    } else {
      setDeleteModeActive(true);
    }
  };

  const cancelSwipe = () => {
    setDeleteModeActive(false);
    setSwipeResetSignal((current) => current + 1);
  };

  const selectCompany = (ruleId, company) => {
    updateRule(ruleId, 'selectedCompany', company);
    setOpenDropdown(null);
  };

  return (
    <View
      style={[styles.root, { width: screenWidth }]}
      onLayout={(event) => {
        onContentHeightChange?.(event.nativeEvent.layout.height);
      }}
    >
      {rules.map((rule, index) => (
        <SwipeToDelete
          key={rule.id}
          width={screenWidth}
          uiScale={uiScale}
          showDividerBefore={deleteModeActive && index === 0}
          showDividerAfter={deleteModeActive && index < rules.length - 1}
          showSpacingAfter={alertEnabled && index < rules.length - 1}
          visible={alertEnabled || index === 0}
          onDelete={() => removeRule(rule.id)}
          resetSignal={swipeResetSignal}
          onOpenChange={(isOpen) => {
            setDeleteModeActive(isOpen);
          }}
        >
          <RuleForm
            rule={rule}
            uiScale={uiScale}
            contentWidth={contentWidth}
            inputWidth={inputWidth}
            dateInputWidth={dateInputWidth}
            textSize={textSize}
            pickerWidth={pickerWidth}
            pickerHeight={pickerHeight}
            screenWidth={screenWidth}
            isDeleteMode={deleteModeActive}
            menuOpen={openDropdown?.ruleId === rule.id}
            onUpdate={updateRule}
            showAlertToggle={index === 0}
            alertEnabled={alertEnabled}
            onToggleAlert={toggleAlert}
            onToggleMenu={(anchor) =>
              setOpenDropdown((current) => {
                if (current?.ruleId === rule.id) return null;
                return { ruleId: rule.id, anchor };
              })
            }
          />
        </SwipeToDelete>
      ))}

      {!deleteModeActive && hasEnabledRule ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="新增設定"
          onPress={addRule}
          style={[styles.addRuleButton, { width: contentWidth, height: 80 * uiScale, marginTop: 25 * uiScale }]}
        >
          <Text style={[styles.addRuleText, { fontSize: 26 * uiScale }]}>+</Text>
        </Pressable>
      ) : null}

      {deleteModeActive ? (
        <View
          pointerEvents="box-none"
          style={[
            styles.swipeCancelLayer,
            {
              width: screenWidth,
              height: 44 * uiScale,
              marginTop: 25 * uiScale,
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="取消刪除"
            onPress={cancelSwipe}
            style={[
              styles.swipeCancelButton,
              {
                width: Math.min(screenWidth * 0.86, 420),
                height: 44 * uiScale,
              },
            ]}
          >
            <Text style={[styles.swipeCancelText, { fontSize: 24 * uiScale }]}>取消</Text>
          </Pressable>
        </View>
      ) : null}

      {openDropdown ? (
        <Modal
          transparent
          visible
          animationType="none"
          statusBarTranslucent
          onRequestClose={() => setOpenDropdown(null)}
        >
          <View pointerEvents="box-none" style={styles.dropdownModalOverlay}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="關閉公司選單"
              onPress={() => setOpenDropdown(null)}
              style={styles.dropdownBackdrop}
            />
            {openDropdown.anchor ? (
              <CompanyMenu
                anchor={openDropdown.anchor}
                menuWidth={menuWidth}
                uiScale={uiScale}
                screenHeight={screenHeight}
                ruleId={openDropdown.ruleId}
                onSelectCompany={selectCompany}
              />
            ) : null}
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'relative',
    alignItems: 'center',
    overflow: 'visible',
  },
  hidden: {
    display: 'none',
  },
  swipeRow: {
    position: 'relative',
    alignSelf: 'center',
    overflow: 'visible',
  },
  swipeForeground: {
    position: 'relative',
    zIndex: 1,
    backgroundColor: '#2E2F2E',
  },
  swipeForegroundEdge: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: '#2E2F2E',
    zIndex: 2,
  },
  interRuleDivider: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    zIndex: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  deleteAction: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#A93E3E',
    overflow: 'hidden',
    boxShadow: 'inset 4px 4px 4px 0 rgba(0, 0, 0, 0.25)',
  },
  deleteActionHidden: {
    opacity: 0,
  },
  deleteActionText: {
    color: '#FFFFFF',
    fontFamily: 'Goldman',
    textAlign: 'center',
  },
  swipeCancelLayer: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    zIndex: 120,
    elevation: 120,
  },
  swipeCancelButton: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#585858',
    borderRadius: 50,
    borderWidth: 1,
    borderColor: '#939292',
  },
  swipeCancelText: {
    color: '#FFFFFF',
    fontFamily: 'Goldman',
  },
  ruleBlock: {
    position: 'relative',
    alignSelf: 'center',
    overflow: 'visible',
  },
  dropdownBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
  },
  dropdownModalOverlay: {
    flex: 1,
    position: 'relative',
  },
  companyPickerLayer: {
    position: 'relative',
    alignSelf: 'center',
    overflow: 'visible',
  },
  companyPicker: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    borderRadius: 50,
    borderWidth: 0,
    borderColor: 'transparent',
    backgroundColor: 'rgba(217, 217, 217, 0.3)',
    boxShadow:
      'inset -4px -4px 4px rgba(255, 255, 255, 0.25), inset 6px 6px 4px rgba(0, 0, 0, 0.25)',
  },
  companyPickerInnerBorder: {
    position: 'absolute',
    top: 1,
    right: 1,
    bottom: 1,
    left: 1,
    borderRadius: 49,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  companyPlaceholder: {
    color: 'rgba(217, 217, 217, 0.3)',
    fontFamily: 'Goldman',
    lineHeight: 24,
  },
  companySelected: {
    color: '#FFFFFF',
  },
  companyMenu: {
    position: 'absolute',
    alignItems: 'stretch',
    backgroundColor: '#636060',
    zIndex: 100,
    elevation: 100,
  },
  companyOption: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(217, 217, 217, 1)',
    backgroundColor: 'rgba(217, 217, 217, 0.3)',
    boxShadow: '2px 2px 4px rgba(0, 0, 0, 0.2)',
  },
  companyOptionPressed: {
    borderColor: '#D9D9D9',
    backgroundColor: '#6A6A6A',
    boxShadow: 'inset 2px 2px 4px rgba(93, 106, 140, 1)',
  },
  companyOptionText: {
    color: '#FFFFFF',
    fontFamily: 'Goldman',
    lineHeight: 20,
  },
  dropdownArrow: {
    position: 'absolute',
  },
  alertRow: {
    width: '100%',
    height: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggle: {
    width: 64,
    height: 25,
    borderRadius: 13,
    justifyContent: 'center',
  },
  toggleOn: {
    backgroundColor: '#55DF32',
  },
  toggleOff: {
    backgroundColor: '#777777',
  },
  toggleThumb: {
    width: 23,
    height: 23,
    borderRadius: 12,
    backgroundColor: '#D9D9D9',
  },
  thumbLeft: {
    marginLeft: 1,
  },
  thumbRight: {
    alignSelf: 'flex-end',
    marginRight: 1,
  },
  label: {
    fontFamily: 'Goldman',
    color: '#F1F1F1',
    fontSize: 14,
    lineHeight: 26,
  },
  fieldGroup: {
    marginTop: 10,
  },
  volumeGroup: {
    marginTop: 5,
  },
  fieldRow: {
    height: 26,
    flexDirection: 'row',
    alignItems: 'center',
  },
  fieldLabel: {
    fontFamily: 'Goldman',
    color: '#F1F1F1',
    fontSize: 14,
    lineHeight: 26,
    textAlign: 'right',
  },
  input: {
    fontFamily: 'Goldman',
    margin: 0,
    paddingHorizontal: 10,
    paddingVertical: 0,
    borderWidth: 0,
    borderColor: 'transparent',
    borderRadius: 50,
    backgroundColor: 'transparent',
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 16,
    lineHeight: 22,
    outlineStyle: 'none',
  },
  inputFrame: {
    position: 'relative',
    borderWidth: 0,
    borderColor: 'transparent',
    backgroundColor: 'rgba(217, 217, 217, 0.3)',
    boxShadow:
      'inset -4px -4px 4px rgba(255, 255, 255, 0.25), inset 6px 6px 4px rgba(0, 0, 0, 0.25)',
  },
  inputInnerBorder: {
    position: 'absolute',
    top: 1,
    right: 1,
    bottom: 1,
    left: 1,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateLabel: {
    fontFamily: 'Goldman',
    color: '#F1F1F1',
    fontSize: 14,
    lineHeight: 26,
    marginHorizontal: 4,
  },
  addRuleButton: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(217, 217, 217, 0.56)',
    backgroundColor: 'rgba(217, 217, 217, 0.18)',
  },
  addRuleText: {
    color: '#F1F1F1',
    fontFamily: 'Goldman',
    fontWeight: '400',
    lineHeight: 30,
  },
});
