import React, { useEffect, useMemo, useState } from 'react';
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
import type { BridgeSnapshot, FlashFile } from '../shared/types';

type PageId = 'overview' | 'audio' | 'haptics' | 'triggers' | 'lighting' | 'buttons' | 'system';

const PAGES: Array<{ id: PageId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'audio', label: 'Audio' },
  { id: 'haptics', label: 'Haptics' },
  { id: 'triggers', label: 'Triggers' },
  { id: 'lighting', label: 'Lighting' },
  { id: 'buttons', label: 'Buttons' },
  { id: 'system', label: 'System' }
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

function batteryLabel(percent: number, state: number): string {
  if (state === 0xff || percent === 255) {
    return 'Unknown';
  }
  if (state === 0x01) {
    return `${Math.max(10, percent)}% (charging)`;
  }
  if (state === 0x02) {
    return `${Math.max(10, percent)}% (full)`;
  }
  return `${percent}%`;
}

function rssiLabel(rssi: number, known: boolean): string {
  if (!known) {
    return 'Unknown';
  }
  return `${rssi} dBm`;
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

function Toggle({
  value,
  onChange
}: {
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <select
      value={value ? '1' : '0'}
      onChange={(event) => onChange(event.target.value === '1')}
    >
      <option value="1">On</option>
      <option value="0">Off</option>
    </select>
  );
}

function RemapButtonLabel(id: number): string {
  return REMAP_BUTTON_IDS[id] ?? `#${id}`;
}

export default function App(): React.JSX.Element {
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

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">DS5 Dongle</div>
        {PAGES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`nav${page === entry.id ? ' active' : ''}`}
            onClick={() => setPage(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </aside>
      <main className="content">
        <div className="page">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <h1 style={{ margin: 0, flex: 1 }}>{PAGES.find((p) => p.id === page)?.label}</h1>
            <span className={`badge ${busy ? 'busy' : connected ? 'online' : 'offline'}`}>
              {busy ? 'Working...' : connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>

          {snapshot?.lastError ? <div className="error">{snapshot.lastError}</div> : null}

          {!connected ? (
            <div className="card">
              <p style={{ margin: 0 }}>
                Dongle not detected. Connect the DS5Dongle BL616 to USB, then try again.
              </p>
              <div className="actions">
                <button type="button" className="primary" onClick={rescan}>
                  Rescan
                </button>
              </div>
            </div>
          ) : null}

          {connected && !config ? (
            <div className="card">
              <p style={{ margin: 0 }}>Reading dongle configuration...</p>
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

              <div className="actions">
                <button type="button" className="primary" disabled={busy} onClick={save}>
                  {saving ? 'Saving...' : 'Save to dongle'}
                </button>
                <button type="button" className="danger" disabled={busy} onClick={reset}>
                  Restore defaults
                </button>
                {snapshot?.lastSavedAt ? (
                  <span style={{ color: 'var(--text-dim)', alignSelf: 'center', fontSize: 12 }}>
                    Saved {new Date(snapshot.lastSavedAt).toLocaleTimeString()}
                  </span>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}

function Overview({ snapshot }: { snapshot: BridgeSnapshot }): React.JSX.Element {
  const { status } = snapshot;
  return (
    <div className="status-grid">
      <div className="stat">
        <div className="k">Firmware</div>
        <div className="v">{snapshot.firmwareVersion || '—'}</div>
      </div>
      <div className="stat">
        <div className="k">Battery</div>
        <div className={`v ${status.batteryState === 0 && status.batteryPercent <= 10 ? 'battery-critical' : status.batteryState === 0 && status.batteryPercent <= 20 ? 'battery-warning' : ''}`}>
          {batteryLabel(status.batteryPercent, status.batteryState)}
        </div>
      </div>
      <div className="stat">
        <div className="k">Bluetooth RSSI</div>
        <div className="v">{rssiLabel(status.rssi, status.rssiKnown)}</div>
      </div>
      <div className="stat">
        <div className="k">Speaker stream</div>
        <div className="v">{status.speakerActive ? 'Active' : 'Idle'}</div>
      </div>
      <div className="stat">
        <div className="k">Microphone stream</div>
        <div className="v">{status.micActive ? 'Active' : 'Idle'}</div>
      </div>
      <div className="stat">
        <div className="k">Uptime</div>
        <div className="v">{snapshot.uptimeSeconds}s</div>
      </div>
      {snapshot.devicePath ? (
        <div className="stat">
          <div className="k">Device path</div>
          <div className="v" style={{ fontSize: 12, fontWeight: 400 }}>
            {snapshot.devicePath}
          </div>
        </div>
      ) : null}
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
  return (
    <>
      <h2>Volume</h2>
      <div className="card">
        <Row label="Speaker volume" hint="0–127">
          <input
            type="range"
            min={0}
            max={127}
            value={config.speakerVolume}
            onChange={(event) => apply({ speakerVolume: Number(event.target.value) })}
          />
          <span style={{ width: 36, textAlign: 'right' }}>{config.speakerVolume}</span>
        </Row>
        <Row label="Headset volume" hint="0–127">
          <input
            type="range"
            min={0}
            max={127}
            value={config.headsetVolume}
            onChange={(event) => apply({ headsetVolume: Number(event.target.value) })}
          />
          <span style={{ width: 36, textAlign: 'right' }}>{config.headsetVolume}</span>
        </Row>
        <Row label="Speaker gain" hint="SpeakerCompPreGain, 0–7">
          <input
            type="number"
            min={0}
            max={7}
            value={config.speakerGain}
            onChange={(event) => apply({ speakerGain: Number(event.target.value) })}
          />
        </Row>
        <Row label="Audio buffer length" hint="Controller audio buffer depth, 16–128">
          <input
            type="number"
            min={16}
            max={128}
            value={config.audioBufferLength}
            onChange={(event) => apply({ audioBufferLength: Number(event.target.value) })}
          />
        </Row>
        <Row label="Volume lock" hint="Prevent the host from changing volumes">
          <Toggle value={config.lockVolume} onChange={(value) => apply({ lockVolume: value })} />
        </Row>
      </div>
      <h2>Passthrough</h2>
      <div className="card">
        <Row label="Microphone passthrough">
          <Toggle value={!config.disableMic} onChange={(value) => apply({ disableMic: !value })} />
        </Row>
        <Row label="Speaker passthrough">
          <Toggle
            value={!config.disableSpeaker}
            onChange={(value) => apply({ disableSpeaker: !value })}
          />
        </Row>
      </div>
    </>
  );
}

function Haptics({
  config,
  apply
}: {
  config: DualsenseConfig;
  apply: (patch: Partial<DualsenseConfig>) => void;
}): React.JSX.Element {
  return (
    <div className="card">
      <Row label="Haptics gain" hint="HD haptics amplitude scaling, 1.0–2.0">
        <input
          type="range"
          min={100}
          max={200}
          step={5}
          value={Math.round(config.hapticsGain * 100)}
          onChange={(event) => apply({ hapticsGain: Number(event.target.value) / 100 })}
        />
        <span style={{ width: 48, textAlign: 'right' }}>{config.hapticsGain.toFixed(2)}</span>
      </Row>
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
  return (
    <div className="card">
      <Row label="Trigger motor power reduction" hint="0 = full power, 10 = minimum">
        <input
          type="range"
          min={0}
          max={10}
          value={config.triggerReduce}
          onChange={(event) => apply({ triggerReduce: Number(event.target.value) })}
        />
        <span style={{ width: 36, textAlign: 'right' }}>{config.triggerReduce}</span>
      </Row>
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
  const [r, g, b] = config.ledColor;
  const hex = useMemo(
    () =>
      `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`,
    [r, g, b]
  );
  return (
    <>
      <div className="card">
        <Row label="Custom lightbar color" hint="Applied to the controller on the next connection">
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
        <Row label="LED auto-off" hint="Turn steady LEDs off after 1 minute">
          <Toggle value={config.disableLed} onChange={(value) => apply({ disableLed: value })} />
        </Row>
      </div>
    </>
  );
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
  return (
    <>
      <div className="card">
        <p style={{ marginTop: 0 }}>
          Remap any controller button to another controller button. Changes take effect
          immediately and are saved to the dongle.
        </p>
        <table className="remap-table">
          <thead>
            <tr>
              <th>Button</th>
              <th>Mapped to</th>
            </tr>
          </thead>
          <tbody>
            {REMAP_BUTTON_IDS.map((buttonId: RemapButtonId, index) => {
              const entry = remap[index];
              const current = entry ? entry.value : index;
              return (
                <tr key={buttonId}>
                  <td>{buttonId}</td>
                  <td>
                    <select
                      value={current}
                      onChange={(event) => setRemapFor(index, Number(event.target.value))}
                    >
                      {REMAP_BUTTON_IDS.map((target, targetIndex) => (
                        <option key={target} value={targetIndex}>
                          {target}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="actions">
          <button type="button" className="secondary" onClick={resetRemap}>
            Reset to identity
          </button>
        </div>
      </div>
    </>
  );
}

function System({
  config,
  apply
}: {
  config: DualsenseConfig;
  apply: (patch: Partial<DualsenseConfig>) => void;
}): React.JSX.Element {
  return (
    <>
      <h2>Controller</h2>
      <div className="card">
        <Row label="Controller mode" hint="Auto detects DualSense Edge">
          <select
            value={config.controllerMode}
            onChange={(event) => apply({ controllerMode: Number(event.target.value) })}
          >
            <option value={CONTROLLER_MODE.DS5}>DualSense</option>
            <option value={CONTROLLER_MODE.DSE}>DualSense Edge</option>
            <option value={CONTROLLER_MODE.AUTO}>Auto</option>
          </select>
        </Row>
        <Row label="Polling rate" hint="Real-time follows the BT report rate">
          <select
            value={config.pollingRateMode}
            onChange={(event) => apply({ pollingRateMode: Number(event.target.value) })}
          >
            <option value={POLLING_RATE_MODE.LOW}>250 Hz</option>
            <option value={POLLING_RATE_MODE.MID}>500 Hz</option>
            <option value={POLLING_RATE_MODE.REAL_TIME}>Real-time (~750 Hz)</option>
          </select>
        </Row>
        <Row label="Idle auto-disconnect" hint="Minutes without input, 0 = disabled">
          <input
            type="number"
            min={0}
            max={60}
            value={config.inactiveMinutes}
            onChange={(event) => apply({ inactiveMinutes: Number(event.target.value) })}
          />
        </Row>
        <Row label="USB remote wakeup">
          <Toggle value={config.enableWake} onChange={(value) => apply({ enableWake: value })} />
        </Row>
        <Row label="USB stealth mode" hint="Hide the USB device until a controller connects">
          <Toggle
            value={config.usbStealth}
            onChange={(value) => apply({ usbStealth: value })}
          />
        </Row>
        <Row label="USB serial number" hint="Unique chip ID from eFuse">
          <Toggle value={config.enableUsbSn} onChange={(value) => apply({ enableUsbSn: value })} />
        </Row>
        <Row label="PS shortcut" hint="Short press Win+G, long press Win+Tab">
          <Toggle
            value={config.psShortcutEnabled}
            onChange={(value) => apply({ psShortcutEnabled: value })}
          />
        </Row>
      </div>
    </>
  );
}

function FirmwareFlash(): React.JSX.Element {
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
      setLog('Select a serial port first.');
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
      setLog((result.ok ? 'Flash OK\n' : `Flash failed: ${result.error ?? 'unknown'}\n`) + result.output);
    } catch (error) {
      setLog(`Flash failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setFlashing(false);
    }
  };

  return (
    <>
      <h2>Firmware</h2>
      <div className="card">
        <p style={{ marginTop: 0 }}>
          Flash the dongle over serial ISP. Put the board into download mode first
          (hold <strong>BOOT</strong> and plug in USB), then pick the files and port.
        </p>
        <Row label="Flash tool" hint="BLFlashCommand.exe from the Bouffalo SDK">
          <span className={`badge ${toolReady ? 'online' : 'offline'}`}>
            {toolReady === null ? 'Checking...' : toolReady ? 'Found' : 'Not found'}
          </span>
        </Row>
        <Row label="Serial port">
          <select value={port} onChange={(event) => setPort(event.target.value)}>
            <option value="">Select port</option>
            {ports.map((candidate) => (
              <option key={candidate} value={candidate}>
                {candidate}
              </option>
            ))}
          </select>
          <button type="button" className="secondary" onClick={refreshPorts}>
            Refresh
          </button>
        </Row>
        <Row label="Boot2 file" hint="0x000000, e.g. boot2_bl616_isp_release_v8.1.8.bin">
          <input
            type="text"
            style={{ width: 360 }}
            value={boot2Path}
            onChange={(event) => setBoot2Path(event.target.value)}
          />
        </Row>
        <Row label="Partition file" hint="0x00E000, e.g. partition.bin">
          <input
            type="text"
            style={{ width: 360 }}
            value={partitionPath}
            onChange={(event) => setPartitionPath(event.target.value)}
          />
        </Row>
        <Row label="Firmware file" hint="0x010000, e.g. ds5dongle-lctech616.bin">
          <input
            type="text"
            style={{ width: 360 }}
            value={firmwarePath}
            onChange={(event) => setFirmwarePath(event.target.value)}
          />
        </Row>
        <div className="actions">
          <button type="button" className="primary" disabled={flashing || !toolReady} onClick={doFlash}>
            {flashing ? 'Flashing...' : 'Flash firmware'}
          </button>
        </div>
        {log ? <pre style={{ background: '#0d0f13', border: '1px solid var(--border)', borderRadius: 8, padding: 10, fontSize: 12, maxHeight: 240, overflow: 'auto', color: 'var(--text-dim)' }}>{log}</pre> : null}
      </div>
    </>
  );
}
