import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PercentCircle from '../components/PercentCircle';
import AssetSvg from '../components/AssetSvg';
import MeetingProcess from './MeetingProcess';
import RecommendedConfiguration from './RecommendedConfiguration';
import { TAB_BAR_STYLE } from '../components/TabBar';
import { fetchLatestInvestment } from '../services/investmentApi';
import { useAppSettings } from '../context/AppSettingsContext';

const WARNING_IMAGE = require('../assets/image/warning.svg');
const CURRENT_STATUS_IMAGE = require('../assets/image/CurrentStatus_fall.svg');
const BULL_IMAGE = require('../assets/image/Bull.svg');
const BEAR_IMAGE = require('../assets/image/Bear.svg');
const SIDEWAYS_IMAGE = require('../assets/image/Sideways.svg');
const ESTIMATE_TIME_IMAGE = require('../assets/image/EstimateTime.svg');
const ACTION_WINDOW_IMAGE = require('../assets/image/ActionWindow.svg');
const EX1_IMAGE = require('../assets/image/ex1.svg');
const EX2_IMAGE = require('../assets/image/ex2.svg');
const EX3_IMAGE = require('../assets/image/ex3.svg');
const TITLE_BACKGROUND_IMAGE = require('../assets/image/TitleBackground.svg');
const AGENT_IMAGE = require('../assets/image/agent.svg');

const MARKET_STATUS_CONFIG = {
  bull: {
    asset: BULL_IMAGE,
    label: '牛市',
    aspectRatio: 428 / 474,
  },
  bear: {
    asset: BEAR_IMAGE,
    label: '熊市',
    aspectRatio: 229 / 224,
  },
  sideways: {
    asset: SIDEWAYS_IMAGE,
    label: '盤整',
    aspectRatio: 575 / 447,
    layout: 'wide',
  },
};

function getMarketStatusConfig(regime) {
  const normalizedRegime = String(regime || '').trim().toLowerCase();
  const aliases = {
    bull: 'bull',
    牛市: 'bull',
    bear: 'bear',
    熊市: 'bear',
    sideways: 'sideways',
    盤整: 'sideways',
  };

  return MARKET_STATUS_CONFIG[aliases[normalizedRegime]] || null;
}

export default function Home() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { actionWindowEnabled } = useAppSettings();
  const [showAgentActions, setShowAgentActions] = useState(false);
  const [showMeetingProcess, setShowMeetingProcess] = useState(false);
  const [showRecommendedConfiguration, setShowRecommendedConfiguration] =
    useState(false);
  const [marketRegime, setMarketRegime] = useState(null);
  const [latestInvestment, setLatestInvestment] = useState(null);

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
        .catch(() => {
          if (active) {
            setLatestInvestment(null);
            setMarketRegime(null);
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

  const redPercent = 30;
  const ringSize = Math.min(Math.max(screenWidth * 0.73, 220), 390);
  const ringStrokeWidth = Math.round(ringSize * 0.215);
  const marketStatus = getMarketStatusConfig(marketRegime);
  const marketStatusMaxWidth = ringSize * 0.82;
  const marketStatusMaxHeight = ringSize * 0.82;
  const marketStatusWidth = marketStatus
    ? marketStatus.layout === 'wide'
      ? Math.min(screenWidth, 634)
      : Math.min(
          marketStatusMaxWidth,
          marketStatusMaxHeight * marketStatus.aspectRatio,
        )
    : 0;
  const marketStatusHeight = marketStatus
    ? marketStatusWidth / marketStatus.aspectRatio
    : 0;
  const marketStatusTop = marketStatus?.layout === 'wide'
    ? (ringSize - marketStatusHeight) / 2 + ringSize * 0.02
    : (ringSize - marketStatusHeight) / 2;

  const warningWidth = Math.min(screenWidth * 0.845, 485);
  const warningHeight = warningWidth * (61 / 485);
  const statusWidth = Math.min(screenWidth * 0.26, 134);
  const statusHeight = statusWidth * (40 / 134);
  const actionWidth = Math.min(screenWidth * 0.86, 500);
  const actionHeight = actionWidth * (100 / 440);
  const extraChartWidth = Math.min(screenWidth * 0.9, 530);
  const extraChart1Height = extraChartWidth * (290 / 575);
  const extraChart2Height = extraChartWidth * (297 / 575);
  const extraChart3Height = extraChartWidth * (295 / 575);
  const titleWidth = Math.min(138, extraChartWidth * 0.36);
  const titleScale = titleWidth / 138;
  const titleHeight = 31 * titleScale;
  const chartRadius = 15 * titleScale;
  const titleGap = 6;
  const forecastWidth = Math.min(screenWidth * 0.26, 134);
  const agentWidth = actionWidth;
  const agentHeight = agentWidth * (65 / 497);
  const agentActionWidth = Math.min(269, ringSize * 0.64);
  const agentActionHeight = agentActionWidth * (40 / 269);
  const agentActionScale = agentActionWidth / 269;
  const recommendedWidth = Math.min(494, screenWidth * 0.82);
  const recommendedHeight = recommendedWidth * (221 / 494);
  const ringMarginTop = Math.max(20, screenWidth * 0.055);
  const agentGap = Math.max(24, screenWidth * 0.06);
  const agentTop =
    insets.top +
    32 +
    warningHeight +
    16 +
    statusHeight +
    ringMarginTop +
    ringSize +
    agentGap;
  const agentVisualLeftOffset = ((0.5 + 489.102 / 2) - 497 / 2) / 497 * agentWidth;
  const agentVisualTop = agentTop + (0.5 / 65) * agentHeight;
  const agentVisualHeight = (55.6501 / 65) * agentHeight;
  const agentActionTop =
    agentVisualTop + (agentVisualHeight - agentActionHeight * 2) / 2;
  const ringTop = agentTop - ringSize * 0.78;
  const recommendedTop = Math.min(
    Math.max(insets.top + 8, ringTop + ringSize * 0.63),
    Math.max(
      insets.top + 8,
      screenHeight - recommendedHeight - insets.bottom - 8,
    ),
  );

  const openAnalyze = useCallback(() => {
    setShowAgentActions(false);
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
    setShowAgentActions(false);
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
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
            styles.content,
          {
            paddingTop: insets.top + 32,
            paddingBottom: insets.bottom + 82,
          },
        ]}
      >
        <AssetSvg
          asset={WARNING_IMAGE}
          width={warningWidth}
          height={warningHeight}
          accessibilityLabel="Warning"
        />

        <View style={[styles.statusRow, { height: statusHeight }]}>
          <AssetSvg
            asset={CURRENT_STATUS_IMAGE}
            width={statusWidth}
            height={statusHeight}
            accessibilityLabel="目前市場狀態"
          />
          <AssetSvg
            asset={ESTIMATE_TIME_IMAGE}
            width={forecastWidth}
            height={statusHeight}
            accessibilityLabel="預估剩餘1到2週"
          />
        </View>

        <View
          style={[
            styles.ringStage,
            { width: screenWidth, height: ringSize + agentGap + agentHeight },
            { marginTop: ringMarginTop },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="查看圓盤清單"
            onPress={openAnalyze}
            style={styles.ringPressable}
          >
          <PercentCircle
            redPercent={redPercent}
            size={ringSize}
            strokeWidth={ringStrokeWidth}
            label="耐久度:"
          >
            {marketStatus ? (
              <AssetSvg
                asset={marketStatus.asset}
                width={marketStatusWidth}
                height={marketStatusHeight}
                style={[
                  styles.marketStatusImage,
                  {
                    left: (ringSize - marketStatusWidth) / 2,
                    top: marketStatusTop,
                  },
                ]}
                accessibilityLabel={`目前市場狀態：${marketStatus.label}`}
              />
            ) : null}
          </PercentCircle>

          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Agent"
            onPress={() => setShowAgentActions((current) => !current)}
            style={[
              styles.agentButton,
              {
                left: (screenWidth - agentWidth) / 2,
                top: ringSize + agentGap,
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
            styles.extraCharts,
            {
              width: extraChartWidth,
              marginTop: Math.max(28, screenWidth * 0.08),
            },
          ]}
        >
          <View style={styles.chartBlock}>
            <View
              style={[
                styles.chartTitleBadge,
                { width: titleWidth, height: titleHeight },
              ]}
            >
              <AssetSvg
                asset={TITLE_BACKGROUND_IMAGE}
                width={titleWidth}
                height={titleHeight}
              />
              <View style={styles.chartTitleTextWrap}>
                <Text style={styles.chartTitle}>近期日K線圖</Text>
              </View>
            </View>
            <View
              style={[
                styles.chartImageWrap,
                {
                  borderRadius: chartRadius,
                  marginTop: titleHeight + titleGap,
                },
              ]}
            >
              <AssetSvg
                asset={EX1_IMAGE}
                width={extraChartWidth}
                height={extraChart1Height}
                accessibilityLabel="近期日K線圖"
              />
            </View>
          </View>
          <View style={styles.chartBlock}>
            <View
              style={[
                styles.chartTitleBadge,
                { width: titleWidth, height: titleHeight },
              ]}
            >
              <AssetSvg
                asset={TITLE_BACKGROUND_IMAGE}
                width={titleWidth}
                height={titleHeight}
              />
              <View style={styles.chartTitleTextWrap}>
                <Text style={styles.chartTitle}>法人買賣狀況</Text>
              </View>
            </View>
            <View
              style={[
                styles.chartImageWrap,
                {
                  borderRadius: chartRadius,
                  marginTop: titleHeight + titleGap,
                },
              ]}
            >
              <AssetSvg
                asset={EX2_IMAGE}
                width={extraChartWidth}
                height={extraChart2Height}
                accessibilityLabel="法人買賣狀況"
              />
            </View>
          </View>
          <View
            style={[
              styles.chartBlock,
              styles.chartBlockLast,
              { marginBottom: Math.max(36, screenWidth * 0.06) },
            ]}
          >
            <View
              style={[
                styles.chartTitleBadge,
                { width: titleWidth, height: titleHeight },
              ]}
            >
              <AssetSvg
                asset={TITLE_BACKGROUND_IMAGE}
                width={titleWidth}
                height={titleHeight}
              />
              <View style={styles.chartTitleTextWrap}>
                <Text style={styles.chartTitle}>融資融券變化</Text>
              </View>
            </View>
            <View
              style={[
                styles.chartImageWrap,
                {
                  borderRadius: chartRadius,
                  marginTop: titleHeight + titleGap,
                },
              ]}
            >
              <AssetSvg
                asset={EX3_IMAGE}
                width={extraChartWidth}
                height={extraChart3Height}
                accessibilityLabel="融資融券變化"
              />
            </View>
          </View>
        </View>
      </ScrollView>

      <View
        pointerEvents={showAgentActions ? 'auto' : 'none'}
        style={[
          styles.agentActionOverlay,
          !showAgentActions && styles.agentActionsHidden,
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="關閉 Agent 操作"
          onPress={() => setShowAgentActions(false)}
          style={styles.dimOverlay}
        />

        <View
          style={[
            styles.agentActions,
            {
              width: agentActionWidth,
              left:
                (screenWidth - agentWidth) / 2 +
                (agentWidth - agentActionWidth) / 2 +
                agentVisualLeftOffset,
              top: agentActionTop,
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="FinalDecision"
            onPress={() => {
              setShowAgentActions(false);
              setShowRecommendedConfiguration(true);
            }}
            hitSlop={12}
            style={({ pressed }) => [
              styles.agentActionButton,
              {
                height: agentActionHeight,
                borderRadius: 4.5 * agentActionScale,
                borderWidth: agentActionScale,
              },
              pressed && styles.agentActionPressed,
            ]}
          >
            <Text
              pointerEvents="none"
              style={[
                styles.agentActionText,
                {
                  fontSize: 16 * agentActionScale,
                  lineHeight: 20 * agentActionScale,
                },
              ]}
            >
              最終決策
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="MeetingProcess"
            onPress={openMeetingProcess}
            hitSlop={12}
            style={({ pressed }) => [
              styles.agentActionButton,
              {
                height: agentActionHeight,
                borderRadius: 4.5 * agentActionScale,
                borderWidth: agentActionScale,
              },
              pressed && styles.agentActionPressed,
            ]}
          >
            <Text
              pointerEvents="none"
              style={[
                styles.agentActionText,
                {
                  fontSize: 16 * agentActionScale,
                  lineHeight: 20 * agentActionScale,
                },
              ]}
            >
              會議過程
            </Text>
          </Pressable>
        </View>
      </View>

      <View
        pointerEvents={showRecommendedConfiguration ? 'auto' : 'none'}
        style={[
          styles.recommendedOverlay,
          !showRecommendedConfiguration && styles.recommendedHidden,
        ]}
      >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="關閉推薦配置"
            onPress={() => setShowRecommendedConfiguration(false)}
            style={styles.recommendedDim}
          />
          <View
            style={[
              styles.recommendedModal,
              {
                width: recommendedWidth,
                height: recommendedHeight,
                left: (screenWidth - recommendedWidth) / 2,
                top: recommendedTop,
            },
          ]}
        >
            <RecommendedConfiguration
              data={latestInvestment}
              width={recommendedWidth}
              height={recommendedHeight}
            />
          </View>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#2E2F2E',
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
  statusRow: {
    width: '90%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 16,
  },
  ringStage: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  ringPressable: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  agentActions: {
    position: 'absolute',
    zIndex: 2,
    elevation: 2,
    alignItems: 'center',
  },
  agentActionsHidden: {
    opacity: 0,
  },
  agentActionButton: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#636060',
    borderColor: '#2E2E2E',
    overflow: 'hidden',
  },
  agentActionPressed: {
    opacity: 0.78,
  },
  agentActionText: {
    color: '#000000',
    fontFamily: 'Goldman',
    fontWeight: '400',
    textAlign: 'center',
    includeFontPadding: false,
  },
  marketStatusImage: {
    position: 'absolute',
    zIndex: 2,
    pointerEvents: 'none',
  },
  extraCharts: {
    alignItems: 'flex-start',
  },
  chartBlock: {
    width: '100%',
    marginBottom: 22,
    position: 'relative',
    alignItems: 'flex-start',
  },
  chartBlockLast: {
    marginBottom: 0,
  },
  chartTitleBadge: {
    position: 'absolute',
    top: 0,
    left: 8,
    zIndex: 2,
    justifyContent: 'center',
  },
  chartTitleTextWrap: {
    position: 'absolute',
    top: 0,
    bottom: 4,
    left: 10,
    right: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chartTitle: {
    color: '#FFFFFF',
    fontFamily: 'Goldman',
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '400',
    textAlign: 'center',
  },
  chartImageWrap: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#F3F3F3',
    alignItems: 'center',
  },
  agentButton: {
    position: 'absolute',
    zIndex: 3,
    elevation: 3,
  },
  dimOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
    elevation: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
  },
  agentActionOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 200,
    elevation: 30,
  },
  recommendedOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 240,
    elevation: 35,
  },
  recommendedHidden: {
    opacity: 0,
  },
  recommendedDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
  },
  recommendedModal: {
    position: 'absolute',
    zIndex: 2,
    elevation: 2,
  },
  meetingProcessOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 300,
    elevation: 40,
  },
});
