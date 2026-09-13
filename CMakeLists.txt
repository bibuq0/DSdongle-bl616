cmake_minimum_required(VERSION 3.15)

include(proj.conf)

# FORCE_FS=1 env var → remove CONFIG_USB_HS so SDK sets FORCE_FS bit
if(DEFINED ENV{FORCE_FS})
    unset(CONFIG_USB_HS)
endif()

find_package(bouffalo_sdk REQUIRED HINTS $ENV{BL_SDK_BASE})

# Incoming Bluetooth HCI/L2CAP reports must preempt audio encoding.
sdk_add_compile_definitions(-DCONFIG_BT_RX_PRIO=5)


sdk_set_main_file(src/main.c)

target_sources(app PRIVATE
    src/bt_hid_host.c
    src/ds5_protocol.c
    src/usb_gamepad.c
    src/ds5_usb_audio.c
    src/audio.c
    src/usb_wake.c
    src/led_status.c
    src/state_mgr.c
    src/config.c
    src/dse.c
    src/remap.c
)

sdk_add_include_directories(src)
sdk_add_include_directories(${BL_SDK_BASE}/components/wireless/bluetooth/blestack/src/include)
sdk_add_include_directories(${BL_SDK_BASE}/components/wireless/bluetooth/btprofile/include)
sdk_add_include_directories(${BL_SDK_BASE}/components/utils/partition)

# Opus codec (fixed-point, encoder and decoder)
include(lib/opus.cmake)
sdk_generate_library(opuscodec)
sdk_library_add_sources(${OPUS_SOURCES})
target_compile_definitions(libopuscodec PRIVATE HAVE_CONFIG_H)
target_compile_options(libopuscodec PRIVATE
    -include${CMAKE_CURRENT_LIST_DIR}/lib/opus_config.h
)
set_source_files_properties(${OPUS_SOURCES} PROPERTIES
    COMPILE_OPTIONS "-O3;-fbuiltin;-fno-lto;-fjump-tables"
)
set_source_files_properties(src/audio.c PROPERTIES
    COMPILE_OPTIONS "-O3"
)

set(OPUS_INCLUDE_DIRS
    ${CMAKE_CURRENT_LIST_DIR}/lib/opus/include
    ${CMAKE_CURRENT_LIST_DIR}/lib/opus/celt
    ${CMAKE_CURRENT_LIST_DIR}/lib/opus/silk
    ${CMAKE_CURRENT_LIST_DIR}/lib/opus/silk/fixed
    ${CMAKE_CURRENT_LIST_DIR}/lib/opus
)
target_include_directories(libopuscodec PRIVATE ${OPUS_INCLUDE_DIRS})
target_include_directories(app PRIVATE ${OPUS_INCLUDE_DIRS})

# Run Opus from SRAM instead of XIP flash.
#
# Keep the injection surgical. Moving the whole archive (~110 KB) does not fit:
# the linker reserves ~234 KB of heap but the BT stack allocates ~170 KB at
# init, so anything beyond ~50 KB leaves it unable to start (stuck blue LED).
# Measured rule: the large *outer* functions are worth ~15% each time they move;
# the innermost per-sample loops are worth nothing -- they are small and hot
# enough to sit in the L1 I-cache already.
get_property(OPUS_BASE_LINKER_SCRIPT GLOBAL PROPERTY LINKER_SCRIPT_IN)
if(NOT EXISTS "${OPUS_BASE_LINKER_SCRIPT}")
    message(FATAL_ERROR "Cannot locate the board linker template: ${OPUS_BASE_LINKER_SCRIPT}")
endif()
file(READ "${OPUS_BASE_LINKER_SCRIPT}" OPUS_LINKER_CONTENT)
set(OPUS_TCM_RODATA_ANCHOR "        *(.tcm_const*)")
string(FIND "${OPUS_LINKER_CONTENT}" "${OPUS_TCM_RODATA_ANCHOR}" OPUS_TCM_RODATA_POS)
if(OPUS_TCM_RODATA_POS EQUAL -1)
    message(FATAL_ERROR "Cannot locate tcm_const in ${OPUS_BASE_LINKER_SCRIPT}")
endif()
string(REPLACE
    "${OPUS_TCM_RODATA_ANCHOR}"
    "${OPUS_TCM_RODATA_ANCHOR}\n\n        /* Keep the hot Opus constant tables off XIP flash. */\n        *libopuscodec.a:*.o*(.rodata*)\n        *libopuscodec.a:*.o*(.srodata*)"
    OPUS_LINKER_CONTENT
    "${OPUS_LINKER_CONTENT}"
)

# Outer code, both directions. pitch/vq/quant_bands/celt_lpc are deliberately
# left in flash (measured: moving them buys 0%).
set(OPUS_TCM_TEXT_ANCHOR "        *(.tcm_code*)")
string(FIND "${OPUS_LINKER_CONTENT}" "${OPUS_TCM_TEXT_ANCHOR}" OPUS_TCM_TEXT_POS)
if(OPUS_TCM_TEXT_POS EQUAL -1)
    message(FATAL_ERROR "Cannot locate tcm_code in ${OPUS_BASE_LINKER_SCRIPT}")
endif()
string(REPLACE
    "${OPUS_TCM_TEXT_ANCHOR}"
    "${OPUS_TCM_TEXT_ANCHOR}\n\n        /* Opus outer call stacks -- see the note above. */\n        *libopuscodec.a:celt_encoder.c.obj*(.text*)\n        *libopuscodec.a:opus_encoder.c.obj*(.text*)\n        *libopuscodec.a:celt_decoder.c.obj*(.text*)\n        *libopuscodec.a:opus_decoder.c.obj*(.text*)\n        *libopuscodec.a:entdec.c.obj*(.text*)\n        *libopuscodec.a:bands.c.obj*(.text*)\n        *libopuscodec.a:rate.c.obj*(.text*)\n        *libopuscodec.a:entenc.c.obj*(.text*)\n        *libopuscodec.a:mathops.c.obj*(.text*)\n        *libopuscodec.a:cwrs.c.obj*(.text*)"
    OPUS_LINKER_CONTENT
    "${OPUS_LINKER_CONTENT}"
)
set(OPUS_RAM_LINKER_SCRIPT "${CMAKE_CURRENT_BINARY_DIR}/generated/opus_rodata_ram.ld.in")
file(MAKE_DIRECTORY "${CMAKE_CURRENT_BINARY_DIR}/generated")
file(WRITE "${OPUS_RAM_LINKER_SCRIPT}" "${OPUS_LINKER_CONTENT}")
sdk_set_linker_script_macro("${OPUS_RAM_LINKER_SCRIPT}")

# Board selection via env vars (mutually exclusive)
if(DEFINED ENV{BOARD_LCTECH_616})
    target_compile_definitions(app PRIVATE BOARD_LCTECH_616=1)
    message(STATUS "Target board: LCTech BL616")
elseif(DEFINED ENV{BOARD_M0S_DOCK})
    target_compile_definitions(app PRIVATE BOARD_M0S_DOCK=1)
    message(STATUS "Target board: Sipeed M0S Dock (BL616)")
else()
    message(STATUS "Target board: Ai-M61-32S-Kit (BL618)")
endif()

target_compile_definitions(app PRIVATE HAVE_CONFIG_H)
if(DEFINED ENV{FORCE_FS})
    target_compile_definitions(app PRIVATE FORCE_FS_MODE=1)
    message(STATUS "USB mode: Full-Speed (compatibility variant)")
else()
    message(STATUS "USB mode: High-Speed (default)")
endif()
target_compile_options(app PRIVATE
    $<$<COMPILE_LANGUAGE:C>:-include${CMAKE_CURRENT_LIST_DIR}/lib/opus_config.h>
)

project(ds5dongle_bl618)
