import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  Platform,
  Pressable,
  type ScrollView,
  StyleSheet,
  Text,
  type TextLayoutEventData,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from 'react-native-draggable-flatlist';
import * as Haptics from 'expo-haptics';

import {
  getInputAccessoryViewId,
  NumericKeyboardAccessoryPortal,
  SETTINGS_HABIT_COUNT_ACCESSORY_ID,
} from '@/components/NumericKeyboardAccessory';
import {
  type Habit,
  type HabitFrequency,
  WEEKLY_FREQUENCY_COUNT_MAX,
  MONTHLY_FREQUENCY_COUNT_MAX,
  clampFrequencyCount,
  formatFrequencyBadgeLabel,
  generateHabitId,
  saveHabits,
} from '@/constants/Habits';
import {
  ACCENT_SURFACE_BG,
  ACCENT_SURFACE_TEXT,
  accentButtonContainerStyle,
  accentButtonTextStyle,
  accentSurfaceTextStyle,
} from '@/constants/ThemePresets';

type Language = 'ja' | 'en';

/** 端末が対応していない環境でも落ちないよう、触覚フィードバックは安全に発火させる */
function triggerGrabHaptic() {
  try {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } catch {
    // ハプティクス非対応端末では無視
  }
}

/** 編集・削除バッジと同幅（頻度バッジ最大3文字: 週99 / 月99） */
const LIST_BADGE_WIDTH = 48;

const LIST_BADGE = {
  width: LIST_BADGE_WIDTH,
  paddingVertical: 6,
  paddingHorizontal: 12,
  borderRadius: 6,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
} as const;

const LIST_BADGE_TEXT = {
  fontSize: 12,
  fontWeight: '600' as const,
  textAlign: 'center' as const,
};

const FREQ_BADGE_FONT_SIZE_MIN = 9;
const FREQ_BADGE_TEXT_AREA_WIDTH = LIST_BADGE_WIDTH - 12;

type FreqBadgeTextProps = {
  label: string;
};

function FreqBadgeText({ label }: FreqBadgeTextProps) {
  const baseFontSize = LIST_BADGE_TEXT.fontSize;
  const [fontSize, setFontSize] = useState(baseFontSize);

  useEffect(() => {
    setFontSize(baseFontSize);
  }, [label, baseFontSize]);

  const handleTextLayout = useCallback(
    (event: { nativeEvent: TextLayoutEventData }) => {
      const line = event.nativeEvent.lines[0];
      if (!line) return;
      if (line.width > FREQ_BADGE_TEXT_AREA_WIDTH && fontSize > FREQ_BADGE_FONT_SIZE_MIN) {
        setFontSize((current) => Math.max(FREQ_BADGE_FONT_SIZE_MIN, current - 1));
      }
    },
    [fontSize],
  );

  return (
    <Text
      style={[styles.freqBadgeBtnText, { fontSize, lineHeight: fontSize + 2 }]}
      numberOfLines={1}
      onTextLayout={handleTextLayout}
      allowFontScaling={false}
      {...(Platform.OS === 'android' ? { includeFontPadding: false } : {})}
    >
      {label}
    </Text>
  );
}

function getFrequencyChipLabel(
  type: 'weekly' | 'monthly',
  count: string,
  language: Language,
): string {
  if (language === 'ja') {
    const prefix = type === 'weekly' ? '週' : '月';
    return count ? `${prefix}${count}回` : `${prefix}x回`;
  }
  if (type === 'weekly') {
    return count ? `${count}x/wk` : 'Weekly';
  }
  return count ? `${count}x/mo` : 'Monthly';
}

const copy = {
  ja: {
    sectionTitle: '習慣タグ設定',
    sectionHint: 'タグをドラッグして順番の入れ替えができます。',
    empty: 'まだ習慣がありません。「＋ 習慣タグを追加」から登録できます。',
    buttonToggleAdd: '＋ 習慣タグを追加',
    buttonToggleClose: '× 入力フォームを閉じる',
    labelName: '習慣名',
    placeholderName: '例: 早寝、水を多く飲む',
    labelFrequency: '頻度',
    freqDaily: '毎日',
    buttonAdd: '追加',
    buttonSave: '変更を保存',
    buttonEdit: '編集',
    deleteTitle: '習慣を削除',
    deleteMessage: 'を削除しますか？\n（既存の記録のタグ表示も消えます）',
    cancel: 'キャンセル',
    delete: '削除',
    listDeleteButton: '削除',
    validateTitle: '入力チェック',
    validateEmpty: '習慣名を入力してください。',
    validateDuplicate: '同じ名前の習慣が既にあります。',
    validateCountWeekly: `回数は1〜${WEEKLY_FREQUENCY_COUNT_MAX}の整数で入力してください。`,
    validateCountMonthly: `回数は1〜${MONTHLY_FREQUENCY_COUNT_MAX}の整数で入力してください。`,
    accessoryDone: '完了',
  },
  en: {
    sectionTitle: 'Habit Tag Settings',
    sectionHint: 'Drag tags to reorder them.',
    empty: 'No habits yet. Tap "+ Add habit tag" to create one.',
    buttonToggleAdd: '＋ Add habit tag',
    buttonToggleClose: '× Close input form',
    labelName: 'Habit name',
    placeholderName: 'e.g. Early sleep, More water',
    labelFrequency: 'Frequency',
    freqDaily: 'Daily',
    buttonAdd: 'Add',
    buttonSave: 'Save changes',
    buttonEdit: 'Edit',
    deleteTitle: 'Delete habit',
    deleteMessage: '?\n(Tag display in existing records will also disappear)',
    cancel: 'Cancel',
    delete: 'Delete',
    listDeleteButton: 'Del',
    validateTitle: 'Input check',
    validateEmpty: 'Please enter a habit name.',
    validateDuplicate: 'A habit with the same name already exists.',
    validateCountWeekly: `Enter a whole number from 1 to ${WEEKLY_FREQUENCY_COUNT_MAX}.`,
    validateCountMonthly: `Enter a whole number from 1 to ${MONTHLY_FREQUENCY_COUNT_MAX}.`,
    accessoryDone: 'Done',
  },
} as const;

type Props = {
  language: Language;
  habits: Habit[];
  onHabitsChange: (next: Habit[]) => void;
  scrollViewRef?: React.RefObject<ScrollView | null>;
  onHabitNameInputFocusChange?: (focused: boolean) => void;
  onCountInputFocusChange?: (focused: boolean) => void;
  /** タグの並び替え（ドラッグ）中かどうかを親へ通知（外側スクロールのロック用） */
  onReorderActiveChange?: (active: boolean) => void;
};

export function HabitSettingsCard({
  language,
  habits,
  onHabitsChange,
  scrollViewRef,
  onHabitNameInputFocusChange,
  onCountInputFocusChange,
  onReorderActiveChange,
}: Props) {
  const t = copy[language];
  const numericInputAccessoryId = getInputAccessoryViewId(SETTINGS_HABIT_COUNT_ACCESSORY_ID);

  const countInputRef = useRef<TextInput>(null);

  const [newName, setNewName] = useState('');
  const [nameError, setNameError] = useState('');
  const [frequency, setFrequency] = useState<HabitFrequency>('daily');
  const [weeklyCount, setWeeklyCount] = useState('');
  const [monthlyCount, setMonthlyCount] = useState('');
  const [countError, setCountError] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingHabitId, setEditingHabitId] = useState<string | null>(null);
  const cardOffsetY = useRef(0);
  const formSectionOffsetY = useRef(0);

  const activeCountValue = frequency === 'weekly' ? weeklyCount : frequency === 'monthly' ? monthlyCount : '';

  const performScrollToForm = useCallback(() => {
    const y = cardOffsetY.current + formSectionOffsetY.current;
    scrollViewRef?.current?.scrollTo({ y: Math.max(0, y), animated: true });
  }, [scrollViewRef]);

  const resetFormFields = useCallback(() => {
    setNewName('');
    setNameError('');
    setFrequency('daily');
    setWeeklyCount('');
    setMonthlyCount('');
    setCountError('');
    setEditingHabitId(null);
  }, []);

  const closeForm = useCallback(() => {
    Keyboard.dismiss();
    setIsFormOpen(false);
    onHabitNameInputFocusChange?.(false);
    resetFormFields();
  }, [resetFormFields, onHabitNameInputFocusChange]);

  useFocusEffect(
    useCallback(() => {
      closeForm();
    }, [closeForm]),
  );

  const habitNames = new Set(
    habits.filter((h) => h.id !== editingHabitId).map((h) => h.name),
  );

  const populateFormFromHabit = (habit: Habit) => {
    setNewName(habit.name);
    setFrequency(habit.frequency);
    const countStr =
      habit.frequencyCount !== undefined ? String(habit.frequencyCount) : '';
    setWeeklyCount(habit.frequency === 'weekly' ? countStr : '');
    setMonthlyCount(habit.frequency === 'monthly' ? countStr : '');
    setCountError('');
  };

  const focusCountInput = () => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        countInputRef.current?.focus();
      }, 100);
    });
  };

  const setActiveCount = (value: string) => {
    const digits = value.replace(/[^\d]/g, '').slice(0, 2);
    if (frequency === 'weekly') {
      setWeeklyCount(digits);
    } else if (frequency === 'monthly') {
      setMonthlyCount(digits);
    }
    if (countError) setCountError('');
  };

  const confirmCountInput = useCallback(() => {
    if (frequency !== 'weekly' && frequency !== 'monthly') return;
    const raw = frequency === 'weekly' ? weeklyCount : monthlyCount;
    if (!raw) return;

    const parsed = Number.parseInt(raw, 10);
    const max =
      frequency === 'weekly' ? WEEKLY_FREQUENCY_COUNT_MAX : MONTHLY_FREQUENCY_COUNT_MAX;
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > max) return;

    const clamped = String(clampFrequencyCount(frequency, parsed));
    if (frequency === 'weekly') {
      setWeeklyCount(clamped);
    } else {
      setMonthlyCount(clamped);
    }
  }, [frequency, weeklyCount, monthlyCount]);

  useEffect(() => {
    const event = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const sub = Keyboard.addListener(event, confirmCountInput);
    return () => sub.remove();
  }, [confirmCountInput]);

  const parseAndValidateCount = (): number | null => {
    if (frequency === 'daily') return null;
    const trimmed = frequency === 'weekly' ? weeklyCount.trim() : monthlyCount.trim();
    const parsed = Number.parseInt(trimmed, 10);
    const max =
      frequency === 'weekly' ? WEEKLY_FREQUENCY_COUNT_MAX : MONTHLY_FREQUENCY_COUNT_MAX;
    const message = frequency === 'weekly' ? t.validateCountWeekly : t.validateCountMonthly;
    if (!Number.isFinite(parsed) || String(parsed) !== trimmed || parsed < 1 || parsed > max) {
      setCountError(message);
      Alert.alert(t.validateTitle, message);
      return null;
    }
    setCountError('');
    return clampFrequencyCount(frequency, parsed);
  };

  const buildHabitPayload = (id: string, name: string, count: number | null): Habit => {
    if (frequency === 'daily' || count === null) {
      return { id, name, frequency: 'daily' };
    }
    return {
      id,
      name,
      frequency,
      frequencyCount: count,
    };
  };

  const handleFrequencyChipPress = (key: HabitFrequency) => {
    if (frequency === 'weekly' || frequency === 'monthly') {
      confirmCountInput();
    }

    if (key === 'daily') {
      confirmCountInput();
      setFrequency('daily');
      Keyboard.dismiss();
      return;
    }

    setFrequency(key);
    setCountError('');
    focusCountInput();
  };

  const handleSubmit = async () => {
    Keyboard.dismiss();
    confirmCountInput();

    const name = newName.trim();
    if (name === '') {
      Alert.alert(t.validateTitle, t.validateEmpty);
      return;
    }
    setNameError('');
    if (habitNames.has(name)) {
      Alert.alert(t.validateTitle, t.validateDuplicate);
      return;
    }

    const count = frequency === 'daily' ? null : parseAndValidateCount();
    if (frequency !== 'daily' && count === null) return;

    let next: Habit[];
    if (editingHabitId) {
      const updated = buildHabitPayload(editingHabitId, name, count);
      next = habits.map((h) => (h.id === editingHabitId ? updated : h));
    } else {
      const habit = buildHabitPayload(generateHabitId(), name, count);
      next = [...habits, habit];
    }

    onHabitsChange(next);
    await saveHabits(next);
    closeForm();
  };

  const handleEdit = (habit: Habit) => {
    setEditingHabitId(habit.id);
    populateFormFromHabit(habit);
    setIsFormOpen(true);
    setTimeout(() => {
      performScrollToForm();
    }, 150);
  };

  const handleDelete = (habit: Habit) => {
    Alert.alert(t.deleteTitle, `「${habit.name}」${t.deleteMessage}`, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.delete,
        style: 'destructive',
        onPress: async () => {
          const next = habits.filter((h) => h.id !== habit.id);
          onHabitsChange(next);
          await saveHabits(next);
          if (editingHabitId === habit.id) {
            closeForm();
          }
        },
      },
    ]);
  };

  const handleToggleForm = () => {
    if (isFormOpen) {
      closeForm();
    } else {
      resetFormFields();
      setIsFormOpen(true);
    }
  };

  const handleDragBegin = useCallback(() => {
    // 掴んだ瞬間にコトッと微振動 ＋ 外側スクロールをロック
    triggerGrabHaptic();
    onReorderActiveChange?.(true);
  }, [onReorderActiveChange]);

  const handleDragEnd = useCallback(
    async ({ data }: { data: Habit[] }) => {
      // ドラッグ終了で外側スクロールを解除
      onReorderActiveChange?.(false);
      onHabitsChange(data);
      await saveHabits(data);
    },
    [onHabitsChange, onReorderActiveChange],
  );

  const renderHabitRow = useCallback(
    ({ item: habit, drag, isActive }: RenderItemParams<Habit>) => (
      <ScaleDecorator activeScale={1.02}>
        <Pressable
          onLongPress={drag}
          delayLongPress={250}
          disabled={isActive}
          style={[styles.habitRow, isActive && styles.habitRowDragging]}
        >
          <View style={styles.habitNameWrap}>
            <Text style={styles.habitName} numberOfLines={1} ellipsizeMode="tail">
              {habit.name}
            </Text>
          </View>
          <View style={styles.habitRowRight}>
            <View style={styles.freqBadgeBtn}>
              <FreqBadgeText label={formatFrequencyBadgeLabel(habit, language)} />
            </View>
            <TouchableOpacity
              onPress={() => handleEdit(habit)}
              style={styles.editBadgeBtn}
              hitSlop={4}
              activeOpacity={0.75}
            >
              <Text style={styles.editBadgeBtnText}>{t.buttonEdit}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleDelete(habit)}
              style={[styles.deleteBadgeBtn, language === 'en' && styles.deleteBadgeBtnCompact]}
              hitSlop={4}
              activeOpacity={0.75}
            >
              <Text
                style={[
                  styles.deleteBadgeBtnText,
                  language === 'en' && styles.deleteBadgeBtnTextCompact,
                ]}
              >
                {t.listDeleteButton}
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </ScaleDecorator>
    ),
    [handleDelete, handleEdit, language, t.buttonEdit, t.listDeleteButton],
  );

  const freqOptions: { key: HabitFrequency; label: string }[] = [
    { key: 'daily', label: t.freqDaily },
    { key: 'weekly', label: getFrequencyChipLabel('weekly', weeklyCount, language) },
    { key: 'monthly', label: getFrequencyChipLabel('monthly', monthlyCount, language) },
  ];

  return (
    <>
    <View
      style={styles.card}
      onLayout={(e) => {
        cardOffsetY.current = e.nativeEvent.layout.y;
      }}
    >
      <Text style={styles.cardTitle}>{t.sectionTitle}</Text>

      {habits.length === 0 ? (
        <Text style={styles.emptyText}>{t.empty}</Text>
      ) : (
        <>
          <Text style={styles.sectionHint}>{t.sectionHint}</Text>
          <DraggableFlatList
            data={habits}
            keyExtractor={(item) => item.id}
            renderItem={renderHabitRow}
            onDragBegin={handleDragBegin}
            onDragEnd={({ data }) => void handleDragEnd({ data })}
            scrollEnabled={false}
            activationDistance={12}
            containerStyle={styles.list}
            ItemSeparatorComponent={() => <View style={styles.listSeparator} />}
          />
        </>
      )}

      <View
        collapsable={false}
        onLayout={(e) => {
          formSectionOffsetY.current = e.nativeEvent.layout.y;
        }}
      >
        <TouchableOpacity
          style={styles.toggleAddButton}
          onPress={handleToggleForm}
          activeOpacity={0.75}
        >
          <Text style={styles.toggleAddButtonText}>
            {isFormOpen ? t.buttonToggleClose : t.buttonToggleAdd}
          </Text>
        </TouchableOpacity>

        {isFormOpen ? (
          <View style={styles.addForm}>
            <View style={styles.formSection}>
              <Text style={styles.sectionLabel}>{t.labelName}</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  value={newName}
                  onChangeText={(text) => {
                    setNewName(text);
                    if (nameError) setNameError('');
                  }}
                  onFocus={() => onHabitNameInputFocusChange?.(true)}
                  onBlur={() => onHabitNameInputFocusChange?.(false)}
                  placeholder={t.placeholderName}
                  placeholderTextColor="#A8A8AE"
                  returnKeyType="done"
                />
              </View>
              {nameError ? <Text style={styles.fieldError}>{nameError}</Text> : null}
            </View>

            <View style={styles.formDivider} />

            <View style={styles.formSection}>
              <Text style={styles.sectionLabel}>{t.labelFrequency}</Text>
              <View style={styles.freqRow}>
                {freqOptions.map((opt) => {
                  const active = frequency === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      onPress={() => handleFrequencyChipPress(opt.key)}
                      activeOpacity={0.85}
                      style={[styles.freqChip, active && styles.freqChipActive]}
                    >
                      <Text style={[styles.freqChipText, active && accentSurfaceTextStyle]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TextInput
                ref={countInputRef}
                style={styles.hiddenCountInput}
                value={activeCountValue}
                onChangeText={setActiveCount}
                onFocus={() => {
                  onHabitNameInputFocusChange?.(false);
                  onCountInputFocusChange?.(true);
                }}
                onBlur={() => {
                  onCountInputFocusChange?.(false);
                  confirmCountInput();
                }}
                keyboardType="numeric"
                returnKeyType="done"
                maxLength={2}
                inputAccessoryViewID={numericInputAccessoryId}
                showSoftInputOnFocus
                caretHidden
                importantForAutofill="no"
              />

              {countError ? <Text style={styles.fieldError}>{countError}</Text> : null}
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, accentButtonContainerStyle]}
              onPress={() => void handleSubmit()}
            >
              <Text style={[styles.primaryButtonText, accentButtonTextStyle]}>
                {editingHabitId ? t.buttonSave : t.buttonAdd}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </View>

    {isFormOpen ? (
      <NumericKeyboardAccessoryPortal
        accessoryId={SETTINGS_HABIT_COUNT_ACCESSORY_ID}
        doneLabel={t.accessoryDone}
        onDone={confirmCountInput}
      />
    ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    width: '90%',
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C1E', marginBottom: 6 },
  sectionHint: {
    fontSize: 13,
    color: '#718096',
    marginBottom: 12,
    lineHeight: 18,
  },
  emptyText: { fontSize: 12, color: '#8E8E93', marginBottom: 8 },
  list: { marginBottom: 10 },
  listSeparator: { height: 6 },
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: ACCENT_SURFACE_BG,
  },
  habitRowDragging: {
    backgroundColor: '#E8F4FC',
    borderColor: '#C5DFF0',
    opacity: 0.96,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 8,
  },
  habitNameWrap: {
    flex: 1,
    minWidth: 0,
    marginRight: 12,
  },
  habitName: {
    fontSize: 17,
    fontWeight: '700',
    color: ACCENT_SURFACE_TEXT,
  },
  habitRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 8,
  },
  freqBadgeBtn: {
    ...LIST_BADGE,
    backgroundColor: '#EDEFF2',
    paddingHorizontal: 6,
    overflow: 'hidden',
  },
  freqBadgeBtnText: {
    ...LIST_BADGE_TEXT,
    color: '#636366',
    width: '100%',
  },
  editBadgeBtn: {
    ...LIST_BADGE,
    backgroundColor: '#EBF8FF',
  },
  editBadgeBtnText: {
    ...LIST_BADGE_TEXT,
    color: '#2B6CB0',
  },
  deleteBadgeBtn: {
    ...LIST_BADGE,
    backgroundColor: '#FFEAEA',
  },
  deleteBadgeBtnCompact: {
    width: 36,
    paddingHorizontal: 6,
  },
  deleteBadgeBtnText: {
    ...LIST_BADGE_TEXT,
    color: '#E53E3E',
  },
  deleteBadgeBtnTextCompact: {
    letterSpacing: 0.2,
  },
  toggleAddButton: {
    marginTop: 4,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#D0D7E2',
    borderStyle: 'dashed',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAFBFC',
  },
  toggleAddButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: ACCENT_SURFACE_TEXT,
  },
  addForm: { marginTop: 4 },
  formSection: {
    paddingVertical: 12,
    position: 'relative',
  },
  formDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 4,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2D3748',
    marginBottom: 10,
  },
  fieldError: { fontSize: 12, color: '#E53E3E', marginTop: 4 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D0D7E2',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    height: 44,
  },
  input: { flex: 1, fontSize: 17, color: '#1C1C1E', paddingVertical: 0 },
  freqRow: { flexDirection: 'row', gap: 8 },
  freqChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.2,
    borderColor: '#D0D7E2',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  freqChipActive: {
    backgroundColor: ACCENT_SURFACE_BG,
    borderColor: ACCENT_SURFACE_BG,
  },
  freqChipText: { fontSize: 13, fontWeight: '700', color: '#1C1C1E' },
  hiddenCountInput: {
    position: 'absolute',
    top: -44,
    left: 0,
    width: 120,
    height: 44,
    opacity: 0.01,
  },
  primaryButton: {
    marginTop: 20,
    borderRadius: 12,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { fontSize: 15 },
});
