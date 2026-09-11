; DS5Dongle — prefer a non-C: drive for the default install directory.
; Injected via electron-builder `nsis.include`. The `preInit` macro runs
; inside .onInit before the directory page is shown, so overriding $INSTDIR
; here changes the default location users see.
;
; Logic: scan drives D..I, use the first one that exists as
;   <Drive>:\Programs\DS5 Dongle
; If none exists (C-only machine), keep electron-builder's default
; (per-user %LOCALAPPDATA%\Programs\DS5 Dongle on C:).

!macro preInit
  Push $R0
  Push $R1
  Push $R2

  StrCpy $R1 "DEFGHI"
  StrCpy $R0 0

next:
  StrCpy $R2 $R1 1 $R0
  StrCmp $R2 "" fallback
  IfFileExists "$R2:\*.*" found
  IntOp $R0 $R0 + 1
  Goto next

found:
  StrCpy $INSTDIR "$R2:\Programs\DS5 Dongle"
  Goto done

fallback:
  ; keep electron-builder default

done:
  Pop $R2
  Pop $R1
  Pop $R0
!macroend