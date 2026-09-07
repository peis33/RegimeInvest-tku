import React, { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AssetSvg from '../components/AssetSvg';
import StockDetail from './StockDetail';
import AddGroupMenu from '../components/AddGroupMenu';
import GroupListModal from '../components/GroupListModal';
import { TAB_BAR_STYLE } from '../components/TabBar';
import { useAppSettings } from '../context/AppSettingsContext';
import { getCustomGroupDisplayName } from '../utils/customGroups';

const ADD_IMAGE = require('../assets/image/add2.svg');
const MORE_IMAGE = require('../assets/image/more.svg');
const BACKGROUND_RED = require('../assets/image/background_red.svg');
const BACKGROUND_GREEN = require('../assets/image/background_green.svg');
const BACKGROUND_YELLOW = require('../assets/image/background_yellow.svg');

const BACKGROUNDS = {
  red: BACKGROUND_RED,
  green: BACKGROUND_GREEN,
  yellow: BACKGROUND_YELLOW,
};

const STOCKS = [
  { symbol: '2330', name: '台積電', tone: 'red', percent: 70 },
  { symbol: '2454', name: '聯發科', tone: 'yellow', percent: 50 },
  { symbol: '3034', name: '聯詠', tone: 'green', percent: 30 },
  { symbol: '2308', name: '台達電', tone: 'red', percent: 70 },
  { symbol: '2382', name: '廣達', tone: 'red', percent: 70 },
  { symbol: '2881', name: '富邦金', tone: 'yellow', percent: 50 },
  { symbol: '2303', name: '聯電', tone: 'green', percent: 30 },
  { symbol: '2317', name: '鴻海', tone: 'red', percent: 70 },
  { symbol: '2412', name: '中華電', tone: 'red', percent: 70 },
  { symbol: '2882', name: '國泰金', tone: 'yellow', percent: 50 },
  { symbol: '2886', name: '兆豐金', tone: 'green', percent: 30 },
  { symbol: '2891', name: '中信金', tone: 'red', percent: 70 },
  { symbol: '2002', name: '中鋼', tone: 'red', percent: 70 },
  { symbol: '2603', name: '長榮', tone: 'yellow', percent: 50 },
  { symbol: '1301', name: '台塑', tone: 'green', percent: 30 },
  { symbol: '2892', name: '第一金', tone: 'red', percent: 70 },
];

const INVESTOR_TITLES = {
  大戶: '大戶',
  中間戶: '中間戶',
  小股民: '小股民',
};

const INVESTOR_STOCKS = {
  大戶: [
    { symbol: '2330', name: '台積電', tone: 'red', percent: 70 },
    { symbol: '2454', name: '聯發科', tone: 'yellow', percent: 50 },
    { symbol: '3034', name: '聯詠', tone: 'green', percent: 30 },
    { symbol: '2308', name: '台達電', tone: 'red', percent: 70 },
  ],
  中間戶: [
    { symbol: '2303', name: '聯電', tone: 'green', percent: 30 },
    { symbol: '2382', name: '廣達', tone: 'red', percent: 70 },
    { symbol: '2317', name: '鴻海', tone: 'red', percent: 70 },
    { symbol: '2412', name: '中華電', tone: 'red', percent: 70 },
    { symbol: '2603', name: '長榮', tone: 'yellow', percent: 50 },
    { symbol: '1301', name: '台塑', tone: 'green', percent: 30 },
  ],
  小股民: [
    { symbol: '2881', name: '富邦金', tone: 'yellow', percent: 50 },
    { symbol: '2882', name: '國泰金', tone: 'yellow', percent: 50 },
    { symbol: '2886', name: '兆豐金', tone: 'green', percent: 30 },
    { symbol: '2891', name: '中信金', tone: 'red', percent: 70 },
    { symbol: '2002', name: '中鋼', tone: 'red', percent: 70 },
    { symbol: '2892', name: '第一金', tone: 'red', percent: 70 },
  ],
};

const CATEGORY_TITLES = {
  semiconductor: '半導體產業',
  ElectronicComponents: '電子零件產業',
  FinancialHolding: '金控產業',
};

const CATEGORY_STOCKS = {
  semiconductor: [
    { symbol: '2330', name: '台積電', tone: 'red', percent: 70 },
    { symbol: '2454', name: '聯發科', tone: 'yellow', percent: 50 },
    { symbol: '3034', name: '聯詠', tone: 'green', percent: 30 },
    { symbol: '2303', name: '聯電', tone: 'green', percent: 30 },
  ],
  ElectronicComponents: [
    { symbol: '2308', name: '台達電', tone: 'red', percent: 70 },
    { symbol: '2382', name: '廣達', tone: 'red', percent: 70 },
    { symbol: '2317', name: '鴻海', tone: 'red', percent: 70 },
  ],
  FinancialHolding: [
    { symbol: '2881', name: '富邦金', tone: 'yellow', percent: 50 },
    { symbol: '2882', name: '國泰金', tone: 'yellow', percent: 50 },
    { symbol: '2886', name: '兆豐金', tone: 'green', percent: 30 },
    { symbol: '2891', name: '中信金', tone: 'red', percent: 70 },
    { symbol: '2892', name: '第一金', tone: 'red', percent: 70 },
  ],
};

function StockCard({ stock, width, height, onPress }) {
  const scaleX = width / 218;
  const scaleY = height / 184;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${stock.symbol} ${stock.name}`}
      onPress={onPress}
      style={[styles.card, { width, height }]}
    >
      <AssetSvg
        asset={BACKGROUNDS[stock.tone]}
        width={width}
        height={height}
      />
      <Text
        style={[
          styles.cardSymbol,
          {
            top: 14 * scaleY,
            left: 22 * scaleX,
            width: 86 * scaleX,
            fontSize: Math.max(13, 17 * scaleX),
          },
        ]}
      >
        {stock.symbol}
      </Text>
      <Text
        style={[
          styles.cardName,
          {
            top: 62 * scaleY,
            left: 72 * scaleX,
            fontSize: Math.max(15, 20 * scaleX),
          },
        ]}
      >
        {stock.name}
      </Text>
      <Text
        style={[
          styles.cardPercent,
          {
            right: 34 * scaleX,
            bottom: 36 * scaleY,
            fontSize: Math.max(22, 32 * scaleX),
          },
        ]}
      >
        {stock.percent}%
      </Text>
    </Pressable>
  );
}

export default function Analyze({ route }) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const {
    customGroups,
    addCustomGroup,
    renameCustomGroup,
  } = useAppSettings();
  const [selectedStock, setSelectedStock] = useState(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showGroupList, setShowGroupList] = useState(false);
  const [draftGroupName, setDraftGroupName] = useState('');
  const [customGroupId, setCustomGroupId] = useState(
    route?.params?.customGroupId || null,
  );
  const [isEditingCustomGroupName, setIsEditingCustomGroupName] = useState(false);
  const [draftCustomGroupName, setDraftCustomGroupName] = useState('');
  const [investorType, setInvestorType] = useState(
    route?.params?.investorType && INVESTOR_STOCKS[route.params.investorType]
      ? route.params.investorType
      : null,
  );
  const [categoryId, setCategoryId] = useState(
    route?.params?.categoryId && CATEGORY_STOCKS[route.params.categoryId]
      ? route.params.categoryId
      : null,
  );
  const [addButtonLayout, setAddButtonLayout] = useState(null);
  const [moreButtonLayout, setMoreButtonLayout] = useState(null);

  const activeCustomGroup = customGroups.find((group) => group.id === customGroupId) || null;
  const isCustomGroup = Boolean(activeCustomGroup?.symbols?.length);
  const customGroupTitle = activeCustomGroup
    ? getCustomGroupDisplayName(activeCustomGroup, customGroups)
    : null;
  const pageTitle = investorType
    ? INVESTOR_TITLES[investorType]
    : categoryId
      ? CATEGORY_TITLES[categoryId]
      : isCustomGroup
        ? customGroupTitle
        : '各股';
  const visibleStocks = investorType
    ? INVESTOR_STOCKS[investorType]
    : categoryId
      ? CATEGORY_STOCKS[categoryId]
      : isCustomGroup
        ? STOCKS.filter((stock) => activeCustomGroup.symbols.includes(stock.symbol))
        : STOCKS;
  const categoryHeaderHeight = pageTitle
    ? Math.max(124, Math.min(184, screenWidth * 0.27 + 28))
    : undefined;

  useEffect(() => {
    navigation.setOptions({
      tabBarStyle: selectedStock ? { display: 'none' } : TAB_BAR_STYLE,
    });
  }, [navigation, selectedStock]);

  useEffect(() => {
    const nextCategoryId = route?.params?.categoryId;
    const nextInvestorType = route?.params?.investorType;
    const nextCustomGroupId = route?.params?.customGroup === true
      ? route?.params?.customGroupId || null
      : null;
    setCategoryId(
      nextCategoryId && CATEGORY_STOCKS[nextCategoryId]
        ? nextCategoryId
        : null,
    );
    setInvestorType(
      nextInvestorType && INVESTOR_STOCKS[nextInvestorType]
        ? nextInvestorType
        : null,
    );
    setCustomGroupId(nextCustomGroupId);
    setIsEditingCustomGroupName(false);
  }, [
    route?.params?.categoryId,
    route?.params?.investorType,
    route?.params?.customGroup,
    route?.params?.customGroupId,
  ]);

  const startEditingCustomGroupName = () => {
    if (!activeCustomGroup) return;
    setDraftCustomGroupName(activeCustomGroup.name || '');
    setIsEditingCustomGroupName(true);
  };

  const finishEditingCustomGroupName = () => {
    if (!activeCustomGroup || !isEditingCustomGroupName) return;
    renameCustomGroup(customGroupId, draftCustomGroupName);
    setIsEditingCustomGroupName(false);
  };

  const sidePad = Math.max(30, screenWidth * 0.09);
  const columnGap = Math.max(34, screenWidth * 0.12);
  const cardWidth = (screenWidth - sidePad * 2 - columnGap) / 2;
  const cardHeight = cardWidth * (184 / 218);
  const addSize = Math.min(74, Math.max(52, screenWidth * 0.13));
  const menuButtonWidth = Math.min(40, Math.max(36, screenWidth * 0.068));
  const headerButtonOffset = Math.max(20, screenWidth * 0.03);
  const categoryTitleOffset =
    headerButtonOffset + Math.max(4, screenWidth * 0.01);
  const categoryTitleSize = Math.max(
    28,
    Math.min(48, screenWidth * 0.086),
  );
  const gridColumns = Math.ceil(screenWidth / 48) + 1;
  const gridRows = Math.ceil(screenHeight / 48) + 1;

  useEffect(() => {
    // The header uses vertical centering, so changing from the default header
    // to a category header moves Add even when its own onLayout callback does
    // not fire again. Refresh only the Y coordinate when that mode changes.
    setAddButtonLayout((current) => {
      if (!current) return current;
      const buttonHeight = current.height || addSize * (76 / 74);
      const headerTopPadding = insets.top + (pageTitle ? 10 : 28);
      const headerBottomPadding = pageTitle ? 8 : 36;
      const headerHeight = pageTitle
        ? categoryHeaderHeight
        : headerTopPadding + buttonHeight + headerBottomPadding;
      const contentHeight = Math.max(
        0,
        headerHeight - headerTopPadding - headerBottomPadding,
      );
      const renderedY =
        headerTopPadding +
        Math.max(0, (contentHeight - buttonHeight) / 2) +
        headerButtonOffset;
      if (Math.abs(current.y - renderedY) < 0.5) return current;
      return { ...current, y: renderedY };
    });
  }, [
    addSize,
    categoryHeaderHeight,
    headerButtonOffset,
    insets.top,
    pageTitle,
  ]);

  return (
    <View style={styles.container}>
      <View pointerEvents="none" style={styles.gridBackdrop}>
        {Array.from({ length: gridColumns }).map((_, index) => (
          <View
            key={`vertical-${index}`}
            style={[styles.gridLineVertical, { left: index * 48 }]}
          />
        ))}
        {Array.from({ length: gridRows }).map((_, index) => (
          <View
            key={`horizontal-${index}`}
            style={[styles.gridLineHorizontal, { top: index * 48 }]}
          />
        ))}
      </View>

      <View
        style={[
          styles.header,
          pageTitle ? styles.categoryHeader : styles.defaultHeader,
          {
            paddingTop: insets.top + (pageTitle ? 10 : 28),
            paddingHorizontal: Math.max(16, screenWidth * 0.055),
            height: categoryHeaderHeight,
          },
        ]}
      >
        <View pointerEvents="none" style={styles.headerGridLayer}>
          {Array.from({ length: gridColumns }).map((_, index) => (
            <View
              key={`header-vertical-${index}`}
              style={[styles.gridLineVertical, { left: index * 48 }]}
            />
          ))}
          {Array.from({ length: gridRows }).map((_, index) => (
            <View
              key={`header-horizontal-${index}`}
              style={[styles.gridLineHorizontal, { top: index * 48 }]}
            />
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="更多"
          onLayout={(event) => {
            const { x, y, width, height } = event.nativeEvent.layout;
            setMoreButtonLayout({
              x,
              y: y + headerButtonOffset,
              width,
              height,
            });
          }}
          onPress={() => {
            setShowGroupList(false);
            setShowMoreMenu((current) => !current);
          }}
          style={[styles.moreButton, { transform: [{ translateY: headerButtonOffset }] }]}
        >
          <AssetSvg
            asset={MORE_IMAGE}
            width={menuButtonWidth}
            height={menuButtonWidth}
            pointerEvents="none"
          />
        </Pressable>
        {pageTitle ? (
          <View
            pointerEvents={activeCustomGroup ? 'box-none' : 'none'}
            style={[
              styles.categoryTitleWrap,
              { transform: [{ translateY: categoryTitleOffset }] },
            ]}
          >
            {activeCustomGroup && isEditingCustomGroupName ? (
              <TextInput
                accessibilityLabel="編輯客製群組名稱"
                autoFocus
                value={draftCustomGroupName}
                onChangeText={setDraftCustomGroupName}
                onSubmitEditing={finishEditingCustomGroupName}
                onBlur={finishEditingCustomGroupName}
                placeholder="未命名"
                placeholderTextColor="rgba(241, 241, 241, 0.7)"
                maxLength={24}
                returnKeyType="done"
                style={[
                  styles.categoryTitle,
                  styles.categoryTitleInput,
                  {
                    fontSize: categoryTitleSize,
                    lineHeight: categoryTitleSize + 8,
                  },
                ]}
              />
            ) : activeCustomGroup ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`編輯${pageTitle}`}
                onPress={startEditingCustomGroupName}
                style={styles.categoryTitleButton}
              >
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  style={[
                    styles.categoryTitle,
                    {
                      fontSize: categoryTitleSize,
                      lineHeight: categoryTitleSize + 8,
                    },
                  ]}
                >
                  {pageTitle}
                </Text>
              </Pressable>
            ) : (
              <Text
                style={[
                  styles.categoryTitle,
                  {
                    fontSize: categoryTitleSize,
                    lineHeight: categoryTitleSize + 8,
                  },
                ]}
              >
                {pageTitle}
              </Text>
            )}
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="新增"
          onLayout={(event) => {
            const { x, width, height } = event.nativeEvent.layout;
            const buttonHeight = height || addSize * (76 / 74);
            const headerTopPadding = insets.top + (pageTitle ? 10 : 28);
            const headerBottomPadding = pageTitle ? 8 : 36;
            const headerHeight = pageTitle
              ? categoryHeaderHeight
              : headerTopPadding + buttonHeight + headerBottomPadding;
            const contentHeight = Math.max(
              0,
              headerHeight - headerTopPadding - headerBottomPadding,
            );
            // onLayout reports the untransformed flex position. Calculate the
            // rendered position so the menu remains attached to the visible
            // lower-left corner when the category header changes height.
            const renderedY =
              headerTopPadding +
              Math.max(0, (contentHeight - buttonHeight) / 2) +
              headerButtonOffset;
            setAddButtonLayout({
              x,
              y: renderedY,
              width,
              height: buttonHeight,
            });
          }}
          onPress={() => {
            setShowGroupList(true);
            setDraftGroupName('');
          }}
          style={{ transform: [{ translateY: headerButtonOffset }] }}
        >
          <AssetSvg asset={ADD_IMAGE} width={addSize} height={addSize * (76 / 74)} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.grid,
          {
            paddingHorizontal: sidePad,
            // Keep the last red/yellow/green stock cards clear of the
            // absolute-positioned bottom navigation bar.
            paddingBottom: insets.bottom + 145,
            paddingTop: pageTitle ? 46 : 0,
            rowGap: pageTitle ? Math.max(28, screenWidth * 0.06) : 10,
          },
        ]}
      >
        {visibleStocks.map((stock) => (
          <StockCard
            key={`${stock.symbol}-${stock.name}`}
            stock={stock}
            width={cardWidth}
            height={cardHeight}
            onPress={() => setSelectedStock(stock)}
          />
        ))}
      </ScrollView>

      <AddGroupMenu
        variant="investor"
        includeCategories
        visible={showMoreMenu}
        onClose={() => setShowMoreMenu(false)}
        anchor={moreButtonLayout}
        selectedId={investorType}
        onSelect={(id) => {
          setCustomGroupId(null);
          if (CATEGORY_STOCKS[id]) {
            setCategoryId(id);
            setInvestorType(null);
            navigation.setParams({
              categoryId: id,
              investorType: null,
              customGroup: false,
              customGroupId: null,
            });
          } else if (INVESTOR_STOCKS[id]) {
            setCategoryId(null);
            setInvestorType(id);
            navigation.setParams({
              categoryId: null,
              investorType: id,
              customGroup: false,
              customGroupId: null,
            });
          }
          setShowMoreMenu(false);
        }}
      />

      <GroupListModal
        visible={showGroupList}
        onClose={() => setShowGroupList(false)}
        stocks={STOCKS}
        title="未命名"
        groupName={draftGroupName}
        onGroupNameChange={setDraftGroupName}
        selectedSymbols={[]}
        onConfirm={(symbols) => {
          const newCustomGroupId = addCustomGroup(symbols, draftGroupName);
          setCustomGroupId(newCustomGroupId);
          setCategoryId(null);
          setInvestorType(null);
          setShowGroupList(false);
          navigation.setParams({
            categoryId: null,
            investorType: null,
            customGroup: true,
            customGroupId: newCustomGroupId,
          });
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#2E2F2E',
  },
  gridBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    backgroundColor: '#2E2F2E',
  },
  gridLineVertical: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
  },
  gridLineHorizontal: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
    zIndex: 2,
  },
  moreButton: {
    alignItems: 'center',
    justifyContent: 'center',
    outlineStyle: 'none',
  },
  categoryHeader: {
    backgroundColor: 'rgba(89, 104, 119, 0.78)',
  },
  defaultHeader: {
    // Keep the fixed more/add controls visible without cards showing through
    // them while the stock grid is scrolled underneath the header.
    backgroundColor: '#2E2F2E',
    paddingBottom: 36,
  },
  headerGridLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  categoryTitleWrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryTitle: {
    color: '#F1F1F1',
    fontFamily: 'Goldman',
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '400',
  },
  categoryTitleButton: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryTitleInput: {
    padding: 0,
    outlineStyle: 'none',
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
    zIndex: 1,
  },
  stockDetailOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 220,
    elevation: 220,
  },
  card: {
    position: 'relative',
  },
  cardSymbol: {
    position: 'absolute',
    color: '#F5F5F5',
    fontFamily: 'Goldman',
    fontWeight: '400',
    textAlign: 'center',
  },
  cardName: {
    position: 'absolute',
    color: '#FFFFFF',
    fontFamily: 'Goldman',
    fontWeight: '400',
  },
  cardPercent: {
    position: 'absolute',
    color: '#FFFFFF',
    fontFamily: 'Goldman',
    fontWeight: '400',
    textAlign: 'right',
  },
});
