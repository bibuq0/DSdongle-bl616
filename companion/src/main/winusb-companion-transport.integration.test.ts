import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { WinUsbCompanionTransport } from './winusb-companion-transport';

type TransportConstructor = new (
  helper: ChildProcessWithoutNullStreams,
  path: string
) => WinUsbCompanionTransport;

const fakeHelperPath = fileURLToPath(new URL('./test-fixtures/fake-winusb-helper.cjs', import.meta.url));
const liveTransports: WinUsbCompanionTransport[] = [];
const liveHelpers: ChildProcessWithoutNullStreams[] = [];

function createFakeTransport(): WinUsbCompanionTransport {
  const helper = spawn(process.execPath, [fakeHelperPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true
  });
  const Transport = WinUsbCompanionTransport as unknown as TransportConstructor;
  const transport = new Transport(helper, 'fake-winusb://bridge');
  liveHelpers.push(helper);
  liveTransports.push(transport);
  return transport;
}

async function waitForClose(transport: WinUsbCompanionTransport): Promise<void> {
  await new Promise<void>((resolve) => {
    transport.once('close', resolve);
  });
}

describe('WinUsbCompanionTransport integration', () => {
  afterEach(() => {
    while (liveTransports.length > 0) {
      liveTransports.pop()?.close();
    }
    while (liveHelpers.length > 0) {
      const helper = liveHelpers.pop();
      if (helper && !helper.killed) {
        helper.kill();
      }
    }
  });

  it('matches concurrent helper responses by request id across real stdio chunking', async () => {
    const transport = createFakeTransport();
    const statuses: string[] = [];
    transport.on('status', (line) => statuses.push(line));

    const delayed = transport.getFeatureReport(0x11);
    const chunked = transport.getFeatureReport(0x12);
    const write = transport.write(new Array<number>(64).fill(0).map((_, index) => 0x100 + index));

    await expect(chunked).resolves.toEqual(new Array<number>(64).fill(0).map((_, index) => (0x12 + index) & 0xff));
    await expect(delayed).resolves.toEqual(new Array<number>(64).fill(0).map((_, index) => (0x11 + index) & 0xff));
    await expect(write).resolves.toBeUndefined();
    expect(statuses).toContain('status: fake winusb helper ready');
  });

  it('rejects an in-flight request when the real helper process exits', async () => {
    const transport = createFakeTransport();
    const closed = waitForClose(transport);

    const pending = transport.getFeatureReport(0xee);

    await expect(pending).rejects.toThrow('WinUSB bridge helper exited (42)');
    await closed;
    await expect(transport.getFeatureReport(1)).rejects.toThrow('WinUSB bridge helper is not running');
  });
});
