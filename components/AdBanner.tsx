import React from 'react';
import { StyleSheet, View } from 'react-native';

import { isAdsRuntimeSupported } from '@/constants/adsRuntime';

/** Expo Go / Web では null。開発ビルドでのみ BannerAd を lazy-load する。 */
export function AdBanner() {
  if (!isAdsRuntimeSupported()) {
    return null;
  }

  return <AdBannerImpl />;
}

function AdBannerImpl() {
  const { BannerAd, BannerAdSize } = require('react-native-google-mobile-ads') as typeof import('react-native-google-mobile-ads');
  const { TEST_BANNER_AD_UNIT_ID } = require('@/constants/Ads') as typeof import('@/constants/Ads');

  return (
    <View style={styles.container}>
      <BannerAd
        unitId={TEST_BANNER_AD_UNIT_ID}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#C7C7CC',
  },
});
