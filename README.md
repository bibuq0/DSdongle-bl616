# DS5Dongle BL618 (DS5 Dongle)

A wireless DualSense controller adapter firmware for the **LCTech BL616** board. It bridges a DualSense or DualSense Edge gamepad over Bluetooth Classic (BR/EDR) HID to a host PC via USB HID, appearing as a standard wired DualSense (VID 054C / PID 0CE6) or DualSense Edge (PID 0DF2). Fully compatible with Steam, SDL, PS Remote Play, and more.

> **Unofficial project** — not affiliated with or endorsed by Sony Interactive Entertainment. "DualSense", "DualSense Edge" and "PlayStation" are trademarks of Sony Interactive Entertainment. The USB VID/PID values (054C:0CE6 / 0DF2) are emulated so the host sees a standard wired controller; use at your own risk.

> This project is **only adapted for the LCTech BL616 board** (the firmware's `board_config.h` keeps compile options for other boards, but they are not validated on other hardware).

## Hardware Requirements

- **LCTech BL616** dev board (BL616 QFN32, native USB Type-C + on-board USB-UART bridge)
- **DualSense** controller (standard 0CE6) or **DualSense Edge** (0DF2, auto-detected)
- USB-C data cable (power + USB data)
- Optional serial debug: USB-TTL adapter (CH340/CH341, 3.3V)

## Features

- BT Classic HID Host: inquiry, SDP, L2CAP, SSP auto-pairing
- Full input passthrough: sticks, buttons, triggers, gyro, accelerometer, touchpad, battery
- Full output passthrough: rumble, RGB light bar, player indicators, adaptive triggers
- Bidirectional audio: UAC1 4ch 48kHz OUT → Opus encode → BT 0x39 dual-frame report (547B, speaker/headset); BT mic Opus → decode → UAC1 2ch 48kHz IN
- HD haptics: USB Audio Ch2/Ch3 → 16:1 decimation → BT 0x92 haptic tag
- DualSense Edge support: auto-detect → unlock handshake → profile prefetch, PID auto-switch (0DF2)
- Multi-controller memory: up to 8 paired controllers, single click to switch
- Robust reconnection: periodic scan retry, connection watchdog, link supervision timeout, stale ACL cleanup
- Idle timeout: configurable 0–60 min auto-disconnect (default 30 min)
- PS shortcut: short press → Win+G, long press → Win+Tab
- Configurable polling rate: 250Hz / 500Hz / real-time (~750Hz)
- Button remap including all four D-pad directions (19 remappable inputs)
- USB remote wakeup, USB stealth mode, USB serial (eFuse), trigger motor reduction, volume lock, LED auto-off, battery alerts
- Multilingual Windows companion app: Simplified Chinese / English, dark / light themes

### Windows Companion App (DS5 Dongle)

The `companion/` directory holds an Electron + React Windows configuration tool that talks to the dongle over HID Feature Reports (0xF6–0xF9 / 0xFB) — no firmware changes required:

- Config pages: audio, haptics, triggers, lighting, button remapping, system
- Visual remapping: original DualSense art + button glyphs, changes apply and persist instantly
- Firmware flashing: ships BLFlashCommand + default firmware inside the installer — flash over serial ISP without the SDK
- Live status: controller connection state (auto-detect disconnect), battery / RSSI / firmware version

## Controller Feature Compatibility

The USB side presents DualSense-compatible HID descriptors (auto-switching between DS and Edge), so hosts treat the dongle like a wired controller.

| Feature | Data Path | Supported |
|---------|-----------|-----------|
| Sticks / Buttons / Triggers | HID Input passthrough | Yes |
| Gyro / Accelerometer | HID Input passthrough | Yes |
| Touchpad | HID Input passthrough | Yes |
| Battery level | HID Input passthrough | Yes (+ on-board LED low-battery alert) |
| **Adaptive triggers** | HID Output SetStateData | Yes |
| **Rumble** | HID Output SetStateData | Yes |
| RGB light bar / Player LEDs | HID Output SetStateData | Yes |
| **HD haptics** | USB Audio Ch2/Ch3 → BT 0x92 | Yes |
| Controller speaker | USB Audio Ch0/Ch1 → Opus → BT 0x39 tag 0x93 | Yes |
| Controller microphone | BT Input → Opus decode → USB Audio IN | Yes |
| 3.5mm headset (output) | USB Audio → Opus → BT 0x39 tag 0x96 | Yes |
| Mic mute LED | BT Input mute button → MuteLight control | Yes |

## LED Status Indicators (LCTech BL616 single blue LED)

| State | Pattern |
|-------|---------|
| Idle / waiting to pair | Slow blink (~1Hz) |
| Scanning | Fast blink (~3Hz) |
| Connected | Solid |
| Just disconnected | Blink (~1Hz) for ~3s, then back to idle slow blink |
| Battery ≤20% (discharging) | Medium blink (~1.7Hz) |
| Battery ≤10% (discharging) | Fast blink (~3Hz) |
| Auto-off | Off after 1 minute (on by default; battery warnings unaffected) |
| Event acknowledge | Single flash |
| Bonds cleared | Triple flash |

### BOOT Button Gestures

| Gesture | Action |
|---------|--------|
| Single click | Switch to the next paired controller (up to 8 remembered) |
| Double click | Disconnect current controller + scan for a new one (link keys preserved) |
| Hold 3s | Clear all bonds + start scanning (triple LED flash to confirm) |

## Quick Start

### 1. Bouffalo SDK (DS5Dongle fork — required)

```bash
git clone https://github.com/sqlCRT/bouffalo_sdk.git bouffalo_sdk
```

The build script expects the SDK in `../bouffalo_sdk` (a sibling directory of this repository).

### 2. Dependencies and Toolchain

- macOS/Linux: `brew install cmake make` (or `apt install cmake make`)
- RISC-V toolchain must be the **T-Head extended** build (standard `riscv64-elf-gcc` does not work); macOS uses a community prebuilt toolchain, Linux uses the SDK-bundled or T-Head official toolchain
- Windows: T-Head Windows toolchain + the bundled `build_windows.bat`

### 3. Build (LCTech BL616)

```bash
# macOS / Linux
bash build_macos.sh build      # incremental
bash build_macos.sh rebuild    # clean + rebuild
bash build_lctech616.sh rebuild
```

```bat
rem Windows
build_windows.bat rebuild
```

Output: `firmware/lctech616/ds5dongle-lctech616.bin` (~800 KB) plus boot2/partition files and `flash_prog_cfg.ini`.

## Flashing

**Option 1: Dev Cube (UART/ISP mode)**

1. Build first — the script outputs `ds5dongle-lctech616.bin`, `boot2_bl616_isp_release_v8.1.8.bin` and `partition_cfg_4M_nosec.toml` into `firmware/lctech616/`.
2. Hold the **BOOT** button on the LCTech BL616, then plug the board into the PC via USB-C, keeping BOOT held until it enters UART (ISP) download mode.
3. Open [Bouffalo Lab Dev Cube](https://dev.bouffalolab.com/download), select chip **BL616** and ISP (UART) mode.
4. Select the board's COM port and load these files:
   - Partition table: `firmware/lctech616/partition_cfg_4M_nosec.toml`
   - Boot2: `firmware/lctech616/boot2_bl616_isp_release_v8.1.8.bin`
   - Firmware: `firmware/lctech616/ds5dongle-lctech616.bin`
5. Start the download.

> Use the `_nosec` partition table (`partition_cfg_4M_nosec.toml`), not `partition_cfg_4M.toml`.

**Option 2: Companion app built-in flashing (Windows)**

Install the companion app, open System → Firmware Flashing, pick the COM port — the flash tool and default firmware are bundled in the installer, no SDK needed.

## Usage

1. Connect the LCTech BL616 board's Type-C port to the target host (power + USB data)
2. Put the controller in pairing mode (hold **PS + Create** for 3 seconds, light bar flashes)
3. Watch the on-board blue LED for status (see LED table above)
4. The host should see "DualSense Wireless Controller"

## Configuration

Settings persist via `bt_settings` and are read/written over USB Feature Reports 0xF6–0xF9, changeable from the companion app without rebuilding. Highlights (defaults):

| Option | Default |
|--------|---------|
| Controller mode | Auto (DS5 / Edge / Auto) |
| Polling rate | 250Hz (250 / 500 / real-time ~750Hz) |
| Idle auto-disconnect | 30 min (0–60, 0 = off) |
| LED auto-off | On (after 1 min) |
| Custom light-bar color | White |
| USB serial number | On |
| USB stealth mode | Off |
| PS shortcut | Off |
| USB remote wakeup | Off |
| Haptics gain | 1.0 (1.0–2.0) |
| Trigger motor reduction | 0 (0–10) |
| Volume lock | Off |
| Mic / speaker passthrough | On |

## Project Structure

```
src/
├── main.c              Entry + FreeRTOS task orchestration + data bridge
├── bt_hid_host.c/h     BT Classic HID Host (Inquiry + SDP + L2CAP + SSP)
├── ds5_protocol.c/h    DualSense protocol definitions + CRC32
├── usb_gamepad.c/h     USB composite device (Gamepad + Boot Keyboard)
├── ds5_usb_audio.c/h   USB Audio Class 1 (4ch 48kHz ISO OUT + 2ch 48kHz ISO IN)
├── audio.c/h           Audio pipeline (sinc resample + Opus encode/decode + haptics + mic)
├── usb_wake.c/h        USB remote wakeup FSM
├── state_mgr.c/h       SetStateData conditional merge manager
├── config.c/h          Configuration system (bt_settings + 0xF6-0xF9)
├── dse.c/h             DualSense Edge profile management
├── remap.c/h           Button remap (incl. D-pad directions, 19 keys)
├── led_status.c/h      LED status indicator (LCTech BL616 single blue LED)
├── board_config.h      Board abstraction
├── debug_log.h         Build-time log level macros (LOG_ERR/WRN/INF/DBG/ISR)
└── FreeRTOSConfig.h    FreeRTOS configuration
lib/
├── opus/               Opus codec (fixed-point, xiph/opus)
├── opus.cmake          Opus source file list
└── opus_config.h       Opus build configuration
companion/              Windows companion app (Electron + React, see section above)
firmware/               Board flash configs + local build output (binaries git-ignored)
```

## Architecture

```
┌──────────────┐          ┌──────────────┐          ┌──────────────┐
│  DualSense   │◄─ BT ──►│ LCTech BL616  │◄─ USB ──►│   Host PC    │
│  Controller  │  BR/EDR  │   DS5 Dongle │  HID     │  Steam/SDL   │
└──────────────┘  HID     └──────────────┘  Device   └──────────────┘
```

**Data flows:**

- **Input (Controller → Host)**: BT L2CAP receives Report 0x31 → strip HID header/seq/CRC → 63-byte payload sent as USB Report 0x01
- **Output (Host → Controller)**: USB EP OUT receives Report 0x02 → State Manager conditional merge → BT Report 0x31 (78B with CRC32) → L2CAP send
- **Audio OUT (Host → Controller)**: USB Audio ISO OUT (4ch 48kHz) → double-buffer PCM accumulation → polyphase sinc resample 512→480 → Opus CBR encode (160kbps) → haptics decimation → 0x39 dual-frame report (547B) → L2CAP send
- **Audio IN (Controller → Host)**: BT 0x31 mic Opus frame → queue → Opus decode (48kHz mono) → mono-to-stereo → ring buffer → USB Audio ISO IN (2ch 48kHz)
- **Feature (bidirectional)**: GET_REPORT from BT-side cache (DSE profiles support NAK gating) | SET_REPORT adds CRC32 and forwards via L2CAP control channel

## Known Limitations

| Item | Description |
|------|-------------|
| Single active controller | One controller connected at a time; up to 8 pairings remembered (single click switches) |
| Board | Only the LCTech BL616 is adapted and validated |

## Acknowledgements

- [sqlCRT/ds5dongle-bl618-opensource](https://github.com/sqlCRT/ds5dongle-bl618-opensource) — source of this open-source firmware release
- [SundayMoments/DS5_Bridge](https://github.com/SundayMoments/DS5_Bridge) — source of the Windows companion app (`companion/`, button glyphs, controller art and UI design)
- [awalol/DS5Dongle](https://github.com/awalol/DS5Dongle) — original Pico 2W implementation, core protocol reference
- [bouffalolab/bouffalo_sdk](https://github.com/bouffalolab/bouffalo_sdk) — BL618 SDK + Zephyr BT stack
- [CherryUSB](https://github.com/cherry-embedded/CherryUSB) — USB stack
- [xiph/opus](https://github.com/xiph/opus) — Opus audio codec (fixed-point)
- Linux kernel `hid-playstation.c` — DualSense protocol offset reference
- BL618 porting developed with [Cursor](https://www.cursor.com/) + Claude Opus 4.6

## Third-Party Notices

- Code is ported/adapted from [awalol/DS5Dongle](https://github.com/awalol/DS5Dongle), licensed under the MIT License (Copyright (c) 2026 awalol) — see [NOTICE](NOTICE) for the full text
- The Windows companion app is ported/adapted from [SundayMoments/DS5_Bridge](https://github.com/SundayMoments/DS5_Bridge), licensed under AGPL-3.0-only
- [lib/opus](lib/opus) is the [xiph/opus](https://github.com/xiph/opus) codec, BSD-3-Clause licensed (see `lib/opus/LICENSE_PLEASE_READ.txt`)
- [CherryUSB](https://github.com/cherry-embedded/CherryUSB) and [bouffalolab/bouffalo_sdk](https://github.com/bouffalolab/bouffalo_sdk) are external build dependencies, Apache-2.0 licensed
- The Linux kernel `hid-playstation.c` (GPL-2.0) was used as a protocol/offset reference only; no kernel code is included

## License

This project is licensed under the [GNU General Public License v3.0](LICENSE) (GPL-3.0). Anyone who uses or modifies this code in a distributed product must make their source code available under the same license.
