import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import ChatHistory from './ChatHistory';
import AssetSvg from '../components/AssetSvg';
import { fetchLatestInvestment } from '../services/investmentApi';

const AGENT_MEETING_IMAGE = require('../assets/image/AgentMeeting.svg');
const JUDGE_IMAGE = require('../assets/image/judge.svg');
const CANCEL_IMAGE = require('../assets/image/cancel.svg');
const SCALING_IMAGE = require('../assets/image/scaling.svg');

const MEETING_TABS = [
  { id: 'round1', label: '第一輪' },
  { id: 'round2', label: '第二輪' },
  { id: 'final', label: '最終裁決' },
];

function MeetingProcess({ onBack, style }) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [showChatHistory, setShowChatHistory] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState('round1');
  const [latestData, setLatestData] = React.useState(null);
  const [latestLoading, setLatestLoading] = React.useState(true);
  const [latestError, setLatestError] = React.useState(null);

  React.useEffect(() => {
    let active = true;

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
  }, []);

  const judgeMessage = latestData?.discussion?.messages?.find(
    (message) => message.type === 'judge',
  );
  const previewMessages = (() => {
    const messages = latestData?.discussion?.messages || [];

    if (activeTab === 'final') {
      return judgeMessage ? [judgeMessage] : [];
    }

    const roundNumber = activeTab === 'round1' ? 1 : 2;
    const roundMessages = messages.filter(
      (message) => message.type === 'agent' && message.round === roundNumber,
    );

    if (activeTab === 'round1') {
      const introduction = messages.find((message) => message.type === 'moderator');
      return introduction ? [introduction, ...roundMessages] : roundMessages;
    }

    return roundMessages;
  })();
  const maxContentWidth = Math.min(Math.max(screenWidth - 40, 300), 572);
  const layoutScale = Math.min(
    maxContentWidth / 572,
    screenHeight / 1350,
    1,
  );
  const contentWidth = 572 * layoutScale;
  const chatHeight = 790 * layoutScale;
  const chatHeaderHeight = 48 * layoutScale;
  const agentMeetingWidth = Math.min(screenWidth - 20, 620 * layoutScale);
  const agentMeetingHeight = agentMeetingWidth * (246 / 575);
  const cancelSize = 38 * layoutScale;

  if (showChatHistory) {
    return (
      <View style={[styles.container, style]}>
        <ChatHistory
          initialData={latestData}
          onBack={() => setShowChatHistory(false)}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <View
        pointerEvents="auto"
        style={styles.body}
      >
      <View
        style={[
          styles.content,
          {
            paddingTop: 4 * layoutScale,
          },
        ]}
      >
        <View style={[styles.hero, { width: contentWidth }]}>
          <View
            style={[
              styles.topBar,
              {
                width: contentWidth,
                height: 116 * layoutScale,
              },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="關閉會議過程"
              onPress={onBack}
              style={[
                styles.closeButton,
                {
                  width: cancelSize,
                  height: cancelSize,
                  marginTop: 28 * layoutScale,
                  marginRight: -2 * layoutScale,
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

          <View
            style={[
              styles.tabBar,
              {
                height: 88 * layoutScale,
                paddingHorizontal: 10 * layoutScale,
              },
            ]}
          >
            {MEETING_TABS.map((tab) => {
              const active = activeTab === tab.id;

              return (
                <Pressable
                  key={tab.id}
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
                      { fontSize: 19 * layoutScale, lineHeight: 25 * layoutScale },
                    ]}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View
          style={[
            styles.chatPanel,
            {
              width: contentWidth,
              height: chatHeight,
              marginTop: 20 * layoutScale,
            },
          ]}
        >
          <View style={[styles.chatHeader, { height: chatHeaderHeight }]}>
            <Text style={[styles.chatTitle, { fontSize: 22 * layoutScale }]}>
              Chat
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="scaling"
              onPress={() => setShowChatHistory(true)}
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
          <View style={[styles.chatBody, { paddingTop: 12 * layoutScale }]}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              style={styles.previewScroll}
              contentContainerStyle={[
                styles.previewContent,
                { paddingHorizontal: 14 * layoutScale },
              ]}
            >
              {latestLoading ? (
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
              ) : previewMessages.length > 0 ? (
                previewMessages.map((message, index) => {
                  const isRiskAverse = message.role === 'risk_averse';
                  const isRight = isRiskAverse;
                  const isModerator = message.role === 'moderator';
                  const bubbleStyle = isModerator
                    ? styles.messageBubbleModerator
                    : isRiskAverse
                      ? styles.messageBubbleRiskAverse
                      : styles.messageBubbleRiskSeeking;
                  const avatarAsset = isModerator
                    ? JUDGE_IMAGE
                    : isRiskAverse
                      ? require('../assets/image/risk-averse.svg')
                      : require('../assets/image/risk-seeking.svg');

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
                            width: '82%',
                            alignSelf: isRight ? 'flex-end' : 'flex-start',
                            marginLeft: isRight ? 0 : 48 * layoutScale,
                            marginRight: isRight ? 48 * layoutScale : 0,
                            paddingHorizontal: 14 * layoutScale,
                            paddingVertical: 12 * layoutScale,
                          },
                        ]}
                      >
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
                        </Text>
                        <Text
                          style={[
                            styles.messageText,
                            {
                              fontSize: 17 * layoutScale,
                              lineHeight: 31 * layoutScale,
                            },
                          ]}
                        >
                          {message.text}
                        </Text>
                      </View>
                    </View>
                  );
                })
              ) : (
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
                    {latestError || '目前沒有可顯示的 Agent 結果。'}
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>

        <View
          style={[
            styles.agentMeetingSlot,
            {
              minHeight: agentMeetingHeight,
              marginTop: 28 * layoutScale,
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

      </View>

    </View>
  );
}

export default React.memo(MeetingProcess);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#2E2F2E',
    borderWidth: 3,
    borderColor: '#008DFF',
  },
  content: {
    flex: 1,
    alignItems: 'center',
  },
  body: {
    flex: 1,
  },
  hero: {
    backgroundColor: '#596877',
    overflow: 'hidden',
  },
  topBar: {
    height: 116,
    alignItems: 'flex-end',
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  tabButtonText: {
    color: '#F1F1F1',
    fontFamily: 'Goldman',
    fontWeight: '400',
    textAlign: 'center',
  },
  closeButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatPanel: {
    overflow: 'hidden',
    borderRadius: 11,
    backgroundColor: '#484848',
  },
  chatHeader: {
    height: 48,
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
    paddingTop: 20,
  },
  previewScroll: {
    flex: 1,
    width: '100%',
  },
  previewContent: {
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
  },
  agentMeetingSlot: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  agentMeeting: {
    alignSelf: 'center',
  },
});
