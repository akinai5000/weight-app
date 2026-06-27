import AsyncStorage from '@react-native-async-storage/async-storage';

export type HabitFrequency = 'daily' | 'weekly' | 'monthly';

export type Habit = {
  id: string;
  name: string;
  frequency: HabitFrequency;
  /** weekly / monthly のときのみ（1〜99・最大2桁） */
  frequencyCount?: number;
};

export const WEEKLY_FREQUENCY_COUNT_MAX = 99;
export const MONTHLY_FREQUENCY_COUNT_MAX = 99;

/** 旧デフォルトタグからの移行用シード */
const LEGACY_DEFAULT_HABIT_SEEDS: { id: string; name: string }[] = [
  { id: 'def_meal', name: '適切な食事量' },
  { id: 'def_no_sweets', name: '甘いものなし' },
  { id: 'def_no_snacks', name: '間食なし' },
  { id: 'def_exercise', name: '運動' },
];

export type LegacyTag = { id: string; label: string; kind?: string };

export const HABITS_STORAGE_KEY = '@habits_v1';

type LegacyMonthlyConfig = Partial<Record<1 | 2 | 3 | 4, string[]>>;

function isValidWeekNumber(value: unknown): value is number {
  return typeof value === 'number' && value >= 1 && value <= 4;
}

function isValidWeekdayKey(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z]{3}$/.test(value);
}

function countLegacyMonthlySelections(config: LegacyMonthlyConfig): number {
  return ([1, 2, 3, 4] as const).reduce((sum, week) => sum + (config[week]?.length ?? 0), 0);
}

function normalizeLegacyMonthlyConfig(raw: unknown): LegacyMonthlyConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const m = raw as Record<string, unknown>;

  if (isValidWeekNumber(m.weekNumber) && isValidWeekdayKey(m.weekday)) {
    return { [m.weekNumber]: [m.weekday] };
  }

  if (Array.isArray(m.weeks) && Array.isArray(m.weekdays)) {
    const weeks = m.weeks.filter(isValidWeekNumber);
    const weekdays = m.weekdays.filter(isValidWeekdayKey);
    if (weeks.length === 0 || weekdays.length === 0) return undefined;
    const config: LegacyMonthlyConfig = {};
    for (const week of weeks) {
      config[week as 1 | 2 | 3 | 4] = [...weekdays];
    }
    return config;
  }

  const config: LegacyMonthlyConfig = {};
  for (const [key, value] of Object.entries(m)) {
    if (key === 'weeks' || key === 'weekdays' || key === 'weekNumber' || key === 'weekday') {
      continue;
    }
    const week = Number(key);
    if (!isValidWeekNumber(week) || !Array.isArray(value)) continue;
    const days = value.filter(isValidWeekdayKey);
    if (days.length > 0) {
      config[week as 1 | 2 | 3 | 4] = days;
    }
  }

  return countLegacyMonthlySelections(config) > 0 ? config : undefined;
}

function parseFrequencyCount(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function clampFrequencyCount(frequency: HabitFrequency, count: number): number {
  if (frequency === 'weekly') {
    return Math.min(WEEKLY_FREQUENCY_COUNT_MAX, Math.max(1, count));
  }
  if (frequency === 'monthly') {
    return Math.min(MONTHLY_FREQUENCY_COUNT_MAX, Math.max(1, count));
  }
  return 1;
}

function inferLegacyFrequencyCount(
  frequency: HabitFrequency,
  raw: Record<string, unknown>,
): number {
  const explicit = parseFrequencyCount(raw.frequencyCount);
  if (explicit !== undefined) {
    return clampFrequencyCount(frequency, explicit);
  }
  if (frequency === 'weekly' && Array.isArray(raw.weekdays)) {
    const len = raw.weekdays.filter(isValidWeekdayKey).length;
    if (len > 0) return clampFrequencyCount('weekly', len);
  }
  if (frequency === 'monthly') {
    const monthlyConfig = normalizeLegacyMonthlyConfig(raw.monthlyConfig);
    if (monthlyConfig) {
      return clampFrequencyCount('monthly', countLegacyMonthlySelections(monthlyConfig));
    }
  }
  return 1;
}

function normalizeHabit(value: unknown): Habit | null {
  if (!value || typeof value !== 'object') return null;
  const h = value as Record<string, unknown>;
  if (typeof h.id !== 'string' || typeof h.name !== 'string') return null;
  if (h.frequency !== 'daily' && h.frequency !== 'weekly' && h.frequency !== 'monthly') {
    return null;
  }

  const base: Habit = {
    id: h.id,
    name: h.name,
    frequency: h.frequency,
  };

  if (h.frequency === 'daily') {
    return base;
  }

  return {
    ...base,
    frequencyCount: inferLegacyFrequencyCount(h.frequency, h),
  };
}

export function formatFrequencyLabel(habit: Habit, language: 'ja' | 'en'): string {
  if (habit.frequency === 'daily') {
    return language === 'ja' ? '毎日' : 'Daily';
  }
  const count = habit.frequencyCount ?? 1;
  if (habit.frequency === 'weekly') {
    return language === 'ja' ? `週${count}回` : `${count}x/week`;
  }
  return language === 'ja' ? `月${count}回` : `${count}x/month`;
}

/** 設定タブ一覧の頻度バッジ用（「回」を省略した短い表記） */
export function formatFrequencyBadgeLabel(habit: Habit, language: 'ja' | 'en'): string {
  if (habit.frequency === 'daily') {
    return language === 'ja' ? '毎日' : 'Daily';
  }
  const count = habit.frequencyCount ?? 1;
  if (habit.frequency === 'weekly') {
    return language === 'ja' ? `週${count}` : `${count}/w`;
  }
  return language === 'ja' ? `月${count}` : `${count}/m`;
}

export function generateHabitId(): string {
  return `hab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultHabitFromLegacy(id: string, name: string): Habit {
  return {
    id,
    name,
    frequency: 'daily',
  };
}

export function habitToTag(habit: Habit): { id: string; label: string; kind: 'positive' } {
  return {
    id: habit.id,
    label: habit.name,
    kind: 'positive',
  };
}

async function loadLegacyUserTags(): Promise<LegacyTag[]> {
  try {
    const raw = await AsyncStorage.getItem('@user_tags');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is LegacyTag =>
        Boolean(t) &&
        typeof t === 'object' &&
        typeof (t as LegacyTag).id === 'string' &&
        typeof (t as LegacyTag).label === 'string',
    );
  } catch {
    return [];
  }
}

async function loadLegacyHiddenDefaultIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem('@hidden_default_tags');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string');
  } catch {
    return [];
  }
}

async function migrateFromLegacyTags(): Promise<Habit[]> {
  const hidden = new Set(await loadLegacyHiddenDefaultIds());
  const defaults = LEGACY_DEFAULT_HABIT_SEEDS.filter((t) => !hidden.has(t.id)).map((t) =>
    defaultHabitFromLegacy(t.id, t.name),
  );
  const legacyUser = await loadLegacyUserTags();
  const userHabits = legacyUser
    .filter((t) => !defaults.some((d) => d.id === t.id))
    .map((t) => defaultHabitFromLegacy(t.id, t.label));
  return [...defaults, ...userHabits];
}

export async function loadHabits(): Promise<Habit[]> {
  try {
    const raw = await AsyncStorage.getItem(HABITS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const valid = parsed.map(normalizeHabit).filter((h): h is Habit => h !== null);
        if (valid.length > 0) {
          await saveHabits(valid);
          return valid;
        }
      }
    }
  } catch (e) {
    console.log('habits load failed', e);
  }

  const migrated = await migrateFromLegacyTags();
  await saveHabits(migrated);
  return migrated;
}

export async function saveHabits(habits: Habit[]): Promise<void> {
  try {
    await AsyncStorage.setItem(HABITS_STORAGE_KEY, JSON.stringify(habits));
  } catch (e) {
    console.log('habits save failed', e);
  }
}
