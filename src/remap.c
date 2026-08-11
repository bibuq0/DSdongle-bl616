#include "remap.h"
#include "usb_gamepad.h"
#include "ds5_protocol.h"
#include "debug_log.h"
#include "easyflash.h"
#include <string.h>
#include <stdbool.h>

/* ------------------------------------------------------------------ */
/* Bit extraction helpers: indices into the 63-byte USB input payload  */
/* p[7]:  dpad[3:0]  ■[4] ✕[5] ○[6] △[7]                           */
/* p[8]:  L1[0] R1[1] L2[2] R2[3] Create[4] Options[5] L3[6] R3[7]  */
/* p[9]:  PS[0] TP_click[1] Mute[2]                                   */
/* ------------------------------------------------------------------ */

/* Maps button ID → (byte_offset, bit_mask) in the 63-byte payload.
 * D-pad entries share byte 7's low nibble and are handled specially. */
static const struct { uint8_t off; uint8_t mask; } BTN_LOC[REMAP_BTN_COUNT] = {
    [REMAP_BTN_SQUARE]   = { 7, 0x10 },
    [REMAP_BTN_CROSS]    = { 7, 0x20 },
    [REMAP_BTN_CIRCLE]   = { 7, 0x40 },
    [REMAP_BTN_TRIANGLE] = { 7, 0x80 },
    [REMAP_BTN_L1]       = { 8, 0x01 },
    [REMAP_BTN_R1]       = { 8, 0x02 },
    [REMAP_BTN_L2]       = { 8, 0x04 },
    [REMAP_BTN_R2]       = { 8, 0x08 },
    [REMAP_BTN_CREATE]   = { 8, 0x10 },
    [REMAP_BTN_OPTIONS]  = { 8, 0x20 },
    [REMAP_BTN_L3]       = { 8, 0x40 },
    [REMAP_BTN_R3]       = { 8, 0x80 },
    [REMAP_BTN_PS]       = { 9, 0x01 },
    [REMAP_BTN_TP_CLICK] = { 9, 0x02 },
    [REMAP_BTN_MUTE]     = { 9, 0x04 },
    /* D-pad directions live in byte 7 low nibble (0=N,2=E,4=S,6=W) */
    [REMAP_BTN_DPAD_UP]    = { 7, 0x0F },
    [REMAP_BTN_DPAD_LEFT]  = { 7, 0x0F },
    [REMAP_BTN_DPAD_DOWN]  = { 7, 0x0F },
    [REMAP_BTN_DPAD_RIGHT] = { 7, 0x0F },
};

static uint8_t dpad_dir_value(uint8_t id)
{
    switch (id) {
    case REMAP_BTN_DPAD_UP:    return DS5_DPAD_N;
    case REMAP_BTN_DPAD_LEFT:  return DS5_DPAD_W;
    case REMAP_BTN_DPAD_DOWN:  return DS5_DPAD_S;
    case REMAP_BTN_DPAD_RIGHT: return DS5_DPAD_E;
    default:                   return DS5_DPAD_NONE;
    }
}

/* ------------------------------------------------------------------ */
/* Module state                                                         */
/* ------------------------------------------------------------------ */

static remap_entry_t g_remap[REMAP_BTN_COUNT];
static bool g_remap_is_identity = true;
/* Last keyboard report sent to host — used for change detection and key-up */
static uint8_t last_kbd_report[8];

/* ------------------------------------------------------------------ */
/* Internal helpers                                                     */
/* ------------------------------------------------------------------ */

static bool validate_entry(const remap_entry_t *e)
{
    /* KBD type is reserved/disabled — treat as invalid to force identity */
    if (e->type == REMAP_TYPE_BTN)
        return e->value < REMAP_BTN_COUNT;
    return false;
}

static void sanitize_entry(remap_entry_t *e, uint8_t src_id)
{
    if (!validate_entry(e))
        *e = (remap_entry_t){ REMAP_TYPE_BTN, src_id, 0, 0 };
}

static void update_identity_cache(void)
{
    for (int i = 0; i < REMAP_BTN_COUNT; i++) {
        if (g_remap[i].type   != REMAP_TYPE_BTN ||
            g_remap[i].value  != (uint8_t)i     ||
            g_remap[i].modifier != 0             ||
            g_remap[i].flags  != 0) {
            g_remap_is_identity = false;
            return;
        }
    }
    g_remap_is_identity = true;
}

static inline uint8_t get_src_bit(const uint8_t *p, int id)
{
    return (p[BTN_LOC[id].off] & BTN_LOC[id].mask) ? 1u : 0u;
}

/* ------------------------------------------------------------------ */
/* Public API                                                           */
/* ------------------------------------------------------------------ */

void remap_init(void)
{
    remap_reset();
    memset(last_kbd_report, 0, sizeof(last_kbd_report));
}

void remap_reset(void)
{
    for (int i = 0; i < REMAP_BTN_COUNT; i++)
        g_remap[i] = (remap_entry_t){ REMAP_TYPE_BTN, (uint8_t)i, 0, 0 };
    g_remap_is_identity = true;
}

void remap_load(void)
{
    size_t len = 0;
    ef_get_env_blob("btn_remap", g_remap, sizeof(g_remap), &len);

    size_t n_loaded = len / sizeof(remap_entry_t);

    /* Sanitize what was loaded from flash (protect against bit-flip corruption) */
    for (size_t i = 0; i < n_loaded; i++)
        sanitize_entry(&g_remap[i], (uint8_t)i);

    /* Fill any entries not present (first boot / new firmware adding buttons) */
    for (size_t i = n_loaded; i < REMAP_BTN_COUNT; i++)
        g_remap[i] = (remap_entry_t){ REMAP_TYPE_BTN, (uint8_t)i, 0, 0 };

    update_identity_cache();
    LOG_INF("[REMAP] Loaded %u/%u entries, identity=%d\n",
            (unsigned)n_loaded, REMAP_BTN_COUNT, (int)g_remap_is_identity);
}

bool remap_save(void)
{
    int r = ef_set_env_blob("btn_remap", g_remap, sizeof(g_remap));
    return r == 0;
}

void remap_set(const uint8_t *data, uint8_t len)
{
    if (len < REMAP_BTN_COUNT * sizeof(remap_entry_t))
        return;

    memcpy(g_remap, data, REMAP_BTN_COUNT * sizeof(remap_entry_t));

    for (int i = 0; i < REMAP_BTN_COUNT; i++)
        sanitize_entry(&g_remap[i], (uint8_t)i);

    update_identity_cache();
    LOG_INF("[REMAP] Table updated, identity=%d\n", (int)g_remap_is_identity);
}

void remap_apply(uint8_t *p)
{
    if (g_remap_is_identity)
        return;

    /* Extract all source bits and analog values before modifying */
    uint8_t src[REMAP_BTN_COUNT];
    uint8_t dpad_nib = p[7] & 0x0F;
    for (int i = 0; i < REMAP_BTN_COUNT; i++) {
        if (i < REMAP_BTN_DPAD_UP)
            src[i] = get_src_bit(p, i);
        else
            src[i] = 0;
    }
    src[REMAP_BTN_DPAD_UP]    = (dpad_nib == DS5_DPAD_N);
    src[REMAP_BTN_DPAD_LEFT]  = (dpad_nib == DS5_DPAD_W);
    src[REMAP_BTN_DPAD_DOWN]  = (dpad_nib == DS5_DPAD_S);
    src[REMAP_BTN_DPAD_RIGHT] = (dpad_nib == DS5_DPAD_E);
    uint8_t analog_l2 = p[4];
    uint8_t analog_r2 = p[5];

    /* Build dst from scratch */
    uint8_t dst[REMAP_BTN_COUNT];
    memset(dst, 0, sizeof(dst));

    for (int i = 0; i < REMAP_BTN_COUNT; i++) {
        if (!src[i])
            continue;
        if (g_remap[i].type == REMAP_TYPE_BTN) {
            dst[g_remap[i].value] |= 1;
        } else { /* REMAP_TYPE_KBD */
            if (!(g_remap[i].flags & REMAP_FLAG_SUPPRESS))
                dst[i] |= 1;  /* suppress=0: preserve gamepad bit */
        }
    }

    /* L2/R2 symmetric analog swap */
    if (g_remap[REMAP_BTN_L2].type  == REMAP_TYPE_BTN &&
        g_remap[REMAP_BTN_L2].value == REMAP_BTN_R2   &&
        g_remap[REMAP_BTN_R2].type  == REMAP_TYPE_BTN &&
        g_remap[REMAP_BTN_R2].value == REMAP_BTN_L2) {
        p[4] = analog_r2;
        p[5] = analog_l2;
    }

    /* D-pad nibble: a remapped source that targets a direction wins;
     * otherwise clear the nibble when a D-pad direction was remapped away. */
    uint8_t new_nib = dpad_nib;
    bool dpad_target_set = false;
    for (int i = 0; i < REMAP_BTN_COUNT; i++) {
        if (!src[i] || g_remap[i].type != REMAP_TYPE_BTN)
            continue;
        uint8_t v = g_remap[i].value;
        if (v >= REMAP_BTN_DPAD_UP && v <= REMAP_BTN_DPAD_RIGHT) {
            new_nib = dpad_dir_value(v);
            dpad_target_set = true;
        }
    }
    if (!dpad_target_set) {
        bool dpad_remapped_away = false;
        for (int i = REMAP_BTN_DPAD_UP; i <= REMAP_BTN_DPAD_RIGHT; i++) {
            if (src[i] && g_remap[i].value != (uint8_t)i) {
                dpad_remapped_away = true;
                break;
            }
        }
        if (dpad_remapped_away)
            new_nib = DS5_DPAD_NONE;
    }

    /* Write back button bytes, preserving d-pad nibble in byte 7 */
    p[7] = (p[7] & 0xF0)
         | (dst[REMAP_BTN_SQUARE]   ? 0x10 : 0)
         | (dst[REMAP_BTN_CROSS]    ? 0x20 : 0)
         | (dst[REMAP_BTN_CIRCLE]   ? 0x40 : 0)
         | (dst[REMAP_BTN_TRIANGLE] ? 0x80 : 0);
    p[7] = (p[7] & 0xF0) | (new_nib & 0x0F);

    p[8] = (dst[REMAP_BTN_L1]      ? 0x01 : 0)
         | (dst[REMAP_BTN_R1]      ? 0x02 : 0)
         | (dst[REMAP_BTN_L2]      ? 0x04 : 0)
         | (dst[REMAP_BTN_R2]      ? 0x08 : 0)
         | (dst[REMAP_BTN_CREATE]  ? 0x10 : 0)
         | (dst[REMAP_BTN_OPTIONS] ? 0x20 : 0)
         | (dst[REMAP_BTN_L3]      ? 0x40 : 0)
         | (dst[REMAP_BTN_R3]      ? 0x80 : 0);

    p[9] = (p[9] & 0xF8)
         | (dst[REMAP_BTN_PS]       ? 0x01 : 0)
         | (dst[REMAP_BTN_TP_CLICK] ? 0x02 : 0)
         | (dst[REMAP_BTN_MUTE]     ? 0x04 : 0);
}

void remap_kbd_tick(const uint8_t *p)
{
    (void)p;
    /* Keyboard mapping disabled — no keyboard interface in use */
}

void remap_on_disconnect(void)
{
    /* If keys were held when controller disconnected, send key-up to PC */
    bool had_keys = (last_kbd_report[0] != 0);
    for (int k = 2; !had_keys && k < 8; k++)
        had_keys = (last_kbd_report[k] != 0);

    if (had_keys && usb_gamepad_kbd_ready()) {
        uint8_t zero[8] = { 0 };
        usb_gamepad_send_kbd_report(zero, 8);
    }
    memset(last_kbd_report, 0, sizeof(last_kbd_report));
}

bool remap_has_kbd_targets(void)
{
    /* Keyboard mapping disabled */
    return false;
}

const remap_entry_t *remap_get_table(void)
{
    return g_remap;
}
