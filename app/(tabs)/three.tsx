import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { SafeAreaView } from 'react-native-safe-area-context';

import { HabitSettingsCard } from '@/components/HabitSettingsCard';
import { useHowToUse } from '@/components/HowToUseContext';
import {
  AndroidNumericKeyboardToolbar,
  getInputAccessoryViewId,
  SETTINGS_INITIAL_WEIGHT_ACCESSORY_ID,
  SETTINGS_TARGET_WEIGHT_ACCESSORY_ID,
  SettingsNumericKeyboardAccessoryPortals,
  useAndroidKeyboardToolbarHeight,
} from '@/components/NumericKeyboardAccessory';
import { WeightReminderSettingsCard } from '@/components/WeightReminderSettingsCard';
import { type Habit, loadHabits } from '@/constants/Habits';
import { seedYearChartDummyData } from '@/constants/seedYearChartDummy';
import {
  ACCENT_SURFACE_BG,
  ACCENT_SURFACE_TEXT,
  accentButtonContainerStyle,
  accentButtonTextStyle,
  accentSurfaceTextStyle,
} from '@/constants/ThemePresets';

type Language = 'ja' | 'en';

type ProfileSettings = {
  initialWeight: string;
  targetWeight: string;
};

const defaultProfile: ProfileSettings = {
  initialWeight: '',
  targetWeight: '',
};

const textMap = {
  ja: {
    screenTitle: '設定',
    sectionProfile: '体重設定',
    labelInitialWeight: '初期体重 (kg)',
    labelTargetWeight: '目標体重 (kg)',
    sectionPersonalize: 'カスタマイズ',
    labelLanguage: '言語設定',
    languageJa: '日本語',
    languageEn: 'English',
    sectionHelp: 'ヘルプ',
    labelHowToUse: 'アプリの使い方を見る',
    howToUseBadge: '開く',
    sectionAppInfo: 'アプリ情報',
    labelVersion: 'Version',
    valueVersion: '1.0.0',
    labelDeveloper: 'Developer',
    valueDeveloper: '[nk]',
    buttonSaveProfile: '体重を保存',
    savingProfile: '保存中...',
    savedMessage: '保存しました！',
    saveError: '保存に失敗しました。',
    accessoryDone: '完了',
  },
  en: {
    screenTitle: 'Settings',
    sectionProfile: 'Weight settings',
    labelInitialWeight: 'Initial weight (kg)',
    labelTargetWeight: 'Target weight (kg)',
    sectionPersonalize: 'Personalize',
    labelLanguage: 'Language',
    languageJa: 'Japanese',
    languageEn: 'English',
    sectionHelp: 'Help',
    labelHowToUse: 'View how to use',
    howToUseBadge: 'Open',
    sectionAppInfo: 'App Info',
    labelVersion: 'Version',
    valueVersion: '1.0.0',
    labelDeveloper: 'Developer',
    valueDeveloper: '[nk]',
    buttonSaveProfile: 'Save weight',
    savingProfile: 'Saving...',
    savedMessage: 'Saved!',
    saveError: 'Failed to save.',
    accessoryDone: 'Done',
  },
} as const;

export default function TabThreeSettings() {
  const isFocused = useIsFocused();
  const { openHowToUse } = useHowToUse();
  const [language, setLanguage] = useState<Language>('ja');
  const [profile, setProfile] = useState<ProfileSettings>(defaultProfile);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isHabitNameInputFocused, setIsHabitNameInputFocused] = useState(false);
  const [isHabitCountInputFocused, setIsHabitCountInputFocused] = useState(false);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [isSeedingYearDummy, setIsSeedingYearDummy] = useState(false);
  const [isReorderingHabits, setIsReorderingHabits] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const t = textMap[language];
  const androidKeyboardHeight = useAndroidKeyboardToolbarHeight();

  useEffect(() => {
    loadSettings();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      loadSettings();
    }, []),
  );

  const loadSettings = async () => {
    try {
      const savedLang = await AsyncStorage.getItem('@app_language');
      if (savedLang === 'ja' || savedLang === 'en') setLanguage(savedLang);
      const savedProfile = await AsyncStorage.getItem('@profile_settings');
      if (savedProfile) {
        const parsed = JSON.parse(savedProfile) as Partial<ProfileSettings> & {
          height?: string;
          shortTermGoal?: string;
          longTermGoal?: string;
        };
        setProfile({
          initialWeight: parsed.initialWeight ?? '',
          targetWeight:
            parsed.targetWeight ??
            parsed.longTermGoal ??
            parsed.shortTermGoal ??
            '',
        });
      }
      const loadedHabits = await loadHabits();
      setHabits(loadedHabits);
    } catch (e) {
      console.log('settings load failed', e);
    }
  };

  const handleSaveProfile = async () => {
    Keyboard.dismiss();
    setIsSavingProfile(true);
    try {
      await AsyncStorage.setItem('@profile_settings', JSON.stringify(profile));
      Alert.alert(t.savedMessage);
    } catch (e) {
      console.log('profile save failed', e);
      Alert.alert(t.saveError);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleChangeProfile = (key: keyof ProfileSettings, value: string) => {
    setProfile((prev) => ({ ...prev, [key]: value }));
  };

  const handleChangeLanguage = async (next: Language) => {
    setLanguage(next);
    await AsyncStorage.setItem('@app_language', next);
  };

  const handleSeedYearDummy = () => {
    Alert.alert(
      '1年分ダミーデータ',
      '体重履歴と習慣タグをすべて削除し、2025/06/22〜2026/06/21 の365日分を注入します。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '実行',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setIsSeedingYearDummy(true);
              try {
                const result = await seedYearChartDummyData();
                const loadedHabits = await loadHabits();
                setHabits(loadedHabits);
                setProfile({
                  initialWeight: String(result.weightStartKg),
                  targetWeight: String(result.weightEndKg),
                });
                Alert.alert(
                  '注入完了',
                  `${result.recordCount}件（${result.startDate} 〜 ${result.endDate}）\n` +
                    `適切な食事量: ${Math.round(result.tagStats.def_meal.rate * 100)}%\n` +
                    `間食なし: ${Math.round(result.tagStats.def_no_snacks.rate * 100)}%\n` +
                    `運動: ${Math.round(result.tagStats.def_exercise.rate * 100)}%\n` +
                    `朝活: ${Math.round(result.tagStats.hab_morning.rate * 100)}%`,
                );
              } catch (e) {
                console.log('seed year dummy failed', e);
                Alert.alert('エラー', 'ダミーデータの注入に失敗しました。');
              } finally {
                setIsSeedingYearDummy(false);
              }
            })();
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior="height"
        enabled={Platform.OS === 'android'}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            ref={scrollViewRef}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
            showsVerticalScrollIndicator={false}
            scrollEnabled={!isReorderingHabits}
          >
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t.sectionProfile}</Text>
              <Text style={styles.label}>{t.labelInitialWeight}</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  returnKeyType="default"
                  value={profile.initialWeight}
                  onChangeText={(v) => handleChangeProfile('initialWeight', v)}
                  inputAccessoryViewID={getInputAccessoryViewId(SETTINGS_INITIAL_WEIGHT_ACCESSORY_ID)}
                />
                <Text style={styles.unit}>kg</Text>
              </View>

              <Text style={styles.label}>{t.labelTargetWeight}</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  returnKeyType="default"
                  value={profile.targetWeight}
                  onChangeText={(v) => handleChangeProfile('targetWeight', v)}
                  inputAccessoryViewID={getInputAccessoryViewId(SETTINGS_TARGET_WEIGHT_ACCESSORY_ID)}
                />
                <Text style={styles.unit}>kg</Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  accentButtonContainerStyle,
                  isSavingProfile && styles.primaryButtonDisabled,
                ]}
                onPress={handleSaveProfile}
                disabled={isSavingProfile}
              >
                {isSavingProfile ? (
                  <View style={styles.savingRow}>
                    <ActivityIndicator size="small" color={ACCENT_SURFACE_TEXT} />
                    <Text style={[styles.primaryButtonText, accentButtonTextStyle]}>
                      {t.savingProfile}
                    </Text>
                  </View>
                ) : (
                  <Text style={[styles.primaryButtonText, accentButtonTextStyle]}>
                    {t.buttonSaveProfile}
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            <WeightReminderSettingsCard language={language} />

            <HabitSettingsCard
              language={language}
              habits={habits}
              onHabitsChange={setHabits}
              scrollViewRef={scrollViewRef}
              onHabitNameInputFocusChange={setIsHabitNameInputFocused}
              onCountInputFocusChange={setIsHabitCountInputFocused}
              onReorderActiveChange={setIsReorderingHabits}
            />

            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t.sectionHelp}</Text>
              <TouchableOpacity
                style={styles.menuRow}
                onPress={openHowToUse}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t.labelHowToUse}
              >
                <Text style={styles.menuRowLabel}>{t.labelHowToUse}</Text>
                <View style={styles.menuRowRight}>
                  <View style={styles.actionBadge}>
                    <Text style={[styles.actionBadgeText, accentSurfaceTextStyle]}>
                      {t.howToUseBadge}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
                </View>
              </TouchableOpacity>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t.sectionPersonalize}</Text>
              <Text style={styles.label}>{t.labelLanguage}</Text>
              <View style={styles.languageRow}>
                <TouchableOpacity
                  style={[styles.languageChip, language === 'ja' && styles.languageChipActive]}
                  onPress={() => handleChangeLanguage('ja')}
                >
                  <Text
                    style={[
                      styles.languageChipText,
                      language === 'ja' && accentSurfaceTextStyle,
                    ]}
                  >
                    {t.languageJa}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.languageChip, language === 'en' && styles.languageChipActive]}
                  onPress={() => handleChangeLanguage('en')}
                >
                  <Text
                    style={[
                      styles.languageChipText,
                      language === 'en' && accentSurfaceTextStyle,
                    ]}
                  >
                    {t.languageEn}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {__DEV__ && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>開発用</Text>
                <Text style={styles.devHint}>
                  グラフ確認用に1年分のダミーデータ（80kg→70kg）を注入します。
                </Text>
                <TouchableOpacity
                  style={[styles.devButton, isSeedingYearDummy && styles.primaryButtonDisabled]}
                  onPress={handleSeedYearDummy}
                  disabled={isSeedingYearDummy}
                >
                  {isSeedingYearDummy ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.devButtonText}>1年分ダミーデータを注入</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t.sectionAppInfo}</Text>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>{t.labelVersion}</Text>
                <Text style={styles.infoValue}>{t.valueVersion}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>{t.labelDeveloper}</Text>
                <Text style={styles.infoValue}>{t.valueDeveloper}</Text>
              </View>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      <SettingsNumericKeyboardAccessoryPortals doneLabel={t.accessoryDone} visible={isFocused} />
      <AndroidNumericKeyboardToolbar
        doneLabel={t.accessoryDone}
        visible={isFocused && (!isHabitNameInputFocused || isHabitCountInputFocused)}
        keyboardHeight={androidKeyboardHeight}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F2F2F7' },
  container: { flex: 1 },
  scrollContent: { paddingTop: 24, paddingBottom: 40, alignItems: 'center' },
  card: {
    backgroundColor: '#FFFFFF',
    width: '90%',
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C1E', marginBottom: 12 },
  label: { fontSize: 14, color: '#636366', marginBottom: 4, fontWeight: '600', marginTop: 8 },
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
  unit: { fontSize: 15, color: '#636366', marginLeft: 6 },
  primaryButton: {
    marginTop: 12,
    borderRadius: 12,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: { opacity: 0.85 },
  primaryButtonText: { fontSize: 15 },
  savingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  languageRow: { flexDirection: 'row', marginTop: 8 },
  languageChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D0D7E2',
    marginRight: 8,
    backgroundColor: '#FFFFFF',
  },
  languageChipActive: {
    backgroundColor: ACCENT_SURFACE_BG,
    borderColor: ACCENT_SURFACE_BG,
  },
  languageChipText: { fontSize: 13, color: '#1C1C1E', fontWeight: '600' },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  menuRowRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  menuRowLabel: { fontSize: 16, color: '#1C1C1E', fontWeight: '600' },
  actionBadge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACCENT_SURFACE_BG,
  },
  actionBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: ACCENT_SURFACE_TEXT,
  },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  infoLabel: { fontSize: 14, color: '#636366' },
  infoValue: { fontSize: 14, color: '#1C1C1E', fontWeight: '600' },
  devHint: { fontSize: 13, color: '#636366', marginBottom: 12, lineHeight: 18 },
  devButton: {
    borderRadius: 12,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF3B30',
  },
  devButtonText: { fontSize: 15, color: '#FFFFFF', fontWeight: '700' },
});
