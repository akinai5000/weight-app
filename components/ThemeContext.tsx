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
};

const STORAGE_KEY = '@theme_color';

const ThemeContext = createContext<ThemeContextValue>({
  color: DEFAULT_THEME_COLOR,
  setColor: async () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [color, setColorState] = useState<string>(DEFAULT_THEME_COLOR);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        const normalized = saved ? normalizeThemeHex(saved) : null;
        if (normalized && isPresetThemeColor(normalized)) {
          setColorState(normalized as ThemeColorOption);
        }
      } catch (e) {
        console.log('theme load failed', e);
      }
    })();
  }, []);

  const setColor = useCallback(async (next: ThemeColorOption) => {
    setColorState(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, next);
    } catch (e) {
      console.log('theme save failed', e);
    }
  }, []);

  const value = useMemo(() => ({ color, setColor }), [color, setColor]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeColor() {
  return useContext(ThemeContext);
}
