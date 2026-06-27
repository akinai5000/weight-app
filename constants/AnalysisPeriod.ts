export type AnalysisPeriod = '1w' | '1m' | '6m' | '1y' | 'custom';

export const ANALYSIS_PERIOD_OPTIONS: { key: AnalysisPeriod; label: string }[] = [
  { key: '1w', label: '1週間' },
  { key: '1m', label: '1カ月' },
  { key: '6m', label: '半年' },
  { key: '1y', label: '1年' },
  { key: 'custom', label: 'カスタム' },
];

export const DAY_MS = 86400000;

export function getPresetPeriodDays(period: Exclude<AnalysisPeriod, 'custom'>): number {
  switch (period) {
    case '1w':
      return 7;
    case '1m':
      return 30;
    case '6m':
      return 180;
    case '1y':
      return 365;
  }
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function formatAnalysisDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${y}/${m}/${dd}`;
}

export type AnalysisPeriodBounds = {
  startDate: Date;
  endDate: Date;
  startTimestamp: number;
  endTimestamp: number;
};

/** 選択中の期間プリセット／カスタム日付から、画面共通の開始・終了日を算出 */
export function resolveAnalysisPeriodBounds(
  period: AnalysisPeriod,
  customStart: Date,
  customEnd: Date,
  now: Date = new Date(),
): AnalysisPeriodBounds {
  if (period === 'custom') {
    const startDate = startOfDay(customStart);
    const endDate = endOfDay(customEnd);
    return {
      startDate,
      endDate,
      startTimestamp: startDate.getTime(),
      endTimestamp: endDate.getTime(),
    };
  }

  const days = getPresetPeriodDays(period);
  const startTimestamp = now.getTime() - days * DAY_MS;
  return {
    startDate: new Date(startTimestamp),
    endDate: now,
    startTimestamp,
    endTimestamp: now.getTime(),
  };
}

/** タイムスタンプが選択期間内か（プリセットは下限のみ、カスタムは両端） */
export function isTimestampInAnalysisPeriod(
  timestamp: number,
  period: AnalysisPeriod,
  bounds: AnalysisPeriodBounds,
): boolean {
  if (period === 'custom') {
    return timestamp >= bounds.startTimestamp && timestamp <= bounds.endTimestamp;
  }
  return timestamp >= bounds.startTimestamp;
}
