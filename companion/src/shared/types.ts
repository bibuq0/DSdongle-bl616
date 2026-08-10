import type { DualsenseConfig, RemapTable, BridgeStatus } from './protocol';

export type UiScalePercent = 75 | 100 | 125 | 150;
export type UiThemePreset = 'light' | 'dark';

export interface HidDeviceSummary {
  path: string;
  vendorId: number;
  productId: number;
  usagePage: number;
  usage: number;
  product?: string;
  manufacturer?: string;
  interface: number;
}

export interface CompanionSettings {
  controllerMode: number;
  pollingRateMode: number;
  inactiveMinutes: number;
  disableLed: boolean;
  hapticsGain: number;
  speakerVolume: number;
  headsetVolume: number;
  speakerGain: number;
  audioBufferLength: number;
  enableUsbSn: boolean;
  psShortcutEnabled: boolean;
  disableMic: boolean;
  disableSpeaker: boolean;
  enableWake: boolean;
  triggerReduce: number;
  lockVolume: boolean;
  usbStealth: boolean;
  ledColor: [number, number, number];
  remap: RemapTable;
}

export type ConnectionState = 'disconnected' | 'discovering' | 'connected' | 'incompatible';

export interface BridgeSnapshot {
  connected: boolean;
  connectionState: ConnectionState;
  devicePath: string;
  productId: number;
  firmwareVersion: string;
  status: BridgeStatus;
  config: DualsenseConfig | null;
  settings: CompanionSettings | null;
  uptimeSeconds: number;
  busy: boolean;
  lastError: string | null;
  lastSavedAt: number | null;
}

export interface BridgeDiagnostics {
  connected: boolean;
  devicePath: string;
  productId: number;
  firmwareVersion: string;
  rssi: number;
  batteryPercent: number;
  batteryState: number;
}

export const DEFAULT_COMPANION_SETTINGS: CompanionSettings = {
  controllerMode: 2,
  pollingRateMode: 0,
  inactiveMinutes: 30,
  disableLed: true,
  hapticsGain: 1.0,
  speakerVolume: 100,
  headsetVolume: 100,
  speakerGain: 2,
  audioBufferLength: 64,
  enableUsbSn: true,
  psShortcutEnabled: false,
  disableMic: false,
  disableSpeaker: false,
  enableWake: false,
  triggerReduce: 0,
  lockVolume: false,
  usbStealth: false,
  ledColor: [0xff, 0xff, 0xff],
  remap: []
};

export interface WindowsDeviceCleanupResult {
  ok: boolean;
  message: string;
}

export interface FlashFile {
  address: number;
  path: string;
}

export interface FlashResult {
  ok: boolean;
  output: string;
  error?: string;
}
