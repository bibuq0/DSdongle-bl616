import { describe, expect, it } from 'vitest';
import {
  CONFIG_CMD,
  CONFIG_OFFSET,
  DEFAULT_CONFIG,
  DEFAULT_REMAP_TABLE,
  REMAP_BUTTON_COUNT,
  REMAP_CMD,
  REMAP_ENTRY_SIZE,
  REMAP_TABLE_SIZE,
  REPORT_ID,
  buildConfigBody,
  buildConfigSetReport,
  buildRemapSetReport,
  parseConfigReport,
  parseFirmwareVersionReport,
  parseRemapReport,
  parseStatusReport,
  type DualsenseConfig
} from './protocol';

function withReportId(reportId: number, payload: number[]): number[] {
  return [reportId, ...payload];
}

describe('config body', () => {
  it('round-trips a full config through build/parse', () => {
    const config: DualsenseConfig = {
      ...DEFAULT_CONFIG,
      hapticsGain: 1.5,
      speakerVolume: 90,
      headsetVolume: 80,
      speakerGain: 3,
      inactiveMinutes: 15,
      disableLed: false,
      pollingRateMode: 1,
      audioBufferLength: 96,
      controllerMode: 1,
      enableUsbSn: false,
      psShortcutEnabled: true,
      disableMic: true,
      disableSpeaker: false,
      enableWake: true,
      triggerReduce: 4,
      lockVolume: true,
      dseDetected: true,
      usbStealth: true,
      ledColor: [10, 20, 30]
    };
    const body = buildConfigBody(config);
    expect(body).toHaveLength(25);
    const parsed = parseConfigReport(withReportId(REPORT_ID.CONFIG_GET, body));
    expect(parsed).toEqual(config);
  });

  it('clamps out-of-range fields', () => {
    const body = buildConfigBody({
      ...DEFAULT_CONFIG,
      speakerVolume: 500,
      triggerReduce: 99,
      hapticsGain: 99,
      ledColor: [999, -5, 0]
    });
    expect(body[CONFIG_OFFSET.SPEAKER_VOLUME]).toBe(127);
    expect(body[CONFIG_OFFSET.TRIGGER_REDUCE]).toBe(10);
    expect(body[CONFIG_OFFSET.LED_R]).toBe(255);
    expect(body[CONFIG_OFFSET.LED_G]).toBe(0);
  });
});

describe('config set report', () => {
  it('builds a full SET report with report id + command + body', () => {
    const report = buildConfigSetReport(CONFIG_CMD.SET, DEFAULT_CONFIG);
    expect(report[0]).toBe(REPORT_ID.CONFIG_SET);
    expect(report[1]).toBe(CONFIG_CMD.SET);
    expect(report).toHaveLength(2 + 25);
  });

  it('builds SAVE and RESET commands without a body', () => {
    expect(buildConfigSetReport(CONFIG_CMD.SAVE)).toEqual([REPORT_ID.CONFIG_SET, CONFIG_CMD.SAVE]);
    expect(buildConfigSetReport(CONFIG_CMD.RESET)).toEqual([REPORT_ID.CONFIG_SET, CONFIG_CMD.RESET]);
  });
});

describe('status report', () => {
  it('parses RSSI, audio flags and battery', () => {
    // report[1] = rssi (-45), report[2] = flags (0x80|0x02|0x01), report[3]=battery %, report[4]=state
    const status = parseStatusReport([REPORT_ID.STATUS, 0xd3, 0x83, 70, 0]);
    expect(status.rssi).toBe(-45);
    expect(status.rssiKnown).toBe(true);
    expect(status.speakerActive).toBe(true);
    expect(status.micActive).toBe(true);
    expect(status.batteryPercent).toBe(70);
    expect(status.batteryState).toBe(0);
  });

  it('marks RSSI as unknown when value is 1', () => {
    const status = parseStatusReport([REPORT_ID.STATUS, 1, 0x80, 0xff, 0xff]);
    expect(status.rssiKnown).toBe(false);
    expect(status.batteryPercent).toBe(255);
  });
});

describe('firmware version report', () => {
  it('parses a version string and trims trailing NULs', () => {
    const bytes = Array.from('LCT616-DS5 3.15', (char) => char.charCodeAt(0));
    expect(parseFirmwareVersionReport(withReportId(REPORT_ID.FIRMWARE_VERSION, bytes))).toBe('LCT616-DS5 3.15');
  });

  it('returns "unknown" when empty', () => {
    expect(parseFirmwareVersionReport([REPORT_ID.FIRMWARE_VERSION, 0, 0])).toBe('unknown');
  });
});

describe('remap report', () => {
  it('builds and parses a remap table', () => {
    const table = DEFAULT_REMAP_TABLE.map((entry, index) => ({
      ...entry,
      value: (index + 1) % REMAP_BUTTON_COUNT
    }));
    const report = buildRemapSetReport(REMAP_CMD.SET, table);
    expect(report[0]).toBe(REPORT_ID.REMAP);
    expect(report[1]).toBe(REMAP_CMD.SET);
    expect(report).toHaveLength(2 + REMAP_TABLE_SIZE);

    const parsed = parseRemapReport(withReportId(REPORT_ID.REMAP, report.slice(2)));
    expect(parsed).toHaveLength(REMAP_BUTTON_COUNT);
    expect(parsed[0]).toEqual(table[0]);
    expect(parsed[REMAP_BUTTON_COUNT - 1]).toEqual(table[REMAP_BUTTON_COUNT - 1]);
  });

  it('builds a reset command without a table', () => {
    expect(buildRemapSetReport(REMAP_CMD.RESET)).toEqual([REPORT_ID.REMAP, REMAP_CMD.RESET]);
  });

  it('entry size constant matches protocol', () => {
    expect(REMAP_ENTRY_SIZE).toBe(4);
  });
});
