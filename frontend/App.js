import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Goldman_400Regular } from '@expo-google-fonts/goldman';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, StyleSheet } from 'react-native';

import Home from './src/app/Home';
import Analyze from './src/app/Analyze';
import Profile from './src/app/Profile';
import Compare from './src/app/Compare';
import Login from './src/app/Login';
import TabBar, { TAB_BAR_STYLE } from './src/components/TabBar';
import { AppSettingsProvider } from './src/context/AppSettingsContext';
import { runDiscussion, runInvestment } from './src/services/investmentApi';
import { ViewportProvider } from './src/hooks/useViewportDimensions';

const SETTING_ICON = require('./src/assets/image/setting.svg');
const ANALYZE_ICON = require('./src/assets/image/analyze.svg');
const HOME_ICON = require('./src/assets/image/home.svg');
const COMPARE_ICON = require('./src/assets/image/compare.svg');

const Tab = createBottomTabNavigator();

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginPreferences, setLoginPreferences] = useState(null);
  const [investmentResult, setInvestmentResult] = useState(null);
  const [investmentRunPending, setInvestmentRunPending] = useState(false);
  const [investmentRunError, setInvestmentRunError] = useState(null);
  const [discussionRunPending, setDiscussionRunPending] = useState(false);
  const [discussionRunError, setDiscussionRunError] = useState(null);
  const [fontsLoaded] = useFonts({
    Goldman: Goldman_400Regular,
  });

  if (!fontsLoaded) {
    return <View style={styles.loadingContainer} />;
  }

  return (
    <SafeAreaProvider style={styles.appRoot}>
      <ViewportProvider style={styles.appRoot}>
        <AppSettingsProvider
          investmentResult={investmentResult}
          investmentRunPending={investmentRunPending}
          investmentRunError={investmentRunError}
          discussionRunPending={discussionRunPending}
          discussionRunError={discussionRunError}
          startDiscussion={() => {
            if (discussionRunPending) return;

            setDiscussionRunPending(true);
            setDiscussionRunError(null);
            runDiscussion()
              .then((result) => {
                setInvestmentResult(result);
              })
              .catch((error) => {
                setDiscussionRunError(
                  error?.message || '無法取得 Model 3 AI 討論結果',
                );
              })
              .finally(() => {
                setDiscussionRunPending(false);
              });
          }}
        >
          {!isLoggedIn ? (
            <>
              <StatusBar style="light" backgroundColor="#596674" />
              <Login
                onEnter={(preferences) => {
                  setLoginPreferences(preferences);
                  setInvestmentResult(null);
                  setInvestmentRunError(null);
                  setInvestmentRunPending(true);
                  setDiscussionRunPending(false);
                  setDiscussionRunError(null);
                  setIsLoggedIn(true);

                  // Navigate immediately while the backend regenerates the
                  // portfolio from the submitted profile, including budget.
                  runInvestment(preferences)
                    .then((result) => setInvestmentResult(result))
                    .catch((error) => {
                      setInvestmentRunError(
                        error?.message || '無法依登入頁預算產生資金配置',
                      );
                    })
                    .finally(() => {
                      setInvestmentRunPending(false);
                    });
                }}
              />
            </>
          ) : (
            <NavigationContainer style={styles.appRoot}>
              <StatusBar style="light" backgroundColor="#2E2F2E" />
              <Tab.Navigator
                initialRouteName="Home"
                tabBar={(props) => <TabBar {...props} />}
                screenOptions={{
                  headerShown: false,
                  tabBarShowLabel: false,
                  tabBarStyle: TAB_BAR_STYLE,
                  contentStyle: { backgroundColor: '#2E2F2E' },
                }}
              >
                <Tab.Screen
                  name="Compare"
                  component={Compare}
                  options={{
                    tabBarIconAsset: COMPARE_ICON,
                  }}
                />
                <Tab.Screen
                  name="Analyze"
                  component={Analyze}
                  initialParams={{
                    investorType: loginPreferences?.investorType || null,
                    profile: investmentResult?.profile || loginPreferences,
                    portfolio: investmentResult?.portfolio || null,
                  }}
                  options={{
                    tabBarIconAsset: ANALYZE_ICON,
                  }}
                />
                <Tab.Screen
                  name="Home"
                  component={Home}
                  options={{
                    tabBarIconAsset: HOME_ICON,
                  }}
                />
                <Tab.Screen
                  name="Setting"
                  component={Profile}
                  initialParams={{
                    initialUserIdentity: loginPreferences?.investorType || '',
                  }}
                  options={{
                    tabBarIconAsset: SETTING_ICON,
                  }}
                />
              </Tab.Navigator>
            </NavigationContainer>
          )}
        </AppSettingsProvider>
      </ViewportProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  appRoot: {
    flex: 1,
    width: '100%',
    minWidth: 0,
    minHeight: 0,
    alignSelf: 'stretch',
    backgroundColor: '#2E2F2E',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#2E2F2E',
  },
});
