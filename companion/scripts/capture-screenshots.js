const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

// Captures the app UI pages with mock data for the README.
// Usage: node_modules/electron/dist/electron.exe scripts/capture-screenshots.js

const SNAP_DIR = path.join(__dirname, '..', '..', 'docs', 'screenshots');

const config = {
  hapticsGain: 1.5,
  speakerVolume: 100,
  headsetVolume: 90,
  speakerGain: 2,
  inactiveMinutes: 30,
  disableLed: true,
  pollingRateMode: 0,
  audioBufferLength: 64,
  controllerMode: 2,
  enableUsbSn: true,
  psShortcutEnabled: false,
  disableMic: false,
  disableSpeaker: false,
  enableWake: false,
  triggerReduce: 3,
  lockVolume: false,
  dseDetected: false,
  usbStealth: false,
  ledColor: [255, 255, 255]
};

const remap = Array.from({ length: 19 }, (_, i) => ({
  type: 0,
  value: i,
  modifier: 0,
  flags: 0
}));

const snapshot = {
  connected: true,
  connectionState: 'connected',
  devicePath: 'HID\\VID_054C&PID_0CE6&MI_03',
  productId: 0x0ce6,
  firmwareVersion: 'LCT616-DS5 3.15H',
  status: {
    rssi: -42,
    rssiKnown: true,
    speakerActive: false,
    micActive: false,
    batteryPercent: 78,
    batteryState: 0
  },
  config,
  settings: {
    ...config,
    remap
  },
  uptimeSeconds: 0,
  busy: false,
  lastError: null,
  lastSavedAt: null
};

function registerMockIpc() {
  ipcMain.handle('bridge:getSnapshot', () => snapshot);
  ipcMain.handle('bridge:getDiagnostics', () => ({ connected: true }));
  ipcMain.handle('bridge:listHidDevices', () => []);
  ipcMain.handle('bridge:requestRescan', () => snapshot);
  ipcMain.handle('bridge:applyConfig', () => snapshot);
  ipcMain.handle('bridge:saveConfig', () => snapshot);
  ipcMain.handle('bridge:resetConfig', () => snapshot);
  ipcMain.handle('bridge:setRemap', () => snapshot);
  ipcMain.handle('bridge:resetRemap', () => snapshot);
  ipcMain.handle('settings:get', () => ({ uiScale: 100, uiTheme: 'dark', language: 'zh' }));
  ipcMain.handle('settings:setScale', () => ({}));
  ipcMain.handle('settings:setTheme', () => ({}));
  ipcMain.handle('settings:setLanguage', () => ({}));
  ipcMain.handle('flash:findTool', () => 'C:\\tools\\BLFlashCommand.exe');
  ipcMain.handle('flash:listPorts', () => ['COM5']);
  ipcMain.handle('flash:defaultFiles', () => []);
  ipcMain.handle('flash:flash', () => ({ ok: true, output: '' }));
  ipcMain.handle('dialog:pickFile', () => null);
  ipcMain.on('window:minimize', () => {});
  ipcMain.on('window:close', () => {});
}

const PAGES = ['overview', 'audio', 'haptics', 'triggers', 'lighting', 'buttons', 'system'];

app.whenReady().then(async () => {
  registerMockIpc();
  const win = new BrowserWindow({
    width: 1120,
    height: 700,
    x: -2000,
    y: 0,
    show: true,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'dist', 'main', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  await win.loadFile(path.join(__dirname, '..', 'dist', 'renderer', 'index.html'));
  await new Promise((r) => setTimeout(r, 3000));

  fs.mkdirSync(SNAP_DIR, { recursive: true });
  await win.webContents.capturePage(); // warm-up frame
  for (let i = 0; i < PAGES.length; i++) {
    if (i > 0) {
      await win.webContents.executeJavaScript(
        `document.querySelectorAll('.sidebar .nav')[${i}].click()`
      );
    }
    await new Promise((r) => setTimeout(r, 700));
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(SNAP_DIR, `app-${PAGES[i]}.png`), img.toPNG());
    console.log('captured', PAGES[i]);
  }
  app.quit();
});
