import { type AnalysisPeriod, DAY_MS, startOfDay } from '@/constants/AnalysisPeriod';

export type ChartGranularity = 'daily' | 'weekly' | 'monthly';

export type ChartPlotInputRecord = {
  value: number;
  timestamp: number;
};

export type ChartPlotPoint = {
  value: number;
  timestamp: number;
};

function calendarDayKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
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

function customPeriodDayCount(startDate: Date, endDate: Date): number {
  const start = startOfDay(startDate).getTime();
  const end = startOfDay(endDate).getTime();
  return Math.floor((end - start) / DAY_MS) + 1;
}

/** 期間プリセット／カスタム日数から、グラフ上の点の粒度を決定 */
export function resolveChartGranularity(
  period: AnalysisPeriod,
  startDate: Date,
  endDate: Date,
): ChartGranularity {
  if (period === '1w') return 'daily';
  if (period === '1m') return 'weekly';
  if (period === '6m' || period === '1y') return 'monthly';

  const days = customPeriodDayCount(startDate, endDate);
  if (days <= 7) return 'daily';
  if (days <= 30) return 'weekly';
  return 'monthly';
}

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * 日別最新記録を、期間・粒度に応じたプロット点に変換する。
 * - daily: 期間内の各日（その日の体重）
 * - weekly: 週頭（月曜）に週平均体重
 * - monthly: 各月1日に月平均体重
 */
export function buildChartPlotPoints(
  dailyRecords: ChartPlotInputRecord[],
  granularity: ChartGranularity,
  startDate: Date,
  endDate: Date,
): ChartPlotPoint[] {
  const startDay = startOfDay(startDate);
  const endDay = startOfDay(endDate);
  if (dailyRecords.length === 0) return [];

  if (granularity === 'daily') {
    const byDay = new Map<string, ChartPlotInputRecord>();
    for (const record of dailyRecords) {
      const key = calendarDayKey(record.timestamp);
      const prev = byDay.get(key);
      if (!prev || record.timestamp >= prev.timestamp) {
        byDay.set(key, record);
      }
    }

    const points: ChartPlotPoint[] = [];
    for (
      let cursor = startDay;
      cursor.getTime() <= endDay.getTime();
      cursor = addDays(cursor, 1)
    ) {
      const record = byDay.get(calendarDayKey(cursor.getTime()));
      if (record) {
        points.push({ value: record.value, timestamp: record.timestamp });
      }
    }
    return points;
  }

  if (granularity === 'weekly') {
    const byDay = new Map<string, ChartPlotInputRecord>();
    for (const record of dailyRecords) {
      const day = startOfDay(new Date(record.timestamp));
      if (day.getTime() < startDay.getTime() || day.getTime() > endDay.getTime()) continue;
      const key = calendarDayKey(record.timestamp);
      const prev = byDay.get(key);
      if (!prev || record.timestamp >= prev.timestamp) {
        byDay.set(key, record);
      }
    }

    const points: ChartPlotPoint[] = [];
    for (
      let weekStart = startOfWeekMonday(startDay);
      weekStart.getTime() <= endDay.getTime();
      weekStart = addDays(weekStart, 7)
    ) {
      const weekEnd = addDays(weekStart, 6);
      const values: number[] = [];
      for (
        let cursor = weekStart;
        cursor.getTime() <= weekEnd.getTime();
        cursor = addDays(cursor, 1)
      ) {
        if (cursor.getTime() < startDay.getTime() || cursor.getTime() > endDay.getTime()) continue;
        const record = byDay.get(calendarDayKey(cursor.getTime()));
        if (record) values.push(record.value);
      }
      if (values.length === 0) continue;
      points.push({
        value: average(values),
        timestamp: weekStart.getTime(),
      });
    }
    return points;
  }

  const byDay = new Map<string, ChartPlotInputRecord>();
  for (const record of dailyRecords) {
    const day = startOfDay(new Date(record.timestamp));
    if (day.getTime() < startDay.getTime() || day.getTime() > endDay.getTime()) continue;
    const key = calendarDayKey(record.timestamp);
    const prev = byDay.get(key);
    if (!prev || record.timestamp >= prev.timestamp) {
      byDay.set(key, record);
    }
  }

  const points: ChartPlotPoint[] = [];
  for (
    let monthStart = startOfMonth(startDay);
    monthStart.getTime() <= endDay.getTime();
    monthStart = addMonths(monthStart, 1)
  ) {
    const month = monthStart.getMonth();
    const year = monthStart.getFullYear();
    const values: number[] = [];
    for (
      let cursor = monthStart;
      cursor.getMonth() === month && cursor.getFullYear() === year;
      cursor = addDays(cursor, 1)
    ) {
      if (cursor.getTime() < startDay.getTime() || cursor.getTime() > endDay.getTime()) continue;
      const record = byDay.get(calendarDayKey(cursor.getTime()));
      if (record) values.push(record.value);
    }
    if (values.length === 0) continue;
    points.push({
      value: average(values),
      timestamp: monthStart.getTime(),
    });
  }
  return points;
}
