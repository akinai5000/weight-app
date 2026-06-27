import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  GestureResponderEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, {
  Circle,
  G,
  Line as SvgLine,
  Path,
  Text as SvgText,
} from 'react-native-svg';

import { useThemeColor } from '@/components/ThemeContext';
import { parseWeightRecordDate } from '@/constants/WeightRecordDate';
import {
  ANALYSIS_PERIOD_OPTIONS,
  formatAnalysisDate,
  startOfDay,
} from '@/constants/AnalysisPeriod';
import {
  buildChartPlotPoints,
  resolveChartGranularity,
} from '@/constants/ChartPlotAggregation';
import { getCalendarPickerLocale } from '@/constants/DeviceLocale';
import { computeGoalForecast } from '@/constants/GoalForecast';
import {
  computeHabitAchievementInPeriod,
  computeHabitStreak,
  getCompletionMark,
  normalizeHabitForAchievement,
} from '@/constants/HabitAchievement';
import { type Habit, loadHabits } from '@/constants/Habits';
import { useAnalysisPeriodFilter } from '@/hooks/useAnalysisPeriodFilter';

/** 計算対象外時: 天気アイコンと同幅の全角スペース */
const HABIT_MARK_PLACEHOLDER = '\u3000';

type WeightRecord = { id: string; value: string; date: string; tags?: string[] };

type ParsedRecord = {
  id: string;
  value: number;
  timestamp: number;
  dateLabel: string;
  tags: string[];
};

type ChartPoint = {
  x: number;
  y: number;
  value: number;
  timestamp: number;
};

const DAY_MS = 86400000;

function parseRecordDate(dateStr: string, now: Date): number {
  return parseWeightRecordDate(dateStr, now);
}

function formatTooltipDate(ts: number): string {
  const d = new Date(ts);
  const m = d.getMonth() + 1;
  const dd = d.getDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${m}/${dd} ${hh}:${mm}`;
}

function buildSmoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x} ${p.y}`;
  }
  const segments = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const midX = (p0.x + p1.x) / 2;
    segments.push(`C ${midX} ${p0.y} ${midX} ${p1.y} ${p1.x} ${p1.y}`);
  }
  return segments.join(' ');
}

/** ローカル日付で同一日をまとめるキー */
function calendarDayKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 同一日はタイムスタンプが最も新しい記録のみ（グラフ用） */
function aggregateLatestPerCalendarDay(records: ParsedRecord[]): ParsedRecord[] {
  if (records.length === 0) return [];
  const byDay = new Map<string, ParsedRecord>();
  for (const r of records) {
    const key = calendarDayKey(r.timestamp);
    const prev = byDay.get(key);
    if (!prev || r.timestamp >= prev.timestamp) {
      byDay.set(key, r);
    }
  }
  return Array.from(byDay.values()).sort((a, b) => a.timestamp - b.timestamp);
}

/** カスタム期間カードのみ（他タブと揃えたライト基調） */
const CUSTOM_PERIOD = {
  sectionBg: '#E8E8ED',
  cardBg: '#FFFFFF',
  border: '#D1D1D6',
  borderStrong: '#C7C7CC',
  hairline: '#E5E5EA',
  dateChipBg: '#F2F2F7',
} as const;

/** インラインカレンダー用（白飛び対策でダーク表示） */
const CUSTOM_PICKER_SURFACE = '#1C1C1E';
const CUSTOM_PICKER_BORDER = '#3A3A3C';

/** 期間フィルター選択中（水色テーマでも文字が読める濃色） */
const PERIOD_SEGMENT_ACTIVE_BG = '#0066CC';
const PERIOD_SEGMENT_ACTIVE_TEXT = '#FFFFFF';

export default function TabTwoScreen() {
  const { color: themeColor } = useThemeColor();

  const [history, setHistory] = useState<WeightRecord[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [initialWeight, setInitialWeight] = useState<number | null>(null);
  const [targetWeight, setTargetWeight] = useState<number | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const {
    period,
    startDate,
    endDate,
    customStart,
    customEnd,
    showStartPicker,
    showEndPicker,
    setPeriod,
    setShowStartPicker,
    setShowEndPicker,
    onChangeStartDate,
    onChangeEndDate,
    isTimestampInPeriod,
  } = useAnalysisPeriodFilter();

  const calendarLocale = useMemo(() => getCalendarPickerLocale(), []);

  const openStartDatePicker = useCallback(() => {
    setShowEndPicker(false);
    setShowStartPicker(true);
  }, [setShowEndPicker, setShowStartPicker]);

  const openEndDatePicker = useCallback(() => {
    setShowStartPicker(false);
    setShowEndPicker(true);
  }, [setShowEndPicker, setShowStartPicker]);

  const loadData = useCallback(async () => {
    try {
      const savedData = await AsyncStorage.getItem('@weight_history');
      const savedProfile = await AsyncStorage.getItem('@profile_settings');
      const loadedHabits = await loadHabits();
      setHistory(savedData ? JSON.parse(savedData) : []);
      setHabits(loadedHabits);
      if (savedProfile) {
        const profile = JSON.parse(savedProfile) as {
          initialWeight?: string;
          targetWeight?: string;
          longTermGoal?: string;
          shortTermGoal?: string;
        };
        const rawIW = profile.initialWeight ?? '';
        const iw = parseFloat(rawIW.toString().replace(/,/g, ''));
        setInitialWeight(Number.isFinite(iw) && iw > 0 ? iw : null);

        const raw =
          profile.targetWeight ?? profile.longTermGoal ?? profile.shortTermGoal ?? '';
        const tw = parseFloat(raw.toString().replace(/,/g, ''));
        setTargetWeight(Number.isFinite(tw) && tw > 0 ? tw : null);
      } else {
        setInitialWeight(null);
        setTargetWeight(null);
      }
    } catch (e) {
      console.log('analysis load failed', e);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const parsedRecords: ParsedRecord[] = useMemo(() => {
    const now = new Date();
    return history
      .map((r) => {
        const numeric = parseFloat((r.value ?? '').toString().replace(/,/g, ''));
        return {
          id: r.id,
          value: Number.isFinite(numeric) ? numeric : NaN,
          timestamp: parseRecordDate(r.date, now),
          dateLabel: r.date,
          tags: Array.isArray(r.tags)
            ? r.tags.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
            : [],
        };
      })
      .filter((r) => Number.isFinite(r.value))
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [history]);

  /**
   * 日別に「その日にどの習慣タグが達成されたか」を集計（全体ログから算出）。
   * streak（連続継続数）はこの全体ログから逆算する。
   */
  const dayToHabitDoneMap = useMemo(() => {
    const byDay = new Map<string, Set<string>>();
    for (const r of parsedRecords) {
      const key = calendarDayKey(r.timestamp);
      let set = byDay.get(key);
      if (!set) {
        set = new Set<string>();
        byDay.set(key, set);
      }
      for (const tagId of r.tags) set.add(tagId);
    }
    return byDay;
  }, [parsedRecords]);

  const filteredRecords: ParsedRecord[] = useMemo(() => {
    if (parsedRecords.length === 0) return [];
    return parsedRecords.filter((r) => isTimestampInPeriod(r.timestamp));
  }, [parsedRecords, isTimestampInPeriod, startDate, endDate]);

  /** グラフは同一日の最新1件に集約（垂直に重なる折れ線を解消） */
  const chartRecords: ParsedRecord[] = useMemo(
    () => aggregateLatestPerCalendarDay(filteredRecords),
    [filteredRecords],
  );

  const chartGranularity = useMemo(
    () => resolveChartGranularity(period, startDate, endDate),
    [period, startDate, endDate],
  );

  const chartPlotRecords = useMemo(
    () => buildChartPlotPoints(chartRecords, chartGranularity, startDate, endDate),
    [chartRecords, chartGranularity, startDate, endDate],
  );

  useEffect(() => {
    setActiveIndex(null);
  }, [chartPlotRecords]);

  const chartCardWidth = Dimensions.get('window').width * 0.9;
  const chartWidth = chartCardWidth - 24;
  const chartHeight = 220;
  const padding = { top: 16, right: 12, bottom: 28, left: 40 };
  const plotW = chartWidth - padding.left - padding.right;
  const plotH = chartHeight - padding.top - padding.bottom;

  const chartValues = chartPlotRecords.map((r) => r.value);
  const allValues = [...chartValues];
  const rawMin = allValues.length > 0 ? Math.min(...allValues) : 0;
  const rawMax = allValues.length > 0 ? Math.max(...allValues) : 0;
  const padY = (rawMax - rawMin) * 0.15 || 1;
  const yMin = rawMin - padY;
  const yMax = rawMax + padY;
  const yRange = yMax - yMin || 1;

  const minTs = chartPlotRecords.length > 0 ? chartPlotRecords[0].timestamp : 0;
  const maxTs =
    chartPlotRecords.length > 0
      ? chartPlotRecords[chartPlotRecords.length - 1].timestamp
      : 0;
  const tsRange = maxTs - minTs || 1;

  const points: ChartPoint[] = useMemo(() => {
    return chartPlotRecords.map((r) => {
      const x =
        chartPlotRecords.length === 1
          ? padding.left + plotW / 2
          : padding.left + ((r.timestamp - minTs) / tsRange) * plotW;
      const y = padding.top + plotH * (1 - (r.value - yMin) / yRange);
      return { x, y, value: r.value, timestamp: r.timestamp };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartPlotRecords, plotW, plotH, yMin, yRange, minTs, tsRange]);

  const pathD = useMemo(
    () => buildSmoothPath(points.map((p) => ({ x: p.x, y: p.y }))),
    [points],
  );

  const yTickCount = 4;
  const yTicks = useMemo(() => {
    const arr: number[] = [];
    for (let i = 0; i <= yTickCount; i++) {
      const v = yMin + (yRange * i) / yTickCount;
      arr.push(v);
    }
    return arr;
  }, [yMin, yRange]);

  const xLabelIndices = useMemo(() => {
    const n = chartPlotRecords.length;
    if (n === 0) return [];
    if (n <= 4) return Array.from({ length: n }, (_, i) => i);
    return [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1];
  }, [chartPlotRecords.length]);

  const onTapChart = (e: GestureResponderEvent) => {
    if (points.length === 0) return;
    const x = e.nativeEvent.locationX;
    let nearest = 0;
    let minDist = Infinity;
    for (let i = 0; i < points.length; i++) {
      const d = Math.abs(points[i].x - x);
      if (d < minDist) {
        minDist = d;
        nearest = i;
      }
    }
    setActiveIndex((prev) => (prev === nearest ? null : nearest));
  };

  const activePoint =
    activeIndex !== null && points[activeIndex] ? points[activeIndex] : null;
  const tooltipWidth = Math.min(chartWidth - 16, 280);

  const habitStatuses = useMemo(() => {
    const isDoneOnDayKey = (habitId: string, dayKey: string): boolean => {
      const s = dayToHabitDoneMap.get(dayKey);
      return s ? s.has(habitId) : false;
    };

    const referenceDay = startOfDay(endDate);

    return habits.map((habit) => {
      const resolved = normalizeHabitForAchievement(habit);
      const r = computeHabitAchievementInPeriod(
        habit,
        period,
        startDate,
        endDate,
        isDoneOnDayKey,
        referenceDay,
      );
      const streakCount = computeHabitStreak(habit, isDoneOnDayKey, referenceDay);
      const mark = r.hidden ? HABIT_MARK_PLACEHOLDER : getCompletionMark(r.ratio);
      const streakText =
        resolved.frequency === 'daily'
          ? `${streakCount}日継続中`
          : resolved.frequency === 'weekly'
            ? `${streakCount}週継続中`
            : `${streakCount}ヶ月継続中`;

      return {
        habit,
        mark,
        streakCount,
        streakText,
        completionPercent: r.percent,
        achievementText: r.achievementText,
        achievementHidden: r.hidden === true,
      };
    });
  }, [dayToHabitDoneMap, habits, period, startDate, endDate]);

  const latestWeightInHistory =
    parsedRecords.length > 0 ? parsedRecords[parsedRecords.length - 1].value : null;
  /** 初期から: 設定タブの初期体重 → 最新記録体重（期間フィルター非依存） */
  const initialToLatestDiffKg =
    initialWeight !== null && latestWeightInHistory !== null
      ? latestWeightInHistory - initialWeight
      : null;
  const initialToLatestText =
    initialToLatestDiffKg !== null
      ? `${initialToLatestDiffKg >= 0 ? '+' : ''}${initialToLatestDiffKg.toFixed(1)}kg`
      : null;

  const kgToGoal =
    targetWeight !== null && latestWeightInHistory !== null
      ? latestWeightInHistory - targetWeight
      : null;
  const kgToGoalRounded = kgToGoal !== null ? parseFloat(kgToGoal.toFixed(1)) : null;
  const goalRemainingText =
    kgToGoalRounded === null
      ? null
      : kgToGoalRounded > 0
        ? `あと ${kgToGoalRounded.toFixed(1)}kg`
        : '目標達成';

  const goalForecast = useMemo(() => {
    if (targetWeight === null || parsedRecords.length === 0) return null;
    return computeGoalForecast(parsedRecords, targetWeight);
  }, [parsedRecords, targetWeight]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[0]}
      >
        <View style={styles.stickyFilterHeader}>
          <View style={styles.segmentedControl}>
            {ANALYSIS_PERIOD_OPTIONS.map((opt) => {
              const active = opt.key === period;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.segment, active && styles.segmentActive]}
                  activeOpacity={0.85}
                  onPress={() => setPeriod(opt.key)}
                >
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {period === 'custom' && (
          <View
            style={{
              width: '90%',
              marginBottom: 12,
              backgroundColor: CUSTOM_PERIOD.sectionBg,
              borderRadius: 16,
              padding: 10,
              borderWidth: 1,
              borderColor: CUSTOM_PERIOD.border,
            }}
          >
            <View
              style={{
                backgroundColor: CUSTOM_PERIOD.cardBg,
                borderRadius: 14,
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderWidth: 1,
                borderColor: CUSTOM_PERIOD.borderStrong,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.08,
                shadowRadius: 8,
                elevation: 3,
              }}
            >
              <View
                style={[
                  styles.customRow,
                  {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: CUSTOM_PERIOD.hairline,
                  },
                ]}
              >
                <Text style={styles.customLabel}>開始日</Text>
                <TouchableOpacity
                  onPress={openStartDatePicker}
                  style={styles.customDateBtn}
                  activeOpacity={0.7}
                >
                  <Text style={styles.customDateText}>{formatAnalysisDate(customStart)}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.customRow}>
                <Text style={styles.customLabel}>終了日</Text>
                <TouchableOpacity
                  onPress={openEndDatePicker}
                  style={styles.customDateBtn}
                  activeOpacity={0.7}
                >
                  <Text style={styles.customDateText}>{formatAnalysisDate(customEnd)}</Text>
                </TouchableOpacity>
              </View>
              {showStartPicker && (
                <View
                  style={{
                    marginTop: 10,
                    borderRadius: 12,
                    overflow: 'hidden',
                    backgroundColor: CUSTOM_PICKER_SURFACE,
                    borderWidth: 1,
                    borderColor: CUSTOM_PICKER_BORDER,
                  }}
                >
                  <DateTimePicker
                    value={customStart}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'inline' : 'default'}
                    locale={calendarLocale}
                    onChange={onChangeStartDate}
                    maximumDate={customEnd}
                    themeVariant="dark"
                  />
                </View>
              )}
              {showEndPicker && (
                <View
                  style={{
                    marginTop: 10,
                    borderRadius: 12,
                    overflow: 'hidden',
                    backgroundColor: CUSTOM_PICKER_SURFACE,
                    borderWidth: 1,
                    borderColor: CUSTOM_PICKER_BORDER,
                  }}
                >
                  <DateTimePicker
                    value={customEnd}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'inline' : 'default'}
                    locale={calendarLocale}
                    onChange={onChangeEndDate}
                    minimumDate={customStart}
                    maximumDate={new Date()}
                    themeVariant="dark"
                  />
                </View>
              )}
            </View>
          </View>
        )}

        <View style={[styles.chartCard, { width: chartCardWidth }]}>
          <View style={styles.chartHeader}>
            <Text style={styles.chartTitle}>体重推移</Text>
          </View>

          {filteredRecords.length > 0 && chartPlotRecords.length > 0 ? (
            <View style={{ width: chartWidth, height: chartHeight }}>
              <Pressable
                onPress={onTapChart}
                style={{ width: chartWidth, height: chartHeight }}
              >
                <Svg width={chartWidth} height={chartHeight}>
                  {yTicks.map((v, i) => {
                    const y = padding.top + plotH * (1 - (v - yMin) / yRange);
                    return (
                      <G key={`y-${i}`}>
                        <SvgLine
                          x1={padding.left}
                          y1={y}
                          x2={chartWidth - padding.right}
                          y2={y}
                          stroke="#E5E5EA"
                          strokeWidth={1}
                          strokeDasharray="3 4"
                        />
                        <SvgText
                          x={padding.left - 6}
                          y={y + 3}
                          fontSize={10}
                          fill="#8E8E93"
                          textAnchor="end"
                        >
                          {v.toFixed(1)}
                        </SvgText>
                      </G>
                    );
                  })}

                  {xLabelIndices.map((idx) => {
                    const p = points[idx];
                    if (!p) return null;
                    const d = new Date(chartPlotRecords[idx].timestamp);
                    const label = `${d.getMonth() + 1}/${d.getDate()}`;
                    return (
                      <SvgText
                        key={`x-${idx}`}
                        x={p.x}
                        y={chartHeight - 8}
                        fontSize={10}
                        fill="#8E8E93"
                        textAnchor="middle"
                      >
                        {label}
                      </SvgText>
                    );
                  })}

                  {pathD ? (
                    <Path
                      d={pathD}
                      stroke={themeColor}
                      strokeWidth={2.5}
                      fill="none"
                    />
                  ) : null}

                  {points.map((p, i) => (
                    <G key={`dot-${i}`}>
                      <Circle
                        cx={p.x}
                        cy={p.y}
                        r={4}
                        fill={themeColor}
                        stroke="#FFFFFF"
                        strokeWidth={2}
                      />
                    </G>
                  ))}

                  {activePoint && (
                    <G>
                      <SvgLine
                        x1={activePoint.x}
                        y1={padding.top}
                        x2={activePoint.x}
                        y2={padding.top + plotH}
                        stroke={themeColor}
                        strokeWidth={1}
                        opacity={0.5}
                      />
                      <Circle
                        cx={activePoint.x}
                        cy={activePoint.y}
                        r={6}
                        fill={themeColor}
                        stroke="#FFFFFF"
                        strokeWidth={1.5}
                      />
                      <Circle
                        cx={activePoint.x}
                        cy={activePoint.y}
                        r={3}
                        fill="#FFFFFF"
                      />
                    </G>
                  )}
                </Svg>
              </Pressable>

              {activePoint && (
                <View
                  style={[
                    styles.tooltip,
                    {
                      width: tooltipWidth,
                      left: Math.min(
                        Math.max(activePoint.x - tooltipWidth / 2, 0),
                        chartWidth - tooltipWidth,
                      ),
                    },
                  ]}
                  pointerEvents="none"
                >
                  <Text style={styles.tooltipValue}>
                    {activePoint.value.toFixed(1)} kg
                  </Text>
                  <Text style={styles.tooltipDate}>
                    {formatTooltipDate(activePoint.timestamp)}
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>今日の体重を記録しましょう！</Text>
            </View>
          )}

          {filteredRecords.length > 0 && (
            <Text style={styles.chartHint}>グラフ内の点をタップすると詳細を表示します</Text>
          )}

          {filteredRecords.length > 0 && (initialToLatestText !== null || goalRemainingText !== null) && (
            <View style={styles.achievementSection}>
              <View style={styles.achievementCardsRow}>
                {initialToLatestText !== null && (
                  <View style={styles.achievementMiniCard}>
                    <Text style={styles.achievementMiniLabel}>初期から</Text>
                    <Text style={styles.achievementMiniValue}>{initialToLatestText}</Text>
                  </View>
                )}
                {goalRemainingText !== null && (
                  <View style={styles.achievementMiniCard}>
                    <Text style={styles.achievementMiniLabel}>目標まで</Text>
                    <Text style={styles.achievementMiniValue}>{goalRemainingText}</Text>
                  </View>
                )}
              </View>

              {goalForecast !== null && (
                <View style={styles.achievementForecast}>
                  <View style={styles.achievementForecastDivider} />
                  <Text style={styles.achievementForecastTitle}>🏆 目標到達見込み</Text>
                  <Text style={styles.achievementForecastNote}>
                    ※直近30日間のデータを基に算出
                  </Text>
                  {goalForecast.kind === 'forecast' ? (
                    <Text style={styles.achievementForecastLine} numberOfLines={1}>
                      {goalForecast.prefix}
                      <Text style={styles.achievementForecastDateBadgeText}>
                        {goalForecast.date}
                      </Text>
                      {goalForecast.suffix}
                    </Text>
                  ) : (
                    <Text style={styles.achievementForecastPlain}>{goalForecast.message}</Text>
                  )}
                </View>
              )}
            </View>
          )}
        </View>

        <View style={styles.habitSectionWrap}>
          <Text style={styles.habitSectionTitle}>習慣継続状況</Text>

          {habits.length === 0 ? (
            <Text style={styles.habitEmptyText}>習慣がまだありません。</Text>
          ) : (
            habitStatuses.map(
              ({ habit, mark, streakText, completionPercent, achievementText, achievementHidden }) => (
              <View key={habit.id} style={styles.habitRow}>
                <View style={styles.habitColTag}>
                  <Text style={styles.habitTagText} numberOfLines={1} ellipsizeMode="tail">
                    {habit.name}
                  </Text>
                </View>
                <View style={styles.habitColStreak}>
                  <View style={styles.habitColMark}>
                    <Text style={styles.habitMarkText}>{mark}</Text>
                  </View>
                  <View style={styles.habitColStreakText}>
                    <Text style={styles.habitStreakText} numberOfLines={1}>
                      {streakText}
                    </Text>
                  </View>
                </View>
                <View style={styles.habitColRate}>
                  <Text style={styles.habitRatePercent}>
                    {achievementHidden ? '継続率 - %' : `継続率 ${completionPercent}%`}
                  </Text>
                  <Text style={styles.habitRateDetail}>{achievementText}</Text>
                </View>
              </View>
            ),
            )
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F2F2F7' },
  scrollContent: { paddingBottom: 60, alignItems: 'center' },

  stickyFilterHeader: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 4,
    backgroundColor: '#F2F2F7',
    zIndex: 10,
  },
  segmentedControl: {
    flexDirection: 'row',
    width: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 4,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  segment: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10 },
  segmentActive: {
    backgroundColor: PERIOD_SEGMENT_ACTIVE_BG,
  },
  segmentText: { fontSize: 13, color: '#3A3A3C', fontWeight: '600' },
  segmentTextActive: { color: PERIOD_SEGMENT_ACTIVE_TEXT, fontWeight: '800' },

  customRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  customLabel: { fontSize: 14, color: '#636366', fontWeight: '600' },
  customDateBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D1D6',
  },
  customDateText: { fontSize: 15, fontWeight: '700', color: '#222222' },

  switchCard: {
    width: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  switchCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchTextWrap: { flex: 1, paddingRight: 8 },
  switchLabel: { fontSize: 14, color: '#1C1C1E', fontWeight: '700' },
  switchSub: { fontSize: 12, color: '#636366', marginTop: 2 },
  switchOnOffHint: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 6,
  },

  chartCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingTop: 14,
    paddingBottom: 16,
    paddingHorizontal: 12,
    marginBottom: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  chartHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginBottom: 10,
  },
  chartTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C1E' },
  chartHint: {
    marginTop: 6,
    marginBottom: 2,
    fontSize: 11,
    color: '#8E8E93',
  },

  achievementSection: {
    width: '100%',
    marginTop: 14,
    paddingTop: 14,
    paddingHorizontal: 4,
    paddingBottom: 2,
    borderTopWidth: 1,
    borderTopColor: '#D8E2EE',
    backgroundColor: '#F5F8FC',
    borderRadius: 12,
  },
  achievementCardsRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  achievementMiniCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#B8D0E8',
    shadowColor: '#1A3A5C',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  achievementMiniLabel: {
    fontSize: 12,
    color: '#636366',
    fontWeight: '600',
  },
  achievementMiniValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111111',
    marginTop: 4,
  },

  achievementForecast: {
    marginTop: 14,
    paddingTop: 12,
  },
  achievementForecastDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#C5D4E3',
    marginBottom: 12,
  },
  achievementForecastTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  achievementForecastNote: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 4,
    fontWeight: '600',
  },
  achievementForecastLine: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
    lineHeight: 26,
  },
  achievementForecastDateBadgeText: {
    backgroundColor: '#F0F9FF',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 16,
    fontWeight: '800',
    color: '#111111',
    overflow: 'hidden',
  },
  achievementForecastPlain: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111111',
    marginTop: 10,
    lineHeight: 20,
  },

  habitSectionWrap: {
    width: '90%',
    marginTop: 10,
    marginBottom: 14,
  },
  habitSectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 10,
  },
  habitEmptyText: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 18,
  },
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  habitColTag: {
    flex: 1,
    minWidth: 108,
    flexShrink: 1,
    paddingRight: 4,
  },
  habitTagText: {
    backgroundColor: '#F2F2F7',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  habitColStreak: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    flexGrow: 0,
    marginLeft: 10,
  },
  habitColMark: {
    width: 24,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  habitMarkText: {
    fontSize: 18,
    width: 24,
    textAlign: 'left',
  },
  habitColStreakText: {
    width: 99,
    marginLeft: 6,
    justifyContent: 'center',
  },
  habitStreakText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  habitColRate: {
    width: 84,
    flexShrink: 0,
    flexGrow: 0,
    alignItems: 'stretch',
    justifyContent: 'center',
    paddingLeft: 2,
  },
  habitRatePercent: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111111',
    textAlign: 'left',
  },
  habitRateDetail: {
    fontSize: 11,
    fontWeight: '700',
    color: '#636366',
    marginTop: 3,
    textAlign: 'left',
  },
  tooltip: {
    position: 'absolute',
    top: 4,
    minWidth: 150,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
    alignItems: 'center',
  },
  tooltipValue: { fontSize: 15, fontWeight: '700', color: '#000000' },
  tooltipDate: { fontSize: 11, color: '#000000', marginTop: 6 },

  emptyContainer: {
    height: 220,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { color: '#8E8E93', fontSize: 15, fontWeight: '500' },

  statsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  statsTitle: { fontSize: 16, fontWeight: '700', color: '#1C1C1E', marginBottom: 8 },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  statsLabel: { fontSize: 14, color: '#636366' },
  statsValue: { fontSize: 14, color: '#1C1C1E', fontWeight: '600' },

  recordsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  recordsTitle: { fontSize: 16, fontWeight: '700', color: '#1C1C1E', marginBottom: 10 },
  recordRow: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  recordTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recordDate: { fontSize: 13, color: '#8E8E93' },
  recordValue: { fontSize: 16, fontWeight: '700', color: '#1C1C1E' },
  recordTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  recordTagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
  },
  recordTagText: { fontSize: 11, fontWeight: '600' },
  recordsMore: {
    marginTop: 8,
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'center',
  },
});
