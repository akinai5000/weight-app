import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEV_DUMMY_AUTO_SEED_KEY } from '@/constants/devChartDummy';
import { type Habit, HABITS_STORAGE_KEY, saveHabits } from '@/constants/Habits';
import {
  HIDDEN_DEFAULT_TAGS_STORAGE_KEY,
  USER_TAGS_STORAGE_KEY,
} from '@/constants/Tags';
import { parseWeightRecordDate } from '@/constants/WeightRecordDate';

/** 注入データの ID 接頭辞（再実行時に除去可能） */
export const SEED_YEAR_RECORD_ID_PREFIX = 'seed_year_';

const WEIGHT_HISTORY_KEY = '@weight_history';

/** 本日（グラフ確認用の固定終了日） */
export const SEED_YEAR_END_DATE = new Date(2026, 5, 22, 8, 30, 0, 0);

/** 過去365日分（本日を含む） */
export const SEED_YEAR_DAY_COUNT = 365;

const WEIGHT_START_KG = 80.0;
const WEIGHT_END_KG = 70.0;

const HABIT_MEAL = 'def_meal';
const HABIT_NO_SNACKS = 'def_no_snacks';
const HABIT_EXERCISE = 'def_exercise';
const HABIT_MORNING = 'hab_morning';
const HABIT_BOOK = 'hab_book_monthly';

const EXERCISE_WEEKLY_PLAN: WeeklyTagPlan = {
  id: HABIT_EXERCISE,
  frequencyCount: 3,
  targetWinRate: 0.5,
  forcedRecentLossWeeks: 2,
};

const MORNING_WEEKLY_PLAN: WeeklyTagPlan = {
  id: HABIT_MORNING,
  frequencyCount: 4,
  targetWinRate: 0.25,
  forcedRecentLossWeeks: 3,
};

/** 直近数日は連続ONにする（ストリーク演出） */
const DAILY_RECENT_PROTECTED_DAYS = 7;

/** 1カ月グラフの週次集計で先頭週の端数を含める余裕日数 */
const ONE_MONTH_CHART_LOOKBACK_DAYS = 38;

/** 1カ月グラフ開始時点の体重（右肩下がりの起点） */
const WEIGHT_ONE_MONTH_CHART_START_KG = 73.5;

/** サボ期に入る直前の体重アンカー */
const WEIGHT_SLUMP_ANCHOR_KG = 71.7;

/** 1カ月フィルター用の体重ウィンドウ */
const ONE_MONTH_WEIGHT_DAYS = 30;

const DAY_MS = 86400000;

/** 運動・朝活サボ期間（減量ペースを緩める） */
const WEIGHT_SLUMP_DAYS = 21;

/** 1カ月フィルターで集計される完全終了週数 */
const ONE_MONTH_COMPLETE_WEEKS = 4;

export type SeedWeightRecord = {
  id: string;
  value: string;
  date: string;
  tags: string[];
  /** 古い順 0 → 最新 dayCount-1（並び替え用） */
  recordSeq: number;
};

export type SeedYearChartDummyResult = {
  recordCount: number;
  startDate: string;
  endDate: string;
  weightStartKg: number;
  weightEndKg: number;
  tagStats: Record<string, { assignedDays: number; rate: number }>;
};

type DailyTagPlan = {
  id: string;
  targetRate: number;
};

type WeeklyTagPlan = {
  id: string;
  frequencyCount: number;
  targetWinRate: number;
  /** 直近の完全終了週を連続未達成にしてストリーク0を作る */
  forcedRecentLossWeeks: number;
};

/** 【毎日】日数ベースの目標達成率（1カ月フィルターで ☀️ 95%前後） */
const DAILY_TAG_PLANS: DailyTagPlan[] = [
  { id: HABIT_MEAL, targetRate: 0.95 },
  { id: HABIT_NO_SNACKS, targetRate: 0.95 },
];

/** 【週x回】完全終了週の勝率ベース */
const WEEKLY_TAG_PLANS: WeeklyTagPlan[] = [EXERCISE_WEEKLY_PLAN, MORNING_WEEKLY_PLAN];

function startOfWeekMonday(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const weekday = d.getDay();
  const delta = (weekday + 6) % 7;
  d.setDate(d.getDate() - delta);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** 分析タブと同じ「最後に完全終了した週」の月曜（今週の1週前） */
function getLastCompleteWeekMonday(referenceDay: Date): Date {
  return addDays(startOfWeekMonday(referenceDay), -7);
}

/** 基準日から遡る完全終了週の weekKey（分析のストリーク判定と一致） */
function getCompleteWeekLossKeys(referenceEnd: Date, count: number): Set<string> {
  let monday = getLastCompleteWeekMonday(referenceEnd);
  const keys = new Set<string>();
  for (let i = 0; i < count; i += 1) {
    keys.add(formatIsoDate(monday));
    monday = addDays(monday, -7);
  }
  return keys;
}

/** 1カ月フィルター対象の完全終了週（古い順） */
function getOneMonthCompleteWeekMondays(referenceEnd: Date): Date[] {
  const weeks: Date[] = [];
  let monday = getLastCompleteWeekMonday(referenceEnd);
  for (let i = 0; i < ONE_MONTH_COMPLETE_WEEKS; i += 1) {
    weeks.unshift(monday);
    monday = addDays(monday, -7);
  }
  return weeks;
}

function weekKeyFromDate(date: Date): string {
  return formatIsoDate(startOfWeekMonday(date));
}

/** 再現性のある疑似乱数（Mulberry32） */
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(items: T[], rng: () => number): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}

/** 年付き日付（1年超の履歴でもパース・並びが崩れない） */
function formatRecordDate(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = date.getHours();
  const minute = date.getMinutes();
  return `${year}/${month}/${day} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function formatIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function buildSeedDates(endDate: Date, dayCount: number): Date[] {
  const end = new Date(endDate);
  end.setHours(8, 30, 0, 0);
  const dates: Date[] = [];
  for (let offset = dayCount - 1; offset >= 0; offset -= 1) {
    const d = new Date(end);
    d.setDate(d.getDate() - offset);
    dates.push(d);
  }
  return dates;
}

function constrainedDailyNoise(rng: () => number): number {
  const magnitude = 0.2 + rng() * 0.3;
  return rng() < 0.5 ? magnitude : -magnitude;
}

function chartWindowTargetWeight(
  dayIndex: number,
  chartWindowStart: number,
  slumpStart: number,
  dayCount: number,
): number {
  if (dayIndex < slumpStart) {
    const span = slumpStart - chartWindowStart;
    const t = span <= 0 ? 1 : (dayIndex - chartWindowStart) / span;
    return (
      WEIGHT_ONE_MONTH_CHART_START_KG +
      (WEIGHT_SLUMP_ANCHOR_KG - WEIGHT_ONE_MONTH_CHART_START_KG) * t
    );
  }
  const span = dayCount - 1 - slumpStart;
  const t = span <= 0 ? 1 : (dayIndex - slumpStart) / span;
  return WEIGHT_SLUMP_ANCHOR_KG + (WEIGHT_END_KG - WEIGHT_SLUMP_ANCHOR_KG) * t;
}

function buildChartWindowWeights(
  weights: number[],
  chartWindowStart: number,
  slumpStart: number,
  dayCount: number,
  rng: () => number,
): void {
  for (let dayIndex = chartWindowStart; dayIndex < dayCount; dayIndex += 1) {
    const target = chartWindowTargetWeight(dayIndex, chartWindowStart, slumpStart, dayCount);
    let next = round1(target + constrainedDailyNoise(rng));
    next = Math.min(next, round1(target + 0.2));
    next = Math.max(next, round1(target - 0.4));

    if (dayIndex > chartWindowStart) {
      const prev = weights[dayIndex - 1];
      next = Math.min(next, round1(prev + 0.1));
      next = Math.max(next, round1(prev - 0.5));
    }

    weights[dayIndex] = next;
  }
}

/** 1カ月グラフ（週次集計）の各週平均が右肩下がりになるよう補正 */
function enforceOneMonthWeeklyDecline(
  weights: number[],
  dates: Date[],
  referenceEnd: Date,
): void {
  const startTs = referenceEnd.getTime() - ONE_MONTH_WEIGHT_DAYS * DAY_MS;
  const endTs = referenceEnd.getTime();
  const keyToIndex = new Map<string, number>();
  dates.forEach((date, index) => {
    keyToIndex.set(formatIsoDate(date), index);
  });

  const weekBuckets: number[][] = [];
  for (
    let weekStart = startOfWeekMonday(new Date(startTs));
    weekStart.getTime() <= endTs;
    weekStart = addDays(weekStart, 7)
  ) {
    const weekEnd = addDays(weekStart, 6);
    const indices: number[] = [];
    for (
      let cursor = new Date(weekStart);
      cursor.getTime() <= weekEnd.getTime();
      cursor = addDays(cursor, 1)
    ) {
      if (cursor.getTime() < startTs || cursor.getTime() > endTs) continue;
      const index = keyToIndex.get(formatIsoDate(cursor));
      if (index !== undefined) indices.push(index);
    }
    if (indices.length > 0) weekBuckets.push(indices);
  }

  let prevAvg = Number.POSITIVE_INFINITY;
  for (const indices of weekBuckets) {
    const avg = indices.reduce((sum, index) => sum + weights[index], 0) / indices.length;
    if (prevAvg !== Number.POSITIVE_INFINITY && avg >= prevAvg - 0.05) {
      const targetAvg = round1(prevAvg - 0.2);
      const delta = targetAvg - avg;
      for (const index of indices) {
        weights[index] = round1(weights[index] + delta);
      }
      prevAvg = targetAvg;
    } else {
      prevAvg = round1(avg);
    }
  }

  weights[weights.length - 1] = WEIGHT_END_KG;
}

/** 右肩下がり + 日次ブレの体重列（最終日は 70.0kg に固定） */
export function buildSeedYearWeights(
  dates: Date[],
  rng: () => number,
  referenceEnd: Date = dates[dates.length - 1] ?? SEED_YEAR_END_DATE,
): number[] {
  const dayCount = dates.length;
  const weights: number[] = new Array(dayCount);
  const chartWindowStart = Math.max(0, dayCount - ONE_MONTH_CHART_LOOKBACK_DAYS);
  const slumpStart = Math.max(chartWindowStart, dayCount - WEIGHT_SLUMP_DAYS);

  for (let i = 0; i < chartWindowStart; i += 1) {
    const progress = chartWindowStart <= 1 ? 1 : i / (chartWindowStart - 1);
    const base =
      WEIGHT_START_KG +
      (WEIGHT_ONE_MONTH_CHART_START_KG - WEIGHT_START_KG) * progress;
    weights[i] = round1(base + constrainedDailyNoise(rng) * 0.4);
  }

  buildChartWindowWeights(weights, chartWindowStart, slumpStart, dayCount, rng);
  enforceOneMonthWeeklyDecline(weights, dates, referenceEnd);
  weights[dayCount - 1] = WEIGHT_END_KG;
  return weights;
}

function ensureDayTags(tagsByDay: Map<number, string[]>, dayIndex: number): string[] {
  const existing = tagsByDay.get(dayIndex);
  if (existing) return existing;
  const next: string[] = [];
  tagsByDay.set(dayIndex, next);
  return next;
}

function assignDailyHabitTags(
  dayCount: number,
  plan: DailyTagPlan,
  rng: () => number,
  tagsByDay: Map<number, string[]>,
): void {
  const oneMonthWindow = Math.min(30, dayCount);
  const streakProtect = Math.min(DAILY_RECENT_PROTECTED_DAYS, dayCount);
  const monthWindowStart = Math.max(0, dayCount - oneMonthWindow);
  const streakStart = Math.max(0, dayCount - streakProtect);

  const yearMissCount = Math.max(0, dayCount - Math.round(dayCount * plan.targetRate));
  const monthMissBudget = Math.max(0, Math.round(oneMonthWindow * (1 - plan.targetRate)));
  const monthMissCount = Math.min(
    Math.min(monthMissBudget, 1),
    Math.max(0, streakStart - monthWindowStart),
    yearMissCount,
  );
  const earlyMissCount = yearMissCount - monthMissCount;

  const missIndices = new Set<number>();

  const earlyPool = Array.from({ length: monthWindowStart }, (_, i) => i);
  shuffleInPlace(earlyPool, rng);
  for (let i = 0; i < Math.min(earlyMissCount, earlyPool.length); i += 1) {
    missIndices.add(earlyPool[i]);
  }

  const monthMissPool = Array.from(
    { length: Math.max(0, streakStart - monthWindowStart) },
    (_, i) => monthWindowStart + i,
  );
  shuffleInPlace(monthMissPool, rng);
  for (let i = 0; i < Math.min(monthMissCount, monthMissPool.length); i += 1) {
    missIndices.add(monthMissPool[i]);
  }

  for (let dayIndex = 0; dayIndex < dayCount; dayIndex += 1) {
    if (!missIndices.has(dayIndex)) {
      ensureDayTags(tagsByDay, dayIndex).push(plan.id);
    }
  }
}

function applyWeekTagPattern(
  dayIndices: number[],
  plan: WeeklyTagPlan,
  shouldWin: boolean,
  rng: () => number,
  tagsByDay: Map<number, string[]>,
  options?: { slumpFail?: boolean },
): void {
  const maxDays = dayIndices.length;
  let assignCount: number;

  if (shouldWin) {
    const minWinDays = Math.min(plan.frequencyCount, maxDays);
    const extraDays = maxDays - minWinDays;
    assignCount =
      extraDays > 0 ? minWinDays + Math.floor(rng() * (extraDays + 1)) : minWinDays;
  } else if (options?.slumpFail && plan.id === HABIT_EXERCISE) {
    assignCount = 1 + Math.floor(rng() * 2);
  } else {
    const maxFailDays = Math.min(plan.frequencyCount - 1, maxDays);
    assignCount = Math.floor(rng() * (maxFailDays + 1));
  }

  if (assignCount <= 0) return;

  const shuffled = [...dayIndices];
  shuffleInPlace(shuffled, rng);
  for (let i = 0; i < assignCount; i += 1) {
    ensureDayTags(tagsByDay, shuffled[i]).push(plan.id);
  }
}

function buildWeekToDayIndices(dates: Date[]): Map<string, number[]> {
  const weekToDayIndices = new Map<string, number[]>();
  dates.forEach((date, dayIndex) => {
    const key = weekKeyFromDate(date);
    const bucket = weekToDayIndices.get(key);
    if (bucket) bucket.push(dayIndex);
    else weekToDayIndices.set(key, [dayIndex]);
  });
  return weekToDayIndices;
}

function removeHabitFromDayIndices(
  habitId: string,
  dayIndices: number[],
  tagsByDay: Map<number, string[]>,
): void {
  for (const dayIndex of dayIndices) {
    const tags = tagsByDay.get(dayIndex);
    if (!tags) continue;
    const next = tags.filter((tagId) => tagId !== habitId);
    if (next.length > 0) tagsByDay.set(dayIndex, next);
    else tagsByDay.delete(dayIndex);
  }
}

/**
 * 1カ月フィルター（直近4完全終了週）の勝敗をピン留め
 * - 運動: 2勝2敗（50%）→ ☁️、直近完全週は未達成
 * - 朝活: 1勝3敗（25%）→ ☔、直近3完全週は未達成
 */
function pinOneMonthCompleteWeekOutcomes(
  dates: Date[],
  referenceEnd: Date,
  tagsByDay: Map<number, string[]>,
  rng: () => number,
): void {
  const weekToDayIndices = buildWeekToDayIndices(dates);
  const oneMonthMondays = getOneMonthCompleteWeekMondays(referenceEnd);

  const exerciseWinKeys = new Set([
    formatIsoDate(oneMonthMondays[0]),
    formatIsoDate(oneMonthMondays[1]),
  ]);

  for (const monday of oneMonthMondays) {
    const weekKey = formatIsoDate(monday);
    const dayIndices = weekToDayIndices.get(weekKey);
    if (!dayIndices || dayIndices.length === 0) continue;

    removeHabitFromDayIndices(HABIT_EXERCISE, dayIndices, tagsByDay);
    applyWeekTagPattern(
      dayIndices,
      EXERCISE_WEEKLY_PLAN,
      exerciseWinKeys.has(weekKey),
      rng,
      tagsByDay,
      { slumpFail: !exerciseWinKeys.has(weekKey) },
    );
  }

  const morningWinKeys = new Set([formatIsoDate(oneMonthMondays[0])]);

  for (const monday of oneMonthMondays) {
    const weekKey = formatIsoDate(monday);
    const dayIndices = weekToDayIndices.get(weekKey);
    if (!dayIndices || dayIndices.length === 0) continue;

    removeHabitFromDayIndices(HABIT_MORNING, dayIndices, tagsByDay);
    applyWeekTagPattern(
      dayIndices,
      MORNING_WEEKLY_PLAN,
      morningWinKeys.has(weekKey),
      rng,
      tagsByDay,
    );
  }
}

/**
 * 週単位で勝率を逆算し、直近数週を未達成にしてストリーク0を作る
 */
function assignWeeklyHabitTags(
  dates: Date[],
  plan: WeeklyTagPlan,
  rng: () => number,
  tagsByDay: Map<number, string[]>,
  referenceEnd: Date,
): void {
  const weekToDayIndices = buildWeekToDayIndices(dates);
  const weekKeys = [...weekToDayIndices.keys()].sort();
  const totalWeeks = weekKeys.length;
  const forcedLossWeeks = getCompleteWeekLossKeys(referenceEnd, plan.forcedRecentLossWeeks);
  const elasticWeekKeys = weekKeys.filter((key) => !forcedLossWeeks.has(key));

  const targetWins = Math.floor(totalWeeks * plan.targetWinRate);
  const winsToAssign = Math.min(targetWins, elasticWeekKeys.length);
  const shuffledElastic = [...elasticWeekKeys];
  shuffleInPlace(shuffledElastic, rng);
  const winWeeks = new Set(shuffledElastic.slice(0, winsToAssign));

  for (const weekKey of weekKeys) {
    const dayIndices = weekToDayIndices.get(weekKey);
    if (!dayIndices) continue;
    const shouldWin = !forcedLossWeeks.has(weekKey) && winWeeks.has(weekKey);
    applyWeekTagPattern(dayIndices, plan, shouldWin, rng, tagsByDay, {
      slumpFail: forcedLossWeeks.has(weekKey) && plan.id === HABIT_EXERCISE,
    });
  }
}

/** 【月x回】各暦月に1日付与 → 完全終了月の勝率100% */
function assignMonthlyBookTags(
  dates: Date[],
  rng: () => number,
  tagsByDay: Map<number, string[]>,
): void {
  const monthToDayIndices = new Map<string, number[]>();
  dates.forEach((date, dayIndex) => {
    const key = monthKey(date);
    const bucket = monthToDayIndices.get(key);
    if (bucket) bucket.push(dayIndex);
    else monthToDayIndices.set(key, [dayIndex]);
  });

  for (const dayIndices of monthToDayIndices.values()) {
    const picked = dayIndices[Math.floor(rng() * dayIndices.length)];
    ensureDayTags(tagsByDay, picked).push(HABIT_BOOK);
  }
}

/**
 * 日次（日数率）・週次（週勝率）・月次（月勝率）の各ロジックに合わせてタグを付与
 */
export function buildSeedYearTagAssignments(
  dates: Date[],
  seed: number,
  referenceEnd: Date = dates[dates.length - 1] ?? SEED_YEAR_END_DATE,
): Map<number, string[]> {
  const tagsByDay = new Map<number, string[]>();

  DAILY_TAG_PLANS.forEach((plan, index) => {
    assignDailyHabitTags(dates.length, plan, createRng(seed + index), tagsByDay);
  });

  WEEKLY_TAG_PLANS.forEach((plan, index) => {
    assignWeeklyHabitTags(
      dates,
      plan,
      createRng(seed + 10 + index),
      tagsByDay,
      referenceEnd,
    );
  });

  pinOneMonthCompleteWeekOutcomes(dates, referenceEnd, tagsByDay, createRng(seed + 30));

  assignMonthlyBookTags(dates, createRng(seed + 20), tagsByDay);

  return tagsByDay;
}

export function buildSeedYearHabits(): Habit[] {
  return [
    { id: HABIT_MEAL, name: '適切な食事量', frequency: 'daily' },
    { id: HABIT_NO_SNACKS, name: '間食なし', frequency: 'daily' },
    { id: HABIT_EXERCISE, name: '運動', frequency: 'weekly', frequencyCount: 3 },
    { id: HABIT_MORNING, name: '朝活', frequency: 'weekly', frequencyCount: 4 },
    { id: HABIT_BOOK, name: '本1冊読む', frequency: 'monthly', frequencyCount: 1 },
  ];
}

export function buildSeedYearWeightRecords(
  endDate: Date = SEED_YEAR_END_DATE,
  dayCount: number = SEED_YEAR_DAY_COUNT,
  seed = 20260622,
): SeedWeightRecord[] {
  const rng = createRng(seed);
  const dates = buildSeedDates(endDate, dayCount);
  const weights = buildSeedYearWeights(dates, rng, endDate);
  const tagAssignments = buildSeedYearTagAssignments(dates, seed + 1, endDate);

  return dates.map((date, dayIndex) => ({
    id: `${SEED_YEAR_RECORD_ID_PREFIX}${String(dayIndex + 1).padStart(3, '0')}`,
    value: weights[dayIndex].toFixed(1),
    date: formatRecordDate(date),
    tags: tagAssignments.get(dayIndex) ?? [],
    recordSeq: dayIndex,
  }));
}

/** 生成結果の検証（開発用） */
export function verifySeedYearChartDummyBuild(
  endDate: Date = SEED_YEAR_END_DATE,
  dayCount: number = SEED_YEAR_DAY_COUNT,
  seed = 20260622,
): { ok: boolean; messages: string[] } {
  const records = buildSeedYearWeightRecords(endDate, dayCount, seed);
  const historyOrder = sortRecordsForHistory(records);
  const messages: string[] = [];

  const first = historyOrder[0];
  const last = historyOrder[historyOrder.length - 1];
  const firstTs = parseWeightRecordDate(first.date, endDate);
  const lastTs = parseWeightRecordDate(last.date, endDate);

  messages.push(`履歴先頭: ${first.date} / 末尾: ${last.date}`);

  const issues: string[] = [];
  if (firstTs < lastTs) {
    issues.push('履歴順: 先頭が最新日付になっていません');
  }
  if (!first.date.startsWith('2026/6/22')) {
    issues.push(`最新日付が期待と異なります: ${first.date}`);
  }

  const last30 = historyOrder.slice(0, 30);
  for (const habitId of [HABIT_MEAL, HABIT_NO_SNACKS]) {
    const done = last30.filter((r) => r.tags.includes(habitId)).length;
    const ratio = done / last30.length;
    messages.push(`1カ月相当(直近30件) ${habitId}: ${done}/30 (${Math.round(ratio * 100)}%)`);
    if (ratio < 0.92 || ratio > 0.98) {
      issues.push(`${habitId} の直近30日達成率が95%前後から外れています`);
    }
  }

  const chronological = [...records].sort((a, b) => a.recordSeq - b.recordSeq);
  const oneMonthStartIdx = Math.max(0, chronological.length - ONE_MONTH_WEIGHT_DAYS);
  const slumpStartIdx = Math.max(oneMonthStartIdx, chronological.length - WEIGHT_SLUMP_DAYS);
  const weightAtMonthStart = Number(chronological[oneMonthStartIdx].value);
  const weightAtSlumpStart = Number(chronological[slumpStartIdx].value);
  const weightToday = Number(chronological[chronological.length - 1].value);
  messages.push(
    `体重: 30日前 ${weightAtMonthStart}kg → 今日 ${weightToday}kg (サボ期開始 ${weightAtSlumpStart}kg)`,
  );
  if (weightAtMonthStart <= weightToday) {
    issues.push('直近30日の体重が右肩下がりになっていません');
  }
  const slumpSpan = chronological.length - slumpStartIdx;
  const preSlumpSpan = slumpStartIdx - oneMonthStartIdx;
  if (preSlumpSpan > 0 && slumpSpan > 1) {
    const preSlumpDrop =
      weightAtSlumpStart - weightAtMonthStart;
    const slumpDrop = weightToday - weightAtSlumpStart;
    const preSlumpRate = preSlumpDrop / preSlumpSpan;
    const slumpRate = slumpDrop / (slumpSpan - 1);
    messages.push(
      `体重ペース: 前半 ${preSlumpRate.toFixed(3)}kg/日, サボ期 ${slumpRate.toFixed(3)}kg/日`,
    );
    if (preSlumpRate < 0 && slumpRate <= preSlumpRate) {
      issues.push('サボ期の体重減少ペースが前半より緩やかになっていません');
    }
  }

  const startTs = endDate.getTime() - ONE_MONTH_WEIGHT_DAYS * DAY_MS;
  const endTs = endDate.getTime();
  const keyToWeight = new Map<string, number>();
  for (const record of chronological) {
    const parsed = new Date(parseWeightRecordDate(record.date, endDate));
    keyToWeight.set(formatIsoDate(parsed), Number(record.value));
  }
  const weeklyAvgs: number[] = [];
  for (
    let weekStart = startOfWeekMonday(new Date(startTs));
    weekStart.getTime() <= endTs;
    weekStart = addDays(weekStart, 7)
  ) {
    const weekEnd = addDays(weekStart, 6);
    const values: number[] = [];
    for (
      let cursor = new Date(weekStart);
      cursor.getTime() <= weekEnd.getTime();
      cursor = addDays(cursor, 1)
    ) {
      if (cursor.getTime() < startTs || cursor.getTime() > endTs) continue;
      const value = keyToWeight.get(formatIsoDate(cursor));
      if (value !== undefined) values.push(value);
    }
    if (values.length > 0) {
      weeklyAvgs.push(round1(values.reduce((sum, v) => sum + v, 0) / values.length));
    }
  }
  messages.push(`1カ月グラフ週平均: ${weeklyAvgs.join(' → ')}kg`);
  for (let i = 1; i < weeklyAvgs.length; i += 1) {
    if (weeklyAvgs[i] >= weeklyAvgs[i - 1]) {
      issues.push(
        `1カ月グラフの週平均が右肩下がりではありません: 週${i} ${weeklyAvgs[i]}kg >= 週${i - 1} ${weeklyAvgs[i - 1]}kg`,
      );
    }
  }

  const oneMonthMondays = getOneMonthCompleteWeekMondays(endDate);
  const weekToRecords = new Map<string, SeedWeightRecord[]>();
  for (const record of chronological) {
    const parsed = new Date(parseWeightRecordDate(record.date, endDate));
    const key = formatIsoDate(startOfWeekMonday(parsed));
    const bucket = weekToRecords.get(key);
    if (bucket) bucket.push(record);
    else weekToRecords.set(key, [record]);
  }

  let exerciseWins = 0;
  let morningWins = 0;
  for (const monday of oneMonthMondays) {
    const key = formatIsoDate(monday);
    const weekRecords = weekToRecords.get(key) ?? [];
    const exerciseDays = weekRecords.filter((r) => r.tags.includes(HABIT_EXERCISE)).length;
    const morningDays = weekRecords.filter((r) => r.tags.includes(HABIT_MORNING)).length;
    if (exerciseDays >= EXERCISE_WEEKLY_PLAN.frequencyCount) exerciseWins += 1;
    if (morningDays >= MORNING_WEEKLY_PLAN.frequencyCount) morningWins += 1;
  }
  messages.push(
    `1カ月完全週 運動: ${exerciseWins}/${ONE_MONTH_COMPLETE_WEEKS}, 朝活: ${morningWins}/${ONE_MONTH_COMPLETE_WEEKS}`,
  );
  if (exerciseWins !== 2) {
    issues.push(`運動の1カ月完全週達成数が50%（2/4）ではありません: ${exerciseWins}/4`);
  }
  if (morningWins !== 1) {
    issues.push(`朝活の1カ月完全週達成数が25%（1/4）ではありません: ${morningWins}/4`);
  }

  const bookMonths = new Set<string>();
  for (const record of chronological) {
    if (!record.tags.includes(HABIT_BOOK)) continue;
    const parsed = new Date(parseWeightRecordDate(record.date, endDate));
    bookMonths.add(monthKey(parsed));
  }
  const completeMonthKeys = new Set<string>();
  for (const record of chronological) {
    const parsed = new Date(parseWeightRecordDate(record.date, endDate));
    completeMonthKeys.add(monthKey(parsed));
  }
  completeMonthKeys.delete(monthKey(endDate));
  for (const key of completeMonthKeys) {
    if (!bookMonths.has(key)) {
      issues.push(`本1冊読むが完全終了月 ${key} で未達成です`);
    }
  }
  messages.push(`本1冊読む: 完全終了月 ${completeMonthKeys.size} ヶ月すべて達成`);

  return { ok: issues.length === 0, messages: [...messages, ...issues] };
}

/** 最近の記録欄と同じ順（新しい順） */
export function sortRecordsForHistory(records: SeedWeightRecord[]): SeedWeightRecord[] {
  return [...records].sort((a, b) => {
    if (a.recordSeq !== b.recordSeq) return b.recordSeq - a.recordSeq;
    return b.id.localeCompare(a.id);
  });
}

function summarizeTagStats(records: SeedWeightRecord[]): SeedYearChartDummyResult['tagStats'] {
  const total = records.length;
  const counts: Record<string, number> = {};
  for (const record of records) {
    for (const tagId of record.tags) {
      counts[tagId] = (counts[tagId] ?? 0) + 1;
    }
  }
  const stats: SeedYearChartDummyResult['tagStats'] = {};
  for (const [tagId, count] of Object.entries(counts)) {
    stats[tagId] = {
      assignedDays: count,
      rate: total === 0 ? 0 : count / total,
    };
  }
  return stats;
}

/** 体重履歴・習慣タグ関連の AsyncStorage を初期化 */
export async function clearWeightAndTagData(): Promise<void> {
  await AsyncStorage.multiRemove([
    WEIGHT_HISTORY_KEY,
    HABITS_STORAGE_KEY,
    USER_TAGS_STORAGE_KEY,
    HIDDEN_DEFAULT_TAGS_STORAGE_KEY,
    DEV_DUMMY_AUTO_SEED_KEY,
  ]);
}

/**
 * 既存の体重・タグデータを削除し、1年分のダミーデータを注入する。
 * AsyncStorage ベースのため、アプリ実行中（__DEV__）に呼び出してください。
 */
export async function seedYearChartDummyData(
  options?: {
    endDate?: Date;
    dayCount?: number;
    seed?: number;
    setProfileWeights?: boolean;
  },
): Promise<SeedYearChartDummyResult> {
  if (!__DEV__) {
    throw new Error('seedYearChartDummyData is available in __DEV__ builds only.');
  }

  const endDate = options?.endDate ?? SEED_YEAR_END_DATE;
  const dayCount = options?.dayCount ?? SEED_YEAR_DAY_COUNT;
  const seed = options?.seed ?? 20260622;

  await clearWeightAndTagData();
  await saveHabits(buildSeedYearHabits());

  const records = buildSeedYearWeightRecords(endDate, dayCount, seed);
  const historyOrder = sortRecordsForHistory(records);
  await AsyncStorage.setItem(WEIGHT_HISTORY_KEY, JSON.stringify(historyOrder));

  if (options?.setProfileWeights !== false) {
    await AsyncStorage.setItem(
      '@profile_settings',
      JSON.stringify({
        initialWeight: String(WEIGHT_START_KG),
        targetWeight: String(WEIGHT_END_KG),
      }),
    );
  }

  const startDate = buildSeedDates(endDate, dayCount)[0];
  return {
    recordCount: records.length,
    startDate: formatIsoDate(startDate),
    endDate: formatIsoDate(endDate),
    weightStartKg: WEIGHT_START_KG,
    weightEndKg: WEIGHT_END_KG,
    tagStats: summarizeTagStats(records),
  };
}

declare const global: typeof globalThis & {
  seedYearChartDummyData?: typeof seedYearChartDummyData;
};

declare const __DEV__: boolean | undefined;

if (typeof __DEV__ !== 'undefined' && __DEV__) {
  global.seedYearChartDummyData = seedYearChartDummyData;
}
