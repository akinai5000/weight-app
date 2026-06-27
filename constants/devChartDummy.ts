import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Tag } from '@/constants/Tags';
import { loadUserTags, saveUserTags } from '@/constants/Tags';

/** 開発用ダミー記録の ID 接頭辞（再生成時に除去する） */
export const DEV_DUMMY_RECORD_ID_PREFIX = 'dev_dummy_';

export const DEV_DUMMY_CAUTION_TAG_ID = '__dev_dummy_caution__';

export const DEV_DUMMY_CAUTION_TAG: Tag = {
  id: DEV_DUMMY_CAUTION_TAG_ID,
  label: '（開発）注意デモ',
  kind: 'caution',
};

const WEIGHT_HISTORY_KEY = '@weight_history';

/** __DEV__ 初回起動時の自動注入済みフラグ（AsyncStorage を消すと再実行） */
export const DEV_DUMMY_AUTO_SEED_KEY = '@dev_dummy_auto_seeded';

export type DummyWeightRecord = {
  id: string;
  value: string;
  date: string;
  tags?: string[];
};

const DEF_MEAL = 'def_meal';
const DEF_NO_SWEETS = 'def_no_sweets';
const DEF_NO_SNACKS = 'def_no_snacks';
const DEF_EXERCISE = 'def_exercise';

function formatRecordDate(month: number, day: number, hour: number, minute: number): string {
  return `${month}/${day} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** 1/1 〜 5/9（指定年）の各日 1 件、タグパターンを日ごとにローテーション */
function buildTagPresets(cautionId: string): string[][] {
  return [
    [],
    [DEF_MEAL],
    [DEF_EXERCISE],
    [DEF_MEAL, DEF_EXERCISE],
    [DEF_NO_SWEETS],
    [DEF_NO_SNACKS],
    [DEF_NO_SWEETS, DEF_NO_SNACKS],
    [cautionId],
    [cautionId, DEF_MEAL],
    [DEF_MEAL, DEF_NO_SWEETS],
    [DEF_EXERCISE, DEF_NO_SNACKS],
    [DEF_MEAL, DEF_EXERCISE, DEF_NO_SWEETS],
    [DEF_MEAL, DEF_NO_SWEETS, DEF_NO_SNACKS],
    [DEF_MEAL, DEF_NO_SWEETS, DEF_NO_SNACKS, DEF_EXERCISE],
    [DEF_EXERCISE, cautionId],
    [DEF_NO_SWEETS, cautionId],
    [DEF_MEAL, DEF_EXERCISE, cautionId],
    [DEF_NO_SNACKS, DEF_EXERCISE],
    [DEF_MEAL],
    [DEF_NO_SWEETS, DEF_EXERCISE],
  ];
}

function eachCalendarDayInclusive(year: number, month0: number, day: number, endMonth0: number, endDay: number): Date[] {
  const out: Date[] = [];
  const cur = new Date(year, month0, day, 12, 0, 0, 0);
  const end = new Date(year, endMonth0, endDay, 12, 0, 0, 0);
  while (cur.getTime() <= end.getTime()) {
    out.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/**
 * 1/1〜5/9（同一年内）の全日分・日ごとに異なるタグの体重ダミー（parseRecordDate と互換の日付文字列）
 */
export function buildDevDummyWeightRecords(year = new Date().getFullYear()): DummyWeightRecord[] {
  const C = DEV_DUMMY_CAUTION_TAG_ID;
  const presets = buildTagPresets(C);
  const days = eachCalendarDayInclusive(year, 0, 1, 4, 9);

  return days.map((dt, i) => {
    const month = dt.getMonth() + 1;
    const day = dt.getDate();
    const hour = 7 + (i % 3);
    const minute = (10 + i * 7) % 60;
    const w = 72.2 - i * 0.035 + (i % 6) * 0.08;
    const weight = Math.min(74.5, Math.max(67.5, w)).toFixed(1);
    const tags = presets[i % presets.length];
    return {
      id: `${DEV_DUMMY_RECORD_ID_PREFIX}${year}_${month}_${day}`,
      value: weight,
      date: formatRecordDate(month, day, hour, minute),
      tags: [...tags],
    };
  });
}

function isNonDummyHistoryItem(h: unknown): boolean {
  if (!h || typeof h !== 'object' || !('id' in h)) return true;
  const id = (h as { id?: unknown }).id;
  return typeof id !== 'string' || !id.startsWith(DEV_DUMMY_RECORD_ID_PREFIX);
}

/**
 * 既存の dev_dummy を除き、新しいダミー列を先頭にマージ。注意デモ用タグが無ければ追加。
 * @returns 追加したダミー件数（__DEV__ 以外では 0）
 */
export async function injectDevDummyWeightData(year = new Date().getFullYear()): Promise<number> {
  if (!__DEV__) return 0;

  const raw = await AsyncStorage.getItem(WEIGHT_HISTORY_KEY);
  let history: unknown[] = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) history = parsed;
    } catch {
      history = [];
    }
  }

  let nextTags = await loadUserTags();
  if (!nextTags.some((t) => t.id === DEV_DUMMY_CAUTION_TAG.id)) {
    nextTags = [...nextTags, DEV_DUMMY_CAUTION_TAG];
    await saveUserTags(nextTags);
  }

  const cleaned = history.filter(isNonDummyHistoryItem);
  const dummy = buildDevDummyWeightRecords(year);
  await AsyncStorage.setItem(WEIGHT_HISTORY_KEY, JSON.stringify([...dummy, ...cleaned]));
  return dummy.length;
}

/** __DEV__ かつ未実行なら、初回のみダミーを注入（フラグは AsyncStorage） */
export async function maybeInjectDevDummyOnFirstLaunch(): Promise<void> {
  if (!__DEV__) return;
  try {
    const done = await AsyncStorage.getItem(DEV_DUMMY_AUTO_SEED_KEY);
    if (done === '1') return;
    await injectDevDummyWeightData();
    await AsyncStorage.setItem(DEV_DUMMY_AUTO_SEED_KEY, '1');
  } catch (e) {
    console.log('dev dummy auto-seed failed', e);
  }
}
