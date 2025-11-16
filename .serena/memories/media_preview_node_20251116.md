## 2025-11-16 メディアプレビューノード
- `packages/editor/src/templates.ts` に `mediaPreview` テンプレートを追加 (Viewerカテゴリ, video入力のみ) し、テストも `packages/editor/src/templates.test.ts` に更新。
- `apps/desktop-electron/src/renderer/i18n.ts` へ英日両対応の nodeTemplate/nodes.* 文言を追加。
- `apps/desktop-electron/src/renderer/nodes/media-preview.ts` を新規実装し、入力ポートに接続されたノード(例: Load Image/Video)の`state.mediaPreviews`を参照して画像/動画プレビューを表示。接続確認やメタ情報、未接続メッセージも含む。
- NodeRendererContext/DOM/State に `canvas-controls` 固定位と `getMediaPreview` を追加し、`createNodeRenderers` に登録。
- `.node-type-mediapreview` 用にUIテンプレートCSSを流用し、`pnpm vitest run packages/editor/src/templates.test.ts apps/desktop-electron/src/ui-template.test.ts` が成功。