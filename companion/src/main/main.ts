import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import type { DualsenseConfig, RemapTable } from '../shared/protocol';
import type {
  FlashFile,
  UiLanguage,
  UiScalePercent,
  UiThemePreset
} from '../shared/types';
import {
  defaultFlashFiles,
  findFlashCommand,
  flashFirmware,
  listSerialPorts
} from './bl616-flasher';
import { BridgeService } from './bridge-service';
import { SettingsStore } from './settings-store';

let mainWindow: BrowserWindow | null = null;
let bridgeService: BridgeService | null = null;

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1120,
    height: 700,
    minWidth: 900,
    minHeight: 600,
    title: 'DS5 Dongle Config',
    frame: false,
    backgroundColor: '#050b13',
    show: false,
    icon: path.join(__dirname, '../../assets/icons/ds5dongle.ico'),
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.once('ready-to-show', () => {
    window.show();
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    // __dirname = dist/main/main -> dist/main/preload.js, dist/renderer/index.html
    void window.loadFile(path.join(__dirname, '../../renderer/index.html'));
  }

  window.on('closed', () => {
    mainWindow = null;
  });

  return window;
}

function sendSnapshot(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  const service = bridgeService;
  if (service) {
    mainWindow.webContents.send('bridge:snapshot', service.getSnapshot());
  }
}

function registerIpc(service: BridgeService, settings: SettingsStore): void {
  ipcMain.handle('bridge:getSnapshot', () => service.getSnapshot());
  ipcMain.handle('bridge:getDiagnostics', () => service.getDiagnostics());
  ipcMain.handle('bridge:listHidDevices', () => service.listHidDevices());
  ipcMain.handle('bridge:requestRescan', () => service.requestRescan());
  ipcMain.handle('bridge:applyConfig', (_event: IpcMainInvokeEvent, patch: Partial<DualsenseConfig>) =>
    service.applyConfig(patch)
  );
  ipcMain.handle('bridge:saveConfig', () => service.saveConfig());
  ipcMain.handle('bridge:resetConfig', () => service.resetConfig());
  ipcMain.handle('bridge:setRemap', (_event: IpcMainInvokeEvent, table: RemapTable) =>
    service.setRemap(table)
  );
  ipcMain.handle('bridge:resetRemap', () => service.resetRemap());
  ipcMain.handle('settings:get', () => settings.get());
  ipcMain.handle('settings:setScale', (_event: IpcMainInvokeEvent, scale: UiScalePercent) =>
    settings.setScale(scale)
  );
  ipcMain.handle('settings:setTheme', (_event: IpcMainInvokeEvent, theme: UiThemePreset) =>
    settings.setTheme(theme)
  );
  ipcMain.handle('settings:setLanguage', (_event: IpcMainInvokeEvent, language: UiLanguage) =>
    settings.setLanguage(language)
  );

  ipcMain.handle('flash:findTool', () => findFlashCommand());
  ipcMain.handle('flash:listPorts', () => listSerialPorts());
  ipcMain.handle('flash:defaultFiles', () =>
    defaultFlashFiles().map((file) => ({ ...file }))
  );
  ipcMain.handle(
    'flash:flash',
    (
      _event: IpcMainInvokeEvent,
      port: string,
      files: FlashFile[],
      firmwarePath: string
    ) => {
      const resolved: FlashFile[] = files.map((file) =>
        file.address === 0x010000
          ? { ...file, path: firmwarePath || file.path }
          : { ...file }
      );
      return flashFirmware(port, resolved);
    }
  );

  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:close', () => mainWindow?.close());

  ipcMain.handle(
    'dialog:pickFile',
    async (
      _event: IpcMainInvokeEvent,
      options: {
        title?: string;
        defaultPath?: string;
        filters?: Array<{ name: string; extensions: string[] }>;
      }
    ) => {
      const result = await dialog.showOpenDialog({
        title: options?.title ?? 'Select file',
        defaultPath: options?.defaultPath,
        filters: options?.filters ?? [{ name: 'All files', extensions: ['*'] }],
        properties: ['openFile']
      });
      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }
      return result.filePaths[0];
    }
  );

  service.on('snapshot', sendSnapshot);
}

function cleanup(): void {
  if (bridgeService) {
    bridgeService.stop().catch(() => undefined);
    bridgeService = null;
  }
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    const settings = SettingsStore.createIn(app.getPath('userData'));
    bridgeService = new BridgeService(settings);
    registerIpc(bridgeService, settings);
    mainWindow = createWindow();
    void bridgeService.start();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('before-quit', cleanup);
}
