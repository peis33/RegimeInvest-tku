import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Circle,
  G,
  Line,
  Path,
  Rect,
  Svg,
  Text as SvgText,
} from 'react-native-svg';

const VIEW_WIDTH = 576;
const PRICE_HEIGHT = 214;
const VOLUME_HEIGHT = 86;
const DETAIL_HEIGHT = 298;
const COMPARISON_HEIGHT = 258;

const CHART_COLORS = {
  background: '#F4F4F4',
  grid: '#D8D8D8',
  axis: '#777777',
  text: '#4C4C4C',
  rise: '#E5392F',
  fall: '#279447',
  movingAverage5: '#E85D50',
  movingAverage20: '#F1A35D',
  movingAverage60: '#74C65C',
  foreign: '#E5392F',
  investmentTrust: '#315ED4',
  dealer: '#38A04B',
  cumulative: '#B8B8B8',
  margin: '#F28B35',
  short: '#4C9D55',
  shortRatio: '#E5392F',
};

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

function formatAxisNumber(value) {
  const number = toFiniteNumber(value);
  if (number === null) {
    return '--';
  }

  const absolute = Math.abs(number);
  if (absolute >= 1000000) {
    return `${formatNumber(number / 1000000, 1)}M`;
  }
  if (absolute >= 10000) {
    return `${formatNumber(number / 1000, 1)}K`;
  }
  return formatNumber(number, absolute < 10 && absolute % 1 ? 1 : 0);
}

function formatPercentAxis(value) {
  const number = toFiniteNumber(value);
  if (number === null) {
    return '--';
  }

  const digits = Math.abs(number) < 10 ? 1 : 0;
  return `${number > 0 ? '+' : ''}${formatNumber(number, digits)}%`;
}

function formatDate(value) {
  const match = String(value || '').match(/^(?:\d{4}[-/])?(\d{1,2})[-/](\d{1,2})/);
  return match ? `${Number(match[1])}/${Number(match[2])}` : '--';
}

function getValue(point, key) {
  return toFiniteNumber(point?.[key]);
}

function getPoints(data) {
  return Array.isArray(data?.points) ? data.points : [];
}

function getDomain(values, { includeZero = false, paddingRatio = 0.08 } = {}) {
  const finiteValues = values
    .map(toFiniteNumber)
    .filter((value) => value !== null);

  if (!finiteValues.length) {
    return [0, 1];
  }

  let minimum = Math.min(...finiteValues);
  let maximum = Math.max(...finiteValues);
  if (includeZero) {
    minimum = Math.min(0, minimum);
    maximum = Math.max(0, maximum);
  }

  const span = maximum - minimum;
  const padding = span === 0 ? Math.max(Math.abs(maximum) * 0.08, 1) : span * paddingRatio;
  return [minimum - padding, maximum + padding];
}

function scaleY(value, minimum, maximum, top, bottom) {
  const number = toFiniteNumber(value);
  if (number === null || maximum === minimum) {
    return null;
  }

  return bottom - ((number - minimum) / (maximum - minimum)) * (bottom - top);
}

function getX(index, count, left, right) {
  const step = (right - left) / Math.max(count, 1);
  return left + step * (index + 0.5);
}

function buildLinePath(points, key, left, right, top, bottom, minimum, maximum) {
  const segments = [];
  let current = [];

  points.forEach((point, index) => {
    const value = getValue(point, key);
    const y = scaleY(value, minimum, maximum, top, bottom);
    if (y === null) {
      if (current.length) {
        segments.push(current);
        current = [];
      }
      return;
    }

    current.push(`${getX(index, points.length, left, right)} ${y}`);
  });

  if (current.length) {
    segments.push(current);
  }

  return segments.map((segment) => `M ${segment.join(' L ')}`).join(' ');
}

function buildAreaPath(points, key, left, right, baseline, top, bottom, minimum, maximum) {
  const validPoints = points
    .map((point, index) => ({
      index,
      value: getValue(point, key),
    }))
    .filter(({ value }) => value !== null);

  if (!validPoints.length) {
    return '';
  }

  const path = validPoints.map(({ index, value }, pointIndex) => {
    const x = getX(index, points.length, left, right);
    const y = scaleY(value, minimum, maximum, top, bottom);
    return `${pointIndex === 0 ? 'M' : 'L'} ${x} ${y}`;
  });
  const firstX = getX(validPoints[0].index, points.length, left, right);
  const lastX = getX(validPoints[validPoints.length - 1].index, points.length, left, right);
  return `${path.join(' ')} L ${lastX} ${baseline} L ${firstX} ${baseline} Z`;
}

function getTickIndexes(count) {
  if (count <= 1) {
    return [0];
  }

  return Array.from(new Set([0, Math.round((count - 1) / 2), count - 1]));
}

function ChartEmpty({ width, height, label }) {
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={label}
      style={[styles.chartEmpty, { width, height }]}
    >
      <Text style={styles.chartEmptyText}>{label}</Text>
    </View>
  );
}

function ChartGrid({
  left,
  right,
  top,
  bottom,
  minimum,
  maximum,
  rows = 4,
  labelX = left - 7,
  labelFormat = formatAxisNumber,
}) {
  return (
    <G>
      {Array.from({ length: rows + 1 }, (_, index) => {
        const ratio = index / rows;
        const value = maximum - (maximum - minimum) * ratio;
        const y = top + (bottom - top) * ratio;
        return (
          <G key={`grid-${index}`}>
            <Line
              x1={left}
              y1={y}
              x2={right}
              y2={y}
              stroke={CHART_COLORS.grid}
              strokeWidth={1}
            />
            <SvgText
              x={labelX}
              y={y + 3}
              fill={CHART_COLORS.axis}
              fontSize={9}
              fontFamily="Goldman"
              textAnchor="end"
            >
              {labelFormat(value)}
            </SvgText>
          </G>
        );
      })}
    </G>
  );
}

function DateTicks({ points, left, right, y, fill = CHART_COLORS.axis }) {
  return (
    <G>
      {getTickIndexes(points.length).map((index) => (
        <SvgText
          key={`date-${index}`}
          x={getX(index, points.length, left, right)}
          y={y}
          fill={fill}
          fontSize={9}
          fontFamily="Goldman"
          textAnchor="middle"
        >
          {formatDate(points[index]?.date)}
        </SvgText>
      ))}
    </G>
  );
}

function ChartTitle({ children, y = 15 }) {
  return (
    <SvgText
      x={10}
      y={y}
      fill={CHART_COLORS.text}
      fontSize={11}
      fontFamily="Goldman"
    >
      {children}
    </SvgText>
  );
}

function LegendItem({ x, y, color, label }) {
  return (
    <G>
      <Line x1={x} y1={y - 3} x2={x + 13} y2={y - 3} stroke={color} strokeWidth={3} />
      <SvgText x={x + 17} y={y} fill={CHART_COLORS.text} fontSize={9} fontFamily="Goldman">
        {label}
      </SvgText>
    </G>
  );
}

function ChartFrame({ width, height, label, children }) {
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={label}
      style={[styles.chartFrame, { width, height }]}
    >
      <Svg width={width} height={height} viewBox={`0 0 ${VIEW_WIDTH} ${height === width ? height : height / (width / VIEW_WIDTH)}`}>
        {children}
      </Svg>
    </View>
  );
}

function PriceChart({ points, width }) {
  const height = width * (PRICE_HEIGHT / VIEW_WIDTH);
  if (!points.length) {
    return <ChartEmpty width={width} height={height} label="尚無近期K線資料" />;
  }

  const left = 52;
  const right = 568;
  const top = 32;
  const bottom = 175;
  const prices = points.flatMap((point) => [
    getValue(point, 'low'),
    getValue(point, 'high'),
  ]);
  const [minimum, maximum] = getDomain(prices);
  const latest = points[points.length - 1];
  const step = (right - left) / Math.max(points.length, 1);
  const candleWidth = Math.max(1.4, Math.min(7, step * 0.62));

  return (
    <ChartFrame
      width={width}
      height={height}
      label={`近期K線 ${points.length} 日`}
    >
      <Rect width={VIEW_WIDTH} height={PRICE_HEIGHT} fill={CHART_COLORS.background} />
      <ChartTitle>近期K線</ChartTitle>
      <SvgText x={132} y={15} fill={CHART_COLORS.text} fontSize={9} fontFamily="Goldman">
        收 {formatNumber(getValue(latest, 'close'), 2)}　高 {formatNumber(getValue(latest, 'high'), 2)}　低 {formatNumber(getValue(latest, 'low'), 2)}
      </SvgText>
      <ChartGrid
        left={left}
        right={right}
        top={top}
        bottom={bottom}
        minimum={minimum}
        maximum={maximum}
      />
      {points.map((point, index) => {
        const open = getValue(point, 'open');
        const high = getValue(point, 'high');
        const low = getValue(point, 'low');
        const close = getValue(point, 'close');
        if ([open, high, low, close].some((value) => value === null)) {
          return null;
        }

        const x = getX(index, points.length, left, right);
        const highY = scaleY(high, minimum, maximum, top, bottom);
        const lowY = scaleY(low, minimum, maximum, top, bottom);
        const openY = scaleY(open, minimum, maximum, top, bottom);
        const closeY = scaleY(close, minimum, maximum, top, bottom);
        const color = close >= open ? CHART_COLORS.rise : CHART_COLORS.fall;
        return (
          <G key={`candle-${point.date}-${index}`}>
            <Line x1={x} y1={highY} x2={x} y2={lowY} stroke={color} strokeWidth={1.2} />
            <Rect
              x={x - candleWidth / 2}
              y={Math.min(openY, closeY)}
              width={candleWidth}
              height={Math.max(1.3, Math.abs(openY - closeY))}
              fill={color}
            />
          </G>
        );
      })}
      {[
        ['ma5', CHART_COLORS.movingAverage5],
        ['ma20', CHART_COLORS.movingAverage20],
        ['ma60', CHART_COLORS.movingAverage60],
      ].map(([key, color]) => {
        const path = buildLinePath(points, key, left, right, top, bottom, minimum, maximum);
        return path ? (
          <Path key={key} d={path} fill="none" stroke={color} strokeWidth={1.3} />
        ) : null;
      })}
      <DateTicks points={points} left={left} right={right} y={202} />
    </ChartFrame>
  );
}

function VolumeChart({ points, width }) {
  const height = width * (VOLUME_HEIGHT / VIEW_WIDTH);
  if (!points.length) {
    return null;
  }

  const left = 52;
  const right = 568;
  const top = 12;
  const bottom = 72;
  const maximum = Math.max(
    1,
    ...points.map((point) => getValue(point, 'volume') || 0),
  );
  const step = (right - left) / Math.max(points.length, 1);
  const barWidth = Math.max(1.2, Math.min(7, step * 0.66));

  return (
    <ChartFrame
      width={width}
      height={height}
      label={`成交量 ${points.length} 日`}
    >
      <Rect width={VIEW_WIDTH} height={VOLUME_HEIGHT} fill={CHART_COLORS.background} />
      <SvgText x={10} y={14} fill={CHART_COLORS.text} fontSize={9} fontFamily="Goldman">
        成交量（千股）
      </SvgText>
      <ChartGrid
        left={left}
        right={right}
        top={top}
        bottom={bottom}
        minimum={0}
        maximum={maximum}
        rows={2}
      />
      {points.map((point, index) => {
        const volume = getValue(point, 'volume');
        if (volume === null) {
          return null;
        }
        const x = getX(index, points.length, left, right);
        const y = scaleY(volume, 0, maximum, top, bottom);
        const open = getValue(point, 'open');
        const close = getValue(point, 'close');
        const color = close === null || open === null || close >= open
          ? CHART_COLORS.rise
          : CHART_COLORS.fall;
        return (
          <Rect
            key={`volume-${point.date}-${index}`}
            x={x - barWidth / 2}
            y={y}
            width={barWidth}
            height={Math.max(1, bottom - y)}
            fill={color}
          />
        );
      })}
    </ChartFrame>
  );
}

export function RecentCharts({ data, width }) {
  const points = getPoints(data);
  return (
    <>
      <PriceChart points={points} width={width} />
      <VolumeChart points={points} width={width} />
    </>
  );
}

export function InstitutionalChart({ data, width }) {
  const points = getPoints(data);
  const height = width * (DETAIL_HEIGHT / VIEW_WIDTH);
  if (!points.length) {
    return <ChartEmpty width={width} height={height} label="尚無法人買賣資料" />;
  }

  const left = 58;
  const right = 568;
  const top = 46;
  const bottom = 260;
  const values = points.flatMap((point) => [
    getValue(point, 'foreignNet'),
    getValue(point, 'investmentTrustNet'),
    getValue(point, 'dealerNet'),
  ]);
  const [minimum, maximum] = getDomain(values, { includeZero: true });
  const zeroY = scaleY(0, minimum, maximum, top, bottom);
  const cumulativeValues = points.map((point) => getValue(point, 'institutionalCumulative'));
  const [cumulativeMinimum, cumulativeMaximum] = getDomain(cumulativeValues, {
    includeZero: true,
  });
  const cumulativePath = buildAreaPath(
    points,
    'institutionalCumulative',
    left,
    right,
    zeroY,
    top,
    bottom,
    cumulativeMinimum,
    cumulativeMaximum,
  );
  const step = (right - left) / Math.max(points.length, 1);
  const barWidth = Math.max(1.1, Math.min(4, step / 4));
  const bars = [
    ['foreignNet', CHART_COLORS.foreign, -barWidth],
    ['investmentTrustNet', CHART_COLORS.investmentTrust, 0],
    ['dealerNet', CHART_COLORS.dealer, barWidth],
  ];

  return (
    <ChartFrame
      width={width}
      height={height}
      label={`法人買賣超 ${points.length} 日`}
    >
      <Rect width={VIEW_WIDTH} height={DETAIL_HEIGHT} fill={CHART_COLORS.background} />
      <ChartTitle>法人買賣超（近{points.length}日）</ChartTitle>
      <LegendItem x={212} y={29} color={CHART_COLORS.foreign} label="外資" />
      <LegendItem x={280} y={29} color={CHART_COLORS.investmentTrust} label="投信" />
      <LegendItem x={348} y={29} color={CHART_COLORS.dealer} label="自營商" />
      <ChartGrid
        left={left}
        right={right}
        top={top}
        bottom={bottom}
        minimum={minimum}
        maximum={maximum}
        rows={4}
      />
      {cumulativePath ? (
        <Path d={cumulativePath} fill={CHART_COLORS.cumulative} opacity={0.5} />
      ) : null}
      <Line x1={left} y1={zeroY} x2={right} y2={zeroY} stroke="#777777" strokeWidth={1.2} />
      {points.map((point, index) => {
        const x = getX(index, points.length, left, right);
        return bars.map(([key, color, offset]) => {
          const value = getValue(point, key);
          if (value === null) {
            return null;
          }
          const valueY = scaleY(value, minimum, maximum, top, bottom);
          return (
            <Rect
              key={`${key}-${point.date}-${index}`}
              x={x + offset - barWidth / 2}
              y={Math.min(zeroY, valueY)}
              width={barWidth}
              height={Math.max(1, Math.abs(zeroY - valueY))}
              fill={color}
            />
          );
        });
      })}
      <DateTicks points={points} left={left} right={right} y={283} />
    </ChartFrame>
  );
}

export function MarginChart({ data, width }) {
  const points = getPoints(data);
  const height = width * (DETAIL_HEIGHT / VIEW_WIDTH);
  if (!points.length) {
    return <ChartEmpty width={width} height={height} label="尚無融資融券資料" />;
  }

  const left = 58;
  const right = 568;
  const upperTop = 48;
  const upperBottom = 171;
  const lowerTop = 202;
  const lowerBottom = 269;
  const balanceValues = points.flatMap((point) => [
    getValue(point, 'marginBalance'),
    getValue(point, 'shortBalance'),
  ]);
  const [balanceMinimum, balanceMaximum] = getDomain(balanceValues, {
    includeZero: true,
  });
  const ratioValues = points.map((point) => getValue(point, 'shortRatio'));
  const [ratioMinimum, ratioMaximum] = getDomain(ratioValues, {
    includeZero: true,
  });
  const marginPath = buildLinePath(
    points,
    'marginBalance',
    left,
    right,
    upperTop,
    upperBottom,
    balanceMinimum,
    balanceMaximum,
  );
  const shortPath = buildLinePath(
    points,
    'shortBalance',
    left,
    right,
    upperTop,
    upperBottom,
    balanceMinimum,
    balanceMaximum,
  );
  const ratioPath = buildLinePath(
    points,
    'shortRatio',
    left,
    right,
    lowerTop,
    lowerBottom,
    ratioMinimum,
    ratioMaximum,
  );

  return (
    <ChartFrame
      width={width}
      height={height}
      label={`融資融券變化 ${points.length} 日`}
    >
      <Rect width={VIEW_WIDTH} height={DETAIL_HEIGHT} fill={CHART_COLORS.background} />
      <ChartTitle>融資融券變化（千元，近{points.length}日）</ChartTitle>
      <LegendItem x={250} y={31} color={CHART_COLORS.margin} label="融資餘額" />
      <LegendItem x={350} y={31} color={CHART_COLORS.short} label="融券餘額" />
      <ChartGrid
        left={left}
        right={right}
        top={upperTop}
        bottom={upperBottom}
        minimum={balanceMinimum}
        maximum={balanceMaximum}
        rows={3}
      />
      {marginPath ? <Path d={marginPath} fill="none" stroke={CHART_COLORS.margin} strokeWidth={2} /> : null}
      {shortPath ? <Path d={shortPath} fill="none" stroke={CHART_COLORS.short} strokeWidth={2} /> : null}
      <Line x1={left} y1={187} x2={right} y2={187} stroke={CHART_COLORS.grid} strokeWidth={1.5} />
      <SvgText x={10} y={198} fill={CHART_COLORS.text} fontSize={9} fontFamily="Goldman">
        券資比（%）
      </SvgText>
      <ChartGrid
        left={left}
        right={right}
        top={lowerTop}
        bottom={lowerBottom}
        minimum={ratioMinimum}
        maximum={ratioMaximum}
        rows={2}
      />
      {ratioPath ? <Path d={ratioPath} fill="none" stroke={CHART_COLORS.shortRatio} strokeWidth={2} /> : null}
      <DateTicks points={points} left={left} right={right} y={283} />
    </ChartFrame>
  );
}

function buildRelativeReturnPoints(points) {
  const validPoints = getPoints({ points })
    .map((point) => ({
      date: point?.date,
      close: getValue(point, 'close'),
    }))
    .filter(({ close }) => close !== null);
  const baseClose = validPoints[0]?.close;

  if (baseClose === null || baseClose === undefined || baseClose === 0) {
    return [];
  }

  return validPoints.map(({ date, close }) => ({
    date,
    value: ((close / baseClose) - 1) * 100,
  }));
}

export function PerformanceComparisonChart({ series, width }) {
  const height = width * (COMPARISON_HEIGHT / VIEW_WIDTH);
  const plottedSeries = (Array.isArray(series) ? series : [])
    .map((item, index) => ({
      symbol: item?.symbol || `股票${index + 1}`,
      name: item?.name || '',
      points: buildRelativeReturnPoints(item?.points),
      color: index === 0 ? CHART_COLORS.rise : CHART_COLORS.fall,
    }))
    .filter((item) => item.points.length > 0);
  const referencePoints = plottedSeries.reduce(
    (longest, item) => (item.points.length > longest.length ? item.points : longest),
    [],
  );
  const allValues = plottedSeries.flatMap((item) => item.points.map((point) => point.value));

  if (!allValues.length) {
    return (
      <View
        accessibilityRole="image"
        accessibilityLabel="漲跌幅比較圖"
        style={[styles.compareChartEmpty, { width, height }]}
      >
        <Text style={styles.compareChartEmptyText}>尚無漲跌幅比較資料</Text>
      </View>
    );
  }

  const left = 64;
  const right = 566;
  const top = 54;
  const bottom = 214;
  const [minimum, maximum] = getDomain(allValues, {
    includeZero: true,
    paddingRatio: 0.1,
  });
  const zeroY = scaleY(0, minimum, maximum, top, bottom);

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`漲跌幅比較圖 ${plottedSeries.map((item) => `${item.symbol} ${item.name}`).join('、')}`}
      style={[styles.compareChart, { width, height }]}
    >
      <Svg width={width} height={height} viewBox={`0 0 ${VIEW_WIDTH} ${COMPARISON_HEIGHT}`}>
        <SvgText x={14} y={20} fill="#F1F1F1" fontSize={12} fontFamily="Goldman">
          漲跌幅比較（基準日 0%）
        </SvgText>
        {plottedSeries.map((item, index) => {
          const legendX = index === 0 ? 230 : 405;
          return (
            <G key={`comparison-legend-${item.symbol}`}>
              <Line
                x1={legendX}
                y1={16}
                x2={legendX + 13}
                y2={16}
                stroke={item.color}
                strokeWidth={3}
              />
              <SvgText
                x={legendX + 18}
                y={20}
                fill={item.color}
                fontSize={9}
                fontFamily="Goldman"
              >
                {`${item.symbol} ${item.name}`}
              </SvgText>
            </G>
          );
        })}
        <ChartGrid
          left={left}
          right={right}
          top={top}
          bottom={bottom}
          minimum={minimum}
          maximum={maximum}
          rows={4}
          labelX={left - 8}
          labelFormat={formatPercentAxis}
        />
        {zeroY !== null ? (
          <Line
            x1={left}
            y1={zeroY}
            x2={right}
            y2={zeroY}
            stroke="#898989"
            strokeWidth={1.3}
          />
        ) : null}
        {plottedSeries.map((item) => {
          const path = buildLinePath(
            item.points,
            'value',
            left,
            right,
            top,
            bottom,
            minimum,
            maximum,
          );
          const lastPoint = item.points[item.points.length - 1];
          const lastX = getX(item.points.length - 1, item.points.length, left, right);
          const lastY = scaleY(lastPoint?.value, minimum, maximum, top, bottom);
          return (
            <G key={`comparison-line-${item.symbol}`}>
              {path ? <Path d={path} fill="none" stroke={item.color} strokeWidth={2.5} /> : null}
              {lastY !== null ? <Circle cx={lastX} cy={lastY} r={4} fill={item.color} /> : null}
            </G>
          );
        })}
        <DateTicks points={referencePoints} left={left} right={right} y={245} fill="#A7A7A7" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  chartFrame: {
    backgroundColor: CHART_COLORS.background,
    overflow: 'hidden',
  },
  chartEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CHART_COLORS.background,
  },
  chartEmptyText: {
    color: CHART_COLORS.axis,
    fontFamily: 'Goldman',
    fontSize: 13,
  },
  compareChart: {
    overflow: 'hidden',
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  compareChartEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  compareChartEmptyText: {
    color: '#A7A7A7',
    fontFamily: 'Goldman',
    fontSize: 13,
  },
});
