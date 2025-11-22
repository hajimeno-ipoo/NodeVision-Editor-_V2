2025-11-22 Cropper.js初期化エラー解消まとめ
- 問題: Electron rendererで new Cropper() が "Cannot call a class as a function" エラー。contextBridge経由のProxy化が原因。
- 解決策:
  1) ui-template.ts に Cropper の <script> と CSS を直接埋め込み、window.Cropper をネイティブクラスで提供。
  2) preload.ts から Cropper の contextBridge公開を削除し、Proxy上書きを防止。
  3) renderer/app.ts の resolveCropper を単純化し、window.Cropper を直接参照。
- 変更ファイル: apps/desktop-electron/src/ui-template.ts, apps/desktop-electron/src/preload.ts, apps/desktop-electron/src/renderer/app.ts
- 状態: エラー解消済み。既に修正済みとして稼働。
- 備考: 一時的に nodevision-temp が肥大化し起動失敗したが、temp 削除で解消。