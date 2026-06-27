import { getLocales } from 'expo-localization';

/** 端末の言語が日本語かどうか */
export function isDeviceJapanese(): boolean {
  const languageCode = getLocales()[0]?.languageCode ?? 'en';
  return languageCode === 'ja';
}

/** DateTimePicker 用ロケール（日本語: ja-JP / それ以外: en-US） */
export function getCalendarPickerLocale(): string {
  return isDeviceJapanese() ? 'ja-JP' : 'en-US';
}
