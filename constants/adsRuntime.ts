import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Expo Go / Web では react-native-google-mobile-ads のネイティブモジュールが存在しない。
 * 開発ビルド（expo run:ios 等）でのみ true。
 */
export function isAdsRuntimeSupported(): boolean {
  if (Platform.OS === 'web') return false;
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return false;
  if (Constants.appOwnership === 'expo') return false;
  return true;
}
