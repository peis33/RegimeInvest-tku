import React, { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Circle, Path, Svg } from 'react-native-svg';
import AssetSvg from '../components/AssetSvg';
import StockDetail from './StockDetail';
import AddGroupMenu from '../components/AddGroupMenu';
import GroupListModal from '../components/GroupListModal';
import { TAB_BAR_STYLE } from '../components/TabBar';
import { useAppSettings } from '../context/AppSettingsContext';
import { fetchLatestInvestment } from '../services/investmentApi';
import { getCustomGroupDisplayName } from '../utils/customGroups';
import useViewportDimensions from '../hooks/useViewportDimensions';

const ADD_IMAGE = require('../assets/image/add2.svg');
const MORE_IMAGE = require('../assets/image/more.svg');
const NOTICE_IMAGE = require('../assets/image/notice.svg');
const BACKGROUND_SUN = require('../assets/image/background_sun.svg');
const BACKGROUND_CLOUD = require('../assets/image/background_cloud.svg');
const BACKGROUND_RAIN = require('../assets/image/background_rain.svg');
const STAR_IMAGE = require('../assets/image/star.svg');

const BACKGROUNDS = {
  sun: BACKGROUND_SUN,
  cloud: BACKGROUND_CLOUD,
  rain: BACKGROUND_RAIN,
};

const INVESTOR_LABELS = {
  large: '大戶',
  normal: '中間戶',
  small: '小股民',
  大戶: '大戶',
  中間戶: '中間戶',
  小股民: '小股民',
};

const RISK_LABELS = {
  aggressive: '積極派',
  neutral: '中立派',
  conservative: '保守派',
  積極派: '積極派',
  中立派: '中立派',
  保守派: '保守派',
};

const PORTFOLIO_DETAIL_COLORS = [
  '#F1D56A',
  '#6CDD49',
  '#EE8A70',
  '#6CA6D8',
  '#C58BD8',
];
// 圓盤與股票明細共用同一組排名顏色，確保同一支股票在兩處顯示一致。
const PORTFOLIO_DONUT_COLORS = PORTFOLIO_DETAIL_COLORS;
const PORTFOLIO_CASH_COLOR = '#050505';

const PORTFOLIO_SUMMARY_SCALE = 0.94;

const STOCKS = [
  { symbol: '2330', name: '台積電', tone: 'sun' },
  { symbol: '2454', name: '聯發科', tone: 'cloud' },
  { symbol: '3034', name: '聯詠', tone: 'rain' },
  { symbol: '2308', name: '台達電', tone: 'sun' },
  { symbol: '2382', name: '廣達', tone: 'sun' },
  { symbol: '2881', name: '富邦金', tone: 'cloud' },
  { symbol: '2303', name: '聯電', tone: 'rain' },
  { symbol: '2317', name: '鴻海', tone: 'sun' },
  { symbol: '2412', name: '中華電', tone: 'sun' },
  { symbol: '2882', name: '國泰金', tone: 'cloud' },
  { symbol: '2886', name: '兆豐金', tone: 'rain' },
  { symbol: '2891', name: '中信金', tone: 'sun' },
  { symbol: '2002', name: '中鋼', tone: 'sun' },
  { symbol: '2603', name: '長榮', tone: 'cloud' },
  { symbol: '1301', name: '台塑', tone: 'rain' },
  { symbol: '2892', name: '第一金', tone: 'sun' },
];

const INVESTOR_TITLES = {
  大戶: '大戶',
  中間戶: '中間戶',
  小股民: '小股民',
};

const INVESTOR_STOCKS = {
  大戶: [
    { symbol: '2330', name: '台積電', tone: 'sun' },
    { symbol: '2454', name: '聯發科', tone: 'cloud' },
    { symbol: '3034', name: '聯詠', tone: 'rain' },
    { symbol: '2308', name: '台達電', tone: 'sun' },
  ],
  中間戶: [
    { symbol: '2303', name: '聯電', tone: 'rain' },
    { symbol: '2382', name: '廣達', tone: 'sun' },
    { symbol: '2317', name: '鴻海', tone: 'sun' },
    { symbol: '2412', name: '中華電', tone: 'sun' },
    { symbol: '2603', name: '長榮', tone: 'cloud' },
    { symbol: '1301', name: '台塑', tone: 'rain' },
  ],
  小股民: [
    { symbol: '2881', name: '富邦金', tone: 'cloud' },
    { symbol: '2882', name: '國泰金', tone: 'cloud' },
    { symbol: '2886', name: '兆豐金', tone: 'rain' },
    { symbol: '2891', name: '中信金', tone: 'sun' },
    { symbol: '2002', name: '中鋼', tone: 'sun' },
    { symbol: '2892', name: '第一金', tone: 'sun' },
  ],
};

const CATEGORY_TITLES = {
  semiconductor: '半導體產業',
  ElectronicComponents: '電子零件產業',
  FinancialHolding: '金控產業',
};

const CATEGORY_STOCKS = {
  semiconductor: [
    { symbol: '2330', name: '台積電', tone: 'sun' },
    { symbol: '2454', name: '聯發科', tone: 'cloud' },
    { symbol: '3034', name: '聯詠', tone: 'rain' },
    { symbol: '2303', name: '聯電', tone: 'rain' },
  ],
  ElectronicComponents: [
    { symbol: '2308', name: '台達電', tone: 'sun' },
    { symbol: '2382', name: '廣達', tone: 'sun' },
    { symbol: '2317', name: '鴻海', tone: 'sun' },
  ],
  FinancialHolding: [
    { symbol: '2881', name: '富邦金', tone: 'cloud' },
    { symbol: '2882', name: '國泰金', tone: 'cloud' },
    { symbol: '2886', name: '兆豐金', tone: 'rain' },
    { symbol: '2891', name: '中信金', tone: 'sun' },
    { symbol: '2892', name: '第一金', tone: 'sun' },
  ],
};

function getStockGroupRouteParams(groupId) {
  const normalizedGroupId = groupId === 'ALL' ? 'all' : groupId;

  if (INVESTOR_STOCKS[normalizedGroupId]) {
    return {
      categoryId: null,
      investorType: normalizedGroupId,
      customGroup: false,
      customGroupId: null,
      stockGroup: normalizedGroupId,
    };
  }

  if (CATEGORY_STOCKS[normalizedGroupId]) {
    return {
      categoryId: normalizedGroupId,
      investorType: null,
      customGroup: false,
      customGroupId: null,
      stockGroup: normalizedGroupId,
    };
  }

  if (normalizedGroupId === 'all') {
    return {
      categoryId: null,
      investorType: null,
      customGroup: false,
      customGroupId: null,
      stockGroup: 'all',
    };
  }

  return null;
}

function StockCard({ stock, width, height, onPress }) {
  const scaleX = width / 218;
  const scaleY = height / 184;
  const parsedRank = Number(stock.recommendationRank);
  const recommendationRank = Number.isFinite(parsedRank) && parsedRank >= 1 && parsedRank <= 5
    ? Math.round(parsedRank)
    : null;
  const starCount = recommendationRank ? 6 - recommendationRank : 0;
  const starSize = Math.max(16, Math.min(23, 26 * scaleX));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={recommendationRank
        ? `${stock.symbol} ${stock.name}，推薦第${recommendationRank}名，${starCount}顆星`
        : `${stock.symbol} ${stock.name}`}
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
      {starCount > 0 ? (
        <View
          accessibilityLabel={`${starCount}顆推薦星等`}
          pointerEvents="none"
          style={[
            styles.cardStars,
            {
              // The supplied card SVG includes a right/bottom shadow outside
              // the blue body (body ends around x=198, y=160 in its
              // 218x184 viewBox). Keep the stars inside that blue body so
              // they match the reference instead of sitting on the shadow.
              right: 24 * scaleX,
              bottom: 31 * scaleY,
              zIndex: 2,
            },
          ]}
        >
          {Array.from({ length: starCount }).map((_, index) => (
            <AssetSvg
              key={`${stock.symbol}-star-${index}`}
              asset={STAR_IMAGE}
              width={starSize}
              height={starSize}
              pointerEvents="none"
            />
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

function toSummaryNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatSummaryNumber(value, maximumFractionDigits = 0) {
  const number = toSummaryNumber(value);
  if (number === null) {
    return '--';
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits,
  }).format(number);
}

function formatSummaryPercent(value) {
  const number = toSummaryNumber(value);
  if (number === null) {
    return '--';
  }

  const sign = number > 0 ? '+' : '';
  return `${sign}${formatSummaryNumber(number * 100, 1)}%`;
}

function getPortfolioWeight(row) {
  const rawWeight =
    row?.final_weight_percent ??
    row?.finalWeightPercent ??
    row?.weight_percent ??
    row?.weight;
  const weight = toSummaryNumber(rawWeight);

  if (weight === null) {
    return 0;
  }

  return Math.abs(weight) <= 1 ? weight * 100 : weight;
}

function isCashRow(row) {
  const assetType = String(row?.asset_type || row?.assetType || '').toLowerCase();
  const symbol = String(row?.stock_id ?? row?.symbol ?? '').toUpperCase();
  return assetType === 'cash' || symbol === 'CASH' || symbol === '現金';
}

function getExpectedReturn(row) {
  const value = toSummaryNumber(
    row?.expected_return ??
      row?.historical_return ??
      row?.historicalReturn,
  );

  if (value === null) {
    return null;
  }

  return Math.abs(value) <= 1 ? value : value / 100;
}

function getRiskValue(row) {
  const value = toSummaryNumber(row?.risk);

  if (value === null) {
    return null;
  }

  return Math.abs(value) <= 1 ? value : value / 100;
}

function getStockCardTone(row, fallbackTone = 'cloud') {
  const expectedReturn = getExpectedReturn(row);

  if (expectedReturn === null) {
    return fallbackTone;
  }

  if (expectedReturn > 0.01) {
    return 'sun';
  }

  if (expectedReturn < -0.01) {
    return 'rain';
  }

  return 'cloud';
}

function sortByRecommendation(rows) {
  return [...rows].sort((left, right) => {
    const leftScore = toSummaryNumber(left?.selection_score ?? left?.selectionScore);
    const rightScore = toSummaryNumber(right?.selection_score ?? right?.selectionScore);

    if (leftScore === null && rightScore === null) return 0;
    if (leftScore === null) return 1;
    if (rightScore === null) return -1;
    return rightScore - leftScore;
  });
}

function hasSuggestedPosition(row) {
  const shares = toSummaryNumber(row?.shares);
  if (shares !== null) {
    return shares > 0;
  }

  const amount = toSummaryNumber(row?.allocated_amount ?? row?.allocatedAmount);
  return amount !== null && amount > 0;
}

function getSummaryLabel(value, labels, fallback) {
  const normalized = String(value || '').trim();
  return labels[normalized] || normalized || fallback;
}

function getSummaryChipWidth(label, value, minimumWidth, scale = 1) {
  const labelWidth = String(label).length * 10;
  const valueText = String(value);
  const wideCharacterCount = (valueText.match(/[^\x00-\x7F]/g) || []).length;
  const narrowCharacterCount = valueText.length - wideCharacterCount;
  const valueWidth = wideCharacterCount * 22 + narrowCharacterCount * 15;

  return Math.max(
    minimumWidth * scale,
    Math.ceil((labelWidth + valueWidth + 22) * scale),
  );
}

function getBooleanSetting(...values) {
  for (const value of values) {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') return true;
      if (normalized === 'false') return false;
    }
  }

  return null;
}

function buildPortfolioSummary(profile, routeParams, portfolio) {
  const sourceProfile = profile || {};
  const routeProfile = routeParams || {};
  const investorValue =
    sourceProfile.investor_type ??
    sourceProfile.investorType ??
    routeProfile.investor_type ??
    routeProfile.investorType;
  const riskValue =
    sourceProfile.risk_preference ??
    sourceProfile.riskPreference ??
    routeProfile.risk_preference ??
    routeProfile.riskPreference;
  const budget =
    toSummaryNumber(
      sourceProfile.budget ??
        sourceProfile.investment_budget ??
        routeProfile.budget ??
        routeProfile.investment_budget,
    ) ?? null;

  const sourcePortfolio = Array.isArray(portfolio) && portfolio.length
    ? portfolio
    : [];
  const normalizedRows = sourcePortfolio
    .map((row) => ({
      ...row,
      weight: Math.max(0, getPortfolioWeight(row)),
    }));
  const allowFractional =
    getBooleanSetting(
      sourceProfile.allow_fractional,
      sourceProfile.allowFractional,
      routeProfile.allow_fractional,
      routeProfile.allowFractional,
      ...normalizedRows.map((row) => row.allow_fractional ?? row.allowFractional),
    ) ?? true;
  // Zero-share candidates are still present in the model's selected set, but
  // they are not actual recommendations and must not contribute to the
  // displayed portfolio or recommendation ranking.
  const rows = normalizedRows.filter((row) => row.weight > 0);
  const stockRows = rows.filter((row) => !isCashRow(row));
  const rankedStockRows = sortByRecommendation(
    normalizedRows.filter((row) => !isCashRow(row)),
  );
  const purchasedStockRows = rankedStockRows.filter(hasSuggestedPosition);
  const rawStockPercent = purchasedStockRows.reduce(
    (sum, row) => sum + Math.max(0, row.weight),
    0,
  );
  const stockPercent = Math.min(100, rawStockPercent);
  const cashPercent = Math.max(0, 100 - stockPercent);
  const sourceCashRow = normalizedRows.find((row) => isCashRow(row));
  const cashAmount = budget === null
    ? toSummaryNumber(sourceCashRow?.allocated_amount ?? sourceCashRow?.allocatedAmount)
    : (budget * cashPercent) / 100;
  const cashRow = sourceCashRow
    ? {
        ...sourceCashRow,
        weight: cashPercent,
        final_weight: cashPercent / 100,
        final_weight_percent: cashPercent,
        allocated_amount: cashAmount,
      }
    : null;
  const hasPurchasableStock = normalizedRows
    .filter((row) => !isCashRow(row))
    .some((row) => {
      const shares = toSummaryNumber(row.shares);
      const amount = toSummaryNumber(
        row.allocated_amount ?? row.allocatedAmount,
      );
      const price = toSummaryNumber(row.price);
      const minimumShares = allowFractional ? 1 : 1000;

      if (shares !== null) {
        return Math.floor(shares + 1e-6) >= minimumShares;
      }

      return (
        amount !== null &&
        price !== null &&
        price > 0 &&
        amount + 1e-6 >= price * minimumShares
      );
    });
  const stockCandidates = normalizedRows.filter((row) => !isCashRow(row));
  const budgetInsufficient =
    !hasPurchasableStock &&
    (stockCandidates.length > 0 || cashPercent >= 99.99);
  const expectedReturn = rows.reduce((sum, row) => {
    const value = getExpectedReturn(row);
    return value === null ? sum : sum + (value * row.weight) / 100;
  }, 0);
  const weightedRisk = stockRows.reduce((sum, row) => {
    const value = getRiskValue(row);
    return value === null ? sum : sum + (value * row.weight) / 100;
  }, 0);
  const normalizedRisk = stockPercent > 0
    ? weightedRisk / (stockPercent / 100)
    : 0;
  const portfolioRiskLabel =
    normalizedRisk <= 0.012
      ? '低等風險'
      : normalizedRisk <= 0.018
        ? '中等風險'
        : '高等風險';
  const portfolioRiskTone =
    normalizedRisk <= 0.012
      ? 'low'
      : normalizedRisk <= 0.018
        ? 'medium'
        : 'high';
  const recommendedStockRows = purchasedStockRows.slice(0, 5);
  const detailRows = recommendedStockRows;
  const selectedStockEntries = purchasedStockRows.map((row, index) => ({
    row,
    index,
  }));
  // Keep yellow next to the black cash segment at the start of the donut,
  // and move the coral/red third-ranked holding next to it at the end.  This
  // gives both requested rounded caps a real black-side boundary even when
  // five stocks are present in the chart.
  const donutStockEntries = selectedStockEntries.length > 2
    ? [
        selectedStockEntries[0],
        selectedStockEntries[1],
        ...selectedStockEntries.slice(3),
        selectedStockEntries[2],
      ]
    : selectedStockEntries;
  const donutSegments = [
    ...donutStockEntries.map(({ row, index }) => ({
      key: `${row.stock_id || row.symbol || row.name || 'stock'}-${index}`,
      value: row.weight,
      color: PORTFOLIO_DONUT_COLORS[index % PORTFOLIO_DONUT_COLORS.length],
    })),
    ...(cashPercent > 0
      ? [{ key: 'cash', value: cashPercent, color: PORTFOLIO_CASH_COLOR }]
      : []),
  ];

  return {
    investorLabel: getSummaryLabel(investorValue, INVESTOR_LABELS, '大戶'),
    riskLabel: getSummaryLabel(riskValue, RISK_LABELS, '中立派'),
    budget,
    budgetLabel: formatSummaryNumber(budget),
    allowFractional,
    stockPercent,
    segments: donutSegments,
    detailRows,
    cashRow,
    cashPercent,
    budgetInsufficient,
    budgetWarningMessage: allowFractional
      ? '目前預算不足以買進 1 股'
      : '建議開啟允許零股',
    portfolioRiskLabel,
    portfolioRiskTone,
    expectedReturnLabel: formatSummaryPercent(expectedReturn),
  };
}

function getDonutPoint(center, radius, angle) {
  const radians = (angle * Math.PI) / 180;
  return {
    x: center + radius * Math.cos(radians),
    y: center + radius * Math.sin(radians),
  };
}

function getDonutArcPath(center, radius, startAngle, endAngle) {
  const start = getDonutPoint(center, radius, startAngle);
  const end = getDonutPoint(center, radius, endAngle);
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`,
  ].join(' ');
}

function getDonutSegmentPath(center, outerRadius, innerRadius, startAngle, endAngle) {
  const outerStart = getDonutPoint(center, outerRadius, startAngle);
  const outerEnd = getDonutPoint(center, outerRadius, endAngle);
  const innerEnd = getDonutPoint(center, innerRadius, endAngle);
  const innerStart = getDonutPoint(center, innerRadius, startAngle);
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}

function PortfolioDonut({ size, strokeWidth, stockPercent, segments, scale = 1 }) {
  const captionHeight = 68 * scale;
  const center = size / 2;
  const outerRadius = size / 2;
  const innerRadius = Math.max(0, outerRadius - strokeWidth);
  const arcRadius = (outerRadius + innerRadius) / 2;
  let angle = -90;
  const segmentGeometry = segments.map((segment) => {
    const startAngle = angle;
    const endAngle = angle + (segment.value / 100) * 360;
    angle = endAngle;

    return {
      ...segment,
      startAngle,
      endAngle,
      degrees: endAngle - startAngle,
    };
  });
  const visibleSegmentGeometry = segmentGeometry.filter(
    (segment) => segment.value > 0,
  );
  const stockSegmentGeometry = visibleSegmentGeometry.filter(
    (segment) => segment.color !== PORTFOLIO_CASH_COLOR,
  );
  const stockSegmentCount = stockSegmentGeometry.length;

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`股票配置 ${Math.round(stockPercent)}%`}
      style={[styles.portfolioDonut, { width: size, height: size + captionHeight }]}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {segmentGeometry.map((segment) => {
          return (
            segment.degrees >= 359.99 ? (
              <Circle
                key={segment.key}
                cx={center}
                cy={center}
                r={arcRadius}
                fill="none"
                stroke={segment.color}
                strokeWidth={strokeWidth}
              />
            ) : segment.color === PORTFOLIO_DONUT_COLORS[0] ||
              segment.color === PORTFOLIO_DONUT_COLORS[2] ? (
              <Path
                key={segment.key}
                d={getDonutArcPath(
                  center,
                  arcRadius,
                  segment.startAngle,
                  segment.endAngle,
                )}
                fill="none"
                stroke={segment.color}
                strokeWidth={strokeWidth}
                strokeLinecap="butt"
              />
            ) : (
              <Path
                key={segment.key}
                d={getDonutSegmentPath(
                  center,
                  outerRadius,
                  innerRadius,
                  segment.startAngle,
                  segment.endAngle,
                )}
                fill={segment.color}
              />
            )
          );
        })}
        {segmentGeometry.map((segment) => {
          if (segment.degrees >= 359.99 || segment.value <= 0) return null;

          const isStockSegment = segment.color !== PORTFOLIO_CASH_COLOR;
          if (!isStockSegment) return null;

          const visibleSegmentIndex = visibleSegmentGeometry.findIndex(
            (candidate) => candidate.key === segment.key,
          );
          if (visibleSegmentIndex < 0) return null;

          // Ignore zero-weight selections when finding the actual neighbours;
          // they have no visible edge and should not block a cap from reaching
          // the black cash segment.
          const previousSegment =
            visibleSegmentGeometry[
              (visibleSegmentIndex - 1 + visibleSegmentGeometry.length) %
                visibleSegmentGeometry.length
            ];
          const nextSegment =
            visibleSegmentGeometry[
              (visibleSegmentIndex + 1) % visibleSegmentGeometry.length
            ];
          const isBlackSegment = (candidate) =>
            candidate?.color === PORTFOLIO_CASH_COLOR;
          const capAngles = [];

          if (stockSegmentCount === 1) {
            // One stock occupies one coloured arc, so both of its ends are
            // exposed and should be rounded.
            capAngles.push(segment.startAngle, segment.endAngle);
          } else {
            // With two or more stocks, only the outer ends touching the black
            // cash arc are rounded; inner stock-to-stock dividers stay clean.
            if (isBlackSegment(previousSegment)) {
              capAngles.push(segment.startAngle);
            }
            if (isBlackSegment(nextSegment)) {
              capAngles.push(segment.endAngle);
            }
          }

          return capAngles.map((capAngle, capIndex) => {
            const capPoint = getDonutPoint(center, arcRadius, capAngle);
            return (
              <Circle
                key={`${segment.key}-rounded-cap-${capIndex}`}
                cx={capPoint.x}
                cy={capPoint.y}
                r={strokeWidth / 2}
                fill={segment.color}
              />
            );
          });
        })}
      </Svg>
      <View
        pointerEvents="none"
        style={[styles.portfolioDonutCaption, { top: size, height: captionHeight }]}
      >
        <Text
          style={[
            styles.portfolioDonutLabel,
            {
              fontSize: 14 * scale,
              lineHeight: 20 * scale,
              marginTop: 6 * scale,
            },
          ]}
        >
          股票
        </Text>
        <Text
          style={[
            styles.portfolioDonutValue,
            {
              fontSize: 36 * scale,
              lineHeight: 42 * scale,
            },
          ]}
        >
          {Math.round(stockPercent)}%
        </Text>
      </View>
    </View>
  );
}

function PortfolioSummary({ width, data }) {
  // The summary is rendered at the full viewport width.  Keep its typography
  // in the same scale as the chips themselves so the labels cannot overflow
  // the three columns on a narrow physical phone.
  const summaryWidthScale = Math.min(1, Math.max(0.72, width / 430));
  const summaryScale = PORTFOLIO_SUMMARY_SCALE * summaryWidthScale;
  const chipScale = summaryScale;
  const donutSize = Math.min(Math.max(width * 0.55, 205), 220) * summaryScale;
  const donutStrokeWidth = Math.max(32, donutSize * 0.17);
  const chipWidths = {
    identity: getSummaryChipWidth('身分', data.investorLabel, 93, chipScale),
    risk: getSummaryChipWidth('風險偏好', data.riskLabel, 145, chipScale),
    budget: getSummaryChipWidth('預算', data.budgetLabel, 146, chipScale),
  };
  const chipHeight = Math.max(
    48 * summaryScale,
    50 * summaryWidthScale,
  );
  const chipPadding = 5 * chipScale;
  const chipTextStyle = {
    // Keep the three chips on one line at the reference mobile width while
    // leaving enough room for the full label and value (for example,
    // 「預算 50,000」) without browser text ellipsis.
    fontSize: 20 * chipScale,
    lineHeight: 29 * chipScale,
  };
  const chipLabelStyle = {
    fontSize: 10 * chipScale,
    lineHeight: 18 * chipScale,
    marginRight: 5 * chipScale,
  };
  const tableRowHeight = 42 * summaryScale;
  const tableHeaderHeight = 28 * summaryScale;
  const cashRowHeight = 32 * summaryScale;
  const tableTextStyle = {
    fontSize: 12 * summaryScale,
    lineHeight: 16 * summaryScale,
  };
  const tableHeaderTextStyle = {
    fontSize: 11 * summaryScale,
  };
  const budgetWarningWidth = Math.min(132, width * 0.34);
  const budgetWarningHeight = Math.max(48, 52 * summaryScale);
  const budgetWarningIconSize = Math.max(
    24,
    Math.min(28, budgetWarningHeight * 0.52),
  );
  const rows = data.detailRows.map((row, index) => {
    const symbol = String(row.stock_id ?? row.symbol ?? '--');
    const name = row.name || row.stock_name || '--';
    const amount =
      toSummaryNumber(row.allocated_amount ?? row.allocatedAmount) ??
      (toSummaryNumber(row.weight) * data.budget || 0) / 100;
    const shares = toSummaryNumber(row.shares);
    const rowAllowFractional =
      getBooleanSetting(row.allow_fractional, row.allowFractional) ??
      data.allowFractional;
    const lots =
      toSummaryNumber(row.lots) ??
      (shares === null
        ? null
        : rowAllowFractional
          ? shares / 1000
          : Math.floor(shares / 1000));
    const quantity = rowAllowFractional
      ? shares === null
        ? '--'
        : `${formatSummaryNumber(Math.max(0, Math.floor(shares + 1e-6)))} 股`
      : lots === null
        ? '--'
        : `${formatSummaryNumber(lots, lots % 1 ? 2 : 0)} 張`;

    return {
      key: `${symbol}-${index}`,
      symbol,
      name,
      weight: `${formatSummaryNumber(row.weight)}%`,
      amount: formatSummaryNumber(amount),
      quantity,
      color: PORTFOLIO_DETAIL_COLORS[index % PORTFOLIO_DETAIL_COLORS.length],
    };
  });
  const cashAmount =
    toSummaryNumber(data.cashRow?.allocated_amount ?? data.cashRow?.allocatedAmount) ??
    0;

  return (
    <View style={[styles.portfolioSummary, { width }]}>
      <View style={[styles.summaryChipRow, { gap: 7 * summaryScale }]}>
        <View
          style={[
            styles.summaryChip,
            {
              width: chipWidths.identity,
              height: chipHeight,
              paddingHorizontal: chipPadding,
            },
          ]}
        >
          <Text style={[styles.summaryChipText, chipTextStyle]} numberOfLines={1}>
            <Text style={[styles.summaryChipLabel, chipLabelStyle]}>身分</Text>
            <Text style={[styles.summaryChipValue, chipTextStyle]}>{data.investorLabel}</Text>
          </Text>
        </View>
        <View
          style={[
            styles.summaryChip,
            {
              width: chipWidths.risk,
              height: chipHeight,
              paddingHorizontal: chipPadding,
            },
          ]}
        >
          <Text style={[styles.summaryChipText, chipTextStyle]} numberOfLines={1}>
            <Text style={[styles.summaryChipLabel, chipLabelStyle]}>風險偏好</Text>
            <Text style={[styles.summaryChipValue, chipTextStyle]}>{data.riskLabel}</Text>
          </Text>
        </View>
        <View
          style={[
            styles.summaryChip,
            {
              width: chipWidths.budget,
              height: chipHeight,
              paddingHorizontal: chipPadding,
            },
          ]}
        >
          <Text style={[styles.summaryChipText, chipTextStyle]} numberOfLines={1}>
            <Text style={[styles.summaryChipLabel, chipLabelStyle]}>預算</Text>
            <Text style={[styles.summaryChipValue, chipTextStyle]}>{data.budgetLabel}</Text>
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.portfolioDonutStage,
          {
            width,
            height: donutSize + 68 * summaryScale,
            // Leave a stable gap below the three summary chips.  The old
            // value was too small on a physical phone and the donut visually
            // overlapped the chip row even though both belonged to the same
            // vertical layout.
            marginTop: 36 * summaryScale,
          },
        ]}
      >
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: (width - donutSize) / 2,
          }}
        >
          <PortfolioDonut
            size={donutSize}
            strokeWidth={donutStrokeWidth}
            stockPercent={data.stockPercent}
            segments={data.segments}
            scale={summaryScale}
          />
        </View>
        <View
          style={[
            styles.portfolioMetrics,
            {
              right: Math.max(10, width * 0.04),
              top: donutSize * 0.8,
            },
          ]}
        >
          <View
            style={[
              styles.portfolioMetricBadge,
              data.portfolioRiskTone === 'high'
                ? styles.portfolioMetricBadgeHigh
                : data.portfolioRiskTone === 'low'
                  ? styles.portfolioMetricBadgeLow
                  : null,
            ]}
          >
            <Text
              style={[
                styles.portfolioMetricText,
                data.portfolioRiskTone === 'high'
                  ? styles.portfolioMetricTextHigh
                  : data.portfolioRiskTone === 'low'
                    ? styles.portfolioMetricTextLow
                    : null,
              ]}
            >
              {data.portfolioRiskLabel}
            </Text>
          </View>
          <View style={styles.portfolioMetricBadge}>
            <Text style={styles.portfolioMetricText}>
              預期報酬 {data.expectedReturnLabel}
            </Text>
          </View>
        </View>
      </View>

      {data.budgetInsufficient ? (
        <View
          accessibilityRole="alert"
          accessibilityLabel={`預算不足：${data.budgetWarningMessage}`}
          style={[
            styles.budgetWarning,
            {
              width: budgetWarningWidth,
              minHeight: budgetWarningHeight,
              paddingHorizontal: 7 * summaryScale,
              borderRadius: 6 * summaryScale,
            },
          ]}
        >
          <AssetSvg
            asset={NOTICE_IMAGE}
            width={budgetWarningIconSize}
            height={budgetWarningIconSize}
            accessibilityLabel="Warning"
            pointerEvents="none"
          />
          <View style={styles.budgetWarningCopy}>
            <Text style={styles.budgetWarningTitle}>預算不足</Text>
            <Text style={styles.budgetWarningMessage}>
              {data.budgetWarningMessage}
            </Text>
          </View>
        </View>
      ) : null}

      <View
        style={[
          styles.portfolioDetailsTitle,
          {
            height: 31 * summaryScale,
            marginTop: data.budgetInsufficient
              ? 12 * summaryScale
              : 20 * summaryScale,
          },
        ]}
      >
        <Text
          style={[
            styles.portfolioDetailsTitleText,
            {
              fontSize: 15 * summaryScale,
              lineHeight: 20 * summaryScale,
            },
          ]}
        >
          股票明細
        </Text>
      </View>
      <View style={styles.portfolioTable}>
        <View
          style={[
            styles.portfolioTableRow,
            styles.portfolioTableHeader,
            { height: tableHeaderHeight },
          ]}
        >
          <Text style={[styles.portfolioTableCell, styles.portfolioTableFirstCell, styles.portfolioTableHeaderText, tableHeaderTextStyle]}>股名</Text>
          <Text style={[styles.portfolioTableCell, styles.portfolioTableHeaderText, tableHeaderTextStyle]}>占比</Text>
          <Text style={[styles.portfolioTableCell, styles.portfolioTableHeaderText, tableHeaderTextStyle]}>預算</Text>
          <Text style={[styles.portfolioTableCell, styles.portfolioTableHeaderText, tableHeaderTextStyle]}>建議數量</Text>
        </View>
        {rows.map((row) => (
          <View
            key={row.key}
            style={[styles.portfolioTableRow, { height: tableRowHeight }]}
          >
            <Text
              style={[styles.portfolioTableCell, styles.portfolioTableFirstCell, styles.portfolioTableName, tableTextStyle, { color: row.color }]}
              numberOfLines={1}
            >
              {row.symbol} {row.name}
            </Text>
            <Text style={[styles.portfolioTableCell, tableTextStyle, { color: row.color }]}>
              {row.weight}
            </Text>
            <Text style={[styles.portfolioTableCell, tableTextStyle]}>{row.amount}</Text>
            <Text style={[styles.portfolioTableCell, tableTextStyle]}>{row.quantity}</Text>
          </View>
        ))}
        <View
          style={[
            styles.portfolioTableRow,
            styles.portfolioCashRow,
            { height: cashRowHeight },
          ]}
        >
          <Text style={[styles.portfolioTableCell, styles.portfolioTableFirstCell, styles.portfolioCashLabel, tableTextStyle]}>現金保留</Text>
          <Text style={[styles.portfolioTableCell, tableTextStyle]}>{formatSummaryNumber(data.cashPercent)}%</Text>
          <Text style={[styles.portfolioTableCell, tableTextStyle]}>{formatSummaryNumber(cashAmount)}</Text>
          <Text style={[styles.portfolioTableCell, tableTextStyle]}>-</Text>
        </View>
      </View>
    </View>
  );
}

export default function Analyze({ route }) {
  const navigation = useNavigation();
  const isAnalyzeFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useViewportDimensions();
  const {
    customGroups,
    addCustomGroup,
    defaultStockGroup,
    investmentResult,
    investmentRunPending,
    investmentRunError,
  } = useAppSettings();
  const [selectedStock, setSelectedStock] = useState(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showGroupList, setShowGroupList] = useState(false);
  const [draftGroupName, setDraftGroupName] = useState('');
  const [customGroupId, setCustomGroupId] = useState(
    route?.params?.customGroupId || null,
  );
  const normalizedDraftGroupName = String(draftGroupName || '').trim();
  const hasDuplicateCustomGroupName = Boolean(normalizedDraftGroupName)
    && customGroups.some(
      (group) => String(group?.name || '').trim() === normalizedDraftGroupName,
    );
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
  const [latestInvestment, setLatestInvestment] = useState(null);
  const [latestInvestmentLoading, setLatestInvestmentLoading] = useState(true);
  const [latestInvestmentError, setLatestInvestmentError] = useState(null);

  useEffect(() => {
    let active = true;

    // 登入流程已經把後端結果放進 context 時直接使用，避免進入 Analyze
    // 後再重複請求一次大型行情資料；沒有 context 結果時才讀取最新快照。
    if (investmentResult) {
      setLatestInvestment(investmentResult);
      setLatestInvestmentLoading(false);
      setLatestInvestmentError(null);
      return () => {
        active = false;
      };
    }

    setLatestInvestmentLoading(true);
    setLatestInvestmentError(null);

    fetchLatestInvestment()
      .then((result) => {
        if (active) {
          setLatestInvestment(result);
          setLatestInvestmentLoading(false);
        }
      })
      .catch((error) => {
        if (active) {
          setLatestInvestmentLoading(false);
          setLatestInvestmentError(error?.message || '無法取得後端資金配置');
        }
      });

    return () => {
      active = false;
    };
  }, [investmentResult]);

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
  // Do not mix the previous CSV result into a newly submitted profile while
  // the backend is recalculating it. That would show the new budget together
  // with the previous run's allocated amounts and share counts.
  const resolvedInvestment = investmentResult || (
    !investmentRunPending && !investmentRunError ? latestInvestment : null
  );
  const routeProfile = {
    ...(route?.params?.profile || {}),
    ...route?.params,
  };
  const portfolioSource =
    Array.isArray(resolvedInvestment?.portfolio) && resolvedInvestment.portfolio.length
      ? resolvedInvestment.portfolio
      : !investmentRunPending && !investmentRunError
        ? route?.params?.portfolio
        : null;
  const hasPortfolioData = Array.isArray(portfolioSource) && portfolioSource.length > 0;
  const portfolioSummaryData = buildPortfolioSummary(
    resolvedInvestment?.profile,
    routeProfile,
    portfolioSource,
  );
  const cardPortfolioRows = hasPortfolioData ? portfolioSource : [];
  const baseVisibleStocks = investorType
    ? INVESTOR_STOCKS[investorType]
    : categoryId
      ? CATEGORY_STOCKS[categoryId]
      : isCustomGroup
        ? STOCKS.filter((stock) => activeCustomGroup.symbols.includes(stock.symbol))
        : STOCKS;
  const backendStockRows = cardPortfolioRows.filter((row) => !isCashRow(row));
  const rankedBackendStockRows = sortByRecommendation(backendStockRows);
  const recommendedBackendStockRows = rankedBackendStockRows
    .filter(hasSuggestedPosition)
    .slice(0, 5);
  const recommendationRankBySymbol = new Map(
    recommendedBackendStockRows.map((row, index) => [
      String(row?.stock_id ?? row?.symbol ?? ''),
      index + 1,
    ]),
  );
  const backendStockBySymbol = new Map(
    rankedBackendStockRows.map((row) => [
      String(row?.stock_id ?? row?.symbol ?? ''),
      row,
    ]),
  );
  const visibleStocks = hasPortfolioData
    ? baseVisibleStocks.map((stock) => {
        const portfolioRow = backendStockBySymbol.get(String(stock.symbol));
        return {
          ...stock,
          name: portfolioRow?.name || portfolioRow?.stock_name || stock.name,
          tone: portfolioRow
            ? getStockCardTone(portfolioRow, stock.tone)
            : stock.tone,
          percent: portfolioRow ? getPortfolioWeight(portfolioRow) : null,
          recommendationRank: recommendationRankBySymbol.get(String(stock.symbol)) || null,
        };
      })
    : [];
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
  }, [
    route?.params?.categoryId,
    route?.params?.investorType,
    route?.params?.customGroup,
    route?.params?.customGroupId,
  ]);

  useEffect(() => {
    const nextGroupParams = getStockGroupRouteParams(defaultStockGroup);
    if (!nextGroupParams) return;

    setCustomGroupId(null);
    setCategoryId(nextGroupParams.categoryId);
    setInvestorType(nextGroupParams.investorType);
    navigation.setParams(nextGroupParams);
  }, [defaultStockGroup, isAnalyzeFocused, navigation]);

  const sidePad = Math.max(30, screenWidth * 0.09);
  const columnGap = Math.max(34, screenWidth * 0.12);
  const cardWidth = (screenWidth - sidePad * 2 - columnGap) / 2;
  const cardHeight = cardWidth * (184 / 218);
  const addSize = Math.min(74, Math.max(48, screenWidth * 0.13));
  const addHeight = addSize * (76 / 74);
  // 把安全區與新增按鈕的高度一併納入標題列，避免窄版實機因固定高度
  // 不足而讓上方控制項與摘要內容互相擠壓。
  const categoryHeaderHeight = pageTitle
    ? Math.max(
        105,
        Math.min(
          184,
          Math.max(screenWidth * (105 / 378), insets.top + addHeight + 6),
        ),
      )
    : undefined;
  const menuButtonWidth = Math.min(40, Math.max(36, screenWidth * 0.068));
  const categoryTitleOffset = Math.max(20, screenWidth * 0.055);
  const headerTopPadding = insets.top + (pageTitle ? 10 : 28);
  const headerBottomPadding = pageTitle ? 8 : 36;
  // 以標題的實際垂直中心對齊 More／新增。固定寫死 20px 在手機安全區
  // 存在時會把按鈕額外往下推，造成按鈕落到標題列底部。
  const headerButtonOffset = pageTitle
    ? categoryTitleOffset - (headerTopPadding - headerBottomPadding) / 2
    : Math.max(20, screenWidth * 0.03);
  const categoryTitleSize = Math.max(
    28,
    Math.min(48, screenWidth * 0.08),
  );
  const gridColumns = Math.max(1, Math.floor((screenWidth - 2) / 48) + 1);
  const gridRows = Math.max(1, Math.floor((screenHeight - 2) / 48) + 1);

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

  // Render the selected stock as a separate full-screen view.  Keeping it as
  // a sibling overlay of the Analyze ScrollView lets the native stacking
  // order expose the cards underneath on some phones.
  if (selectedStock) {
    return (
      <View style={[styles.container, { width: screenWidth }]}>
        <StockDetail
          stock={selectedStock}
          investmentData={resolvedInvestment}
          onBack={() => setSelectedStock(null)}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { width: screenWidth }]}>
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="更多"
          hitSlop={18}
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
            // 標題只負責顯示，避免覆蓋左上角 more 按鈕的觸控區域。
            pointerEvents="none"
            style={[
              styles.categoryTitleWrap,
              { transform: [{ translateY: categoryTitleOffset }] },
            ]}
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
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="新增"
          hitSlop={12}
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
        style={styles.screenScroll}
        horizontal={false}
        bounces={false}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.grid,
          {
            width: screenWidth,
            paddingHorizontal: sidePad,
            // Keep the last stock cards clear of the
            // absolute-positioned bottom navigation bar.
            paddingBottom: insets.bottom + 145,
            paddingTop: 0,
            rowGap: pageTitle ? Math.max(28, screenWidth * 0.06) : 10,
          },
        ]}
      >
        <View
          style={[
            styles.portfolioSummaryWrapper,
            {
              width: screenWidth,
              marginHorizontal: -sidePad,
              paddingTop: pageTitle
                ? Math.max(22, screenWidth * (28 / 430) * PORTFOLIO_SUMMARY_SCALE)
                : 0,
            },
          ]}
        >
          {hasPortfolioData ? (
            <PortfolioSummary width={screenWidth} data={portfolioSummaryData} />
          ) : (
            <View style={styles.portfolioStatus}>
              <Text style={styles.portfolioStatusText}>
                {investmentRunPending
                  ? '正在依登入頁預算重新產生資金配置…'
                  : investmentRunError
                    ? `無法取得後端資金配置：${investmentRunError}`
                    : latestInvestmentLoading && !investmentResult
                      ? '正在取得後端資金配置…'
                      : `無法取得後端資金配置${latestInvestmentError ? `：${latestInvestmentError}` : ''}`}
              </Text>
            </View>
          )}
        </View>
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
        customGroups={customGroups}
        selectedId={
          investorType
          || categoryId
          || (isCustomGroup ? `custom:${customGroupId}` : 'all')
        }
        onSelect={(id) => {
          if (String(id).startsWith('custom:')) {
            const selectedCustomGroupId = String(id).slice('custom:'.length);
            const selectedGroup = customGroups.find(
              (group) => group.id === selectedCustomGroupId,
            );
            if (!selectedGroup) return;

            setCustomGroupId(selectedCustomGroupId);
            setCategoryId(null);
            setInvestorType(null);
            navigation.setParams({
              categoryId: null,
              investorType: null,
              customGroup: true,
              customGroupId: selectedCustomGroupId,
              stockGroup: `custom:${selectedCustomGroupId}`,
            });
            setShowMoreMenu(false);
            return;
          }

          setCustomGroupId(null);
          if (id === 'all') {
            setCategoryId(null);
            setInvestorType(null);
            navigation.setParams({
              categoryId: null,
              investorType: null,
              customGroup: false,
              customGroupId: null,
              stockGroup: 'all',
            });
          } else if (CATEGORY_STOCKS[id]) {
            setCategoryId(id);
            setInvestorType(null);
            navigation.setParams({
              categoryId: id,
              investorType: null,
              customGroup: false,
              customGroupId: null,
              stockGroup: id,
            });
          } else if (INVESTOR_STOCKS[id]) {
            setCategoryId(null);
            setInvestorType(id);
            navigation.setParams({
              categoryId: null,
              investorType: id,
              customGroup: false,
              customGroupId: null,
              stockGroup: id,
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
        nameError={hasDuplicateCustomGroupName ? '群組名稱不能重複' : ''}
        selectedSymbols={[]}
        onConfirm={(symbols) => {
          const newCustomGroupId = addCustomGroup(symbols, draftGroupName);
          if (!newCustomGroupId) return;

          setCustomGroupId(newCustomGroupId);
          setCategoryId(null);
          setInvestorType(null);
          setShowGroupList(false);
          navigation.setParams({
            categoryId: null,
            investorType: null,
            customGroup: true,
            customGroupId: newCustomGroupId,
            stockGroup: `custom:${newCustomGroupId}`,
          });
        }}
      />

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
    elevation: 10,
  },
  moreButton: {
    alignItems: 'center',
    justifyContent: 'center',
    outlineStyle: 'none',
    zIndex: 3,
    elevation: 3,
  },
  categoryHeader: {
    backgroundColor: '#596877',
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
    zIndex: 1,
  },
  portfolioSummary: {
    alignItems: 'center',
    backgroundColor: '#2E2F2E',
    overflow: 'visible',
    zIndex: 2,
  },
  portfolioSummaryWrapper: {
    flexShrink: 0,
    backgroundColor: '#2E2F2E',
    overflow: 'visible',
    zIndex: 2,
  },
  portfolioStatus: {
    minHeight: 250,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#2E2F2E',
  },
  portfolioStatusText: {
    color: '#B9B9B9',
    fontFamily: 'Goldman',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
  },
  summaryChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flexShrink: 0,
  },
  summaryChip: {
    height: 47,
    minWidth: 0,
    paddingHorizontal: 7,
    borderRadius: 8,
    backgroundColor: '#242424',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  summaryChipIdentity: {
    flex: 1.05,
  },
  summaryChipRisk: {
    flex: 1.5,
  },
  summaryChipBudget: {
    flex: 1.45,
  },
  summaryChipText: {
    flexShrink: 0,
    color: '#F1F1F1',
    fontSize: 20,
    lineHeight: 25,
    textAlign: 'center',
    whiteSpace: 'nowrap',
  },
  summaryChipLabel: {
    flexShrink: 0,
    color: '#777777',
    fontSize: 10,
    lineHeight: 14,
    marginRight: 5,
    whiteSpace: 'nowrap',
  },
  summaryChipValue: {
    flexShrink: 0,
    color: '#F1F1F1',
    fontFamily: 'Goldman',
    fontSize: 20,
    lineHeight: 25,
    whiteSpace: 'nowrap',
  },
  portfolioDonut: {
    position: 'relative',
    alignItems: 'center',
  },
  portfolioDonutStage: {
    position: 'relative',
    flexShrink: 0,
  },
  portfolioMetrics: {
    position: 'absolute',
    alignItems: 'flex-end',
    gap: 4,
  },
  portfolioMetricBadge: {
    minHeight: 18,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#596877',
    borderRadius: 5,
    backgroundColor: '#242424',
  },
  portfolioMetricBadgeHigh: {
    borderColor: '#8F5C5C',
  },
  portfolioMetricBadgeLow: {
    borderColor: '#5C8F63',
  },
  portfolioMetricText: {
    color: '#B9C8D7',
    fontFamily: 'Goldman',
    fontSize: 8,
    lineHeight: 11,
    whiteSpace: 'nowrap',
  },
  portfolioMetricTextHigh: {
    color: '#E3A1A1',
  },
  portfolioMetricTextLow: {
    color: '#A5D6A7',
  },
  budgetWarning: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D9D9D9',
    backgroundColor: '#687B8C',
  },
  budgetWarningCopy: {
    flex: 1,
    minWidth: 0,
    marginLeft: 5,
  },
  budgetWarningTitle: {
    color: '#F1F1F1',
    fontSize: 12,
    lineHeight: 15,
  },
  budgetWarningMessage: {
    color: '#D9D9D9',
    fontSize: 9,
    lineHeight: 12,
  },
  portfolioDonutCaption: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  portfolioDonutLabel: {
    color: '#F1F1F1',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  portfolioDonutValue: {
    color: '#FFFFFF',
    fontFamily: 'Goldman',
    fontSize: 36,
    lineHeight: 42,
  },
  portfolioDetailsTitle: {
    width: '100%',
    height: 35,
    marginTop: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#353535',
    borderTopWidth: 3,
    borderBottomWidth: 3,
    borderColor: '#1D1D1D',
  },
  portfolioDetailsTitleText: {
    color: '#969696',
    fontSize: 15,
    lineHeight: 20,
  },
  portfolioTable: {
    width: '100%',
    backgroundColor: '#2E2F2E',
  },
  portfolioTableRow: {
    width: '100%',
    height: 43,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#262626',
  },
  portfolioTableHeader: {
    height: 30,
    backgroundColor: '#111111',
    borderBottomWidth: 0,
  },
  portfolioTableCell: {
    flex: 1,
    color: '#F5F5F5',
    fontFamily: 'Goldman',
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  portfolioTableFirstCell: {
    flex: 1.75,
  },
  portfolioTableHeaderText: {
    color: '#E9E9E9',
    fontFamily: 'sans-serif',
    fontSize: 11,
  },
  portfolioTableName: {
    // Keep the first column's flex width identical in the header and body;
    // padding here would push the remaining numeric columns to the right.
    paddingHorizontal: 0,
    textAlign: 'center',
  },
  portfolioCashRow: {
    height: 38,
    backgroundColor: '#373737',
    borderTopWidth: 3,
    borderTopColor: '#242424',
    borderBottomWidth: 0,
  },
  portfolioCashLabel: {
    color: '#B9B9B9',
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
  cardStars: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
  },
});
