import React from 'react';
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
  const titleBarHeight = 112 * scale + insets.top;

  return (
    <View style={[styles.container, { width: screenWidth }]}>
      <View style={[styles.titleBar, { height: titleBarHeight }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回"
          onPress={onBack}
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
                  height: 57 * scale,
                  marginBottom: index === customGroups.length - 1 ? 0 : 24 * scale,
                },
              ]}
            >
              <Text
                style={[
                  styles.groupLabel,
                  { fontSize: 28 * scale, lineHeight: 36 * scale },
                ]}
              >
                自訂群組{index + 1}
              </Text>
              <TextInput
                accessibilityLabel={`自訂群組${index + 1}名稱`}
                value={group.name}
                onChangeText={(name) => renameCustomGroup(group.id, name)}
                placeholder="命名"
                placeholderTextColor="rgba(217, 217, 217, 0.55)"
                selectionColor="#FFFFFF"
                maxLength={24}
                returnKeyType="done"
                style={[
                  styles.nameInput,
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
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  groupLabel: {
    color: '#D9D9D9',
    fontFamily: 'Goldman',
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
});
