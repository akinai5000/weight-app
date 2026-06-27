import { Platform } from 'react-native';

/** Google 公式テスト用バナー広告ユニット ID */
export const TEST_BANNER_AD_UNIT_ID =
  Platform.OS === 'android'
    ? 'ca-app-pub-3940256099942544/6300978111'
    : 'ca-app-pub-3940256099942544/2934735716';
