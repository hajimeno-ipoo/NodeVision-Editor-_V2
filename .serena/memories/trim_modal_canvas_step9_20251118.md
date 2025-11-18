## 2025-11-18 Trim modal aspect lock
- Added helpers in renderer trim controls to compute normalized aspect ratios from the selected option + source preview aspect.
- During resize/aspect-select/reset we now snap the crop region to the requested ratio and keep center/anchor edges consistent so users can drag while the ratio stays locked.
- Updated change/reset handlers to reapply constraints immediately; rebuilt + ran ui-template Vitest suite and refreshed preview HTML.