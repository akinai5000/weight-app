import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  DEFAULT_THEME_COLOR,
  type ThemeColorOption,
  isPresetThemeColor,
  normalizeThemeHex,
} from '@/constants/ThemePresets';

export type ThemeContextValue = {
  color: string;
  setColor: (next: ThemeColorOption) => Promise<void>;
  reloadFromStorage: () => Promise<void>;
};

const STORAGE_KEY = '@theme_color';

const ThemeContext = createContext<ThemeContextValue>({
  color: DEFAULT_THEME_COLOR,
  setColor: async () => {},
  reloadFromStorage: async () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [color, setColorState] = useState<string>(DEFAULT_THEME_COLOR);

  const reloadFromStorage = useCallback(async () => {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      const normalized = saved ? normalizeThemeHex(saved) : null;
      if (normalized && isPresetThemeColor(normalized)) {
        setColorState(normalized as ThemeColorOption);
      } else {
        setColorState(DEFAULT_THEME_COLOR);
      }
    } catch (e) {
      console.log('theme load failed', e);
    }
  }, []);

  useEffect(() => {
    void reloadFromStorage();
  }, [reloadFromStorage]);

  const setColor = useCallback(async (next: ThemeColorOption) => {
    setColorState(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, next);
    } catch (e) {
      console.log('theme save failed', e);
    }
  }, []);

  const value = useMemo(
    () => ({ color, setColor, reloadFromStorage }),
    [color, setColor, reloadFromStorage],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeColor() {
  return useContext(ThemeContext);
}
