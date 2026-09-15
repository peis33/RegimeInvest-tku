import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useViewportDimensions from '../hooks/useViewportDimensions';

export default function GroupListModal({ visible, onClose, stocks = [], title = '未命名', groupName = '', onGroupNameChange, nameError = '', selectedSymbols = [], minSelection = 1, onConfirm }) {
  const { width, height } = useViewportDimensions();
  const insets = useSafeAreaInsets();
  const modalWidth = Math.min(500, width * 0.82);
  const scale = modalWidth / 500;
  const itemHeight = Math.max(28, 40 * scale);
  const gap = 20 * scale;
  const rowCount = Math.ceil(stocks.length / 2);
  const headerHeight = Math.max(58, 88 * scale);
  const footerHeight = Math.max(78, 104 * scale);
  const contentHeight = rowCount * itemHeight + Math.max(0, rowCount - 1) * gap + 30 * scale;
  const modalHeight = Math.min(height - insets.top - insets.bottom - 32, headerHeight + contentHeight + footerHeight);
  const [selected, setSelected] = useState([]);
  const selectedKey = [...new Set(selectedSymbols.map(String))].sort().join('|');
  useEffect(() => {
    if (visible) setSelected(selectedKey ? selectedKey.split('|') : []);
  }, [visible, selectedKey]);
  const editable = typeof onGroupNameChange === 'function';
  const disabled = selected.length < minSelection || Boolean(nameError);
  const toggle = (symbol) => setSelected((current) => current.includes(symbol) ? current.filter((id) => id !== symbol) : [...current, symbol]);
  const confirm = () => { if (!disabled) { if (onConfirm) onConfirm([...selected]); else onClose?.(); } };
  return <Modal transparent visible={visible} animationType="none" statusBarTranslucent onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
      <Pressable accessibilityRole="button" accessibilityLabel="關閉群組清單" style={styles.dim} onPress={onClose} />
      <View style={[styles.modal, { width: modalWidth, height: modalHeight, maxHeight: '95%' }]}>
        <View style={{ height: headerHeight, flexShrink: 0, justifyContent: 'center', alignItems: 'center', paddingTop: 18 * scale }}>
          <Pressable accessibilityRole="button" accessibilityLabel="關閉群組清單" onPress={onClose} style={styles.close}>
            <View pointerEvents="none" style={[styles.closeBar, { transform: [{ rotate: '45deg' }] }]} />
            <View pointerEvents="none" style={[styles.closeBar, { transform: [{ rotate: '-45deg' }] }]} />
          </Pressable>
          {editable ? <TextInput accessibilityLabel="自訂群組名稱" value={groupName} onChangeText={onGroupNameChange} placeholder="未命名" placeholderTextColor="#999999" maxLength={24} returnKeyType="done"
            style={[styles.title, { fontSize: Math.max(15, 20 * scale), width: modalWidth * 0.27 }]} />
            : <Text numberOfLines={1} style={[styles.title, { fontSize: Math.max(15, 20 * scale), width: modalWidth * 0.27 }]}>{title || '未命名'}</Text>}
          {Boolean(nameError) && <Text accessibilityLiveRegion="polite" style={styles.error}>{nameError}</Text>}
        </View>
        <ScrollView style={{ flex: 1, minHeight: 0 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator
          contentContainerStyle={{ paddingHorizontal: modalWidth * 0.1, paddingBottom: 30 * scale }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: gap }}>
            {stocks.map((stock) => {
              const symbol = String(stock.symbol), checked = selected.includes(symbol);
              return <Pressable key={symbol} accessibilityRole="checkbox" accessibilityLabel={`${symbol} ${stock.name}`} accessibilityState={{ checked }} onPress={() => toggle(symbol)}
                style={[styles.stock, { width: '45%', height: itemHeight, borderRadius: 10 * scale }, checked && styles.selected]}>
                <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.stockText, { fontSize: Math.max(12, 18 * scale) }]}>{symbol} {stock.name}</Text>
              </Pressable>;
            })}
          </View>
        </ScrollView>
        <View style={[styles.footer, { height: footerHeight }]}>
          {minSelection > 1 && selected.length < minSelection && <Text accessibilityLiveRegion="polite" style={styles.hint}>{minSelection === 3 ? '自訂群組請至少選擇三股以上' : `自訂群組請至少選擇 ${minSelection} 檔股票`}</Text>}
          <View style={{ flexDirection: 'row', justifyContent: 'space-evenly', width: '100%' }}>
            <Pressable accessibilityRole="button" accessibilityLabel="取消新增群組" onPress={onClose} style={[styles.button, { width: Math.max(60, 80 * scale), height: Math.max(34, 40 * scale) }]}>
              <Text style={[styles.buttonText, { fontSize: Math.max(15, 20 * scale) }]}>取消</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="儲存群組" disabled={disabled} accessibilityState={{ disabled }} onPress={confirm}
              style={[styles.button, { width: Math.max(60, 80 * scale), height: Math.max(34, 40 * scale), opacity: disabled ? 0.4 : 1 }]}>
              <Text style={[styles.buttonText, { fontSize: Math.max(15, 20 * scale) }]}>儲存</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}
const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.42)' },
  modal: { backgroundColor: '#B7B7B7', borderRadius: 10, overflow: 'hidden' },
  close: { position: 'absolute', left: 0, top: 0, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  closeBar: { position: 'absolute', width: 23, height: 3, borderRadius: 2, backgroundColor: '#D9D9D9' },
  title: { color: '#8F8D8D', fontFamily: 'Goldman', textAlign: 'center', padding: 0, borderBottomWidth: 2, borderBottomColor: '#858585', outlineStyle: 'none' },
  error: { color: '#9A4242', fontSize: 12, marginTop: 3 },
  stock: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, backgroundColor: '#979797' },
  selected: { backgroundColor: '#798792' },
  stockText: { color: '#D9D9D9', fontFamily: 'Goldman', textAlign: 'center' },
  footer: { flexShrink: 0, borderTopWidth: 1, borderTopColor: 'rgba(46,47,46,0.2)', justifyContent: 'center', alignItems: 'center', gap: 9 },
  hint: { position: 'absolute', bottom: '100%', width: '100%', textAlign: 'center', color: '#C57979', fontSize: 12, paddingBottom: 2 },
  button: { borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#798792' },
  buttonText: { color: '#D9D9D9', fontFamily: 'Goldman' },
});
