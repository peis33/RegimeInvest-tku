import React, { useEffect, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AssetSvg from '../components/AssetSvg';
import { PerformanceComparisonChart } from '../components/StockCharts';
import { useAppSettings } from '../context/AppSettingsContext';
import {
  fetchLatestInvestment,
  fetchLatestStockDetail,
  fetchLatestStockCharts,
} from '../services/investmentApi';
import useViewportDimensions from '../hooks/useViewportDimensions';

const BACK_IMAGE = require('../assets/image/back.svg');
const COMPARE_BOX_IMAGE = require('../assets/image/CompareBox.svg');
const COMPARE_BOX_START_IMAGE = require('../assets/image/CompareBox_start.svg');

// 這裡只提供可搜尋的股票代號與名稱；價格、報酬及配置數字全部來自後端。
const STOCK_OPTIONS = [
  ['2330', '台積電'],
  ['2454', '聯發科'],
  ['2308', '台達電'],
  ['3034', '聯詠'],
  ['2382', '廣達'],
  ['2881', '富邦金'],
  ['2303', '聯電'],
  ['2317', '鴻海'],
  ['2412', '中華電'],
  ['2882', '國泰金'],
  ['2886', '兆豐金'],
  ['2891', '中信金'],
  ['2002', '中鋼'],
  ['2603', '長榮'],
  ['1301', '台塑'],
  ['2892', '第一金'],
].map(([symbol, name]) => ({ symbol, name }));

const COMPARISON_METRICS = [
  { key: 'close', label: '收盤價', digits: 2 },
  { key: 'turnoverRate', label: '週轉率', suffix: '%', digits: 2 },
  { key: 'volume', label: '成交量', suffix: '千股', digits: 0 },
  { key: 'rank', label: '候選排行', emptyText: '未入選' },
  { key: 'weight', label: '組合占比', suffix: '%', digits: 0, emptyText: '未配置' },
  { key: 'allocation', label: '分配金額', digits: 0, emptyText: '未配置' },
];

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeSymbol(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const numeric = Number(text);
  return Number.isFinite(numeric) && Number.isInteger(numeric)
    ? String(numeric)
    : text.toUpperCase();
}

function formatNumber(value, maximumFractionDigits = 0) {
  const number = toNumber(value);
  if (number === null) return '--';

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits,
  }).format(number);
}

function formatSigned(value, maximumFractionDigits = 0) {
  const number = toNumber(value);
  if (number === null) return '--';
  const formatted = formatNumber(Math.abs(number), maximumFractionDigits);
  return number > 0 ? `+${formatted}` : number < 0 ? `-${formatted}` : formatted;
}

function formatPercent(value) {
  const number = toNumber(value);
  if (number === null) return '--';
  return `${number > 0 ? '+' : ''}${formatNumber(number, 2)}%`;
}

function getPortfolioWeight(row) {
  const rawWeight =
    row?.final_weight_percent ??
    row?.finalWeightPercent ??
    row?.weight_percent ??
    row?.weight;
  const weight = toNumber(rawWeight);
  if (weight === null) return null;
  return Math.abs(weight) <= 1 ? weight * 100 : weight;
}

function getRowSymbol(row) {
  return normalizeSymbol(row?.stock_id ?? row?.symbol);
}

function isCashRow(row) {
  const assetType = String(row?.asset_type || row?.assetType || '').toLowerCase();
  const symbol = getRowSymbol(row);
  return assetType === 'cash' || symbol === 'CASH' || symbol === '現金';
}

function getAllocationInfo(detail, investment) {
  const rows = Array.isArray(investment?.portfolio)
    ? investment.portfolio.filter((row) => !isCashRow(row))
    : [];
  const activeRows = rows
    .map((row) => ({ ...row, weight: getPortfolioWeight(row) }))
    .filter((row) => row.weight !== null && row.weight > 0)
    .sort((left, right) => right.weight - left.weight);
  const selectedRow = rows.find((row) => getRowSymbol(row) === normalizeSymbol(detail?.symbol));
  const activeIndex = activeRows.findIndex(
    (row) => getRowSymbol(row) === normalizeSymbol(detail?.symbol),
  );
  const budget = toNumber(
    investment?.profile?.budget ?? investment?.profile?.investment_budget,
  );
  const rowWeight = getPortfolioWeight(selectedRow);
  const allocation = toNumber(
    selectedRow?.allocated_amount ?? selectedRow?.allocatedAmount,
  ) ?? (budget !== null && rowWeight !== null ? (budget * rowWeight) / 100 : null);

  return {
    rank: activeIndex >= 0 ? activeIndex + 1 : null,
    weight: rowWeight,
    allocation,
    isCandidate: Boolean(selectedRow && rowWeight !== null && rowWeight > 0),
  };
}

function buildComparisonData(detail, investment, chartData = null) {
  const close = toNumber(detail?.close);
  const change = toNumber(detail?.change);
  const previousClose = close !== null && change !== null ? close - change : null;
  const returnPercent =
    previousClose !== null && previousClose !== 0 && change !== null
      ? (change / previousClose) * 100
      : null;
  const allocation = getAllocationInfo(detail, investment);

  return {
    detail,
    chartData,
    returnPercent,
    allocation,
    metrics: {
      close,
      turnoverRate: toNumber(detail?.turnoverRate),
      volume: toNumber(detail?.volume),
      rank: allocation.rank === null ? null : `#${allocation.rank}`,
      weight: allocation.isCandidate ? allocation.weight : null,
      allocation: allocation.isCandidate ? allocation.allocation : null,
    },
  };
}

function resolveStock(value) {
  const rawValue = String(value || '').trim();
  const normalized = normalizeSymbol(rawValue);
  const firstToken = normalizeSymbol(rawValue.split(/\s+/)[0]);
  if (!normalized && !firstToken) return null;

  return (
    STOCK_OPTIONS.find((stock) => normalizeSymbol(stock.symbol) === normalized) ||
    STOCK_OPTIONS.find((stock) => normalizeSymbol(stock.symbol) === firstToken) ||
    STOCK_OPTIONS.find((stock) => stock.name === rawValue) ||
    null
  );
}

function getSuggestions(value) {
  const query = String(value || '').trim().toLowerCase();
  if (!query) return STOCK_OPTIONS.slice(0, 8);

  return STOCK_OPTIONS.filter(
    (stock) => stock.symbol.includes(query) || stock.name.toLowerCase().includes(query),
  ).slice(0, 8);
}

function StockInputSlot({
  value,
  index,
  width,
  scale = 1,
  active,
  onFocus,
  onChange,
  onSelect,
}) {
  const suggestions = getSuggestions(value);
  const slotHeight = width / 2;
  const inputLeft = width * (0.5 / 264);
  const inputTop = slotHeight * (39.4731 / 132);
  const inputWidth = width * (239.986 / 264);
  const inputHeight = slotHeight * (63.225 / 132);
  const codeLeft = width * (11 / 264);
  const codeTop = slotHeight * (11 / 132);
  const codeWidth = width * (112 / 264);
  const codeHeight = slotHeight * (25 / 132);

  return (
    <View style={[styles.slotColumn, { width, zIndex: active ? 20 : 1 }]}>
      <View style={[styles.slot, { width, height: slotHeight }]}>
        <AssetSvg
          asset={COMPARE_BOX_IMAGE}
          width={width}
          height={slotHeight}
          pointerEvents="none"
          style={StyleSheet.absoluteFillObject}
        />
        <View
          style={[
            styles.slotCodeOverlay,
            {
              left: codeLeft,
              top: codeTop,
              width: codeWidth,
              height: codeHeight,
            },
          ]}
        >
          <Text style={[styles.slotCodeText, { fontSize: 13 * scale }]}>
            {resolveStock(value)?.symbol || ''}
          </Text>
        </View>
        <TextInput
          accessibilityLabel={`輸入第 ${index + 1} 支股票`}
          value={value}
          onFocus={onFocus}
          onChangeText={onChange}
          placeholder="輸入股票名稱或代碼"
          placeholderTextColor="#9B9B9B"
          autoCapitalize="characters"
          style={[
            styles.slotInput,
            {
              left: inputLeft,
              top: inputTop,
              width: inputWidth,
              height: inputHeight,
              paddingHorizontal: 10 * scale,
              fontSize: 14 * scale,
            },
          ]}
        />
      </View>
      {active && String(value || '').trim() ? (
        <View style={[styles.suggestionList, { width: inputWidth, top: slotHeight + 4 * scale, maxHeight: 230 * scale }]}>
          {suggestions.map((stock) => (
            <Pressable
              key={stock.symbol}
              accessibilityRole="button"
              accessibilityLabel={`${stock.symbol} ${stock.name}`}
              onPress={() => onSelect(stock)}
              style={[styles.suggestionItem, { minHeight: 28 * scale, paddingHorizontal: 12 * scale }]}
            >
              <Text style={[styles.suggestionText, { fontSize: 13 * scale }]}>{stock.symbol} {stock.name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function CompareGroup({
  group,
  index,
  rowWidth,
  slotWidth,
  panelPadding,
  scale,
  loading,
  onUpdateSlot,
  onSelectSlot,
  onStart,
  onDelete,
}) {
  const [activeSlot, setActiveSlot] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const translateX = React.useRef(new Animated.Value(0)).current;
  const startX = React.useRef(0);
  const deleteWidth = 74 * scale;
  const activeValue = String(group[activeSlot] || '').trim();
  const activeSuggestions = activeValue ? getSuggestions(activeValue) : [];
  const showSuggestions = activeSuggestions.length > 0;
  const suggestionHeight = Math.min(
    230,
    activeSuggestions.length * 28 + Math.max(activeSuggestions.length - 1, 0),
  ) * scale;
  const startMarginTop = showSuggestions
    ? (4 * scale) + suggestionHeight + (8 * scale)
    : 22 * scale;

  const animateRow = (toValue, nextOpen) => {
    setDeleteOpen(nextOpen);
    Animated.spring(translateX, {
      toValue,
      useNativeDriver: false,
      bounciness: 0,
      speed: 24,
    }).start();
  };

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          const horizontalMove = Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.15;
          const enoughMove = Math.abs(gestureState.dx) > 8;
          return horizontalMove && enoughMove && (gestureState.dx < 0 || deleteOpen);
        },
        onPanResponderGrant: () => {
          startX.current = deleteOpen ? -deleteWidth : 0;
        },
        onPanResponderMove: (_, gestureState) => {
          const nextX = Math.max(
            -deleteWidth,
            Math.min(0, startX.current + gestureState.dx),
          );
          translateX.setValue(nextX);
        },
        onPanResponderRelease: (_, gestureState) => {
          const finalX = startX.current + gestureState.dx;
          if (finalX < -deleteWidth * 0.45) {
            animateRow(-deleteWidth, true);
          } else {
            animateRow(0, false);
          }
        },
        onPanResponderTerminate: () => {
          animateRow(deleteOpen ? -deleteWidth : 0, deleteOpen);
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [deleteOpen, deleteWidth, translateX],
  );

  return (
    <View
      style={[
        styles.compareSwipeRow,
        {
          width: rowWidth,
          borderRadius: 16 * scale,
          marginBottom: 18 * scale,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`刪除第 ${index + 1} 組比較`}
        onPress={onDelete}
        style={[styles.compareDeleteAction, { width: deleteWidth }]}
      >
        <Text style={[styles.compareDeleteText, { fontSize: 21 * scale, lineHeight: 30 * scale }]}>
          {'刪\n除'}
        </Text>
      </Pressable>

      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.compareSwipeForeground,
          {
            width: rowWidth,
            paddingVertical: 20 * scale,
            paddingHorizontal: panelPadding,
            borderRadius: 16 * scale,
            transform: [{ translateX }],
          },
        ]}
      >
        <View style={[styles.slotsRow, { gap: 10 * scale }]}>
          {group.map((value, slotIndex) => (
            <StockInputSlot
              key={slotIndex}
              value={value}
              index={slotIndex}
              width={slotWidth}
              scale={scale}
              active={activeSlot === slotIndex}
              onFocus={() => setActiveSlot(slotIndex)}
              onChange={(nextValue) => onUpdateSlot(slotIndex, nextValue)}
              onSelect={(stock) => onSelectSlot(slotIndex, stock)}
            />
          ))}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`開始第 ${index + 1} 組比較`}
          onPress={onStart}
          disabled={loading}
          style={[
            styles.startButton,
            {
              width: 150 * scale,
              height: 36 * scale,
              marginTop: startMarginTop,
              borderRadius: 24 * scale,
            },
            loading ? styles.disabledButton : null,
          ]}
        >
          <Text style={[styles.startText, { fontSize: 16 * scale }]}>
            {loading ? '讀取中' : 'START'}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

function StockResultCard({ data, width }) {
  const changeTone = data.returnPercent > 0 ? styles.riseText : styles.fallText;
  const height = width * (132 / 268);
  const codeLeft = width * (11 / 268);
  const codeTop = height * (11 / 132);
  const codeWidth = width * (112 / 268);
  const codeHeight = height * (25 / 132);
  const bodyLeft = width * (14 / 268);
  const bodyTop = height * (44 / 132);
  const bodyWidth = width * (222 / 268);
  const bodyHeight = height * (48 / 132);

  return (
    <View style={[styles.resultStockCard, { width, height }]}>
      <AssetSvg
        asset={COMPARE_BOX_START_IMAGE}
        width={width}
        height={height}
        pointerEvents="none"
        style={StyleSheet.absoluteFillObject}
      />
      <View
        style={[
          styles.resultCodeOverlay,
          {
            left: codeLeft,
            top: codeTop,
            width: codeWidth,
            height: codeHeight,
          },
        ]}
      >
        <Text style={styles.resultCodeText}>{data.detail.symbol}</Text>
      </View>
      <View
        style={[
          styles.resultBodyOverlay,
          {
            left: bodyLeft,
            top: bodyTop,
            width: bodyWidth,
            height: bodyHeight,
          },
        ]}
      >
        <Text numberOfLines={1} style={styles.resultStockName}>
          {data.detail.name}
        </Text>
        <Text style={[styles.resultStockReturn, changeTone]}>
          {data.returnPercent === null ? '--' : `${data.returnPercent > 0 ? '▲' : '▼'} ${formatPercent(Math.abs(data.returnPercent))}`}
        </Text>
      </View>
    </View>
  );
}

function MetricValue({ value, suffix, digits = 0, emptyText = '--', muted = false }) {
  let text = emptyText;
  if (typeof value === 'string') {
    text = value;
  } else if (value !== null && value !== undefined) {
    text = `${formatNumber(value, digits)}${suffix || ''}`;
  }

  return <Text style={[styles.metricValue, muted ? styles.mutedText : null]}>{text}</Text>;
}

function InstitutionCard({ data, width }) {
  const detail = data.detail;
  const values = [
    ['外資買賣超', detail.foreignNet],
    ['投信買賣超', detail.investmentTrustNet],
    ['自營商買賣超', detail.dealerNet],
  ];

  return (
    <View style={[styles.institutionCard, { width }]}>
      <Text style={styles.institutionTitle}>{detail.symbol} {detail.name}</Text>
      {values.map(([label, value]) => {
        const number = toNumber(value);
        return (
          <View key={label} style={styles.institutionRow}>
            <Text style={styles.institutionLabel}>{label}</Text>
            <Text style={[styles.institutionValue, number !== null && number > 0 ? styles.riseText : styles.fallText]}>
              {formatSigned(number)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export default function Compare() {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useViewportDimensions();
  const {
    investmentResult,
    compareGroups,
    addCompareGroup,
    updateCompareGroupSlot,
    removeCompareGroup: removePersistedCompareGroup,
  } = useAppSettings();
  const uiScale = Math.min(Math.max(screenWidth / 421, 0.85), 1.35);
  // The reference header places the title and back control below the status
  // bar area.  Keep the whole header content shift consistent on phones.
  const headerContentOffset = 20 * uiScale;
  const [latestInvestment, setLatestInvestment] = useState(null);
  const [addCompareLayout, setAddCompareLayout] = useState(null);
  const [started, setStarted] = useState(false);
  const [comparison, setComparison] = useState(null);
  const [loadingGroup, setLoadingGroup] = useState(null);
  const [error, setError] = useState(null);

  const investment = investmentResult || latestInvestment;

  useEffect(() => {
    if (investmentResult) {
      setLatestInvestment(investmentResult);
      return undefined;
    }

    let active = true;
    fetchLatestInvestment()
      .then((result) => {
        if (active) setLatestInvestment(result);
      })
      .catch(() => {
        // Compare 仍可使用個股 API；沒有投資配置時只顯示未配置。
      });

    return () => {
      active = false;
    };
  }, [investmentResult]);

  const panelMargin = 14 * uiScale;
  const panelPadding = 14 * uiScale;
  const panelInnerWidth = screenWidth - (panelMargin * 2) - (panelPadding * 2);
  const slotWidth = Math.max(100 * uiScale, (panelInnerWidth - 10 * uiScale) / 2);
  const resultCardWidth = Math.max(132 * uiScale, (screenWidth - 56 * uiScale) / 2);
  const contentMinHeight = Math.max(screenHeight, 900 * uiScale);
  const bottomNavigationReservedHeight = Math.max(insets.bottom, 18) + 8 + 62;
  const bottomNavigationContentGap = 20 * uiScale;
  const hasThirdCompareGroup = compareGroups.length >= 3;
  const selectionContentMinHeight = hasThirdCompareGroup
    ? screenHeight + bottomNavigationContentGap
    : screenHeight;
  const addCompareBottomPadding = addCompareLayout
    ? Math.max(
        0,
        addCompareLayout.y + addCompareLayout.height
          - (screenHeight - bottomNavigationReservedHeight - bottomNavigationContentGap),
      )
    : hasThirdCompareGroup ? bottomNavigationContentGap : 0;

  const updateGroupSlot = (groupId, slotIndex, value) => {
    updateCompareGroupSlot(groupId, slotIndex, value);
    setError(null);
  };

  const selectGroupStock = (groupId, slotIndex, stock) => {
    updateGroupSlot(groupId, slotIndex, `${stock.symbol} ${stock.name}`);
  };

  const removeCompareGroup = (groupId) => {
    removePersistedCompareGroup(groupId);
    setLoadingGroup((current) => (current === groupId ? null : current));
    setError(null);
  };

  const startComparison = async (groupId) => {
    const group = compareGroups.find((currentGroup) => currentGroup.id === groupId);
    const [first, second] = group?.slots?.map((value) => resolveStock(value)) || [];
    if (!first || !second) {
      setError('請先選擇兩支股票');
      return;
    }
    if (first.symbol === second.symbol) {
      setError('兩個欄位不能選擇同一支股票');
      return;
    }

    setLoadingGroup(groupId);
    setError(null);
    try {
      const [firstResponse, secondResponse] = await Promise.all([
        fetchLatestStockDetail(first.symbol),
        fetchLatestStockDetail(second.symbol),
      ]);
      const [firstChartResponse, secondChartResponse] = await Promise.all([
        fetchLatestStockCharts(first.symbol).catch(() => null),
        fetchLatestStockCharts(second.symbol).catch(() => null),
      ]);
      setComparison([
        buildComparisonData(firstResponse?.data, investment, firstChartResponse?.data),
        buildComparisonData(secondResponse?.data, investment, secondChartResponse?.data),
      ]);
      setStarted(true);
    } catch (requestError) {
      setError(requestError?.message || '無法取得股票比較資料');
    } finally {
      setLoadingGroup((current) => (current === groupId ? null : current));
    }
  };

  const goBackToSelection = () => {
    setStarted(false);
    setComparison(null);
    setError(null);
  };

  if (started && comparison) {
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
            minHeight: contentMinHeight,
            paddingBottom: insets.bottom + 92,
          }}
        >
          <View style={[styles.resultPage, { minHeight: 900 * uiScale }]}>
            <View style={[styles.header, { height: 118 * uiScale }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="返回股票選擇"
                onPress={goBackToSelection}
                style={[styles.backButton, { left: 18 * uiScale, top: 60 * uiScale, padding: 4 * uiScale }]}
              >
                <AssetSvg
                  asset={BACK_IMAGE}
                  width={38 * uiScale}
                  height={38 * uiScale}
                  pointerEvents="none"
                />
              </Pressable>
              <Text
                style={[
                  styles.headerTitle,
                  {
                    fontSize: 30 * uiScale,
                    lineHeight: 38 * uiScale,
                    transform: [{ translateY: headerContentOffset }],
                  },
                ]}
              >
                對比
              </Text>
            </View>

            <View style={styles.resultCardsRow}>
              {comparison.map((data) => (
                <StockResultCard key={data.detail.symbol} data={data} width={resultCardWidth} />
              ))}
            </View>

            <View style={styles.resultChartWrap}>
              <PerformanceComparisonChart
                series={comparison.map((data) => ({
                  symbol: data.detail.symbol,
                  name: data.detail.name,
                  points: data.chartData?.points,
                }))}
                width={screenWidth - 44}
              />
            </View>

            <View style={styles.comparisonPanel}>
              <View style={styles.comparisonHeaderBlock}>
                <View style={styles.comparisonPanelHeader}>
                  <Text style={styles.comparisonHeaderSide}>{comparison[0].detail.symbol} {comparison[0].detail.name}</Text>
                  <View style={styles.comparisonHeaderCenter} />
                  <Text style={[styles.comparisonHeaderSide, styles.rightText]}>{comparison[1].detail.symbol} {comparison[1].detail.name}</Text>
                </View>
                <View style={styles.candidateRow}>
                  <View style={styles.candidateCell}>
                    <Text style={[styles.candidateTag, comparison[0].allocation.isCandidate ? styles.candidate : styles.notCandidate]}>
                      {comparison[0].allocation.isCandidate ? '系統候選股' : '非候選股'}
                    </Text>
                  </View>
                  <View style={styles.comparisonCenterSpacer} />
                  <View style={styles.candidateCell}>
                    <Text style={[styles.candidateTag, comparison[1].allocation.isCandidate ? styles.candidate : styles.notCandidate]}>
                      {comparison[1].allocation.isCandidate ? '系統候選股' : '非候選股'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.comparisonHeaderCenterOverlay}>對比內容</Text>
              </View>

              <View style={styles.comparisonMetrics}>
                {COMPARISON_METRICS.map((metric) => (
                  <View key={metric.key} style={styles.metricRow}>
                    <MetricValue
                      value={comparison[0].metrics[metric.key]}
                      suffix={metric.suffix}
                      digits={metric.digits}
                      emptyText={metric.emptyText}
                      muted={comparison[0].metrics[metric.key] === null}
                    />
                    <Text style={styles.metricLabel}>{metric.label}</Text>
                    <MetricValue
                      value={comparison[1].metrics[metric.key]}
                      suffix={metric.suffix}
                      digits={metric.digits}
                      emptyText={metric.emptyText}
                      muted={comparison[1].metrics[metric.key] === null}
                    />
                  </View>
                ))}
              </View>
            </View>

            <Text style={styles.institutionHeading}>三大法人</Text>
            <View style={styles.institutionRowPair}>
              {comparison.map((data) => (
                <InstitutionCard key={data.detail.symbol} data={data} width={resultCardWidth} />
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { width: screenWidth }]}>
      <ScrollView
        style={styles.screenScroll}
        horizontal={false}
        bounces={false}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          width: screenWidth,
          // 第三組開始固定保留一小段可捲動高度，確保內容不會被導覽列擋住。
          minHeight: selectionContentMinHeight,
          paddingBottom: Math.max(
            addCompareBottomPadding,
            hasThirdCompareGroup ? bottomNavigationContentGap : 0,
          ),
        }}
      >
        <View style={styles.selectionPage}>
          <View style={[styles.header, { height: 118 * uiScale }]}>
            <Text
              style={[
                styles.headerTitle,
                {
                  fontSize: 30 * uiScale,
                  lineHeight: 38 * uiScale,
                  transform: [{ translateY: headerContentOffset }],
                },
              ]}
            >
              對比
            </Text>
          </View>
          <View style={[styles.selectionSubtitle, { height: 47 * uiScale }]}>
            <Text style={[styles.subtitleText, { fontSize: 16 * uiScale }]}>最多比較兩股</Text>
          </View>

          <View
            style={[
              styles.compareGroupsContainer,
              {
                marginTop: 26 * uiScale,
                marginHorizontal: panelMargin,
              },
            ]}
          >
            {compareGroups.map((group, index) => (
              <CompareGroup
                key={group.id}
                group={group.slots}
                index={index}
                rowWidth={screenWidth - panelMargin * 2}
                slotWidth={slotWidth}
                panelPadding={panelPadding}
                scale={uiScale}
                loading={loadingGroup === group.id}
                onUpdateSlot={(slotIndex, value) => updateGroupSlot(group.id, slotIndex, value)}
                onSelectSlot={(slotIndex, stock) => selectGroupStock(group.id, slotIndex, stock)}
                onStart={() => startComparison(group.id)}
                onDelete={() => removeCompareGroup(group.id)}
              />
            ))}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="新增比較"
            onPress={() => {
              addCompareGroup();
              setError(null);
            }}
            style={[
              styles.addCompareButton,
              {
                height: 74 * uiScale,
                marginHorizontal: panelMargin,
                marginTop: 18 * uiScale,
                borderRadius: 14 * uiScale,
              },
            ]}
            onLayout={(event) => {
              const nextLayout = event.nativeEvent.layout;
              setAddCompareLayout((current) => {
                if (
                  current
                  && Math.abs(current.y - nextLayout.y) < 0.5
                  && Math.abs(current.height - nextLayout.height) < 0.5
                ) {
                  return current;
                }
                return nextLayout;
              });
            }}
          >
            <Text style={[styles.addCompareText, { fontSize: 26 * uiScale }]}>+</Text>
          </Pressable>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
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
  selectionPage: {
    backgroundColor: '#2E2F2E',
  },
  resultPage: {
    flex: 1,
    minHeight: 900,
    backgroundColor: '#2E2F2E',
  },
  header: {
    height: 118,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#596674',
  },
  headerTitle: {
    color: '#F1F1F1',
    fontFamily: 'Goldman',
    fontSize: 30,
    lineHeight: 38,
  },
  backButton: {
    position: 'absolute',
    left: 18,
    top: 40,
    padding: 4,
  },
  selectionSubtitle: {
    height: 47,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#212121',
  },
  subtitleText: {
    color: '#F1F1F1',
    fontFamily: 'Goldman',
    fontSize: 16,
  },
  compareGroupsContainer: {
    alignItems: 'center',
  },
  compareSwipeRow: {
    position: 'relative',
    width: '100%',
    overflow: 'hidden',
    borderRadius: 10,
  },
  compareSwipeForeground: {
    position: 'relative',
    zIndex: 1,
    backgroundColor: '#212121',
  },
  compareDeleteAction: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#B54247',
  },
  compareDeleteText: {
    color: '#FFFFFF',
    fontFamily: 'Goldman',
    fontSize: 21,
    lineHeight: 30,
    textAlign: 'center',
  },
  slotsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  slotColumn: {
    position: 'relative',
    alignItems: 'center',
  },
  slot: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  slotCodeOverlay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotCodeText: {
    color: '#F1F1F1',
    fontFamily: 'Goldman',
    fontSize: 13,
    textAlign: 'center',
  },
  slotInput: {
    position: 'absolute',
    margin: 0,
    paddingHorizontal: 10,
    borderWidth: 0,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
    color: '#F1F1F1',
    fontFamily: 'Goldman',
    fontSize: 14,
    outlineStyle: 'none',
    textAlign: 'center',
  },
  suggestionList: {
    position: 'absolute',
    top: 119,
    maxHeight: 230,
    overflow: 'hidden',
    borderRadius: 8,
    backgroundColor: '#4B4B4B',
    zIndex: 30,
  },
  suggestionItem: {
    minHeight: 28,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.16)',
  },
  suggestionText: {
    color: '#FFFFFF',
    fontFamily: 'Goldman',
    fontSize: 13,
  },
  startButton: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    width: 150,
    height: 42,
    marginTop: 30,
    borderRadius: 24,
    backgroundColor: '#8EA6BD',
    boxShadow: '3px 4px 4px rgba(0, 0, 0, 0.35)',
  },
  disabledButton: {
    opacity: 0.65,
  },
  startText: {
    color: '#FFFFFF',
    fontFamily: 'Goldman',
    fontSize: 16,
  },
  addCompareButton: {
    height: 78,
    marginHorizontal: 14,
    marginTop: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(183, 183, 183, 0.5)',
    backgroundColor: '#222322',
  },
  addCompareText: {
    color: '#F1F1F1',
    fontFamily: 'Goldman',
    fontSize: 26,
  },
  errorText: {
    marginTop: 16,
    color: '#FF8585',
    fontFamily: 'Goldman',
    fontSize: 14,
    textAlign: 'center',
  },
  resultCardsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginHorizontal: 22,
    marginTop: 24,
  },
  resultStockCard: {
    position: 'relative',
  },
  resultCodeOverlay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultCodeText: {
    color: '#F1F1F1',
    fontFamily: 'Goldman',
    fontSize: 14,
    textAlign: 'center',
  },
  resultBodyOverlay: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  resultStockName: {
    flex: 1,
    color: '#F1F1F1',
    fontFamily: 'Goldman',
    fontSize: 16,
  },
  resultStockReturn: {
    marginLeft: 5,
    fontFamily: 'Goldman',
    fontSize: 12,
  },
  resultChartWrap: {
    marginHorizontal: 22,
    marginTop: 20,
  },
  riseText: {
    color: '#FF5858',
  },
  fallText: {
    color: '#7FF36A',
  },
  comparisonPanel: {
    marginHorizontal: 22,
    marginTop: 18,
    paddingBottom: 15,
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  comparisonHeaderBlock: {
    position: 'relative',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: '#212121',
  },
  comparisonPanelHeader: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
  },
  comparisonHeaderSide: {
    flex: 1,
    color: '#F1F1F1',
    fontFamily: 'Goldman',
    fontSize: 12,
    textAlign: 'center',
  },
  comparisonHeaderCenter: {
    width: 72,
  },
  comparisonHeaderCenterOverlay: {
    position: 'absolute',
    top: 17,
    left: 0,
    right: 0,
    color: '#C8C8C8',
    fontFamily: 'Goldman',
    fontSize: 12,
    textAlign: 'center',
  },
  rightText: {
    textAlign: 'center',
  },
  candidateRow: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: -8,
    paddingHorizontal: 13,
  },
  candidateCell: {
    flex: 1,
    alignItems: 'center',
  },
  comparisonCenterSpacer: {
    width: 72,
  },
  candidateTag: {
    minWidth: 104,
    paddingVertical: 0,
    borderRadius: 14,
    borderWidth: 1,
    fontFamily: 'Goldman',
    fontSize: 11,
    textAlign: 'center',
  },
  candidate: {
    color: '#8CA6DB',
    borderColor: '#5E6E9B',
  },
  notCandidate: {
    color: '#D78F8F',
    borderColor: '#855A5A',
  },
  metricRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 13,
  },
  comparisonMetrics: {
    marginTop: 8,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    backgroundColor: '#212121',
  },
  metricValue: {
    flex: 1,
    color: '#F1F1F1',
    fontFamily: 'Goldman',
    fontSize: 16,
    textAlign: 'center',
  },
  metricLabel: {
    width: 72,
    color: '#C8C8C8',
    fontFamily: 'Goldman',
    fontSize: 12,
    textAlign: 'center',
  },
  mutedText: {
    color: '#777777',
  },
  institutionHeading: {
    marginTop: 19,
    marginBottom: 10,
    color: '#F1F1F1',
    fontFamily: 'Goldman',
    fontSize: 18,
    textAlign: 'center',
  },
  institutionRowPair: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginHorizontal: 14,
  },
  institutionCard: {
    minHeight: 137,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#212121',
  },
  institutionTitle: {
    marginBottom: 8,
    color: '#F1F1F1',
    fontFamily: 'Goldman',
    fontSize: 11,
  },
  institutionRow: {
    minHeight: 29,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  institutionLabel: {
    flex: 1,
    color: '#D6D6D6',
    fontFamily: 'Goldman',
    fontSize: 10,
  },
  institutionValue: {
    marginLeft: 4,
    fontFamily: 'Goldman',
    fontSize: 12,
  },
});
