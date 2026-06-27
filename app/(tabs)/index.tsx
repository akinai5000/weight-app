import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AndroidNumericKeyboardToolbar,
  getInputAccessoryViewId,
  NumericKeyboardAccessoryPortal,
  RECORD_WEIGHT_KEYBOARD_ACCESSORY_ID,
  useAndroidKeyboardToolbarHeight,
} from '@/components/NumericKeyboardAccessory';
import { useThemeColor } from '@/components/ThemeContext';
import { rescheduleIntelligentWeightReminders } from '@/constants/Notifications';
import {
  Tag,
  buildTagMap,
  getSelectableTagChipStyle,
  groupTagsByFrequency,
} from '@/constants/Tags';
import { type Habit, loadHabits } from '@/constants/Habits';
import {
  accentButtonContainerStyle,
  accentButtonTextStyle,
} from '@/constants/ThemePresets';

type WeightRecord = { id: string; value: string; date: string; tags?: string[] };

export default function TabOneScreen() {
  const isFocused = useIsFocused();
  const { color: themeColor } = useThemeColor();
  const [weight, setWeight] = useState('');
  const [history, setHistory] = useState<WeightRecord[]>([]);
  const [appLanguage, setAppLanguage] = useState<'ja' | 'en'>('ja');
  const androidKeyboardHeight = useAndroidKeyboardToolbarHeight();
  const [editingId, setEditingId] = useState<string | null>(null);

  const [habits, setHabits] = useState<Habit[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  const rowRefs = useRef<Partial<Record<string, Swipeable | null>>>({});
  const scrollRef = useRef<ScrollView>(null);
  const accessoryDoneLabel = appLanguage === 'ja' ? '完了' : 'Done';

  const scrollToFormTop = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });
  };

  const allTags = useMemo(
    () =>
      habits.map((h) => ({
        id: h.id,
        label: h.name,
        kind: 'positive' as const,
      })),
    [habits],
  );
  const tagsByFrequency = useMemo(() => groupTagsByFrequency(habits), [habits]);
  const tagMap = useMemo(() => buildTagMap(allTags), [allTags]);

  const frequencyLanes = useMemo(() => {
    const lanes = [
      { key: 'daily' as const, label: appLanguage === 'ja' ? '毎日' : 'Daily' },
      { key: 'weekly' as const, label: appLanguage === 'ja' ? '毎週' : 'Weekly' },
      { key: 'monthly' as const, label: appLanguage === 'ja' ? '毎月' : 'Monthly' },
    ];
    return lanes.filter((lane) => tagsByFrequency[lane.key].length > 0);
  }, [tagsByFrequency, appLanguage]);

  useEffect(() => {
    loadData();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, []),
  );

  const loadData = async () => {
    try {
      const savedData = await AsyncStorage.getItem('@weight_history');
      const savedLang = await AsyncStorage.getItem('@app_language');
      const loadedHabits = await loadHabits();
      if (savedData) setHistory(JSON.parse(savedData));
      if (savedLang === 'ja' || savedLang === 'en') setAppLanguage(savedLang);
      setHabits(loadedHabits);
    } catch (e) {
      console.log('load failed', e);
    }
  };

  const saveData = async (newData: WeightRecord[]) => {
    try {
      await AsyncStorage.setItem('@weight_history', JSON.stringify(newData));
    } catch (e) {
      console.log('save failed', e);
    }
  };

  const persistAndSetHistory = async (updated: WeightRecord[]) => {
    setHistory(updated);
    await saveData(updated);
    await rescheduleIntelligentWeightReminders();
  };

  const validateWeightInput = (): string | null => {
    const trimmed = weight.trim();
    if (trimmed === '') return '体重を入力してください。';
    const num = parseFloat(trimmed.replace(/,/g, ''));
    if (!Number.isFinite(num)) return '数字で入力してください。';
    if (num < 30 || num > 200) return '30kgから200kgの間で入力してください';
    return null;
  };

  const handleSave = () => {
    Keyboard.dismiss();
    const validationError = validateWeightInput();
    if (validationError) {
      Alert.alert('入力チェック', validationError);
      return;
    }

    const trimmed = weight.trim().replace(/,/g, '');

    if (editingId) {
      const updatedHistory = history.map((item) =>
        item.id === editingId
          ? { ...item, value: trimmed, tags: [...selectedTagIds] }
          : item,
      );
      persistAndSetHistory(updatedHistory);
      setEditingId(null);
      setWeight('');
      setSelectedTagIds([]);
      scrollToFormTop();
      return;
    }

    const newRecord: WeightRecord = {
      id: Math.random().toString(),
      value: trimmed,
      date: new Date().toLocaleString('ja-JP', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      tags: [...selectedTagIds],
    };

    const updatedHistory = [newRecord, ...history];
    persistAndSetHistory(updatedHistory);
    setWeight('');
    setSelectedTagIds([]);
    scrollToFormTop();
  };

  const handleTapHistoryItem = (item: WeightRecord) => {
    Object.values(rowRefs.current).forEach((r) => r?.close());
    setEditingId(item.id);
    setWeight(item.value);
    setSelectedTagIds(item.tags ?? []);
    scrollToFormTop();
  };

  const cancelEditMode = () => {
    Keyboard.dismiss();
    setEditingId(null);
    setWeight('');
    setSelectedTagIds([]);
    scrollToFormTop();
  };

  const handleDelete = (id: string) => {
    rowRefs.current[id]?.close();
    Alert.alert('削除の確認', 'この記録を削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: 'OK',
        style: 'destructive',
        onPress: () => {
          const updatedHistory = history.filter((h) => h.id !== id);
          persistAndSetHistory(updatedHistory);
          if (editingId === id) {
            setEditingId(null);
            setWeight('');
            setSelectedTagIds([]);
            scrollToFormTop();
          }
        },
      },
    ]);
  };

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    );
  };

  const saveLabel = editingId ? '更新' : '記録を保存';
  const weightSectionTitle = appLanguage === 'ja' ? '今日の体重' : "Today's weight";
  const tagSectionTitle = appLanguage === 'ja' ? '前日の行動' : "Previous day's actions";
  const emptyTagsHint =
    appLanguage === 'ja' ? '（設定されたタグはありません）' : '(No tags configured)';
  const editingBadgeLabel = appLanguage === 'ja' ? '（編集中）' : '(Editing)';

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior="height"
        enabled={Platform.OS === 'android'}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
            showsVerticalScrollIndicator={false}
          >
            <View
              style={[
                styles.inputCard,
                editingId && styles.inputCardEditing,
                editingId ? { borderWidth: 2, borderColor: themeColor } : null,
              ]}
            >
              <View style={styles.formSection}>
                <View style={styles.weightSectionHeader}>
                  <Text style={styles.sectionLabel}>{weightSectionTitle}</Text>
                  {editingId ? (
                    <Text style={[styles.editingBadge, { color: themeColor }]}>
                      {editingBadgeLabel}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.inputCenterArea}>
                  <View style={styles.inputRow}>
                    <TextInput
                      style={styles.input}
                      placeholder="00.0"
                      keyboardType="numeric"
                      returnKeyType="default"
                      value={weight}
                      onChangeText={setWeight}
                      inputAccessoryViewID={getInputAccessoryViewId(RECORD_WEIGHT_KEYBOARD_ACCESSORY_ID)}
                    />
                    <Text style={styles.unit}>kg</Text>
                  </View>
                </View>
              </View>

              <View style={styles.formDivider} />

              <View style={styles.formSection}>
                <View style={styles.tagSectionHeader}>
                  <Text style={styles.sectionLabel}>{tagSectionTitle}</Text>
                  <Text style={styles.tagSectionHint}>
                    {selectedTagIds.length > 0
                      ? `${selectedTagIds.length}件選択中`
                      : 'タップで選択'}
                  </Text>
                </View>

                {frequencyLanes.length > 0 ? (
                  <View style={styles.frequencyLanesContainer}>
                    {frequencyLanes.map((lane, index) => (
                      <View
                        key={lane.key}
                        style={[
                          styles.frequencyLane,
                          index < frequencyLanes.length - 1 && styles.frequencyLaneDivider,
                        ]}
                      >
                        <View style={styles.frequencyLabel}>
                          <Text style={styles.frequencyLabelText}>{lane.label}</Text>
                        </View>
                        <View style={styles.chipWrap}>
                          {tagsByFrequency[lane.key].map((tag) => {
                            const selected = selectedTagIds.includes(tag.id);
                            const chipStyle = getSelectableTagChipStyle(tag, selected, themeColor);
                            return (
                              <TouchableOpacity
                                key={tag.id}
                                onPress={() => toggleTag(tag.id)}
                                activeOpacity={0.8}
                                style={[
                                  styles.chip,
                                  {
                                    borderColor: chipStyle.borderColor,
                                    backgroundColor: chipStyle.backgroundColor,
                                  },
                                ]}
                              >
                                <Text style={[styles.chipText, chipStyle.textStyle]}>
                                  {tag.label}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.emptyTagsHint}>{emptyTagsHint}</Text>
                )}

                <Text style={styles.tagManageHint}>
                  ※タグの追加・削除は「設定」タブから行えます
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.saveButton, accentButtonContainerStyle]}
                onPress={handleSave}
              >
                <Text style={[styles.saveButtonText, accentButtonTextStyle]}>{saveLabel}</Text>
              </TouchableOpacity>
              {editingId ? (
                <TouchableOpacity style={styles.cancelEdit} onPress={cancelEditMode} hitSlop={8}>
                  <Text style={[styles.cancelEditText, { color: themeColor }]}>編集をやめる</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={styles.historySection}>
              <Text style={styles.historyHeader}>最近の記録</Text>
              {history.map((item) => {
                const itemTags = (item.tags ?? [])
                  .map((id) => tagMap[id])
                  .filter((t): t is Tag => Boolean(t));
                return (
                  <Swipeable
                    key={item.id}
                    ref={(r) => {
                      rowRefs.current[item.id] = r;
                    }}
                    friction={2}
                    rightThreshold={40}
                    overshootRight={false}
                    renderRightActions={() => (
                      <TouchableOpacity
                        style={styles.deleteAction}
                        activeOpacity={0.85}
                        onPress={() => handleDelete(item.id)}
                      >
                        <Text style={styles.deleteActionText}>削除</Text>
                      </TouchableOpacity>
                    )}
                  >
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => handleTapHistoryItem(item)}
                      style={styles.historyCard}
                    >
                      <View style={styles.historyTopRow}>
                        <Text style={styles.historyDate}>{item.date}</Text>
                        <Text style={styles.historyValue}>
                          {item.value} <Text style={styles.unitSmall}>kg</Text>
                        </Text>
                      </View>
                      {itemTags.length > 0 && (
                        <View style={styles.historyTagRow}>
                          {itemTags.map((tag) => {
                            const chipStyle = getSelectableTagChipStyle(tag, true, themeColor);
                            return (
                              <View
                                key={tag.id}
                                style={[
                                  styles.chip,
                                  {
                                    borderColor: chipStyle.borderColor,
                                    backgroundColor: chipStyle.backgroundColor,
                                  },
                                ]}
                              >
                                <Text style={[styles.chipText, chipStyle.textStyle]}>
                                  {tag.label}
                                </Text>
                              </View>
                            );
                          })}
                        </View>
                      )}
                    </TouchableOpacity>
                  </Swipeable>
                );
              })}
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      <NumericKeyboardAccessoryPortal
        accessoryId={RECORD_WEIGHT_KEYBOARD_ACCESSORY_ID}
        doneLabel={accessoryDoneLabel}
        visible={isFocused}
      />
      <AndroidNumericKeyboardToolbar
        doneLabel={accessoryDoneLabel}
        visible={isFocused}
        keyboardHeight={androidKeyboardHeight}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F2F2F7' },
  container: { flex: 1 },
  scrollContent: { paddingTop: 24, paddingBottom: 40, alignItems: 'center' },
  editingBadge: { fontSize: 14, fontWeight: '700' },
  formSection: {
    paddingVertical: 12,
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
  },
  weightSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 8,
  },
  inputCard: {
    backgroundColor: '#FFF',
    width: '90%',
    borderRadius: 20,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
    marginBottom: 24,
  },
  inputCardEditing: {
    backgroundColor: '#F2F8FF',
  },
  inputCenterArea: { alignItems: 'center' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 0 },
  input: {
    fontSize: 56,
    fontWeight: 'bold',
    color: '#1A202C',
    textAlign: 'center',
    minWidth: 140,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  unit: { fontSize: 24, color: '#8E8E93', marginLeft: 8, marginBottom: 12 },

  tagSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  tagSectionHint: { fontSize: 11, color: '#8E8E93' },
  frequencyLanesContainer: { gap: 0 },
  frequencyLane: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  frequencyLaneDivider: {
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  frequencyLabel: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginTop: 2,
  },
  frequencyLabelText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  chipWrap: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1.2,
  },
  chipText: { fontSize: 12 },
  emptyTagsHint: { fontSize: 12, color: '#A8A8AE', fontStyle: 'italic' },
  tagManageHint: { fontSize: 11, color: '#A8A8AE', marginTop: 10 },

  saveButton: { width: '100%', paddingVertical: 16, borderRadius: 14, alignItems: 'center', marginTop: 8 },
  saveButtonText: { fontSize: 18 },
  cancelEdit: { marginTop: 14, paddingVertical: 6, alignSelf: 'center' },
  cancelEditText: { fontSize: 15, fontWeight: '500' },

  historySection: { width: '90%' },
  historyHeader: { fontSize: 20, fontWeight: '700', color: '#1C1C1E', marginBottom: 15 },
  historyCard: {
    backgroundColor: '#FFF',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 16,
    marginBottom: 12,
  },
  historyTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyDate: { fontSize: 15, color: '#8E8E93' },
  historyValue: { fontSize: 20, fontWeight: '700', color: '#1C1C1E' },
  unitSmall: { fontSize: 14, fontWeight: '400', color: '#8E8E93' },
  historyTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },

  deleteAction: {
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    width: 88,
    marginBottom: 12,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
  },
  deleteActionText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
