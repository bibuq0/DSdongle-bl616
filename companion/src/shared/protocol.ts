/**
 * DS5Dongle BL618 companion protocol.
 *
 * The BL616 firmware exposes its configuration over USB HID Feature
 * Reports (see src/usb_gamepad.c and src/config.h):
 *
 *   GET_REPORT 0xF7  -> packed `config_body` (src/config.h, 25 bytes)
 *   SET_REPORT 0xF6  -> command byte + payload:
 *                        0x01 + config_body  (update config)
 *                        0x02               (persist config)
 *                        0x03               (reset / USB reconnect)
 *   GET_REPORT 0xF8  -> firmware version string
 *   GET_REPORT 0xF9  -> status: RSSI / audio flags / battery
 *   GET_REPORT 0xFB  -> button remap table (15 * remap_entry_t, 60 bytes)
 *   SET_REPORT 0xFB  -> 0x01 + remap table  (update)
 *                       0x02               (reset to identity)
 *
 * HID report buffers include the report id as byte 0, matching
 * node-hid / WebHID conventions.
 */

export const REPORT_LENGTH = 64;
export const CONFIG_BODY_SIZE = 25;
export const REMAP_ENTRY_SIZE = 4;
export const REMAP_BUTTON_COUNT = 15;
export const REMAP_TABLE_SIZE = REMAP_ENTRY_SIZE * REMAP_BUTTON_COUNT;

export const REPORT_ID = {
  CONFIG_SET: 0xf6,
  CONFIG_GET: 0xf7,
  FIRMWARE_VERSION: 0xf8,
  STATUS: 0xf9,
  REMAP: 0xfb
} as const;

/** 0xF6 sub-commands (src/usb_gamepad.c usbd_hid_set_report). */
export const CONFIG_CMD = {
  SET: 0x01,
  SAVE: 0x02,
  RESET: 0x03
} as const;

/** 0xFB sub-commands. */
export const REMAP_CMD = {
  SET: 0x01,
  RESET: 0x02
} as const;

/** Controller mode (src/config.h controller_mode). */
export const CONTROLLER_MODE = {
  DS5: 0,
  DSE: 1,
  AUTO: 2
} as const;

/** Polling rate (src/config.h polling_rate_mode). */
export const POLLING_RATE_MODE = {
  LOW: 0,
  MID: 1,
  REAL_TIME: 2
} as const;

/** Battery power state (src/main.c, DS5_BATT_STATE_*). */
export const BATT_STATE = {
  DISCHARGE: 0x00,
  CHARGING: 0x01,
  FULL: 0x02,
  UNKNOWN: 0xff
} as const;

export const REMAP_BUTTON = {
  SQUARE: 0,
  CROSS: 1,
  CIRCLE: 2,
  TRIANGLE: 3,
  L1: 4,
  R1: 5,
  L2: 6,
  R2: 7,
  CREATE: 8,
  OPTIONS: 9,
  L3: 10,
  R3: 11,
  PS: 12,
  TP_CLICK: 13,
  MUTE: 14
} as const;

export const REMAP_TYPE = {
  BTN: 0,
  KBD: 1
} as const;

export const REMAP_FLAG_SUPPRESS = 0x01;

/** Offsets into the packed `config_body` (src/config.h, CONFIG_VERSION 2). */
export const CONFIG_OFFSET = {
  CONFIG_VERSION: 0,
  HAPTICS_GAIN: 1,
  SPEAKER_VOLUME: 5,
  HEADSET_VOLUME: 6,
  SPEAKER_GAIN: 7,
  INACTIVE_TIME: 8,
  DISABLE_LED: 9,
  POLLING_RATE_MODE: 10,
  AUDIO_BUFFER_LENGTH: 11,
  CONTROLLER_MODE: 12,
  ENABLE_USB_SN: 13,
  PS_SHORTCUT_ENABLED: 14,
  DISABLE_MIC: 15,
  DISABLE_SPEAKER: 16,
  ENABLE_WAKE: 17,
  TRIGGER_REDUCE: 18,
  LOCK_VOLUME: 19,
  DSE_DETECTED: 20,
  USB_STEALTH: 21,
  LED_R: 22,
  LED_G: 23,
  LED_B: 24
} as const;

export const CURRENT_CONFIG_VERSION = 2;

/** Decoded dongle configuration. */
export interface DualsenseConfig {
  hapticsGain: number;
  speakerVolume: number;
  headsetVolume: number;
  speakerGain: number;
  inactiveMinutes: number;
  disableLed: boolean;
  pollingRateMode: number;
  audioBufferLength: number;
  controllerMode: number;
  enableUsbSn: boolean;
  psShortcutEnabled: boolean;
  disableMic: boolean;
  disableSpeaker: boolean;
  enableWake: boolean;
  triggerReduce: number;
  lockVolume: boolean;
  dseDetected: boolean;
  usbStealth: boolean;
  ledColor: [number, number, number];
}

/** Decoded 0xF9 status report. */
export interface BridgeStatus {
  rssi: number;
  rssiKnown: boolean;
  speakerActive: boolean;
  micActive: boolean;
  batteryPercent: number;
  batteryState: number;
}

/** Button remap target entry (mirrors remap_entry_t). */
export interface RemapEntry {
  type: number;
  value: number;
  modifier: number;
  flags: number;
}

export type RemapTable = RemapEntry[];

export class ProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProtocolError';
  }
}

function clampByte(value: number, min: number, max: number): number {
  const v = Math.round(value);
  if (Number.isNaN(v)) {
    return min;
  }
  return Math.min(max, Math.max(min, v));
}

function readU8(bytes: ArrayLike<number>, offset: number): number {
  return bytes[offset] & 0xff;
}

function readI8(bytes: ArrayLike<number>, offset: number): number {
  const v = bytes[offset] & 0xff;
  return v >= 0x80 ? v - 0x100 : v;
}

function readU16le(bytes: ArrayLike<number>, offset: number): number {
  return (bytes[offset] & 0xff) | ((bytes[offset + 1] & 0xff) << 8);
}

function readFloat32le(bytes: ArrayLike<number>, offset: number): number {
  const raw = readU32le(bytes, offset);
  const f = new DataView(new ArrayBuffer(4));
  f.setUint32(0, raw, true);
  return f.getFloat32(0, true);
}

function readU32le(bytes: ArrayLike<number>, offset: number): number {
  return (
    (bytes[offset] & 0xff) |
    ((bytes[offset + 1] & 0xff) << 8) |
    ((bytes[offset + 2] & 0xff) << 16) |
    ((bytes[offset + 3] & 0xff) << 24)
  );
}

function writeFloat32le(bytes: number[], offset: number, value: number): void {
  const f = new DataView(new ArrayBuffer(4));
  f.setFloat32(0, value, true);
  bytes[offset] = f.getUint8(0);
  bytes[offset + 1] = f.getUint8(1);
  bytes[offset + 2] = f.getUint8(2);
  bytes[offset + 3] = f.getUint8(3);
}

export const DEFAULT_CONFIG: DualsenseConfig = {
  hapticsGain: 1.0,
  speakerVolume: 100,
  headsetVolume: 100,
  speakerGain: 2,
  inactiveMinutes: 30,
  disableLed: true,
  pollingRateMode: POLLING_RATE_MODE.LOW,
  audioBufferLength: 64,
  controllerMode: CONTROLLER_MODE.AUTO,
  enableUsbSn: true,
  psShortcutEnabled: false,
  disableMic: false,
  disableSpeaker: false,
  enableWake: false,
  triggerReduce: 0,
  lockVolume: false,
  dseDetected: false,
  usbStealth: false,
  ledColor: [0xff, 0xff, 0xff]
};

export const DEFAULT_REMAP_TABLE: RemapTable = Array.from(
  { length: REMAP_BUTTON_COUNT },
  (_, index) => ({ type: REMAP_TYPE.BTN, value: index, modifier: 0, flags: 0 })
);

/**
 * Parse a 0xF7 GET_REPORT response (report id byte + packed config_body).
 * The raw buffer may be shorter than REPORT_LENGTH on some drivers.
 */
export function parseConfigReport(raw: ArrayLike<number>): DualsenseConfig {
  const data = Array.from(raw);
  if (data.length < 1 || data[0] !== REPORT_ID.CONFIG_GET) {
    throw new ProtocolError('Unexpected 0xF7 report prefix');
  }
  const body = data.slice(1);
  if (body.length < CONFIG_BODY_SIZE) {
    throw new ProtocolError(`Short config body (${body.length} bytes)`);
  }
  return {
    hapticsGain: readFloat32le(body, CONFIG_OFFSET.HAPTICS_GAIN),
    speakerVolume: readU8(body, CONFIG_OFFSET.SPEAKER_VOLUME),
    headsetVolume: readU8(body, CONFIG_OFFSET.HEADSET_VOLUME),
    speakerGain: readU8(body, CONFIG_OFFSET.SPEAKER_GAIN),
    inactiveMinutes: readU8(body, CONFIG_OFFSET.INACTIVE_TIME),
    disableLed: readU8(body, CONFIG_OFFSET.DISABLE_LED) !== 0,
    pollingRateMode: readU8(body, CONFIG_OFFSET.POLLING_RATE_MODE),
    audioBufferLength: readU8(body, CONFIG_OFFSET.AUDIO_BUFFER_LENGTH),
    controllerMode: readU8(body, CONFIG_OFFSET.CONTROLLER_MODE),
    enableUsbSn: readU8(body, CONFIG_OFFSET.ENABLE_USB_SN) !== 0,
    psShortcutEnabled: readU8(body, CONFIG_OFFSET.PS_SHORTCUT_ENABLED) !== 0,
    disableMic: readU8(body, CONFIG_OFFSET.DISABLE_MIC) !== 0,
    disableSpeaker: readU8(body, CONFIG_OFFSET.DISABLE_SPEAKER) !== 0,
    enableWake: readU8(body, CONFIG_OFFSET.ENABLE_WAKE) !== 0,
    triggerReduce: readU8(body, CONFIG_OFFSET.TRIGGER_REDUCE),
    lockVolume: readU8(body, CONFIG_OFFSET.LOCK_VOLUME) !== 0,
    dseDetected: readU8(body, CONFIG_OFFSET.DSE_DETECTED) !== 0,
    usbStealth: readU8(body, CONFIG_OFFSET.USB_STEALTH) !== 0,
    ledColor: [
      readU8(body, CONFIG_OFFSET.LED_R),
      readU8(body, CONFIG_OFFSET.LED_G),
      readU8(body, CONFIG_OFFSET.LED_B)
    ]
  };
}

/** Pack a DualsenseConfig into a config_body byte array (no report id). */
export function buildConfigBody(config: DualsenseConfig): number[] {
  const body = new Array<number>(CONFIG_BODY_SIZE).fill(0);
  body[CONFIG_OFFSET.CONFIG_VERSION] = CURRENT_CONFIG_VERSION;
  writeFloat32le(body, CONFIG_OFFSET.HAPTICS_GAIN, config.hapticsGain);
  body[CONFIG_OFFSET.SPEAKER_VOLUME] = clampByte(config.speakerVolume, 0, 127);
  body[CONFIG_OFFSET.HEADSET_VOLUME] = clampByte(config.headsetVolume, 0, 127);
  body[CONFIG_OFFSET.SPEAKER_GAIN] = clampByte(config.speakerGain, 0, 7);
  body[CONFIG_OFFSET.INACTIVE_TIME] = clampByte(config.inactiveMinutes, 0, 60);
  body[CONFIG_OFFSET.DISABLE_LED] = config.disableLed ? 1 : 0;
  body[CONFIG_OFFSET.POLLING_RATE_MODE] = clampByte(config.pollingRateMode, 0, 2);
  body[CONFIG_OFFSET.AUDIO_BUFFER_LENGTH] = clampByte(config.audioBufferLength, 16, 128);
  body[CONFIG_OFFSET.CONTROLLER_MODE] = clampByte(config.controllerMode, 0, 2);
  body[CONFIG_OFFSET.ENABLE_USB_SN] = config.enableUsbSn ? 1 : 0;
  body[CONFIG_OFFSET.PS_SHORTCUT_ENABLED] = config.psShortcutEnabled ? 1 : 0;
  body[CONFIG_OFFSET.DISABLE_MIC] = config.disableMic ? 1 : 0;
  body[CONFIG_OFFSET.DISABLE_SPEAKER] = config.disableSpeaker ? 1 : 0;
  body[CONFIG_OFFSET.ENABLE_WAKE] = config.enableWake ? 1 : 0;
  body[CONFIG_OFFSET.TRIGGER_REDUCE] = clampByte(config.triggerReduce, 0, 10);
  body[CONFIG_OFFSET.LOCK_VOLUME] = config.lockVolume ? 1 : 0;
  body[CONFIG_OFFSET.DSE_DETECTED] = config.dseDetected ? 1 : 0;
  body[CONFIG_OFFSET.USB_STEALTH] = config.usbStealth ? 1 : 0;
  body[CONFIG_OFFSET.LED_R] = clampByte(config.ledColor[0], 0, 255);
  body[CONFIG_OFFSET.LED_G] = clampByte(config.ledColor[1], 0, 255);
  body[CONFIG_OFFSET.LED_B] = clampByte(config.ledColor[2], 0, 255);
  return body;
}

/**
 * Build a 0xF6 SET_REPORT payload (report id + sub-command + body).
 * Sub-commands 0x02 (save) and 0x03 (reset) carry no body.
 */
export function buildConfigSetReport(
  command: number,
  config?: DualsenseConfig
): number[] {
  const report = [REPORT_ID.CONFIG_SET, command];
  if (command === CONFIG_CMD.SET && config) {
    report.push(...buildConfigBody(config));
  }
  return report;
}

/**
 * Build a 0xF6 report that only changes a handful of fields while
 * preserving the rest of the on-device configuration.
 */
export function buildConfigPartialReport(
  patch: Partial<DualsenseConfig>
): number[] {
  const merged: DualsenseConfig = { ...DEFAULT_CONFIG, ...patch };
  return buildConfigSetReport(CONFIG_CMD.SET, merged);
}

/** Parse a 0xF8 firmware version GET_REPORT response. */
export function parseFirmwareVersionReport(raw: ArrayLike<number>): string {
  const data = Array.from(raw);
  if (data.length < 1 || data[0] !== REPORT_ID.FIRMWARE_VERSION) {
    throw new ProtocolError('Unexpected 0xF8 report prefix');
  }
  const text = data
    .slice(1)
    .map((byte) => String.fromCharCode(byte & 0xff))
    .join('');
  const trimmed = text.replace(/\0.*$/, '').trim();
  return trimmed || 'unknown';
}

/** Parse a 0xF9 status GET_REPORT response. */
export function parseStatusReport(raw: ArrayLike<number>): BridgeStatus {
  const data = Array.from(raw);
  if (data.length < 1 || data[0] !== REPORT_ID.STATUS) {
    throw new ProtocolError('Unexpected 0xF9 report prefix');
  }
  if (data.length < 5) {
    throw new ProtocolError('Short 0xF9 status report');
  }
  const rssi = readI8(data, 1);
  const flags = readU8(data, 2);
  const batteryPercent = readU8(data, 3);
  const batteryState = readU8(data, 4);
  return {
    rssi,
    rssiKnown: rssi !== 1,
    speakerActive: (flags & 0x02) !== 0,
    micActive: (flags & 0x01) !== 0,
    batteryPercent:
      batteryState === BATT_STATE.UNKNOWN ? 255 : batteryPercent,
    batteryState
  };
}

/** Parse a 0xFB GET_REPORT response into a remap table. */
export function parseRemapReport(raw: ArrayLike<number>): RemapTable {
  const data = Array.from(raw);
  if (data.length < 1 || data[0] !== REPORT_ID.REMAP) {
    throw new ProtocolError('Unexpected 0xFB report prefix');
  }
  const body = data.slice(1);
  const table: RemapTable = [];
  for (let i = 0; i < REMAP_BUTTON_COUNT; i++) {
    const offset = i * REMAP_ENTRY_SIZE;
    if (offset + REMAP_ENTRY_SIZE > body.length) {
      break;
    }
    table.push({
      type: readU8(body, offset),
      value: readU8(body, offset + 1),
      modifier: readU8(body, offset + 2),
      flags: readU8(body, offset + 3)
    });
  }
  return table;
}

/** Build a 0xFB SET_REPORT payload (report id + sub-command + table). */
export function buildRemapSetReport(
  command: number,
  table?: RemapTable
): number[] {
  const report = [REPORT_ID.REMAP, command];
  if (command === REMAP_CMD.SET && table) {
    for (let i = 0; i < REMAP_BUTTON_COUNT; i++) {
      const entry = table[i] ?? DEFAULT_REMAP_TABLE[i];
      report.push(entry.type & 0xff, entry.value & 0xff, entry.modifier & 0xff, entry.flags & 0xff);
    }
  }
  return report;
}

export const REMAP_BUTTON_IDS = [
  'square',
  'cross',
  'circle',
  'triangle',
  'l1',
  'r1',
  'l2',
  'r2',
  'create',
  'options',
  'l3',
  'r3',
  'ps',
  'touchpad',
  'mute'
] as const;

export type RemapButtonId = (typeof REMAP_BUTTON_IDS)[number];

export function remapButtonIdValue(buttonId: RemapButtonId): number {
  const index = REMAP_BUTTON_IDS.indexOf(buttonId);
  return index >= 0 ? index : REMAP_BUTTON.SQUARE;
}

export function remapButtonIdFromValue(value: number): RemapButtonId {
  return REMAP_BUTTON_IDS[value] ?? 'square';
}
