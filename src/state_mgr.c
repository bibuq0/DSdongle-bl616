#include "state_mgr.h"
#include "config.h"
#include <stdbool.h>
#include <string.h>
#include "debug_log.h"

/*
 * SetStateData byte layout (47 bytes):
 *
 *  [0]  flags0:  EnableRumbleEmulation(0), UseRumbleNotHaptics(1),
 *                AllowRightTriggerFFB(2), AllowLeftTriggerFFB(3),
 *                AllowHeadphoneVolume(4), AllowSpeakerVolume(5),
 *                AllowMicVolume(6), AllowAudioControl(7)
 *  [1]  flags1:  AllowMuteLight(0), AllowAudioMute(1), AllowLedColor(2),
 *                ResetLights(3), AllowPlayerIndicators(4),
 *                AllowHapticLowPassFilter(5), AllowMotorPowerLevel(6),
 *                AllowAudioControl2(7)
 *  [2]  RumbleRight
 *  [3]  RumbleLeft
 *  [4]  VolumeHeadphones
 *  [5]  VolumeSpeaker
 *  [6]  VolumeMic
 *  [7]  AudioControl
 *  [8]  MuteLightMode
 *  [9]  MuteControl
 *  [10..20]  RightTriggerFFB  (11 bytes)
 *  [21..31]  LeftTriggerFFB   (11 bytes)
 *  [32..35]  HostTimestamp    (4 bytes)
 *  [36] MotorPowerLevel
 *  [37] AudioControl2
 *  [38] Flags: AllowLightBrightnessChange(0), AllowColorLightFadeAnimation(1),
 *              EnableImprovedRumbleEmulation(2), UseRumbleNotHaptics2(3)
 *  [39] HapticLowPassFilter + UNKBIT
 *  [40] UNK
 *  [41] LightFadeAnimation
 *  [42] LightBrightness
 *  [43] PlayerIndicators
 *  [44] LedRed
 *  [45] LedGreen
 *  [46] LedBlue
 */

static uint8_t state[SET_STATE_SIZE];
static volatile bool spk_active;
static volatile bool vol_dirty;

void state_mgr_init(const uint8_t *init_data, uint8_t len)
{
    memset(state, 0, SET_STATE_SIZE);
    if (len > SET_STATE_SIZE)
        len = SET_STATE_SIZE;
    memcpy(state, init_data, len);
    spk_active = false;
    vol_dirty = false;
}

void state_mgr_get(uint8_t *out, uint8_t size)
{
    if (size > SET_STATE_SIZE)
        size = SET_STATE_SIZE;
    memcpy(out, state, size);
}

void state_mgr_clear_flags(void)
{
    state[0] = 0;
    state[1] = 0;
    state[38] &= ~0x03; /* clear light sub-flags (bits 0-1) to prevent
                         * FadeOut animation re-triggering on non-LED reports;
                         * bit 2 (EnableImprovedRumbleEmulation) preserved */
}

void state_mgr_apply_config(uint8_t spk_vol, uint8_t hp_vol, uint8_t spk_gain,
                            uint8_t trigger_reduce)
{
    state[4] = hp_vol;          /* VolumeHeadphones */
    state[5] = spk_vol;         /* VolumeSpeaker */
    state[37] = spk_gain & 0x07; /* AudioControl2: SpeakerCompPreGain */
    if (trigger_reduce > 0) {
        /* state[36] high nibble = TriggerMotorPowerReduction [0..10] */
        state[36] = (state[36] & 0x0F) | ((trigger_reduce & 0x0F) << 4);
    }
}

void state_mgr_set_spk_active(bool active)
{
    spk_active = active;
}

bool state_mgr_is_spk_active(void)
{
    return spk_active;
}

void state_mgr_set_volume(uint8_t spk_vol, uint8_t hp_vol)
{
    if (config_get()->lock_volume)
        return;
    state[0] |= 0x30;
    state[4] = hp_vol;
    state[5] = spk_vol;
    /* Session-level only: UAC/host volume never writes back into config.
     * config_body volumes are owned exclusively by SET 0xF6 (companion), so
     * an unrelated config_save() can never persist a runtime volume, and
     * after reboot volume falls back to the companion-configured value. */
    vol_dirty = true;
}

void state_mgr_set_mute(bool mute)
{
    if (config_get()->lock_volume)
        return;
    state[1] |= 0x02;
    if (mute)
        state[9] |= 0x60;
    else
        state[9] &= ~0x60;
    vol_dirty = true;
}

void state_mgr_restore_config_volume(void)
{
    struct config_body *cfg = config_get();
    state[0] |= 0x30;
    state[1] |= 0x02;
    state[4] = cfg->headset_volume;
    state[5] = cfg->speaker_volume;
    state[9] &= ~0x60;
    vol_dirty = true;
}

bool state_mgr_vol_dirty(void) { return vol_dirty; }
void state_mgr_vol_ack(void)   { vol_dirty = false; }

void state_mgr_set_led_color(uint8_t r, uint8_t g, uint8_t b)
{
    state[44] = r;
    state[45] = g;
    state[46] = b;
}
