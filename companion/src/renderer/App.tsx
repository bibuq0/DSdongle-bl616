import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Gamepad2,
  Joystick,
  LayoutDashboard,
  Lightbulb,
  Mic,
  Minus,
  Moon,
  Settings,
  Sun,
  Volume2,
  X,
  type LucideIcon
} from 'lucide-react';
import {
  CONTROLLER_MODE,
  DEFAULT_REMAP_TABLE,
  POLLING_RATE_MODE,
  REMAP_BUTTON_IDS,
  REMAP_TYPE,
  type DualsenseConfig,
  type RemapButtonId,
  type RemapTable
} from '../shared/protocol';
import type { BridgeSnapshot, FlashFile, UiLanguage } from '../shared/types';
import remapLayoutArt from '../../assets/controllers/dualsense-remapping-layout.svg';
import circleGlyph from '../../assets/glyphs/ps5-buttons-outline-white/svg/Circle.svg';
import createGlyph from '../../assets/glyphs/ps5-buttons-outline-white/svg/Create.svg';
import crossGlyph from '../../assets/glyphs/ps5-buttons-outline-white/svg/Cross.svg';
import squareGlyph from '../../assets/glyphs/ps5-buttons-outline-white/svg/Square.svg';
import triangleGlyph from '../../assets/glyphs/ps5-buttons-outline-white/svg/Triangle.svg';
import l1Glyph from '../../assets/glyphs/ps5-buttons-outline-white/svg/L1.svg';
import l2Glyph from '../../assets/glyphs/ps5-buttons-outline-white/svg/L2.svg';
import r1Glyph from '../../assets/glyphs/ps5-buttons-outline-white/svg/R1.svg';
import r2Glyph from '../../assets/glyphs/ps5-buttons-outline-white/svg/R2.svg';
import createOptionsGlyph from '../../assets/glyphs/ps5-buttons-outline-white/svg/Options.svg';
import l3Glyph from '../../assets/glyphs/ps5-buttons-outline-white/svg/Left Stick Click.svg';
import r3Glyph from '../../assets/glyphs/ps5-buttons-outline-white/svg/Right Stick Click.svg';
import psGlyph from '../../assets/glyphs/ps5-buttons-outline-white/svg/Home.svg';
import touchpadGlyph from '../../assets/glyphs/ps5-buttons-outline-white/svg/Touch Pad Press.svg';
import dpadUpGlyph from '../../assets/glyphs/ps5-buttons-outline-white/svg/D-Pad Up.svg';
import dpadLeftGlyph from '../../assets/glyphs/ps5-buttons-outline-white/svg/D-Pad Left.svg';
import dpadDownGlyph from '../../assets/glyphs/ps5-buttons-outline-white/svg/D-Pad Down.svg';
import dpadRightGlyph from '../../assets/glyphs/ps5-buttons-outline-white/svg/D-Pad Right.svg';
import { useI18n, type TranslationKey } from './i18n';
import { useTheme } from './theme';

type PageId = 'overview' | 'audio' | 'haptics' | 'triggers' | 'lighting' | 'buttons' | 'system';

const PAGES: Array<{ id: PageId; key: TranslationKey; icon: LucideIcon }> = [
  { id: 'overview', key: 'nav.overview', icon: LayoutDashboard },
  { id: 'audio', key: 'nav.audio', icon: Volume2 },
  { id: 'haptics', key: 'nav.haptics', icon: Activity },
  { id: 'triggers', key: 'nav.triggers', icon: Joystick },
  { id: 'lighting', key: 'nav.lighting', icon: Lightbulb },
  { id: 'buttons', key: 'nav.buttons', icon: Gamepad2 },
  { id: 'system', key: 'nav.system', icon: Settings }
];

const CONTROLLER_MODE_LABELS: Record<number, string> = {
  [CONTROLLER_MODE.DS5]: 'DualSense',
  [CONTROLLER_MODE.DSE]: 'DualSense Edge',
  [CONTROLLER_MODE.AUTO]: 'Auto'
};

const POLLING_LABELS: Record<number, string> = {
  [POLLING_RATE_MODE.LOW]: '250 Hz',
  [POLLING_RATE_MODE.MID]: '500 Hz',
  [POLLING_RATE_MODE.REAL_TIME]: 'Real-time (~750 Hz)'
};

function batteryLabel(percent: number, state: number, t: (k: TranslationKey) => string): string {
  if (state === 0xff || percent === 255) {
    return t('common.unknown');
  }
  if (state === 0x01) {
    return `${Math.max(10, percent)}% (${t('status.charging')})`;
  }
  if (state === 0x02) {
    return `${Math.max(10, percent)}% (${t('status.full')})`;
  }
  return `${percent}%`;
}

function rssiLabel(rssi: number, known: boolean, t: (k: TranslationKey) => string): string {
  if (!known) {
    return t('common.unknown');
  }
  return `${rssi} dBm`;
}

function buttonNameKey(id: number): TranslationKey {
  const name = REMAP_BUTTON_IDS[id];
  return (name ? `btn.${name}` : 'btn.square') as TranslationKey;
}

function Row({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="row">
      <div>
        <div className="label">{label}</div>
        {hint ? <div className="hint">{hint}</div> : null}
      </div>
      <div className="field">{children}</div>
    </div>
  );
}

function Card({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="feature-card">
      {title ? <h3>{title}</h3> : null}
      {subtitle ? <p className="card-sub">{subtitle}</p> : null}
      {children}
    </section>
  );
}

function Toggle({
  value,
  onChange
}: {
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <select
      value={value ? '1' : '0'}
      onChange={(event) => onChange(event.target.value === '1')}
    >
      <option value="1">{t('common.on')}</option>
      <option value="0">{t('common.off')}</option>
    </select>
  );
}

function LanguageSwitcher(): React.JSX.Element {
  const { lang, setLang } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const ThemeIcon = theme === 'dark' ? Sun : Moon;
  return (
    <div className="language-switcher">
      <button
        type="button"
        className="theme-toggle"
        onClick={toggleTheme}
        aria-label="Toggle theme"
        title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
      >
        <ThemeIcon size={16} />
      </button>
      <select
        value={lang}
        onChange={(event) => setLang(event.target.value as UiLanguage)}
      >
        <option value="zh">中文</option>
        <option value="en">English</option>
      </select>
    </div>
  );
}

function WindowBar(): React.JSX.Element {
  return (
    <div className="window-bar">
      <div className="window-bar-brand">
        <svg width="16" height="16" viewBox="0 0 512 512" aria-hidden="true">
          <defs>
            <linearGradient id="wb-bg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#cfe9ff" />
              <stop offset="1" stopColor="#9ccbf5" />
            </linearGradient>
            <linearGradient id="wb-front" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="1" stopColor="#eaf6ff" />
            </linearGradient>
            <linearGradient id="wb-back" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#1f6bd6" />
              <stop offset="1" stopColor="#0e57b8" />
            </linearGradient>
          </defs>
          <rect width="512" height="512" rx="96" fill="url(#wb-bg)" />
          <rect x="89" y="151" width="210" height="210" rx="48" fill="none" stroke="url(#wb-front)" strokeWidth="36" />
          <circle cx="320" cy="256" r="102" fill="none" stroke="url(#wb-back)" strokeWidth="34" />
          <path d="M89 256 V199 A48 48 0 0 1 137 151 H251 A48 48 0 0 1 299 199 V256" fill="none" stroke="url(#wb-front)" strokeWidth="36" strokeLinecap="round" />
        </svg>
        DS5 Dongle
      </div>
      <div className="window-actions">
        <button type="button" onClick={() => window.bridge.minimize()} aria-label="Minimize">
          <Minus size={14} />
        </button>
        <button type="button" className="close" onClick={() => window.bridge.closeWindow()} aria-label="Close">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

export default function App(): React.JSX.Element {
  const { t } = useI18n();
  const [page, setPage] = useState<PageId>('overview');
  const [snapshot, setSnapshot] = useState<BridgeSnapshot | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void window.bridge.getSnapshot().then(setSnapshot);
    const unsubscribe = window.bridge.onSnapshot(setSnapshot);
    return unsubscribe;
  }, []);

  const config = snapshot?.config ?? null;
  const remap = snapshot?.settings?.remap ?? [];

  const apply = React.useCallback(
    (patch: Partial<DualsenseConfig>) => {
      void window.bridge.applyConfig(patch);
    },
    []
  );

  const save = React.useCallback(async () => {
    setSaving(true);
    try {
      await window.bridge.saveConfig();
    } finally {
      setSaving(false);
    }
  }, []);

  const reset = React.useCallback(() => {
    void window.bridge.resetConfig();
  }, []);

  const rescan = React.useCallback(() => {
    void window.bridge.requestRescan();
  }, []);

  const setRemapFor = React.useCallback(
    (index: number, target: number) => {
      const next: RemapTable = remap.length
        ? remap.map((entry) => ({ ...entry }))
        : DEFAULT_REMAP_TABLE.map((entry) => ({ ...entry }));
      next[index] = { type: REMAP_TYPE.BTN, value: target, modifier: 0, flags: 0 };
      void window.bridge.setRemap(next);
    },
    [remap]
  );

  const resetRemap = React.useCallback(() => {
    void window.bridge.resetRemap();
  }, []);

  const connected = snapshot?.connected ?? false;
  const busy = snapshot?.busy ?? false;
  const activePage = PAGES.find((p) => p.id === page) ?? PAGES[0];

  return (
    <>
      <WindowBar />
      <div className="app">
        <aside className="sidebar">
          <div className="sidebar-section-label">Controller</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {PAGES.map((entry) => {
              const Icon = entry.icon;
              return (
                <button
                  key={entry.id}
                  type="button"
                  className={`nav${page === entry.id ? ' active' : ''}`}
                  onClick={() => setPage(entry.id)}
                >
                  <Icon size={18} />
                  {t(entry.key)}
                </button>
              );
            })}
          </div>
          <div className="sidebar-spacer" />
          <LanguageSwitcher />
        </aside>
        <main className="content">
          <div className="page">
            <div className="feature-heading">
              <div>
                <h1>{t(activePage.key)}</h1>
                <p>{t(`${activePage.key}.subtitle` as TranslationKey)}</p>
              </div>
              <span className={`health-badge ${busy ? 'busy' : connected ? 'online' : 'offline'}`}>
                <span className="dot" />
                {busy
                  ? t('common.working')
                  : connected
                    ? t('common.connected')
                    : t('common.disconnected')}
              </span>
            </div>

            {snapshot?.lastError ? <div className="error">{snapshot.lastError}</div> : null}

            {!connected ? (
              <div className="empty-card">
                <p style={{ margin: 0 }}>{t('status.dongleNotFound')}</p>
                <div className="actions" style={{ marginTop: 12 }}>
                  <button type="button" className="secondary-action" onClick={rescan}>
                    {t('common.rescan')}
                  </button>
                </div>
              </div>
            ) : null}

            {connected && !config ? (
              <div className="empty-card">
                <p style={{ margin: 0 }}>{t('status.readingConfig')}</p>
              </div>
            ) : null}

            {connected && config ? (
              <>
                {page === 'overview' ? (
                  <Overview snapshot={snapshot!} />
                ) : page === 'audio' ? (
                  <Audio config={config} apply={apply} />
                ) : page === 'haptics' ? (
                  <Haptics config={config} apply={apply} />
                ) : page === 'triggers' ? (
                  <Triggers config={config} apply={apply} />
                ) : page === 'lighting' ? (
                  <Lighting config={config} apply={apply} />
                ) : page === 'buttons' ? (
                  <Buttons remap={remap} setRemapFor={setRemapFor} resetRemap={resetRemap} />
                ) : (
                  <>
                    <System config={config} apply={apply} />
                    <FirmwareFlash />
                  </>
                )}

                {page !== 'overview' ? (
                  <div className="actions">
                    <button type="button" className="primary-action" disabled={busy} onClick={save}>
                      {saving ? t('common.saving') : t('common.saveToDongle')}
                    </button>
                    <button type="button" className="danger-action" disabled={busy} onClick={reset}>
                      {t('common.restoreDefaults')}
                    </button>
                    {snapshot?.lastSavedAt ? (
                      <span className="saved-note">
                        {t('common.savedAt')} {new Date(snapshot.lastSavedAt).toLocaleTimeString()}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </main>
      </div>
    </>
  );
}

function Overview({ snapshot }: { snapshot: BridgeSnapshot }): React.JSX.Element {
  const { t } = useI18n();
  const { status } = snapshot;
  const batteryClass =
    status.batteryState === 0 && status.batteryPercent <= 10
      ? 'battery-critical'
      : status.batteryState === 0 && status.batteryPercent <= 20
        ? 'battery-warning'
        : '';
  // Battery/RSSI are unknown (0xFF / 1) while no controller is connected
  // over BT. batteryState is NOT a reliable online signal (firmware resets
  // it to 0 on disconnect), so only battery level + RSSI decide.
  const controllerOnline =
    status.batteryPercent !== 255 || status.rssiKnown;
  return (
    <div className="metric-grid">
      <div className="metric">
        <div className="k">{t('status.controller')}</div>
        <div className="v">
          {controllerOnline ? t('common.connected') : t('common.disconnected')}
        </div>
      </div>
      <div className="metric">
        <div className="k">{t('status.firmware')}</div>
        <div className="v">{snapshot.firmwareVersion || '—'}</div>
      </div>
      <div className="metric">
        <div className="k">{t('status.battery')}</div>
        <div className={`v ${batteryClass}`}>
          {batteryLabel(status.batteryPercent, status.batteryState, t)}
        </div>
      </div>
      <div className="metric">
        <div className="k">{t('status.rssi')}</div>
        <div className="v">{rssiLabel(status.rssi, status.rssiKnown, t)}</div>
      </div>
      <div className="metric">
        <div className="k">{t('status.speakerStream')}</div>
        <div className="v">{status.speakerActive ? t('common.on') : t('common.off')}</div>
      </div>
      <div className="metric">
        <div className="k">{t('status.micStream')}</div>
        <div className="v">{status.micActive ? t('common.on') : t('common.off')}</div>
      </div>
    </div>
  );
}

function Audio({
  config,
  apply
}: {
  config: DualsenseConfig;
  apply: (patch: Partial<DualsenseConfig>) => void;
}): React.JSX.Element {
  const { t } = useI18n();
  return (
    <div className="feature-card-grid">
      <Card title={t('audio.volume')}>
        <Row label={t('audio.speakerVolume')}>
          <input
            type="range"
            min={0}
            max={127}
            value={config.speakerVolume}
            onChange={(event) => apply({ speakerVolume: Number(event.target.value) })}
          />
          <span className="value-readout">{config.speakerVolume}</span>
        </Row>
        <Row label={t('audio.headsetVolume')}>
          <input
            type="range"
            min={0}
            max={127}
            value={config.headsetVolume}
            onChange={(event) => apply({ headsetVolume: Number(event.target.value) })}
          />
          <span className="value-readout">{config.headsetVolume}</span>
        </Row>
        <Row label={t('audio.speakerGain')} hint={t('audio.speakerGainHint')}>
          <input
            type="number"
            min={0}
            max={7}
            value={config.speakerGain}
            onChange={(event) => apply({ speakerGain: Number(event.target.value) })}
          />
        </Row>
        <Row label={t('audio.bufferLength')} hint={t('audio.bufferLengthHint')}>
          <input
            type="number"
            min={16}
            max={128}
            value={config.audioBufferLength}
            onChange={(event) => apply({ audioBufferLength: Number(event.target.value) })}
          />
        </Row>
        <Row label={t('audio.volumeLock')} hint={t('audio.volumeLockHint')}>
          <Toggle value={config.lockVolume} onChange={(value) => apply({ lockVolume: value })} />
        </Row>
      </Card>
      <Card title={t('audio.passthrough')}>
        <Row label={t('audio.micPassthrough')}>
          <Toggle value={!config.disableMic} onChange={(value) => apply({ disableMic: !value })} />
        </Row>
        <Row label={t('audio.speakerPassthrough')}>
          <Toggle
            value={!config.disableSpeaker}
            onChange={(value) => apply({ disableSpeaker: !value })}
          />
        </Row>
      </Card>
    </div>
  );
}

function Haptics({
  config,
  apply
}: {
  config: DualsenseConfig;
  apply: (patch: Partial<DualsenseConfig>) => void;
}): React.JSX.Element {
  const { t } = useI18n();
  return (
    <div className="feature-card-grid single">
      <Card title={t('haptics.gain')} subtitle={t('haptics.gainHint')}>
        <Row label={t('haptics.gain')}>
          <input
            type="range"
            min={100}
            max={200}
            step={5}
            value={Math.round(config.hapticsGain * 100)}
            onChange={(event) => apply({ hapticsGain: Number(event.target.value) / 100 })}
          />
          <span className="value-readout">{config.hapticsGain.toFixed(2)}</span>
        </Row>
      </Card>
    </div>
  );
}

function Triggers({
  config,
  apply
}: {
  config: DualsenseConfig;
  apply: (patch: Partial<DualsenseConfig>) => void;
}): React.JSX.Element {
  const { t } = useI18n();
  return (
    <div className="feature-card-grid single">
      <Card title={t('triggers.reduction')} subtitle={t('triggers.reductionHint')}>
        <Row label={t('triggers.reduction')}>
          <input
            type="range"
            min={0}
            max={10}
            value={config.triggerReduce}
            onChange={(event) => apply({ triggerReduce: Number(event.target.value) })}
          />
          <span className="value-readout">{config.triggerReduce}</span>
        </Row>
      </Card>
    </div>
  );
}

function Lighting({
  config,
  apply
}: {
  config: DualsenseConfig;
  apply: (patch: Partial<DualsenseConfig>) => void;
}): React.JSX.Element {
  const { t } = useI18n();
  const [r, g, b] = config.ledColor;
  const hex = useMemo(
    () => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`,
    [r, g, b]
  );
  return (
    <div className="feature-card-grid">
      <Card title={t('lighting.color')} subtitle={t('lighting.colorHint')}>
        <Row label={t('lighting.color')}>
          <input
            type="color"
            value={hex}
            onChange={(event) => {
              const value = event.target.value.slice(1);
              apply({
                ledColor: [
                  parseInt(value.slice(0, 2), 16),
                  parseInt(value.slice(2, 4), 16),
                  parseInt(value.slice(4, 6), 16)
                ]
              });
            }}
          />
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{hex}</span>
        </Row>
      </Card>
      <Card title={t('lighting.ledAutoOff')} subtitle={t('lighting.ledAutoOffHint')}>
        <Row label={t('lighting.ledAutoOff')}>
          <Toggle value={config.disableLed} onChange={(value) => apply({ disableLed: value })} />
        </Row>
      </Card>
    </div>
  );
}

const BUTTON_GLYPHS: Record<number, string> = {
  0: squareGlyph,
  1: crossGlyph,
  2: circleGlyph,
  3: triangleGlyph,
  4: l1Glyph,
  5: r1Glyph,
  6: l2Glyph,
  7: r2Glyph,
  8: createGlyph,
  9: createOptionsGlyph,
  10: l3Glyph,
  11: r3Glyph,
  12: psGlyph,
  13: touchpadGlyph,
  15: dpadUpGlyph,
  16: dpadLeftGlyph,
  17: dpadDownGlyph,
  18: dpadRightGlyph
};

/** Icon in currentColor via CSS mask — theme-aware. */
function Glyph({
  url,
  size = 18,
  title
}: {
  url: string;
  size?: number;
  title?: string;
}): React.JSX.Element {
  const mask = `url("${url}")`;
  return (
    <span
      className="glyph"
      title={title}
      style={{ width: size, height: size, WebkitMaskImage: mask, maskImage: mask }}
    />
  );
}

function buttonGlyph(index: number): string {
  return BUTTON_GLYPHS[index] ?? squareGlyph;
}

function Buttons({
  remap,
  setRemapFor,
  resetRemap
}: {
  remap: RemapTable;
  setRemapFor: (index: number, target: number) => void;
  resetRemap: () => void;
}): React.JSX.Element {
  const { t } = useI18n();
  const [editing, setEditing] = useState<number | null>(null);

  const remapPill = (index: number) => {
    const entry = remap[index];
    const target = entry ? entry.value : index;
    const mapped = target !== index;
    return (
      <button
        key={index}
        type="button"
        className={`remap-pill${mapped ? ' changed' : ''}${editing === index ? ' editing' : ''}`}
        onClick={() => setEditing(editing === index ? null : index)}
        title={`${t(buttonNameKey(index))} → ${t(buttonNameKey(target))}`}
      >
        <span className="rp-src">
          {index === 14 ? (
            <Mic size={22} />
          ) : (
            <Glyph url={buttonGlyph(index)} size={22} title={t(buttonNameKey(index))} />
          )}
        </span>
        <span className="rp-arrow">
          <ArrowRight width={38} height={14} strokeWidth={3} />
        </span>
        <span className="rp-dst">
          {target === 14 ? (
            <Mic size={24} />
          ) : (
            <Glyph url={buttonGlyph(target)} size={24} title={t(buttonNameKey(target))} />
          )}
        </span>
      </button>
    );
  };

  const leftPills = [6, 4, 8, 15, 16, 18, 17, 10].map(remapPill); // L2 L1 Create Up Left Right Down L3
  const rightPills = [7, 5, 9, 3, 2, 0, 1, 11].map(remapPill); // R2 R1 Options Tri Circ Square Cross R3
  const bottomPills = [13, 12, 14].map(remapPill); // Touchpad PS Mute

  return (
    <div className="feature-card-grid single">
      <Card title={t('buttons.title')} subtitle={t('buttons.intro')}>
        <div className="remap-wrap">
          <div className="remap-grid">
            <div className="remap-col">{leftPills}</div>
            <img className="remap-art" src={remapLayoutArt} alt="" />
            <div className="remap-col">{rightPills}</div>
          </div>
          <div className="remap-bottom">{bottomPills}</div>
        </div>
        {editing !== null ? (
          <TargetPicker
            source={editing}
            current={remap[editing]?.value ?? editing}
            onPick={(target) => {
              setRemapFor(editing, target);
              setEditing(null);
            }}
            onCancel={() => setEditing(null)}
          />
        ) : null}
        <div className="actions" style={{ marginTop: 14 }}>
          <button type="button" className="secondary-action" onClick={resetRemap}>
            {t('buttons.resetIdentity')}
          </button>
        </div>
      </Card>
    </div>
  );
}

function TargetPicker({
  source,
  current,
  onPick,
  onCancel
}: {
  source: number;
  current: number;
  onPick: (target: number) => void;
  onCancel: () => void;
}): React.JSX.Element {
  const { t } = useI18n();
  return (
    <div className="target-picker">
      <div className="target-picker-title">
        {t('buttons.button')}: {t(buttonNameKey(source))} → {t('buttons.mappedTo')}:
      </div>
      <div className="target-picker-grid">
        {REMAP_BUTTON_IDS.map((_, targetIndex) => (
          <button
            key={targetIndex}
            type="button"
            className={`target-chip${targetIndex === current ? ' active' : ''}`}
            onClick={() => onPick(targetIndex)}
            title={t(buttonNameKey(targetIndex))}
          >
            {targetIndex === 14 ? (
              <Mic size={20} />
            ) : (
              <Glyph url={buttonGlyph(targetIndex)} size={20} />
            )}
          </button>
        ))}
      </div>
      <button type="button" className="secondary-action" onClick={onCancel} style={{ marginTop: 10 }}>
        {t('common.cancel')}
      </button>
    </div>
  );
}

function System({
  config,
  apply
}: {
  config: DualsenseConfig;
  apply: (patch: Partial<DualsenseConfig>) => void;
}): React.JSX.Element {
  const { t } = useI18n();
  return (
    <div className="feature-card-grid">
      <Card title={t('system.controller')}>
        <Row label={t('system.controllerMode')} hint={t('system.controllerModeHint')}>
          <select
            value={config.controllerMode}
            onChange={(event) => apply({ controllerMode: Number(event.target.value) })}
          >
            <option value={CONTROLLER_MODE.DS5}>{CONTROLLER_MODE_LABELS[CONTROLLER_MODE.DS5]}</option>
            <option value={CONTROLLER_MODE.DSE}>{CONTROLLER_MODE_LABELS[CONTROLLER_MODE.DSE]}</option>
            <option value={CONTROLLER_MODE.AUTO}>{CONTROLLER_MODE_LABELS[CONTROLLER_MODE.AUTO]}</option>
          </select>
        </Row>
        <Row label={t('system.pollingRate')} hint={t('system.pollingRateHint')}>
          <select
            value={config.pollingRateMode}
            onChange={(event) => apply({ pollingRateMode: Number(event.target.value) })}
          >
            <option value={POLLING_RATE_MODE.LOW}>{POLLING_LABELS[POLLING_RATE_MODE.LOW]}</option>
            <option value={POLLING_RATE_MODE.MID}>{POLLING_LABELS[POLLING_RATE_MODE.MID]}</option>
            <option value={POLLING_RATE_MODE.REAL_TIME}>{POLLING_LABELS[POLLING_RATE_MODE.REAL_TIME]}</option>
          </select>
        </Row>
        <Row label={t('system.idleDisconnect')} hint={t('system.idleDisconnectHint')}>
          <input
            type="number"
            min={0}
            max={60}
            value={config.inactiveMinutes}
            onChange={(event) => apply({ inactiveMinutes: Number(event.target.value) })}
          />
        </Row>
      </Card>
      <Card title={t('system.controller')}>
        <Row label={t('system.usbWake')}>
          <Toggle value={config.enableWake} onChange={(value) => apply({ enableWake: value })} />
        </Row>
        <Row label={t('system.usbStealth')} hint={t('system.usbStealthHint')}>
          <Toggle value={config.usbStealth} onChange={(value) => apply({ usbStealth: value })} />
        </Row>
        <Row label={t('system.usbSerial')} hint={t('system.usbSerialHint')}>
          <Toggle value={config.enableUsbSn} onChange={(value) => apply({ enableUsbSn: value })} />
        </Row>
        <Row label={t('system.psShortcut')} hint={t('system.psShortcutHint')}>
          <Toggle
            value={config.psShortcutEnabled}
            onChange={(value) => apply({ psShortcutEnabled: value })}
          />
        </Row>
      </Card>
    </div>
  );
}

function FirmwareFlash(): React.JSX.Element {
  const { t } = useI18n();
  const [toolReady, setToolReady] = useState<boolean | null>(null);
  const [ports, setPorts] = useState<string[]>([]);
  const [port, setPort] = useState('');
  const [boot2Path, setBoot2Path] = useState('');
  const [partitionPath, setPartitionPath] = useState('');
  const [firmwarePath, setFirmwarePath] = useState('');
  const [flashing, setFlashing] = useState(false);
  const [log, setLog] = useState('');

  useEffect(() => {
    void window.bridge.findFlashTool().then((value) => setToolReady(Boolean(value)));
    void window.bridge.listSerialPorts().then(setPorts).catch(() => undefined);
    void window.bridge.flashDefaultFiles().then((files) => {
      const byAddress = new Map(files.map((file: FlashFile) => [file.address, file.path]));
      setBoot2Path(byAddress.get(0x000000) ?? '');
      setPartitionPath(byAddress.get(0x00e000) ?? '');
      setFirmwarePath(byAddress.get(0x010000) ?? '');
    });
  }, []);

  const refreshPorts = async (): Promise<void> => {
    try {
      setPorts(await window.bridge.listSerialPorts());
    } catch {
      setPorts([]);
    }
  };

  const doFlash = async (): Promise<void> => {
    if (!port) {
      setLog(t('flash.selectPortFirst'));
      return;
    }
    const files: FlashFile[] = [
      { address: 0x000000, path: boot2Path },
      { address: 0x00e000, path: partitionPath },
      { address: 0x010000, path: firmwarePath }
    ];
    setFlashing(true);
    setLog('');
    try {
      const result = await window.bridge.flash(port, files, firmwarePath);
      setLog(
        (result.ok ? t('flash.ok') : `${t('flash.failed')}: ${result.error ?? 'unknown'}\n`) +
          result.output
      );
    } catch (error) {
      setLog(`${t('flash.failed')}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setFlashing(false);
    }
  };

  return (
    <div className="feature-card-grid single" style={{ marginTop: 14 }}>
      <Card title={t('flash.title')} subtitle={t('flash.intro')}>
        <Row label={t('flash.tool')} hint={t('flash.toolHint')}>
          <span className={`health-badge ${toolReady ? 'online' : 'offline'}`}>
            <span className="dot" />
            {toolReady === null
              ? t('common.checking')
              : toolReady
                ? t('common.found')
                : t('common.notFound')}
          </span>
        </Row>
        <Row label={t('flash.port')}>
          <select value={port} onChange={(event) => setPort(event.target.value)}>
            <option value="">{t('flash.selectPort')}</option>
            {ports.map((candidate) => (
              <option key={candidate} value={candidate}>
                {candidate}
              </option>
            ))}
          </select>
          <button type="button" className="secondary-action" onClick={refreshPorts} style={{ minHeight: 36, padding: '0 12px' }}>
            {t('flash.refresh')}
          </button>
        </Row>
        <Row label={t('flash.boot2')} hint={t('flash.boot2Hint')}>
          <input
            type="text"
            style={{ width: 300 }}
            value={boot2Path}
            onChange={(event) => setBoot2Path(event.target.value)}
          />
        </Row>
        <Row label={t('flash.partition')} hint={t('flash.partitionHint')}>
          <input
            type="text"
            style={{ width: 300 }}
            value={partitionPath}
            onChange={(event) => setPartitionPath(event.target.value)}
          />
        </Row>
        <Row label={t('flash.firmware')} hint={t('flash.firmwareHint')}>
          <input
            type="text"
            style={{ width: 300 }}
            value={firmwarePath}
            onChange={(event) => setFirmwarePath(event.target.value)}
          />
        </Row>
        <div className="actions" style={{ marginTop: 14 }}>
          <button
            type="button"
            className="primary-action"
            disabled={flashing || !toolReady}
            onClick={doFlash}
          >
            {flashing ? t('flash.flashing') : t('flash.go')}
          </button>
        </div>
        {log ? <pre className="flash-log" style={{ marginTop: 12 }}>{log}</pre> : null}
      </Card>
    </div>
  );
}
