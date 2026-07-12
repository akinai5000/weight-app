import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { HABITS_STORAGE_KEY, type Habit, type HabitFrequency } from '@/constants/Habits';
import {
  INTELLIGENT_REMINDER_CONFIG_KEY,
  isValidNotifyTimeString,
  normalizeNotifyTimes,
  updateNotificationSchedule,
  type IntelligentReminderConfigV2,
} from '@/constants/Notifications';
import {
  DEFAULT_THEME_COLOR,
  isPresetThemeColor,
  normalizeThemeHex,
} from '@/constants/ThemePresets';

export const BACKUP_FORMAT = 'weight-app-backup';
export const BACKUP_VERSION = 1;

export const WEIGHT_HISTORY_KEY = '@weight_history';
export const PROFILE_SETTINGS_KEY = '@profile_settings';
export const APP_LANGUAGE_KEY = '@app_language';
export const THEME_COLOR_KEY = '@theme_color';

export type BackupLanguage = 'ja' | 'en';

export type BackupProfileSettings = {
  initialWeight: string;
  targetWeight: string;
};

export type BackupPayloadV1 = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  appVersion: string;
  data: {
    weightHistory: unknown[];
    habits: Habit[];
    profileSettings: BackupProfileSettings;
    language: BackupLanguage;
    themeColor: string;
    notificationConfig: IntelligentReminderConfigV2;
  };
};

export type BackupValidationErrorCode =
  | 'invalid_json'
  | 'invalid_format'
  | 'unsupported_version'
  | 'invalid_data';

export class BackupValidationError extends Error {
  code: BackupValidationErrorCode;

  constructor(code: BackupValidationErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'BackupValidationError';
  }
}

const HABIT_FREQUENCIES: HabitFrequency[] = ['daily', 'weekly', 'monthly'];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isWeightRecord(value: unknown): boolean {
  if (!isPlainObject(value)) return false;
  if (typeof value.id !== 'string' || typeof value.value !== 'string' || typeof value.date !== 'string') {
    return false;
  }
  if (value.tags !== undefined) {
    if (!Array.isArray(value.tags) || !value.tags.every((tag) => typeof tag === 'string')) {
      return false;
    }
  }
  return true;
}

function isHabit(value: unknown): value is Habit {
  if (!isPlainObject(value)) return false;
  if (typeof value.id !== 'string' || typeof value.name !== 'string') return false;
  if (!HABIT_FREQUENCIES.includes(value.frequency as HabitFrequency)) return false;
  if (value.frequencyCount !== undefined) {
    if (typeof value.frequencyCount !== 'number' || !Number.isFinite(value.frequencyCount)) {
      return false;
    }
  }
  return true;
}

function isProfileSettings(value: unknown): value is BackupProfileSettings {
  if (!isPlainObject(value)) return false;
  return typeof value.initialWeight === 'string' && typeof value.targetWeight === 'string';
}

function isNotificationConfig(value: unknown): value is IntelligentReminderConfigV2 {
  if (!isPlainObject(value)) return false;
  if (value.v !== 2 || typeof value.enabled !== 'boolean' || !Array.isArray(value.notifyTimes)) {
    return false;
  }
  return value.notifyTimes.every((t) => typeof t === 'string' && isValidNotifyTimeString(t));
}

function parseBackupJson(raw: string): BackupPayloadV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BackupValidationError('invalid_json', 'Backup file is not valid JSON.');
  }

  if (!isPlainObject(parsed)) {
    throw new BackupValidationError('invalid_format', 'Backup root must be an object.');
  }
  if (parsed.format !== BACKUP_FORMAT) {
    throw new BackupValidationError('invalid_format', 'Backup format marker is missing or invalid.');
  }
  if (parsed.version !== BACKUP_VERSION) {
    throw new BackupValidationError(
      'unsupported_version',
      `Unsupported backup version: ${String(parsed.version)}`,
    );
  }
  if (!isPlainObject(parsed.data)) {
    throw new BackupValidationError('invalid_data', 'Backup data section is missing.');
  }

  const data = parsed.data;
  if (!Array.isArray(data.weightHistory) || !data.weightHistory.every(isWeightRecord)) {
    throw new BackupValidationError('invalid_data', 'weightHistory is invalid.');
  }
  if (!Array.isArray(data.habits) || !data.habits.every(isHabit)) {
    throw new BackupValidationError('invalid_data', 'habits is invalid.');
  }
  if (!isProfileSettings(data.profileSettings)) {
    throw new BackupValidationError('invalid_data', 'profileSettings is invalid.');
  }
  if (data.language !== 'ja' && data.language !== 'en') {
    throw new BackupValidationError('invalid_data', 'language is invalid.');
  }

  const themeNormalized =
    typeof data.themeColor === 'string' ? normalizeThemeHex(data.themeColor) : null;
  if (!themeNormalized || !isPresetThemeColor(themeNormalized)) {
    throw new BackupValidationError('invalid_data', 'themeColor is invalid.');
  }
  if (!isNotificationConfig(data.notificationConfig)) {
    throw new BackupValidationError('invalid_data', 'notificationConfig is invalid.');
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : new Date().toISOString(),
    appVersion: typeof parsed.appVersion === 'string' ? parsed.appVersion : '1.0.0',
    data: {
      weightHistory: data.weightHistory,
      habits: data.habits,
      profileSettings: data.profileSettings,
      language: data.language,
      themeColor: themeNormalized,
      notificationConfig: {
        v: 2,
        enabled: data.notificationConfig.enabled,
        notifyTimes: normalizeNotifyTimes(data.notificationConfig.notifyTimes),
      },
    },
  };
}

async function buildBackupPayload(appVersion = '1.0.0'): Promise<BackupPayloadV1> {
  const [weightHistoryRaw, habitsRaw, profileRaw, languageRaw, themeRaw, notificationRaw] =
    await AsyncStorage.multiGet([
      WEIGHT_HISTORY_KEY,
      HABITS_STORAGE_KEY,
      PROFILE_SETTINGS_KEY,
      APP_LANGUAGE_KEY,
      THEME_COLOR_KEY,
      INTELLIGENT_REMINDER_CONFIG_KEY,
    ]);

  const weightHistory = weightHistoryRaw[1] ? (JSON.parse(weightHistoryRaw[1]) as unknown[]) : [];
  const habits = habitsRaw[1] ? (JSON.parse(habitsRaw[1]) as Habit[]) : [];
  const profileSettings = profileRaw[1]
    ? (JSON.parse(profileRaw[1]) as BackupProfileSettings)
    : { initialWeight: '', targetWeight: '' };
  const language: BackupLanguage =
    languageRaw[1] === 'en' || languageRaw[1] === 'ja' ? languageRaw[1] : 'ja';
  const themeCandidate = themeRaw[1] ? normalizeThemeHex(themeRaw[1]) : null;
  const themeColor =
    themeCandidate && isPresetThemeColor(themeCandidate) ? themeCandidate : DEFAULT_THEME_COLOR;

  let notificationConfig: IntelligentReminderConfigV2 = {
    v: 2,
    enabled: true,
    notifyTimes: ['07:00'],
  };
  if (notificationRaw[1]) {
    try {
      const parsed = JSON.parse(notificationRaw[1]);
      if (isNotificationConfig(parsed)) {
        notificationConfig = {
          v: 2,
          enabled: parsed.enabled,
          notifyTimes: normalizeNotifyTimes(parsed.notifyTimes),
        };
      }
    } catch {
      // keep default
    }
  }

  if (!Array.isArray(weightHistory) || !Array.isArray(habits)) {
    throw new Error('Current app data is corrupted and cannot be exported.');
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion,
    data: {
      weightHistory,
      habits,
      profileSettings: {
        initialWeight: String(profileSettings.initialWeight ?? ''),
        targetWeight: String(profileSettings.targetWeight ?? ''),
      },
      language,
      themeColor,
      notificationConfig,
    },
  };
}

function buildExportFileName(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `weight-app-backup-${y}${m}${d}.json`;
}

export async function exportBackupToShareSheet(appVersion = '1.0.0'): Promise<void> {
  const payload = await buildBackupPayload(appVersion);
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) {
    throw new Error('Cache directory is unavailable.');
  }

  const fileUri = `${cacheDir}${buildExportFileName()}`;
  await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(payload, null, 2), {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error('Sharing is not available on this device.');
  }

  await Sharing.shareAsync(fileUri, {
    mimeType: 'application/json',
    UTI: 'public.json',
    dialogTitle: 'weight-app backup',
  });
}

export async function pickAndRestoreBackup(): Promise<BackupPayloadV1> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'public.json', 'text/json', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || !result.assets?.[0]?.uri) {
    throw new BackupValidationError('invalid_json', 'cancelled');
  }

  const raw = await FileSystem.readAsStringAsync(result.assets[0].uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  const backup = parseBackupJson(raw);

  // all-or-nothing: validate first (parseBackupJson), then write everything together
  await AsyncStorage.multiSet([
    [WEIGHT_HISTORY_KEY, JSON.stringify(backup.data.weightHistory)],
    [HABITS_STORAGE_KEY, JSON.stringify(backup.data.habits)],
    [PROFILE_SETTINGS_KEY, JSON.stringify(backup.data.profileSettings)],
    [APP_LANGUAGE_KEY, backup.data.language],
    [THEME_COLOR_KEY, backup.data.themeColor],
    [INTELLIGENT_REMINDER_CONFIG_KEY, JSON.stringify(backup.data.notificationConfig)],
  ]);

  await updateNotificationSchedule(backup.data.notificationConfig.notifyTimes);

  return backup;
}

export function isBackupCancelledError(error: unknown): boolean {
  return error instanceof BackupValidationError && error.message === 'cancelled';
}
