#ifndef OPUS_CONFIG_H
#define OPUS_CONFIG_H

#define FIXED_POINT        1
#define DISABLE_FLOAT_API  1
#define OPUS_BUILD         1
#define VAR_ARRAYS         1

#define PACKAGE_VERSION    "1.5.2-bl616"

#define HAVE_LRINTF        1

/* E907 vendor DSP instructions (smmwb/kmmwb2/kwmmul/mulh/pkbb16/kmda/...).
 * Measured: disabling the whole set makes opus_encode 19% SLOWER, so keep it.
 * Every use site is `#if defined(E907_OPUS_DSP)` -- defining it as 0 would
 * still enable them, it has to be left undefined to turn them off.
 * ff1 (CLZ) stays disabled: it hangs opus_encode under ISR/pipeline pressure. */
#if defined(__riscv)
#define E907_OPUS_DSP      1
#define E907_DISABLE_FF1   1
#define OPUS_TCM_CODE      __attribute__((section(".tcm_code")))
#define OPUS_TCM_CONST     __attribute__((section(".tcm_const")))
#else
#define OPUS_TCM_CODE
#define OPUS_TCM_CONST
#endif

#include <stdlib.h>
#include <string.h>

#endif
