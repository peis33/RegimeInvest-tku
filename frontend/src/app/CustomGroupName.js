import React, { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AssetSvg from '../components/AssetSvg';
import { useAppSettings } from '../context/AppSettingsContext';
import useViewportDimensions from '../hooks/useViewportDimensions';

const BACK_IMAGE = require('../assets/image/back.svg');

export default function CustomGroupName({ onBack }) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useViewportDimensions();
  const scale = Math.min(Math.max(screenWidth / 553, 0.85), 1.35);
  const { customGroups, renameCustomGroup } = useAppSettings();
  const [draftNames, setDraftNames] = useState({});
  const titleBarHeight = 112 * scale + insets.top;

  useEffect(() => {
    setDraftNames((current) => {
      const next = {};
      customGroups.forEach((group) => {
        next[group.id] = Object.prototype.hasOwnProperty.call(current, group.id)
          ? current[group.id]
          : group.name;
      });
      return next;
    });
  }, [customGroups]);

  const hasDuplicateName = (groupId, name) => {
    const normalizedName = String(name || '').trim();
    return Boolean(normalizedName)
      && customGroups.some(
        (group) => group.id !== groupId
          && String(group?.name || '').trim() === normalizedName,
      );
  };

  const commitGroupName = (groupId) => {
    const group = customGroups.find((item) => item.id === groupId);
    if (!group) return;

    const name = String(draftNames[groupId] ?? group.name ?? '').trim();
    if (hasDuplicateName(groupId, name)) {
      // 重複名稱只存在於畫面上的暫存輸入；離開欄位或返回時還原舊名稱。
      setDraftNames((current) => ({
        ...current,
        [groupId]: group.name,
      }));
      return;
    }

    renameCustomGroup(groupId, name);
    setDraftNames((current) => ({ ...current, [groupId]: name }));
  };

  const handleGroupNameChange = (groupId, name) => {
    setDraftNames((current) => ({ ...current, [groupId]: name }));
    if (!hasDuplicateName(groupId, name)) {
      renameCustomGroup(groupId, name);
    }
  };

  const handleBack = () => {
    customGroups.forEach((group) => commitGroupName(group.id));
    onBack();
  };

  return (
    <View style={[styles.container, { width: screenWidth }]}>
      <View style={[styles.titleBar, { height: titleBarHeight }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回"
          onPress={handleBack}
          style={[
            styles.backButton,
            {
              top: insets.top + 65 * scale,
              left: 22 * scale,
              width: 52 * scale,
              height: 33 * scale,
            },
          ]}
        >
          <AssetSvg asset={BACK_IMAGE} width={58 * scale} height={33 * scale} pointerEvents="none" />
        </Pressable>

        <Text
          style={[
            styles.title,
            {
              top: insets.top + 64 * scale,
              fontSize: 30 * scale,
              lineHeight: 38 * scale,
            },
          ]}
        >
          更改自訂群組命名
        </Text>
      </View>

      <ScrollView
        horizontal={false}
        bounces={false}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
        style={[styles.groupsScroll, { top: titleBarHeight }]}
        contentContainerStyle={[
          styles.groupsContent,
          {
            width: screenWidth,
            paddingTop: 51 * scale,
            paddingBottom: 40 * scale + insets.bottom,
            paddingHorizontal: 27 * scale,
          },
        ]}
      >
        {customGroups.length ? (
          customGroups.map((group, index) => (
            <View
              key={group.id}
              style={[
                styles.groupRow,
                {
                  height: (
                    57 + (
                      hasDuplicateName(
                        group.id,
                        draftNames[group.id] ?? group.name,
                      )
                        ? 30
                        : 0
                    )
                  ) * scale,
                  marginBottom: index === customGroups.length - 1 ? 0 : 24 * scale,
                },
              ]}
            >
              <Text
                style={[
                  styles.groupLabel,
                  {
                    marginTop: 10 * scale,
                    fontSize: 28 * scale,
                    lineHeight: 36 * scale,
                  },
                ]}
              >
                自訂群組{index + 1}
              </Text>
              <View style={[styles.nameField, { width: 206 * scale }] }>
                <TextInput
                  accessibilityLabel={`自訂群組${index + 1}名稱`}
                  value={draftNames[group.id] ?? group.name}
                  onChangeText={(name) => handleGroupNameChange(group.id, name)}
                  onBlur={() => commitGroupName(group.id)}
                  onSubmitEditing={() => commitGroupName(group.id)}
                  placeholder="命名"
                  placeholderTextColor="rgba(217, 217, 217, 0.55)"
                  selectionColor="#FFFFFF"
                  maxLength={24}
                  returnKeyType="done"
                  style={[
                    styles.nameInput,
                    hasDuplicateName(
                      group.id,
                      draftNames[group.id] ?? group.name,
                    ) ? styles.nameInputError : null,
                    {
                      width: 206 * scale,
                      height: 57 * scale,
                      borderRadius: 29 * scale,
                      paddingHorizontal: 20 * scale,
                      fontSize: 28 * scale,
                      lineHeight: 34 * scale,
                    },
                  ]}
                />
                {hasDuplicateName(
                  group.id,
                  draftNames[group.id] ?? group.name,
                ) ? (
                  <Text
                    accessibilityLiveRegion="polite"
                    style={[
                      styles.nameError,
                      {
                        marginTop: 3 * scale,
                        paddingLeft: 20 * scale,
                        fontSize: 12 * scale,
                        lineHeight: 16 * scale,
                      },
                    ]}
                  >
                    群組名稱不能重複
                  </Text>
                ) : null}
              </View>
            </View>
          ))
        ) : (
          <Text
            style={[
              styles.emptyText,
              { fontSize: 22 * scale, lineHeight: 30 * scale },
            ]}
          >
            尚未建立客製群組
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#2E2F2E',
    overflow: 'hidden',
  },
  titleBar: {
    position: 'relative',
    width: '100%',
    backgroundColor: '#5D5D5D',
  },
  backButton: {
    position: 'absolute',
    justifyContent: 'center',
    zIndex: 2,
  },
  title: {
    position: 'absolute',
    alignSelf: 'center',
    color: '#D9D9D9',
    fontFamily: 'Goldman',
    textAlign: 'center',
  },
  groupRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  groupLabel: {
    color: '#D9D9D9',
    fontFamily: 'Goldman',
    flexShrink: 0,
  },
  nameField: {
    flexShrink: 0,
  },
  groupsScroll: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  groupsContent: {
    flexGrow: 1,
  },
  emptyText: {
    color: '#D9D9D9',
    fontFamily: 'Goldman',
    textAlign: 'center',
  },
  nameInput: {
    color: '#D9D9D9',
    fontFamily: 'Goldman',
    backgroundColor: 'rgba(217, 217, 217, 0.3)',
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    boxShadow: 'inset -4px -4px 4px rgba(255, 255, 255, 0.25), inset 6px 6px 4px rgba(0, 0, 0, 0.25)',
    outlineStyle: 'none',
  },
  nameInputError: {
    borderColor: '#F08B7A',
  },
  nameError: {
    color: '#F08B7A',
    fontFamily: 'Goldman',
  },
});
