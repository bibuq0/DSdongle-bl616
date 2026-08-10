import { fork, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import HID from 'node-hid';
import type { HidDeviceSummary } from '../shared/types';

const DISCOVERY_TIMEOUT_MS = 2500;
const USE_DISCOVERY_WORKER = process.env.VITEST !== 'true';

type DiscoveryRequest = {
  id: number;
  type: 'list-devices';
};

type DiscoveryResponse = {
  id: number;
  ok: true;
  devices: HidDeviceSummary[];
} | {
  id: number;
  ok: false;
  error: string;
};

type PendingRequest = {
  resolve: (devices: HidDeviceSummary[]) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

function summarizeDevice(device: HID.Device): HidDeviceSummary {
  return {
    path: device.path,
    vendorId: device.vendorId,
    productId: device.productId,
    usagePage: device.usagePage,
    usage: device.usage,
    product: device.product,
    manufacturer: device.manufacturer,
    interface: device.interface
  };
}

export class HidDiscoveryClient {
  private worker: ChildProcess | null = null;
  private nextRequestId = 1;
  private readonly pending = new Map<number, PendingRequest>();

  async listDevices(): Promise<HidDeviceSummary[]> {
    if (!USE_DISCOVERY_WORKER) {
      return HID.devices().map(summarizeDevice);
    }

    const worker = this.ensureWorker();
    const id = this.nextRequestId++;
    const request: DiscoveryRequest = { id, type: 'list-devices' };

    return new Promise<HidDeviceSummary[]>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!this.pending.has(id)) {
          return;
        }
        this.restartWorker(new Error('HID discovery worker timed out'));
      }, DISCOVERY_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timeout });
      worker.send(request, (error) => {
        if (!error) {
          return;
        }
        const pending = this.pending.get(id);
        if (!pending) {
          return;
        }
        this.restartWorker(error);
      });
    });
  }

  stop(): void {
    if (this.worker) {
      this.worker.kill();
      this.worker = null;
    }
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('HID discovery worker stopped'));
      this.pending.delete(id);
    }
  }

  private ensureWorker(): ChildProcess {
    if (this.worker?.connected) {
      return this.worker;
    }

    const workerPath = path.join(__dirname, 'hid-discovery-worker.js');
    this.worker = fork(workerPath, [], {
      execPath: process.execPath,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1'
      },
      stdio: ['ignore', 'ignore', 'ignore', 'ipc']
    });
    this.worker.on('message', (message: DiscoveryResponse) => this.handleMessage(message));
    this.worker.once('exit', () => {
      this.worker = null;
      this.rejectPending(new Error('HID discovery worker exited'));
    });
    return this.worker;
  }

  private rejectPending(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeout);
      pending.reject(error);
      this.pending.delete(id);
    }
  }

  private restartWorker(error: Error): void {
    const worker = this.worker;
    this.worker = null;
    this.rejectPending(error);
    if (worker) {
      worker.removeAllListeners('message');
      worker.removeAllListeners('exit');
      worker.kill();
    }
  }

  private handleMessage(message: DiscoveryResponse): void {
    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }
    clearTimeout(pending.timeout);
    this.pending.delete(message.id);
    if (message.ok) {
      pending.resolve(message.devices);
      return;
    }
    pending.reject(new Error(message.error));
  }
}
