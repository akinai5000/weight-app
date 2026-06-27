import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export const NOTIFICATION_TIMES_STORAGE_KEY = '@notification_times';
export const ANDROID_CHANNEL_ID = 'weight-reminders';

/** 旧バージョンの複数時刻（マイグレーション用のみ） */
export type NotificationTime = { id: string; hour: number; minute: number };

export const INTELLIGENT_REMINDER_CONFIG_KEY = '@intelligent_notification_v1';

export const INTELLIGENT_NOTIF_ID_PREFIX = 'wexp_';

export const WEIGHT_REMINDER_DAILY_ID_PREFIX = 'weight_reminder_daily_';
export const WEIGHT_REMINDER_TEST_NOTIF_ID = 'weight_reminder_test';

export const WEIGHT_REMINDER_NOTIF_TITLE = '体重記録のリマインド 🔔';
export const WEIGHT_REMINDER_NOTIF_BODY =
  '毎日の健康管理のために、今の体重を記録しましょう！';
export const WEIGHT_REMINDER_TEST_NOTIF_BODY =
  '【テスト】通知の設定が完了しました。毎日のリマインドが届きます。';

const WEIGHT_HISTORY_KEY = '@weight_history';
import { DAY_MS, parseWeightRecordDate } from '@/constants/WeightRecordDate';

export const INTELLIGENT_REMINDER_TITLE = '体重の記録はお済みですか？';
export const INTELLIGENT_REMINDER_BODY =
  '今日の目標時刻を過ぎています。今のうちに記録して、生活改善タグで振り返りをしましょう！';

export type IntelligentReminderConfigV1 = {
  v: 1;
  enabled: boolean;
  expectedHour: number;
  expectedMinute: number;
  notifyHour: number;
  notifyMinute: number;
};

export type IntelligentReminderConfigV2 = {
  v: 2;
  enabled: boolean;
  notifyTimes: string[];
};

export type WeightReminderSettings = {
  enabled: boolean;
  notifyTimes: string[];
};

const TIME_STRING_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidNotifyTimeString(value: string): boolean {
  return TIME_STRING_PATTERN.test(value);
}

export function normalizeNotifyTimes(times: string[]): string[] {
  const unique = [...new Set(times.filter(isValidNotifyTimeString))];
  unique.sort((a, b) => {
    const [ah, am] = a.split(':').map((v) => Number.parseInt(v, 10));
    const [bh, bm] = b.split(':').map((v) => Number.parseInt(v, 10));
    return ah * 60 + am - (bh * 60 + bm);
  });
  return unique;
}

export const DEFAULT_WEIGHT_REMINDER_TIMES = ['07:00'];

export function parseTimeToDate(time: string): Date {
  const [h, m] = time.split(':').map((v) => Number.parseInt(v, 10));
  const d = new Date();
  d.setHours(Number.isFinite(h) ? h : 7, Number.isFinite(m) ? m : 0, 0, 0);
  return d;
}

export function formatTimeHHMM(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function isIntelligentReminderConfigV2(value: unknown): value is IntelligentReminderConfigV2 {
  if (!value || typeof value !== 'object') return false;
  const o = value as Partial<IntelligentReminderConfigV2>;
  return (
    o.v === 2 &&
    typeof o.enabled === 'boolean' &&
    Array.isArray(o.notifyTimes) &&
    o.notifyTimes.every((t) => typeof t === 'string' && isValidNotifyTimeString(t))
  );
}

function migrateV1ToV2(v1: IntelligentReminderConfigV1): IntelligentReminderConfigV2 {
  return {
    v: 2,
    enabled: v1.enabled,
    notifyTimes: [formatTimeLabel(v1.notifyHour, v1.notifyMinute)],
  };
}

export function defaultWeightReminderSettings(): WeightReminderSettings {
  return {
    enabled: true,
    notifyTimes: [...DEFAULT_WEIGHT_REMINDER_TIMES],
  };
}

export async function loadWeightReminderSettings(): Promise<WeightReminderSettings> {
  try {
    const raw = await AsyncStorage.getItem(INTELLIGENT_REMINDER_CONFIG_KEY);
    if (!raw) return defaultWeightReminderSettings();
    const parsed = JSON.parse(raw);
    if (isIntelligentReminderConfigV2(parsed)) {
      return {
        enabled: parsed.enabled,
        notifyTimes: normalizeNotifyTimes(parsed.notifyTimes),
      };
    }
    if (isIntelligentReminderConfig(parsed)) {
      const migrated = migrateV1ToV2(parsed);
      await saveWeightReminderSettings(migrated.enabled, migrated.notifyTimes);
      return {
        enabled: migrated.enabled,
        notifyTimes: migrated.notifyTimes,
      };
    }
  } catch (e) {
    console.log('weight reminder settings load failed', e);
  }
  return defaultWeightReminderSettings();
}

export async function saveWeightReminderSettings(
  enabled: boolean,
  notifyTimes: string[],
): Promise<void> {
  const config: IntelligentReminderConfigV2 = {
    v: 2,
    enabled,
    notifyTimes: normalizeNotifyTimes(notifyTimes),
  };
  try {
    await AsyncStorage.setItem(INTELLIGENT_REMINDER_CONFIG_KEY, JSON.stringify(config));
  } catch (e) {
    console.log('weight reminder settings save failed', e);
  }
}

/** @deprecated v1 互換。loadWeightReminderSettings を使用してください。 */
export async function loadIntelligentReminderConfig(): Promise<IntelligentReminderConfigV1 | null> {
  const settings = await loadWeightReminderSettings();
  if (settings.notifyTimes.length === 0) return null;
  const first = settings.notifyTimes[0];
  const [hour, minute] = first.split(':').map((v) => Number.parseInt(v, 10));
  let expectedM = hour * 60 + minute - 30;
  if (expectedM < 0) expectedM += 24 * 60;
  return {
    v: 1,
    enabled: settings.enabled,
    notifyHour: hour,
    notifyMinute: minute,
    expectedHour: Math.floor(expectedM / 60) % 24,
    expectedMinute: expectedM % 60,
  };
}

/** @deprecated v2 保存は saveWeightReminderSettings を使用してください。 */
export async function saveIntelligentReminderConfig(
  config: IntelligentReminderConfigV1,
): Promise<void> {
  await saveWeightReminderSettings(config.enabled, [
    formatTimeLabel(config.notifyHour, config.notifyMinute),
  ]);
}

function isIntelligentReminderConfig(value: unknown): value is IntelligentReminderConfigV1 {
  if (!value || typeof value !== 'object') return false;
  const o = value as Partial<IntelligentReminderConfigV1>;
  return (
    o.v === 1 &&
    typeof o.enabled === 'boolean' &&
    typeof o.expectedHour === 'number' &&
    typeof o.expectedMinute === 'number' &&
    typeof o.notifyHour === 'number' &&
    typeof o.notifyMinute === 'number' &&
    o.expectedHour >= 0 &&
    o.expectedHour < 24 &&
    o.notifyHour >= 0 &&
    o.notifyHour < 24 &&
    o.expectedMinute >= 0 &&
    o.expectedMinute < 60 &&
    o.notifyMinute >= 0 &&
    o.notifyMinute < 60
  );
}

export function defaultIntelligentReminderConfig(): IntelligentReminderConfigV1 {
  return {
    v: 1,
    enabled: false,
    expectedHour: 22,
    expectedMinute: 0,
    notifyHour: 22,
    notifyMinute: 30,
  };
}

/** 旧「複数定時」から一度だけ移行し、旧キーを削除 */
export async function migrateLegacyNotificationTimesIfNeeded(): Promise<void> {
  try {
    const rawV2 = await AsyncStorage.getItem(INTELLIGENT_REMINDER_CONFIG_KEY);
    if (rawV2) {
      const parsed = JSON.parse(rawV2);
      if (isIntelligentReminderConfigV2(parsed) || isIntelligentReminderConfig(parsed)) {
        return;
      }
    }

    const raw = await AsyncStorage.getItem(NOTIFICATION_TIMES_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return;

    const legacyTimes = parsed
      .filter(isNotificationTime)
      .map((entry) => formatTimeLabel(entry.hour, entry.minute));
    if (legacyTimes.length === 0) return;

    await Notifications.cancelAllScheduledNotificationsAsync();

    await saveWeightReminderSettings(true, legacyTimes);
    await AsyncStorage.removeItem(NOTIFICATION_TIMES_STORAGE_KEY);
  } catch (e) {
    console.log('migrate legacy notifications failed', e);
  }
}

export function generateNotificationTimeId(): string {
  return `nt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function formatTimeLabel(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function isNotificationTime(value: unknown): value is NotificationTime {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<NotificationTime>;
  return (
    typeof v.id === 'string' &&
    typeof v.hour === 'number' &&
    typeof v.minute === 'number' &&
    v.hour >= 0 &&
    v.hour < 24 &&
    v.minute >= 0 &&
    v.minute < 60
  );
}

export async function loadNotificationTimes(): Promise<NotificationTime[]> {
  try {
    const raw = await AsyncStorage.getItem(NOTIFICATION_TIMES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isNotificationTime);
  } catch (e) {
    console.log('notification times load failed', e);
    return [];
  }
}

export async function ensureNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: '体重記録リマインダー',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
    });
  } catch (e) {
    console.log('android channel setup failed', e);
  }
}

export async function getNotificationPermissionStatus(): Promise<Notifications.PermissionStatus> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status;
  } catch (e) {
    console.log('permission check failed', e);
    return 'undetermined' as Notifications.PermissionStatus;
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: false,
          allowSound: true,
        },
      });
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.error('通知予約エラー: 通知の許可が得られていません。status =', finalStatus);
    }
    return finalStatus === 'granted';
  } catch (error) {
    console.error('通知予約エラー: 許可リクエストに失敗しました', error);
    return false;
  }
}

function createDailyReminderTrigger(hour: number, minute: number): Notifications.DailyTriggerInput {
  const trigger: Notifications.DailyTriggerInput = {
    type: Notifications.SchedulableTriggerInputTypes.DAILY,
    hour,
    minute,
  };
  if (Platform.OS === 'android') {
    trigger.channelId = ANDROID_CHANNEL_ID;
  }
  return trigger;
}

function createTestNotificationTrigger(): Notifications.TimeIntervalTriggerInput {
  const trigger: Notifications.TimeIntervalTriggerInput = {
    type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
    seconds: 10,
    repeats: false,
  };
  if (Platform.OS === 'android') {
    trigger.channelId = ANDROID_CHANNEL_ID;
  }
  return trigger;
}

/** two.tsx / index と同じ日付形式を解釈 */
function parseWeightRecordDateToTimestamp(dateStr: string, now: Date): number {
  return parseWeightRecordDate(dateStr, now);
}

function localYmdFromTimestamp(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

function localYmdFromCalendarDate(day: Date): string {
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  return localYmdFromTimestamp(d.getTime());
}

async function loadWeightHistoryDates(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(WEIGHT_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r): r is { date?: unknown } => r && typeof r === 'object' && typeof r.date === 'string')
      .map((r) => r.date as string);
  } catch (e) {
    console.log('weight history read for notifications failed', e);
    return [];
  }
}

/** ローカル暦のその日に 1 件でも体重記録があれば true */
export async function hasWeightRecordOnLocalYmd(ymd: string): Promise<boolean> {
  const now = new Date();
  const dates = await loadWeightHistoryDates();
  for (const dateStr of dates) {
    const ts = parseWeightRecordDateToTimestamp(dateStr, now);
    if (localYmdFromTimestamp(ts) === ymd) return true;
  }
  return false;
}

async function cancelOurIntelligentScheduledNotifications(): Promise<void> {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    for (const entry of all) {
      const id = entry.identifier;
      if (typeof id === 'string' && id.startsWith(INTELLIGENT_NOTIF_ID_PREFIX)) {
        await Notifications.cancelScheduledNotificationAsync(id);
      }
    }
  } catch (e) {
    console.log('cancel intelligent scheduled failed', e);
  }
}

export type UpdateNotificationScheduleOptions = {
  /** 新規時刻追加時の動作確認用（10秒後に1回だけ通知） */
  scheduleTestNotification?: boolean;
};

/**
 * 体重リマインダー時刻配列に合わせてローカル通知を再予約する。
 * 1. 既存の予約をすべてキャンセル
 * 2. 各時刻に毎日リピートの通知を登録
 */
export async function updateNotificationSchedule(
  notifyTimes: string[],
  options?: UpdateNotificationScheduleOptions,
): Promise<void> {
  try {
    const normalized = normalizeNotifyTimes(notifyTimes);

    await Notifications.cancelAllScheduledNotificationsAsync();
    await cancelOurIntelligentScheduledNotifications();

    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      console.error('通知予約エラー: 通知の許可が未設定のためスケジュールをスキップしました。status =', status);
      return;
    }

    await ensureNotificationChannel();

    for (const time of normalized) {
      const [hour, minute] = time.split(':').map((v) => Number.parseInt(v, 10));
      if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
        console.error('通知予約エラー: 不正な時刻形式です', time);
        continue;
      }

      const identifier = `${WEIGHT_REMINDER_DAILY_ID_PREFIX}${time.replace(':', '')}`;
      const trigger = createDailyReminderTrigger(hour, minute);

      try {
        const scheduledId = await Notifications.scheduleNotificationAsync({
          identifier,
          content: {
            title: WEIGHT_REMINDER_NOTIF_TITLE,
            body: WEIGHT_REMINDER_NOTIF_BODY,
            sound: 'default',
            data: { kind: 'weight_reminder_daily', notifyTime: time },
          },
          trigger,
        });
        console.log(`[通知予約成功] 毎日 ${time} → id: ${scheduledId}`);
      } catch (error) {
        console.error('通知予約エラー: 毎日リマインドの予約に失敗しました', {
          time,
          hour,
          minute,
          trigger,
          error,
        });
      }
    }

    if (options?.scheduleTestNotification && normalized.length > 0) {
      const testTrigger = createTestNotificationTrigger();
      try {
        const scheduledId = await Notifications.scheduleNotificationAsync({
          identifier: WEIGHT_REMINDER_TEST_NOTIF_ID,
          content: {
            title: WEIGHT_REMINDER_NOTIF_TITLE,
            body: WEIGHT_REMINDER_TEST_NOTIF_BODY,
            sound: 'default',
            data: { kind: 'weight_reminder_test' },
          },
          trigger: testTrigger,
        });
        console.log(`[通知予約成功] テスト通知（10秒後）→ id: ${scheduledId}`);
      } catch (error) {
        console.error('通知予約エラー: テスト通知の予約に失敗しました', {
          trigger: testTrigger,
          error,
        });
      }
    }
  } catch (error) {
    console.error('通知予約エラー: updateNotificationSchedule 全体が失敗しました', error);
  }
}

/**
 * 保存済み設定を読み込み、通知スケジュールを更新する。
 * 体重記録保存時などからも呼び出し可能。
 */
export async function rescheduleIntelligentWeightReminders(): Promise<void> {
  try {
    const settings = await loadWeightReminderSettings();
    if (!settings.enabled || settings.notifyTimes.length === 0) {
      await Notifications.cancelAllScheduledNotificationsAsync();
      return;
    }
    await updateNotificationSchedule(settings.notifyTimes);
  } catch (e) {
    console.log('rescheduleIntelligentWeightReminders failed', e);
  }
}

export function setupNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}
