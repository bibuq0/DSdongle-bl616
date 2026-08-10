import type { BridgeApi } from '../preload';

declare global {
  interface Window {
    bridge: BridgeApi;
  }
}

export {};
