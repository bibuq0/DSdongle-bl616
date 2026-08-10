import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { UiLanguage, UiScalePercent, UiThemePreset } from '../shared/types';

export interface AppSettings {
  uiScale: UiScalePercent;
  uiTheme: UiThemePreset;
  language: UiLanguage;
}

const DEFAULT_SETTINGS: AppSettings = {
  uiScale: 100,
  uiTheme: 'light',
  language: 'zh'
};

const SCALES: UiScalePercent[] = [75, 100, 125, 150];
const THEMES: UiThemePreset[] = ['light', 'dark'];
const LANGUAGES: UiLanguage[] = ['en', 'zh'];

export function normalizeUiScalePercent(value: unknown): UiScalePercent {
  return SCALES.includes(value as UiScalePercent) ? (value as UiScalePercent) : 100;
}

export function normalizeUiThemePreset(value: unknown): UiThemePreset {
  return THEMES.includes(value as UiThemePreset) ? (value as UiThemePreset) : 'light';
}

export function normalizeUiLanguage(value: unknown): UiLanguage {
  return LANGUAGES.includes(value as UiLanguage) ? (value as UiLanguage) : 'en';
}

/**
 * Minimal app-preference store (UI scale / theme). Device-side
 * configuration lives on the dongle itself (feature report 0xF6/0xF7).
 */
export class SettingsStore {
  private settings: AppSettings = { ...DEFAULT_SETTINGS };

  constructor(private readonly filePath: string) {
    this.load();
  }

  static createIn(userDataDir: string): SettingsStore {
    return new SettingsStore(path.join(userDataDir, 'ds5dongle-settings.json'));
  }

  get(): AppSettings {
    return { ...this.settings };
  }

  setScale(scale: UiScalePercent): AppSettings {
    this.settings.uiScale = normalizeUiScalePercent(scale);
    this.save();
    return this.get();
  }

  setTheme(theme: UiThemePreset): AppSettings {
    this.settings.uiTheme = normalizeUiThemePreset(theme);
    this.save();
    return this.get();
  }

  setLanguage(language: UiLanguage): AppSettings {
    this.settings.language = normalizeUiLanguage(language);
    this.save();
    return this.get();
  }

  private load(): void {
    if (!existsSync(this.filePath)) {
      return;
    }
    try {
      const raw = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<AppSettings>;
      this.settings.uiScale = normalizeUiScalePercent(raw.uiScale);
      this.settings.uiTheme = normalizeUiThemePreset(raw.uiTheme);
      this.settings.language = normalizeUiLanguage(raw.language);
    } catch {
      // Corrupt store: keep defaults.
    }
  }

  private save(): void {
    try {
      mkdirSync(path.dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, JSON.stringify(this.settings, null, 2), 'utf8');
    } catch {
      // Non-fatal.
    }
  }
}
