Step1: startResizeの優先軸を修正
- `apps/desktop-electron/src/renderer/app.ts` で上下ハンドルは 'height'、左右ハンドルは 'width' を初期軸に戻した。角ハンドルは従来通り pointer 初動で決定。これで 9:16 でも横ハンドルが幅優先で動くようになる準備。