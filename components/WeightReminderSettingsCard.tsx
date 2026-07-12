import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Keyboard,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  DEFAULT_WEIGHT_REMINDER_TIMES,
  formatTimeHHMM,
  normalizeNotifyTimes,
  parseTimeToDate,
  requestNotificationPermission,
  updateNotificationSchedule,
  saveWeightReminderSettings,
  loadWeightReminderSettings,
} from '@/constants/Notifications';
import {
  ACCENT_SURFACE_BG,
  ACCENT_SURFACE_TEXT,
  accentSurfaceTextStyle,
} from '@/constants/ThemePresets';

type Language = 'ja' | 'en';
type PickerMode = 'add' | 'edit';

const copy = {
  ja: {
    sectionTitle: '通知設定',
    sectionHint: '毎日、設定した時刻に体重入力を促す通知を送信します。',
    emptyTimes: '通知時刻が設定されていません',
    buttonAddTime: '＋ 通知時刻を追加',
    buttonEdit: '編集',
    delete: '削除',
    deleteTitle: '削除の確認',
    deleteMessage: 'この通知時刻を削除しますか？',
    duplicateTitle: '重複',
    duplicateMessage: '同じ通知時刻が既に登録されています。',
    cancel: 'キャンセル',
    confirm: '完了',
    permissionTitle: '通知の許可',
    permissionMessage: '端末の設定アプリから通知を許可してください。',
    openSettings: '設定を開く',
  },
  en: {
    sectionTitle: 'Notification Settings',
    sectionHint: 'Sends daily notifications at your set times to remind you to log your weight.',
    emptyTimes: 'No notification times configured',
    buttonAddTime: '+ Add notification time',
    buttonEdit: 'Edit',
    delete: 'Delete',
    deleteTitle: 'Confirm deletion',
    deleteMessage: 'Remove this notification time?',
    duplicateTitle: 'Duplicate',
    duplicateMessage: 'This notification time is already registered.',
    cancel: 'Cancel',
    confirm: 'Done',
    permissionTitle: 'Notifications',
    permissionMessage: 'Please enable notifications from your device Settings app.',
    openSettings: 'Open Settings',
  },
} as const;

type WeightReminderSettingsCardProps = {
  language: Language;
  /** Increment to force reload after backup restore */
  reloadToken?: number;
};

export function WeightReminderSettingsCard({
  language,
  reloadToken = 0,
}: WeightReminderSettingsCardProps) {
  const t = copy[language];
  const [weightReminderTimes, setWeightReminderTimes] = useState<string[]>([
    ...DEFAULT_WEIGHT_REMINDER_TIMES,
  ]);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<PickerMode>('add');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [pendingTime, setPendingTime] = useState(new Date());

  const loadConfig = useCallback(async () => {
    const settings = await loadWeightReminderSettings();
    setWeightReminderTimes(
      settings.notifyTimes.length > 0
        ? settings.notifyTimes
        : [...DEFAULT_WEIGHT_REMINDER_TIMES],
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadConfig();
    }, [loadConfig]),
  );

  React.  useEffect(() => {
    if (reloadToken > 0) {
      void loadConfig();
    }
  }, [reloadToken, loadConfig]);

  const persistSettings = async (
    times: string[],
    options?: { scheduleTestNotification?: boolean },
  ) => {
    const normalized = normalizeNotifyTimes(times);
    const enabled = normalized.length > 0;
    await saveWeightReminderSettings(enabled, normalized);
    await updateNotificationSchedule(normalized, options);
    setWeightReminderTimes(normalized);
  };

  const maybeRequestPermission = async () => {
    const granted = await requestNotificationPermission();
    if (!granted) {
      Alert.alert(t.permissionTitle, t.permissionMessage, [
        { text: t.cancel, style: 'cancel' },
        { text: t.openSettings, onPress: () => Linking.openSettings() },
      ]);
    }
  };

  const applyTimes = async (
    times: string[],
    options?: { scheduleTestNotification?: boolean },
  ) => {
    if (times.length > 0) {
      await maybeRequestPermission();
    }
    await persistSettings(times, options);
  };

  const openAddPicker = () => {
    Keyboard.dismiss();
    setPickerMode('add');
    setEditingIndex(null);
    setPendingTime(parseTimeToDate(DEFAULT_WEIGHT_REMINDER_TIMES[0]));
    setShowTimePicker(true);
  };

  const openEditPicker = (index: number) => {
    Keyboard.dismiss();
    setPickerMode('edit');
    setEditingIndex(index);
    setPendingTime(parseTimeToDate(weightReminderTimes[index]));
    setShowTimePicker(true);
  };

  const commitTime = (selected: Date) => {
    const nextTime = formatTimeHHMM(selected);
    let nextTimes = [...weightReminderTimes];

    if (pickerMode === 'add') {
      if (nextTimes.includes(nextTime)) {
        Alert.alert(t.duplicateTitle, t.duplicateMessage);
        return;
      }
      nextTimes.push(nextTime);
    } else if (editingIndex !== null) {
      const withoutCurrent = nextTimes.filter((_, i) => i !== editingIndex);
      if (withoutCurrent.includes(nextTime)) {
        Alert.alert(t.duplicateTitle, t.duplicateMessage);
        return;
      }
      nextTimes[editingIndex] = nextTime;
    }

    nextTimes = normalizeNotifyTimes(nextTimes);
    setWeightReminderTimes(nextTimes);
    void applyTimes(nextTimes, pickerMode === 'add' ? { scheduleTestNotification: true } : undefined);
  };

  const onChangeTimePicker = (_: unknown, selected?: Date) => {
    if (Platform.OS === 'android') {
      setShowTimePicker(false);
      if (!selected) return;
      commitTime(selected);
    } else if (selected) {
      setPendingTime(selected);
    }
  };

  const confirmTimePicker = () => {
    setShowTimePicker(false);
    commitTime(new Date(pendingTime));
  };

  const handleDelete = (index: number) => {
    Alert.alert(t.deleteTitle, t.deleteMessage, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.delete,
        style: 'destructive',
        onPress: () => {
          const nextTimes = weightReminderTimes.filter((_, i) => i !== index);
          setWeightReminderTimes(nextTimes);
          void applyTimes(nextTimes);
        },
      },
    ]);
  };

  return (
    <>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t.sectionTitle}</Text>
        <Text style={styles.sectionHint}>{t.sectionHint}</Text>

        <View style={styles.formSection}>
          {weightReminderTimes.length === 0 ? (
            <Text style={styles.emptyText}>{t.emptyTimes}</Text>
          ) : (
            <View style={styles.list}>
              {weightReminderTimes.map((time, index) => (
                <View key={`${time}-${index}`} style={styles.timeRow}>
                  <View style={styles.timeBody}>
                    <Text style={styles.timeLabel} numberOfLines={1}>
                      {time}
                    </Text>
                  </View>
                  <View style={styles.actionGroup}>
                    <TouchableOpacity
                      onPress={() => openEditPicker(index)}
                      style={styles.editBadgeBtn}
                      hitSlop={4}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.editBadgeBtnText}>{t.buttonEdit}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDelete(index)}
                      style={styles.deleteBadgeBtn}
                      hitSlop={4}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.deleteBadgeBtnText}>{t.delete}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity
            style={styles.toggleAddButton}
            onPress={openAddPicker}
            activeOpacity={0.75}
          >
            <Text style={styles.toggleAddButtonText}>{t.buttonAddTime}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {showTimePicker && Platform.OS === 'android' && (
        <DateTimePicker
          value={pendingTime}
          mode="time"
          is24Hour
          display="default"
          onChange={onChangeTimePicker}
        />
      )}

      {Platform.OS === 'ios' && (
        <Modal
          visible={showTimePicker}
          transparent
          animationType="slide"
          onRequestClose={() => setShowTimePicker(false)}
        >
          <View style={styles.timeModalRoot}>
            <Pressable style={styles.timeModalBackdrop} onPress={() => setShowTimePicker(false)} />
            <View style={styles.timeModalSheet}>
              <View style={styles.timeModalHeader}>
                <TouchableOpacity onPress={() => setShowTimePicker(false)} hitSlop={8}>
                  <Text style={styles.timeModalCancel}>{t.cancel}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={confirmTimePicker} hitSlop={8}>
                  <Text style={[styles.timeModalConfirm, accentSurfaceTextStyle]}>{t.confirm}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.timeModalPickerWrap}>
                <DateTimePicker
                  value={pendingTime}
                  mode="time"
                  is24Hour
                  display="spinner"
                  onChange={onChangeTimePicker}
                  textColor="#1C1C1E"
                  themeVariant="light"
                  style={styles.timeModalPicker}
                />
              </View>
            </View>
          </View>
        </Modal>
      )}
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
  formSection: {
    paddingTop: 4,
  },
  emptyText: {
    fontSize: 12,
    color: '#8E8E93',
    marginBottom: 12,
  },
  list: {
    marginBottom: 12,
    gap: 6,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: ACCENT_SURFACE_BG,
  },
  timeBody: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  timeLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: ACCENT_SURFACE_TEXT,
  },
  actionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    flexShrink: 0,
    marginLeft: 8,
  },
  editBadgeBtn: {
    backgroundColor: '#EBF8FF',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  editBadgeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2B6CB0',
  },
  deleteBadgeBtn: {
    backgroundColor: '#FFEAEA',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  deleteBadgeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#E53E3E',
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
  timeModalRoot: { flex: 1, justifyContent: 'flex-end' },
  timeModalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  timeModalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
  },
  timeModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  timeModalCancel: { fontSize: 15, color: '#8E8E93', fontWeight: '600' },
  timeModalConfirm: { fontSize: 15, fontWeight: '700' },
  timeModalPickerWrap: { paddingHorizontal: 16, paddingTop: 8, alignItems: 'center' },
  timeModalPicker: { width: '100%', height: 200 },
});
