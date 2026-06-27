import 'react-native-gesture-handler';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { HowToUseProvider } from '@/components/HowToUseContext';
import { useColorScheme } from '@/components/useColorScheme';
import { ThemeProvider as AppThemeProvider } from '@/components/ThemeContext';
import { isAdsRuntimeSupported } from '@/constants/adsRuntime';
import { maybeInjectDevDummyOnFirstLaunch } from '@/constants/devChartDummy';
import {
  ensureNotificationChannel,
  migrateLegacyNotificationTimesIfNeeded,
  requestNotificationPermission,
  rescheduleIntelligentWeightReminders,
  setupNotificationHandler,
} from '@/constants/Notifications';

setupNotificationHandler();

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  useEffect(() => {
    ensureNotificationChannel();
  }, []);

  useEffect(() => {
    if (!isAdsRuntimeSupported()) return;
    void import('react-native-google-mobile-ads').then(({ default: mobileAds }) =>
      mobileAds().initialize(),
    );
  }, []);

  useEffect(() => {
    if (!loaded) return;
    void maybeInjectDevDummyOnFirstLaunch();
  }, [loaded]);

  useEffect(() => {
    if (!loaded) return;
    void (async () => {
      await requestNotificationPermission();
      await migrateLegacyNotificationTimesIfNeeded();
      await rescheduleIntelligentWeightReminders();
    })();
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <AppThemeProvider>
            <HowToUseProvider>
              <Stack>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              </Stack>
            </HowToUseProvider>
          </AppThemeProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
