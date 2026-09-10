import React, { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PercentCircle from '../components/PercentCircle';
import AssetSvg from '../components/AssetSvg';
import StockDetail from './StockDetail';
import AddGroupMenu from '../components/AddGroupMenu';
import GroupListModal from '../components/GroupListModal';
import useViewportDimensions from '../hooks/useViewportDimensions';

const BACK_IMAGE = require('../assets/image/back.svg');
const ADD_IMAGE = require('../assets/image/add.svg');

const STOCKS = [
  { symbol: '2330', name: '台積電', weather: '☀️' },
  { symbol: '2454', name: '聯發科', weather: '☁️' },
  { symbol: '3034', name: '聯詠', weather: '🌧️' },
  { symbol: '2308', name: '台達電' },
  { symbol: '2382', name: '廣達' },
  { symbol: '2881', name: '富邦金' },
  { symbol: '2303', name: '聯電' },
  { symbol: '2317', name: '鴻海' },
  { symbol: '2412', name: '中華電' },
  { symbol: '2882', name: '國泰金' },
  { symbol: '2886', name: '兆豐金' },
  { symbol: '2891', name: '中信金' },
  { symbol: '2002', name: '中鋼' },
  { symbol: '2603', name: '長榮' },
  { symbol: '1301', name: '台塑' },
  { symbol: '2892', name: '第一金' },
];

const StockCircle = React.memo(function StockCircle({ stock, size, width, onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${stock.symbol} ${stock.name}`}
      onPress={onPress}
      style={[styles.stockCard, { width }]}
    >
      <View style={styles.stockTitleRow}>
        <Text style={styles.stockTitle} numberOfLines={1}>
          {stock.symbol} {stock.name}
        </Text>
        {stock.weather ? <Text style={styles.weather}>{stock.weather}</Text> : null}
      </View>
      <PercentCircle
        redPercent={50}
        size={size}
        strokeWidth={24}
        label=""
        valueText="-%"
        fontScale={0.2}
      />
    </Pressable>
  );
});

function CircleList({ onBack, style }) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useViewportDimensions();
  const [showGroupMenu, setShowGroupMenu] = useState(false);
  const [showGroupList, setShowGroupList] = useState(false);
  const [showStockGrid, setShowStockGrid] = useState(false);
  const [selectedStock, setSelectedStock] = useState(null);
  const [addButtonLayout, setAddButtonLayout] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => setShowStockGrid(true), 0);
    return () => clearTimeout(timer);
  }, []);

  const horizontalPadding = Math.max(28, screenWidth * 0.073);
  const columnGap = Math.max(22, screenWidth * 0.08);
  const columnWidth = (screenWidth - horizontalPadding * 2 - columnGap) / 2;
  const circleSize = Math.min(104, Math.max(92, columnWidth - 35));
  return (
    <View style={[styles.container, style, { width: screenWidth }]}>
      <View style={styles.body}>
      <View
        style={[
          styles.header,
          {
            height: insets.top + 57,
            paddingTop: insets.top + 18,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回首頁"
          onPress={() => (onBack ? onBack() : navigation.navigate('Home'))}
          style={styles.backButton}
        >
            <AssetSvg
              asset={BACK_IMAGE}
              width={38}
              height={19}
            />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="新增股票"
          onLayout={(event) => {
            const { x, y, width, height } = event.nativeEvent.layout;
            setAddButtonLayout({ x, y, width, height });
          }}
          onPress={() => {
            if (showGroupList) {
              setShowGroupList(false);
              setShowGroupMenu(true);
              return;
            }
            setShowGroupMenu((current) => !current);
          }}
          style={styles.addButton}
        >
          <AssetSvg asset={ADD_IMAGE} width={34} height={34} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.screenScroll}
        horizontal={false}
        bounces={false}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.grid,
          {
            width: screenWidth,
            paddingHorizontal: horizontalPadding,
            columnGap,
            paddingBottom: insets.bottom + 32,
          },
        ]}
      >
        {showStockGrid
          ? STOCKS.map((stock) => (
              <StockCircle
                key={stock.symbol}
                stock={stock}
                size={circleSize}
                width={columnWidth}
                onPress={() => setSelectedStock(stock)}
              />
            ))
          : null}
      </ScrollView>
      </View>
      <GroupListModal
        visible={showGroupList}
        onClose={() => setShowGroupList(false)}
        stocks={STOCKS}
      />
      <AddGroupMenu
        visible={showGroupMenu}
        onClose={() => setShowGroupMenu(false)}
        anchor={addButtonLayout}
        onSelect={(id) => {
          if (id === 'group') {
            setShowGroupMenu(false);
            setShowGroupList(true);
            return;
          }
          setShowGroupMenu(false);
          onBack?.();
          navigation.navigate('Analyze', { categoryId: id });
        }}
      />

      {selectedStock ? (
        <StockDetail
          stock={selectedStock}
          onBack={() => setSelectedStock(null)}
          style={styles.stockDetailOverlay}
        />
      ) : null}
    </View>
  );
}

export default React.memo(CircleList);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#2E2F2E',
  },
  screenScroll: {
    flex: 1,
    width: '100%',
  },
  body: {
    flex: 1,
  },
  header: {
    paddingLeft: 21,
    paddingRight: 18,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    backgroundColor: '#2E2F2E',
    position: 'relative',
    zIndex: 20,
    elevation: 20,
  },
  backButton: {
    width: 38,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {
    width: 34,
    height: 34,
    marginTop: -2,
    zIndex: 2,
  },
  groupMenuBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.14)',
    zIndex: 5,
    elevation: 5,
  },
  groupMenu: {
    position: 'absolute',
    zIndex: 10,
    elevation: 10,
    padding: 0,
    margin: 0,
    gap: 0,
    rowGap: 0,
    backgroundColor: 'rgba(220, 220, 220, 0.74)',
    overflow: 'hidden',
  },
  groupButton: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    margin: 0,
    borderWidth: 0,
    backgroundColor: 'rgba(220, 220, 220, 0.74)',
  },
  stockDetailOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 220,
    elevation: 220,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 36,
    alignItems: 'flex-start',
    paddingTop: 27,
  },
  stockCard: {
    height: 131,
    alignItems: 'center',
  },
  stockTitleRow: {
    width: '100%',
    height: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  stockTitle: {
    flex: 1,
    fontFamily: 'Goldman',
    color: '#F2F2F2',
    fontSize: 14,
    lineHeight: 20,
  },
  weather: {
    fontFamily: 'Goldman',
    width: 28,
    height: 28,
    marginLeft: 3,
    borderWidth: 1,
    borderColor: '#5E5E5E',
    borderRadius: 7,
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 16,
    lineHeight: 26,
    overflow: 'hidden',
  },
});
