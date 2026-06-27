import AsyncStorage from '@react-native-async-storage/async-storage';

import { type Habit, type HabitFrequency, habitToTag, loadHabits } from '@/constants/Habits';

import {
  ACCENT_SURFACE_BG,
  accentSurfaceTextStyle,
} from '@/constants/ThemePresets';

export type TagKind = 'positive' | 'caution';

export type Tag = { id: string; label: string; kind: TagKind };

export const DEFAULT_TAGS: Tag[] = [
  { id: 'def_meal', label: '適切な食事量', kind: 'positive' },
  { id: 'def_no_sweets', label: '甘いものなし', kind: 'positive' },
  { id: 'def_no_snacks', label: '間食なし', kind: 'positive' },
  { id: 'def_exercise', label: '運動', kind: 'positive' },
];

export const USER_TAGS_STORAGE_KEY = '@user_tags';
export const HIDDEN_DEFAULT_TAGS_STORAGE_KEY = '@hidden_default_tags';

export const CAUTION_COLOR = '#FF9500';

/** 未選択タグの文字・枠線（補助テキストと同系の薄めグレー） */
export const TAG_CHIP_INACTIVE_COLOR = '#8E8E93';

function isTag(value: unknown): value is Tag {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<Tag>;
  return (
    typeof v.id === 'string' &&
    typeof v.label === 'string' &&
    (v.kind === 'positive' || v.kind === 'caution')
  );
}

export async function loadUserTags(): Promise<Tag[]> {
  const habits = await loadHabits();
  return habits.map((h) => ({ ...habitToTag(h), kind: 'positive' as const }));
}

/** 習慣の継続頻度ごとに記録タブ用タグをグループ化 */
export function groupTagsByFrequency(habits: Habit[]): Record<HabitFrequency, Tag[]> {
  const groups: Record<HabitFrequency, Tag[]> = {
    daily: [],
    weekly: [],
    monthly: [],
  };
  for (const habit of habits) {
    groups[habit.frequency].push({ ...habitToTag(habit), kind: 'positive' });
  }
  return groups;
}

/** 習慣一覧を記録タブ用タグとして取得 */
export async function loadAllTags(): Promise<Tag[]> {
  return loadUserTags();
}

export async function loadUserTagsLegacy(): Promise<Tag[]> {
  try {
    const raw = await AsyncStorage.getItem(USER_TAGS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isTag);
  } catch (e) {
    console.log('user tags load failed', e);
    return [];
  }
}

export async function saveUserTags(tags: Tag[]): Promise<void> {
  try {
    await AsyncStorage.setItem(USER_TAGS_STORAGE_KEY, JSON.stringify(tags));
  } catch (e) {
    console.log('user tags save failed', e);
  }
}

export async function loadHiddenDefaultIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(HIDDEN_DEFAULT_TAGS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string');
  } catch (e) {
    console.log('hidden defaults load failed', e);
    return [];
  }
}

export async function saveHiddenDefaultIds(ids: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(HIDDEN_DEFAULT_TAGS_STORAGE_KEY, JSON.stringify(ids));
  } catch (e) {
    console.log('hidden defaults save failed', e);
  }
}

export function getAllTags(userTags: Tag[], hiddenDefaultIds: string[] = []): Tag[] {
  if (hiddenDefaultIds.length === 0) {
    return userTags;
  }
  const hidden = new Set(hiddenDefaultIds);
  return [...DEFAULT_TAGS, ...userTags].filter((t) => !hidden.has(t.id));
}

export function buildTagMap(tags: Tag[]): Record<string, Tag> {
  const map: Record<string, Tag> = {};
  for (const t of tags) map[t.id] = t;
  return map;
}

export function getTagBaseColor(tag: Tag, themeColor: string): string {
  return tag.kind === 'caution' ? CAUTION_COLOR : themeColor;
}

export function getSelectableTagChipStyle(
  tag: Tag,
  selected: boolean,
  themeColor: string,
): {
  backgroundColor: string;
  borderColor: string;
  textStyle: {
    color: string;
    fontWeight: '600' | 'bold';
  };
} {
  const baseColor = getTagBaseColor(tag, themeColor);
  if (!selected) {
    return {
      backgroundColor: '#FFFFFF',
      borderColor: TAG_CHIP_INACTIVE_COLOR,
      textStyle: { color: TAG_CHIP_INACTIVE_COLOR, fontWeight: '600' },
    };
  }
  if (tag.kind === 'caution') {
    return {
      backgroundColor: CAUTION_COLOR,
      borderColor: CAUTION_COLOR,
      textStyle: { color: '#FFFFFF', fontWeight: 'bold' },
    };
  }
  return {
    backgroundColor: ACCENT_SURFACE_BG,
    borderColor: baseColor,
    textStyle: accentSurfaceTextStyle,
  };
}

export function isDefaultTag(id: string): boolean {
  return id.startsWith('def_');
}

export function generateUserTagId(): string {
  return `usr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
