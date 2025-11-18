## Step3 完了 (画像トリムモーダル)
- モーダルに画像トリム用UIを追加：ソースプレビュー上に矩形オーバーレイ＋ドラッグ可能なコーナーハンドルを描画し、Reset/Cancel/Save 操作を提供。
- `openTrimModal(mode:'image')` で upstream の media preview を取得し、draft region を編集→保存で `settings.region` を更新し `scheduleTrimPreviewUpdate` 経由で派生プレビューを再生成。
- プレビューが未接続の場合はモーダル内に案内メッセージを表示。
- i18n にアクションボタンやトースト文言、CSS にステージ/ハンドル/アクション群のスタイルを追加。
- テスト: `pnpm --filter desktop-electron build` → `pnpm vitest run apps/desktop-electron/src/ui-template.test.ts apps/desktop-electron/src/ui-template.a11y.test.ts` ✅。