import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import ChatHistory from './ChatHistory';
import AssetSvg from '../components/AssetSvg';
import { fetchLatestInvestment } from '../services/investmentApi';
import { useAppSettings } from '../context/AppSettingsContext';
import useViewportDimensions from '../hooks/useViewportDimensions';

const AGENT_MEETING_IMAGE = require('../assets/image/AgentMeeting.svg');
const JUDGE_IMAGE = require('../assets/image/judge.svg');
const RISK_SEEKING_IMAGE = require('../assets/image/risk-seeking.svg');
const RISK_AVERSE_IMAGE = require('../assets/image/risk-averse.svg');
const CHAT_JUDGE_IMAGE = require('../assets/image/Llama.svg');
const CHAT_RISK_SEEKING_IMAGE = require('../assets/image/Qwen.svg');
const CHAT_RISK_AVERSE_IMAGE = require('../assets/image/Mistral.svg');
const NOTICE_IMAGE = require('../assets/image/notice.svg');
const CANCEL_IMAGE = require('../assets/image/cancel.svg');
const SCALING_IMAGE = require('../assets/image/scaling.svg');

const DESIGN_WIDTH = 572;

const MEETING_TABS = [
  { id: 'round1', label: '第一輪' },
  { id: 'round2', label: '第二輪' },
  { id: 'final', label: '最終裁決' },
];

const RISK_LABELS = {
  conservative: '保守風險',
  neutral: '中等風險',
  aggressive: '積極風險',
};

function numericValue(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function percentValue(value) {
  const number = numericValue(value);
  if (number === null) {
    return null;
  }

  // Backend portfolio rows use 0–100, while optional agent allocations may
  // use 0–1. Accept both formats so the UI stays data-driven.
  return Math.abs(number) <= 1 ? number * 100 : number;
}

function formatPercent(value) {
  const number = numericValue(value);
  if (number === null) {
    return '--';
  }

  const rounded = Math.round(number * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(2).replace(/0+$/, '')}%`;
}

function summarizePortfolio(portfolio) {
  if (!Array.isArray(portfolio) || portfolio.length === 0) {
    return { stock: null, cash: null };
  }

  let stock = 0;
  let cash = 0;
  let hasAllocation = false;

  portfolio.forEach((row) => {
    const weight = numericValue(row?.final_weight_percent);
    if (weight === null) {
      return;
    }

    hasAllocation = true;
    const isCash =
      String(row?.asset_type || '').toLowerCase() === 'cash' ||
      String(row?.stock_id || '').toUpperCase() === 'CASH';

    if (isCash) {
      cash += weight;
    } else {
      stock += weight;
    }
  });

  return hasAllocation ? { stock, cash } : { stock: null, cash: null };
}

function extractAllocation(source, fallback) {
  if (!source || typeof source !== 'object') {
    return fallback;
  }

  const stock = percentValue(
    source.stock_percent ??
      source.stockPercent ??
      source.stocks_percent ??
      source.stock_weight_percent ??
      source.equity_percent ??
      source.equityPercent ??
      source.stock,
  );
  const cash = percentValue(
    source.cash_percent ??
      source.cashPercent ??
      source.cash_weight_percent ??
      source.cash,
  );

  if (stock === null && cash === null) {
    return fallback;
  }

  const safeStock = stock === null ? Math.max(0, 100 - cash) : stock;
  const safeCash = cash === null ? Math.max(0, 100 - stock) : cash;

  return {
    stock: Math.max(0, Math.min(100, safeStock)),
    cash: Math.max(0, Math.min(100, safeCash)),
  };
}

function agentAllocation(data, role, round, fallback = null) {
  const key = `${role}_round${round}`;
  const discussion = data?.discussion || {};
  const decision = discussion?.structured_decisions?.[key];
  const message = discussion?.messages?.find(
    (item) => item?.role === role && item?.round === round,
  );

  const candidates = [
    data?.agent_allocations?.[key],
    data?.agent_allocations?.[role]?.[`round${round}`],
    decision?.allocation,
    decision?.suggested_allocation,
    message?.allocation,
    discussion?.agent_allocations?.[key],
    discussion?.agent_allocations?.[role]?.[`round${round}`],
  ];

  for (const candidate of candidates) {
    const allocation = extractAllocation(candidate, null);
    if (allocation) {
      return allocation;
    }
  }

  // Model 3 currently returns relative directions only.  Do not use Model 2's
  // final allocation as an Agent's personal stance; only render an optional
  // numeric allocation when the backend explicitly supplies one.
  return fallback;
}

function assetKey(value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  return String(value).trim();
}

function isCashAsset(row, id) {
  return (
    String(row?.asset_type || '').toLowerCase() === 'cash' ||
    assetKey(row?.stock_id || id).toUpperCase() === 'CASH'
  );
}

function candidateStockRows(data, decision) {
  if (!decision || typeof decision !== 'object') {
    return [];
  }

  const portfolio = Array.isArray(data?.portfolio) ? data.portfolio : [];
  const rowsByAsset = new Map(
    portfolio
      .map((row) => [assetKey(row?.stock_id || row?.asset_id), row])
      .filter(([id]) => id),
  );
  const directions =
    decision.directions && typeof decision.directions === 'object'
      ? decision.directions
      : {};
  const excluded = new Set(
    [assetKey(decision.avoid_asset), 'CASH']
      .map((id) => id.toUpperCase())
      .filter(Boolean),
  );
  const selected = [];
  const selectedKeys = new Set();

  const addCandidate = (candidate) => {
    const id =
      typeof candidate === 'object'
        ? assetKey(
            candidate?.stock_id ?? candidate?.asset_id ?? candidate?.id,
          )
        : assetKey(candidate);
    const normalizedId = id.toUpperCase();
    const row = rowsByAsset.get(id);

    if (
      !id ||
      excluded.has(normalizedId) ||
      selectedKeys.has(normalizedId) ||
      isCashAsset(row, id)
    ) {
      return;
    }

    // The Model 3 validator only permits existing holdings.  If a future API
    // response omits the portfolio rows entirely, do not manufacture labels.
    if (portfolio.length > 0 && !row) {
      return;
    }

    selectedKeys.add(normalizedId);
    selected.push({
      id,
      code: assetKey(row?.stock_id || id),
      name: String(row?.name || row?.stock_name || '').trim(),
    });
  };

  const explicitCandidates =
    decision.candidate_assets ??
    decision.candidateAssets ??
    decision.recommended_assets ??
    decision.recommendedAssets;
  if (Array.isArray(explicitCandidates)) {
    explicitCandidates.forEach(addCandidate);
  }

  addCandidate(decision.preferred_asset);
  Object.entries(directions)
    .filter(([, action]) => String(action).toLowerCase() === 'increase')
    .forEach(([id]) => addCandidate(id));
  Object.entries(directions)
    .filter(([, action]) => String(action).toLowerCase() === 'maintain')
    .forEach(([id]) => addCandidate(id));

  // Keep the card useful if an Agent only names one or two assets.  The
  // remaining entries still come from the current Model 2 holdings, ordered
  // by the scores already returned by the backend.
  if (selected.length < 3) {
    [...portfolio]
      .filter((row) => !isCashAsset(row))
      .sort((left, right) => {
        const leftScore =
          numericValue(left?.selection_score) ??
          numericValue(left?.final_weight_percent) ??
          -Infinity;
        const rightScore =
          numericValue(right?.selection_score) ??
          numericValue(right?.final_weight_percent) ??
          -Infinity;
        return rightScore - leftScore;
      })
      .forEach(addCandidate);
  }

  return selected.slice(0, 3);
}

function riskLabel(data) {
  const riskPreference =
    data?.profile?.risk_preference || data?.portfolio?.[0]?.risk_preference;
  return RISK_LABELS[riskPreference] || '中等風險';
}

function RoundChat({
  messages,
  loading,
  error,
  hasData,
  discussionPending,
  discussionError,
  onStartDiscussion,
  layoutScale,
  width,
  onOpenHistory,
}) {
  return (
    <View
      style={[
        styles.chatPanel,
        { width, height: 546 * layoutScale },
      ]}
    >
      <View style={[styles.chatHeader, { height: 48 * layoutScale }]}>
        <Text style={[styles.chatTitle, { fontSize: 21 * layoutScale }]}>
          Chat
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="查看完整會議紀錄"
          onPress={onOpenHistory}
          style={[
            styles.expandButton,
            {
              width: 32 * layoutScale,
              height: 32 * layoutScale,
              right: 10 * layoutScale,
            },
          ]}
        >
          <AssetSvg
            asset={SCALING_IMAGE}
            width={26 * layoutScale}
            height={23 * layoutScale}
            pointerEvents="none"
          />
        </Pressable>
      </View>

      <View style={styles.chatBody}>
        <ScrollView
          horizontal={false}
          bounces={false}
          overScrollMode="never"
          showsVerticalScrollIndicator={false}
          style={styles.previewScroll}
          contentContainerStyle={[ 
            styles.previewContent,
            {
              width,
              paddingHorizontal: 14 * layoutScale,
              paddingTop: 16 * layoutScale,
            },
          ]}
        >
          {loading ? (
            <View style={styles.previewStatus}>
              <ActivityIndicator color="#FFFFFF" />
              <Text
                style={[
                  styles.messageText,
                  {
                    marginTop: 8 * layoutScale,
                    fontSize: 16 * layoutScale,
                    lineHeight: 28 * layoutScale,
                  },
                ]}
              >
                正在讀取 Agent 會議紀錄…
              </Text>
            </View>
          ) : messages.length > 0 ? (
            messages.map((message, index) => {
              const isRiskAverse = message.role === 'risk_averse';
              const isModerator = message.role === 'moderator';
              const isRight = isRiskAverse;
              const bubbleStyle = isModerator
                ? styles.messageBubbleModerator
                : isRiskAverse
                  ? styles.messageBubbleRiskAverse
                  : styles.messageBubbleRiskSeeking;
              const avatarAsset = isModerator
                ? CHAT_JUDGE_IMAGE
                : isRiskAverse
                  ? CHAT_RISK_AVERSE_IMAGE
                  : CHAT_RISK_SEEKING_IMAGE;

              return (
                <View
                  key={`${message.id || message.role}-${index}`}
                  style={[
                    styles.previewMessageRow,
                    { marginBottom: 18 * layoutScale },
                  ]}
                >
                  <AssetSvg
                    asset={avatarAsset}
                    width={(isModerator ? 52 : 48) * layoutScale}
                    height={(isModerator ? 31 : 36) * layoutScale}
                    pointerEvents="none"
                    accessibilityLabel={message.speaker || message.role}
                    style={[
                      styles.previewAvatar,
                      isRight
                        ? { right: 0, top: -8 * layoutScale }
                        : { left: 0, top: 0 },
                    ]}
                  />
                  <View
                    style={[
                      styles.messageBubble,
                      bubbleStyle,
                      {
                        width: '79%',
                        alignSelf: isRight ? 'flex-end' : 'flex-start',
                        marginLeft: isRight ? 0 : 48 * layoutScale,
                        marginRight: isRight ? 48 * layoutScale : 0,
                        paddingHorizontal: 14 * layoutScale,
                        paddingVertical: 12 * layoutScale,
                      },
                    ]}
                  >
                    {isModerator ? null : (
                      <Text
                        style={[
                          styles.previewLabel,
                          {
                            fontSize: 13 * layoutScale,
                            lineHeight: 20 * layoutScale,
                          },
                        ]}
                      >
                        {message.speaker || 'Agent'}
                        {message.round > 0 ? ` · 第${message.round}輪` : ''}
                      </Text>
                    )}
                    <Text
                      style={[
                        styles.messageText,
                        {
                          fontSize: 16 * layoutScale,
                          lineHeight: 29 * layoutScale,
                        },
                      ]}
                    >
                      {message.text}
                    </Text>
                  </View>
                </View>
              );
            })
          ) : !hasData && error ? (
            <View style={styles.previewStatus}>
              <Text
                style={[
                  styles.messageText,
                  {
                    fontSize: 16 * layoutScale,
                    lineHeight: 28 * layoutScale,
                  },
                ]}
              >
                {error}
              </Text>
            </View>
          ) : (
            <View style={styles.previewStatus}>
              {discussionPending ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : null}
              <Text
                style={[
                  styles.messageText,
                  styles.discussionStatusText,
                  {
                    fontSize: 16 * layoutScale,
                    lineHeight: 28 * layoutScale,
                  },
                ]}
              >
                {discussionPending
                  ? '正在執行 Model 3 AI 討論…'
                  : '目前尚未執行 AI 討論。'}
              </Text>
              {!discussionPending ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="開始 AI 討論"
                  onPress={onStartDiscussion}
                  style={({ pressed }) => [
                    styles.startDiscussionButton,
                    {
                      marginTop: 18 * layoutScale,
                      paddingHorizontal: 18 * layoutScale,
                      paddingVertical: 10 * layoutScale,
                      borderRadius: 20 * layoutScale,
                    },
                    pressed && styles.startDiscussionButtonPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.startDiscussionButtonText,
                      {
                        fontSize: 15 * layoutScale,
                        lineHeight: 22 * layoutScale,
                      },
                    ]}
                  >
                    開始 AI 討論
                  </Text>
                </Pressable>
              ) : null}
              {discussionError ? (
                <Text
                  style={[
                    styles.discussionErrorText,
                    {
                      marginTop: 14 * layoutScale,
                      fontSize: 13 * layoutScale,
                      lineHeight: 21 * layoutScale,
                    },
                  ]}
                >
                  {discussionError}
                </Text>
              ) : null}
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

function CandidateCard({ title, candidates, icon, accent, layoutScale, width }) {
  return (
    <View
      style={[
        styles.candidateCard,
        {
          width,
          minHeight: 204 * layoutScale,
          borderColor: accent,
          borderWidth: 2 * layoutScale,
          borderRadius: 14 * layoutScale,
          paddingHorizontal: 12 * layoutScale,
          paddingVertical: 10 * layoutScale,
        },
      ]}
    >
      <View style={styles.candidateCardHeader}>
        <AssetSvg
          asset={icon}
          width={59 * layoutScale}
          height={69 * layoutScale}
          accessibilityLabel={title}
          pointerEvents="none"
        />
        <Text
          style={[
            styles.candidateCardTitle,
            {
              marginLeft: 6 * layoutScale,
              fontSize: 13 * layoutScale,
              lineHeight: 18 * layoutScale,
            },
          ]}
        >
          股票建議候選
        </Text>
      </View>
      <View style={styles.candidateList}>
        {candidates.length > 0 ? (
          candidates.map((candidate) => (
            <Text
              key={candidate.id}
              numberOfLines={1}
              ellipsizeMode="tail"
              style={[
                styles.candidateItem,
                {
                  fontSize: 14 * layoutScale,
                  lineHeight: 22 * layoutScale,
                  marginTop: 2 * layoutScale,
                },
              ]}
            >
              {candidate.name
                ? `${candidate.code} ${candidate.name}`
                : candidate.code}
            </Text>
          ))
        ) : (
          <Text
            style={[
              styles.candidateEmpty,
              {
                fontSize: 12 * layoutScale,
                lineHeight: 18 * layoutScale,
              },
            ]}
          >
            尚無本輪候選資料
          </Text>
        )}
      </View>
    </View>
  );
}

function InfluenceRow({
  title,
  allocation,
  icon,
  accent,
  layoutScale,
  secondary = false,
}) {
  return (
    <View
      style={[
        styles.influenceRow,
        {
          marginTop: (secondary ? 66 : 10) * layoutScale,
          minHeight: 120 * layoutScale,
          padding: 9 * layoutScale,
          borderWidth: 2 * layoutScale,
          borderColor: accent,
          borderRadius: 13 * layoutScale,
        },
      ]}
    >
      <View
        style={[styles.influenceIdentity, { width: 61 * layoutScale }]}
      >
        <AssetSvg
          asset={icon}
          width={59 * layoutScale}
          height={69 * layoutScale}
          accessibilityLabel={title}
          pointerEvents="none"
        />
      </View>
      <View
        style={[styles.influenceMain, { marginLeft: 8 * layoutScale }]}
      >
        {[
          { label: '股票', value: allocation?.stock },
          { label: '現金', value: allocation?.cash },
        ].map((metric) => (
          <View key={metric.label} style={styles.influenceMetricRow}>
            <Text
              style={[
                styles.influenceMetricLabel,
                { fontSize: 11 * layoutScale, lineHeight: 16 * layoutScale },
              ]}
            >
              {metric.label}
            </Text>
            <View
              style={[
                styles.influenceTrack,
                {
                  height: 8 * layoutScale,
                  borderRadius: 4 * layoutScale,
                  marginHorizontal: 7 * layoutScale,
                },
              ]}
            >
              <View
                style={[
                  styles.influenceFill,
                  {
                    width: `${Math.max(
                      0,
                      Math.min(100, metric.value || 0),
                    )}%`,
                    backgroundColor: accent,
                    borderRadius: 4 * layoutScale,
                  },
                ]}
              />
            </View>
            <Text
              style={[
                styles.influenceMetricValue,
                { fontSize: 14 * layoutScale, lineHeight: 20 * layoutScale },
              ]}
            >
              {formatPercent(metric.value)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function FinalDecisionPanel({ data, portfolioAllocation, layoutScale, width }) {
  const seekingAllocation = agentAllocation(data, 'risk_seeking', 2);
  const averseAllocation = agentAllocation(data, 'risk_averse', 2);
  const allocationBoxWidth = width * 0.335;
  const warningWidth = width - 22 * layoutScale;

  return (
    <View style={{ width }}>
      <View
        style={[
          styles.warningBanner,
          {
            width: warningWidth,
            height: 66 * layoutScale,
            marginTop: 14 * layoutScale,
            alignSelf: 'center',
            paddingHorizontal: 12 * layoutScale,
            borderRadius: 14 * layoutScale,
          },
        ]}
      >
        <AssetSvg
          asset={NOTICE_IMAGE}
          width={46 * layoutScale}
          height={46 * layoutScale}
          accessibilityLabel="Warning"
          pointerEvents="none"
        />
        <Text
          style={[
            styles.warningText,
            { fontSize: 12 * layoutScale, lineHeight: 18 * layoutScale },
          ]}
        >
          此為 AI Agent 討論的參考結果，與個人風險偏好設定無關
        </Text>
      </View>

      <View
        style={[
          styles.finalPanel,
          {
            width,
            alignSelf: 'center',
            marginTop: 21 * layoutScale,
            padding: 20 * layoutScale,
            paddingBottom: 98 * layoutScale,
            borderRadius: 10 * layoutScale,
          },
        ]}
      >
        <View style={styles.finalHeading}>
          <View
            style={[
              styles.finalHeadingIcon,
              {
                width: 50 * layoutScale,
                height: 50 * layoutScale,
                borderRadius: 25 * layoutScale,
              },
            ]}
          >
            <AssetSvg
              asset={JUDGE_IMAGE}
              width={50 * layoutScale}
              height={50 * layoutScale}
              accessibilityLabel="Judge"
              pointerEvents="none"
              style={styles.judgeAsset}
            />
            <View
              style={[
                styles.judgeFallbackIcon,
                { width: 50 * layoutScale, height: 50 * layoutScale },
              ]}
              pointerEvents="none"
            >
              <View
                style={[
                  styles.judgeGavelHead,
                  {
                    width: 23 * layoutScale,
                    height: 6 * layoutScale,
                    top: 16 * layoutScale,
                    left: 13 * layoutScale,
                    borderRadius: 3 * layoutScale,
                  },
                ]}
              />
              <View
                style={[
                  styles.judgeGavelHandle,
                  {
                    width: 5 * layoutScale,
                    height: 20 * layoutScale,
                    top: 22 * layoutScale,
                    left: 25 * layoutScale,
                    borderRadius: 2.5 * layoutScale,
                  },
                ]}
              />
              <View
                style={[
                  styles.judgeGavelBase,
                  {
                    width: 20 * layoutScale,
                    height: 2 * layoutScale,
                    left: 15 * layoutScale,
                    bottom: 10 * layoutScale,
                    borderRadius: layoutScale,
                  },
                ]}
              />
            </View>
          </View>
          <Text
            style={[
              styles.finalHeadingTitle,
              { fontSize: 17 * layoutScale, lineHeight: 24 * layoutScale },
            ]}
          >
            judge裁決
          </Text>
          <View
            style={[
              styles.riskPill,
              {
                paddingHorizontal: 13 * layoutScale,
                paddingVertical: 7 * layoutScale,
                borderRadius: 18 * layoutScale,
              },
            ]}
          >
            <Text
              style={[
                styles.riskPillText,
                { fontSize: 13 * layoutScale, lineHeight: 18 * layoutScale },
              ]}
            >
              {riskLabel(data)}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.finalAllocationRow,
            { marginTop: 25 * layoutScale },
          ]}
        >
          <View
            style={[
              styles.finalAllocationBox,
              {
                width: allocationBoxWidth,
                minHeight: 124 * layoutScale,
                borderRadius: 14 * layoutScale,
                padding: 12 * layoutScale,
              },
            ]}
          >
            <Text
              style={[
                styles.finalAllocationLabel,
                { fontSize: 14 * layoutScale, lineHeight: 20 * layoutScale },
              ]}
            >
              股票
            </Text>
            <Text
              style={[
                styles.finalStockPercent,
                {
                  marginTop: 6 * layoutScale,
                  fontSize: 42 * layoutScale,
                  lineHeight: 48 * layoutScale,
                },
              ]}
            >
              {formatPercent(portfolioAllocation?.stock)}
            </Text>
          </View>
          <View
            style={[
              styles.finalAllocationBox,
              {
                width: allocationBoxWidth,
                minHeight: 124 * layoutScale,
                borderRadius: 14 * layoutScale,
                padding: 12 * layoutScale,
              },
            ]}
          >
            <Text
              style={[
                styles.finalAllocationLabel,
                { fontSize: 14 * layoutScale, lineHeight: 20 * layoutScale },
              ]}
            >
              現金
            </Text>
            <Text
              style={[
                styles.finalCashPercent,
                {
                  marginTop: 6 * layoutScale,
                  fontSize: 42 * layoutScale,
                  lineHeight: 48 * layoutScale,
                },
              ]}
            >
              {formatPercent(portfolioAllocation?.cash)}
            </Text>
          </View>
        </View>

        <Text
          style={[
            styles.influenceSectionTitle,
            {
              marginTop: 26 * layoutScale,
              fontSize: 14 * layoutScale,
              lineHeight: 20 * layoutScale,
            },
          ]}
        >
          討論所受之影響力
        </Text>
        <InfluenceRow
          title="風險追求"
          allocation={seekingAllocation}
          icon={RISK_SEEKING_IMAGE}
          accent="#526BFF"
          layoutScale={layoutScale}
        />
        <InfluenceRow
          title="風險趨避"
          allocation={averseAllocation}
          icon={RISK_AVERSE_IMAGE}
          accent="#E47700"
          layoutScale={layoutScale}
          secondary
        />

      </View>
    </View>
  );
}

function MeetingProcess({ onBack, style }) {
  const { width: screenWidth, height: screenHeight } = useViewportDimensions();
  const {
    investmentResult,
    discussionRunPending,
    discussionRunError,
    startDiscussion,
  } = useAppSettings();
  const [showChatHistory, setShowChatHistory] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState('round1');
  const [latestData, setLatestData] = React.useState(null);
  const [latestLoading, setLatestLoading] = React.useState(true);
  const [latestError, setLatestError] = React.useState(null);

  React.useEffect(() => {
    let active = true;

    if (investmentResult?.discussion) {
      setLatestData(investmentResult);
      setLatestError(null);
      setLatestLoading(false);
      return () => {
        active = false;
      };
    }

    if (investmentResult) {
      // Keep the available Model 1/2 portfolio visible while asking the
      // backend whether a completed Model 3 discussion already exists.
      setLatestData(investmentResult);
    }
    setLatestLoading(true);

    fetchLatestInvestment()
      .then((result) => {
        if (active) {
          setLatestData(result);
          setLatestError(null);
        }
      })
      .catch((requestError) => {
        if (active) {
          setLatestError(requestError.message || '無法取得最新 Agent 結果。');
        }
      })
      .finally(() => {
        if (active) {
          setLatestLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [investmentResult]);

  // Keep the meeting canvas full-bleed on phone-sized screens, but cap it on
  // wider web viewports so the tabs and header stay grouped like the design.
  const pageWidth = Math.min(screenWidth, DESIGN_WIDTH);
  const contentWidth = Math.min(
    Math.max(pageWidth - 20, 320),
    DESIGN_WIDTH,
  );
  const layoutScale = contentWidth / DESIGN_WIDTH;
  const panelWidth = contentWidth - 36 * layoutScale;
  const displayData = investmentResult?.discussion
    ? investmentResult
    : latestData || investmentResult;
  const discussionReady = Boolean(displayData?.discussion);
  const portfolioAllocation = summarizePortfolio(displayData?.portfolio);
  const activeRound = activeTab === 'round2' ? 2 : 1;
  const allMessages = displayData?.discussion?.messages || [];
  const roundMessages = allMessages.filter(
    (message) =>
      (message.type === 'moderator' && message.round === 0) ||
      (message.type === 'agent' && message.round === activeRound),
  );
  const previewMessages = roundMessages;
  const seekingDecision =
    displayData?.discussion?.structured_decisions?.[
      `risk_seeking_round${activeRound}`
    ];
  const averseDecision =
    displayData?.discussion?.structured_decisions?.[
      `risk_averse_round${activeRound}`
    ];
  const seekingCandidates = candidateStockRows(displayData, seekingDecision);
  const averseCandidates = candidateStockRows(displayData, averseDecision);
  const agentMeetingWidth = pageWidth;
  const agentMeetingHeight = agentMeetingWidth * (246 / 575);

  if (showChatHistory) {
    return (
      <View style={[styles.container, style, { width: screenWidth }]}>
        <ChatHistory
          initialData={displayData}
          onBack={() => setShowChatHistory(false)}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, style, { width: screenWidth }]}>
      <ScrollView
        horizontal={false}
        bounces={false}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
        style={styles.pageScroll}
        contentContainerStyle={[
          styles.pageContent,
          { width: screenWidth, minHeight: screenHeight },
        ]}
      >
          <View
            style={[
              styles.meetingPage,
              { width: pageWidth, minHeight: screenHeight },
            ]}
          >
            <View
              style={[
                styles.topBar,
                { width: pageWidth, height: 156 * layoutScale },
              ]}
            >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="關閉會議過程"
              onPress={onBack}
              style={[
                styles.closeButton,
                {
                  width: 38 * layoutScale,
                  height: 38 * layoutScale,
                  top: 50 * layoutScale,
                  right: 28 * layoutScale,
                },
              ]}
            >
              <AssetSvg
                asset={CANCEL_IMAGE}
                width={38 * layoutScale}
                height={38 * layoutScale}
                pointerEvents="none"
              />
            </Pressable>
          </View>

          <View
            style={[
              styles.tabBar,
              {
                width: pageWidth,
                height: 102 * layoutScale,
                marginTop: -22 * layoutScale,
                paddingHorizontal: 18 * layoutScale,
              },
            ]}
          >
            <View
              pointerEvents="none"
              style={[
                styles.tabBarBase,
                {
                  height: 70 * layoutScale,
                },
              ]}
            />

            {MEETING_TABS.map((tab) => {
              const active = activeTab === tab.id;

              return (
                <View
                  key={tab.id}
                  style={[
                    styles.tabShell,
                    {
                      width: contentWidth * 0.33,
                      height: (active ? 122 : 103) * layoutScale,
                      borderTopLeftRadius: 42 * layoutScale,
                      borderTopRightRadius: 42 * layoutScale,
                    },
                  ]}
                >
                  <Pressable
                    accessibilityRole="tab"
                    accessibilityLabel={tab.label}
                    accessibilityState={{ selected: active }}
                    onPress={() => setActiveTab(tab.id)}
                    style={({ pressed }) => [
                      styles.tabButton,
                      {
                        width: contentWidth * 0.27,
                        height: 72 * layoutScale,
                        borderRadius: 36 * layoutScale,
                      },
                      active && styles.tabButtonActive,
                      pressed && styles.tabButtonPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.tabButtonText,
                        {
                          fontSize: 18 * layoutScale,
                          lineHeight: 25 * layoutScale,
                        },
                      ]}
                    >
                      {tab.label}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>

          {activeTab === 'final' ? (
            <FinalDecisionPanel
              data={displayData}
              portfolioAllocation={discussionReady ? portfolioAllocation : null}
              layoutScale={layoutScale}
              width={panelWidth}
            />
          ) : (
            <>
              <RoundChat
                messages={previewMessages}
                loading={latestLoading}
                error={latestError}
                hasData={Boolean(displayData)}
                discussionPending={discussionRunPending}
                discussionError={discussionRunError}
                onStartDiscussion={startDiscussion}
                layoutScale={layoutScale}
                width={panelWidth}
                onOpenHistory={() => setShowChatHistory(true)}
              />

              <View
                style={[
                  styles.roundAllocationList,
                  {
                    width: panelWidth - 36 * layoutScale,
                    marginTop: 24 * layoutScale,
                  },
                ]}
              >
                <CandidateCard
                  title="風險追求"
                  candidates={seekingCandidates}
                  icon={RISK_SEEKING_IMAGE}
                  accent="#526BFF"
                  layoutScale={layoutScale}
                  width={(panelWidth - 54 * layoutScale) / 2}
                />
                <CandidateCard
                  title="風險趨避"
                  candidates={averseCandidates}
                  icon={RISK_AVERSE_IMAGE}
                  accent="#E47700"
                  layoutScale={layoutScale}
                  width={(panelWidth - 54 * layoutScale) / 2}
                />
              </View>
            </>
          )}

          <View
            style={[
              styles.agentMeetingSlot,
              {
                minHeight: agentMeetingHeight,
                paddingTop: 22 * layoutScale,
              },
            ]}
          >
            <AssetSvg
              asset={AGENT_MEETING_IMAGE}
              width={agentMeetingWidth}
              height={agentMeetingHeight}
              accessibilityLabel="AgentMeeting"
              style={styles.agentMeeting}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

export default React.memo(MeetingProcess);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#2E2F2E',
  },
  pageScroll: {
    flex: 1,
  },
  pageContent: {
    alignItems: 'center',
    flexGrow: 1,
    paddingBottom: 0,
  },
  meetingPage: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  topBar: {
    position: 'relative',
    backgroundColor: '#596877',
  },
  closeButton: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBar: {
    position: 'relative',
    flexDirection: 'row',
    direction: 'ltr',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
  },
  tabBarBase: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#2E2F2E',
  },
  tabShell: {
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: '#2E2F2E',
  },
  tabButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D9D9D9',
    backgroundColor: '#2E2F2E',
  },
  tabButtonActive: {
    backgroundColor: '#8793B5',
  },
  tabButtonPressed: {
    opacity: 0.78,
  },
  tabButtonDisabled: {
    opacity: 0.42,
  },
  tabButtonText: {
    color: '#F1F1F1',
    fontFamily: 'Goldman',
    fontWeight: '400',
    textAlign: 'center',
  },
  chatPanel: {
    overflow: 'hidden',
    borderRadius: 11,
    backgroundColor: '#484848',
    marginTop: 14,
  },
  chatHeader: {
    borderBottomWidth: 2,
    borderBottomColor: '#303030',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatTitle: {
    color: '#F2F2F2',
    fontFamily: 'Goldman',
  },
  expandButton: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatBody: {
    flex: 1,
  },
  previewScroll: {
    flex: 1,
    width: '100%',
  },
  previewContent: {
    paddingTop: 12,
    paddingBottom: 20,
  },
  previewMessageRow: {
    position: 'relative',
    width: '100%',
  },
  previewAvatar: {
    position: 'absolute',
    zIndex: 10,
    elevation: 10,
  },
  messageBubble: {
    borderRadius: 10,
    zIndex: 1,
  },
  messageBubbleModerator: {
    backgroundColor: '#0875D7',
  },
  messageBubbleRiskSeeking: {
    backgroundColor: '#455EFC',
  },
  messageBubbleRiskAverse: {
    backgroundColor: '#B7461B',
  },
  messageText: {
    color: '#FFFFFF',
    fontFamily: 'Goldman',
  },
  previewLabel: {
    color: '#D7E9FF',
    fontFamily: 'Goldman',
    marginBottom: 8,
  },
  previewStatus: {
    alignItems: 'flex-start',
    paddingHorizontal: 4,
  },
  discussionStatusText: {
    marginTop: 8,
  },
  startDiscussionButton: {
    alignSelf: 'center',
    backgroundColor: '#8793B5',
    borderWidth: 1,
    borderColor: '#D9D9D9',
  },
  startDiscussionButtonPressed: {
    opacity: 0.78,
  },
  startDiscussionButtonText: {
    color: '#FFFFFF',
    fontFamily: 'Goldman',
    textAlign: 'center',
  },
  discussionErrorText: {
    color: '#FFB2A7',
    fontFamily: 'Goldman',
    textAlign: 'center',
  },
  roundAllocationList: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  candidateCard: {
    backgroundColor: '#2E2F2E',
  },
  candidateCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  candidateCardTitle: {
    flex: 1,
    color: '#D9D9D9',
    fontFamily: 'Goldman',
  },
  candidateList: {
    flex: 1,
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  candidateItem: {
    color: '#D9D9D9',
    fontFamily: 'Goldman',
    flexShrink: 1,
  },
  candidateEmpty: {
    color: '#9D9D9D',
    fontFamily: 'Goldman',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B2729',
    borderWidth: 2,
    borderColor: '#684B4E',
  },
  warningText: {
    flex: 1,
    color: '#E7D9D9',
    fontFamily: 'Goldman',
    marginLeft: 8,
  },
  finalPanel: {
    backgroundColor: '#484848',
  },
  finalHeading: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  finalHeadingIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#5A5A5A',
    position: 'relative',
    overflow: 'hidden',
  },
  judgeAsset: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  judgeFallbackIcon: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  judgeGavelHead: {
    position: 'absolute',
    backgroundColor: '#0275EF',
    transform: [{ rotate: '-45deg' }],
  },
  judgeGavelHandle: {
    position: 'absolute',
    backgroundColor: '#0275EF',
    transform: [{ rotate: '-45deg' }],
  },
  judgeGavelBase: {
    position: 'absolute',
    backgroundColor: '#0275EF',
  },
  finalHeadingTitle: {
    color: '#0875D7',
    fontFamily: 'Goldman',
    marginLeft: 10,
    flex: 1,
  },
  riskPill: {
    backgroundColor: '#292929',
  },
  riskPillText: {
    color: '#F0F0F0',
    fontFamily: 'Goldman',
  },
  finalAllocationRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 18,
  },
  finalAllocationBox: {
    backgroundColor: '#070707',
    borderWidth: 2,
    borderColor: '#0875D7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  finalAllocationLabel: {
    color: '#D9D9D9',
    fontFamily: 'Goldman',
    textAlign: 'center',
  },
  finalStockPercent: {
    color: '#0875D7',
    fontFamily: 'Goldman',
    fontWeight: '700',
    textAlign: 'center',
  },
  finalCashPercent: {
    color: '#F0F0F0',
    fontFamily: 'Goldman',
    fontWeight: '700',
    textAlign: 'center',
  },
  influenceSectionTitle: {
    color: '#D9D9D9',
    fontFamily: 'Goldman',
    marginTop: 20,
  },
  influenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  influenceIdentity: {
    width: 47,
    alignItems: 'center',
    justifyContent: 'center',
  },
  influenceIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#5A5A5A',
    borderWidth: 2,
  },
  influenceMain: {
    flex: 1,
    marginLeft: 10,
    justifyContent: 'center',
  },
  influenceMetricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  influenceMetricLabel: {
    color: '#D9D9D9',
    fontFamily: 'Goldman',
    width: 30,
  },
  influenceMetricValue: {
    color: '#F0F0F0',
    fontFamily: 'Goldman',
    fontWeight: '700',
    minWidth: 48,
    textAlign: 'right',
  },
  influenceTrack: {
    flex: 1,
    backgroundColor: '#232323',
    overflow: 'hidden',
  },
  influenceFill: {
    height: '100%',
  },
  agentMeetingSlot: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 'auto',
  },
  agentMeeting: {
    alignSelf: 'center',
  },
});
