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
import MeetingProcess from './MeetingProcess';
import {
  InstitutionalChart,
  MarginChart,
  RecentCharts,
} from '../components/StockCharts';
import { TAB_BAR_STYLE } from '../components/TabBar';
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
const ACTION_WINDOW_IMAGE = require('../assets/image/ActionWindow.svg');
const AGENT_IMAGE = require('../assets/image/agent.svg');
const GRID_SIZE = 44;
const MARKET_CHART_SYMBOL = 'Y9999';
const HOME_CHART_RATIOS = {
  recent: (214 + 86) / 576,
  institutional: 298 / 576,
  margin: 298 / 576,
};
const REGIME_ORDER = ['bull', 'sideways', 'bear'];
const MARKET_WARNING_TEXT =
  '目前市場仍為多頭，耐久度已進入成熟期。此階段散戶最常犯的錯誤是看到上漲就追加倉位，忽略結構轉折風險。';
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
    defaultTab: 'recent',
    aspectRatio: 428 / 474,
  },
  bear: {
    asset: BEAR_IMAGE,
    label: '熊市',
    statusAsset: CURRENT_STATUS_FALL_IMAGE,
    statusAssetWidth: 20,
    statusAssetHeight: 20,
    accent: '#2CB331',
    metricColor: '#7FF36A',
    defaultTab: 'margin',
    aspectRatio: 229 / 224,
  },
  sideways: {
    asset: SIDEWAYS_IMAGE,
    label: '盤整',
    statusAsset: CURRENT_STATUS_FLAT_IMAGE,
    statusAssetWidth: 28,
    statusAssetHeight: 13,
    accent: '#B28A2E',
    borderColor: SIDEWAYS_FRAME_COLOR,
    metricColor: '#E7CD95',
    summaryMetricColor: SIDEWAYS_METRIC_COLOR,
    metricBackgroundColor: SIDEWAYS_METRIC_BACKGROUND,
    defaultTab: 'institutional',
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
  const months = toFiniteNumber(market?.expected_regime_duration_months);
  if (months !== null && months > 0) {
    const weeks = months * 4.345;
    const lower = Math.max(1, Math.floor(weeks));
    const upper = Math.max(lower, Math.ceil(weeks));
    return lower === upper ? `${lower}週` : `${lower}-${upper}週`;
  }

  const steps = toFiniteNumber(market?.expected_regime_duration_steps);
  return steps !== null && steps > 0 ? `${Math.round(steps)}步` : '--';
}

function getMarketReturnPercent(snapshot, chartData) {
  const chartPoints = Array.isArray(chartData?.points) ? chartData.points : [];
  const latestChartPoint = chartPoints[chartPoints.length - 1];
  return toFiniteNumber(
    latestChartPoint?.returnPercent ?? snapshot?.returnPercent,
  );
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
  value,
  unit,
  accent,
  valueColor,
  textScale,
  borderRadius,
  borderWidth,
  horizontalPadding,
  backgroundColor,
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
      <Text
        style={[
          styles.summaryMetricLabel,
          {
            color: valueColor || accent,
            fontSize: 16 * textScale,
            lineHeight: 19 * textScale,
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
            fontSize: 38 * textScale,
            lineHeight: 42 * textScale,
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
  const hasChartMarginData =
    latestChartPoint &&
    (latestChartPoint.marginBalance !== undefined ||
      latestChartPoint.shortBalance !== undefined);
  const marginUnit = hasChartMarginData ? '張' : '千元';

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
    actionWindowEnabled,
    investmentResult,
  } = useAppSettings();
  const [showMeetingProcess, setShowMeetingProcess] = useState(false);
  const [marketRegime, setMarketRegime] = useState(null);
  const [latestInvestment, setLatestInvestment] = useState(null);
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

      fetchLatestInvestment()
        .then((result) => {
          if (active) {
            setLatestInvestment(result);
            setMarketRegime(result?.market?.predicted_regime || null);
          }
        })
        .catch(() => {});

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

  useEffect(() => {
    navigation.setOptions({
      tabBarStyle:
        showMeetingProcess
          ? { display: 'none' }
          : TAB_BAR_STYLE,
    });
  }, [navigation, showMeetingProcess]);

  const market = latestInvestment?.market || {};
  const discussionReady = Boolean(
    investmentResult?.discussion || latestInvestment?.discussion,
  );
  const marketSnapshot =
    latestInvestment?.market_snapshot || latestInvestment?.marketSnapshot || null;
  const regimeProbabilities = getRegimeProbabilities(market);
  const hasRegimeProbabilityData = regimeProbabilities.some(
    ({ probability }) => probability !== null,
  );
  const dominantRegimeKey = getDominantRegimeKey(
    market,
    marketRegime || market.predicted_regime,
  );
  const marketKey = dominantRegimeKey || 'sideways';
  const marketStatus = getMarketStatusConfig(marketKey);
  const orderedRegimeProbabilities = [...regimeProbabilities].sort((left, right) => {
    if (left.probability === null) {
      return 1;
    }
    if (right.probability === null) {
      return -1;
    }
    return right.probability - left.probability;
  });
  const durationLabel = formatDuration(market);
  const durationMatch = durationLabel.match(/^(.+?)(週|步)$/);
  const durationValue = durationMatch ? durationMatch[1] : durationLabel;
  const durationUnit = durationMatch ? durationMatch[2] : null;
  const durationSteps = toFiniteNumber(market.expected_regime_duration_steps);
  const remainingStepsLabel = durationSteps === null
    ? `預估剩餘 ${durationLabel}`
    : `剩餘 ${formatNumber(durationSteps, 1)}步`;
  const marketReturnPercent = getMarketReturnPercent(
    marketSnapshot,
    marketCharts,
  );
  const marketChangeLabel = formatMarketChange(marketReturnPercent);
  const marketReturnTone = getMarketReturnTone(marketReturnPercent);

  useEffect(() => {
    setActiveHomeTab(marketStatus.defaultTab);
  }, [marketKey, marketStatus.defaultTab]);

  const warningWidth = Math.min(screenWidth * 0.84, 485);
  const noticeSize = Math.min(46, Math.max(36, warningWidth * (46 / 485)));
  const warningHeight = Math.max(
    noticeSize + 20,
    Math.min(98, screenWidth * (62 / 438)),
  );
  const marketWarningText = MARKET_WARNING_TEXT;
  const statusWidth = Math.min(screenWidth * 0.31, 150);
  const forecastWidth = Math.min(screenWidth * 0.22, 110);
  const changeWidth = Math.min(screenWidth * 0.22, 108);
  const statusPillHeight = Math.max(
    28,
    Math.min(32, screenWidth * (30 / 438)),
  );
  const statusHeight = statusPillHeight;
  const forecastHeight = statusPillHeight;
  const changeHeight = statusPillHeight;
  const statusIconScale = Math.min(0.7, statusPillHeight / 24);
  const statusIconWidth = marketStatus.statusAssetWidth * statusIconScale;
  const statusIconHeight = marketStatus.statusAssetHeight * statusIconScale;
  const statusGap = Math.max(8, screenWidth * 0.018);
  const summaryReferenceScale = Math.min(1, screenWidth / 586);
  const summaryWidth = Math.min(screenWidth * 0.84, 500);
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
  const actionWidth = Math.min(screenWidth * 0.86, 500);
  const actionHeight = actionWidth * (100 / 440);
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
  const nonWideAnimalScale = marketKey === 'bull'
    ? 0.82
    : marketKey === 'bear'
      ? 0.8
      : 0.6;
  const marketAnimalWidth = isWideMarketAnimal
    ? screenWidth
    : Math.min(
        extraChartWidth * (
          marketKey === 'bull'
            ? 0.84
            : marketKey === 'bear'
              ? 0.84
              : 0.72
        ),
        screenWidth * nonWideAnimalScale,
      );
  const marketAnimalImageHeight = isWideMarketAnimal
    ? marketAnimalWidth * (447 / 575)
    : marketAnimalWidth / marketStatus.aspectRatio;
  const cropBullAnimal = !isWideMarketAnimal && marketKey === 'bull';
  const bullAnimalInset = cropBullAnimal
    ? marketAnimalImageHeight * (34 / 369)
    : 0;
  const bullAnimalVisualGap = cropBullAnimal
    ? Math.max(16, screenWidth * (20 / 438))
    : 0;
  const marketAnimalImageTop = isWideMarketAnimal
    ? -(marketAnimalWidth * (125 / 575))
    : cropBullAnimal
      ? bullAnimalVisualGap - bullAnimalInset
      : 0;
  const marketAnimalHeight = isWideMarketAnimal
    ? marketAnimalWidth / (575 / 272)
    : cropBullAnimal
      ? Math.max(
          0,
          marketAnimalImageHeight + marketAnimalImageTop - bullAnimalInset,
        )
      : marketAnimalImageHeight;
  const agentWidth = actionWidth;
  const agentHeight = agentWidth * (65 / 497);
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
    probabilityPadding * 2 +
    probabilityRowHeight * REGIME_ORDER.length +
    probabilityRowGap * (REGIME_ORDER.length - 1);
  const probabilityGap = Math.max(10, screenWidth * 0.025);
  const agentGap = Math.max(24, screenWidth * 0.06);
  const marketAnimalMarginTop = cropBullAnimal
    ? 0
    : Math.max(18, screenWidth * 0.04);
  const marketStageTop =
    insets.top +
    32 +
    warningHeight +
    14 +
    Math.max(statusHeight, forecastHeight) +
    16 +
    summaryMetricHeight;
  const agentStageTop =
    marketAnimalMarginTop +
    marketAnimalHeight +
    probabilityGap +
    probabilityPanelHeight +
    agentGap;
  const agentTop =
    marketStageTop + agentStageTop;

  const openAnalyze = useCallback(() => {
    navigation.navigate('Analyze', {
      categoryId: null,
      investorType: null,
      customGroup: false,
    });
  }, [navigation]);

  const closeMeetingProcess = useCallback(() => {
    setShowMeetingProcess(false);
  }, []);

  const openMeetingProcess = useCallback(() => {
    setShowMeetingProcess(true);
  }, []);

  if (showMeetingProcess) {
    return (
      <MeetingProcess
        onBack={closeMeetingProcess}
        style={styles.meetingProcessOverlay}
      />
    );
  }

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
                fontSize: Math.max(12, Math.min(18, warningWidth * (18 / 631))),
                lineHeight: Math.max(17, Math.min(24, warningWidth * (24 / 631))),
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
              height: Math.max(statusHeight, forecastHeight, changeHeight),
              gap: statusGap,
            },
          ]}
        >
          <View
            accessibilityLabel={`目前市場狀態：${marketStatus.label}`}
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
              目前市場狀態
            </Text>
            <AssetSvg
              asset={marketStatus.statusAsset}
              width={statusIconWidth}
              height={statusIconHeight}
              style={styles.statusPillIcon}
              pointerEvents="none"
              accessibilityLabel={`${marketStatus.label}趨勢圖示`}
            />
          </View>
          <View
            accessibilityLabel={remainingStepsLabel}
            style={[
              styles.statusPill,
              styles.forecastPill,
              {
                width: forecastWidth,
                height: forecastHeight,
                borderColor: '#D9D9D9',
              },
            ]}
          >
              <Text style={styles.statusPillText} numberOfLines={1}>
                {remainingStepsLabel}
              </Text>
          </View>
          <View
            accessibilityLabel={`市場報酬率：${marketChangeLabel}`}
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
            borderWidth={summaryBorderWidth}
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
            borderWidth={summaryBorderWidth}
            horizontalPadding={summaryHorizontalPadding}
          />
        </View>

        <View
          style={[
            styles.marketStage,
            {
              width: screenWidth,
              height:
                marketAnimalMarginTop +
                marketAnimalHeight +
                probabilityGap +
                probabilityPanelHeight +
                agentGap +
                agentHeight,
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
                  isWideMarketAnimal || cropBullAnimal
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
                等待後端市場機率
              </Text>
            </View>
          )}

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

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Agent"
            onPress={openMeetingProcess}
            style={[
              styles.agentButton,
              {
                left: (screenWidth - agentWidth) / 2,
                top: agentStageTop,
              },
            ]}
          >
            <AssetSvg
              asset={AGENT_IMAGE}
              width={agentWidth}
              height={agentHeight}
            />
          </Pressable>
        </View>

        {actionWindowEnabled ? (
          <AssetSvg
            asset={ACTION_WINDOW_IMAGE}
            width={actionWidth}
            height={actionHeight}
            style={{
              marginTop: Math.max(22, screenWidth * 0.055),
            }}
            accessibilityLabel="行動窗口開啟"
          />
        ) : null}

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
    ...StyleSheet.absoluteFillObject,
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
    fontFamily: 'Goldman',
    fontWeight: '400',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
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
  forecastPill: {
    paddingHorizontal: 8,
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
    fontFamily: 'Goldman',
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
    fontFamily: 'Goldman',
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
  probabilityRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  probabilityLabel: {
    width: 46,
    fontFamily: 'Goldman',
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
    backgroundColor: '#F3F3F3',
    alignItems: 'center',
  },
  homeChartStatus: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F4F4',
  },
  homeChartStatusText: {
    color: '#777777',
    fontFamily: 'Goldman',
    fontSize: 13,
  },
  agentButton: {
    position: 'absolute',
    zIndex: 3,
    elevation: 3,
  },
  meetingProcessOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 300,
    elevation: 40,
  },
});
