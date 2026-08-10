import HID from 'node-hid';
import type { HidDeviceSummary } from '../shared/types';

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

function summarizeDevice(device: HID.Device): HidDeviceSummary {
  return {
    path: device.path ?? '',
    vendorId: device.vendorId ?? 0,
    productId: device.productId ?? 0,
    usagePage: device.usagePage ?? 0,
    usage: device.usage ?? 0,
    product: device.product,
    manufacturer: device.manufacturer,
    interface: device.interface ?? 0
  };
}

function send(response: DiscoveryResponse): void {
  if (process.send) {
    process.send(response);
  }
}

process.on('message', (message: DiscoveryRequest) => {
  if (!message || message.type !== 'list-devices') {
    return;
  }

  try {
    send({
      id: message.id,
      ok: true,
      devices: HID.devices().map(summarizeDevice)
    });
  } catch (error) {
    send({
      id: message.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
