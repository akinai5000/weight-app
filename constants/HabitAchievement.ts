import {
  type AnalysisPeriod,
  getPresetPeriodDays,
  startOfDay,
} from '@/constants/AnalysisPeriod';
import { type Habit, type HabitFrequency } from '@/constants/Habits';

/** 分析用: 既知 ID の習慣は頻度を固定（ストレージが daily のまま残っていても正しく分岐） */
const KNOWN_HABIT_FREQUENCIES: Record<
  string,
  { frequency: HabitFrequency; frequencyCount?: number }
> = {
  def_exercise: { frequency: 'weekly', frequencyCount: 3 },
  hab_morning: { frequency: 'weekly', frequencyCount: 4 },
  hab_book_monthly: { frequency: 'monthly', frequencyCount: 1 },
};

export function normalizeHabitForAchievement(habit: Habit): Habit {
  const known = KNOWN_HABIT_FREQUENCIES[habit.id];
  if (!known) return habit;
  return { ...habit, ...known };
}

export type HabitAchievementResult = {
  done: number;
  total: number;
  ratio: number;
  percent: number;
  achievementText: string;
  /** 期間内に集計対象がない月次習慣など */
  hidden?: boolean;
};

export type HabitDoneLookup = (habitId: string, dayKey: string) => boolean;

function calendarDayKeyFromDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfWeekMonday(date: Date): Date {
  const d = startOfDay(date);
  const weekday = d.getDay();
  const delta = (weekday + 6) % 7;
  d.setDate(d.getDate() - delta);
  return d;
}

function startOfMonth(date: Date): Date {
  const d = startOfDay(date);
  d.setDate(1);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function countInclusiveDays(startDay: Date, endDay: Date): number {
  const msPerDay = 86400000;
  return Math.floor((endDay.getTime() - startDay.getTime()) / msPerDay) + 1;
}

/** 体重グラフと同じ期間（今日を含む直近 N 日） */
export function getAnalysisPeriodDayBounds(
  period: AnalysisPeriod,
  startDate: Date,
  endDate: Date,
): { startDay: Date; endDay: Date; totalDays: number } {
  const endDay = startOfDay(endDate);
  if (period === 'custom') {
    const startDay = startOfDay(startDate);
    return {
      startDay,
      endDay,
      totalDays: countInclusiveDays(startDay, endDay),
    };
  }
  const presetDays = getPresetPeriodDays(period);
  const startDay = addDays(endDay, -(presetDays - 1));
  return { startDay, endDay, totalDays: presetDays };
}

function isWeekAchieved(
  habit: Habit,
  weekStart: Date,
  isDoneOnDayKey: HabitDoneLookup,
): boolean {
  const required = habit.frequencyCount ?? 1;
  let doneDays = 0;
  for (let i = 0; i < 7; i += 1) {
    const day = addDays(weekStart, i);
    if (isDoneOnDayKey(habit.id, calendarDayKeyFromDate(day))) doneDays += 1;
  }
  return doneDays >= required;
}

function isMonthAchieved(
  habit: Habit,
  monthStart: Date,
  isDoneOnDayKey: HabitDoneLookup,
): boolean {
  const required = habit.frequencyCount ?? 1;
  let doneDays = 0;
  const month = monthStart.getMonth();
  for (
    let cursor = startOfDay(monthStart);
    cursor.getMonth() === month;
    cursor = addDays(cursor, 1)
  ) {
    if (isDoneOnDayKey(habit.id, calendarDayKeyFromDate(cursor))) doneDays += 1;
  }
  return doneDays >= required;
}

/** 進行中の「今週」の直前 = 最後に完全終了した週の月曜 */
function getLastCompleteWeekMonday(referenceDay: Date): Date {
  return addDays(startOfWeekMonday(referenceDay), -7);
}

/** 進行中の「今月」の直前 = 最後に完全終了した月の1日 */
function getLastCompleteMonthStart(referenceDay: Date): Date {
  return addMonths(startOfMonth(referenceDay), -1);
}

function endOfMonth(date: Date): Date {
  return addDays(addMonths(startOfMonth(date), 1), -1);
}

function getPresetCompleteWeekCount(period: Exclude<AnalysisPeriod, 'custom'>): number {
  switch (period) {
    case '1w':
      return 1;
    case '1m':
      return 4;
    case '6m':
      return 26;
    case '1y':
      return 52;
  }
}

/** プリセット: 直近 N 週（完全終了週のみ）。カスタム: 期間内の完全終了週 */
function getCompleteWeekStarts(
  period: AnalysisPeriod,
  startDate: Date,
  endDate: Date,
  referenceDay: Date,
): Date[] {
  const lastCompleteMonday = getLastCompleteWeekMonday(referenceDay);

  if (period !== 'custom') {
    const weekCount = getPresetCompleteWeekCount(period);
    const weeks: Date[] = [];
    let weekStart = lastCompleteMonday;
    for (let i = 0; i < weekCount; i += 1) {
      weeks.unshift(weekStart);
      weekStart = addDays(weekStart, -7);
    }
    return weeks;
  }

  const startDay = startOfDay(startDate);
  const endDay = startOfDay(endDate);
  const weeks: Date[] = [];
  for (let weekStart = lastCompleteMonday; ; weekStart = addDays(weekStart, -7)) {
    const weekEnd = addDays(weekStart, 6);
    if (weekEnd.getTime() < startDay.getTime()) break;
    if (weekStart.getTime() >= startDay.getTime() && weekEnd.getTime() <= endDay.getTime()) {
      weeks.unshift(weekStart);
    }
  }
  return weeks;
}

function getPresetCompleteMonthCount(period: Exclude<AnalysisPeriod, 'custom'>): number {
  switch (period) {
    case '1w':
      return 0;
    case '1m':
      return 1;
    case '6m':
      return 5;
    case '1y':
      return 12;
  }
}

/** プリセット: 直近 N ヶ月（完全終了月のみ）。カスタム: 期間内の完全終了月 */
function getCompleteMonthStarts(
  period: AnalysisPeriod,
  startDate: Date,
  endDate: Date,
  referenceDay: Date,
): Date[] {
  const lastCompleteMonth = getLastCompleteMonthStart(referenceDay);

  if (period !== 'custom') {
    const monthCount = getPresetCompleteMonthCount(period);
    const months: Date[] = [];
    let monthStart = lastCompleteMonth;
    for (let i = 0; i < monthCount; i += 1) {
      months.unshift(monthStart);
      monthStart = addMonths(monthStart, -1);
    }
    return months;
  }

  const startDay = startOfDay(startDate);
  const endDay = startOfDay(endDate);
  const months: Date[] = [];
  for (let monthStart = lastCompleteMonth; ; monthStart = addMonths(monthStart, -1)) {
    const monthEnd = endOfMonth(monthStart);
    if (monthEnd.getTime() < startDay.getTime()) break;
    if (monthStart.getTime() >= startDay.getTime() && monthEnd.getTime() <= endDay.getTime()) {
      months.unshift(monthStart);
    }
  }
  return months;
}

function buildAchievementResult(
  done: number,
  total: number,
  unit: '日' | '週' | 'ヶ月',
  hidden = false,
): HabitAchievementResult {
  const ratio = total === 0 ? 0 : done / total;
  return {
    done,
    total,
    ratio,
    percent: hidden ? 0 : Math.round(ratio * 100),
    achievementText: hidden ? '-' : `${done} / ${total}${unit}`,
    hidden,
  };
}

function buildHiddenAchievementResult(): HabitAchievementResult {
  return {
    done: 0,
    total: 0,
    ratio: 0,
    percent: 0,
    achievementText: '- / -',
    hidden: true,
  };
}

/** 【毎日】日単位ベース（期間フィルターと整合） */
export function computeDailyHabitAchievement(
  habit: Habit,
  period: AnalysisPeriod,
  startDate: Date,
  endDate: Date,
  isDoneOnDayKey: HabitDoneLookup,
): HabitAchievementResult {
  const { startDay, endDay, totalDays } = getAnalysisPeriodDayBounds(period, startDate, endDate);
  let done = 0;
  for (
    let cursor = startDay;
    cursor.getTime() <= endDay.getTime();
    cursor = addDays(cursor, 1)
  ) {
    if (isDoneOnDayKey(habit.id, calendarDayKeyFromDate(cursor))) done += 1;
  }
  return buildAchievementResult(done, totalDays, '日');
}

/** 【週x回】完全終了した過去の週のみ（今週は除外） */
export function computeWeeklyHabitAchievement(
  habit: Habit,
  period: AnalysisPeriod,
  startDate: Date,
  endDate: Date,
  referenceDay: Date,
  isDoneOnDayKey: HabitDoneLookup,
): HabitAchievementResult {
  const weekStarts = getCompleteWeekStarts(period, startDate, endDate, referenceDay);
  let doneWeeks = 0;
  for (const weekStart of weekStarts) {
    if (isWeekAchieved(habit, weekStart, isDoneOnDayKey)) doneWeeks += 1;
  }
  return buildAchievementResult(doneWeeks, weekStarts.length, '週');
}

/** 【月x回】完全終了した過去の月のみ（今月は除外） */
export function computeMonthlyHabitAchievement(
  habit: Habit,
  period: AnalysisPeriod,
  startDate: Date,
  endDate: Date,
  referenceDay: Date,
  isDoneOnDayKey: HabitDoneLookup,
): HabitAchievementResult {
  if (period === '1w') {
    return buildHiddenAchievementResult();
  }

  const monthStarts = getCompleteMonthStarts(period, startDate, endDate, referenceDay);
  if (monthStarts.length === 0) {
    return buildHiddenAchievementResult();
  }

  let doneMonths = 0;
  for (const monthStart of monthStarts) {
    if (isMonthAchieved(habit, monthStart, isDoneOnDayKey)) doneMonths += 1;
  }
  return buildAchievementResult(doneMonths, monthStarts.length, 'ヶ月');
}

export function computeHabitAchievementInPeriod(
  habit: Habit,
  period: AnalysisPeriod,
  startDate: Date,
  endDate: Date,
  isDoneOnDayKey: HabitDoneLookup,
  referenceDay: Date = endDate,
): HabitAchievementResult {
  const resolved = normalizeHabitForAchievement(habit);

  switch (resolved.frequency) {
    case 'daily':
      return computeDailyHabitAchievement(
        resolved,
        period,
        startDate,
        endDate,
        isDoneOnDayKey,
      );
    case 'weekly':
      return computeWeeklyHabitAchievement(
        resolved,
        period,
        startDate,
        endDate,
        referenceDay,
        isDoneOnDayKey,
      );
    case 'monthly':
      return computeMonthlyHabitAchievement(
        resolved,
        period,
        startDate,
        endDate,
        referenceDay,
        isDoneOnDayKey,
      );
  }
}

export function getCompletionMark(ratio: number): string {
  if (ratio >= 1) return '🔥';
  if (ratio >= 0.7) return '☀️';
  if (ratio >= 0.3) return '☁️';
  return '☔';
}

export function computeHabitStreak(
  habit: Habit,
  isDoneOnDayKey: HabitDoneLookup,
  referenceDay: Date = new Date(),
): number {
  const resolved = normalizeHabitForAchievement(habit);
  const today = startOfDay(referenceDay);

  if (resolved.frequency === 'daily') {
    let streak = 0;
    for (let cursor = today; ; cursor = addDays(cursor, -1)) {
      if (!isDoneOnDayKey(habit.id, calendarDayKeyFromDate(cursor))) break;
      streak += 1;
    }
    return streak;
  }

  if (resolved.frequency === 'weekly') {
    let streak = 0;
    for (
      let weekCursor = getLastCompleteWeekMonday(today);
      ;
      weekCursor = addDays(weekCursor, -7)
    ) {
      if (!isWeekAchieved(resolved, weekCursor, isDoneOnDayKey)) break;
      streak += 1;
    }
    return streak;
  }

  let streak = 0;
  for (
    let monthCursor = getLastCompleteMonthStart(today);
    ;
    monthCursor = addMonths(monthCursor, -1)
  ) {
    if (!isMonthAchieved(resolved, monthCursor, isDoneOnDayKey)) break;
    streak += 1;
  }
  return streak;
}
