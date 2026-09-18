import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AssetSvg from '../components/AssetSvg';
import InAppAlertBanner from '../components/InAppAlertBanner';
import { Path, Svg } from 'react-native-svg';
import {
  InstitutionalChart,
  MarginChart,
  RecentCharts,
} from '../components/StockCharts';
import {
  fetchLatestInvestment,
  fetchLatestStockCharts,
} from '../services/investmentApi';
import { useAppSettings } from '../context/AppSettingsContext';
import useViewportDimensions from '../hooks/useViewportDimensions';

const NOTICE_IMAGE = require('../assets/image/notice.svg');
const CURRENT_STATUS_FLAT_IMAGE = require('../assets/image/CurrentStatus_flat.svg');
const CURRENT_STATUS_RISE_IMAGE = require('../assets/image/CurrentStatus_rise.svg');
const CURRENT_STATUS_FALL_IMAGE = require('../assets/image/CurrentStatus_fall.svg');
const BULL_IMAGE = require('../assets/image/Bull.svg');
const BEAR_IMAGE = require('../assets/image/Bear.svg');
const SIDEWAYS_IMAGE = require('../assets/image/Sideways.svg');
const GRID_SIZE = 44;
const MARKET_CHART_SYMBOL = 'Y9999';
const HOME_CHART_RATIOS = {
  recent: (214 + 86) / 576,
  institutional: 298 / 576,
  margin: 298 / 576,
};
const REGIME_ORDER = ['bull', 'sideways', 'bear'];
const BULL_FRAME_COLOR = 'rgba(169, 62, 62, 0.7)';
const BULL_RETURN_COLOR = '#FF5858';
const BULL_METRIC_COLOR = '#EEB9B9';
const SIDEWAYS_FRAME_COLOR = '#846139';
const SIDEWAYS_METRIC_COLOR = '#FFE389';
const SIDEWAYS_METRIC_BACKGROUND = '#212121';
const SIDEWAYS_RETURN_FRAME_COLOR = 'rgba(169, 119, 62, 0.7)';
const SIDEWAYS_RETURN_COLOR = '#FFAE58';

const MARKET_STATUS_CONFIG = {
  bull: {
    asset: BULL_IMAGE,
    label: '牛市',
    statusAsset: CURRENT_STATUS_RISE_IMAGE,
    statusAssetWidth: 26,
    statusAssetHeight: 24,
    accent: '#C33636',
    borderColor: BULL_FRAME_COLOR,
    metricColor: '#F0B2B7',
    summaryMetricColor: BULL_METRIC_COLOR,
    aspectRatio: 475 / 469,
  },
  bear: {
    asset: BEAR_IMAGE,
    label: '熊市',
    statusAsset: CURRENT_STATUS_FALL_IMAGE,
    statusAssetWidth: 20,
    statusAssetHeight: 20,
    accent: '#2CB331',
    metricColor: '#7FF36A',
    aspectRatio: 454 / 427,
  },
  sideways: {
    asset: SIDEWAYS_IMAGE,
    label: '盤整',
    statusAsset: CURRENT_STATUS_FLAT_IMAGE,
    statusAssetWidth: 28,
    statusAssetHeight: 13,
    accent: '#EEB609',
    borderColor: SIDEWAYS_FRAME_COLOR,
    metricColor: '#FFE389',
    summaryMetricColor: SIDEWAYS_METRIC_COLOR,
    metricBackgroundColor: SIDEWAYS_METRIC_BACKGROUND,
    aspectRatio: 575 / 447,
    layout: 'wide',
  },
};

const HOME_TABS = [
  { key: 'recent', label: '近期K線' },
  { key: 'institutional', label: '法人買賣' },
  { key: 'margin', label: '融資融券' },
];

function getMarketStatusKey(regime) {
  const normalizedRegime = String(regime || '').trim().toLowerCase();
  const aliases = {
    bull: 'bull',
    牛市: 'bull',
    bear: 'bear',
    熊市: 'bear',
    sideways: 'sideways',
    盤整: 'sideways',
  };

  return aliases[normalizedRegime] || 'sideways';
}

function getMarketStatusConfig(regime) {
  return MARKET_STATUS_CONFIG[getMarketStatusKey(regime)];
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatNumber(value, maximumFractionDigits = 0) {
  const number = toFiniteNumber(value);
  if (number === null) {
    return '--';
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits,
  }).format(number);
}

function getRegimeProbability(market, regimeKey) {
  const probabilityField = {
    bull: 'prob_Bull',
    sideways: 'prob_Sideways',
    bear: 'prob_Bear',
  }[regimeKey];
  const value = toFiniteNumber(market?.[probabilityField]);

  if (value === null) {
    return null;
  }

  return value <= 1 ? value * 100 : value;
}

function getRegimeProbabilities(market) {
  return REGIME_ORDER.map((key) => ({
    key,
    probability: getRegimeProbability(market, key),
    config: MARKET_STATUS_CONFIG[key],
  }));
}

function getDominantRegimeKey(market, fallbackRegime) {
  const probabilities = getRegimeProbabilities(market).filter(
    ({ probability }) => probability !== null,
  );

  if (probabilities.length) {
    return probabilities.reduce((dominant, current) => (
      current.probability > dominant.probability ? current : dominant
    )).key;
  }

  return fallbackRegime ? getMarketStatusKey(fallbackRegime) : null;
}

function formatProbability(value) {
  return value === null ? '--' : `${formatNumber(value)}%`;
}

function ProbabilityBars({
  probabilities,
  width,
  height,
  rowHeight,
  rowGap,
  padding,
  marginTop,
  labelWidth,
  labelFontSize,
  labelLineHeight,
  valueWidth,
  valueFontSize,
  valueLineHeight,
}) {
  return (
    <View
      accessibilityLabel="牛市、盤整、熊市機率"
      style={[
        styles.probabilityPanel,
        { width, height, padding, marginTop },
      ]}
    >
      <Text style={styles.probabilityTitle}>下期市場狀態預測機率</Text>
      {probabilities.map(({ key, probability, config }, index) => {
        const fillWidth = probability === null
          ? 0
          : Math.min(100, Math.max(0, probability));

        return (
          <View
            key={key}
            style={[
              styles.probabilityRow,
              {
                height: rowHeight,
                marginBottom: index === probabilities.length - 1 ? 0 : rowGap,
              },
            ]}
          >
            <Text
              style={[
                styles.probabilityLabel,
                {
                  color: config.metricColor,
                  width: labelWidth,
                  fontSize: labelFontSize,
                  lineHeight: labelLineHeight,
                },
              ]}
              numberOfLines={1}
            >
              {config.label}
            </Text>
            <View style={styles.probabilityTrack}>
              {fillWidth > 0 ? (
                <View
                  style={[
                    styles.probabilityFill,
                    {
                      width: `${fillWidth}%`,
                      backgroundColor: config.accent,
                    },
                  ]}
                />
              ) : null}
            </View>
            <Text
              style={[
                styles.probabilityValue,
                {
                  color: config.metricColor,
                  width: valueWidth,
                  fontSize: valueFontSize,
                  lineHeight: valueLineHeight,
                },
              ]}
              numberOfLines={1}
              ellipsizeMode="clip"
              adjustsFontSizeToFit
              minimumFontScale={0.72}
            >
              {formatProbability(probability)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function formatDuration(market) {
  const remaining = toFiniteNumber(market?.remaining_regime_trading_days);
  if (remaining !== null && remaining >= 0) {
    if (remaining < 5) return '少於1週';
    const weeks = remaining / 5;
    const lower = Math.floor(weeks);
    const upper = Math.ceil(weeks);
    return lower === upper ? `${lower}週` : `${lower}-${upper}週`;
  }
  return '--';
}

function formatElapsedDuration(market) {
  const elapsed = toFiniteNumber(market?.elapsed_regime_trading_days);
  if (elapsed === null || elapsed < 0) {
    return { value: '待確認', unit: '' };
  }
  if (elapsed < 5) {
    return { value: String(Math.round(elapsed)), unit: '天' };
  }
  return {
    value: String(Math.round((elapsed / 5) * 10) / 10),
    unit: '週',
  };
}

function getMarketWarning(regime, duration) {
  const estimate = duration === '--' ? '' : `，預估剩餘 ${duration}`;
  if (regime === 'bull') return `目前為牛市${estimate}，留意回檔風險，避免追高。`;
  if (regime === 'bear') return `目前為熊市${estimate}，留意下行風險，避免急於抄底。`;
  if (regime === 'sideways') return '目前市場方向不明，建議先觀望，避免頻繁進場。';
  return '等待模型市場狀態資料。';
}

function getMarketReturnPercent(snapshot, chartData) {
  const chartPoints = Array.isArray(chartData?.points) ? chartData.points : [];
  const latestChartPoint = chartPoints[chartPoints.length - 1];
  const chartReturnPercent = toFiniteNumber(
    latestChartPoint?.returnPercent ?? snapshot?.returnPercent,
  );
  if (chartReturnPercent !== null) {
    return chartReturnPercent;
  }

  // 圖表資料暫時無法載入時，仍可用行情快照的漲跌額與收盤價
  // 還原當日報酬率，避免首頁顯示成「--」。
  const close = toFiniteNumber(snapshot?.close);
  const change = toFiniteNumber(snapshot?.change);
  const previousClose = close !== null && change !== null
    ? close - change
    : null;

  return previousClose !== null && previousClose !== 0 && change !== null
    ? (change / previousClose) * 100
    : null;
}

function formatMarketChange(returnPercent) {
  if (returnPercent === null) {
    return '--';
  }

  if (returnPercent === 0) {
    return '0%';
  }

  const arrow = returnPercent < 0 ? '▼' : '▲';
  return `${arrow} ${Math.abs(returnPercent).toFixed(2)}%`;
}

function getMarketReturnTone(returnPercent) {
  if (returnPercent === null) {
    return {
      accent: '#D9D9D9',
      metricColor: '#F5F5F5',
    };
  }

  if (returnPercent > 0) {
    return {
      accent: BULL_FRAME_COLOR,
      metricColor: BULL_RETURN_COLOR,
    };
  }

  if (returnPercent < 0) {
    return {
      accent: '#2CB331',
      metricColor: '#7FF36A',
    };
  }

  return {
    accent: SIDEWAYS_RETURN_FRAME_COLOR,
    metricColor: SIDEWAYS_RETURN_COLOR,
  };
}

function SummaryMetric({
  label,
  elapsed,
  value,
  unit,
  accent,
  valueColor,
  textScale,
  borderRadius,
  borderWidth,
  horizontalPadding,
  backgroundColor,
  speechBubble = false,
  elapsedUnit = '週',
}) {
  return (
    <View
      style={[
        styles.summaryMetric,
        {
          borderColor: accent,
          borderRadius,
          borderWidth,
          paddingHorizontal: 0,
          backgroundColor: backgroundColor || '#202120',
        },
      ]}
    >
      {speechBubble ? (
        <Svg pointerEvents="none" width={38 * textScale} height={38 * textScale}
          viewBox="0 0 38 38" style={{ position: 'absolute', left: '36%', top: '100%', zIndex: 3 }}>
          <Path d="M0 0 L32 35 L17 0" fill={backgroundColor || '#202120'}
            stroke={accent} strokeWidth={2} strokeLinejoin="round" />
        </Svg>
      ) : null}
      {elapsed !== undefined ? (
        <View style={{ width: '100%' }}>
          <Text style={{ color: valueColor || accent, fontSize: 12 * textScale, paddingHorizontal: horizontalPadding }}>已持續</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.summaryMetricValue, { color: valueColor || accent, fontSize: 30 * textScale, lineHeight: 33 * textScale }]}>
            {elapsed}<Text style={{ fontSize: 14 * textScale }}>{elapsed === '待確認' ? '' : elapsedUnit}</Text>
          </Text>
        </View>
      ) : null}
      <Text
        style={[
          styles.summaryMetricLabel,
          {
            color: valueColor || accent,
            fontSize: (elapsed !== undefined ? 12 : 16) * textScale,
            lineHeight: (elapsed !== undefined ? 15 : 19) * textScale,
            paddingHorizontal: horizontalPadding,
          },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.summaryMetricValue,
          {
            color: valueColor || accent,
            fontSize: (elapsed !== undefined ? 30 : 38) * textScale,
            lineHeight: (elapsed !== undefined ? 33 : 42) * textScale,
          },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
        {unit ? (
          <Text
            style={[
              styles.summaryMetricUnit,
              {
                color: valueColor || accent,
                fontSize: 16 * textScale,
                lineHeight: 19 * textScale,
              },
            ]}
          >
            {unit}
          </Text>
        ) : null}
      </Text>
    </View>
  );
}

function HomeDataTable({ rows, screenWidth }) {
  const [pairedGroupInset, setPairedGroupInset] = useState(null);
  const fallbackGroupInset = Math.max(0, screenWidth / 4 - 58);
  const effectiveGroupInset = pairedGroupInset ?? fallbackGroupInset;

  const handlePairedGroupLayout = useCallback(({ nativeEvent }) => {
    const nextInset = nativeEvent.layout.x;
    setPairedGroupInset((currentInset) => (
      currentInset !== null && Math.abs(currentInset - nextInset) < 0.5
        ? currentInset
        : nextInset
    ));
  }, []);

  if (!rows.length) {
    return (
      <View style={styles.emptyHomeData}>
        <Text style={styles.emptyHomeDataText}>尚無此分類資料</Text>
      </View>
    );
  }

  return (
    <View style={styles.homeDataTable}>
      {rows.map((row, index) => (
        <View
          key={`${row[0]?.label || 'row'}-${index}`}
          style={[
            styles.homeDataRow,
            index % 2 === 0 && styles.homeDataRowAlt,
          ]}
        >
          {row.map((cell) => (
            <View
              key={cell.label}
              style={[
                styles.homeDataCell,
                row.length === 2
                  ? styles.homeDataCellPaired
                  : styles.homeDataCellSingle,
                row.length !== 2 && { paddingLeft: effectiveGroupInset },
              ]}
            >
              <View
                onLayout={
                  row.length === 2 && index === 0
                    ? handlePairedGroupLayout
                    : undefined
                }
                style={[
                  styles.homeDataGroup,
                  row.length !== 2 && styles.homeDataSingleGroup,
                ]}
              >
                <Text
                  style={[
                    styles.homeDataLabel,
                    row.length !== 2 && styles.homeDataLabelSingle,
                  ]}
                  numberOfLines={1}
                >
                  {cell.label}
                </Text>
                <Text
                  style={[
                    styles.homeDataValue,
                    cell.tone === 'negative'
                      ? styles.homeDataValueNegative
                      : styles.homeDataValuePositive,
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {cell.value}
                  {cell.unit ? (
                    <Text style={styles.homeDataUnit}> ({cell.unit})</Text>
                  ) : null}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function buildHomeDataRows(snapshot, tabKey, chartData) {
  if (!snapshot) {
    return [];
  }

  const chartPoints = Array.isArray(chartData?.points) ? chartData.points : [];
  const latestChartPoint = chartPoints[chartPoints.length - 1];
  const currentSnapshot = latestChartPoint
    ? { ...snapshot, ...latestChartPoint }
    : snapshot;
  // 首頁與個股頁統一採用 stock_detail_historical.csv 的千元欄位。
  const marginUnit = '千元';

  const cell = (label, value, unit = null, toneValue = value, digits = 0) => ({
    label,
    value: formatNumber(value, digits),
    unit,
    tone: toFiniteNumber(toneValue) !== null && toFiniteNumber(toneValue) < 0
      ? 'negative'
      : 'positive',
  });

  if (tabKey === 'recent') {
    return [
      [
        cell('開盤', currentSnapshot.open, null, currentSnapshot.change),
        cell('收盤', currentSnapshot.close, null, currentSnapshot.change),
      ],
      [
        cell('最高', currentSnapshot.high, null, currentSnapshot.change),
        cell('最低', currentSnapshot.low, null, currentSnapshot.change),
      ],
      [cell('成交值', currentSnapshot.turnoverValue, '千元')],
      [cell('成交量', currentSnapshot.volume, '千股')],
    ];
  }

  if (tabKey === 'institutional') {
    return [
      [cell('外資買賣超', currentSnapshot.foreignNet, '千股')],
      [cell('投信買賣超', currentSnapshot.investmentTrustNet, '千股')],
      [cell('自營商買賣超', currentSnapshot.dealerNet, '千股')],
      [cell('流通在外股數', currentSnapshot.sharesOutstanding, '千股')],
    ];
  }

  if (tabKey === 'margin') {
    return [
      [cell('融資餘額', currentSnapshot.marginBalance, marginUnit)],
      [cell('融券餘額', currentSnapshot.shortBalance, marginUnit)],
      [cell('融資增減', currentSnapshot.marginChange, marginUnit)],
      [cell('融券增減', currentSnapshot.shortChange, marginUnit)],
    ];
  }

  return [];
}

export default function Home() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useViewportDimensions();
  const {
    priceAlerts,
    investmentResult,
    investmentRunPending,
    investmentRunError,
  } = useAppSettings();
  const [marketRegime, setMarketRegime] = useState(null);
  const [latestInvestment, setLatestInvestment] = useState(null);
  const [investmentFetchError, setInvestmentFetchError] = useState(null);
  const [investmentLoading, setInvestmentLoading] = useState(false);
  const [investmentRetry, setInvestmentRetry] = useState(0);
  const [marketCharts, setMarketCharts] = useState(null);
  const [marketChartLoading, setMarketChartLoading] = useState(true);
  const [marketChartError, setMarketChartError] = useState(null);
  const [activeHomeTab, setActiveHomeTab] = useState('recent');
  const [scrollOffset, setScrollOffset] = useState(0);
  // Keep each axis's grid lines inside the viewport. Using the screen height
  // for both axes creates many off-screen vertical children on portrait
  // devices, which can make the whole page appear horizontally draggable.
  const gridColumnCount = Math.max(1, Math.floor((screenWidth - 1) / GRID_SIZE) + 1);
  const gridRowCount = Math.max(1, Math.floor((screenHeight - 1) / GRID_SIZE) + 1);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      setInvestmentFetchError(null);
      if (investmentRunPending) {
        setLatestInvestment(null);
        return () => { active = false; };
      }
      setInvestmentLoading(true);
      fetchLatestInvestment()
        .then((result) => {
          if (active) {
            setLatestInvestment(result);
            setMarketRegime(
              result?.market?.observed_regime
                || result?.market?.predicted_regime
                || null,
            );
          }
        })
        .catch((error) => {
          if (active) setInvestmentFetchError(error?.message || '無法取得模型結果');
        })
        .finally(() => {
          if (active) setInvestmentLoading(false);
        });
      return () => { active = false; };
    }, [investmentRunPending, investmentRetry]),
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setMarketChartLoading(true);
      setMarketChartError(null);
      fetchLatestStockCharts(MARKET_CHART_SYMBOL)
        .then((result) => {
          if (active) {
            setMarketCharts(result?.data || null);
            setMarketChartLoading(false);
          }
        })
        .catch((error) => {
          if (active) {
            setMarketCharts(null);
            setMarketChartLoading(false);
            setMarketChartError(error?.message || '無法載入大盤圖表資料');
          }
        });

      return () => {
        active = false;
      };
    }, []),
  );

  // Login and settings requests publish their completed result through context.
  // Do not leave Home stuck with the 409 it received during that computation.
  const resolvedInvestment = investmentRunPending ? null : investmentResult || latestInvestment;
  const market = resolvedInvestment?.market || {};
  const chartPoints = Array.isArray(marketCharts?.points) ? marketCharts.points : [];
  const latestChartPoint = chartPoints[chartPoints.length - 1];
  const investmentSnapshot = resolvedInvestment?.market_snapshot || resolvedInvestment?.marketSnapshot;
  const marketSnapshot = latestChartPoint
    ? { ...investmentSnapshot, ...latestChartPoint }
    : investmentSnapshot || null;
  const modelStatusError = investmentRunError || investmentFetchError;
  const modelStatusMessage = investmentRunPending
    ? '正在計算模型一、二，完成後會自動更新…'
    : modelStatusError
      ? `模型結果載入失敗：${modelStatusError}`
      : investmentLoading ? '正在讀取模型結果…' : '尚未取得模型結果';
  const marketDataDate = latestChartPoint?.date || marketSnapshot?.date;
  const regimeProbabilities = getRegimeProbabilities(market);
  const hasRegimeProbabilityData = regimeProbabilities.some(
    ({ probability }) => probability !== null,
  );
  // The main status image represents the currently observed regime. The
  // probability bars below remain the model's forecast for the next period.
  const dominantRegimeKey = market.observed_regime
    ? getMarketStatusKey(market.observed_regime)
    : getDominantRegimeKey(
      market,
      market.predicted_regime || (resolvedInvestment ? marketRegime : null),
    );
  const marketKey = dominantRegimeKey || 'sideways';
  const marketStatus = getMarketStatusConfig(marketKey);
  const orderedRegimeProbabilities = [...regimeProbabilities].sort((left, right) => {
    if (left.probability === null) {
      return right.probability === null ? 0 : 1;
    }
    if (right.probability === null) {
      return -1;
    }
    return right.probability - left.probability;
  });
  const durationLabel = formatDuration(market);
  const elapsedDuration = formatElapsedDuration(market);
  const durationMatch = durationLabel.match(/^(.+?)(週)$/);
  const durationValue = durationMatch ? durationMatch[1] : durationLabel;
  const durationUnit = durationMatch ? durationMatch[2] : null;
  const marketReturnPercent = getMarketReturnPercent(
    marketSnapshot,
    marketCharts,
  );
  const marketChangeLabel = formatMarketChange(marketReturnPercent);
  const marketReturnTone = getMarketReturnTone(marketReturnPercent);

  const warningWidth = Math.min(screenWidth * 0.84, 485);
  const noticeSize = Math.min(28, Math.max(22, warningWidth * (26 / 318)));
  const warningHeight = Math.max(38, noticeSize + 12);
  const marketWarningText = getMarketWarning(dominantRegimeKey, durationLabel);
  const statusWidth = Math.min(screenWidth * 0.31, 150);
  const changeWidth = Math.min(screenWidth * 0.22, 108);
  const statusPillHeight = Math.max(
    28,
    Math.min(32, screenWidth * (30 / 438)),
  );
  const statusHeight = statusPillHeight;
  const changeHeight = statusPillHeight;
  const changeMarginTop = -8;
  const statusIconScale = Math.min(0.7, statusPillHeight / 24);
  const statusIconWidth = marketStatus.statusAssetWidth * statusIconScale;
  const statusIconHeight = marketStatus.statusAssetHeight * statusIconScale;
  const summaryReferenceScale = Math.min(1, screenWidth / 586);
  const summaryWidth = Math.min(screenWidth * 0.9, 500);
  const summaryGap = Math.max(10, Math.min(16, screenWidth * (16 / 438)));
  const summaryMetricHeight = Math.min(
    96,
    Math.max(90, screenWidth * (143 / 586)),
  );
  const statusRowWidth = Math.min(screenWidth * 0.85, 500);
  const summaryBorderRadius = Math.max(
    11,
    Math.min(18, screenWidth * (18 / 586)),
  );
  const summaryBorderWidth = Math.max(
    1.5,
    Math.min(2, screenWidth * (2 / 586)),
  );
  const summaryHorizontalPadding = Math.max(
    8,
    Math.min(12, screenWidth * (12 / 586)),
  );
  const extraChartWidth = screenWidth;
  const activeTab =
    HOME_TABS.find((tab) => tab.key === activeHomeTab) || HOME_TABS[0];
  const activeChartHeight = extraChartWidth * HOME_CHART_RATIOS[activeTab.key];
  const homeDataRows = buildHomeDataRows(
    marketSnapshot,
    activeTab.key,
    marketCharts,
  );
  const isWideMarketAnimal = marketStatus.layout === 'wide';
  const marketAnimalWidth = isWideMarketAnimal ? Math.min(screenWidth, 575) : Math.min(screenWidth * 0.84, 475);
  const marketAnimalImageHeight = marketAnimalWidth / marketStatus.aspectRatio;
  // Sideways.svg includes empty space above the snake. Crop that space only.
  const marketAnimalImageTop = isWideMarketAnimal ? -marketAnimalWidth * (125 / 575) : 0;
  const marketAnimalHeight = isWideMarketAnimal ? marketAnimalWidth * (272 / 575) : marketAnimalImageHeight;
  const probabilityWidth = Math.min(screenWidth * 0.9, 500);
  const probabilityPadding = Math.max(
    12,
    Math.min(16, screenWidth * (14 / 432)),
  );
  const probabilityRowHeight = Math.max(
    32,
    Math.min(40, screenWidth * (38 / 432)),
  );
  const probabilityRowGap = Math.max(
    6,
    Math.min(10, screenWidth * (10 / 432)),
  );
  const probabilityLabelWidth = Math.max(
    48,
    Math.min(58, screenWidth * (54 / 432)),
  );
  const probabilityLabelFontSize = Math.max(
    14,
    Math.min(18, screenWidth * (18 / 432)),
  );
  const probabilityLabelLineHeight = probabilityLabelFontSize * 1.2;
  const probabilityValueWidth = Math.max(
    52,
    Math.min(64, screenWidth * (60 / 432)),
  );
  const probabilityValueFontSize = Math.max(
    14,
    Math.min(19, screenWidth * (19 / 432)),
  );
  const probabilityValueLineHeight = probabilityValueFontSize * 1.2;
  const probabilityPanelHeight =
    probabilityPadding * 2 + 24 +
    probabilityRowHeight * REGIME_ORDER.length +
    probabilityRowGap * (REGIME_ORDER.length - 1);
  const probabilityGap = Math.max(10, screenWidth * 0.025);
  const marketAnimalMarginTop = Math.max(18, screenWidth * 0.04);
  const openAnalyze = useCallback(() => {
    navigation.navigate('Analyze');
  }, [navigation]);

  return (
    <View style={[styles.container, { width: screenWidth }]}>
      <View pointerEvents="none" style={styles.gridBackground}>
        {Array.from({ length: gridColumnCount }, (_, index) => (
          <View
            key={`vertical-grid-${index}`}
            style={[styles.gridVerticalLine, { left: index * GRID_SIZE }]}
          />
        ))}
        {Array.from({ length: gridRowCount }, (_, index) => (
          <View
            key={`horizontal-grid-${index}`}
            style={[styles.gridHorizontalLine, { top: index * GRID_SIZE }]}
          />
        ))}
      </View>
      <ScrollView
        style={styles.screenScroll}
        horizontal={false}
        bounces={false}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
        onScroll={({ nativeEvent }) => {
          setScrollOffset(nativeEvent.contentOffset.y);
        }}
        scrollEventThrottle={16}
        contentContainerStyle={[
          styles.content,
          {
            width: screenWidth,
            paddingTop: insets.top + 32,
            paddingBottom: insets.bottom + 132,
          },
        ]}
      >
        <InAppAlertBanner notifications={priceAlerts.notifications} onDismissAll={priceAlerts.dismissAll} width={warningWidth} />
        <View
          accessibilityLabel={marketWarningText}
          style={[
            styles.marketWarning,
            {
              width: warningWidth,
              height: warningHeight,
              borderRadius: Math.max(10, warningWidth * 0.025),
              paddingHorizontal: Math.max(10, warningWidth * 0.025),
            },
          ]}
        >
          <AssetSvg
            asset={NOTICE_IMAGE}
            width={noticeSize}
            height={noticeSize}
            accessibilityLabel="Warning"
            pointerEvents="none"
          />
          <Text
            style={[
              styles.marketWarningText,
              {
                marginLeft: Math.max(8, warningWidth * 0.018),
                fontSize: Math.max(11, Math.min(14, warningWidth * (11 / 318))),
                lineHeight: Math.max(16, Math.min(20, warningWidth * (16 / 318))),
              },
            ]}
          >
            {marketWarningText}
          </Text>
        </View>

        <View
          style={[
            styles.statusRow,
            {
              width: statusRowWidth,
              height: statusHeight,
            },
          ]}
        >
          <View
            accessibilityLabel={`目前市場狀態：${dominantRegimeKey ? marketStatus.label : '等待資料'}`}
            style={[
              styles.statusPill,
              {
                width: statusWidth,
                height: statusHeight,
                borderColor: '#D9D9D9',
              },
            ]}
          >
            <Text
              style={styles.statusPillText}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.72}
            >
              {dominantRegimeKey ? '目前市場狀態' : '等待市場資料'}
            </Text>
            {dominantRegimeKey ? <AssetSvg
              asset={marketStatus.statusAsset}
              width={statusIconWidth}
              height={statusIconHeight}
              style={styles.statusPillIcon}
              pointerEvents="none"
              accessibilityLabel={`${marketStatus.label}趨勢圖示`}
            /> : null}
          </View>
        </View>

        <View
          style={[
            styles.summaryMetrics,
            {
              width: summaryWidth,
              gap: summaryGap,
              height: summaryMetricHeight,
            },
          ]}
        >
          <SummaryMetric
            label="預估剩餘"
            elapsed={elapsedDuration.value}
            elapsedUnit={elapsedDuration.unit}
            speechBubble
            value={durationValue}
            unit={durationUnit}
            accent={marketStatus.borderColor || marketStatus.accent}
            valueColor={marketStatus.summaryMetricColor || marketStatus.metricColor}
            backgroundColor={marketStatus.metricBackgroundColor}
            textScale={summaryReferenceScale}
            borderRadius={summaryBorderRadius}
            borderWidth={summaryBorderWidth}
            horizontalPadding={summaryHorizontalPadding}
          />
          <SummaryMetric
            label="股價漲跌"
            value={formatNumber(marketSnapshot?.change)}
            accent={marketStatus.borderColor || marketStatus.accent}
            valueColor={marketStatus.summaryMetricColor || marketStatus.metricColor}
            backgroundColor={marketStatus.metricBackgroundColor}
            textScale={summaryReferenceScale}
            borderRadius={summaryBorderRadius}
            borderWidth={0}
            horizontalPadding={summaryHorizontalPadding}
          />
          <SummaryMetric
            label="收盤"
            value={formatNumber(marketSnapshot?.close)}
            accent={marketStatus.borderColor || marketStatus.accent}
            valueColor={marketStatus.summaryMetricColor || marketStatus.metricColor}
            backgroundColor={marketStatus.metricBackgroundColor}
            textScale={summaryReferenceScale}
            borderRadius={summaryBorderRadius}
            borderWidth={0}
            horizontalPadding={summaryHorizontalPadding}
          />
        </View>

        <View
          style={[
            styles.marketStage,
            {
              width: screenWidth,

            },
          ]}
        >
          {hasRegimeProbabilityData ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`目前市場狀態：${marketStatus.label}`}
              onPress={openAnalyze}
              style={[
                styles.marketAnimal,
                {
                  width: marketAnimalWidth,
                  height: marketAnimalHeight,
                  marginTop: marketAnimalMarginTop,
                },
              ]}
            >
              <AssetSvg
                asset={marketStatus.asset}
                width={marketAnimalWidth}
                height={marketAnimalImageHeight}
                pointerEvents="none"
                style={
                  isWideMarketAnimal
                    ? {
                        position: 'absolute',
                        top: marketAnimalImageTop,
                        left: 0,
                      }
                    : undefined
                }
                accessibilityLabel={`目前市場狀態：${marketStatus.label}`}
              />
            </Pressable>
          ) : (
            <View
              style={[
                styles.marketAnimalPlaceholder,
                {
                  width: marketAnimalWidth,
                  height: marketAnimalHeight,
                  marginTop: marketAnimalMarginTop,
                },
              ]}
            >
              <Text style={styles.marketAnimalPlaceholderText}>
                {modelStatusMessage}
              </Text>
              {!investmentRunPending && !investmentLoading ? (
                <Pressable accessibilityRole="button" accessibilityLabel="重新讀取模型結果"
                  onPress={() => setInvestmentRetry((current) => current + 1)}
                  style={{ padding: 12 }}>
                  <Text style={{ color: '#D9D9D9', textDecorationLine: 'underline' }}>重新讀取</Text>
                </Pressable>
              ) : null}
            </View>
          )}

          <View style={{ width: summaryWidth, alignItems: 'flex-end', marginTop: changeMarginTop }}>
            <View
              accessibilityLabel={`加權指數較前一交易日漲跌幅：${marketChangeLabel}，資料日期：${marketDataDate || '未知'}`}
              style={[
                styles.statusPill,
                styles.changePill,
                {
                  width: changeWidth,
                  height: changeHeight,
                  borderColor: marketReturnTone.accent,
                },
              ]}
            >
              <Text
                style={[styles.statusPillText, { color: marketReturnTone.metricColor }]}
                numberOfLines={1}
              >
                {marketChangeLabel}
              </Text>
            </View>
          </View>

          <ProbabilityBars
            probabilities={orderedRegimeProbabilities}
            width={probabilityWidth}
            height={probabilityPanelHeight}
            rowHeight={probabilityRowHeight}
            rowGap={probabilityRowGap}
            padding={probabilityPadding}
            marginTop={probabilityGap}
            labelWidth={probabilityLabelWidth}
            labelFontSize={probabilityLabelFontSize}
            labelLineHeight={probabilityLabelLineHeight}
            valueWidth={probabilityValueWidth}
            valueFontSize={probabilityValueFontSize}
            valueLineHeight={probabilityValueLineHeight}
          />

        </View>



        <View
          style={[
            styles.homeDetails,
            {
              width: extraChartWidth,
              marginTop: Math.max(28, screenWidth * 0.08),
            },
          ]}
        >
          <View style={styles.homeTabs}>
            {HOME_TABS.map((tab) => {
              const selected = tab.key === activeTab.key;
              return (
                <Pressable
                  key={tab.key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  accessibilityLabel={tab.label}
                  onPress={() => setActiveHomeTab(tab.key)}
                  style={[
                    styles.homeTab,
                    selected && styles.homeTabSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.homeTabText,
                      selected && styles.homeTabTextSelected,
                    ]}
                    numberOfLines={1}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View
            style={[
              styles.chartImageWrap,
              {
                borderRadius: Math.max(8, screenWidth * 0.025),
                minHeight: activeChartHeight || Math.max(88, screenWidth * 0.22),
              },
            ]}
          >
            {marketChartLoading ? (
              <View
                accessibilityRole="progressbar"
                accessibilityLabel="載入大盤圖表中"
                style={[styles.homeChartStatus, { height: activeChartHeight }]}
              >
                <Text style={styles.homeChartStatusText}>載入大盤圖表中…</Text>
              </View>
            ) : marketChartError ? (
              <View
                accessibilityRole="alert"
                accessibilityLabel={marketChartError}
                style={[styles.homeChartStatus, { height: activeChartHeight }]}
              >
                <Text style={styles.homeChartStatusText}>{marketChartError}</Text>
              </View>
            ) : activeTab.key === 'recent' ? (
              <RecentCharts data={marketCharts} width={extraChartWidth} />
            ) : activeTab.key === 'institutional' ? (
              <InstitutionalChart data={marketCharts} width={extraChartWidth} />
            ) : (
              <MarginChart data={marketCharts} width={extraChartWidth} />
            )}
          </View>

          <HomeDataTable rows={homeDataRows} screenWidth={screenWidth} />
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
  gridBackground: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#2E2F2E',
  },
  gridVerticalLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  gridHorizontalLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  tabBar: {
    backgroundColor: '#D9D9D9',
    borderTopWidth: 0,
    height: 65,
    paddingBottom: 10,
    paddingTop: 10,
    paddingHorizontal: 20,
  },
  content: {
    alignItems: 'center',
  },
  marketWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#607080',
    borderWidth: 1,
    borderColor: '#D9D9D9',
    overflow: 'hidden',
  },
  marketWarningText: {
    flex: 1,
    color: '#F0F0F0',
    fontWeight: '400',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2E2F2E',
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 6,
    overflow: 'hidden',
  },
  changePill: {
    paddingHorizontal: 6,
  },
  statusPillText: {
    flexShrink: 1,
    minWidth: 0,
    color: '#F5F5F5',
    fontFamily: 'Goldman',
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'center',
  },
  statusPillIcon: {
    marginLeft: 4,
    flexShrink: 0,
  },
  summaryMetrics: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: 16,
  },
  summaryMetric: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#202120',
  },
  summaryMetricLabel: {
    alignSelf: 'stretch',
    textAlign: 'left',
  },
  summaryMetricValue: {
    width: '100%',
    minWidth: 0,
    marginTop: 2,
    fontFamily: 'Goldman',
    fontWeight: '400',
    textAlign: 'center',
  },
  summaryMetricUnit: {
    fontWeight: '400',
  },
  marketStage: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  probabilityPanel: {
    marginTop: 0,
    flexDirection: 'column',
    justifyContent: 'flex-start',
    backgroundColor: '#202120',
    borderRadius: 10,
  },
  probabilityTitle: {
    height: 24,
    color: '#999999',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  probabilityRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  probabilityLabel: {
    width: 46,
    fontSize: 12,
    lineHeight: 16,
  },
  probabilityTrack: {
    flex: 1,
    height: 5,
    marginHorizontal: 8,
    overflow: 'hidden',
    borderRadius: 3,
    backgroundColor: '#4A4A4A',
  },
  probabilityFill: {
    height: '100%',
    borderRadius: 3,
  },
  probabilityValue: {
    width: 52,
    flexShrink: 0,
    fontFamily: 'Goldman',
    fontSize: 14,
    lineHeight: 17,
    textAlign: 'right',
  },
  marketAnimalPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  marketAnimalPlaceholderText: {
    color: 'rgba(245, 245, 245, 0.62)',
    fontFamily: 'Goldman',
    fontSize: 13,
  },
  homeDetails: {
    alignItems: 'stretch',
  },
  homeTabs: {
    width: '100%',
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: '#202120',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.22)',
  },
  homeTab: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    paddingVertical: 7,
  },
  homeTabSelected: {
    backgroundColor: '#000000',
  },
  homeTabText: {
    color: 'rgba(245, 245, 245, 0.58)',
    fontFamily: 'Goldman',
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'center',
  },
  homeTabTextSelected: {
    color: '#FFFFFF',
  },
  homeDataTable: {
    width: '100%',
    backgroundColor: '#202120',
  },
  homeDataRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  homeDataRowAlt: {
    backgroundColor: '#252625',
  },
  homeDataCell: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  homeDataCellSingle: {
    justifyContent: 'flex-start',
  },
  homeDataCellPaired: {
    justifyContent: 'center',
  },
  homeDataGroup: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  homeDataSingleGroup: {
    width: '100%',
  },
  homeDataLabel: {
    flexShrink: 0,
    color: '#F5F5F5',
    fontFamily: 'Goldman',
    fontSize: 16,
    lineHeight: 21,
    textAlign: 'right',
  },
  homeDataLabelSingle: {
    textAlign: 'left',
  },
  homeDataValue: {
    flexShrink: 1,
    minWidth: 0,
    marginLeft: 12,
    transform: [{ translateX: 6 }],
    color: '#2CB331',
    fontFamily: 'Goldman',
    fontSize: 23,
    lineHeight: 28,
    textAlign: 'left',
  },
  homeDataValuePositive: {
    color: '#2CB331',
  },
  homeDataValueNegative: {
    color: '#C33636',
  },
  homeDataUnit: {
    color: '#D9D9D9',
    fontFamily: 'Goldman',
    fontSize: 12,
    lineHeight: 16,
  },
  emptyHomeData: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#202120',
  },
  emptyHomeDataText: {
    color: 'rgba(245, 245, 245, 0.68)',
    fontFamily: 'Goldman',
    fontSize: 13,
  },
  marketAnimal: {
    position: 'relative',
    zIndex: 2,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  chartImageWrap: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#2E2F2E',
    alignItems: 'center',
  },
  homeChartStatus: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2E2F2E',
  },
  homeChartStatusText: {
    color: '#B9B9B9',
    fontFamily: 'Goldman',
    fontSize: 13,
  },
});
