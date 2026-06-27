import { DAY_MS, startOfDay } from '@/constants/AnalysisPeriod';

export type WeightDayPoint = {
  value: number;
  timestamp: number;
};

/** 到達見込み日あり（日付を大きく表示） */
export type GoalForecastWithDate = {
  kind: 'forecast';
  prefix: 'このペースだと ';
  date: string;
  suffix: ' に目標到達！';
};

/** その他の案内文（1行表示） */
export type GoalForecastPlain = {
  kind: 'plain';
  message: string;
};

export type GoalForecastResult = GoalForecastWithDate | GoalForecastPlain;

function calendarDayKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 同一日はタイムスタンプが最も新しい記録のみ */
function aggregateLatestPerCalendarDay(records: WeightDayPoint[]): WeightDayPoint[] {
  if (records.length === 0) return [];
  const byDay = new Map<string, WeightDayPoint>();
  for (const r of records) {
    const key = calendarDayKey(r.timestamp);
    const prev = byDay.get(key);
    if (!prev || r.timestamp >= prev.timestamp) {
      byDay.set(key, r);
    }
  }
  return Array.from(byDay.values()).sort((a, b) => a.timestamp - b.timestamp);
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function calendarDaysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);
}

function formatJapaneseDate(d: Date): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function findWeightOnOrBefore(daily: WeightDayPoint[], refDay: Date): WeightDayPoint | null {
  const refTs = startOfDay(refDay).getTime();
  let best: WeightDayPoint | null = null;
  for (const r of daily) {
    const dayTs = startOfDay(new Date(r.timestamp)).getTime();
    if (dayTs <= refTs) best = r;
    else break;
  }
  return best;
}

const PLACEHOLDER_DATE = 'ーー年ーー月ーー日';

function forecastResult(date: string): GoalForecastWithDate {
  return {
    kind: 'forecast',
    prefix: 'このペースだと ',
    date,
    suffix: ' に目標到達！',
  };
}

function plainResult(message: string): GoalForecastPlain {
  return { kind: 'plain', message };
}

/**
 * 目標到達見込み日を算出（表示注記は常に直近30日固定、内部ロジックは蓄積日数で切替）。
 */
export function computeGoalForecast(
  records: WeightDayPoint[],
  targetWeight: number,
): GoalForecastResult {
  const daily = aggregateLatestPerCalendarDay(records);
  if (daily.length === 0) {
    return plainResult('データを蓄積中です');
  }

  const latest = daily[daily.length - 1];
  const latestWeight = latest.value;
  const latestDay = startOfDay(new Date(latest.timestamp));
  const today = startOfDay(new Date());

  const remainingKg = latestWeight - targetWeight;
  if (remainingKg <= 0) {
    return plainResult('目標に到達しています！');
  }

  const first = daily[0];
  const firstDay = startOfDay(new Date(first.timestamp));
  const elapsedDays = calendarDaysBetween(firstDay, latestDay);

  if (elapsedDays <= 0) {
    return plainResult('データを蓄積中です');
  }

  let dailyPace: number;

  if (elapsedDays < 30) {
    dailyPace = (latestWeight - first.value) / elapsedDays;
  } else {
    const refDay = addDays(latestDay, -30);
    const refRecord = findWeightOnOrBefore(daily, refDay);
    if (!refRecord) {
      return forecastResult(PLACEHOLDER_DATE);
    }
    dailyPace = (latestWeight - refRecord.value) / 30;
  }

  if (dailyPace >= 0) {
    return plainResult('現在のペースでは目標に到達できません');
  }

  const daysToGoal = remainingKg / (-dailyPace);
  if (!Number.isFinite(daysToGoal) || daysToGoal <= 0) {
    return plainResult('現在のペースでは目標に到達できません');
  }

  const forecastDate = addDays(today, Math.ceil(daysToGoal));
  return forecastResult(formatJapaneseDate(forecastDate));
}
