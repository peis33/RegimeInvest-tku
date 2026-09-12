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
import Setting from './src/app/Setting';
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

const PROFILE_IDENTITY_VALUES = {
  small: 'small',
  normal: 'normal',
  large: 'large',
  小股民: 'small',
  中間戶: 'normal',
  大戶: 'large',
};

const PROFILE_ALLOCATION_VALUES = {
  balanced: 'balanced',
  moderate: 'moderate',
  concentrated: 'concentrated',
  平均分散: 'balanced',
  略為集中: 'moderate',
  高度集中: 'concentrated',
};

const PROFILE_RISK_VALUES = {
  conservative: 'conservative',
  neutral: 'neutral',
  aggressive: 'aggressive',
  保守派: 'conservative',
  中立派: 'neutral',
  積極派: 'aggressive',
};

function normalizeInvestmentProfile(profile = {}) {
  const source = profile || {};
  const budgetValue = Number(
    String(source.budget ?? source.investment_budget ?? '50000').replace(/,/g, ''),
  );
  const topNValue = Number(source.top_n ?? source.topN ?? 5);
  const zipfValue = Number(source.zipf_s ?? source.zipfS ?? 1.2);
  const allowValue = source.allow_fractional ?? source.allowFractional ?? source.fractionalShare;
  const allowFractional = typeof allowValue === 'boolean'
    ? allowValue
    : allowValue === undefined
      ? true
      : String(allowValue).trim().toLowerCase() !== 'false';
  const investorType = PROFILE_IDENTITY_VALUES[
    source.investor_type ?? source.investorType ?? source.identity ?? 'normal'
  ] || 'normal';
  const allocationPreference = PROFILE_ALLOCATION_VALUES[
    source.allocation_preference ?? source.allocationPreference ?? 'moderate'
  ] || 'moderate';
  const riskPreference = PROFILE_RISK_VALUES[
    source.risk_preference ?? source.riskPreference ?? 'neutral'
  ] || 'neutral';
  const budget = Number.isFinite(budgetValue) && budgetValue > 0 ? budgetValue : 50000;
  const topN = Number.isFinite(topNValue) ? Math.min(20, Math.max(1, Math.round(topNValue))) : 5;
  const zipfS = Number.isFinite(zipfValue) && zipfValue > 0 ? zipfValue : 1.2;

  return {
    budget,
    investor_type: investorType,
    risk_preference: riskPreference,
    allocation_preference: allocationPreference,
    allow_fractional: allowFractional,
    preferred_stock_class: source.preferred_stock_class || 'auto',
    top_n: topN,
    zipf_s: zipfS,
    // 保留前端既有欄位名稱，讓登入頁與 Analyze 舊有讀取邏輯也能同步。
    investorType,
    riskPreference,
    allocationPreference,
    allowFractional,
    fractionalShare: allowFractional,
    topN,
  };
}

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
          initialAllowFractional={loginPreferences?.allowFractional ?? true}
          investmentResult={investmentResult}
          investmentProfile={investmentResult?.profile || loginPreferences}
          investmentRunPending={investmentRunPending}
          investmentRunError={investmentRunError}
          rerunInvestment={async (profilePatchOrAllowFractional) => {
            if (investmentRunPending) {
              throw new Error('投資配置正在重新計算，請稍候再試。');
            }

            const currentProfile = investmentResult?.profile || loginPreferences;
            if (!currentProfile) {
              throw new Error('找不到目前的投資設定，請重新登入。');
            }

            const previousResult = investmentResult;
            const profilePatch = profilePatchOrAllowFractional !== null
              && typeof profilePatchOrAllowFractional === 'object'
              ? profilePatchOrAllowFractional
              : { allow_fractional: Boolean(profilePatchOrAllowFractional) };
            const nextProfile = normalizeInvestmentProfile({
              ...currentProfile,
              ...profilePatch,
            });

            setInvestmentRunPending(true);
            setInvestmentRunError(null);
            setDiscussionRunPending(false);
            setDiscussionRunError(null);
            setInvestmentResult(null);
            setLoginPreferences(nextProfile);

            try {
              const result = await runInvestment(nextProfile);
              setInvestmentResult(result);
              setLoginPreferences(normalizeInvestmentProfile(result?.profile || nextProfile));
              return result;
            } catch (error) {
              setLoginPreferences(currentProfile);
              setInvestmentResult(previousResult);
              setInvestmentRunError(
                error?.message || '無法依新的投資設定重新產生資金配置',
              );
              throw error;
            } finally {
              setInvestmentRunPending(false);
            }
          }}
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
                  const normalizedPreferences = normalizeInvestmentProfile(preferences);
                  setLoginPreferences(normalizedPreferences);
                  setInvestmentResult(null);
                  setInvestmentRunError(null);
                  setInvestmentRunPending(true);
                  setDiscussionRunPending(false);
                  setDiscussionRunError(null);
                  setIsLoggedIn(true);

                  // Navigate immediately while the backend regenerates the
                  // portfolio from the submitted profile, including budget.
                  runInvestment(normalizedPreferences)
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
                  component={Setting}
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
