import React, { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AssetSvg from '../components/AssetSvg';
import PercentCircle from '../components/PercentCircle';
import { fetchLatestStockDetail } from '../services/investmentApi';

const BACK_IMAGE = require('../assets/image/back.svg');
const CANDLESTICK_CHART_IMAGE = require('../assets/image/CandlestickChart.svg');
const TRADING_VOLUME_IMAGE = require('../assets/image/TradingVolume.svg');
const INSTITUTIONAL_INVESTORS_IMAGE = require('../assets/image/ThreeMajorInstitutionalInvestors.svg');
const MARGIN_TRADING_IMAGE = require('../assets/image/MarginTrading_and_ShortSelling.svg');

const DETAIL_TABS = [
  { key: 'recent', label: '近期日線' },
  { key: 'institutional', label: '法人買賣' },
  { key: 'margin', label: '融資融券' },
  { key: 'high', label: '最高' },
];

const TAB_CONTENT = {
  recent: {
    charts: [
      { asset: CANDLESTICK_CHART_IMAGE, ratio: 214 / 576 },
      { asset: TRADING_VOLUME_IMAGE, ratio: 86 / 577 },
    ],
  },
  institutional: {
    charts: [{ asset: INSTITUTIONAL_INVESTORS_IMAGE, ratio: 298 / 576 }],
  },
  margin: {
    charts: [{ asset: MARGIN_TRADING_IMAGE, ratio: 298 / 576 }],
  },
  high: {
    charts: [],
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

function getTone(value) {
  return toFiniteNumber(value) < 0 ? 'negative' : 'positive';
}

function createDetailCell(label, value, unit, maximumFractionDigits = 2, toneValue = value) {
  return {
    label,
    value: formatStockNumber(value, maximumFractionDigits),
    unit,
    tone: getTone(toneValue),
  };
}

function buildDetailRows(detail) {
  if (!detail) {
    return {
      recent: [],
      institutional: [],
      margin: [],
      high: [],
    };
  }

  return {
    recent: [
      [
        createDetailCell('開盤', detail.open, null, 4),
        createDetailCell('收盤', detail.close, null, 4, detail.change),
      ],
      [
        createDetailCell('最高', detail.high, null, 4),
        createDetailCell('最低', detail.low, null, 4, -1),
      ],
      [createDetailCell('成交值', detail.turnoverValue, '千元')],
      [createDetailCell('成交量', detail.volume, '千股')],
    ],
    institutional: [
      [createDetailCell('外資買賣超', detail.foreignNet, '千股')],
      [createDetailCell('投信買賣超', detail.investmentTrustNet, '千股')],
      [createDetailCell('自營商買賣超', detail.dealerNet, '千股')],
      [createDetailCell('流通在外股數', detail.sharesOutstanding, '千股')],
    ],
    margin: [
      [createDetailCell('融資餘額', detail.marginBalance, '千元')],
      [createDetailCell('融券餘額', detail.shortBalance, '千元')],
      [createDetailCell('融資增減', detail.marginChange, '千元')],
      [createDetailCell('融券增減', detail.shortChange, '千元')],
    ],
    high: [],
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

function DataCell({ item, scale }) {
  return (
    <View style={styles.dataCell}>
      <Text
        style={[
          styles.dataLabel,
          {
            fontSize: 15 * scale,
            lineHeight: 22 * scale,
            marginRight: 24 * scale,
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
              minHeight: 42 * scale,
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

function StockDetail({ stock, onBack, style }) {
  const [activeTab, setActiveTab] = useState('recent');
  const [stockDetail, setStockDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [detailError, setDetailError] = useState(null);
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const contentWidth = Math.min(Math.max(screenWidth, 320), 500);
  const scale = contentWidth / 337;
  const headerHeight = 80 * scale + insets.top;
  const summaryHeight = 144 * scale;
  const ringSize = Math.min(174 * scale, Math.max(108 * scale, contentWidth * 0.348));
  const stockSymbol = stock?.symbol ? String(stock.symbol) : '';

  useEffect(() => {
    let cancelled = false;

    if (!stockSymbol) {
      setStockDetail(null);
      setDetailLoading(false);
      setDetailError('缺少股票代號');
      return () => {
        cancelled = true;
      };
    }

    setStockDetail(null);
    setDetailLoading(true);
    setDetailError(null);

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

    return () => {
      cancelled = true;
    };
  }, [stockSymbol]);

  const tabContent = TAB_CONTENT[activeTab];
  const detailRows = buildDetailRows(stockDetail);
  const tabRows = detailRows[activeTab] || [];
  const stockPercent = Number.isFinite(Number(stock?.percent)) ? stock.percent : 50;
  const stockTitle = `${stockDetail?.symbol || stock?.symbol || '2454'} ${stockDetail?.name || stock?.name || '聯發科'}`;
  const stockChange = toFiniteNumber(stockDetail?.change);
  const stockChangeIcon =
    stockChange === null ? '▼' : stockChange > 0 ? '▲' : stockChange < 0 ? '▼' : '－';
  const stockChangeText =
    stockChange === null ? '--' : formatStockNumber(Math.abs(stockChange), 4);
  const stockCloseText = formatStockNumber(stockDetail?.close, 4);
  const stockTurnoverText = formatStockNumber(stockDetail?.turnoverRate, 4);

  return (
    <View style={[styles.container, style]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          {
            width: contentWidth,
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
                bottom: 8 * scale,
                fontSize: 23 * scale,
                lineHeight: 29 * scale,
              },
            ]}
            numberOfLines={1}
            ellipsizeMode="clip"
          >
            {stockTitle}
          </Text>
        </View>

        <View style={[styles.summary, { height: summaryHeight }]}>
          <View
            style={[
              styles.priceBox,
              {
                left: 41 * scale,
                top: 20 * scale,
                width: 117 * scale,
                height: 34 * scale,
                borderRadius: 5 * scale,
              },
            ]}
          >
            <Text
              style={[
                styles.priceTrend,
                stockChange < 0 ? styles.negativeText : styles.positiveText,
                { fontSize: 18 * scale, lineHeight: 22 * scale },
              ]}
            >
              {stockChangeIcon}
            </Text>
            <Text
              style={[
                styles.priceText,
                stockChange < 0 ? styles.negativeText : styles.positiveText,
                { fontSize: 25 * scale, lineHeight: 28 * scale },
              ]}
            >
              {stockChangeText}
            </Text>
            <Text style={[styles.priceUnit, { fontSize: 10 * scale }]}> (元)</Text>
          </View>

          <View style={[styles.summaryMetrics, { left: 23 * scale, top: 73 * scale }]}>
            <SummaryMetric
              label="周轉率"
              value={stockTurnoverText}
              unit="%"
              tone="positive"
              scale={scale}
            />
          </View>
          <View style={[styles.summaryMetrics, { left: 23 * scale, top: 108 * scale }]}>
            <SummaryMetric
              label="收盤價"
              value={stockCloseText}
              tone={getTone(stockChange)}
              scale={scale}
            />
          </View>

          <View
            style={[
              styles.scoreWrap,
              {
                right: 23 * scale,
                top: 14 * scale,
              },
            ]}
          >
            <PercentCircle
              redPercent={stockPercent}
              size={ringSize}
              strokeWidth={29 * scale}
              label="耐久度:"
              valueText="-%"
              fontScale={0.24}
              labelFontScale={0.045}
              minLabelFontSize={5 * scale}
            />
          </View>
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

        <View style={styles.chartPanel}>
          {tabContent.charts.map((chart, index) => (
            <AssetSvg
              key={`${activeTab}-chart-${index}`}
              asset={chart.asset}
              width={contentWidth}
              height={contentWidth * chart.ratio}
              accessibilityLabel={DETAIL_TABS.find((tab) => tab.key === activeTab)?.label}
            />
          ))}
        </View>

        {detailLoading || detailError ? (
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
              {detailLoading ? '載入最新資料中…' : detailError}
            </Text>
          </View>
        ) : null}

        <DataTable rows={tabRows} scale={scale} />
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
    color: '#2CB331',
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
  scoreWrap: {
    position: 'absolute',
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
});
