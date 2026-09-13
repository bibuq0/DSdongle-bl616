# Changelog

All notable changes to DS5Dongle BL618 firmware are documented here.

---

## v3.19.23 - 2026-09-13

### Changed
- **扬声器编码带宽改为随麦克风状态动态切换**。此前（v3.19.20 起）无条件限到 WIDEBAND，代价是扬声器音质永久损失一截；但限制带宽的**唯一目的**是给麦克风解码器腾 CPU，没在录音时这个代价白付。
  - 判断依据是 `mic_enabled`（主机打开了麦克风流 **且** 应用允许透传），不是单独的 `disable_mic` 配置位——只有它真正对应"解码器在消耗 CPU"。用配置位会漏掉危险场景：应用里关掉透传但主机仍开着流时配置位变 0，带宽回到 FULLBAND 而解码器还在跑，麦克风卡顿会复发。
  - 麦克风起停时只发一条 `OPUS_SET_MAX_BANDWIDTH` CTL，**不重建编码器、不 `OPUS_RESET_STATE`**，所以切换无声。安全性依据：该 CTL 只写 `st->max_bandwidth`，`opus_encode_native()` 每帧读它（`opus_encoder.c:1629`），下一帧生效；且 `st->bandwidth` 在 CELT-only 下每帧由自动带宽选择重算并只被 `max_bandwidth` 夹一次，抬回 FULLBAND 不会被粘住。
  - 实测等效码率约 116 kbps（160 kbps CBR 单声道、complexity 0 折算），远高于 FULLBAND 门限 `mono_music_bandwidth_thresholds[6]` = 12000，所以不设上限时编码器确实会选 FULLBAND，开关有效。
- **伴生应用**：「扬声器透传」移到「麦克风透传」上方；麦克风透传下方新增提示"开启此功能后。扬声器音质有一定程度损失"（中英文均已补）。
- 固件版本号升至 **3.19.23 / 3.19.23H**（全速版/高速版）
- 重新编译双版本固件并重新打包安装包

---

## v3.19.22 - 2026-09-13

### Changed
- **移除诊断计数器**，代码回归简洁。删掉 v3.19.18 加入的麦克风链路计数（`rx`/`qdrop`/`rdrop`/`under`）、扬声器峰值统计，以及 `main.c` 里关于麦克风优先级的结论注释；`[STAT]` 行恢复为 `enc … | dec …` 两项，`ds5_usb_audio.c/h` 的 `usb_audio_mic_full_drops()` / `usb_audio_mic_underruns()` / `usb_audio_mic_stats_reset()` 一并删除。
  - 诊断目的已达成（结论：麦克风丢帧是 CPU 不足，已由 v3.19.20 的带宽限制修复），无需常驻。
  - 顺带把 `[STAT]` 行的串口输出从 108 字符缩回 66 字符。控制台串口是 115200 baud 且 `bflb_uart_putchar()` 为自旋忙等，原来这行每 2 秒要阻塞 `audio_task` 约 6.6 ms（并压低麦克风任务），现在约 3 ms。
- **保留**静音跳过阈值 `SILENCE_PEAK_MAX = 64`（v3.19.18 引入）与 `pcm_peak()`——这是功能修复而非诊断：Windows 在端点空闲时会送抖动底噪，阈值 4 会让静音跳过几乎不触发。
- 固件版本号升至 **3.19.22 / 3.19.22H**（全速版/高速版）
- 重新编译双版本固件并重新打包安装包

---

## v3.19.20 - 2026-09-13

### Fixed
- **扬声器 + 麦克风同时开启时麦克风卡顿（定稿修复）**：把编码带宽限制到 **WIDEBAND（8 kHz / 17 频带）**，`OPUS_SET_MAX_BANDWIDTH(OPUS_BANDWIDTH_WIDEBAND)`。
  - 症状：只开麦克风时录音正常；一旦同时开扬声器并在电脑上播音乐，麦克风录音明显劣化。v3.19.18 的计数器给出了根因——`rx≈200`（手柄发来的帧一个不少，BT 链路干净），但 `dec` 掉到 152–176、`qdrop` 20–48、`under` 247–478，说明是 **CPU 被编码器占满、解码器排队丢帧**，不是链路或缓冲问题。
  - 挡位（`opus_encoder.c:2267` 的 endband 映射）：`FULLBAND` 21 带/20 kHz、`SUPERWIDEBAND` 19 带/12 kHz（−10%）、`WIDEBAND` 17 带/8 kHz（−19%）、`NARROWBAND` 13 带/4 kHz（−38%）；`MEDIUMBAND` 在 CELT 模式下被提升为 `WIDEBAND`，等于无效。
  - CPU 收益**不等于**频带数比例：MDCT 是全带宽固定开销、不受带宽设置影响，只有 `quant_all_bands`/`denormalise_bands`/频带能量按频带数缩放。
  - v3.19.21 试过 `SUPERWIDEBAND`（只省一半）后回退；用户反馈 wideband 下扬声器变化不大。
- 固件版本号升至 **3.19.20 / 3.19.20H**（全速版/高速版）

---

## v3.19.19 (实验，已回退) - 2026-09-13

### Notes
- 提高麦克风任务优先级（`MIC_TASK_PRIORITY` `MAX-4` → `MAX-3`，与 BT 同级）**实测无效**：`qdrop` 20–48 → 30–59、`under` 247–478 → 337–586，反而略差。这证明是**硬性 CPU 不足**而非优先级分配问题。已回退，代码中留有"勿再尝试"注释。
- 更早试过提到 `MAX-2`，会让双向同时卡顿（BT 被饿死 → `send_output pool empty`）。

---

## v3.19.18 - 2026-09-13

### Added
- **麦克风链路计数器 + 扬声器峰值**，用于区分"丢在链路上"还是"丢在 CPU 上"。`[STAT]` 行扩为：
  `enc avg/max/x skip peak | dec avg/max/x | mic rx/qdrop/rdrop/under`
  - `rx`：手柄发来的麦克风 Opus 帧数（BT 收到的）
  - `qdrop`：解码队列满而丢的帧（`audio_mic_feed()`）
  - `rdrop`：USB 麦克风环形缓冲写满而丢的样本（`usb_audio_mic_write()`）
  - `under`：麦克风 ISO IN 包因环形缓冲数据不足而补零的次数（`mic_send_next()`）
  - `peak`：本周期内扬声器 PCM 的采样峰值，用于校准静音跳过阈值
- `ds5_usb_audio.c/h` 新增 `usb_audio_mic_full_drops()` / `usb_audio_mic_underruns()` / `usb_audio_mic_stats_reset()`。

### Changed
- 静音跳过阈值由"峰值 ≤ 4 LSB（严格静音）"改为 **`SILENCE_PEAK_MAX 64`（≈ −54 dBFS）**：Windows 在端点打开但空闲时会留下抖动/底噪，原阈值太严导致跳过几乎不触发。`pcm_is_silent()` 相应改为 `pcm_peak()`（返回峰值，供 `[STAT]` 观测后调参）。

---

## v3.19.17 - 2026-09-13

### Changed
- **清理临时诊断代码**：移除此前为定位问题加入的一次性探针——主频自检 `[B] CLK:`、CPU 吞吐基准 `[B] BENCH:`、`CMakeLists.txt` 的 `-DCONFIG_MM_ENABLE_MIN_FREE_TRACKING=1`（结论已记入文档，不再需要常驻）。提交 `49f5e50`。

---

## v3.19.16 - 2026-09-12

### Changed
- **解码器与其余外层代码搬进 RAM**：按已验证规律（大而冷的外层调用栈搬进 RAM 有效，小而热的内层循环无效——后者本来就在 L1 I-cache 里），把此前没搬的解码器外层与共享对象共 9 个注入 `tcm_code`：`celt_decoder.c`(11.8K)、`opus_decoder.c`(4.5K)、`entdec.c`(1.9K)、`bands.c`(14.4K)、`rate.c`(3.1K)、`entenc.c`(2.4K)、`mathops.c`(2.0K)、`cwrs.c`(1.2K)。`pitch/vq/quant_bands/celt_lpc` **故意不搬**（上一轮实测 0%）。
  - 结果：`opus_decode` **4.25 → 3.6 ms（−15%）**；空闲堆 91.5 → 54.4 KB。

### 音频性能优化总账（v3.19.7 → v3.19.16）
| | 起点 | 现在 |
|---|---|---|
| `opus_encode` | 8.2 ms | **5.6 ms（−32%）** |
| `opus_decode` | 4.85 ms | **3.6 ms（−26%）** |
| 单周期预算（编码×2 + 解码×2.13） | 114%（超载） | **88.6%** |

贡献：编码器外层搬 RAM −15%、**编码器单声道创建（消除每帧多余 MDCT）−21%**、解码器外层搬 RAM −15%、静音跳过编码（静音时不占 CPU）。

### Notes
- 同时纠正两条排查方向：**E907 厂商 DSP 指令必须保持开启**（关掉慢 19%）；**降低采样率无效**——该裁剪版 Opus 的编码器与解码器都硬编码 `opus_custom_mode_create(48000, 960, NULL)`，请求的采样率只设置 `upsample`/`downsample`，MDCT 尺寸不变，反而多出清零开销。

---

## v3.19.15 - 2026-09-12

### Fixed
- **扬声器音质劣化**（v3.19.14 引入）：编码器改为单声道创建后，`opus_encode()` 按 `frame_size * st->channels` 读取输入，于是把交织的 `spk_resamp`（L,R,L,R…）当成 **480 个连续采样**读走——相当于隔点抽样，音高与音色全变。现在在编码前自行降混成真正的单声道缓冲再送入。Opus 原本的立体声→单声道路径本就是在 MDCT 域做 `(L+R)/2`，因此这里做等价，且**不影响**省下的那次 MDCT。

### Notes
- 上一版实测 `enc` 由 **7.0 ms 降到 5.4 ms（−21%）**，新预算 `5.4×2 + 4.25×2.13 = 19.85 / 21.33 = 93%`，首次装进单周期预算。
- 启动基准 `[B] BENCH: 10M LCG iters = 156253us (~319 MHz)`，与标称 320 MHz 吻合，确认 CPU 吞吐正常。

---

## v3.19.14 (实验) - 2026-09-12

### Fixed
- **编码器按单声道创建，消除每帧一次多余的 MDCT**。此前 `opus_encoder_init(…, 2, …)` 建的是双声道编码器，运行时靠 `OPUS_SET_FORCE_CHANNELS(1)` 转单声道。但 `celt_encoder.c:1754` 是 `const int CC = st->channels`，而 `compute_mdcts()` 的循环是：
  ```c
  c=0; do { for (b=0;b<B;b++) clt_mdct_forward(...); } while (++c<CC);
  if (CC==2 && C==1) { ...降混... }
  ```
  —— **对两个通道各做一次完整 MDCT，做完才丢掉一半**。MDCT 是 CELT 编码两大开销之一。
  - 现在改为 `opus_encoder_init(…, 1, …)`（`CC==1`，只做一次）。新增 `encoder_setup(channels)` 统一负责初始化 + 全部 CTL + 预编码静音帧；插拔 3.5mm 耳机时**整体重新初始化**（而不是只改 `FORCE_CHANNELS`），因为 `FORCE_CHANNELS` 不能超过创建时的通道数。这与作者 v3.20a 的 `[AUDIO] Encoder reinit %dch` 是同一思路。
  - 启动日志新增 `[AUDIO] Encoder reinit 1ch (...)`。

---

## v3.19.13 - 2026-09-12

### Added
- **静音跳过编码**：Windows 只要开着音频端点就会持续送零，固件因此**无条件**编码——实测占 21.33 ms 周期的 **66%**，正是麦克风被饿死的原因（扬声器流一打开 `enc` 就变成 x188 并再也不停）。现在检测重采样后的 PCM 是否全静音（峰值 ≤ 4 LSB），是则直接复用初始化时预编码好的静音帧，并在静音结束后的第一帧重置编码器历史。`[STAT]` 行新增 `skip` 计数。
- 启动新增两条自检日志：`[B] CLK:`（实际主频与 hclk/bclk 分频）与 `[B] BENCH:`（1000 万次 LCG 迭代实测耗时，用于确认 CPU 真实吞吐）。

### Changed
- **恢复 E907 厂商 DSP 指令**（`lib/opus_config.h` 的 `E907_OPUS_DSP`）。上一版关闭后实测**慢 19%**（7.0 → 8.3 ms），厂商指令是有帮助的。
- 回退第二轮 RAM 注入（`vq/quant_bands/pitch/celt_lpc`，19.4 KB）：实测**收益 0%**，空闲堆从 90.7 KB 白降到 72.8 KB。

### Notes
- 至此"让 Opus 更快"的三条路线全部排除：主频已是 320 MHz（运行时确认）、XIP 非瓶颈（搬 60 KB 进 RAM 仅 15% 后为 0%）、`-O3` 已生效。**`opus_encode` ≈ 7.0 ms / `opus_decode` ≈ 4.85 ms 是该芯片的真实成本**，编码+解码共需 114% 的单周期预算。

---

## v3.19.10 (实验) - 2026-09-12

### Changed
- **Opus 静态缓冲按实测值收缩**：启动日志显示 `enc=12288/36864 dec=9592/24576`——`encoder_mem` 多分了 24 KB、`decoder_mem` 多分了 15 KB。现改为 `13312` / `10240`（各留约 8% 余量），**腾出 37.9 KB 堆**。`audio_init()` 的越界检查会拦住配置错误。
- **Opus 编码器热代码从 XIP Flash 搬进 RAM**：链接脚本注入把 `celt_encoder.c.obj`(24.3 KB) 与 `opus_encoder.c.obj`(16.9 KB) 的 `.text` 放进 `tcm_code`。之前实测单次 `opus_encode`(480 样本) 要 **8.2 ms / 峰值 10.8 ms**，2 帧占满 21.33 ms 周期的 **77%**，麦克风解码被饿死（`dec avg 45–77 ms`、每 2 秒只解 24–54 帧）。该耗时比同负载的合理值慢 50–80 倍，指向 XIP 取指而非算法。
  - 结果：RAM 驻留代码 20.6 → 61.6 KB；链接期堆区仅减少 2.8 KB，**剩余空闲堆约 93 KB**（此前已知可用水平 97.6 KB）。
  - 回退方式：注释 `CMakeLists.txt` 的编码器注入块 + 还原 `src/audio.c` 的两个宏。

### Notes
- 本版与 v3.19.9 的唯一差别就是上面两项，用于 A/B 判断"XIP 取指是否是 Opus 的瓶颈"。

---

## v3.19.9 (实验) - 2026-09-12

### Added
- **Opus 常量表移出 XIP Flash**：`CMakeLists.txt` 用链接脚本注入把 `libopuscodec.a` 的 `.rodata`/`.srodata` 放进 `tcm_const`（SRAM）。**只搬常量表、不搬代码**——净增 RAM 约 5.8 KB（常量表总量 16.5 KB，其中约 10.7 KB 由 `OPUS_TCM_CONST` 原本已在 RAM），代码仍留在 Flash。堆 240 → 约 234 KB。
  - 动机：这些表（mode/分配表、logN、cache caps、PVQ 与熵编码常量）在最内层 CELT 循环里被反复读取，缓存未命中的代价远超其体积。热**代码**路径（`quant_all_bands`/`opus_fft_impl`/`clt_mdct_*`）此前已由 `OPUS_TCM_CODE` 固定在 RAM。
  - 验证：`build/verify_inject.py` 显示 `libopuscodec` 的 `.rodata` 在 Flash 中为 **0 B**、RAM 中 16,561 B。
- **音频诊断统计**（`src/audio.c` 的 `AUDIO_STATS` 开关，置 0 可整体编译掉）：`opus_encode`/`opus_decode` 单次耗时（avg/max/次数）、空闲堆与**历史最低空闲堆**、编码看门狗触发次数，每 2 秒打印一行 `[STAT]`。
- `CMakeLists.txt` 开启 `-DCONFIG_MM_ENABLE_MIN_FREE_TRACKING=1`（`mm.h` 的 `kmin_free_size()`；默认关闭会导致符号未定义）。代价是每次 kmalloc/kfree 多一次 O(1) 空闲量读取。

### Notes
- **本版是实验固件**，用于判定"Opus 卡在 XIP Flash 取指"这一假设是否成立。

---

## v3.19.8 - 2026-09-12

### Fixed
- **休眠唤醒后音频卡顿**：`USBD_EVENT_RESUME` 分支此前**不做任何音频处理**，而 `USBD_EVENT_SUSPEND` 只 stop 不重置编解码器。USB 总线挂起并不会取消 alternate setting，主机是"挂着流"睡过去的；唤醒后 `audio_ep_out_handler()` 看到 `stream_active == false` 就**不再重新 arm 端点**，唤醒后第一个 ISO 包被丢弃、OUT 端点从此停止收数据，直到主机碰巧重开流——听感就是唤醒后一直卡顿。Modern Standby 走的是 SUSPEND→RESUME 这条路（不是 RESET），所以 `RESET` 里原有的重置救不了它。新增 `usb_audio_suspend()/usb_audio_resume()/usb_audio_host_reset()`：挂起时记住哪些流是打开的，唤醒时恢复标志并重新 arm 扬声器/麦克风 ISO 端点，同时重置 Opus 编解码器与 PCM/麦克风环形缓冲（休眠前的编码器历史已失效）。
- 固件版本号升至 **3.19.8 / 3.19.8H**（全速版/高速版）
- 重新编译双版本固件并重新打包安装包

### Notes
- 本条对应作者 v3.20a 发布说明里的"修复电脑休眠唤醒后手柄音频卡顿"。作者该版本源码未公开（其公开仓库停在 v3.18），实现方式不同，此处是按症状自行定位修复。

---

## v0.2.5 - 2026-09-10

### Changed
- **伴生应用版本号升至 0.2.5**（应用独立版本号，内置 v3.19.7 固件），重新打包安装包 `DS5-Dongle-Setup-0.2.5.exe`

---

## v3.19.7 (FS audio fix) - 2026-09-12

### Fixed
- **全速版固件音频端点周期错误**：扬声器/麦克风 ISO 端点的 `bInterval` 硬编码为 `0x04`（按高速语义 `2^(n-1)` 微帧编写）。全速模式下该值表示 **4ms** 而非 1ms，端点服务周期变成 4 倍、音频数据率不足，在 Linux 下表现为音频卡顿。现按 `FORCE_FS_MODE` 区分：全速用 `0x01`(1ms)，高速保持 `0x04`(1ms)。已用二进制验证两版描述符（全速 `...88 01 01` / 高速 `...88 01 04`），**高速版固件逐字节不变**。

---

## v3.19.7 (UI refresh) - 2026-09-10

### Changed
- **伴生应用 UI 全面改版**：12/8px 大圆角、蓝黑渐变背景、玻璃质感卡片、柔和浮起阴影、accent 发光与 focus 光环
- 设置项由下拉框改为 **iOS 风格滑动开关**；按钮按压手感、滑条与健康徽章呼吸动效、页面切换入场动画
- Overview 指标卡增加状态图标；Flash 刷写页内联样式统一为样式类

---

## v3.19.7 - 2026-09-09

### Changed
- **固件版本号升至 3.19.7 / 3.19.7H**（全速版/高速版），刷写后应用可见新版本
- 重新编译双版本固件并重新打包安装包（内置 v3.19.7 固件）

---

## v3.19.4 - 2026-08-29

### Fixed
- **死亡搁浅 2 扳机持续震动**（"同时松开左右扳机后扳机震动不关闭"）：输出转发从逐帧透传改为**合并快照**（按 Allow 标志合入 47B 快照，每帧发送），关闭帧必然随快照送达；同时新增**震动即时通道**（详见下条）
- **碧蓝幻想触发一次震动后手柄持续震**：合并快照的 `|=` 累积会永久钉住震动选择位；改为**马达字节 + 选择位（flags0 0x03 / flags2）任一变化即原样直发**（对齐 DS5_Bridge 即时通道），停止帧必然送达
- **重连灯条/玩家灯不一致**：
  - primer 恢复纯净 LED 初始化帧（`[1]=0x04 ONLY`），不再被玩家灯电量字段覆盖——修复"重连后灯条偶发显示默认白/不生效"
  - 蓝牙断开期间清空合并快照，防止上一会话残留的灯条色/动画随重连首帧整包发出
  - 玩家灯电量指示在每次重连后**强制重发**（连接沿检测改在 usb_task 主循环轮询，原在输入报告块内——断开期间无输入导致沿丢失，只有固件启动后首次连接能显示）
- **跨任务竞态**：`send_led_primer` 会被蓝牙协议栈回调（`l2cap_intr_connected`/`on_hid_state`）直接调用，与 bt_task 转发循环无锁竞争写共享状态；重置动作移入 bt_task 非连接分支
- **删除无效去重**：`output_flush_merged` 的 `memcmp` 去重实为死代码（比较基准存的是加工后帧，与原始快照必然不同），删除后恢复每帧转发语义，功能不变
- 玩家灯电量档**独立补发帧**（电量档位变化时补发仅玩家灯的 0x31 帧，不与颜色合并帧共用）——修复 primer 在重连瞬间用 `cached=0xFF` 发 4 颗导致"4 格锁死"

### Changed
- 系统页提示文案括号样式：先去掉分隔符 `·` 改半角括号，再改**全角括号且仅括号符号加粗**（括号内文字不加粗）
- 输出转发架构（对齐 DS5_Bridge 思路）：合并快照保底 + 反馈（震动/扳机）变化即时直发，双通道并存
- 重新编译双版本固件并重新打包安装包

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
