# Changelog

All notable changes to DS5Dongle BL618 firmware are documented here.

---

## v3.19.3 - 2026-08-28

### Changed
- **移植 master(v3.18) 性能/调度优化**：任务优先级对齐（BT `MAX-2→MAX-3`、MIC `MAX-3→MAX-4`、LED→`tskIDLE+1`，让 USB 任务获得更多时间片）；Opus 编码**动态单声道**（默认 1ch，插入 3.5mm 耳机切 2ch，降低 CPU 负载）；重采样 512→480 改用 **8 抽头宏展开 + 边界分支**优化
- **移植零碎容错**：USB 音频 ISO 端点重 arm `usbd_ep_start_read` 失败日志、`usb_audio_stop` 日志
- **补移植 Opus E907 优化**：`lib/opus/celt/vq.c` 的 `exp_rotation1`（CELT 量化旋转热点）改用 E907 打包乘加（`pkbb16`/`kmda`），进一步降低编码 CPU 占用
- **Opus 编译链路优化**：对齐 master——Opus 编译为独立 `libopuscodec` 库（`-O3 -fbuiltin -fno-lto -fjump-tables`）、`audio.c` 单独 `-O3`、`CONFIG_BT_RX_PRIO=5`（BT 输入抢占音频编码）。实测**扬声器+麦克风同开回报率上升到 500Hz**。注意 **TCM 注入已被移除**（实测会把 Opus 全库搬进 ram 起始的 tcm 段导致上电取指异常/蓝灯常亮/BT 无法启动，且对运行速度无帮助——BL616 本就 SRAM 执行）
- 重新编译双版本固件并重新打包安装包

---

## v3.19.2 - 2026-08-27

### Changed
- **彻底移除低电量 LED 提示功能**：≤10% critical 快闪一并移除（≤20% 已在上版移除），接收器 LED 不再有任何电量告警；电量百分比/状态仍经 feature 0xF9 上报应用显示
- **伴生应用**：usage 说明页删除"快速闪：电量 ≤10%"，仅保留 LED 常规状态说明
- 重新编译双版本固件并重新打包安装包

---

## v3.19.1 - 2026-08-27

### Changed
- **移除 ≤20% 电量 LED 提醒**：接收器在电量 ≤20%（放电中）时不再切换 warning 闪烁，仅保留 ≤10% critical 快闪；删除 `battery_warn` 逻辑与 `LED_BLINK_BATTERY_WARN` 模式（`main.c` / `led_status.c` / `led_status.h` / `ds5_protocol.h`），README（中/英）同步更新
- **伴生应用**：使用说明页（usage）删除"中速闪：电量 ≤20%"（`usage.led.low` 中英文文案与渲染行），仅保留 ≤10% 快速闪说明
- 重新编译双版本固件并重新打包安装包

---

## v3.19 - 2026-08-26

### Changed
- **固件版本号升至 3.19 / 3.19H**（全速版/高速版），刷写后应用可见新版本
- 重新编译双版本固件并重新打包安装包（内置 v3.19 固件）

---

## v3.18.2 - 2026-08-26

### Changed
- **移植 Opus DSP 优化**（源自 sqlCRT/ds5dongle-bl618-opensource v3.18）：`lib/opus/celt/fixed_generic.h` 定点宏改用 E907 内联指令（`mulsr64` / `kwmmul` / `kwmmul.u` / `mulh`），`ecintrin.h` 加 E907 `ff1` CLZ、`mathops.c` 加 `divu` 倒数；`opus_config.h` 统一 `E907_OPUS_DSP` 开关并默认关闭 `E907_DISABLE_FF1`（实测 ff1 在 ISR/管道压力下会卡死编码）
- **移植编码 watchdog**：20ms 定时器监控 `opus_encode`，15ms 超时自动挂起 audio_task 并在 bt_task 主循环经 `audio_check_respawn()` 重生；`send_audio_report` 返回发送结果 + 失败节流日志与退避
- **移植 USB LPM/BOS 修复**：新增 BOS 描述符声明不支持 USB 2.0 LPM，并清除 `USB_LPM_EN` / `USB_LPM_ACCEPT` 位（防止 Linux 尝试 L1 挂起）
- FreeRTOS 定时器任务栈 `configMINIMAL_STACK_SIZE * 3`；audio_task 优先级 `MAX-1 → MAX-2`

---

## v3.18.1 - 2026-08-25

### Changed
- **移除固件死代码**：删除 v3.17 输出透传化后无调用点的 `state_mgr_update()` / `state_mgr_should_send()` / `state_mgr_clear_oneshot_flags()`（旧"按 Allow 标志累积合并"逻辑及其配套清理），同步移除 `state_mgr.h` 对应声明与注释；不影响运行时行为（当前输出路径为逐帧透传 + `apply_config_overlay`）
- **重新编译固件双版本**：`build_windows.bat both` 产出最新 `ds5dongle-lctech616.bin`（Full-Speed 兼容版）与 `ds5dongle-lctech616-hs.bin`（High-Speed 版）
- **重新打包伴生应用**：`npm run package:win` 重建 DS5 Dongle 应用，内置最新双版本固件（SHA256 与 `firmware/lctech616/` 产物逐字节一致）

---

## v3.18 - 2026-08-25

### Added
- **玩家指示灯改为电量显示**：PS 手柄触控板下方的 5 颗白色玩家 LED 改为电量指示，按电量分档点亮：
  - 0-25%：亮 bit2（CENTER，1 颗）
  - 26-50%：亮 bit1|bit3（INNER，2 颗）
  - 51-75%：亮 bit2|bit0|bit4（CENTER+OUTER，3 颗）
  - 76-100%：亮 bit0|bit1|bit3|bit4（INNER+OUTER，4 颗）
  - 在输出转发路径与 primer 中覆盖 byte 43，并置 flags1 bit4（AllowPlayerIndicators）
- **电量解析精确化**：充满（Complete）状态显示 100%，否则按电量档 pct×10（0-10 档精确映射）
- **固件同时输出全速版 + 高速版**：uild_windows.bat both 同时编译 ds5dongle-lctech616.bin（Full-Speed）与 ds5dongle-lctech616-hs.bin（High-Speed）；companion 安装包同时内置两版，刷写默认用全速版

### Fixed
- **拔插接收器后 Steam Input 右扳机失效**：改用 Pico 式 USB 门控——启动/蓝牙断开时软断开 USB，等手柄蓝牙连接成功后才枚举，让 Windows/Steam 每次重连都重新初始化手柄（重新发送右扳机效果）
- **恢复默认功能失效**：0x03 命令从"仅重启"改为"恢复默认配置 + 保存 + 重启"，彻底修复"点恢复默认没用"

### Changed
- USB 序列号默认关闭（对齐 Pico，重连后 Steam 视为新设备）
- 0x20 特征报告 fallback 版本提升（fw=0x0300、update=0x0225），避免 Steam 误判不支持新震动协议
## v3.17 — 2026-08-13

### Fixed
- **固件**：按键映射到其它键时双重触发（如 △→✕ 按下 △ 会同时触发两个键）——面键位改为完全重建，不再保留源键位
- **伴生应用**：快速连续修改配置不再丢失最后一次修改（合并写入的收尾窗口竞态）
- **伴生应用**：点击"保存到接收器"前确保所有在途修改已写入，不再漏存最后改动
- **伴生应用**：设备重连时旧写入任务不再干扰新连接的状态（写入归属隔离）
- **伴生应用**：配置读取失败自动重试，不再卡在"正在读取接收器配置…"页
- **伴生应用**：重新扫描可真正断开旧设备并重连
- **伴生应用**：恢复默认 / 断连时清除未决修改，防止旧修改覆盖默认值
- **伴生应用**：打包版窗口/任务栏图标正确显示（资源路径修复）

### Changed
- 重新打包安装包，内置上述全部修复 + 最新固件

---

## v3.16 — 2026-08-12

### Added
- **Windows 伴生应用（DS5 Dongle）**：Electron + React 配置工具，经 HID Feature Report（0xF6–0xF9 / 0xFB）读写配置
  - 配置页：音频 / 触觉 / 扳机 / 灯光 / 按键映射 / 系统
  - 可视化按键映射（原版手柄图 + glyph 图标）
  - 固件刷写（内置 BLFlashCommand + 默认固件，打包进安装包）
  - 手柄连接状态实时监测（断连自动检测）
  - 中英文切换 + 深色/浅色主题
- **D-pad 四方向按键映射**：remap 表 15 → 19 键（含 D-pad 上/左/下/右）
- **安装包**：`DS5-Dongle-Setup-<ver>.exe`（NSIS，内置刷写工具 + 固件）
- 固件 0xFB（按键映射）GET_REPORT 返回长度与描述符对齐修复

### Fixed
- 伴生应用：手柄关机后状态实时刷新（不再需要重启应用）
- 伴生应用：按键映射改动后界面立即同步
- 伴生应用：固件刷写卡在手柄断开时仍可用
- 伴生应用：启动脚本（`start-companion.bat`）修复括号块导致的静默失败

### Changed
- 启动方式：新增 `start-companion.bat` 一键启动

---

## v3.15 — 2026-08-06

### Added
- 新增自定义手柄连接后灯光颜色，可在配置页面选择

### Fixed
- 修复调整系统音量后手柄灯光熄灭的问题，修复绝区零角色 LED 灯光熄灭问题
- 修复第二次进入游戏后手柄 LED 灯光不亮的问题
- 修复 Steam 输入转换游戏中震动延迟和持续震动的问题
- 可能修复切换手柄时第二个手柄音频断断续续的问题
- 修复断开后重连时看门狗误触发导致立即断联
- 修复音频流关闭后 USB 端点状态残留，提升传输稳定性
- 修复电脑待机恢复后手柄可能无响应的问题

### Changed
- 降低空闲时功耗和发热
- 麦克风缓冲区扩容，减少爆音

---

## v3.14 — 2026-08-02

### Added
- 新增双版本固件：普通版（兼容性优先）和高轮询率版（最高 750Hz）

### Changed
- 默认固件切换为普通版（Full-Speed），USB 线材兼容性更好

### Improved
- 优化音频编码性能，降低 CPU 开销

---

## v3.13 — 2026-08-01

### Improved
- 优化重连成功率

---

## v3.12 — 2026-07-30

### Added
- 支持记忆多个手柄（最多 8 个），单击按钮快速切换
- 游戏中手柄断连重连后，自动恢复自适应扳机状态

### Improved
- 大幅优化蓝牙配对和重连效率，手柄从其他设备切换回来无需手动清除

### Changed
- 双击按钮改为搜索新手柄配对（原：软重启）
- USB 速度上限调整为 1000Hz

### Fixed
- 可能优化了扳机响应速度

---

## v3.11 — 2026-07-29

### Added
- 实时档位轮询率从 ~500Hz 提升至 ~750Hz

### Changed
- 连接成功后手柄灯光默认改为白色
- 默认开启 USB 隐身模式
- 默认开启 1 分钟后自动关闭指示灯

### Fixed
- 修复高负载下可能崩溃的问题
- 优化蓝牙重连响应速度，减少手柄低电量断开后重连失败的概率

---

## v3.10 — 2026-07-25

### Fixed
- 优化陀螺仪数据传输稳定性，减少瞄准时的抖动
- 更新 SDK 蓝牙控制器库至 v2.3.30-RC1

---

## v3.9 — 2026-07-24

### Added
- 按键映射（Button Remap）功能：支持将手柄任意按键重映射到其他手柄按键（暂不支持键盘映射）
- 新增 HID Feature Report 0xFB 用于 Web 配置工具读写映射表
- Web 配置界面新增控制器可视化面板，点击按键可设置映射；支持按实体手柄键直接捕获目标键
- Web 配置页面改为 Tab 布局（配置 / 按键映射 / 操作说明），新增配对操作说明

### Fixed
- 修复首次连接失败率高：缩短各超时（CONNECTING 15s→8s，DISCONNECTING 5s→1.5s，L2CAP CFG 4s→2s）
- OTA 版本字符串修复（原误显示为 event_v1.1.1）
- 音量映射修正：Windows dB 范围正确映射到 DualSense [0,127]，解决音量偏小问题
- 键盘接口仅在 PS 快捷键启用时包含，避免额外 USB 接口干扰游戏自适应板机和音频
- 修复 USB 唤醒：无键盘接口时正确设置 REMOTE-WAKEUP 标志位

---

## v3.8 — 2026-07-21

### Fixed
- 修复 Linux（Bazzite / PipeWire）下扬声器播放卡顿的问题
- 修复播放音乐时不操作手柄会自动断开连接的问题

---

## v3.7 — 2026-07-20

- Earlier LED primer + stealth mode purple on reconnect
- Stealth primer hold-forward logic and primer logs

## v3.6 and earlier

See git log for details.
