import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { FlashFile, FlashResult } from '../shared/types';

/**
 * BL616 firmware flashing via the Bouffalo Lab command-line tool
 * (`BLFlashCommand.exe` from the SDK's bouffalo_flash_cube). Flashes the
 * classic three-part layout:
 *
 *   0x000000  boot2_*.bin
 *   0x00E000  partition.bin
 *   0x010000  ds5dongle-*.bin   (from the partition table)
 *
 * The dongle must be in ISP (UART download) mode: hold BOOT and plug in USB.
 */

function defaultSdkBase(): string {
  // dist/main/main -> 5 levels up = project's parent dir (where the SDK
  // fork lives as a sibling, e.g. bldev/bouffalo_sdk next to this repo).
  return path.resolve(__dirname, '..', '..', '..', '..', '..', 'bouffalo_sdk');
}

export function findFlashCommand(): string | null {
  const candidates = [
    // Packaged with the app (electron-builder extraResources).
    process.resourcesPath
      ? path.join(process.resourcesPath, 'flash-cube', 'BLFlashCommand.exe')
      : '',
    process.env.BL_SDK_BASE
      ? path.join(process.env.BL_SDK_BASE, 'tools', 'bflb_tools', 'bouffalo_flash_cube', 'BLFlashCommand.exe')
      : '',
    path.join(defaultSdkBase(), 'tools', 'bflb_tools', 'bouffalo_flash_cube', 'BLFlashCommand.exe')
  ];
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function defaultFlashFiles(binDir?: string): FlashFile[] {
  const dir = binDir ?? (process.resourcesPath ? path.join(process.resourcesPath, 'firmware') : '');
  return [
    { address: 0x000000, path: path.join(dir, 'boot2_bl616_isp_release_v8.1.8.bin') },
    { address: 0x00e000, path: path.join(dir, 'partition.bin') },
    { address: 0x010000, path: path.join(dir, 'ds5dongle-lctech616.bin') }
  ];
}

export function listSerialPorts(): Promise<string[]> {
  const script =
    '[System.IO.Ports.SerialPort]::GetPortNames() | Sort-Object';
  return new Promise((resolve, reject) => {
    const child = spawn('powershell', ['-NoProfile', '-Command', script], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString('utf8')));
    child.stderr.on('data', (chunk: Buffer) => (err += chunk.toString('utf8')));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(err.trim() || `listSerialPorts exited ${code}`));
        return;
      }
      resolve(
        out
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
      );
    });
  });
}

export async function flashFirmware(
  port: string,
  files: FlashFile[],
  options: { baudrate?: number; onProgress?: (line: string) => void } = {}
): Promise<FlashResult> {
  const command = findFlashCommand();
  if (!command) {
    return {
      ok: false,
      output: '',
      error: 'BLFlashCommand.exe not found. Build firmware or install the Bouffalo SDK first.'
    };
  }
  for (const file of files) {
    const resolved = file.path.replace(/\*\.bin$/, '.bin');
    if (resolved.includes('*')) {
      return { ok: false, output: '', error: `Firmware file not found: ${file.path}` };
    }
    if (!existsSync(resolved)) {
      return { ok: false, output: '', error: `Firmware file not found: ${resolved}` };
    }
  }

  const args = [
    '--port',
    port,
    '--baudrate',
    String(options.baudrate ?? 2000000),
    '--chipname',
    'bl616',
    'write_flash_files'
  ];
  for (const file of files) {
    args.push(`0x${file.address.toString(16).padStart(6, '0')}`, file.path.replace(/\*\.bin$/, '.bin'));
  }

  return new Promise<FlashResult>((resolve) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      output += text;
      options.onProgress?.(text);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      output += text;
      options.onProgress?.(text);
    });
    child.on('error', (error) => resolve({ ok: false, output, error: error.message }));
    child.on('close', (code) => {
      const ok = code === 0;
      resolve({ ok, output, error: ok ? undefined : `BLFlashCommand exited with code ${code}` });
    });
  });
}
