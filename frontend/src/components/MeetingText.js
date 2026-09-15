import React from 'react';
import { Text, StyleSheet } from 'react-native';

// Shared typography for meeting messages, tabs and allocation figures.
export default function MeetingText({ style, ...props }) {
  return <Text {...props} style={[style, styles.text]} />;
}

const styles = StyleSheet.create({
  text: { fontFamily: 'Goldman' },
});
