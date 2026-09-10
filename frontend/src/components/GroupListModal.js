import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import useViewportDimensions from '../hooks/useViewportDimensions';

const GROUP_LIST_LAYOUT = [
  { symbol: '2002', left: 192.5, top: 88.6991, width: 115 },
  { symbol: '2330', left: 338.369, top: 108.858, width: 131 },
  { symbol: '1301', left: 52.3689, top: 121.199, width: 115 },
  { symbol: '2308', left: 184.5, top: 153.699, width: 131 },
  { symbol: '2303', left: 52.3689, top: 186.199, width: 115 },
  { symbol: '2317', left: 338.369, top: 178.858, width: 115 },
  { symbol: '2412', left: 184.5, top: 218.699, width: 131 },
  { symbol: '2454', left: 338.369, top: 248.858, width: 131 },
  { symbol: '2382', left: 52.3689, top: 251.199, width: 115 },
  { symbol: '2881', left: 184.5, top: 283.699, width: 131 },
  { symbol: '2603', left: 52.3689, top: 316.199, width: 115 },
  { symbol: '2882', left: 338.369, top: 318.858, width: 131 },
  { symbol: '2891', left: 184.5, top: 348.699, width: 131 },
  { symbol: '2886', left: 36.3689, top: 381.199, width: 131 },
  { symbol: '2892', left: 338.369, top: 388.858, width: 131 },
  { symbol: '3034', left: 192.5, top: 413.699, width: 115 },
];

function findStock(stocks, symbol) {
  return stocks?.find((stock) => String(stock.symbol) === symbol);
}

export default function GroupListModal({
  visible,
  onClose,
  stocks = [],
  title = '未命名',
  groupName = '',
  onGroupNameChange,
  selectedSymbols = [],
  onConfirm,
}) {
  const { width: screenWidth } = useViewportDimensions();
  const groupListWidth = Math.min(500, screenWidth * 0.82);
  const groupListHeight = groupListWidth * (557 / 500);
  const groupListScale = groupListWidth / 500;
  const [draftSelectedSymbols, setDraftSelectedSymbols] = useState(selectedSymbols);
  const isNameEditable = typeof onGroupNameChange === 'function';

  useEffect(() => {
    if (visible) {
      setDraftSelectedSymbols(selectedSymbols.map((symbol) => String(symbol)));
    }
  }, [selectedSymbols, visible]);

  const selectedSymbolSet = new Set(
    draftSelectedSymbols.map((symbol) => String(symbol)),
  );

  const toggleStock = (symbol) => {
    const normalizedSymbol = String(symbol);
    setDraftSelectedSymbols((current) => {
      const currentSymbols = current.map((item) => String(item));
      return currentSymbols.includes(normalizedSymbol)
        ? currentSymbols.filter((item) => item !== normalizedSymbol)
        : [...currentSymbols, normalizedSymbol];
    });
  };

  const handleConfirm = () => {
    if (!draftSelectedSymbols.length) return;
    if (onConfirm) {
      onConfirm([...draftSelectedSymbols]);
    } else {
      onClose?.();
    }
  };

  const displayTitle = String(title || '').trim() || '未命名';

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="關閉群組清單"
          onPress={onClose}
          style={styles.dim}
        />

        <View
          style={[
            styles.modal,
            {
              width: groupListWidth,
              height: groupListHeight,
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="關閉群組清單"
            onPress={onClose}
            style={[
              styles.closeButton,
              {
                width: 60 * groupListScale,
                height: 60 * groupListScale,
              },
            ]}
          >
            <View
              pointerEvents="none"
              style={[
                styles.closeBar,
                {
                  width: 28 * groupListScale,
                  height: 5 * groupListScale,
                },
              ]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.closeBar,
                styles.closeBarSecond,
                {
                  width: 28 * groupListScale,
                  height: 5 * groupListScale,
                },
              ]}
            />
          </Pressable>

          <View
            pointerEvents={isNameEditable ? 'box-none' : 'none'}
            style={[
              styles.titleWrap,
              {
                height: 38 * groupListScale,
              },
            ]}
          >
            {isNameEditable ? (
              <TextInput
                accessibilityLabel="自訂群組名稱"
                value={groupName}
                onChangeText={onGroupNameChange}
                placeholder="未命名"
                placeholderTextColor="rgba(99, 96, 96, 0.55)"
                maxLength={24}
                style={[
                  styles.title,
                  styles.titleInput,
                  {
                    top: 8 * groupListScale,
                    height: 32 * groupListScale,
                    fontSize: 20 * groupListScale,
                    lineHeight: 24 * groupListScale,
                  },
                ]}
              />
            ) : (
              <Text
                numberOfLines={1}
                style={[
                  styles.title,
                  {
                    top: 14 * groupListScale,
                    fontSize: 20 * groupListScale,
                    lineHeight: 24 * groupListScale,
                  },
                ]}
              >
                {displayTitle}
              </Text>
            )}
            <View
              style={[
                styles.titleUnderline,
                {
                  left: 184.5 * groupListScale,
                  top: 35.3368 * groupListScale,
                  width: 131.267 * groupListScale,
                  height: 2 * groupListScale,
                },
              ]}
            />
          </View>

          {GROUP_LIST_LAYOUT.map((layout) => {
            const stock = findStock(stocks, layout.symbol);
            const label = stock?.name
              ? `${layout.symbol} ${stock.name}`
              : layout.symbol;

            return (
              <Pressable
                key={layout.symbol}
                accessibilityRole="checkbox"
                accessibilityLabel={label}
                accessibilityState={{ checked: selectedSymbolSet.has(layout.symbol) }}
                onPress={() => toggleStock(layout.symbol)}
                style={[
                  styles.groupItem,
                  {
                    left: layout.left * groupListScale,
                    top: layout.top * groupListScale,
                    width: layout.width * groupListScale,
                    height: 40 * groupListScale,
                    borderRadius: 10 * groupListScale,
                  },
                  selectedSymbolSet.has(layout.symbol) && styles.groupItemSelected,
                ]}
              >
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={[
                    styles.groupItemText,
                    {
                      fontSize: 17 * groupListScale,
                      lineHeight: 21 * groupListScale,
                    },
                    selectedSymbolSet.has(layout.symbol) && styles.groupItemTextSelected,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}

          <View
            pointerEvents="none"
            style={[
              styles.divider,
              {
                top: 469.83 * groupListScale,
                height: 2 * groupListScale,
              },
            ]}
          />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="清空目前所選"
            onPress={() => setDraftSelectedSymbols([])}
            style={({ pressed }) => [
              styles.cancelButton,
              {
                left: 128 * groupListScale,
                top: 494.83 * groupListScale,
                width: 80 * groupListScale,
                height: 40 * groupListScale,
                borderRadius: 10 * groupListScale,
              },
              pressed && styles.pressed,
            ]}
          >
            <Text
              pointerEvents="none"
              style={[
                styles.confirmText,
                {
                  fontSize: 20 * groupListScale,
                  lineHeight: 25 * groupListScale,
                },
              ]}
            >
              取消
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="儲存群組"
            accessibilityState={{ disabled: !draftSelectedSymbols.length }}
            disabled={!draftSelectedSymbols.length}
            onPress={handleConfirm}
            style={({ pressed }) => [
              styles.confirmButton,
              {
                left: 292 * groupListScale,
                top: 494.83 * groupListScale,
                width: 80 * groupListScale,
                height: 40 * groupListScale,
                borderRadius: 10 * groupListScale,
              },
              pressed && styles.pressed,
            ]}
          >
            <Text
              pointerEvents="none"
              style={[
                styles.confirmText,
                {
                  fontSize: 20 * groupListScale,
                  lineHeight: 25 * groupListScale,
                },
              ]}
            >
              儲存
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    elevation: 100,
  },
  dim: {
    ...StyleSheet.absoluteFillObject,
    // Match the dim layer used when the top-right Add menu is open.
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
  },
  modal: {
    position: 'relative',
    backgroundColor: '#B7B7B7',
    borderRadius: 10,
    overflow: 'hidden',
    zIndex: 1,
    elevation: 10,
  },
  closeButton: {
    position: 'absolute',
    left: 0,
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    elevation: 2,
  },
  closeBar: {
    position: 'absolute',
    backgroundColor: '#D9D9D9',
    borderRadius: 3,
    transform: [{ rotate: '45deg' }],
  },
  closeBarSecond: {
    transform: [{ rotate: '-45deg' }],
  },
  titleWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  title: {
    position: 'absolute',
    left: 0,
    right: 0,
    color: 'rgba(99, 96, 96, 0.8)',
    fontFamily: 'Goldman',
    fontWeight: '400',
    textAlign: 'center',
  },
  titleUnderline: {
    position: 'absolute',
    backgroundColor: '#747272',
  },
  titleInput: {
    padding: 0,
    outlineStyle: 'none',
  },
  groupItem: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    backgroundColor: '#979797',
  },
  groupItemSelected: {
    backgroundColor: '#727F99',
    borderWidth: 1.5,
    borderColor: '#D9D9D9',
  },
  groupItemText: {
    color: '#D9D9D9',
    fontFamily: 'Goldman',
    fontWeight: '400',
    textAlign: 'center',
  },
  groupItemTextSelected: {
    color: '#FFFFFF',
  },
  divider: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: 'rgba(46, 47, 46, 0.2)',
  },
  confirmButton: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(94, 110, 127, 0.7)',
  },
  cancelButton: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(94, 110, 127, 0.7)',
  },
  confirmText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontFamily: 'Goldman',
    fontWeight: '400',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.78,
  },
});
