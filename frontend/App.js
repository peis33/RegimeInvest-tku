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
import Setting from './src/app/Setting';
import Login from './src/app/Login';
import TabBar, { TAB_BAR_STYLE } from './src/components/TabBar';
import { AppSettingsProvider } from './src/context/AppSettingsContext';

const SETTING_ICON = require('./src/assets/image/setting.svg');
const ANALYZE_ICON = require('./src/assets/image/analyze.svg');
const HOME_ICON = require('./src/assets/image/home.svg');
const PROFILE_ICON = require('./src/assets/image/profile.svg');

const Tab = createBottomTabNavigator();

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginPreferences, setLoginPreferences] = useState(null);
  const [fontsLoaded] = useFonts({
    Goldman: Goldman_400Regular,
  });

  if (!fontsLoaded) {
    return <View style={styles.loadingContainer} />;
  }

  return (
    <SafeAreaProvider style={{ backgroundColor: '#2E2F2E' }}>
      <AppSettingsProvider>
        {!isLoggedIn ? (
          <>
            <StatusBar style="light" backgroundColor="#596674" />
            <Login
              onEnter={(preferences) => {
                setLoginPreferences(preferences);
                setIsLoggedIn(true);
              }}
            />
          </>
        ) : (
          <NavigationContainer style={{ backgroundColor: '#2E2F2E' }}>
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
                name="Setting"
                component={Setting}
                options={{
                  tabBarIconAsset: SETTING_ICON,
                }}
              />
              <Tab.Screen
                name="Analyze"
                component={Analyze}
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
                name="Profile"
                component={Profile}
                initialParams={{
                  initialUserIdentity: loginPreferences?.investorType || '',
                }}
                options={{
                  tabBarIconAsset: PROFILE_ICON,
                }}
              />
            </Tab.Navigator>
          </NavigationContainer>
        )}
      </AppSettingsProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#2E2F2E',
  },
});
