import React, { useEffect, useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
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
const PROFILE_PHOTO_IMAGE = require('../assets/image/ProfilePhoto.svg');
const NAME_IMAGE = require('../assets/image/name.svg');

const DEFAULT_PROFILE = {
  investor_type: 'normal',
  allocation_preference: 'moderate',
  risk_preference: 'neutral',
  top_n: 5,
  budget: 50000,
};

const DEFAULT_GROUP_OPTIONS = [
  { value: '大戶', label: '大戶' },
  { value: '中間戶', label: '中間戶' },
  { value: '小股民', label: '小股民' },
  { value: 'semiconductor', label: '半導體產業' },
  { value: 'ElectronicComponents', label: '電子零件產業' },
  { value: 'FinancialHolding', label: '金控產業' },
  { value: 'all', label: 'ALL' },
];

const PROFILE_SETTINGS_TOP = 480;
const PROFILE_SETTINGS_HEIGHT = 492;

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
  const width = 63 * scale;
  const height = 23 * scale;
  const thumbSize = 21 * scale;

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
        { width: width * scale, height: 28 * scale, borderRadius: 50 * scale },
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
              top: 1 * scale,
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
  onIncrement,
  onDecrement,
  accessibilityLabel,
  disabled = false,
}) {
  const width = 168 * scale;
  const height = 28 * scale;

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
        onBlur={onCommit}
        onSubmitEditing={onCommit}
        editable={!disabled}
        keyboardType="numeric"
        returnKeyType="done"
        style={[
          styles.numberFieldInput,
          {
            left: 17 * scale,
            right: 29 * scale,
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
          onPress={onIncrement}
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
          onPress={onDecrement}
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

function Avatar({ imageUri, size }) {
  return (
    <View style={[styles.avatar, { borderRadius: size / 2 }]}>
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          resizeMode="cover"
          style={styles.avatarImage}
        />
      ) : (
        <AssetSvg
          asset={PROFILE_PHOTO_IMAGE}
          width={size}
          height={size}
          pointerEvents="none"
        />
      )}
    </View>
  );
}

export default function Setting() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useViewportDimensions();
  const {
    actionWindowEnabled,
    setActionWindowEnabled,
    allowFractional,
    setAllowFractional,
    defaultStockGroup,
    setDefaultStockGroup,
    profileName,
    setProfileName,
    profileImageUri,
    setProfileImageUri,
    investmentProfile,
    investmentRunPending,
    investmentRunError,
    rerunInvestment,
  } = useAppSettings();
  // 以參考圖二的比例為上限，避免寬螢幕將設定區塊放大得過度鬆散。
  const scale = Math.min(Math.max(screenWidth / 457, 0.85), 1);
  const [showCustomGroupName, setShowCustomGroupName] = useState(false);
  const [openMenu, setOpenMenu] = useState(null);
  const [identity, setIdentity] = useState(DEFAULT_PROFILE.investor_type);
  const [allocationPreference, setAllocationPreference] = useState(DEFAULT_PROFILE.allocation_preference);
  const [riskPreference, setRiskPreference] = useState(DEFAULT_PROFILE.risk_preference);
  const [topN, setTopN] = useState(String(DEFAULT_PROFILE.top_n));
  const [budget, setBudget] = useState(formatBudget(DEFAULT_PROFILE.budget));
  const [draftProfileImageUri, setDraftProfileImageUri] = useState(null);
  const [draftName, setDraftName] = useState('');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
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
    group: 58,
    identity: 220,
    allocation: 274,
    risk: 328,
  };
  const bottomNavigationReservedHeight = Math.max(insets.bottom, 18) + 8 + 62;
  const bottomNavigationContentGap = 20 * scale;
  const estimatedTriggerRulesHeight = (
    (ruleDeleteMode ? 356 : 392) + Math.max(0, ruleCount - 1) * 329
  ) * scale;
  const resolvedTriggerRulesHeight = triggerRulesHeight > 0
    ? triggerRulesHeight
    : estimatedTriggerRulesHeight;
  const triggerRulesTop = (PROFILE_SETTINGS_TOP + PROFILE_SETTINGS_HEIGHT) * scale;
  const canvasHeight = Math.max(
    screenHeight,
    triggerRulesTop
      + resolvedTriggerRulesHeight
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
    setTopN(String(getProfileValue(profile, ['top_n', 'topN'], DEFAULT_PROFILE.top_n)));
    setBudget(formatBudget(getProfileValue(profile, ['budget', 'investment_budget'], DEFAULT_PROFILE.budget)));
  }, [investmentProfile]);

  const handleChangePhoto = async () => {
    try {
      if (Platform.OS !== 'web') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        // 以 base64 保存，避免 Web 的 blob URL 在重新整理後失效；
        // 同一份資料也能在原生 App 重開後繼續使用。
        base64: true,
        quality: 0.8,
      });

      const asset = result.assets?.[0];
      if (!result.canceled && asset?.uri) {
        let persistentImageUri = asset.uri;

        if (asset.base64) {
          persistentImageUri = `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`;
        } else if (
          Platform.OS === 'web'
          && asset.file
          && typeof globalThis.FileReader !== 'undefined'
        ) {
          persistentImageUri = await new Promise((resolve, reject) => {
            const reader = new globalThis.FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(asset.file);
          });
        }

        setDraftProfileImageUri(persistentImageUri);
      }
    } catch (error) {
      console.warn('無法選擇頭像', error);
    }
  };

  const handleStartEditingProfile = () => {
    setOpenMenu(null);
    setDraftName(profileName);
    setDraftProfileImageUri(profileImageUri);
    setIsEditingProfile(true);
  };

  const handleFinishEditingProfile = () => {
    setProfileName(draftName.trim());
    setProfileImageUri(draftProfileImageUri);
    setIsEditingProfile(false);
  };

  const handleCancelEditingProfile = () => {
    setDraftName(profileName);
    setDraftProfileImageUri(profileImageUri);
    setIsEditingProfile(false);
  };

  const applyProfileChange = async (changes) => {
    if (settingsDisabled || typeof rerunInvestment !== 'function') return;

    try {
      await rerunInvestment(changes);
    } catch (error) {
      // App 會還原上一份成功設定並把錯誤放進 context；這裡避免未處理
      // 的 Promise 讓設定頁出現額外的瀏覽器錯誤。
      console.warn('設定頁重新計算失敗', error);
    }
  };

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
    setTopN(digits ? String(Math.min(20, Math.max(1, Number(digits)))) : '');
  };

  const commitTopN = () => {
    const nextTopN = normalizeTopN(topN);
    setTopN(String(nextTopN));
    void applyProfileChange({ top_n: nextTopN });
  };

  const stepTopN = (delta) => {
    const nextTopN = Math.min(20, Math.max(1, normalizeTopN(topN) + delta));
    setTopN(String(nextTopN));
    void applyProfileChange({ top_n: nextTopN });
  };

  const handleBudgetChange = (value) => {
    setBudget(String(value ?? '').replace(/[^0-9]/g, ''));
  };

  const commitBudget = () => {
    const nextBudget = parseBudget(budget);
    if (nextBudget === null) {
      setBudget(formatBudget(getProfileValue(
        investmentProfile,
        ['budget', 'investment_budget'],
        DEFAULT_PROFILE.budget,
      )));
      return;
    }

    setBudget(formatBudget(nextBudget));
    void applyProfileChange({ budget: nextBudget });
  };

  const stepBudget = (delta) => {
    const currentBudget = parseBudget(budget) || DEFAULT_PROFILE.budget;
    const nextBudget = Math.max(1, currentBudget + delta);
    setBudget(formatBudget(nextBudget));
    void applyProfileChange({ budget: nextBudget });
  };

  const identityLabel = getOptionLabel(IDENTITY_OPTIONS, identity, '中間戶');
  const allocationLabel = getOptionLabel(ALLOCATION_OPTIONS, allocationPreference, '略為集中');
  const riskLabel = getOptionLabel(RISK_OPTIONS, riskPreference, '中立派');
  const defaultGroupLabel = getOptionLabel(DEFAULT_GROUP_OPTIONS, defaultStockGroup, '');

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
    return <CustomGroupName onBack={() => setShowCustomGroupName(false)} />;
  }

  return (
    <View style={[styles.container, { width: screenWidth }]}>
      <ScrollView
        style={styles.screenScroll}
        horizontal={false}
        bounces={false}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          width: screenWidth,
          minHeight: canvasHeight,
          paddingBottom: 0,
        }}
      >
        <View style={[styles.canvas, { width: screenWidth, height: canvasHeight }]}>
          <View
            pointerEvents="none"
            style={[
              styles.topBackdrop,
              {
                top: -184 * scale,
                left: (screenWidth - 460 * scale) / 2,
                width: 460 * scale,
                height: 460 * scale,
                borderRadius: 230 * scale,
                transform: [{ scaleX: screenWidth * 1.2 / (460 * scale) }],
              },
            ]}
          />

          <Text style={[styles.pageTitle, { top: 52 * scale, fontSize: 30 * scale }]}>帳戶</Text>

          {isEditingProfile ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="取消編輯帳戶"
              onPress={handleCancelEditingProfile}
              hitSlop={12 * scale}
              style={[
                styles.cancelButton,
                {
                  top: 48 * scale,
                  left: 24 * scale,
                  width: 52 * scale,
                  height: 34 * scale,
                  alignItems: 'center',
                  justifyContent: 'center',
                },
              ]}
            >
              <Text style={[styles.cancelText, { fontSize: 16 * scale }]}>取消</Text>
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isEditingProfile ? '完成編輯帳戶' : '編輯帳戶'}
            onPress={isEditingProfile ? handleFinishEditingProfile : handleStartEditingProfile}
            hitSlop={12 * scale}
            style={[
                styles.editButton,
                {
                  top: 48 * scale,
                right: 24 * scale,
                width: 52 * scale,
                height: 34 * scale,
                alignItems: 'center',
                justifyContent: 'center',
              },
            ]}
          >
            <Text style={[styles.editText, { fontSize: 16 * scale }]}>
              {isEditingProfile ? '完成' : '編輯'}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="更換頭像"
            onPress={isEditingProfile ? handleChangePhoto : undefined}
            disabled={!isEditingProfile}
            style={[
              styles.avatarWrap,
              {
                top: 102 * scale,
                width: 235 * scale,
                height: 235 * scale,
                borderRadius: 118 * scale,
              },
            ]}
          >
            <Avatar
              imageUri={isEditingProfile ? draftProfileImageUri : profileImageUri}
              size={235 * scale}
            />
          </Pressable>

          <View
            style={[
              styles.nameField,
              {
                top: 350 * scale,
                width: 243 * scale,
                height: 82 * scale,
              },
            ]}
          >
            <AssetSvg
              asset={NAME_IMAGE}
              width={243 * scale}
              height={82 * scale}
              pointerEvents="none"
            />
            <View
              pointerEvents={isEditingProfile ? 'auto' : 'none'}
              style={[
                styles.nameOverlay,
                {
                  top: 30 * scale,
                  width: 223 * scale,
                  height: 41 * scale,
                },
              ]}
            >
              {isEditingProfile ? (
                <TextInput
                  accessibilityLabel="輸入姓名"
                  autoFocus
                  value={draftName}
                  onChangeText={setDraftName}
                  placeholder="Name"
                  placeholderTextColor="#000000"
                  maxLength={24}
                  style={[styles.nameText, styles.nameInput, { fontSize: 18 * scale }]}
                />
              ) : (
                <Text style={[styles.nameText, { fontSize: 18 * scale }]}>
                  {profileName || 'Name'}
                </Text>
              )}
            </View>
          </View>

          <View
            style={[
              styles.profileSettings,
              {
                top: PROFILE_SETTINGS_TOP * scale,
                height: PROFILE_SETTINGS_HEIGHT * scale,
              },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="更改自訂群組命名"
              onPress={() => setShowCustomGroupName(true)}
              style={[styles.settingRow, { top: 0, paddingLeft: 50 * scale, paddingRight: 45 * scale }]}
            >
              <Text numberOfLines={1} style={[styles.settingLabel, { fontSize: 19 * scale }]}>更改自訂群組命名</Text>
              <Text style={[styles.chevron, { fontSize: 40 * scale }]}>›</Text>
            </Pressable>

            <View style={[styles.settingRow, { top: 58 * scale, paddingLeft: 50 * scale, paddingRight: 46 * scale }]}>
              <Text numberOfLines={1} style={[styles.settingLabel, { fontSize: 19 * scale }]}>預設股票群組</Text>
              <ProfileDropdown
                scale={scale}
                value={defaultGroupLabel}
                accessibilityLabel="預設股票群組"
                disabled={settingsDisabled}
                onPress={() => setOpenMenu((current) => (current === 'group' ? null : 'group'))}
              />
            </View>

            <View style={[styles.settingRow, { top: 112 * scale, paddingLeft: 50 * scale, paddingRight: 53 * scale }]}>
              <Text numberOfLines={1} style={[styles.settingLabel, { fontSize: 19 * scale }]}>行動窗口</Text>
              <Toggle
                value={actionWindowEnabled}
                onPress={() => setActionWindowEnabled((current) => !current)}
                scale={scale}
                accessibilityLabel="行動窗口"
              />
            </View>

            <View style={[styles.settingRow, { top: 166 * scale, paddingLeft: 50 * scale, paddingRight: 53 * scale }]}>
              <Text numberOfLines={1} style={[styles.settingLabel, { fontSize: 19 * scale }]}>允許零股</Text>
              <Toggle
                value={allowFractional}
                onPress={handleAllowFractionalToggle}
                scale={scale}
                disabled={settingsDisabled}
                accessibilityLabel="允許零股"
              />
            </View>

            <View style={[styles.settingRow, { top: 220 * scale, paddingLeft: 50 * scale, paddingRight: 46 * scale }]}>
              <Text numberOfLines={1} style={[styles.settingLabel, { fontSize: 19 * scale }]}>更改身分</Text>
              <ProfileDropdown
                scale={scale}
                value={identityLabel}
                accessibilityLabel="更改身分"
                disabled={settingsDisabled}
                onPress={() => setOpenMenu((current) => (current === 'identity' ? null : 'identity'))}
              />
            </View>

            <View style={[styles.settingRow, { top: 274 * scale, paddingLeft: 50 * scale, paddingRight: 46 * scale }]}>
              <Text numberOfLines={1} style={[styles.settingLabel, { fontSize: 19 * scale }]}>更改資金分配偏好</Text>
              <ProfileDropdown
                scale={scale}
                value={allocationLabel}
                accessibilityLabel="更改資金分配偏好"
                disabled={settingsDisabled}
                onPress={() => setOpenMenu((current) => (current === 'allocation' ? null : 'allocation'))}
              />
            </View>

            <View style={[styles.settingRow, { top: 328 * scale, paddingLeft: 50 * scale, paddingRight: 46 * scale }]}>
              <Text numberOfLines={1} style={[styles.settingLabel, { fontSize: 19 * scale }]}>更改風險偏好</Text>
              <ProfileDropdown
                scale={scale}
                value={riskLabel}
                accessibilityLabel="更改風險偏好"
                disabled={settingsDisabled}
                onPress={() => setOpenMenu((current) => (current === 'risk' ? null : 'risk'))}
              />
            </View>

            <View style={[styles.settingRow, { top: 382 * scale, paddingLeft: 50 * scale, paddingRight: 46 * scale }]}>
              <Text numberOfLines={1} style={[styles.settingLabel, { fontSize: 19 * scale }]}>更改股票最多持有數</Text>
              <ProfileNumberField
                scale={scale}
                value={topN}
                onChangeText={handleTopNChange}
                onCommit={commitTopN}
                onIncrement={() => stepTopN(1)}
                onDecrement={() => stepTopN(-1)}
                accessibilityLabel="股票最多持有數"
                disabled={settingsDisabled}
              />
            </View>

            <View style={[styles.settingRow, { top: 436 * scale, paddingLeft: 50 * scale, paddingRight: 46 * scale }]}>
              <Text numberOfLines={1} style={[styles.settingLabel, { fontSize: 19 * scale }]}>更改投入預算</Text>
              <ProfileNumberField
                scale={scale}
                value={budget}
                onChangeText={handleBudgetChange}
                onCommit={commitBudget}
                onIncrement={() => stepBudget(10000)}
                onDecrement={() => stepBudget(-10000)}
                accessibilityLabel="投入預算"
                disabled={settingsDisabled}
              />
            </View>
          </View>

          {openMenu && profileMenuOptions[openMenu] ? (
            <ProfileMenu
              scale={scale}
              options={profileMenuOptions[openMenu]}
              top={(PROFILE_SETTINGS_TOP + profileMenuRowTop[openMenu] + 31) * scale}
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
  topBackdrop: {
    position: 'absolute',
    backgroundColor: '#D9D9D9',
  },
  pageTitle: {
    position: 'absolute',
    alignSelf: 'center',
    color: '#2E2F2E',
    fontFamily: 'Goldman',
    lineHeight: 38,
  },
  editButton: {
    position: 'absolute',
    zIndex: 2,
  },
  cancelButton: {
    position: 'absolute',
    zIndex: 2,
  },
  editText: {
    color: '#F1F1F1',
    fontFamily: 'Goldman',
  },
  cancelText: {
    color: '#F1F1F1',
    fontFamily: 'Goldman',
  },
  avatarWrap: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 2,
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: 118,
    overflow: 'hidden',
    backgroundColor: '#2E2F2E',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  nameField: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 3,
  },
  nameOverlay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameText: {
    color: '#000000',
    fontFamily: 'Goldman',
  },
  nameInput: {
    width: '90%',
    padding: 0,
    textAlign: 'center',
    outlineStyle: 'none',
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
    fontFamily: 'Goldman',
    lineHeight: 30,
  },
  toggle: {
    justifyContent: 'center',
    backgroundColor: '#55DF32',
  },
  toggleOn: {
    backgroundColor: '#55DF32',
  },
  toggleOff: {
    backgroundColor: '#777777',
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
    backgroundColor: '#7B828B',
    boxShadow: 'inset -4px -4px 4px rgba(255, 255, 255, 0.25), inset 6px 6px 4px rgba(0, 0, 0, 0.25)',
  },
  profileDropdownDisabled: {
    opacity: 0.55,
  },
  numberField: {
    position: 'relative',
    justifyContent: 'center',
    backgroundColor: '#7B828B',
    boxShadow: 'inset -4px -4px 4px rgba(255, 255, 255, 0.25), inset 6px 6px 4px rgba(0, 0, 0, 0.25)',
  },
  numberFieldInput: {
    position: 'absolute',
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
