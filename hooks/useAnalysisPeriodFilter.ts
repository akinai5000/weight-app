import { useCallback, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import {
  type AnalysisPeriod,
  DAY_MS,
  isTimestampInAnalysisPeriod,
  resolveAnalysisPeriodBounds,
} from '@/constants/AnalysisPeriod';

export type AnalysisPeriodFilterState = {
  /** 選択中のプリセット（1週間 / 1カ月 / … / カスタム） */
  period: AnalysisPeriod;
  /** 画面全体で有効な開始日（00:00:00） */
  startDate: Date;
  /** 画面全体で有効な終了日（カスタム時は 23:59:59.999、プリセット時は現在） */
  endDate: Date;
  startTimestamp: number;
  endTimestamp: number;
  /** カスタム期間 UI 用 */
  customStart: Date;
  customEnd: Date;
  showStartPicker: boolean;
  showEndPicker: boolean;
  setPeriod: (period: AnalysisPeriod) => void;
  setShowStartPicker: (show: boolean) => void;
  setShowEndPicker: (show: boolean) => void;
  onChangeStartDate: (_: unknown, selected?: Date) => void;
  onChangeEndDate: (_: unknown, selected?: Date) => void;
  isTimestampInPeriod: (timestamp: number) => boolean;
};

/**
 * 分析タブの期間フィルター State を一元管理する。
 * 体重推移・習慣継続状況など、複数セクションから同じ startDate / endDate を参照できる。
 */
export function useAnalysisPeriodFilter(): AnalysisPeriodFilterState {
  const [period, setPeriod] = useState<AnalysisPeriod>('1w');
  const [customStart, setCustomStart] = useState<Date>(
    () => new Date(Date.now() - 30 * DAY_MS),
  );
  const [customEnd, setCustomEnd] = useState<Date>(() => new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const bounds = useMemo(
    () => resolveAnalysisPeriodBounds(period, customStart, customEnd),
    [period, customStart, customEnd],
  );

  const isTimestampInPeriod = useCallback(
    (timestamp: number) => isTimestampInAnalysisPeriod(timestamp, period, bounds),
    [period, bounds],
  );

  const handleSetPeriod = useCallback((next: AnalysisPeriod) => {
    setPeriod(next);
    if (next !== 'custom') {
      setShowStartPicker(false);
      setShowEndPicker(false);
    }
  }, []);

  const onChangeStartDate = useCallback((event: unknown, selected?: Date) => {
    const e = event as { type?: string };
    if (Platform.OS === 'android') {
      if (e?.type === 'dismissed') {
        setShowStartPicker(false);
        return;
      }
      if (e?.type !== 'set') return;
    }
    if (Platform.OS === 'ios' && e?.type === 'dismissed') {
      setShowStartPicker(false);
      return;
    }
    if (selected) {
      setCustomStart(selected);
      setShowStartPicker(false);
    }
  }, []);

  const onChangeEndDate = useCallback((event: unknown, selected?: Date) => {
    const e = event as { type?: string };
    if (Platform.OS === 'android') {
      if (e?.type === 'dismissed') {
        setShowEndPicker(false);
        return;
      }
      if (e?.type !== 'set') return;
    }
    if (Platform.OS === 'ios' && e?.type === 'dismissed') {
      setShowEndPicker(false);
      return;
    }
    if (selected) {
      setCustomEnd(selected);
      setShowEndPicker(false);
    }
  }, []);

  return {
    period,
    startDate: bounds.startDate,
    endDate: bounds.endDate,
    startTimestamp: bounds.startTimestamp,
    endTimestamp: bounds.endTimestamp,
    customStart,
    customEnd,
    showStartPicker,
    showEndPicker,
    setPeriod: handleSetPeriod,
    setShowStartPicker,
    setShowEndPicker,
    onChangeStartDate,
    onChangeEndDate,
    isTimestampInPeriod,
  };
}
