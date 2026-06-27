import React, { useMemo } from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  BottomTabBar,
  BottomTabBarButtonProps,
  BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import { Tabs } from 'expo-router';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { AdBanner } from '@/components/AdBanner';
import { useThemeColor } from '@/components/ThemeContext';
import { isAdsRuntimeSupported } from '@/constants/adsRuntime';
import {
  THEME_COLOR_BLUE,
  THEME_COLOR_GREEN,
  THEME_COLOR_RED,
  THEME_COLOR_SKY,
} from '@/constants/ThemePresets';

const CHROME_BG = '#BAE1FF';
const CHROME_BORDER = '#7EB8E8';
const TAB_INACTIVE_COLOR = '#475569';

const adsEnabled = isAdsRuntimeSupported();

/** テーマカラーに合わせた、選択中タブ用の鮮やかな色 */
function getTabActiveColor(themeColor: string): string {
  switch (themeColor.toUpperCase()) {
    case THEME_COLOR_SKY:
      return '#2563EB';
    case THEME_COLOR_BLUE:
      return '#1D4ED8';
    case THEME_COLOR_RED:
      return '#DC2626';
    case THEME_COLOR_GREEN:
      return '#16A34A';
    default:
      return '#2563EB';
  }
}

function TabBarButton({ style, ...rest }: BottomTabBarButtonProps) {
  return (
    <View style={styles.tabItemWrap}>
      <PlatformPressable {...rest} style={[styles.tabItemPressable, style]} />
    </View>
  );
}

const tabBarButton = (props: BottomTabBarButtonProps) => <TabBarButton {...props} />;

function TabBarWithAd(props: BottomTabBarProps) {
  return (
    <View>
      <AdBanner />
      <BottomTabBar {...props} />
    </View>
  );
}

type IonTabBarIconProps = {
  focused: boolean;
  activeColor: string;
  activeName: React.ComponentProps<typeof Ionicons>['name'];
  inactiveName: React.ComponentProps<typeof Ionicons>['name'];
};

function IonTabBarIcon({ focused, activeColor, activeName, inactiveName }: IonTabBarIconProps) {
  return (
    <Ionicons
      name={focused ? activeName : inactiveName}
      size={24}
      color={focused ? activeColor : TAB_INACTIVE_COLOR}
      style={styles.tabIcon}
    />
  );
}

type SettingsTabBarIconProps = {
  focused: boolean;
  activeColor: string;
};

function SettingsTabBarIcon({ focused, activeColor }: SettingsTabBarIconProps) {
  return (
    <FontAwesome
      name="cog"
      size={24}
      color={focused ? activeColor : TAB_INACTIVE_COLOR}
      style={styles.tabIcon}
    />
  );
}

export default function TabLayout() {
  const { color: themeColor } = useThemeColor();
  const tabActiveColor = useMemo(() => getTabActiveColor(themeColor), [themeColor]);

  const screenOptions = useMemo(
    () => ({
      headerStyle: {
        backgroundColor: CHROME_BG,
        borderBottomWidth: 1,
        borderBottomColor: CHROME_BORDER,
      },
      headerTintColor: tabActiveColor,
      headerTitleStyle: { color: tabActiveColor, fontWeight: '700' as const },
      tabBarStyle: {
        backgroundColor: CHROME_BG,
        borderTopWidth: 1,
        borderTopColor: CHROME_BORDER,
        elevation: 0,
        shadowOpacity: 0,
        height: Platform.OS === 'ios' ? 84 : 68,
        paddingTop: 8,
        paddingBottom: Platform.OS === 'ios' ? 26 : 10,
      },
      tabBarItemStyle: {
        justifyContent: 'center' as const,
        paddingVertical: 2,
      },
      tabBarActiveTintColor: tabActiveColor,
      tabBarInactiveTintColor: TAB_INACTIVE_COLOR,
      tabBarLabel: ({
        focused,
        children,
      }: {
        color: string;
        focused: boolean;
        children: string;
      }) => (
        <Text
          style={[
            styles.tabLabel,
            { color: focused ? tabActiveColor : TAB_INACTIVE_COLOR },
            focused ? styles.tabLabelActive : styles.tabLabelInactive,
          ]}
          numberOfLines={1}
        >
          {children}
        </Text>
      ),
      headerShown: false,
    }),
    [tabActiveColor],
  );

  return (
    <Tabs
      tabBar={adsEnabled ? (props) => <TabBarWithAd {...props} /> : undefined}
      screenOptions={screenOptions}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '記録',
          tabBarIcon: ({ focused }) => (
            <IonTabBarIcon
              focused={focused}
              activeColor={tabActiveColor}
              activeName="document-text"
              inactiveName="document-text-outline"
            />
          ),
          tabBarButton,
        }}
      />
      <Tabs.Screen
        name="two"
        options={{
          title: '分析',
          tabBarIcon: ({ focused }) => (
            <IonTabBarIcon
              focused={focused}
              activeColor={tabActiveColor}
              activeName="bar-chart"
              inactiveName="bar-chart-outline"
            />
          ),
          tabBarButton,
        }}
      />
      <Tabs.Screen
        name="three"
        options={{
          title: '設定',
          tabBarIcon: ({ focused }) => (
            <SettingsTabBarIcon focused={focused} activeColor={tabActiveColor} />
          ),
          tabBarButton,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabItemWrap: {
    flex: 1,
  },
  tabItemPressable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIcon: {
    marginBottom: 2,
  },
  tabLabel: {
    fontSize: 11,
    marginTop: 4,
    letterSpacing: 0.15,
  },
  tabLabelActive: {
    fontWeight: '700',
  },
  tabLabelInactive: {
    fontWeight: '600',
  },
});
