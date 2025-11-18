## Step4 完了 (保存フロー＆状態管理) 2025-11-18
- トリム設定の保存を `persistTrimSettings` で共通化。Image/Video 両モーダルが Save すると `ensureTrimSettings` を更新→`scheduleTrimPreviewUpdate`→`commitState`→トースト表示の流れに統一し、Undo/Redo・自動保存・汚れフラグまで伝播するようになった。
- Video モーダルに Save ボタン実装。IN/OUT・Strict 値を保持し、デフォルト値（開始=0/終了=クリップ末尾）は null に戻してステータス文言とシグネチャの安定性を担保。Timecode 入力/タイムライン/ジョグ操作で編集したレンジがそのまま `settings.startMs/endMs/strictCut` へ反映される。
- Load ノードの動画メタ読みで `NodeMediaPreview.durationMs` を保存し、トリムモーダルやプレビュー更新で使用。`updateMediaPreviewDimensions` も追加メタを受け付けるよう拡張済み。
- i18n に `nodes.trim.toast.videoSaved` を追加し、Save 成功時のフィードバックを localized。
- テスト: `pnpm --filter desktop-electron build` → `pnpm vitest run apps/desktop-electron/src/ui-template.test.ts apps/desktop-electron/src/ui-template.a11y.test.ts` ✅（jsdom DOMException/canvas警告は既知）。