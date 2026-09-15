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

import { STOCKS } from '../data/stocks';

const ARROW_IMAGE = require('../assets/image/arrow.svg');
const BACK_IMAGE = require('../assets/image/back.svg');

export default function CustomGroupName({ onBack }) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useViewportDimensions();
  const scale = Math.min(screenWidth / 440, 1.35);
  const { customGroups, renameCustomGroup, addCustomGroup, updateCustomGroup, removeCustomGroup } = useAppSettings();
  const [draftNames, setDraftNames] = useState({});
  const titleBarHeight = 90 * scale + insets.top;
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [picker, setPicker] = useState(null);
  const [selected, setSelected] = useState([]);
  const openPicker = (group = null) => { setSelected(group?.symbols || []); setPicker(group?.id || 'new'); };
  const saveStocks = () => {
    if (selected.length < 3) return;
    if (picker === 'new') { const id = addCustomGroup(selected); setExpanded((v) => ({ ...v, [id]: true })); }
    else updateCustomGroup(picker, { symbols: selected });
    setPicker(null);
  };

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
    <View style={styles.container}>
      <View style={{ height: titleBarHeight, backgroundColor: '#515250', justifyContent: 'flex-end', paddingBottom: 12 * scale }}>
        <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={picker ? () => setPicker(null) : handleBack}
          hitSlop={8}
          style={{ position: 'absolute', zIndex: 2, left: 14 * scale, bottom: 4 * scale, width: Math.max(48, 48 * scale), height: Math.max(44, 44 * scale), justifyContent: 'center', alignItems: 'center' }}>
          <AssetSvg asset={BACK_IMAGE} width={40 * scale} height={25 * scale} pointerEvents="none" />
        </Pressable>
        <Text pointerEvents="none" style={[styles.text, { textAlign: 'center', fontSize: 23 * scale }]}>{picker ? '選擇股票' : '自訂群組'}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={picker ? '儲存群組股票' : editing ? '完成編輯' : '編輯群組'}
          disabled={Boolean(picker) && selected.length < 3}
          onPress={picker ? saveStocks : () => { customGroups.forEach((g) => commitGroupName(g.id)); setEditing(!editing); }}
          style={{ position: 'absolute', right: 22 * scale, bottom: 12 * scale }}>
          <Text style={[styles.text, { fontSize: 19 * scale, color: '#999999' }]}>{picker || editing ? '完成' : '編輯'}</Text>
        </Pressable>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 40 * scale, paddingHorizontal: picker ? 20 * scale : 0, paddingBottom: insets.bottom + 40 }}>
        {picker ? <>
          <Text style={[styles.text, { marginBottom: 18 * scale }]}>至少選擇 3 檔股票（已選 {selected.length} 檔）</Text>
          {STOCKS.map((stock) => <Pressable key={stock.symbol} accessibilityRole="checkbox" accessibilityState={{ checked: selected.includes(stock.symbol) }}
            onPress={() => setSelected((v) => v.includes(stock.symbol) ? v.filter((id) => id !== stock.symbol) : [...v, stock.symbol])}
            style={{ padding: 12 * scale, marginBottom: 6, borderRadius: 8, backgroundColor: selected.includes(stock.symbol) ? '#596877' : '#454545' }}>
            <Text style={styles.text}>{stock.symbol} {stock.name}</Text>
          </Pressable>)}
        </> : <>
          {customGroups.map((group, index) => <View key={group.id} style={{ marginBottom: 0, paddingHorizontal: 20 * scale, paddingVertical: 8 * scale, borderTopWidth: index === 0 ? 1 : 0, borderBottomWidth: 1, borderColor: '#70716F', backgroundColor: '#252625' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 40 * scale }}>
              <Pressable accessibilityRole="button" accessibilityLabel={`自訂群組${index + 1}`} accessibilityState={{ expanded: Boolean(expanded[group.id]) }}
                onPress={() => setExpanded((v) => ({ ...v, [group.id]: !v[group.id] }))}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12 * scale, paddingLeft: 16 * scale }}>
                <View style={{ transform: [{ rotate: expanded[group.id] ? '90deg' : '0deg' }] }}>
                  <AssetSvg asset={ARROW_IMAGE} width={9 * scale} height={16 * scale} />
                </View>
                <Text style={[styles.text, { fontSize: 22 * scale }]}>自訂群組{index + 1}</Text>
              </Pressable>
              <TextInput accessibilityLabel={`自訂群組${index + 1}名稱`} editable={editing}
                value={draftNames[group.id] ?? group.name} placeholder="未命名" placeholderTextColor="#999999"
                onChangeText={(name) => handleGroupNameChange(group.id, name)} onBlur={() => commitGroupName(group.id)}
                onSubmitEditing={() => commitGroupName(group.id)} maxLength={24}
                style={[styles.nameInput, { width: (editing ? 164 : 165) * scale, height: 38 * scale, borderRadius: 22 * scale, paddingHorizontal: 15 * scale, fontSize: 21 * scale }]} />
              {editing && <Pressable accessibilityRole="button" accessibilityLabel={`刪除自訂群組${index + 1}`}
                onPress={() => removeCustomGroup(group.id)} hitSlop={8}
                style={{ width: 23 * scale, height: 23 * scale, borderRadius: 12 * scale, backgroundColor: '#C72B2F', justifyContent: 'center', alignItems: 'center' }}>
                <View style={{ width: 16 * scale, height: 2 * scale, backgroundColor: '#292A29' }} />
              </Pressable>}
            </View>
            {hasDuplicateName(group.id, draftNames[group.id]) && <Text style={{ color: '#F08B7A' }}>群組名稱不能重複</Text>}
            {expanded[group.id] && <View style={{ paddingLeft: (editing ? 55 : 75) * scale, paddingTop: 10 * scale, paddingBottom: editing ? 20 * scale : 4 * scale }}>
              {group.symbols.map((symbol) => <View key={symbol} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 35 * scale }}>
                {editing && <Pressable accessibilityRole="button" accessibilityLabel={`移除${symbol}`}
                  disabled={group.symbols.length <= 3}
                  accessibilityState={{ disabled: group.symbols.length <= 3 }}
                  onPress={() => updateCustomGroup(group.id, { symbols: group.symbols.filter((id) => id !== symbol) })}
                  style={{ width: 44 * scale, height: 35 * scale, justifyContent: 'center' }}>
                  <Text style={{ color: group.symbols.length <= 3 ? '#777777' : '#C72B2F', fontSize: 24 * scale }}>×</Text>
                </Pressable>}
                <Text style={[styles.text, { fontSize: 20 * scale, lineHeight: 31 * scale }]}>{symbol} {STOCKS.find((stock) => stock.symbol === symbol)?.name || ''}</Text>
              </View>)}
              {editing && group.symbols.length <= 3 && <Text style={[styles.text, { color: '#999999', fontSize: 13 * scale, marginTop: 6 * scale }]}>群組至少需保留 3 檔股票</Text>}
              {editing && <Pressable accessibilityRole="button" accessibilityLabel={`新增股票至自訂群組${index + 1}`} onPress={() => openPicker(group)}
                style={{ width: 170 * scale, height: 31 * scale, marginTop: 8 * scale, borderRadius: 18 * scale, borderWidth: 1, borderColor: '#777777', backgroundColor: '#494B48', justifyContent: 'center', alignItems: 'center' }}>
                <Text style={[styles.text, { fontSize: 23 * scale }]}>+</Text>
              </Pressable>}
            </View>}
          </View>)}
          {!editing && <Pressable accessibilityRole="button" accessibilityLabel="新增自訂群組" onPress={() => openPicker()}
            style={{ height: 39 * scale, marginTop: 28 * scale, marginHorizontal: 32 * scale, borderRadius: 12 * scale, borderWidth: 1, borderColor: '#777777', backgroundColor: '#494B48', justifyContent: 'center', alignItems: 'center' }}>
            <Text style={[styles.text, { fontSize: 24 * scale }]}>+</Text>
          </Pressable>}

        </>}
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#2E2F2E' },
  text: { color: '#D9D9D9', fontFamily: 'Goldman' },
  nameInput: { color: '#D9D9D9', fontFamily: 'Goldman', backgroundColor: '#676A67', borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.25)', outlineStyle: 'none',
    boxShadow: 'inset -4px -4px 4px rgba(255,255,255,0.25), inset 6px 6px 4px rgba(0,0,0,0.25)' },
});
