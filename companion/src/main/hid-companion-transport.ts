/**
 * BL616 HID transport for the DS5Dongle BL618 companion app.
 *
 * Talks to the dongle over plain HID Feature Reports (VID 054C, PID 0CE6 /
 * 0DF2) using node-hid — no WinUSB driver or companion firmware interface is
 * required. The interface mirrors the old `WinUsbCompanionTransport` so the
 * service layer only swaps the import.
 */

import { EventEmitter } from 'node:events';
import HID from 'node-hid';
import { REPORT_ID } from '../shared/protocol';

const REPORT_LENGTH = 64;
const MAX_TRANSPORT_REPORT_LENGTH = 96;
const DEFAULT_OPEN_RETRY_DELAY_MS = 200;
const HID_USAGE_PAGE_GAME = 0x01;
const HID_USAGE_GAMEPAD = 0x05;

export const DS5DONGLE_VID = 0x054c;
export const DS5DONGLE_PIDS = [0x0ce6, 0x0df2];

type OpenOptions = {
  retryTimeoutMs?: number;
  retryDelayMs?: number;
};

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isDongleDevice(device: HID.Device): boolean {
  if (device.vendorId !== DS5DONGLE_VID || !DS5DONGLE_PIDS.includes(device.productId)) {
    return false;
  }
  // Prefer the gamepad HID interface; skip audio/other interfaces.
  if (device.usagePage && device.usage) {
    return device.usagePage === HID_USAGE_PAGE_GAME && device.usage === HID_USAGE_GAMEPAD;
  }
  return true;
}

export function findDongleDevice(): HID.Device | null {
  const devices = HID.devices();
  return devices.find(isDongleDevice) ?? null;
}

export class HidCompanionTransport extends EventEmitter {
  private closed = false;
  private remapReportLength = 81;
  private readonly sendRetries = 3;

  private constructor(
    private readonly device: HID.HIDAsync,
    readonly path: string
  ) {
    super();
    device.on('data', (data: Buffer) => this.emit('data', data));
    device.on('error', (error: Error) => this.emit('error', error));
    device.on('close', () => {
      this.closed = true;
      this.emit('close');
    });
  }

  /**
   * Report length the attached firmware actually supports for the 0xFB
   * remap report. Old firmware: 64 (15 buttons), new: 81 (19 buttons).
   * Probed once at connect time by the bridge service.
   */
  setRemapReportLength(length: number): void {
    this.remapReportLength = length;
  }

  static async open(options: OpenOptions = {}): Promise<HidCompanionTransport> {
    const retryTimeoutMs = Math.max(0, options.retryTimeoutMs ?? 0);
    const retryDelayMs = Math.max(1, options.retryDelayMs ?? DEFAULT_OPEN_RETRY_DELAY_MS);
    const startedAt = Date.now();
    let lastError: Error | null = null;

    while (true) {
      try {
        return await HidCompanionTransport.openOnce();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const elapsedMs = Date.now() - startedAt;
        if (retryTimeoutMs <= 0 || elapsedMs >= retryTimeoutMs) {
          throw lastError;
        }
        await delay(Math.min(retryDelayMs, retryTimeoutMs - elapsedMs));
      }
    }
  }

  private static async openOnce(): Promise<HidCompanionTransport> {
    const device = findDongleDevice();
    if (!device) {
      throw new Error('DS5Dongle HID device not found');
    }
    const path = device.path ?? '';
    const hid = await HID.HIDAsync.open(path);
    try {
      await hid.getFeatureReport(REPORT_ID.CONFIG_GET, REPORT_LENGTH);
    } catch {
      try {
        hid.close();
      } catch {
        // ignore
      }
      throw new Error('DS5Dongle HID device failed to open');
    }
    return new HidCompanionTransport(hid, path);
  }

  async getFeatureReport(reportId: number, length = REPORT_LENGTH): Promise<number[]> {
    if (this.closed) {
      throw new Error('HID transport is closed');
    }
    const buffer = await this.device.getFeatureReport(reportId & 0xff, length);
    return Array.from(buffer);
  }

  async sendFeatureReport(report: ArrayLike<number>): Promise<void> {
    if (this.closed) {
      throw new Error('HID transport is closed');
    }
    const data = this.normalizeReport(report);
    await this.sendWithRetry(data);
  }

  async write(report: ArrayLike<number>): Promise<void> {
    if (this.closed) {
      throw new Error('HID transport is closed');
    }
    const data = this.normalizeReport(report);
    await this.sendWithRetry(data);
  }

  private async sendWithRetry(data: number[]): Promise<void> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < this.sendRetries; attempt++) {
      if (this.closed) {
        throw new Error('HID transport is closed');
      }
      try {
        await this.device.sendFeatureReport(data);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < this.sendRetries - 1) {
          await delay(60);
        }
      }
    }
    throw lastError ?? new Error('sendFeatureReport failed');
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    try {
      this.device.close();
    } catch {
      // ignore
    }
    this.emit('close');
  }

  private normalizeReport(report: ArrayLike<number>): number[] {
    if (report.length < 1 || report.length > MAX_TRANSPORT_REPORT_LENGTH) {
      throw new Error(
        `Expected 1-${MAX_TRANSPORT_REPORT_LENGTH} report bytes, received ${report.length}.`
      );
    }
    // 0xFB remap reports follow the firmware's supported length; others are 64.
    const reportLength = (report[0] & 0xff) === REPORT_ID.REMAP ? this.remapReportLength : REPORT_LENGTH;
    const data = new Array<number>(reportLength).fill(0);
    const copy = Math.min(report.length, reportLength);
    for (let i = 0; i < copy; i++) {
      data[i] = report[i] & 0xff;
    }
    return data;
  }
}
