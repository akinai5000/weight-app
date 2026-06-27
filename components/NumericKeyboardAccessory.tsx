import React, { useCallback, useEffect, useState } from 'react';
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  accentButtonContainerStyle,
  accentButtonTextStyle,
} from '@/constants/ThemePresets';

/** 記録タブの体重入力用 */
export const RECORD_WEIGHT_KEYBOARD_ACCESSORY_ID = 'weight-input-accessory';

/**
 * 設定タブの数値入力用（入力ごとに一意の ID が必要）
 * RN 0.76+ では同一 inputAccessoryViewID を複数 TextInput で共有すると
 * 最初にフォーカスした入力以外で完了バーが表示されない
 */
export const SETTINGS_INITIAL_WEIGHT_ACCESSORY_ID = 'profile-initial-weight-accessory';
export const SETTINGS_TARGET_WEIGHT_ACCESSORY_ID = 'profile-target-weight-accessory';
export const SETTINGS_HABIT_COUNT_ACCESSORY_ID = 'profile-habit-count-accessory';

/** 体重設定セクションの数値入力用（習慣回数はフォーム内で別途マウント） */
export const SETTINGS_GOAL_KEYBOARD_ACCESSORY_IDS = [
  SETTINGS_INITIAL_WEIGHT_ACCESSORY_ID,
  SETTINGS_TARGET_WEIGHT_ACCESSORY_ID,
] as const;

/** @deprecated SETTINGS_GOAL_KEYBOARD_ACCESSORY_IDS を使用してください */
export const SETTINGS_NUMERIC_KEYBOARD_ACCESSORY_IDS = SETTINGS_GOAL_KEYBOARD_ACCESSORY_IDS;

/** @deprecated 入力ごとの ID を使用してください */
export const SETTINGS_NUMERIC_KEYBOARD_ACCESSORY_ID = SETTINGS_INITIAL_WEIGHT_ACCESSORY_ID;

/** @deprecated SETTINGS_INITIAL_WEIGHT_ACCESSORY_ID 等を使用してください */
export const SETTINGS_NUMERIC_INPUT_ACCESSORY_ID = SETTINGS_INITIAL_WEIGHT_ACCESSORY_ID;

export function getInputAccessoryViewId(accessoryId: string): string | undefined {
  return Platform.OS === 'ios' ? accessoryId : undefined;
}

type DoneBarProps = {
  doneLabel: string;
  onPress?: () => void;
};

export function NumericKeyboardDoneBar({ doneLabel, onPress }: DoneBarProps) {
  const handlePress = useCallback(() => {
    onPress?.();
    Keyboard.dismiss();
  }, [onPress]);

  return (
    <View style={styles.bar}>
      <TouchableOpacity
        style={[styles.button, accentButtonContainerStyle]}
        onPress={handlePress}
        activeOpacity={0.75}
        hitSlop={4}
      >
        <Text style={[styles.buttonText, accentButtonTextStyle]}>{doneLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

type PortalProps = {
  accessoryId: string;
  doneLabel: string;
  onDone?: () => void;
  /** 非フォーカスタブでは InputAccessoryView をマウントしない（nativeID 衝突防止） */
  visible?: boolean;
};

export function NumericKeyboardAccessoryPortal({
  accessoryId,
  doneLabel,
  onDone,
  visible = true,
}: PortalProps) {
  if (Platform.OS !== 'ios' || !visible) return null;

  return (
    <InputAccessoryView nativeID={accessoryId} backgroundColor="#FFFFFF">
      <NumericKeyboardDoneBar doneLabel={doneLabel} onPress={onDone} />
    </InputAccessoryView>
  );
}

type SettingsPortalsProps = {
  doneLabel: string;
  visible?: boolean;
  onDone?: () => void;
};

/** 設定タブの全数値入力向け InputAccessoryView（RN 0.76+ 対応） */
export function SettingsNumericKeyboardAccessoryPortals({
  doneLabel,
  visible = true,
  onDone,
}: SettingsPortalsProps) {
  return (
    <>
      {SETTINGS_GOAL_KEYBOARD_ACCESSORY_IDS.map((accessoryId) => (
        <NumericKeyboardAccessoryPortal
          key={accessoryId}
          accessoryId={accessoryId}
          doneLabel={doneLabel}
          onDone={onDone}
          visible={visible}
        />
      ))}
    </>
  );
}

export function useAndroidKeyboardToolbarHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      setHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return height;
}

type AndroidToolbarProps = {
  doneLabel: string;
  visible: boolean;
  keyboardHeight: number;
  onDone?: () => void;
};

export function AndroidNumericKeyboardToolbar({
  doneLabel,
  visible,
  keyboardHeight,
  onDone,
}: AndroidToolbarProps) {
  if (!visible || keyboardHeight <= 0) return null;

  return (
    <View
      style={[styles.androidToolbar, { bottom: keyboardHeight }]}
      pointerEvents="box-none"
    >
      <NumericKeyboardDoneBar doneLabel={doneLabel} onPress={onDone} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: 48,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingVertical: 6,
    paddingRight: 12,
  },
  androidToolbar: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1000,
    elevation: 24,
    minHeight: 48,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingVertical: 6,
    paddingRight: 12,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  button: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: 'bold',
  },
});
