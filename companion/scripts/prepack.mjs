import { cpSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Stagge the flash tool + default firmware into companion/resources so
// electron-builder can ship them as extraResources.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const companion = path.resolve(__dirname, '..');
const repo = path.resolve(companion, '..');
const sdk = process.env.BL_SDK_BASE || path.resolve(repo, '..', 'bouffalo_sdk');
const flashCube = path.join(sdk, 'tools', 'bflb_tools', 'bouffalo_flash_cube');
const fwDir = path.join(repo, 'firmware', 'lctech616');

const resRoot = path.join(companion, 'resources');
const resFlash = path.join(resRoot, 'flash-cube');
const resFw = path.join(resRoot, 'firmware');

rmSync(resRoot, { recursive: true, force: true });
mkdirSync(resFlash, { recursive: true });
mkdirSync(resFw, { recursive: true });

cpSync(path.join(flashCube, 'BLFlashCommand.exe'), path.join(resFlash, 'BLFlashCommand.exe'));
cpSync(path.join(flashCube, 'chips'), path.join(resFlash, 'chips'), { recursive: true });

const files = ['boot2_bl616_isp_release_v8.1.8.bin', 'partition.bin', 'ds5dongle-lctech616.bin', 'ds5dongle-lctech616-hs.bin'];
for (const f of files) {
  cpSync(path.join(fwDir, f), path.join(resFw, f));
}

console.log('[prepack] flash tool + firmware staged to companion/resources');
