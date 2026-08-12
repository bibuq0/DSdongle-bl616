import { EventEmitter } from 'node:events';
import {
  CONFIG_CMD,
  DEFAULT_REMAP_TABLE,
  REMAP_CMD,
  REMAP_REPORT_LENGTH,
  REPORT_ID,
  buildConfigSetReport,
  buildRemapSetReport,
  parseConfigReport,
  parseFirmwareVersionReport,
  parseRemapReport,
  parseStatusReport,
  type DualsenseConfig,
  type RemapTable
} from '../shared/protocol';
import type {
  BridgeDiagnostics,
  BridgeSnapshot,
  CompanionSettings,
  HidDeviceSummary
} from '../shared/types';
import { HidDiscoveryClient } from './hid-discovery-client';
import {
  DS5DONGLE_PIDS,
  HidCompanionTransport,
  findDongleDevice
} from './hid-companion-transport';
import type { SettingsStore } from './settings-store';

const POLL_INTERVAL_MS = 1000;
const CONNECT_RETRY_MS = 2500;
const STARTUP_RESCAN_DELAY_MS = 500;

function snapshotFromStatus(status: BridgeSnapshot): BridgeSnapshot {
  return status;
}

export class BridgeService extends EventEmitter {
  private device: HidCompanionTransport | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private connectTimer: NodeJS.Timeout | null = null;
  private discovery = new HidDiscoveryClient();
  private lastConfig: DualsenseConfig | null = null;
  private lastRemap: RemapTable | null = null;
  private busy = false;
  private connecting = false;
  private consecutivePollFailures = 0;
  private startedAt = Date.now();
  private lastError: string | null = null;
  private lastSavedAt: number | null = null;

  private snapshot: BridgeSnapshot = {
    connected: false,
    connectionState: 'disconnected',
    devicePath: '',
    productId: 0,
    firmwareVersion: '',
    status: {
      rssi: 1,
      rssiKnown: false,
      speakerActive: false,
      micActive: false,
      batteryPercent: 255,
      batteryState: 0xff
    },
    config: null,
    settings: null,
    uptimeSeconds: 0,
    busy: false,
    lastError: null,
    lastSavedAt: null
  };

  constructor(private readonly settingsStore: SettingsStore) {
    super();
  }

  async start(): Promise<void> {
    this.scheduleConnect();
  }

  async stop(): Promise<void> {
    this.clearTimers();
    if (this.device) {
      this.device.close();
      this.device = null;
    }
    this.discovery.stop();
  }

  getSnapshot(): BridgeSnapshot {
    return { ...this.snapshot, settings: this.snapshot.settings ? { ...this.snapshot.settings } : null };
  }

  async getDiagnostics(): Promise<BridgeDiagnostics> {
    const s = this.snapshot;
    return {
      connected: s.connected,
      devicePath: s.devicePath,
      productId: s.productId,
      firmwareVersion: s.firmwareVersion,
      rssi: s.status.rssi,
      batteryPercent: s.status.batteryPercent,
      batteryState: s.status.batteryState
    };
  }

  async listHidDevices(): Promise<HidDeviceSummary[]> {
    return this.discovery.listDevices();
  }

  async requestRescan(): Promise<BridgeSnapshot> {
    this.teardown();
    this.scheduleConnect(STARTUP_RESCAN_DELAY_MS);
    return this.getSnapshot();
  }

  /**
   * Apply a partial config change. The dongle's 0xF6 SET_REPORT overwrites
   * the whole config_body, so we merge the patch on top of the last read
   * config and push the full body.
   */
  async applyConfig(patch: Partial<DualsenseConfig>): Promise<BridgeSnapshot> {
    if (!this.device || this.busy) {
      this.lastError = 'Dongle not connected';
      this.publish();
      return this.getSnapshot();
    }
    const base = this.lastConfig;
    if (!base) {
      this.lastError = 'Configuration not read yet';
      this.publish();
      return this.getSnapshot();
    }
    const merged: DualsenseConfig = { ...base, ...patch };
    this.busy = true;
    this.publish();
    try {
      await this.device.sendFeatureReport(buildConfigSetReport(CONFIG_CMD.SET, merged));
      this.lastConfig = merged;
      await this.refreshConfig();
      this.lastError = null;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
    } finally {
      this.busy = false;
      this.publish();
    }
    return this.getSnapshot();
  }

  async saveConfig(): Promise<BridgeSnapshot> {
    if (!this.device || this.busy) {
      return this.getSnapshot();
    }
    this.busy = true;
    this.publish();
    try {
      await this.device.sendFeatureReport(buildConfigSetReport(CONFIG_CMD.SAVE));
      this.lastSavedAt = Date.now();
      this.lastError = null;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
    } finally {
      this.busy = false;
      this.publish();
    }
    return this.getSnapshot();
  }

  async resetConfig(): Promise<BridgeSnapshot> {
    if (!this.device || this.busy) {
      return this.getSnapshot();
    }
    this.busy = true;
    this.publish();
    try {
      await this.device.sendFeatureReport(buildConfigSetReport(CONFIG_CMD.RESET));
      this.lastError = null;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
    } finally {
      this.busy = false;
      await this.refreshAll();
    }
    return this.getSnapshot();
  }

  async setRemap(table: RemapTable): Promise<BridgeSnapshot> {
    if (!this.device || this.busy) {
      return this.getSnapshot();
    }
    this.busy = true;
    this.publish();
    try {
      await this.device.sendFeatureReport(buildRemapSetReport(REMAP_CMD.SET, table));
      this.lastRemap = table;
      this.lastError = null;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
    } finally {
      this.busy = false;
      this.publish();
    }
    return this.getSnapshot();
  }

  async resetRemap(): Promise<BridgeSnapshot> {
    if (!this.device || this.busy) {
      return this.getSnapshot();
    }
    this.busy = true;
    this.publish();
    try {
      await this.device.sendFeatureReport(buildRemapSetReport(REMAP_CMD.RESET));
      this.lastRemap = [...DEFAULT_REMAP_TABLE];
      this.lastError = null;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
    } finally {
      this.busy = false;
      await this.refreshRemap();
      this.publish();
    }
    return this.getSnapshot();
  }

  // ---- internals ----

  private scheduleConnect(delayMs = 0): void {
    if (this.connectTimer) {
      return;
    }
    this.connectTimer = setTimeout(() => {
      this.connectTimer = null;
      void this.connectOnce();
    }, delayMs);
  }

  private async connectOnce(): Promise<void> {
    if (this.device || this.connecting) {
      return;
    }
    this.connecting = true;
    try {
      const device = await HidCompanionTransport.open({ retryTimeoutMs: 1500 });
      this.attach(device);
    } catch {
      this.scheduleConnect(CONNECT_RETRY_MS);
    } finally {
      this.connecting = false;
    }
  }

  private attach(device: HidCompanionTransport): void {
    this.device = device;
    this.snapshot.connected = true;
    this.snapshot.connectionState = 'connected';
    this.snapshot.devicePath = device.path;
    const found = findDongleDevice();
    this.snapshot.productId = found?.productId ?? 0;
    device.on('close', () => {
      if (this.device === device) {
        this.device = null;
        this.teardown();
        this.scheduleConnect(CONNECT_RETRY_MS);
      }
    });
    this.busy = false;
    this.lastError = null;
    void this.probeRemapLength(device).finally(() => {
      void this.refreshAll().finally(() => {
        this.publish();
        this.schedulePoll();
      });
    });
  }

  /** Detect old (64B, 15-key) vs new (81B, 19-key) firmware 0xFB report. */
  private async probeRemapLength(device: HidCompanionTransport): Promise<void> {
    try {
      const raw = await device.getFeatureReport(REPORT_ID.REMAP, REMAP_REPORT_LENGTH);
      device.setRemapReportLength(raw.length > 64 ? 81 : 64);
    } catch {
      // keep the 81 default
    }
  }

  private schedulePoll(): void {
    if (this.pollTimer) {
      return;
    }
    this.pollTimer = setTimeout(() => {
      this.pollTimer = null;
      void this.pollOnce();
    }, POLL_INTERVAL_MS);
  }

  private async pollOnce(): Promise<void> {
    if (!this.device || this.busy) {
      this.schedulePoll();
      return;
    }
    try {
      const raw = await this.device.getFeatureReport(REPORT_ID.STATUS);
      this.snapshot.status = parseStatusReport(raw);
      this.consecutivePollFailures = 0;
    } catch {
      // Device likely re-enumerated (e.g. after a firmware reset).
      this.consecutivePollFailures++;
      if (this.consecutivePollFailures >= 3) {
        this.consecutivePollFailures = 0;
        const stale = this.device;
        this.device = null;
        this.teardown();
        if (stale) {
          stale.close();
        }
        this.publish();
        this.scheduleConnect(CONNECT_RETRY_MS);
        return;
      }
    }
    this.publish();
    this.schedulePoll();
  }

  private async refreshAll(): Promise<void> {
    await Promise.all([this.refreshConfig(), this.refreshStatus(), this.refreshRemap(), this.refreshVersion()]);
  }

  private async refreshConfig(): Promise<void> {
    if (!this.device) {
      return;
    }
    try {
      const raw = await this.device.getFeatureReport(REPORT_ID.CONFIG_GET);
      const config = parseConfigReport(raw);
      this.lastConfig = config;
      this.snapshot.config = config;
      this.snapshot.settings = this.buildSettings(config);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
    }
  }

  private async refreshStatus(): Promise<void> {
    if (!this.device) {
      return;
    }
    try {
      const raw = await this.device.getFeatureReport(REPORT_ID.STATUS);
      this.snapshot.status = parseStatusReport(raw);
    } catch {
      // ignored
    }
  }

  private async refreshRemap(): Promise<void> {
    if (!this.device) {
      return;
    }
    try {
      const raw = await this.device.getFeatureReport(REPORT_ID.REMAP, REMAP_REPORT_LENGTH);
      this.lastRemap = parseRemapReport(raw);
    } catch {
      // ignored
    }
  }

  private async refreshVersion(): Promise<void> {
    if (!this.device) {
      return;
    }
    try {
      const raw = await this.device.getFeatureReport(REPORT_ID.FIRMWARE_VERSION);
      this.snapshot.firmwareVersion = parseFirmwareVersionReport(raw);
    } catch {
      // ignored
    }
  }

  private buildSettings(config: DualsenseConfig): CompanionSettings {
    return {
      controllerMode: config.controllerMode,
      pollingRateMode: config.pollingRateMode,
      inactiveMinutes: config.inactiveMinutes,
      disableLed: config.disableLed,
      hapticsGain: config.hapticsGain,
      speakerVolume: config.speakerVolume,
      headsetVolume: config.headsetVolume,
      speakerGain: config.speakerGain,
      audioBufferLength: config.audioBufferLength,
      enableUsbSn: config.enableUsbSn,
      psShortcutEnabled: config.psShortcutEnabled,
      disableMic: config.disableMic,
      disableSpeaker: config.disableSpeaker,
      enableWake: config.enableWake,
      triggerReduce: config.triggerReduce,
      lockVolume: config.lockVolume,
      usbStealth: config.usbStealth,
      ledColor: config.ledColor,
      remap: this.lastRemap ? [...this.lastRemap] : []
    };
  }

  private teardown(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.snapshot.connected = false;
    this.snapshot.connectionState = 'disconnected';
    this.snapshot.devicePath = '';
    this.snapshot.productId = 0;
    this.snapshot.config = null;
    this.snapshot.settings = null;
    this.snapshot.status = {
      rssi: 1,
      rssiKnown: false,
      speakerActive: false,
      micActive: false,
      batteryPercent: 255,
      batteryState: 0xff
    };
    this.lastConfig = null;
    this.lastRemap = null;
  }

  private clearTimers(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
  }

  private publish(): void {
    const snap = snapshotFromStatus(this.snapshot);
    snap.lastError = this.lastError;
    snap.lastSavedAt = this.lastSavedAt;
    this.emit('snapshot', snap);
  }
}

export function makeBridgeService(settingsStore: SettingsStore): BridgeService {
  return new BridgeService(settingsStore);
}
