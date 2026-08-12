import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { DualsenseConfig, RemapTable } from './shared/protocol';
import type {
  BridgeDiagnostics,
  BridgeSnapshot,
  FlashFile,
  FlashResult,
  HidDeviceSummary,
  UiLanguage,
  UiScalePercent,
  UiThemePreset
} from './shared/types';

export interface BridgeApi {
  getSnapshot(): Promise<BridgeSnapshot>;
  getDiagnostics(): Promise<BridgeDiagnostics>;
  listHidDevices(): Promise<HidDeviceSummary[]>;
  requestRescan(): Promise<BridgeSnapshot>;
  applyConfig(patch: Partial<DualsenseConfig>): Promise<BridgeSnapshot>;
  saveConfig(): Promise<BridgeSnapshot>;
  resetConfig(): Promise<BridgeSnapshot>;
  setRemap(table: RemapTable): Promise<BridgeSnapshot>;
  resetRemap(): Promise<BridgeSnapshot>;
  getSettings(): Promise<{
    uiScale: UiScalePercent;
    uiTheme: UiThemePreset;
    language: UiLanguage;
  }>;
  setScale(scale: UiScalePercent): Promise<void>;
  setTheme(theme: UiThemePreset): Promise<void>;
  setLanguage(language: UiLanguage): Promise<void>;
  findFlashTool(): Promise<string | null>;
  listSerialPorts(): Promise<string[]>;
  flashDefaultFiles(): Promise<FlashFile[]>;
  flash(port: string, files: FlashFile[], firmwarePath: string): Promise<FlashResult>;
  minimize(): void;
  closeWindow(): void;
  pickFile(options?: {
    title?: string;
    defaultPath?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
  }): Promise<string | null>;
  onSnapshot(callback: (snapshot: BridgeSnapshot) => void): () => void;
}

const api: BridgeApi = {
  getSnapshot: () => ipcRenderer.invoke('bridge:getSnapshot'),
  getDiagnostics: () => ipcRenderer.invoke('bridge:getDiagnostics'),
  listHidDevices: () => ipcRenderer.invoke('bridge:listHidDevices'),
  requestRescan: () => ipcRenderer.invoke('bridge:requestRescan'),
  applyConfig: (patch) => ipcRenderer.invoke('bridge:applyConfig', patch),
  saveConfig: () => ipcRenderer.invoke('bridge:saveConfig'),
  resetConfig: () => ipcRenderer.invoke('bridge:resetConfig'),
  setRemap: (table) => ipcRenderer.invoke('bridge:setRemap', table),
  resetRemap: () => ipcRenderer.invoke('bridge:resetRemap'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setScale: (scale) => ipcRenderer.invoke('settings:setScale', scale),
  setTheme: (theme) => ipcRenderer.invoke('settings:setTheme', theme),
  setLanguage: (language) => ipcRenderer.invoke('settings:setLanguage', language),
  findFlashTool: () => ipcRenderer.invoke('flash:findTool'),
  listSerialPorts: () => ipcRenderer.invoke('flash:listPorts'),
  flashDefaultFiles: () => ipcRenderer.invoke('flash:defaultFiles'),
  flash: (port, files, firmwarePath) =>
    ipcRenderer.invoke('flash:flash', port, files, firmwarePath),
  minimize: () => ipcRenderer.send('window:minimize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  pickFile: (options) => ipcRenderer.invoke('dialog:pickFile', options),
  onSnapshot: (callback) => {
    const listener = (_event: IpcRendererEvent, snapshot: BridgeSnapshot): void => {
      callback(snapshot);
    };
    ipcRenderer.on('bridge:snapshot', listener);
    return () => ipcRenderer.removeListener('bridge:snapshot', listener);
  }
};

contextBridge.exposeInMainWorld('bridge', api);
