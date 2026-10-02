import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useColorScheme } from 'react-native';

import { getThemeColors, ThemeTokens, type AppTheme } from '@/constants/theme';

const THEME_STORAGE_KEY = 'shyam-sql-lab:theme';

type ThemeContextValue = {
  theme: AppTheme;
  isDark: boolean;
  colors: ReturnType<typeof getThemeColors>;
  setTheme: (theme: AppTheme) => Promise<void>;
  toggleTheme: () => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

type ThemeProviderProps = {
  children: React.ReactNode;
};

function isAppTheme(value: string | null): value is AppTheme {
  return value === 'light' || value === 'dark';
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const systemColorScheme = useColorScheme();
  const systemTheme: AppTheme = systemColorScheme === 'dark' ? 'dark' : 'light';
  const [theme, setThemeState] = useState<AppTheme>(systemTheme);
  const hasExplicitChoice = useRef(false);

  useEffect(() => {
    let active = true;

    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((storedTheme) => {
        if (active && !hasExplicitChoice.current && isAppTheme(storedTheme)) {
          setThemeState(storedTheme);
        }
      })
      .catch((error: unknown) => {
        if (active && __DEV__) {
          console.error('[Theme] Unable to restore the saved theme preference.', error);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hasExplicitChoice.current) {
      setThemeState(systemTheme);
    }
  }, [systemTheme]);

  const setTheme = useCallback(async (nextTheme: AppTheme) => {
    hasExplicitChoice.current = true;
    setThemeState(nextTheme);

    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch (error) {
      if (__DEV__) {
        console.error('[Theme] Unable to persist the theme preference.', error);
      }
      throw error;
    }
  }, []);

  const toggleTheme = useCallback(
    () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    [setTheme, theme],
  );

  const value = useMemo(
    () => ({
      theme,
      isDark: theme === 'dark',
      colors: getThemeColors(theme),
      setTheme,
      toggleTheme,
    }),
    [setTheme, theme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useAppTheme must be used inside ThemeProvider.');
  }
  return context;
}

export { ThemeTokens };
