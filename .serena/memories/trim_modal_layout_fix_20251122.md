Adjusted trim modal layout to keep controls visible:
- apps/desktop-electron/src/ui-template.ts
  - nv-modal: overflow hidden, max-height 92vh, modal-content scrollable with max-height calc(92vh-80px).
  - trim-image-stage resized to min(55vh, 560px) and width min(90vw, 880px) to avoid pushing controls below viewport.
- Rebuilt desktop-electron (tsc) successfully.