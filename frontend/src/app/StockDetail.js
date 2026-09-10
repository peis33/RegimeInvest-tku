import React, { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Circle, Svg } from 'react-native-svg';
import AssetSvg from '../components/AssetSvg';
import useViewportDimensions from '../hooks/useViewportDimensions';
import {
  InstitutionalChart,
  MarginChart,
  RecentCharts,
} from '../components/StockCharts';
import {
  fetchLatestInvestment,
  fetchLatestStockCharts,
  fetchLatestStockDetail,
} from '../services/investmentApi';

const BACK_IMAGE = require('../assets/image/back.svg');

const DETAIL_TABS = [
  { key: 'recent', label: '近期K線' },
  { key: 'institutional', label: '法人買賣' },
  { key: 'margin', label: '融資融券' },
  { key: 'portfolio', label: '資金配置' },
];

const PORTFOLIO_RANK_COLORS = {
  1: '#D7BD5B',
  2: '#5CC957',
  3: '#E07D67',
  4: '#7EA9D7',
};
const PORTFOLIO_NEUTRAL_COLOR = '#A7A7A7';

const MARKET_REGIME_RING_CONFIG = {
  bull: {
    label: 'BULL',
    probabilityKey: 'prob_Bull',
    color: '#C4484E',
    textColor: '#E99A9D',
  },
  bear: {
    label: 'BEAR',
    probabilityKey: 'prob_Bear',
    color: '#54B25B',
    textColor: '#8DDB91',
  },
  sideways: {
    label: 'SIDEWAYS',
    probabilityKey: 'prob_Sideways',
    color: '#D7BD5B',
    textColor: '#F0D77A',
  },
};

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatStockNumber(value, maximumFractionDigits = 2) {
  const number = toFiniteNumber(value);
  if (number === null) {
    return '--';
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits,
  }).format(number);
}

function formatSignedStockNumber(value, maximumFractionDigits = 2) {
  const number = toFiniteNumber(value);
  if (number === null) {
    return '--';
  }

  const formatted = formatStockNumber(Math.abs(number), maximumFractionDigits);
  return number > 0 ? `+${formatted}` : number < 0 ? `-${formatted}` : formatted;
}

// Taiwan stock-market colours: a fall is green and a rise is red.
function getTone(value) {
  const number = toFiniteNumber(value);
  return number !== null && number > 0 ? 'negative' : 'positive';
}

function createDetailCell(label, value, unit, maximumFractionDigits = 2, toneValue = value) {
  return {
    label,
    value: formatStockNumber(value, maximumFractionDigits),
    unit,
    tone: getTone(toneValue),
  };
}

function buildDetailRows(detail, chartData) {
  if (!detail) {
    return {
      recent: [],
      institutional: [],
      margin: [],
    };
  }

  const chartPoints = Array.isArray(chartData?.points) ? chartData.points : [];
  const latestChartPoint = chartPoints[chartPoints.length - 1];
  const hasChartMarginData =
    latestChartPoint &&
    (latestChartPoint.marginBalance !== undefined ||
      latestChartPoint.shortBalance !== undefined);
  const marginBalance = hasChartMarginData
    ? latestChartPoint.marginBalance
    : detail.marginBalance;
  const shortBalance = hasChartMarginData
    ? latestChartPoint.shortBalance
    : detail.shortBalance;
  const marginChange = hasChartMarginData
    ? latestChartPoint.marginChange
    : detail.marginChange;
  const shortChange = hasChartMarginData
    ? latestChartPoint.shortChange
    : detail.shortChange;
  const marginUnit = hasChartMarginData ? '張' : '千元';

  return {
    recent: [
      [
        createDetailCell('開盤', detail.open, null, 4, -1),
        createDetailCell('收盤', detail.close, null, 4, -1),
      ],
      [
        createDetailCell('最高', detail.high, null, 4, -1),
        createDetailCell('最低', detail.low, null, 4, 1),
      ],
      [createDetailCell('成交值', detail.turnoverValue, '千元', 0, -1)],
      [createDetailCell('成交量', detail.volume, '千股', 0, -1)],
    ],
    institutional: [
      [createDetailCell('外資買賣超', detail.foreignNet, '千股')],
      [createDetailCell('投信買賣超', detail.investmentTrustNet, '千股')],
      [createDetailCell('自營商買賣超', detail.dealerNet, '千股')],
      [createDetailCell('流通在外股數', detail.sharesOutstanding, '千股', 0, -1)],
    ],
    margin: [
      [createDetailCell('融資餘額', marginBalance, marginUnit, 0, -1)],
      [createDetailCell('融券餘額', shortBalance, marginUnit, 0, -1)],
      [createDetailCell('融資增減', marginChange, marginUnit)],
      [createDetailCell('融券增減', shortChange, marginUnit)],
    ],
  };
}

function getPortfolioWeight(row) {
  const rawWeight =
    row?.final_weight_percent ??
    row?.finalWeightPercent ??
    row?.weight_percent ??
    row?.weight;
  const weight = toFiniteNumber(rawWeight);

  if (weight === null) {
    return 0;
  }

  return Math.abs(weight) <= 1 ? weight * 100 : weight;
}

function getPortfolioRankColor(rank) {
  return PORTFOLIO_RANK_COLORS[rank] || PORTFOLIO_NEUTRAL_COLOR;
}

function getMarketRegimeConfig(value) {
  const normalized = String(value || '').trim().toLowerCase();

  if (normalized.includes('bull') || normalized === '牛市') {
    return MARKET_REGIME_RING_CONFIG.bull;
  }
  if (normalized.includes('bear') || normalized === '熊市') {
    return MARKET_REGIME_RING_CONFIG.bear;
  }
  if (normalized.includes('side') || normalized === '盤整') {
    return MARKET_REGIME_RING_CONFIG.sideways;
  }

  return null;
}

function getMarketRegimeData(investment) {
  const market = investment?.market || {};
  const portfolioRow = Array.isArray(investment?.portfolio)
    ? investment.portfolio.find((row) => row?.predicted_regime)
    : null;
  const config = getMarketRegimeConfig(
    market.predicted_regime ?? portfolioRow?.predicted_regime,
  );

  if (!config) {
    return null;
  }

  const rawProbability =
    market[config.probabilityKey] ?? portfolioRow?.[config.probabilityKey];
  const numericProbability = toFiniteNumber(rawProbability);

  return {
    ...config,
    probability:
      numericProbability === null
        ? null
        : Math.min(
            1,
            Math.max(
              0,
              Math.abs(numericProbability) <= 1
                ? numericProbability
                : numericProbability / 100,
            ),
          ),
  };
}

function isCashRow(row) {
  const assetType = String(row?.asset_type || row?.assetType || '').toLowerCase();
  const symbol = String(row?.stock_id ?? row?.symbol ?? '').toUpperCase();
  return assetType === 'cash' || symbol === 'CASH' || symbol === '現金';
}

function buildPortfolioData(investment, detail, stock) {
  const rawRows = Array.isArray(investment?.portfolio)
    ? investment.portfolio
    : [];
  const rows = rawRows.map((row, index) => ({
    ...row,
    key: `${row?.stock_id || row?.symbol || row?.name || 'asset'}-${index}`,
    symbol: String(row?.stock_id ?? row?.symbol ?? ''),
    name: row?.name || row?.stock_name || '--',
    weight: Math.max(0, getPortfolioWeight(row)),
  }));
  const stockRows = rows.filter((row) => !isCashRow(row));
  const activeStockRows = stockRows
    .filter((row) => row.weight > 0)
    .sort((left, right) => right.weight - left.weight);
  const selectedSymbol = String(detail?.symbol ?? stock?.symbol ?? '');
  const selectedIndex = activeStockRows.findIndex(
    (row) => row.symbol === selectedSymbol,
  );
  const selectedRow =
    selectedIndex >= 0
      ? activeStockRows[selectedIndex]
      : stockRows.find((row) => row.symbol === selectedSymbol) || null;
  const profileBudget = toFiniteNumber(
    investment?.profile?.budget ?? investment?.profile?.investment_budget,
  );
  const allocationAmount =
    toFiniteNumber(selectedRow?.allocated_amount ?? selectedRow?.allocatedAmount) ??
    (selectedRow && profileBudget !== null
      ? (profileBudget * selectedRow.weight) / 100
      : null);
  const expectedReturn =
    selectedRow?.expected_return ??
    selectedRow?.historical_return ??
    selectedRow?.historicalReturn;

  return {
    rank: selectedIndex >= 0 ? selectedIndex + 1 : null,
    weight: selectedRow?.weight ?? null,
    allocationAmount,
    lots:
      selectedRow?.lots ??
      (() => {
        const shares = toFiniteNumber(selectedRow?.shares);
        if (shares === null) return null;
        const allowFractional = Boolean(
          selectedRow?.allow_fractional ?? selectedRow?.allowFractional,
        );
        return allowFractional ? shares / 1000 : Math.floor(shares / 1000);
      })(),
    historicalReturn:
      toFiniteNumber(expectedReturn) === null
        ? null
        : Math.abs(Number(expectedReturn)) <= 1
          ? Number(expectedReturn) * 100
          : Number(expectedReturn),
    rows: activeStockRows.map((row, index) => ({
      ...row,
      rank: index + 1,
      isSelected: row.symbol === selectedSymbol,
      color: row.symbol === selectedSymbol
        ? getPortfolioRankColor(index + 1)
        : PORTFOLIO_NEUTRAL_COLOR,
    })),
  };
}

function SummaryMetric({ label, value, unit, tone, scale }) {
  return (
    <View style={styles.summaryMetric}>
      <Text style={[styles.summaryLabel, { fontSize: 13 * scale }]}>{label}</Text>
      <Text
        style={[
          styles.summaryValue,
          tone === 'negative' ? styles.negativeText : styles.positiveText,
          { fontSize: 21 * scale, lineHeight: 25 * scale },
        ]}
      >
        {value}
      </Text>
      {unit ? (
        <Text style={[styles.summaryUnit, { fontSize: 10 * scale }]}>{unit}</Text>
      ) : null}
    </View>
  );
}

function MarketRegimeRing({ data, scale }) {
  const size = 96 * scale;
  const strokeWidth = 16 * scale;
  const center = size / 2;
  const radius = center - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;
  const probability = data?.probability ?? 0;
  const dashOffset = circumference * (1 - probability);
  const percentText =
    !data || data.probability === null
      ? '--'
      : `${Math.round(data.probability * 100)}%`;
  const regimeLabel = data?.label || '--';
  const ringColor = data?.color || '#555555';
  const valueColor = data?.textColor || '#A7A7A7';

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`大盤市場狀態預估 ${regimeLabel} ${percentText}`}
      style={[
        styles.marketRegimeRing,
        {
          right: 22 * scale,
          top: 18 * scale,
          width: 128 * scale,
        },
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.marketRegimeRingLabel,
          {
            fontSize: 9 * scale,
            lineHeight: 12 * scale,
            marginBottom: 10 * scale,
          },
        ]}
      >
        大盤市場狀態預估{' '}
        <Text style={{ color: ringColor }}>{regimeLabel}</Text>
      </Text>
      <View style={{ width: size, height: size, position: 'relative' }}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="#414141"
            strokeWidth={strokeWidth}
          />
          <Circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={ringColor}
            strokeWidth={strokeWidth}
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            rotation={-90}
            origin={`${center}, ${center}`}
          />
        </Svg>
        <View pointerEvents="none" style={styles.marketRegimeRingCenter}>
          <Text
            style={[
              styles.marketRegimeRingValue,
              { color: valueColor, fontSize: 24 * scale, lineHeight: 28 * scale },
            ]}
          >
            {percentText}
          </Text>
        </View>
      </View>
    </View>
  );
}

function DataCell({ item, scale }) {
  return (
    <View style={styles.dataCell}>
      <Text
        style={[
          styles.dataLabel,
          {
            fontSize: 15 * scale,
            lineHeight: 22 * scale,
            marginRight: 18 * scale,
          },
        ]}
      >
        {item.label}
      </Text>
      <Text
        style={[
          styles.dataValue,
          item.tone === 'negative' ? styles.negativeText : styles.positiveText,
          { fontSize: 18 * scale, lineHeight: 22 * scale },
        ]}
      >
        {item.value}
      </Text>
      {item.unit ? (
        <Text style={[styles.dataUnit, { fontSize: 10 * scale, marginLeft: 4 * scale }]}>
          ({item.unit})
        </Text>
      ) : null}
    </View>
  );
}

function DataTable({ rows, scale }) {
  return (
    <View style={styles.dataTable}>
      {rows.map((row, rowIndex) => (
        <View
          key={`row-${rowIndex}`}
          style={[
            styles.dataRow,
            {
              minHeight: 46 * scale,
              paddingHorizontal: 31 * scale,
            },
            rowIndex % 2 === 0 ? styles.dataRowDark : styles.dataRowDarker,
          ]}
        >
          {row.map((item) => (
            <DataCell key={item.label} item={item} scale={scale} />
          ))}
        </View>
      ))}
    </View>
  );
}

function PortfolioMetricRow({ label, value, scale, valueTone = 'neutral' }) {
  return (
    <View style={[styles.portfolioMetricRow, { minHeight: 51 * scale }]}>
      <Text style={[styles.portfolioMetricLabel, { fontSize: 15 * scale }]}>
        {label}
      </Text>
      <Text
        style={[
          styles.portfolioMetricValue,
          valueTone === 'positive' ? styles.positiveText : null,
          valueTone === 'negative' ? styles.negativeText : null,
          { fontSize: 16 * scale },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function AllocationBar({ row, scale }) {
  return (
    <View style={[styles.allocationRow, { minHeight: 42 * scale }]}>
      <Text
        numberOfLines={1}
        style={[
          styles.allocationLabel,
          row.isSelected ? { color: row.color } : null,
          { fontSize: 13 * scale },
        ]}
      >
        {row.name}
      </Text>
      <View style={[styles.allocationTrack, { height: 7 * scale }]}>
        <View
          style={[
            styles.allocationFill,
            {
              width: `${Math.min(100, Math.max(0, row.weight))}%`,
              backgroundColor: row.color,
              height: 7 * scale,
            },
          ]}
        />
      </View>
      <Text
        style={[
          styles.allocationPercent,
          row.isSelected ? { color: row.color } : null,
          { fontSize: 13 * scale },
        ]}
      >
        {formatStockNumber(row.weight, 0)}%
      </Text>
    </View>
  );
}

function PortfolioPanel({ data, scale }) {
  const rankText = data.rank === null ? '--' : `#${data.rank}`;
  const rankColor = getPortfolioRankColor(data.rank);
  const weightText = data.weight === null ? '--' : `${formatStockNumber(data.weight, 0)}%`;
  const amountText =
    data.allocationAmount === null
      ? '--'
      : formatStockNumber(data.allocationAmount, 0);
  const lotsNumber = toFiniteNumber(data.lots);
  const lotsText =
    lotsNumber === null
      ? '--'
      : formatStockNumber(lotsNumber, lotsNumber % 1 ? 2 : 0);
  const returnText =
    data.historicalReturn === null
      ? '--'
      : `${formatSignedStockNumber(data.historicalReturn, 1)}%`;

  return (
    <View style={[styles.portfolioPanel, { paddingTop: 26 * scale }]}>
      <Text style={[styles.portfolioRank, { fontSize: 12 * scale }]}>
        組合排行{' '}
        <Text style={[styles.portfolioRankValue, { color: rankColor }]}>
          {rankText}
        </Text>
      </Text>

      <View
        style={[
          styles.portfolioCard,
          {
            marginHorizontal: 31 * scale,
            marginTop: 10 * scale,
            borderRadius: 10 * scale,
          },
        ]}
      >
        <PortfolioMetricRow label="占比" value={weightText} scale={scale} />
        <PortfolioMetricRow label="分配預算" value={amountText} scale={scale} />
        <PortfolioMetricRow label="建議張數" value={lotsText} scale={scale} />
        <PortfolioMetricRow
          label="歷史報酬率"
          value={returnText}
          scale={scale}
        />
      </View>

      <View
        style={[
          styles.allocationList,
          {
            marginHorizontal: 31 * scale,
            marginTop: 24 * scale,
          },
        ]}
      >
        {data.rows.length > 0 ? (
          data.rows.map((row) => <AllocationBar key={row.key} row={row} scale={scale} />)
        ) : (
          <Text style={[styles.portfolioEmpty, { fontSize: 13 * scale }]}>
            尚無資金配置資料
          </Text>
        )}
      </View>
    </View>
  );
}

function StockDetail({ stock, investmentData: providedInvestmentData, onBack, style }) {
  const [activeTab, setActiveTab] = useState('recent');
  const [stockDetail, setStockDetail] = useState(null);
  const [stockCharts, setStockCharts] = useState(null);
  const [investmentData, setInvestmentData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [detailError, setDetailError] = useState(null);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartError, setChartError] = useState(null);
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useViewportDimensions();
  const contentWidth = Math.min(Math.max(screenWidth, 320), 500);
  const scale = contentWidth / 337;
  const headerHeight = 90 * scale + insets.top;
  const summaryHeight = 158 * scale;
  const stockSymbol = stock?.symbol ? String(stock.symbol) : '';

  useEffect(() => {
    let cancelled = false;

    if (!stockSymbol) {
      setStockDetail(null);
      setStockCharts(null);
      setInvestmentData(null);
      setDetailLoading(false);
      setDetailError('缺少股票代號');
      setChartLoading(false);
      setChartError('缺少股票代號');
      return () => {
        cancelled = true;
      };
    }

    setStockDetail(null);
    setStockCharts(null);
    setInvestmentData(null);
    setDetailLoading(true);
    setDetailError(null);
    setChartLoading(true);
    setChartError(null);

    fetchLatestStockDetail(stockSymbol)
      .then((result) => {
        if (cancelled) {
          return;
        }
        if (!result?.data) {
          throw new Error('後端沒有回傳個股資料');
        }
        setStockDetail(result.data);
        setDetailLoading(false);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setStockDetail(null);
        setDetailLoading(false);
        setDetailError(error?.message || '無法載入個股最新資料');
      });

    fetchLatestStockCharts(stockSymbol)
      .then((result) => {
        if (!cancelled) {
          setStockCharts(result?.data || null);
          setChartLoading(false);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setStockCharts(null);
          setChartLoading(false);
          setChartError(error?.message || '無法載入個股圖表資料');
        }
      });

    fetchLatestInvestment()
      .then((result) => {
        if (!cancelled) {
          setInvestmentData(result);
        }
      })
      .catch(() => {
        // 個股資料仍可在資金配置服務暫時不可用時正常顯示。
      });

    return () => {
      cancelled = true;
    };
  }, [stockSymbol]);

  const detailRows = buildDetailRows(stockDetail, stockCharts);
  const tabRows = detailRows[activeTab] || [];
  const portfolioData = buildPortfolioData(
    providedInvestmentData || investmentData,
    stockDetail,
    stock,
  );
  const marketRegimeData = getMarketRegimeData(
    providedInvestmentData || investmentData,
  );
  const stockTitle = `${stockDetail?.symbol || stock?.symbol || '2454'} ${stockDetail?.name || stock?.name || '聯發科'}`;
  const stockChange = toFiniteNumber(stockDetail?.change);
  const stockClose = toFiniteNumber(stockDetail?.close ?? stock?.price);
  const previousClose =
    stockClose !== null && stockChange !== null ? stockClose - stockChange : null;
  const changePercent =
    previousClose !== null && previousClose !== 0 && stockChange !== null
      ? (stockChange / previousClose) * 100
      : null;
  const stockChangeIcon =
    stockChange === null ? '▼' : stockChange > 0 ? '▲' : stockChange < 0 ? '▼' : '－';
  const stockChangeTone = stockChange !== null && stockChange > 0 ? 'negative' : 'positive';
  const changeBadgeText =
    changePercent === null ? '--' : `${formatSignedStockNumber(changePercent, 2)}%`;
  const stockCloseText = formatStockNumber(stockClose, 2);
  const stockTurnoverText = formatStockNumber(stockDetail?.turnoverRate, 4);

  return (
    <View style={[styles.container, style]}>
      <ScrollView
        style={{ flex: 1, width: '100%' }}
        horizontal={false}
        bounces={false}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          {
            width: screenWidth,
            paddingBottom: insets.bottom + 28 * scale,
          },
        ]}
      >
        <View
          style={[
            styles.header,
            {
              height: headerHeight,
              paddingTop: insets.top,
            },
          ]}
        >
          <Text
            style={[
              styles.stockTitle,
              {
                bottom: 11 * scale,
                fontSize: 23 * scale,
                lineHeight: 29 * scale,
              },
            ]}
            numberOfLines={1}
            ellipsizeMode="clip"
          >
            {stockTitle}
          </Text>

          <View
            style={[
              styles.changeBadge,
              {
                right: 8 * scale,
                bottom: 10 * scale,
                minWidth: 66 * scale,
                height: 27 * scale,
                borderRadius: 5 * scale,
                paddingHorizontal: 6 * scale,
                borderColor: stockChangeTone === 'negative' ? '#D53636' : '#426D4A',
              },
            ]}
          >
            <Text
              style={[
                styles.changeBadgeText,
                stockChangeTone === 'negative' ? styles.negativeText : styles.positiveText,
                { fontSize: 10 * scale, lineHeight: 14 * scale },
              ]}
            >
              {stockChangeIcon} {changeBadgeText}
            </Text>
          </View>
        </View>

        <View style={[styles.summary, { height: summaryHeight }]}>
          <View
            style={[
              styles.priceBox,
              {
                left: 41 * scale,
                top: 20 * scale,
                width: 124 * scale,
                height: 34 * scale,
                borderRadius: 5 * scale,
                borderColor: stockChangeTone === 'negative' ? '#D53636' : '#426D4A',
              },
            ]}
          >
            <Text
              style={[
                styles.priceTrend,
                stockChangeTone === 'negative' ? styles.negativeText : styles.positiveText,
                { fontSize: 18 * scale, lineHeight: 22 * scale },
              ]}
            >
              {stockChangeIcon}
            </Text>
            <Text
              style={[
                styles.priceText,
                stockChangeTone === 'negative' ? styles.negativeText : styles.positiveText,
                { fontSize: 25 * scale, lineHeight: 28 * scale },
              ]}
            >
              {stockCloseText}
            </Text>
            <Text style={[styles.priceUnit, { fontSize: 10 * scale }]}> (元)</Text>
          </View>

          <View style={[styles.summaryMetrics, { left: 23 * scale, top: 79 * scale }]}>
            <SummaryMetric
              label="周轉率"
              value={stockTurnoverText}
              unit="%"
              tone="positive"
              scale={scale}
            />
          </View>
          <View style={[styles.summaryMetrics, { left: 23 * scale, top: 116 * scale }]}>
            <SummaryMetric
              label="收盤價"
              value={stockCloseText}
              tone={stockChangeTone}
              scale={scale}
            />
          </View>
          <MarketRegimeRing data={marketRegimeData} scale={scale} />
        </View>

        <View style={[styles.tabs, { height: 36 * scale }]}>
          {DETAIL_TABS.map((tab) => (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === tab.key }}
              accessibilityLabel={tab.label}
              onPress={() => setActiveTab(tab.key)}
              style={[styles.tab, activeTab === tab.key && styles.activeTab]}
            >
              <Text
                style={[
                  styles.tabText,
                  { fontSize: 15 * scale, lineHeight: 20 * scale },
                  activeTab === tab.key && styles.activeTabText,
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {activeTab === 'portfolio' ? (
          <PortfolioPanel data={portfolioData} scale={scale} />
        ) : (
          <>
            <View style={styles.chartPanel}>
              {activeTab === 'recent' ? (
                <RecentCharts data={stockCharts} width={contentWidth} />
              ) : activeTab === 'institutional' ? (
                <InstitutionalChart data={stockCharts} width={contentWidth} />
              ) : (
                <MarginChart data={stockCharts} width={contentWidth} />
              )}
            </View>

            {detailLoading || detailError || chartLoading || chartError ? (
              <View
                style={[
                  styles.detailStatus,
                  {
                    minHeight: 34 * scale,
                    paddingHorizontal: 20 * scale,
                  },
                ]}
              >
                <Text style={[styles.detailStatusText, { fontSize: 12 * scale }]}>
                  {detailLoading
                    ? '載入最新資料中…'
                    : detailError
                      ? detailError
                      : chartLoading
                        ? '載入圖表資料中…'
                        : chartError}
                </Text>
              </View>
            ) : null}

            <DataTable rows={tabRows} scale={scale} />
          </>
        )}
      </ScrollView>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="返回"
        onPress={() => onBack?.()}
        style={[
          styles.backButton,
          {
            top: insets.top + 25 * scale,
            left: 17 * scale,
            width: 35 * scale,
            height: 24 * scale,
          },
        ]}
      >
        <AssetSvg
          asset={BACK_IMAGE}
          width={32 * scale}
          height={17 * scale}
          pointerEvents="none"
        />
      </Pressable>
    </View>
  );
}

export default React.memo(StockDetail);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#2E2F2E',
    position: 'relative',
  },
  content: {
    alignItems: 'center',
  },
  header: {
    width: '100%',
    position: 'relative',
    borderBottomWidth: 1,
    borderBottomColor: '#555555',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  stockTitle: {
    position: 'absolute',
    color: '#F4F4F4',
    fontFamily: 'Goldman',
    textAlign: 'center',
  },
  changeBadge: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#426D4A',
  },
  changeBadgeText: {
    fontFamily: 'Goldman',
    textAlign: 'center',
  },
  backButton: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    elevation: 20,
  },
  summary: {
    width: '100%',
    position: 'relative',
  },
  priceBox: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#426D4A',
  },
  priceText: {
    fontFamily: 'Goldman',
  },
  priceTrend: {
    fontFamily: 'Goldman',
    marginRight: 2,
  },
  priceUnit: {
    color: '#F4F4F4',
    fontFamily: 'Goldman',
  },
  summaryMetrics: {
    position: 'absolute',
  },
  marketRegimeRing: {
    position: 'absolute',
    alignItems: 'center',
  },
  marketRegimeRingLabel: {
    color: '#8A8A8A',
    fontFamily: 'Goldman',
    textAlign: 'center',
  },
  marketRegimeRingCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  marketRegimeRingValue: {
    fontFamily: 'Goldman',
    textAlign: 'center',
  },
  summaryMetric: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  summaryLabel: {
    color: '#F4F4F4',
    fontFamily: 'Goldman',
    marginRight: 6,
  },
  summaryValue: {
    fontFamily: 'Goldman',
  },
  summaryUnit: {
    color: '#F4F4F4',
    fontFamily: 'Goldman',
    marginLeft: 2,
  },
  positiveText: {
    color: '#2CB331',
  },
  negativeText: {
    color: '#D53636',
  },
  tabs: {
    width: '100%',
    flexDirection: 'row',
    backgroundColor: '#2E2F2E',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeTab: {
    backgroundColor: '#070707',
  },
  tabText: {
    color: '#989898',
    fontFamily: 'Goldman',
    textAlign: 'center',
  },
  activeTabText: {
    color: '#F4F4F4',
  },
  chartPanel: {
    width: '100%',
    backgroundColor: '#F4F4F4',
  },
  detailStatus: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2E2F2E',
  },
  detailStatusText: {
    color: '#BDBDBD',
    fontFamily: 'Goldman',
    textAlign: 'center',
  },
  dataTable: {
    width: '100%',
  },
  dataRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#343534',
  },
  dataRowDark: {
    backgroundColor: '#242524',
  },
  dataRowDarker: {
    backgroundColor: '#2E2F2E',
  },
  dataCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    minWidth: 0,
  },
  dataLabel: {
    color: '#F1F1F1',
    fontFamily: 'Goldman',
    flexShrink: 1,
  },
  dataValue: {
    fontFamily: 'Goldman',
    flexShrink: 1,
  },
  dataUnit: {
    color: '#F1F1F1',
    fontFamily: 'Goldman',
    flexShrink: 0,
  },
  portfolioPanel: {
    width: '100%',
    minHeight: 520,
    backgroundColor: '#2E2F2E',
    paddingBottom: 36,
  },
  portfolioRank: {
    color: '#969696',
    fontFamily: 'Goldman',
    textAlign: 'center',
  },
  portfolioRankValue: {
    color: '#5CC957',
    fontFamily: 'Goldman',
  },
  portfolioCard: {
    overflow: 'hidden',
    backgroundColor: '#1D1E1D',
  },
  portfolioMetricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    borderBottomWidth: 1,
    borderBottomColor: '#343534',
  },
  portfolioMetricLabel: {
    color: '#D6D6D6',
    fontFamily: 'Goldman',
  },
  portfolioMetricValue: {
    color: '#F1F1F1',
    fontFamily: 'Goldman',
    textAlign: 'right',
  },
  allocationList: {
    width: 'auto',
  },
  allocationRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  allocationLabel: {
    width: 66,
    color: '#D6D6D6',
    fontFamily: 'Goldman',
  },
  allocationTrack: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: '#464746',
    overflow: 'hidden',
  },
  allocationFill: {
    borderRadius: 20,
  },
  allocationPercent: {
    width: 42,
    marginLeft: 10,
    color: '#D6D6D6',
    fontFamily: 'Goldman',
    textAlign: 'right',
  },
  portfolioEmpty: {
    color: '#A8A8A8',
    fontFamily: 'Goldman',
    textAlign: 'center',
  },
});
