## 2025-11-16 キャンバスツールバー可動化
- `ui-template` に `id="canvas-controls"` を付与し、CSSへ `cursor: grab`/`touch-action: none` を追加して大きいツールボタン(60px)とアイコン(46px)に拡張。
- `renderer/types.ts` & `state.ts` に `canvasControlsPosition` を追加し、`dom.ts` で `canvasControls` をキャプチャ。
- `renderer/app.ts` でドラッグ操作とローカルストレージ保存(`nodevision.canvasControls.position`)を実装。Alt+ドラッグでボタン上からでも移動可。リサイズ時はビューポート内にクランプ。
- `ui-template.test.ts` にツールボタンサイズ検証テストを追加し、`pnpm vitest run apps/desktop-electron/src/ui-template.test.ts` (30 tests) でパス済み。