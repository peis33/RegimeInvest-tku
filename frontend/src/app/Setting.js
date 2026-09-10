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

const DROPDOWN_ARROW_IMAGE = require('../assets/image/DropdownArrow.svg');
const PROFILE_PHOTO_IMAGE = require('../assets/image/ProfilePhoto.svg');
const NAME_IMAGE = require('../assets/image/name.svg');

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

function ProfileDropdown({ scale, value, onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="選擇項目"
      onPress={onPress}
      style={[styles.profileDropdown, { width: 168 * scale, height: 28 * scale, borderRadius: 50 * scale }]}
    >
      <View
        pointerEvents="none"
        style={[styles.profileDropdownBorder, { borderRadius: 49 * scale }]}
      />
      {value ? (
        <Text
          pointerEvents="none"
          style={[styles.profileDropdownText, { left: 17 * scale, fontSize: 16 * scale }]}
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

function ProfileMenu({ scale, onSelect }) {
  const options = ['大戶', '中間戶', '小股民', '半導體產業', '電子零件產業', '金控產業'];
  const optionHeight = 48 * scale;
  const menuTop = (518 + 112) * scale - optionHeight * options.length;

  return (
    <View
      style={[
        styles.profileMenu,
        {
          top: menuTop,
          right: 46 * scale,
          width: 168 * scale,
          borderRadius: 14 * scale,
        },
      ]}
    >
      {options.map((option, index) => (
        <Pressable
          key={option}
          accessibilityRole="button"
          accessibilityLabel={option}
          onPress={() => onSelect(option)}
          style={[
            styles.profileMenuOption,
            {
              height: optionHeight,
              borderBottomWidth: index === options.length - 1 ? 0 : 3 * scale,
            },
          ]}
        >
          <Text style={[styles.profileMenuText, { fontSize: 22 * scale, lineHeight: 30 * scale }]}>
            {option}
          </Text>
        </Pressable>
      ))}
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
  } = useAppSettings();
  const scale = Math.min(Math.max(screenWidth / 457, 0.85), 1.35);
  const [showCustomGroupName, setShowCustomGroupName] = useState(false);
  const [openMenu, setOpenMenu] = useState(null);
  const [defaultGroup, setDefaultGroup] = useState('');
  const [profileImageUri, setProfileImageUri] = useState(null);
  const [draftProfileImageUri, setDraftProfileImageUri] = useState(null);
  const [profileName, setProfileName] = useState('');
  const [draftName, setDraftName] = useState('');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [ruleCount, setRuleCount] = useState(1);
  const [ruleDeleteMode, setRuleDeleteMode] = useState(false);
  const [allowFractionalSaving, setAllowFractionalSaving] = useState(false);
  const canvasHeight = Math.max(
    screenHeight,
    (900 + ruleCount * 470) * scale,
  );

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
        quality: 1,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        setDraftProfileImageUri(result.assets[0].uri);
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

  const handleAllowFractionalToggle = async () => {
    if (allowFractionalSaving) return;

    const previousValue = allowFractional;
    const nextValue = !previousValue;
    setAllowFractional(nextValue);
    setAllowFractionalSaving(true);

    try {
      await updateAllowFractional(nextValue);
    } catch (error) {
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
          paddingBottom: insets.bottom + 82 * scale,
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
              style={[styles.cancelButton, { top: 35 * scale, left: 10 * scale }]}
            >
              <Text style={[styles.cancelText, { fontSize: 16 * scale }]}>取消</Text>
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isEditingProfile ? '完成編輯帳戶' : '編輯帳戶'}
            onPress={isEditingProfile ? handleFinishEditingProfile : handleStartEditingProfile}
            style={[styles.editButton, { top: 35 * scale, right: 10 * scale }]}
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
                top: 518 * scale,
                height: 224 * scale,
              },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="更改自訂群組命名"
              onPress={() => setShowCustomGroupName(true)}
              style={[styles.settingRow, { top: 0, paddingLeft: 50 * scale, paddingRight: 45 * scale }]}
            >
              <Text style={[styles.settingLabel, { fontSize: 21 * scale }]}>更改自訂群組命名</Text>
              <Text style={[styles.chevron, { fontSize: 40 * scale }]}>›</Text>
            </Pressable>

            <View style={[styles.settingRow, { top: 58 * scale, paddingLeft: 50 * scale, paddingRight: 46 * scale }]}>
              <Text style={[styles.settingLabel, { fontSize: 21 * scale }]}>預設股票群組</Text>
              <ProfileDropdown
                scale={scale}
                value={defaultGroup}
                onPress={() => setOpenMenu((current) => (current === 'group' ? null : 'group'))}
              />
            </View>

            <View style={[styles.settingRow, { top: 112 * scale, paddingLeft: 50 * scale, paddingRight: 53 * scale }]}>
              <Text style={[styles.settingLabel, { fontSize: 21 * scale }]}>行動窗口</Text>
              <Toggle
                value={actionWindowEnabled}
                onPress={() => setActionWindowEnabled((current) => !current)}
                scale={scale}
                accessibilityLabel="行動窗口"
              />
            </View>

            <View style={[styles.settingRow, { top: 166 * scale, paddingLeft: 50 * scale, paddingRight: 53 * scale }]}>
              <Text style={[styles.settingLabel, { fontSize: 21 * scale }]}>允許零股</Text>
              <Toggle
                value={allowFractional}
                onPress={handleAllowFractionalToggle}
                scale={scale}
                disabled={allowFractionalSaving}
                accessibilityLabel="允許零股"
              />
            </View>
          </View>

          {openMenu ? (
            <ProfileMenu
              scale={scale}
              onSelect={(value) => {
                setDefaultGroup(value);
                setOpenMenu(null);
              }}
            />
          ) : null}

          <View style={[styles.triggerRules, { top: 754 * scale }]}>
            <TriggerRulesSection
              onRuleCountChange={setRuleCount}
              onDeleteModeChange={setRuleDeleteMode}
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
