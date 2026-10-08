# DS5Dongle BL618（DS5 Dongle）

> **English**：[README_EN.md](README_EN.md)

基于 **LCTech BL616** 开发板的 DualSense 无线手柄适配器固件。将 DualSense / DualSense Edge 手柄通过蓝牙经典（BR/EDR）HID 连接到 BL616，再通过 USB 透传给主机。主机端有**五种外观**可选：**DualSense**（VID 054C / PID 0CE6）、**DualSense Edge**（PID 0DF2）、**DualShock 4**（PID 09CC）、**Xbox One / Series**（GIP，主机走 xboxgip）、**Xbox 360**（XUSB，VID 1209 / PID DB05）。Steam、SDL、PS Remote Play 等均可直接识别。

> **非官方项目** —— 与索尼互动娱乐（Sony Interactive Entertainment）无关，亦未获其认可。"DualSense"、"DualSense Edge" 和 "PlayStation" 是索尼互动娱乐的商标。USB VID/PID（054C:0CE6 / 0DF2）仅用于模拟，使主机将其识别为有线手柄；使用风险自负。

> 本项目**仅适配 LCTech BL616 开发板**（固件源码中板级抽象 `board_config.h` 保留了其它板型的编译选项，但未在其它硬件上验证，请以 LCTech BL616 为准）。

## 硬件要求

- **LCTech BL616 开发板**（BL616 QFN32，Type-C 原生 USB + 板载 USB 转串口）
- **DualSense 手柄**（标准版 0CE6）或 **DualSense Edge**（0DF2，自动识别）
- USB-C 数据线（供电 + USB 数据）
- 串口调试（可选）：USB-TTL 适配器（CH340/CH341，3.3V）

## 功能特性

- BT Classic HID Host：Inquiry、SDP、L2CAP、SSP 自动配对
- 完整输入透传：摇杆、按键、扳机、陀螺仪、加速度计、触摸板、电量
- 完整输出转发（主机每帧原样透传，叠加配置 overlay 与玩家灯电量表）：震动、RGB 灯条、玩家指示灯、自适应扳机
- 双向音频透传：UAC1 4ch 48kHz OUT → Opus 编码 → BT 0x39 双帧报告（547B，扬声器/耳机）；BT 麦克风 Opus → 解码 → UAC1 2ch 48kHz IN
- HD 触觉反馈：USB Audio Ch2/Ch3 → 16:1 降采样 → BT 0x92 触觉 tag
- **音频震动**：听**电脑音箱/耳机**时打开应用「音频震动」（WASAPI 环回，软件需挂着；Xbox One 档没有 4 声道 UAC，不可用）。听**手柄扬声器**时不要指望应用环回，请开 Windows **单声道音频** 让系统把声音填进触觉声道
- DualSense Edge 支持：自动识别 → unlock 握手 → profile 预取，PID 自动切换（0DF2）
- **Xbox 360 手柄外观**：可切换为 Xbox 手柄（XInput），游戏按 XInput 识别；音频与震动保留，只有自适应扳机不可用（XInput 没有扳机力反馈，灯条固定为应用里设的颜色）
- **DualShock 4 外观**：USB 身份 `054C:09CC`，输入/触控/震动按 DS4 有线布局转发（无 PS4 主机认证）
- **Xbox One / Series 手柄外观（GIP）**：走 xboxgip，主机当真 Xbox 手柄，可下发**含左右扳机的 4 路震动**（LT/RT 映射到 DS5 扳机执行器）。该档**一律全速**（高速下耳机播放会被驱动做成采集÷1000）。配置走额外 HID 客户端（`045E:0B84`），应用可以连上改设置和按键映射。震动强度（主电机 / 扳机，30%–200%）也可在本档或其它档保存
- **手柄组合键切档**：按住 **PS + 方向键** —— `左`=DualSense / `上`=DualSense Edge / `右`=Xbox One (GIP) / `下`=DualShock 4，存 flash 并重启。**Xbox 360 只能在应用下拉框切换。** 手柄走蓝牙、与 USB 档无关，GIP 档里也能切回来
- 多手柄记忆：最多记忆 8 个已配对手柄，单击按键快速切换
- 稳健重连：周期性扫描重试、连接看门狗、链路监督超时、陈旧 ACL 清理
- 空闲超时：可配置 0–60 分钟自动断开（默认 30 分钟）
- 轮询率：250 Hz / 500 Hz；高速固件另有 1000 Hz。有效回报率跟随蓝牙。全速固件没有 1000 Hz 选项
- **陀螺仪瞄准**：扣物理 R2 时把偏航/俯仰叠到右摇杆（灵敏度 10–200%）
- 按键映射：任意按键重映射，含 **D-pad 四方向**（共 19 个可映射按键）
- USB 远程唤醒、USB 序列号（eFuse）、扳机电机功率限制、音量锁定、LED 自动熄灭、玩家灯电量显示（0-10% 1 颗 / 20-40% 2 颗 / 50-70% 3 颗 / 80-100% 4 颗；电量未知时不覆盖玩家灯）
- 多语言伴生应用（Windows）：简体中文 / English，深色 / 浅色主题

### Windows 伴生应用（DS5 Dongle）

仓库 `companion/` 提供一个基于 Electron + React 的 **Windows 配置工具**。DualSense / Edge / DualShock 4 / Xbox 360 走 WinUSB vendor（0xF6–0xF9 / 0xFB）；**Xbox One (GIP)** 走 HID 配置通道（同一套报文）。无需改固件：

- **配置页面**：音频（音量、增益、缓冲、透传、音频震动）、触觉、扳机、灯条、按键映射（含陀螺仪瞄准）、系统（手柄模式 / 轮询率 / 空闲超时 / USB 唤醒 / USB 序列号）
- **可视化按键映射**：原版 DualSense 手柄图 + 按键 glyph 图标，映射实时生效并持久化
- **固件刷写**：内置 BLFlashCommand + 默认固件（打包进安装包），无需 SDK 即可串口 ISP 刷写
- **状态监测**：手柄连接状态实时显示（断连自动检测），电量 / RSSI / 固件版本
- **版本与更新**：概览页显示应用版本与安装包内置的固件版本，可一键检查 GitHub 上的新版本并直接下载到「下载」文件夹

**界面预览：**

<p align="center">
  <img src="docs/screenshots/app-overview.png" width="720" alt="概览页" />
  <br><em>概览：连接状态 / 电量 / 信号 / 版本更新</em>
</p>

<p align="center">
  <img src="docs/screenshots/app-audio.png" width="720" alt="音频页" />
  <br><em>音频：锁定音量、增益、缓冲、透传</em>
</p>

<p align="center">
  <img src="docs/screenshots/app-haptics.png" width="720" alt="触觉页" />
  <br><em>触觉：音频震动、增益、PS4 / Xbox 震动强度</em>
</p>

<p align="center">
  <img src="docs/screenshots/app-triggers.png" width="720" alt="扳机页" />
  <br><em>扳机：电机限流、Xbox One 扳机强度</em>
</p>

<p align="center">
  <img src="docs/screenshots/app-buttons.png" width="720" alt="按键映射页" />
  <br><em>按键映射：手柄图 + glyph 图标，含陀螺仪瞄准</em>
</p>

<p align="center">
  <img src="docs/screenshots/app-system.png" width="720" alt="系统页" />
  <br><em>系统：模式 / 轮询率 / USB / 固件刷写</em>
</p>

<p align="center">
  <img src="docs/screenshots/app-help.png" width="720" alt="使用说明页" />
  <br><em>使用说明：配对、组合键切档、LED 与 BOOT 键</em>
</p>

## 手柄功能兼容性

USB 端默认提供 DualSense 兼容的 HID 描述符（DS 与 Edge 自动切换），主机将其视为有线手柄；也可切换成 DualShock 4 / Xbox One / Xbox 360。下表按 **DualSense 外观**列出，其它外观的差异见上方功能列表。

| 功能 | 数据路径 | 支持 |
|------|----------|------|
| 摇杆 / 按键 / 扳机 | HID Input 透传 | 是 |
| 陀螺仪 / 加速度计 | HID Input 透传 | 是 |
| 触摸板 | HID Input 透传 | 是 |
| 电池电量 | HID Input 透传 | 是（电量经 feature 0xF9 上报应用显示；接收器 LED 无电量告警） |
| **自适应扳机** | HID Output SetStateData | 是 |
| **震动** | HID Output SetStateData | 是 |
| RGB 灯条 / 玩家指示灯 | HID Output SetStateData | 是 |
| **HD 触觉反馈** | USB Audio Ch2/Ch3 → BT 0x92 | 是 |
| 手柄扬声器 | USB Audio Ch0/Ch1 → Opus → BT 0x39 tag 0x93 | 是 |
| 手柄麦克风 | BT Input → Opus 解码 → USB Audio IN | 是 |
| 3.5mm 耳机（输出） | USB Audio → Opus → BT 0x39 tag 0x96 | 是 |
| 麦克风静音灯 | BT Input 静音键 → MuteLight 控制 | 是 |

## LED 状态指示（LCTech BL616 单颗蓝色 LED）

| 状态 | 模式（单颗蓝灯） |
|------|------------------|
| 空闲 / 等待配对 | 慢闪（~1Hz） |
| 扫描中 | 快闪（~3Hz） |
| 已连接 | 常亮 |
| 刚断开 | 闪烁（~1Hz）约 3 秒，随后回到空闲慢闪 |
| 自动熄灭 | 1 分钟后熄灭（默认开启） |
| 事件确认 | 闪一次 |
| 清除配对 | 连闪三次 |

### BOOT 按键手势

| 手势 | 功能 |
|------|------|
| **单击** | 切换到下一个已配对的手柄（最多记忆 8 个） |
| **双击** | 断开当前手柄 + 重新扫描配对新手柄（保留 link key） |
| **长按 3 秒** | 清除所有配对 + 重新扫描（三次蓝闪确认） |

## 快速开始

### 1. 安装 Bouffalo SDK（必须使用本项目分支）

```bash
git clone https://github.com/sqlCRT/bouffalo_sdk.git bouffalo_sdk
```

构建脚本要求 SDK 位于 `../bouffalo_sdk`（与本仓库同级目录）。

### 2. 安装依赖与工具链

- macOS/Linux：`brew install cmake make`（或 `apt install cmake make`）
- RISC-V 工具链需使用 **T-Head 扩展** 版本（标准 `riscv64-elf-gcc` 不可用），macOS 可用社区预编译工具链，Linux 用 SDK 自带或 T-Head 官方工具链
- Windows：T-Head Windows 工具链 + 仓库自带 `build_windows.bat`

### 3. 编译（LCTech BL616）

```bash
# macOS / Linux
bash build_macos.sh build      # 增量编译
bash build_macos.sh rebuild    # 清理后重新编译
bash build_lctech616.sh rebuild
```

```bat
rem Windows
build_windows.bat rebuild
```

产物位于 `firmware/lctech616/ds5dongle-lctech616-<固件版本>.bin`（约 800KB），以及 `boot2_bl616_isp_release_v8.1.8.bin`、`partition.bin` 和 `flash_prog_cfg.ini`。

> **文件名自带版本号**：版本号是扩展名之前最后一段，规则与应用安装包 `DS5-Dongle-Setup-<应用版本>.exe` 一致，
> 例如 `ds5dongle-lctech616-3.22.2.bin`、`ds5dongle-lctech616-hs-3.22.2.bin`。
> 高速版只靠文件名里的 `-hs` 区分，版本号与全速版相同（镜像内部仍会带 `H`，那是固件自己的标识）。
> 版本号由构建脚本从刚编出来的镜像里读出（镜像自己嵌了 `LCT616-DS5 x.y.z`），不需要手工同步。
> 伴生应用的「检查更新」按同一规则从文件名读版本，所以**发布到 GitHub Release 时请保持这个文件名不要改**。

## 刷写方式

**伴生应用内置一键刷写（Windows）** —— 刷写工具与默认固件都已打进安装包，不需要装 SDK、不需要 Dev Cube：

1. 按住 LCTech BL616 的 **BOOT** 键，然后通过 USB-C 插入电脑，保持按住直到进入 UART（ISP）下载模式
2. 打开伴生应用 →「系统 → 固件刷写」，点「刷新」选中开发板对应的串口
3. 三个文件会自动填好（Boot2 `0x000000`、分区表 `0x00E000`、固件 `0x010000`）；要换固件版本就点「浏览」选另一个 `.bin`
4. 点「刷写固件」

> 刷写只用 `firmware/lctech616/` 里的 bin 文件：`boot2_bl616_isp_release_v8.1.8.bin`、`partition.bin`，
> 以及 `ds5dongle-lctech616-<固件版本>.bin` / `ds5dongle-lctech616-hs-<固件版本>.bin` 二选一（全速版 / 高速版）。
> 从源码运行时应用读的就是这个目录；装成安装包后读的是安装目录 `resources\firmware\`（打包时从这里复制过去的那份）。

## 使用

1. 将 LCTech BL616 开发板的 Type-C 口连接到目标主机（供电 + USB 数据）
2. 手柄进入配对模式（同时长按 **PS + Create** 3 秒，灯条闪烁）
3. 观察板载蓝色 LED 状态（见上方 LED 状态表）
4. 主机应识别出 "DualSense Wireless Controller"

## 配置项

配置通过 `bt_settings` 持久化，经 WinUSB 或 GIP HID 读写 0xF6–0xF9 / 0xFB，可用伴生应用免重编译修改。主要配置项（默认值）：

| 配置项 | 默认值 |
|--------|--------|
| 手柄模式 | Auto（DualSense / Edge / DualShock 4 / Xbox One / Xbox 360） |
| 轮询率 | 250 Hz（250 / 500；高速固件另有 1000 Hz） |
| 空闲自动断开 | 30 分钟（0–60，0 = 关闭） |
| LED 自动熄灭 | 开启（1 分钟后） |
| 灯条自定义颜色 | 白色 |
| USB 序列号 | 关闭 |
| USB 远程唤醒 | 关闭 |
| 触觉增益 | 1.0（1.0–2.0） |
| Xbox 主电机强度 | 100%（30–200%，仅 GIP 档生效；外带 4 档响应曲线） |
| Xbox 扳机强度 | 100%（30–200%，仅 GIP 档生效；另有响应曲线 / 震动频率 / 轻触补偿） |
| 扳机电机限制 | 0（0–10） |
| 音量锁定 | 关闭 |
| 麦克风 / 扬声器透传 | 开启 |
| 陀螺仪瞄准 | 关闭（灵敏度 100%） |
| PS4 / Xbox 360 经典马达强度 | 100%（30–200%） |

### 切换「手柄模式」要注意什么

**手柄组合键在任何档都有效**（含 Xbox One）：

| 组合键（按住 PS 再按） | 切到 |
|---|---|
| **PS + 左** | DualSense |
| **PS + 上** | DualSense Edge |
| **PS + 右** | Xbox One (GIP) |
| **PS + 下** | DualShock 4 |

按住 PS 期间只触发一次；命中后存 flash 并重启。**Xbox 360 只能在应用下拉框切换。**

**也可以用应用下拉框**（含 Xbox 360），改完点「保存到接收器」：固件发现手柄模式 / 轮询率 / USB 远程唤醒 / USB 序列号变了，就自己存盘并重新枚举，不用拔插。重启会断蓝牙，**之后按一下 PS 重连手柄**。Xbox One 档应用仍可走 HID 配置通道。

## 项目结构

```
src/
├── main.c              入口 + FreeRTOS 任务 + 输出透传 + 数据桥接
├── bt_hid_host.c/h     BT Classic HID Host（Inquiry + SDP + L2CAP + SSP）
├── ds5_protocol.c/h    DualSense 协议定义 + CRC32
├── usb_gamepad.c/h     USB 复合设备 + 各外观描述符 / persona 切换
├── gip.c/h             Xbox One / Series（GIP：握手、输入、震动、耳机、HID 配置）
├── xinput.c/h          Xbox 360 (XUSB) 输入映射
├── ds4.c/h             DualShock 4 USB 输入/输出映射
├── gyro_aim.c/h        陀螺仪瞄准（物理 R2 时叠到右摇杆）
├── ds5_usb_audio.c/h   USB Audio Class 1（4ch 48kHz ISO OUT + 2ch 48kHz ISO IN）
├── audio.c/h           音频处理管线（sinc 重采样 + Opus 编解码 + 触觉 + 麦克风）
├── usb_wake.c/h        USB 远程唤醒 FSM
├── state_mgr.c/h       SetStateData 状态管理（primer / 音量同步 / 音量锁）
├── config.c/h          配置系统（bt_settings + 0xF6-0xF9）
├── dse.c/h             DualSense Edge Profile 管理
├── remap.c/h           按键映射（含 D-pad 四方向，共 19 键）
├── led_status.c/h      LED 状态指示（LCTech BL616 单蓝灯）
├── board_config.h      板级抽象
├── debug_log.h         构建期日志级别宏（LOG_ERR/WRN/INF/DBG/ISR）
└── FreeRTOSConfig.h    FreeRTOS 配置
lib/
├── opus/               Opus 编解码库（定点模式，xiph/opus）
├── opus.cmake          Opus 源文件列表
└── opus_config.h       Opus 构建配置
companion/              Windows 伴生应用（Electron + React，见上文章节）
firmware/               本地编译产物（二进制与生成的 flash_prog_cfg.ini 已 git 忽略）
```

## 架构

```
┌──────────────┐          ┌──────────────┐          ┌──────────────┐
│  DualSense   │◄─ BT ──►│ LCTech BL616  │◄─ USB ──►│   Host PC    │
│  Controller  │  BR/EDR  │   DS5 Dongle │  HID     │  Steam/SDL   │
└──────────────┘  HID     └──────────────┘  Device   └──────────────┘
```

**数据流：**

- **输入（手柄 → 主机）**：BT L2CAP 接收 Report 0x31 → 剥离 HID header/seq/CRC → 63 字节 payload 作为 USB Report 0x01 发送
- **输出（主机 → 手柄）**：USB EP OUT 接收主机输出 → 原样透传（叠加配置 overlay 与玩家灯电量表）→ BT Report 0x31（78B 含 CRC32）→ L2CAP 发送
- **音频输出（主机 → 手柄）**：USB Audio ISO OUT（4ch 48kHz）→ 双缓冲 PCM 累积 → polyphase sinc 重采样 512→480 → Opus CBR 编码（160kbps，**默认单声道，插 3.5mm 耳机时自动重初始化为立体声**）→ 触觉降采样 → 0x39 双帧报告（547B）→ L2CAP 发送
  - 静音检测：主机只要开着音频端点就会持续送零，此时直接复用开机预编码好的静音帧，不做编码
- **音频输入（手柄 → 主机）**：BT 0x31 麦克风 Opus 帧 → 队列 → Opus 解码（48kHz 单声道）→ 单声道转立体声 → 环形缓冲 → USB Audio ISO IN（2ch 48kHz）
- **Feature（双向）**：GET_REPORT 从 BT 侧缓存返回（DSE profile 支持 NAK gating）| SET_REPORT 附加 CRC32 后经 L2CAP 控制通道转发

## 已知限制

| 项目 | 说明 |
|------|------|
| 单手柄在线 | 同一时刻只能连接一个手柄；最多记忆 8 个配对（单击切换） |
| 开发板 | 仅适配并验证 LCTech BL616 |
| 双向音频 CPU | 单核 320MHz 上 Opus 编解码已占报告周期的 **~89%**（编码 5.6ms×2 + 解码 3.6ms×2.13 / 21.33ms），双向 48kHz 音频已是这颗芯片的实际上限。要在音频路径上再加东西，得先压缩这个预算 |

## 致谢

- [sqlCRT/ds5dongle-bl618-opensource](https://github.com/sqlCRT/ds5dongle-bl618-opensource) —— 本固件开源版本的来源
- [SundayMoments/DS5_Bridge](https://github.com/SundayMoments/DS5_Bridge) —— Windows 伴生应用（`companion/` 目录、按键 glyph 图标、手柄素材与 UI 设计）的移植来源
- [awalol/DS5Dongle](https://github.com/awalol/DS5Dongle) —— 原始 Pico 2W 实现，核心协议参考
- [bouffalolab/bouffalo_sdk](https://github.com/bouffalolab/bouffalo_sdk) —— BL618 SDK + Zephyr BT 栈
- [CherryUSB](https://github.com/cherry-embedded/CherryUSB) —— USB 协议栈
- [xiph/opus](https://github.com/xiph/opus) —— Opus 音频编解码库（定点模式）
- Linux 内核 `hid-playstation.c` —— DualSense 协议偏移参考
- BL616 移植由 [deepseekV4 Flash](https://www.deepseek.com/) + OpenCode 协助开发

## 第三方声明

- 代码移植/改编自 [awalol/DS5Dongle](https://github.com/awalol/DS5Dongle)，其采用 MIT 许可证（Copyright (c) 2026 awalol）—— 完整文本见 [NOTICE](NOTICE)
- Windows 伴生应用移植/改编自 [SundayMoments/DS5_Bridge](https://github.com/SundayMoments/DS5_Bridge)，其采用 AGPL-3.0-only 许可证
- [lib/opus](lib/opus) 为 [xiph/opus](https://github.com/xiph/opus) 编解码库，BSD-3-Clause 许可（见 `lib/opus/LICENSE_PLEASE_READ.txt`）
- [CherryUSB](https://github.com/cherry-embedded/CherryUSB) 与 [bouffalolab/bouffalo_sdk](https://github.com/bouffalolab/bouffalo_sdk) 为外部构建依赖，Apache-2.0 许可
- Linux 内核 `hid-playstation.c`（GPL-2.0）仅作为协议/偏移参考，未包含内核代码

## 许可证

本项目采用 [GNU General Public License v3.0](LICENSE)（GPL-3.0）许可。任何在分发产品中使用或修改本代码的人，必须以相同许可证开放其源代码。
