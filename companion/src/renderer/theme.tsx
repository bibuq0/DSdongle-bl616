import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { UiThemePreset } from '../shared/types';

type ThemeContextValue = {
  theme: UiThemePreset;
  setTheme: (theme: UiThemePreset) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [theme, setThemeState] = useState<UiThemePreset>('dark');

  useEffect(() => {
    void window.bridge
      .getSettings()
      .then((settings) => setThemeState(settings.uiTheme))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme: (next) => {
        setThemeState(next);
        void window.bridge.setTheme(next).catch(() => undefined);
      },
      toggleTheme: () => {
        setThemeState((current) => {
          const next = current === 'dark' ? 'light' : 'dark';
          void window.bridge.setTheme(next).catch(() => undefined);
          return next;
        });
      }
    }),
    [theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return context;
}
