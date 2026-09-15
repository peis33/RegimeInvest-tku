import PageHeader from '../components/PageHeader';
import React, { useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ellipse, Svg } from 'react-native-svg';
import AssetSvg from '../components/AssetSvg';
import TriggerRulesSection from '../components/TriggerRulesSection';
import { TAB_BAR_STYLE } from '../components/TabBar';
import CustomGroupName from './CustomGroupName';
import { useAppSettings } from '../context/AppSettingsContext';
import useViewportDimensions from '../hooks/useViewportDimensions';
import { updateAllowFractional } from '../services/investmentApi';
import {
  ALLOCATION_OPTIONS,
  IDENTITY_OPTIONS,
  RISK_OPTIONS,
} from './Login';

const DROPDOWN_ARROW_IMAGE = require('../assets/image/DropdownArrow.svg');
const SETTINGS_GEARS = require('../assets/image/ProfilePhoto.svg');
const ARROW_IMAGE = require('../assets/image/arrow.svg');

const DEFAULT_PROFILE = {
  investor_type: 'normal',
  allocation_preference: 'moderate',
  risk_preference: 'neutral',
  top_n: 5,
  budget: 50000,
};

const DEFAULT_GROUP_OPTIONS = [
  { value: '', label: '依登入身分' },
  { value: '大戶', label: '大戶' },
  { value: '中間戶', label: '中間戶' },
  { value: '小股民', label: '小股民' },
  { value: 'all', label: 'ALL' },
];

const PROFILE_SETTINGS_TOP = 335;
const SETTINGS_ROW_GAP = 66;
const SETTINGS_ROW_TOPS = Array.from({ length: 7 }, (_, index) => index * SETTINGS_ROW_GAP);
const PROFILE_SETTINGS_HEIGHT = SETTINGS_ROW_TOPS.length * SETTINGS_ROW_GAP;

function getProfileValue(profile, keys, fallback) {
  for (const key of keys) {
    const value = profile?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }

  return fallback;
}

function getOptionLabel(options, value, fallback) {
  return options.find((option) => option.value === value)?.label || fallback;
}

function getOptionValue(options, value, fallback) {
  return options.find((option) => option.value === value || option.label === value)?.value || fallback;
}

function formatBudget(value) {
  const number = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(number) && number > 0 ? number.toLocaleString('en-US') : '';
}

function parseBudget(value) {
  const number = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(number) && number > 0 ? Math.round(number) : null;
}

function Toggle({ value, onPress, scale, accessibilityLabel = '設定開關', disabled = false }) {
  const width = 56 * scale;
  const height = 28 * scale;
  const thumbSize = 23 * scale;

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.toggle,
        { width, height, borderRadius: height / 2 },
        value ? styles.toggleOn : styles.toggleOff,
        disabled ? styles.toggleDisabled : null,
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
          value ? { marginLeft: scale } : { alignSelf: 'flex-end', marginRight: scale },
        ]}
      />
    </Pressable>
  );
}

function ProfileDropdown({
  scale,
  value,
  onPress,
  accessibilityLabel = '選擇項目',
  disabled = false,
  width = 168,
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.profileDropdown,
        disabled ? styles.profileDropdownDisabled : null,
        { width: width * scale, height: 35 * scale, borderRadius: 50 * scale },
      ]}
    >
      <View
        pointerEvents="none"
        style={[styles.profileDropdownBorder, { borderRadius: 49 * scale }]}
      />
      {value !== undefined && value !== null && value !== '' ? (
        <Text
          pointerEvents="none"
          numberOfLines={1}
          style={[
            styles.profileDropdownText,
            {
              left: 17 * scale,
              right: 35 * scale,
              top: 5 * scale,
              fontSize: 16 * scale,
              lineHeight: 25 * scale,
            },
          ]}
        >
          {value}
        </Text>
      ) : null}
      <AssetSvg
        asset={DROPDOWN_ARROW_IMAGE}
        width={13 * scale}
        height={7 * scale}
        pointerEvents="none"
        style={{ position: 'absolute', right: 17 * scale }}
      />
    </Pressable>
  );
}

function ProfileMenu({ scale, options, onSelect, top, right, width = 168 }) {
  const optionHeight = 40 * scale;

  return (
    <View
      style={[
        styles.profileMenu,
        {
          top,
          right,
          width: width * scale,
          borderRadius: 14 * scale,
        },
      ]}
    >
      {options.map((option, index) => {
        const item = typeof option === 'string'
          ? { label: option, value: option }
          : option;

        return (
          <Pressable
            key={item.value}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            onPress={() => onSelect(item.value)}
            style={[
              styles.profileMenuOption,
              {
                height: optionHeight,
                borderBottomWidth: index === options.length - 1 ? 0 : 2 * scale,
              },
            ]}
          >
            <Text style={[styles.profileMenuText, { fontSize: 18 * scale, lineHeight: 24 * scale }]}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ProfileNumberField({
  scale,
  value,
  onChangeText,
  onCommit,
  onEditingChange,
  onIncrement,
  onDecrement,
  accessibilityLabel,
  disabled = false,
}) {
  const stepInProgress = useRef(false);
  const commit = () => { if (!stepInProgress.current) onCommit(); };
  const step = (action) => {
    action();
    setTimeout(() => { stepInProgress.current = false; }, 0);
  };
  const width = 168 * scale;
  const height = 35 * scale;

  return (
    <View style={[styles.numberField, disabled ? styles.profileDropdownDisabled : null, { width, height, borderRadius: 50 * scale }]}>
      <View
        pointerEvents="none"
        style={[styles.profileDropdownBorder, { borderRadius: 49 * scale }]}
      />
      <TextInput
        accessibilityLabel={accessibilityLabel}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => onEditingChange?.(true)}
        onBlur={() => { onEditingChange?.(false); commit(); }}
        selectTextOnFocus
        onSubmitEditing={commit}
        editable={!disabled}
        keyboardType="numeric"
        returnKeyType="done"
        style={[
          styles.numberFieldInput,
          {
            width: width - 46 * scale,
            marginLeft: 17 * scale,
            height,
            fontSize: 16 * scale,
            lineHeight: 24 * scale,
          },
        ]}
      />
      <View pointerEvents="box-none" style={styles.numberStepper}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`增加${accessibilityLabel}`}
          onPressIn={() => { stepInProgress.current = true; }}
          onPress={() => step(onIncrement)}
          disabled={disabled}
          style={styles.numberStepperButton}
        >
          <View
            style={[
              styles.stepperTriangleUp,
              {
                borderLeftWidth: 7 * scale,
                borderRightWidth: 7 * scale,
                borderBottomWidth: 8 * scale,
              },
            ]}
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`減少${accessibilityLabel}`}
          onPressIn={() => { stepInProgress.current = true; }}
          onPress={() => step(onDecrement)}
          disabled={disabled}
          style={styles.numberStepperButton}
        >
          <View
            style={[
              styles.stepperTriangleDown,
              {
                borderLeftWidth: 7 * scale,
                borderRightWidth: 7 * scale,
                borderTopWidth: 8 * scale,
              },
            ]}
          />
        </Pressable>
      </View>
    </View>
  );
}

export default function Setting() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useViewportDimensions();
  const {
    allowFractional,
    setAllowFractional,
    defaultStockGroup,
    setDefaultStockGroup,
    investmentProfile,
    investmentRunPending,
    investmentRunError,
    rerunInvestment,
  } = useAppSettings();
  // 以參考圖二的比例為上限，避免寬螢幕將設定區塊放大得過度鬆散。
  const scale = Math.min(screenWidth / 457, 1);
  // Reference artwork: 771px canvas, 720px-wide SVG at (29, 118).
  // Scale the whole 300:200:100 gear composition together with the header.
  const headerScale = screenWidth / 457;
  const headerReduction = Platform.OS === 'web' ? 0 : 55 * headerScale;
  const artworkTop = insets.top - headerReduction;
  const originalGearsWidth = screenWidth * (720 / 771);
  const gearsWidth = originalGearsWidth * 0.95;
  const gearsInset = (originalGearsWidth - gearsWidth) / 2;
  const settingsTop = artworkTop + PROFILE_SETTINGS_TOP * headerScale;
  const [showCustomGroupName, setShowCustomGroupName] = useState(false);
  const [openMenu, setOpenMenu] = useState(null);
  const [identity, setIdentity] = useState(DEFAULT_PROFILE.investor_type);
  const [allocationPreference, setAllocationPreference] = useState(DEFAULT_PROFILE.allocation_preference);
  const [riskPreference, setRiskPreference] = useState(DEFAULT_PROFILE.risk_preference);
  const [topN, setTopN] = useState(String(DEFAULT_PROFILE.top_n));
  const budgetEditing = useRef(false);
  const numbersDirty = useRef(false);
  const profileSaveInFlight = useRef(false);
  const queuedProfileChanges = useRef(null);
  const [profileSaveError, setProfileSaveError] = useState(null);
  const [budget, setBudget] = useState(formatBudget(DEFAULT_PROFILE.budget));
  const [ruleCount, setRuleCount] = useState(1);
  const [ruleDeleteMode, setRuleDeleteMode] = useState(false);
  const [triggerRulesHeight, setTriggerRulesHeight] = useState(0);
  const [allowFractionalSaving, setAllowFractionalSaving] = useState(false);
  const settingsDisabled = Boolean(investmentRunPending || allowFractionalSaving);
  const profileMenuOptions = {
    group: DEFAULT_GROUP_OPTIONS,
    identity: IDENTITY_OPTIONS,
    allocation: ALLOCATION_OPTIONS,
    risk: RISK_OPTIONS,
  };
  const profileMenuRowTop = {
    group: 0,
    identity: SETTINGS_ROW_TOPS[2],
    allocation: SETTINGS_ROW_TOPS[3],
    risk: SETTINGS_ROW_TOPS[4],
  };
  const bottomNavigationReservedHeight = Math.max(insets.bottom, 18) + 8 + 62;
  const bottomNavigationContentGap = 20 * scale;
  const estimatedTriggerRulesHeight = (
    (ruleDeleteMode ? 356 : 392) + Math.max(0, ruleCount - 1) * 329
  ) * scale;
  const resolvedTriggerRulesHeight = triggerRulesHeight > 0
    ? triggerRulesHeight
    : estimatedTriggerRulesHeight;
  const triggerRulesTop = settingsTop + PROFILE_SETTINGS_HEIGHT * scale;
  const profileStatusHeight = investmentRunPending || profileSaveError || investmentRunError ? 65 * scale : 0;
  const canvasHeight = Math.max(
    screenHeight,
    triggerRulesTop
      + resolvedTriggerRulesHeight
      + profileStatusHeight
      + bottomNavigationReservedHeight
      + bottomNavigationContentGap,
  );

  useEffect(() => {
    const profile = investmentProfile || DEFAULT_PROFILE;
    setIdentity(getOptionValue(
      IDENTITY_OPTIONS,
      getProfileValue(profile, ['investor_type', 'investorType', 'identity'], DEFAULT_PROFILE.investor_type),
      DEFAULT_PROFILE.investor_type,
    ));
    setAllocationPreference(getOptionValue(
      ALLOCATION_OPTIONS,
      getProfileValue(profile, ['allocation_preference', 'allocationPreference'], DEFAULT_PROFILE.allocation_preference),
      DEFAULT_PROFILE.allocation_preference,
    ));
    setRiskPreference(getOptionValue(
      RISK_OPTIONS,
      getProfileValue(profile, ['risk_preference', 'riskPreference'], DEFAULT_PROFILE.risk_preference),
      DEFAULT_PROFILE.risk_preference,
    ));
    if (!numbersDirty.current) setTopN(String(getProfileValue(profile, ['top_n', 'topN'], DEFAULT_PROFILE.top_n)));
    if (!budgetEditing.current && !numbersDirty.current) {
      setBudget(formatBudget(getProfileValue(profile, ['budget', 'investment_budget'], DEFAULT_PROFILE.budget)));
    }
  }, [investmentProfile]);

  const applyProfileChange = async (changes) => {
    if (settingsDisabled || profileSaveInFlight.current) {
      queuedProfileChanges.current = { ...queuedProfileChanges.current, ...changes };
      return;
    }
    if (Object.entries(changes).every(([key, value]) => String(investmentProfile?.[key]) === String(value))) return;
    if (typeof rerunInvestment !== 'function') {
      setProfileSaveError('無法更新投資設定，請重新登入。');
      return;
    }
    profileSaveInFlight.current = true;
    setProfileSaveError(null);
    try {
      await rerunInvestment(changes);
      numbersDirty.current = false;
    } catch (error) {
      // App 會還原上一份成功設定並把錯誤放進 context；這裡避免未處理
      // 的 Promise 讓設定頁出現額外的瀏覽器錯誤。
      setProfileSaveError(error?.message || '設定更新失敗，請稍後再試。');
    } finally {
      profileSaveInFlight.current = false;
    }
  };

  useEffect(() => {
    if (settingsDisabled || !queuedProfileChanges.current) return;
    const changes = queuedProfileChanges.current;
    queuedProfileChanges.current = null;
    void applyProfileChange(changes);
  }, [settingsDisabled]);

  const handleProfileMenuPress = (menu, value) => {
    setOpenMenu(null);

    if (menu === 'group') {
      setDefaultStockGroup(value);
      return;
    }

    if (menu === 'identity') {
      setIdentity(value);
      void applyProfileChange({ investor_type: value });
      return;
    }

    if (menu === 'allocation') {
      setAllocationPreference(value);
      const selectedAllocation = ALLOCATION_OPTIONS.find((option) => option.value === value);
      void applyProfileChange({
        allocation_preference: value,
        zipf_s: selectedAllocation?.zipfS || 1.2,
      });
      return;
    }

    if (menu === 'risk') {
      setRiskPreference(value);
      void applyProfileChange({ risk_preference: value });
    }
  };

  const normalizeTopN = (value) => {
    const number = Number(String(value ?? '').replace(/[^0-9]/g, ''));
    if (!Number.isFinite(number)) return DEFAULT_PROFILE.top_n;
    return Math.min(20, Math.max(1, Math.round(number)));
  };

  const handleTopNChange = (value) => {
    const digits = String(value ?? '').replace(/[^0-9]/g, '');
    numbersDirty.current = true;
    setTopN(digits);
  };

  const stepTopN = (delta) => {
    numbersDirty.current = true;
    const nextTopN = Math.min(20, Math.max(1, normalizeTopN(topN) + delta));
    setTopN(String(nextTopN));
    void applyProfileChange({ top_n: nextTopN });
  };

  const handleBudgetChange = (value) => {
    numbersDirty.current = true;
    setBudget(String(value ?? '').replace(/[^0-9]/g, ''));
  };

  const commitNumbers = () => {
    const nextBudget = parseBudget(budget);
    if (nextBudget === null) {
      setProfileSaveError('請輸入大於 0 的預算。');
      return;
    }
    const nextTopN = normalizeTopN(topN);
    setBudget(formatBudget(nextBudget));
    setTopN(String(nextTopN));
    void applyProfileChange({ budget: nextBudget, top_n: nextTopN });
  };

  const stepBudget = (delta) => {
    numbersDirty.current = true;
    const nextBudget = Math.max(1, (parseBudget(budget) || DEFAULT_PROFILE.budget) + delta);
    setBudget(formatBudget(nextBudget));
    void applyProfileChange({ budget: nextBudget });
  };

  const identityLabel = getOptionLabel(IDENTITY_OPTIONS, identity, '中間戶');
  const allocationLabel = getOptionLabel(ALLOCATION_OPTIONS, allocationPreference, '略為集中');
  const riskLabel = getOptionLabel(RISK_OPTIONS, riskPreference, '中立派');
  const defaultGroupLabel = getOptionLabel(DEFAULT_GROUP_OPTIONS, defaultStockGroup, '依登入身分');

  const handleAllowFractionalToggle = async () => {
    if (settingsDisabled) return;

    const previousValue = allowFractional;
    const nextValue = !previousValue;
    setAllowFractional(nextValue);
    setAllowFractionalSaving(true);

    try {
      if (typeof rerunInvestment !== 'function') {
        throw new Error('尚未建立投資配置更新流程。');
      }
      await rerunInvestment(nextValue);
    } catch (error) {
      try {
        // /api/investment/run 會先保存新設定；若重算失敗，將後端值一併還原。
        await updateAllowFractional(previousValue);
      } catch (rollbackError) {
        console.warn('零股設定後端還原失敗', rollbackError);
      }
      setAllowFractional(previousValue);
      console.warn('零股設定同步失敗', error);
    } finally {
      setAllowFractionalSaving(false);
    }
  };

  useEffect(() => {
    navigation.setOptions({
      tabBarStyle: showCustomGroupName || ruleDeleteMode
        ? { display: 'none' }
        : TAB_BAR_STYLE,
    });

    return () => navigation.setOptions({ tabBarStyle: TAB_BAR_STYLE });
  }, [navigation, ruleDeleteMode, showCustomGroupName]);

  if (showCustomGroupName) {
    return <CustomGroupName
      onBack={() => setShowCustomGroupName(false)}

    />;
  }

  return (
    <View style={[styles.container, { width: screenWidth }]}>
      <PageHeader title="設定" backgroundColor="#596570" />
      <ScrollView
        style={styles.screenScroll}
        horizontal={false}
        bounces={false}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          width: screenWidth,
          minHeight: canvasHeight,
          paddingBottom: 0,
        }}
      >
        <View style={[styles.canvas, { width: screenWidth, height: canvasHeight, marginTop: -(insets.top + 127 * headerScale - headerReduction) }]}>
          <Svg
            width={screenWidth}
            height={330 * headerScale}
            viewBox="0 0 457 330"
            pointerEvents="none"
            preserveAspectRatio="none"
            style={{ position: 'absolute', top: artworkTop, left: 0 }}
          >
            <Ellipse cx={228.5} cy={90} rx={290} ry={240} fill="#424442" />
          </Svg>
          <AssetSvg
            asset={SETTINGS_GEARS}
            width={gearsWidth}
            height={gearsWidth * (300 / 530)}
            pointerEvents="none"
            style={{ position: 'absolute', top: artworkTop + screenWidth * (118 / 771) + gearsInset * (300 / 530), left: screenWidth * (29 / 771) + gearsInset }}
          />


          <View
            style={[
              styles.profileSettings,
              {
                top: settingsTop,
                height: PROFILE_SETTINGS_HEIGHT * scale,
              },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="更改自訂群組命名"
              onPress={() => setShowCustomGroupName(true)}
              style={[styles.settingRow, { height: 30 * scale, top: 0, paddingLeft: 50 * scale, paddingRight: 45 * scale }]}
            >
              <Text numberOfLines={1} style={[styles.settingLabel, { fontSize: 19 * scale }]}>自訂群組</Text>
              <AssetSvg asset={ARROW_IMAGE} width={10 * scale} height={18 * scale} pointerEvents="none" />
            </Pressable>

            <View style={[styles.settingRow, { height: 30 * scale, top: SETTINGS_ROW_TOPS[1] * scale, paddingLeft: 50 * scale, paddingRight: 53 * scale }]}>
              <Text numberOfLines={1} style={[styles.settingLabel, { fontSize: 19 * scale }]}>允許零股</Text>
              <Toggle
                value={allowFractional}
                onPress={handleAllowFractionalToggle}
                scale={scale}
                disabled={settingsDisabled}
                accessibilityLabel="允許零股"
              />
            </View>

            <View style={[styles.settingRow, { height: 30 * scale, top: SETTINGS_ROW_TOPS[2] * scale, paddingLeft: 50 * scale, paddingRight: 46 * scale }]}>
              <Text numberOfLines={1} style={[styles.settingLabel, { fontSize: 19 * scale }]}>選擇身分</Text>
              <ProfileDropdown
                scale={scale}
                value={identityLabel}
                accessibilityLabel="更改身分"
                disabled={settingsDisabled}
                onPress={() => setOpenMenu((current) => (current === 'identity' ? null : 'identity'))}
              />
            </View>

            <View style={[styles.settingRow, { height: 30 * scale, top: SETTINGS_ROW_TOPS[3] * scale, paddingLeft: 50 * scale, paddingRight: 46 * scale }]}>
              <Text numberOfLines={1} style={[styles.settingLabel, { fontSize: 19 * scale }]}>更改資金分配偏好</Text>
              <ProfileDropdown
                scale={scale}
                value={allocationLabel}
                accessibilityLabel="更改資金分配偏好"
                disabled={settingsDisabled}
                onPress={() => setOpenMenu((current) => (current === 'allocation' ? null : 'allocation'))}
              />
            </View>

            <View style={[styles.settingRow, { height: 30 * scale, top: SETTINGS_ROW_TOPS[4] * scale, paddingLeft: 50 * scale, paddingRight: 46 * scale }]}>
              <Text numberOfLines={1} style={[styles.settingLabel, { fontSize: 19 * scale }]}>更改風險偏好</Text>
              <ProfileDropdown
                scale={scale}
                value={riskLabel}
                accessibilityLabel="更改風險偏好"
                disabled={settingsDisabled}
                onPress={() => setOpenMenu((current) => (current === 'risk' ? null : 'risk'))}
              />
            </View>

            <View style={[styles.settingRow, { height: 30 * scale, top: SETTINGS_ROW_TOPS[5] * scale, paddingLeft: 50 * scale, paddingRight: 46 * scale }]}>
              <Text numberOfLines={1} style={[styles.settingLabel, { fontSize: 19 * scale }]}>更改股票最大持有數</Text>
              <ProfileNumberField
                scale={scale}
                value={topN}
                onChangeText={handleTopNChange}
                onCommit={commitNumbers}
                onIncrement={() => stepTopN(1)}
                onDecrement={() => stepTopN(-1)}
                accessibilityLabel="股票最多持有數"
                disabled={false}
              />
            </View>

            <View style={[styles.settingRow, { height: 30 * scale, top: SETTINGS_ROW_TOPS[6] * scale, paddingLeft: 50 * scale, paddingRight: 46 * scale }]}>
              <Text numberOfLines={1} style={[styles.settingLabel, { fontSize: 19 * scale }]}>更改投入預算</Text>
              <ProfileNumberField
                scale={scale}
                value={budget}
                onChangeText={handleBudgetChange}
                onEditingChange={(editing) => { budgetEditing.current = editing; }}
                onCommit={commitNumbers}
                onIncrement={() => stepBudget(10000)}
                onDecrement={() => stepBudget(-10000)}
                accessibilityLabel="投入預算"
                disabled={false}
              />
            </View>

          </View>

          {openMenu && profileMenuOptions[openMenu] ? (
            <ProfileMenu
              scale={scale}
              options={profileMenuOptions[openMenu]}
              top={settingsTop + (profileMenuRowTop[openMenu] + 36) * scale}
              right={46 * scale}
              onSelect={(value) => handleProfileMenuPress(openMenu, value)}
            />
          ) : null}

          <View style={[styles.triggerRules, { top: triggerRulesTop }]}>
            <TriggerRulesSection
              onRuleCountChange={setRuleCount}
              onDeleteModeChange={setRuleDeleteMode}
              onContentHeightChange={(height) => {
                setTriggerRulesHeight((current) => (
                  Math.abs(current - height) < 0.5 ? current : height
                ));
              }}
            />
          </View>
            {investmentRunPending || profileSaveError || investmentRunError ? <Text
              accessibilityLiveRegion="polite"
              numberOfLines={3}
              style={{ position: 'absolute', top: triggerRulesTop + resolvedTriggerRulesHeight + 12 * scale, left: 30 * scale,
                right: 30 * scale, fontSize: 12 * scale, lineHeight: 17 * scale,
                color: profileSaveError || investmentRunError ? '#F0B2B7' : '#D9D9D9' }}
            >
              {investmentRunPending
                ? '正在更新設定並重新計算配置，請稍候…'
                : profileSaveError || investmentRunError || '輸入完成後按 Enter／完成，或離開欄位即可套用。'}
            </Text> : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#2E2F2E',
  },
  screenScroll: {
    flex: 1,
    width: '100%',
  },
  canvas: {
    position: 'relative',
    alignSelf: 'center',
    backgroundColor: '#2E2F2E',
    overflow: 'hidden',
  },
  titleBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#596570',
  },
  pageTitle: {
    position: 'absolute',
    alignSelf: 'center',
    color: '#D9D9D9',
    fontWeight: '400',
  },
  profileSettings: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  triggerRules: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 4,
  },
  settingRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingLabel: {
    color: '#F1F1F1',
    lineHeight: 30,
  },
  toggle: {
    justifyContent: 'center',
    backgroundColor: '#28B32F',
  },
  toggleOn: {
    backgroundColor: '#28B32F',
  },
  toggleOff: {
    backgroundColor: '#999999',
  },
  toggleDisabled: {
    opacity: 0.55,
  },
  toggleThumb: {
    backgroundColor: '#D9D9D9',
  },
  profileDropdown: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#676A67',
    boxShadow: 'inset -4px -4px 4px rgba(255, 255, 255, 0.25), inset 6px 6px 4px rgba(0, 0, 0, 0.25)',
  },
  profileDropdownDisabled: {
    opacity: 0.55,
  },
  numberField: {
    position: 'relative',
    flexShrink: 0,
    justifyContent: 'center',
    backgroundColor: '#676A67',
    boxShadow: 'inset -4px -4px 4px rgba(255, 255, 255, 0.25), inset 6px 6px 4px rgba(0, 0, 0, 0.25)',
  },
  numberFieldInput: {
    minWidth: 0,
    padding: 0,
    color: '#D9D9D9',
    fontFamily: 'Goldman',
    textAlign: 'left',
    outlineStyle: 'none',
  },
  numberStepper: {
    position: 'absolute',
    top: 1,
    right: 5,
    bottom: 1,
    width: 20,
    alignItems: 'center',
  },
  numberStepperButton: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperTriangleUp: {
    width: 0,
    height: 0,
    borderStyle: 'solid',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#282828',
  },
  stepperTriangleDown: {
    width: 0,
    height: 0,
    borderStyle: 'solid',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#282828',
  },
  profileDropdownBorder: {
    position: 'absolute',
    top: 1,
    right: 1,
    bottom: 1,
    left: 1,
    borderWidth: 0.5,
    borderColor: '#5E6E7F',
  },
  profileDropdownText: {
    position: 'absolute',
    color: '#D9D9D9',
    fontFamily: 'Goldman',
  },
  profileMenu: {
    position: 'absolute',
    overflow: 'hidden',
    zIndex: 20,
    backgroundColor: '#AFB7BF',
  },
  profileMenuOption: {
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomColor: '#5E6E7F',
  },
  profileMenuText: {
    color: '#D9D9D9',
    fontFamily: 'Goldman',
    textAlign: 'center',
  },
  chevron: {
    color: '#F1F1F1',
    fontFamily: 'Arial',
    lineHeight: 38,
  },
});
