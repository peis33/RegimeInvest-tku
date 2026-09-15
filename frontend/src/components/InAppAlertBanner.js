import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import AssetSvg from './AssetSvg';
import { formatAlertConditions } from '../services/alertText';

const companyName = item => item.company || item.body?.match(/^(.+?) \d{4}-\d{2}-\d{2}/)?.[1] || '';
function groupNotifications(notifications) {
  const groups = new Map();
  notifications.forEach(notification => {
    const company = companyName(notification);
    const key = company || notification.id;
    if (!groups.has(key)) groups.set(key, { key, company, notifications: [] });
    groups.get(key).notifications.push(notification);
  });
  return [...groups.values()];
}
function AlertContent({ group, summary }) {
  const conditions = summary ? '' : formatAlertConditions(group.notifications);
  return (
    <View style={styles.row}>
      <AssetSvg asset={require('../assets/image/notice.svg')} width={34} height={34} pointerEvents="none" />
      <View style={styles.content}>
        <Text style={styles.title}>觸價預警</Text>
        <Text style={styles.body}>
          預警已觸發！{summary ? <>目前<Text style={styles.company}>{summary}</Text>已觸發您所設置之限制</> : <><Text style={styles.company}>{group.company}</Text>{conditions}</>}
        </Text>
      </View>
    </View>
  );
}

export default function InAppAlertBanner({ notifications, onDismissAll, width }) {
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const [detailsOpen, setDetailsOpen] = useState(false);
  React.useEffect(() => {
    if (!focused || !notifications.length) setDetailsOpen(false);
  }, [focused, notifications.length]);
  if (!notifications.length) return null;
  const groups = groupNotifications(notifications);
  const multiple = groups.length > 1;
  const companies = groups.map(group => group.company).filter(Boolean).join('、');
  return (
    <View style={{ width, marginBottom: 20 }}>
      <View style={styles.card} accessibilityLiveRegion="polite">
        <View style={{ paddingRight: 22 }}>
          <AlertContent group={groups[0]} summary={multiple ? companies || '多筆警示' : null} />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="關閉觸價預警通知" onPress={onDismissAll} style={styles.closeSmall}>
          <Text style={styles.closeSmallText}>×</Text>
        </Pressable>
        {multiple ? <Pressable accessibilityRole="button" accessibilityLabel="查看全部觸價預警詳情" onPress={() => setDetailsOpen(true)} style={styles.detailsLink}>
          <Text style={styles.detailsLinkText}>查看詳情 &gt;</Text>
        </Pressable> : null}
      </View>
      <Modal visible={detailsOpen && focused} animationType="slide" onRequestClose={() => setDetailsOpen(false)}>
        <View style={styles.page}>
          <View style={[styles.header, { paddingTop: insets.top + 18 }]}>
            <Text accessibilityRole="header" style={styles.pageTitle}>觸價預警</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="關閉觸價預警詳情" onPress={() => setDetailsOpen(false)} style={[styles.closePage, { top: insets.top + 12 }]}>
              <Text style={styles.closePageText}>×</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 28 }]}>
            {groups.map(group => <View key={group.key} style={[styles.card, styles.detailCard]}>
              <AlertContent group={group} />
            </View>)}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  card: { width: '100%', backgroundColor: '#607080', borderRadius: 8, borderWidth: 1, borderColor: '#BCC6CE', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 14 },
  content: { flex: 1 },
  title: { color: '#FFFFFF', fontSize: 17, lineHeight: 23 },
  body: { color: '#DDE2E8', fontSize: 14, lineHeight: 20 },
  company: { color: '#8B3535' },
  closeSmall: { position: 'absolute', top: 0, right: 0, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  closeSmallText: { color: '#C7CDD2', fontSize: 27, lineHeight: 30 },
  detailsLink: { borderTopWidth: 1, borderTopColor: '#919CA6', alignItems: 'center', paddingVertical: 5 },
  detailsLinkText: { color: '#DDE2E8', fontSize: 15 },
  page: { flex: 1, backgroundColor: '#2E2F2E' },
  header: { backgroundColor: '#505E6A', paddingBottom: 22, alignItems: 'center' },
  pageTitle: { color: '#DDE2E8', fontSize: 27, lineHeight: 38 },
  closePage: { position: 'absolute', right: 16, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  closePageText: { color: '#DDE2E8', fontSize: 44, lineHeight: 46 },
  list: { paddingTop: 44, paddingHorizontal: 28, alignItems: 'center', gap: 20 },
  detailCard: { maxWidth: 520 },
});
