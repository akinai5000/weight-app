import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  BackupValidationError,
  exportBackupToShareSheet,
  isBackupCancelledError,
  pickAndRestoreBackup,
} from '@/constants/Backup';
import {
  ACCENT_SURFACE_BG,
  ACCENT_SURFACE_TEXT,
  accentButtonContainerStyle,
  accentButtonTextStyle,
  accentSurfaceTextStyle,
} from '@/constants/ThemePresets';

type Language = 'ja' | 'en';

const copy = {
  ja: {
    sectionTitle: 'データバックアップ',
    recommendedTitle: 'おすすめのやり方',
    recommendedSteps:
      '1.「バックアップを書き出す」を押す\n' +
      '2. 共有メニューで「ファイルに保存」を選ぶ\n' +
      '3.「iCloud Drive」に保存する（見つからない場合は左上の矢印でひとつ前の階層に戻って探す）\n' +
      '4. 機種変更後は「バックアップから復元」で、そのファイルを選ぶ',
    exportButton: 'バックアップを書き出す',
    importButton: 'バックアップから復元',
    exportGuideTitle: 'バックアップの保存手順',
    exportGuideBody:
      '次の画面で保存先を選びます。初めての方は、次の手順がおすすめです。\n\n' +
      '1.「ファイルに保存」をタップ\n' +
      '2.「iCloud Drive」を選んで保存（見つからない場合は左上の矢印でひとつ前の階層に戻って探す）\n' +
      '3. 機種変更や再インストール後は、この画面の「バックアップから復元」から、保存したファイルを選ぶ',
    exportGuideConfirm: '手順を確認して書き出す',
    importGuideTitle: 'バックアップの復元手順',
    importGuideBody:
      '以前 iCloud Drive などに保存したバックアップファイルを選びます。\n\n' +
      '1. 次の画面で「ファイル」や「ブラウズ」から iCloud Drive を開く\n' +
      '2. weight-app-backup で始まる JSON ファイルを選ぶ\n' +
      '3. 今のアプリデータは、すべてその内容に置き換わります',
    importGuideConfirm: 'ファイルを選ぶ',
    cancel: 'キャンセル',
    importDoneTitle: '復元完了',
    importDoneMessage: 'バックアップの内容でデータを置き換えました。',
    importConfirmTitle: 'データを置き換えます',
    importConfirmMessage:
      '現在の体重・習慣・設定はすべてバックアップの内容で上書きされます。よろしいですか？',
    replace: '置き換える',
    errorTitle: 'エラー',
    exportError: 'バックアップの書き出しに失敗しました。',
    importError: 'バックアップの復元に失敗しました。ファイルを確認してください。',
    invalidFile: 'このファイルはバックアップとして使えません。',
  },
  en: {
    sectionTitle: 'Data Backup',
    recommendedTitle: 'Recommended steps',
    recommendedSteps:
      '1. Tap “Export backup”\n' +
      '2. In the share sheet, choose “Save to Files”\n' +
      '3. Save it to iCloud Drive (if you don’t see it, tap the back arrow at the top left to go up one level and look there)\n' +
      '4. After changing phones, use “Restore from backup” and pick that file',
    exportButton: 'Export backup',
    importButton: 'Restore from backup',
    exportGuideTitle: 'How to save your backup',
    exportGuideBody:
      'Next you will choose where to save the file. For most people, follow these steps:\n\n' +
      '1. Tap “Save to Files”\n' +
      '2. Choose iCloud Drive and save (if you don’t see it, tap the back arrow at the top left to go up one level and look there)\n' +
      '3. Later, on a new phone or after reinstalling, use “Restore from backup” on this screen and select the same file',
    exportGuideConfirm: 'Continue to export',
    importGuideTitle: 'How to restore your backup',
    importGuideBody:
      'Pick the backup file you previously saved (for example in iCloud Drive).\n\n' +
      '1. In the next screen, open Files / Browse and go to iCloud Drive\n' +
      '2. Select a JSON file that starts with weight-app-backup\n' +
      '3. Your current app data will be fully replaced with that backup',
    importGuideConfirm: 'Choose file',
    cancel: 'Cancel',
    importDoneTitle: 'Restore complete',
    importDoneMessage: 'Your data was replaced with the backup.',
    importConfirmTitle: 'Replace current data?',
    importConfirmMessage:
      'All current weight logs, habits, and settings will be overwritten by the backup. Continue?',
    replace: 'Replace',
    errorTitle: 'Error',
    exportError: 'Failed to export the backup.',
    importError: 'Failed to restore the backup. Please check the file.',
    invalidFile: 'This file is not a valid backup.',
  },
} as const;

type BackupSettingsCardProps = {
  language: Language;
  appVersion?: string;
  onRestored: () => Promise<void> | void;
};

export function BackupSettingsCard({
  language,
  appVersion = '1.0.0',
  onRestored,
}: BackupSettingsCardProps) {
  const t = copy[language];
  const [guideMode, setGuideMode] = useState<'export' | 'import' | null>(null);
  const [busy, setBusy] = useState(false);

  const runExport = async () => {
    setBusy(true);
    try {
      await exportBackupToShareSheet(appVersion);
    } catch (e) {
      console.log('backup export failed', e);
      Alert.alert(t.errorTitle, t.exportError);
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    setBusy(true);
    try {
      await pickAndRestoreBackup();
      await onRestored();
      Alert.alert(t.importDoneTitle, t.importDoneMessage);
    } catch (e) {
      if (isBackupCancelledError(e)) return;
      console.log('backup import failed', e);
      const message =
        e instanceof BackupValidationError ? t.invalidFile : t.importError;
      Alert.alert(t.errorTitle, message);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmGuide = () => {
    const mode = guideMode;
    setGuideMode(null);
    if (mode === 'export') {
      void runExport();
      return;
    }
    if (mode === 'import') {
      Alert.alert(t.importConfirmTitle, t.importConfirmMessage, [
        { text: t.cancel, style: 'cancel' },
        {
          text: t.replace,
          style: 'destructive',
          onPress: () => {
            void runImport();
          },
        },
      ]);
    }
  };

  const guideTitle = guideMode === 'import' ? t.importGuideTitle : t.exportGuideTitle;
  const guideBody = guideMode === 'import' ? t.importGuideBody : t.exportGuideBody;
  const guideConfirm =
    guideMode === 'import' ? t.importGuideConfirm : t.exportGuideConfirm;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t.sectionTitle}</Text>
      <Text style={styles.recommendedTitle}>{t.recommendedTitle}</Text>
      <Text style={styles.recommendedSteps}>{t.recommendedSteps}</Text>

      <TouchableOpacity
        style={[styles.primaryButton, accentButtonContainerStyle, busy && styles.disabled]}
        onPress={() => setGuideMode('export')}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={t.exportButton}
      >
        {busy && guideMode === null ? (
          <ActivityIndicator size="small" color={ACCENT_SURFACE_TEXT} />
        ) : (
          <Text style={[styles.primaryButtonText, accentButtonTextStyle]}>{t.exportButton}</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.secondaryButton, busy && styles.disabled]}
        onPress={() => setGuideMode('import')}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={t.importButton}
      >
        <Text style={styles.secondaryButtonText}>{t.importButton}</Text>
      </TouchableOpacity>

      <Modal
        visible={guideMode !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setGuideMode(null)}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setGuideMode(null)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{guideTitle}</Text>
            <Text style={styles.modalBody}>{guideBody}</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setGuideMode(null)}
                disabled={busy}
              >
                <Text style={styles.modalCancelText}>{t.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmButton, accentButtonContainerStyle]}
                onPress={handleConfirmGuide}
                disabled={busy}
              >
                <Text style={[styles.modalConfirmText, accentSurfaceTextStyle]}>
                  {guideConfirm}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
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
  recommendedTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 6,
  },
  recommendedSteps: {
    fontSize: 13,
    color: '#636366',
    lineHeight: 20,
    marginBottom: 14,
  },
  primaryButton: {
    borderRadius: 12,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { fontSize: 15 },
  secondaryButton: {
    marginTop: 10,
    borderRadius: 12,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D0D7E2',
    backgroundColor: '#FFFFFF',
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  disabled: { opacity: 0.7 },
  modalRoot: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    zIndex: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 12,
  },
  modalBody: {
    fontSize: 14,
    color: '#3A3A3C',
    lineHeight: 22,
    marginBottom: 18,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalCancelButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#636366',
  },
  modalConfirmButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  modalConfirmText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
