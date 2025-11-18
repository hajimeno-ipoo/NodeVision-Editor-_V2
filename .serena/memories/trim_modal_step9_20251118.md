## Step6: UI検証 (2025-11-18)
- Playwrightで `tmp/nodevision-preview.html` を再生成 (`node tmp/render-preview.js`) → `page.addInitScript` で Trim ノードの設定をスプーフし、ステータスラベルに新フォーマット（画像 68% × 70% / 動画 00:01.200 → 00:05.600 + strict）表示を確認。スクショ: /var/folders/pm/.../trim-status.png。
- 動画モーダルもPlaywrightで起動、専用UI（プレビュー枠・時間入力・タイムライン・トグル・トランスポート）をキャプチャ。スクショ: /var/folders/pm/.../trim-modal-video.png。
- 既知制限: `load` テンプレが簡易版のためプレビュー実サムネは空。Media Previewノードの hint バッジは実挙動(Loadノードが画像/動画を持つ場合)で表示されるが、この静的プレビューでは `.node-media` ブロック未生成のため未確認。実アプリでは `loadImage/loadVideo` テンプレ経由でカバーされる想定。
- テストは `pnpm --filter desktop-electron build` → `pnpm vitest run apps/desktop-electron/src/ui-template.test.ts apps/desktop-electron/src/ui-template.a11y.test.ts` を継続実行、既知DOMException/CNV警告のみ。