import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AssetSvg from '../components/AssetSvg';
import { fetchLatestInvestment } from '../services/investmentApi';
import useViewportDimensions from '../hooks/useViewportDimensions';

const CANCEL_IMAGE = require('../assets/image/cancel.svg');
const JUDGE_IMAGE = require('../assets/image/Llama.svg');
const RISK_SEEKING_IMAGE = require('../assets/image/Qwen.svg');
const RISK_AVERSE_IMAGE = require('../assets/image/Mistral.svg');

const DESIGN_WIDTH = 436;

const MESSAGE_VISUALS = {
  moderator: {
    asset: JUDGE_IMAGE,
    bubbleStyle: 'judgeBubble',
    avatarSide: 'left',
  },
  judge: {
    asset: JUDGE_IMAGE,
    bubbleStyle: 'judgeBubble',
    avatarSide: 'left',
  },
  risk_seeking: {
    asset: RISK_SEEKING_IMAGE,
    bubbleStyle: 'riskSeekingBubble',
    avatarSide: 'right',
  },
  risk_averse: {
    asset: RISK_AVERSE_IMAGE,
    bubbleStyle: 'riskAverseBubble',
    avatarSide: 'right',
  },
};

function formatPercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${(number * 100).toFixed(2)}%` : '--';
}

function cleanUserFacingText(value) {
  return String(value || '')
    .replace(
      /(?:ER|CONC|RISK|SCORE|CASH|REGIME|DURATION|MTA|WEIGHT)_\d+(?=\s*[：:（(])/g,
      '',
    )
    .replace(/（立場代碼：[^）]*）/g, '')
    .replace(/立場代碼：[^。\n]+[。]?/g, '')
    .replace(/理由代碼：[^。\n]+[。]?/g, '')
    .replace(/並以「[^」]*」概括對方論點。?/g, '')
    .replace(/本輪提出的\s*Claim IDs[^。\n]*[。]?/gi, '')
    .replace(/本輪的\s*Claim IDs[^。\n]*[。]?/gi, '')
    .replace(/\b(?:RS|RA)\d+_C\d+\b/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function formatDecisionDetails(decision, decisionDisplay) {
  if (decisionDisplay) {
    const displayLines = [];

    if (decisionDisplay.preferred) {
      displayLines.push(`偏好部位：${decisionDisplay.preferred}`);
    }
    if (decisionDisplay.avoid) {
      displayLines.push(`優先控制部位：${decisionDisplay.avoid}`);
    }
    if (decisionDisplay.cash_direction) {
      displayLines.push(`現金方向：${decisionDisplay.cash_direction}`);
    }
    if (decisionDisplay.stance) {
      displayLines.push(`整體立場：${decisionDisplay.stance}`);
    }
    if (decisionDisplay.directions) {
      displayLines.push(`配置方向：${decisionDisplay.directions}`);
    }
    if (decisionDisplay.accepted_opponent) {
      displayLines.push(`認同對方的部分：${decisionDisplay.accepted_opponent}`);
    }
    if (decisionDisplay.rebutted_opponent) {
      displayLines.push(`不同意對方的部分：${decisionDisplay.rebutted_opponent}`);
    }
    if (decisionDisplay.evaluation) {
      displayLines.push(`整體評估：${decisionDisplay.evaluation}`);
    }
    if (decisionDisplay.action) {
      displayLines.push(`配置處置：${decisionDisplay.action}`);
    }
    if (decisionDisplay.increase) {
      displayLines.push(`相對提高：${decisionDisplay.increase}`);
    }
    if (decisionDisplay.decrease) {
      displayLines.push(`相對降低：${decisionDisplay.decrease}`);
    }
    if (decisionDisplay.winning_side) {
      displayLines.push(`最後較採納：${decisionDisplay.winning_side}`);
    }
    if (decisionDisplay.rejected_claims) {
      displayLines.push(`未採納的觀點：${decisionDisplay.rejected_claims}`);
    }

    return cleanUserFacingText(displayLines.join('\n'));
  }

  if (!decision) {
    return '';
  }

  const lines = [];

  if (decision.preferred_asset !== undefined) {
    lines.push(`偏好部位：${decision.preferred_asset}`);
  }
  if (decision.avoid_asset !== undefined) {
    lines.push(`優先控制部位：${decision.avoid_asset}`);
  }
  if (decision.cash_direction !== undefined) {
    lines.push(`現金方向：${decision.cash_direction}`);
  }
  if (decision.evaluation !== undefined) {
    lines.push(`評估：${decision.evaluation}`);
  }
  if (decision.action !== undefined) {
    lines.push(`配置處置：${decision.action}`);
  }
  if (decision.increase) {
    lines.push(`相對提高：${JSON.stringify(decision.increase)}`);
  }
  if (decision.decrease) {
    lines.push(`相對降低：${JSON.stringify(decision.decrease)}`);
  }

  return cleanUserFacingText(lines.join('\n'));
}

function MessageDetails({ message, layoutScale }) {
  const evidence = Array.isArray(message.evidence_display)
    ? message.evidence_display.map(cleanUserFacingText)
    : Array.isArray(message.evidence)
      ? message.evidence.map((item) =>
          cleanUserFacingText(item?.text || String(item)),
        )
      : [];
  const claims = Array.isArray(message.claims_display)
    ? message.claims_display.map(cleanUserFacingText)
    : [];
  const decisionText = formatDecisionDetails(
    message.decision,
    message.decision_display,
  );

  return (
    <View style={[styles.detailsPanel, { marginTop: 12 * layoutScale }]}>
      {evidence.length > 0 ? (
        <View>
          <Text style={[styles.detailTitle, { fontSize: 13 * layoutScale }]}>
            本輪參考的資料
          </Text>
          {evidence.map((item, index) => (
            <Text
              key={`${item}-${index}`}
              style={[
                styles.detailText,
                {
                  fontSize: 12 * layoutScale,
                  lineHeight: 19 * layoutScale,
                },
              ]}
            >
              • {item}
            </Text>
          ))}
        </View>
      ) : null}

      {decisionText ? (
        <View style={{ marginTop: 10 * layoutScale }}>
          <Text style={[styles.detailTitle, { fontSize: 13 * layoutScale }]}>
            結構化決策資料
          </Text>
          <Text
            style={[
              styles.detailText,
              {
                fontSize: 12 * layoutScale,
                lineHeight: 19 * layoutScale,
              },
            ]}
          >
            {decisionText}
          </Text>
        </View>
      ) : null}

      {claims.length > 0 ? (
        <View style={{ marginTop: 10 * layoutScale }}>
          <Text style={[styles.detailTitle, { fontSize: 13 * layoutScale }]}>
            本輪提出的觀點
          </Text>
          {claims.map((claim, index) => (
            <Text
              key={`${claim}-${index}`}
              style={[
                styles.detailText,
                {
                  fontSize: 12 * layoutScale,
                  lineHeight: 19 * layoutScale,
                },
              ]}
            >
              • {claim}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function ChatHistory({ onBack, style, initialData }) {
  const { width: screenWidth, height: screenHeight } = useViewportDimensions();
  const [data, setData] = React.useState(initialData || null);
  const [loading, setLoading] = React.useState(!initialData);
  const [error, setError] = React.useState(null);
  const [expandedMessageIds, setExpandedMessageIds] = React.useState({});

  React.useEffect(() => {
    // Model 1/2 data may be passed in before Model 3 has finished.  Only
    // skip the request when the supplied object actually contains the
    // discussion record; otherwise fetch the latest backend result.
    if (initialData?.discussion) {
      setData(initialData);
      setError(null);
      setLoading(false);
      return undefined;
    }

    let active = true;
    if (initialData) {
      setData(initialData);
    }
    setLoading(true);

    fetchLatestInvestment()
      .then((result) => {
        if (active) {
          setData(result);
          setError(null);
        }
      })
      .catch((requestError) => {
        if (active) {
          setError(requestError.message || '無法取得 Agent 會議紀錄。');
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [initialData]);

  const contentWidth = Math.min(Math.max(screenWidth - 2, 300), DESIGN_WIDTH);
  const layoutScale = contentWidth / DESIGN_WIDTH;
  const meetingContentWidth = Math.min(Math.max(screenWidth - 40, 300), 572);
  const meetingLayoutScale = Math.min(
    meetingContentWidth / 572,
    screenHeight / 1350,
    1,
  );
  const cancelSize = 38 * meetingLayoutScale;
  const cancelRight =
    (contentWidth - meetingContentWidth) / 2 - 2 * meetingLayoutScale;

  const market = data?.market || {};
  const messages = data?.discussion?.messages || [];

  const toggleMessage = (messageId) => {
    setExpandedMessageIds((current) => ({
      ...current,
      [messageId]: !current[messageId],
    }));
  };

  const renderMessage = (message, index) => {
    const visual = MESSAGE_VISUALS[message.role] || MESSAGE_VISUALS.judge;
    const isRight = visual.avatarSide === 'right';
    const messageId = message.id || `${message.role}-${index}`;
    const isExpanded = Boolean(expandedMessageIds[messageId]);
    const bubbleWidth = (isRight ? 327 : 323) * layoutScale;
    const marginLeft = (isRight ? 72 : 48) * layoutScale;

    return (
      <View
        key={messageId}
        style={[styles.messageBlock, { marginBottom: 22 * layoutScale }]}
      >
        <AssetSvg
          asset={visual.asset}
          width={(isRight ? 47 : 44) * layoutScale}
          height={(isRight ? 34 : 26) * layoutScale}
          accessibilityLabel={message.speaker || message.role}
          style={[
            styles.avatar,
            isRight
              ? {
                  right: 14 * layoutScale,
                  top: -14 * layoutScale,
                }
              : {
                  left: 13 * layoutScale,
                  top: -1 * layoutScale,
                },
          ]}
        />
        <View
          style={[
            styles.historyBubble,
            styles[visual.bubbleStyle],
            {
              width: bubbleWidth,
              marginLeft,
              paddingHorizontal: 10 * layoutScale,
              paddingVertical: 10 * layoutScale,
            },
          ]}
        >
          <Text
            style={[
              styles.messageSpeaker,
              { fontSize: 13 * layoutScale, lineHeight: 20 * layoutScale },
            ]}
          >
            {message.speaker}
            {message.round > 0 ? ` · 第 ${message.round} 輪` : ''}
          </Text>
          <Text
            style={[
              styles.historyText,
              {
                fontSize: 16 * layoutScale,
                lineHeight: 29 * layoutScale,
              },
            ]}
          >
            {cleanUserFacingText(message.text)}
          </Text>
          {message.evidence?.length || message.decision ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                isExpanded ? '收起詳細資料' : '查看詳細資料'
              }
              onPress={() => toggleMessage(messageId)}
              style={styles.detailsButton}
            >
              <Text
                style={[
                  styles.detailsButtonText,
                  { fontSize: 12 * layoutScale },
                ]}
              >
                {isExpanded ? '收起詳細資料' : '查看詳細資料'}
              </Text>
            </Pressable>
          ) : null}
          {isExpanded ? (
            <MessageDetails message={message} layoutScale={layoutScale} />
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, style, { width: screenWidth }]}>
      <View
        style={[
          styles.header,
          {
            width: contentWidth,
            height: 87 * layoutScale,
          },
        ]}
      >
        <Text style={[styles.title, { fontSize: 22 * layoutScale }]}>
          chat history
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="close chat history"
          onPress={onBack}
          style={[
            styles.closeButton,
            {
              width: cancelSize,
              height: cancelSize,
              top: 32 * meetingLayoutScale,
              right: cancelRight,
            },
          ]}
        >
          <AssetSvg
            asset={CANCEL_IMAGE}
            width={cancelSize}
            height={cancelSize}
            pointerEvents="none"
          />
        </Pressable>
      </View>

      <ScrollView
        horizontal={false}
        bounces={false}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
        style={[styles.historyScroll, { width: contentWidth }]}
        contentContainerStyle={{
          width: contentWidth,
          paddingTop: 25 * layoutScale,
          paddingBottom: 36 * layoutScale,
        }}
      >
        {loading ? (
          <View style={styles.statusContainer}>
            <ActivityIndicator color="#FFFFFF" />
            <Text style={[styles.statusText, { fontSize: 15 * layoutScale }]}>
              正在讀取最新 Agent 會議紀錄…
            </Text>
          </View>
        ) : error ? (
          <View style={styles.statusContainer}>
            <Text style={[styles.statusText, { fontSize: 15 * layoutScale }]}>
              尚未取得會議紀錄
            </Text>
            <Text style={[styles.errorText, { fontSize: 13 * layoutScale }]}>
              {error}
            </Text>
          </View>
        ) : (
          <View style={{ width: contentWidth }}>
            <View style={[styles.summaryCard, { marginBottom: 22 * layoutScale }]}>
              <Text style={[styles.summaryTitle, { fontSize: 15 * layoutScale }]}>
                本次投資會議
              </Text>
              <Text style={[styles.summaryText, { fontSize: 13 * layoutScale }]}>
                {market.target_month || '目前月份'} · 市場狀態：{market.predicted_regime || '--'}
              </Text>
              <Text style={[styles.summaryText, { fontSize: 12 * layoutScale }]}>
                Bear {formatPercent(market.prob_Bear)}　Bull {formatPercent(market.prob_Bull)}　Sideways {formatPercent(market.prob_Sideways)}
              </Text>
            </View>

            {messages.length > 0 ? (
              messages.map(renderMessage)
            ) : (
              <View style={styles.statusContainer}>
                <Text style={[styles.statusText, { fontSize: 15 * layoutScale }]}>
                  目前沒有可顯示的 Agent 討論。
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

export default React.memo(ChatHistory);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#2E2F2E',
  },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: '#737373',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#EDEDED',
    fontFamily: 'Goldman',
  },
  closeButton: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyScroll: {
    flex: 1,
  },
  messageBlock: {
    position: 'relative',
    width: '100%',
  },
  avatar: {
    position: 'absolute',
    zIndex: 2,
    elevation: 2,
  },
  historyBubble: {
    borderRadius: 8,
  },
  judgeBubble: {
    backgroundColor: '#0875D7',
  },
  riskSeekingBubble: {
    backgroundColor: '#455EFC',
  },
  riskAverseBubble: {
    backgroundColor: '#B7461B',
  },
  messageSpeaker: {
    color: '#D7E9FF',
    fontFamily: 'Goldman',
    marginBottom: 4,
  },
  historyText: {
    color: '#FFFFFF',
    fontFamily: 'Goldman',
  },
  detailsButton: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingVertical: 3,
  },
  detailsButtonText: {
    color: '#D8F0FF',
    fontFamily: 'Goldman',
    textDecorationLine: 'underline',
  },
  detailsPanel: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.35)',
    paddingTop: 9,
  },
  detailTitle: {
    color: '#EAF7FF',
    fontFamily: 'Goldman',
    marginBottom: 4,
  },
  detailText: {
    color: '#F5F5F5',
    fontFamily: 'Goldman',
  },
  summaryCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#737373',
    backgroundColor: '#3D3E3D',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  summaryTitle: {
    color: '#FFFFFF',
    fontFamily: 'Goldman',
    marginBottom: 4,
  },
  summaryText: {
    color: '#D8D8D8',
    fontFamily: 'Goldman',
    marginTop: 2,
  },
  statusContainer: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  statusText: {
    color: '#FFFFFF',
    fontFamily: 'Goldman',
    marginTop: 12,
    textAlign: 'center',
  },
  errorText: {
    color: '#FFB3A7',
    fontFamily: 'Goldman',
    marginTop: 8,
    textAlign: 'center',
  },
});
