import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

const DESIGN_WIDTH = 494;
const DESIGN_HEIGHT = 221;
const TRACK_WIDTH = 214;

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function getPortfolioSummary(data) {
  const rows = Array.isArray(data?.portfolio) ? data.portfolio : [];
  let stockWeight = 0;
  let cashWeight = 0;

  rows.forEach((row) => {
    const weight = numberValue(row?.final_weight_percent);
    const isCash =
      String(row?.asset_type || '').toLowerCase() === 'cash' ||
      String(row?.stock_id || '').toUpperCase() === 'CASH';

    if (isCash) {
      cashWeight += weight;
    } else if (weight > 0) {
      stockWeight += weight;
    }
  });

  return {
    stockWeight,
    cashWeight,
    hasData: rows.length > 0,
  };
}

function formatWeight(value, hasData) {
  return hasData ? `${value.toFixed(2)}%` : '--';
}

function clampPercent(value) {
  return Math.min(Math.max(value, 0), 100);
}

function ConfigurationRow({ label, value, scale, hasData }) {
  return (
    <View style={[styles.row, { height: 18 * scale, marginBottom: 13 * scale }]}>
      <Text
        style={[
          styles.rowLabel,
          {
            width: 51 * scale,
            fontSize: 14 * scale,
            lineHeight: 18 * scale,
          },
        ]}
      >
        {label}
      </Text>
      <View
        style={[
          styles.track,
          {
            width: TRACK_WIDTH * scale,
            height: 4 * scale,
            borderRadius: 2 * scale,
          },
        ]}
      >
        <View
          style={[
            styles.fill,
            {
              width: `${hasData ? clampPercent(value) : 0}%`,
              height: 4 * scale,
              borderRadius: 2 * scale,
            },
          ]}
        />
      </View>
      <Text
        style={[
          styles.value,
          {
            marginLeft: 13 * scale,
            width: 60 * scale,
            fontSize: 14 * scale,
            lineHeight: 18 * scale,
          },
        ]}
      >
        {formatWeight(value, hasData)}
      </Text>
    </View>
  );
}

function RecommendedConfiguration({ data, width, height }) {
  const scale = width / DESIGN_WIDTH;
  const cardHeight = height || DESIGN_HEIGHT * scale;
  const { stockWeight, cashWeight, hasData } = getPortfolioSummary(data);

  return (
    <View
      style={[
        styles.card,
        {
          width,
          height: cardHeight,
          borderRadius: 19 * scale,
          borderWidth: 2 * scale,
        },
      ]}
    >
      <View
        style={[
          styles.header,
          {
            height: 49 * scale,
            borderBottomWidth: 2 * scale,
          },
        ]}
      >
        <Text style={[styles.title, { fontSize: 20 * scale, lineHeight: 26 * scale }]}>
          最終決策結果
        </Text>
      </View>

      <View
        style={[
          styles.body,
          {
            paddingTop: 11 * scale,
            paddingLeft: 18 * scale,
          },
        ]}
      >
        <Text style={[styles.subtitle, { fontSize: 14 * scale, lineHeight: 18 * scale }]}>
          建議配置
        </Text>
        <View style={{ marginTop: 20 * scale }}>
          <ConfigurationRow
            label="股票"
            value={stockWeight}
            scale={scale}
            hasData={hasData}
          />
          <ConfigurationRow
            label="現金"
            value={cashWeight}
            scale={scale}
            hasData={hasData}
          />
        </View>
      </View>
    </View>
  );
}

export default React.memo(RecommendedConfiguration);

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    backgroundColor: '#8793B5',
    borderColor: '#2F9DF2',
  },
  header: {
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomColor: '#2E2F2E',
  },
  title: {
    color: '#2E2F2E',
    fontFamily: 'Goldman',
  },
  body: {
    flex: 1,
  },
  subtitle: {
    color: '#2E2F2E',
    fontFamily: 'Goldman',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowLabel: {
    color: '#2E2F2E',
    fontFamily: 'Goldman',
  },
  track: {
    overflow: 'hidden',
    backgroundColor: 'rgba(211, 231, 251, 0.4)',
    borderColor: '#2F9DF2',
    borderWidth: 1,
  },
  fill: {
    backgroundColor: '#0B6BD0',
  },
  value: {
    color: '#0B6BD0',
    fontFamily: 'Goldman',
  },
});
