## Step5 完了 (Media Preview派生出力＆表示調整) 2025-11-18
- Trimノードのステータス表示を詳細化。クロップ率や動画のIN/OUT/Strict情報を `buildStatusLabel` で整形し、i18nキー `nodes.trim.status.imageSummary` / `videoSummary` などを追加。これでノード一覧からトリム内容がひと目で分かるようになった。
- Media PreviewノードでTrim由来のソースにバッジ＆詳細を出すように実装 (`media-preview.ts`)。アップストリームがTrimなら「トリム結果」バッジ＋クロップ率や時間レンジを表示するので、派生プレビューを見失わない。UIテンプレートに `.node-media-hint` スタイルを追加して視認性を確保。
- 共有ヘルパー `formatTrimTimecode` を `trim-shared.ts` へ切り出して renderer/app & trimノードで共通利用。動画モーダル/ステータス/プレビューが同じフォーマットを使うため、無駄な計算や文字列ずれを防げる。
- テスト: `pnpm --filter desktop-electron build` → `pnpm vitest run apps/desktop-electron/src/ui-template.test.ts apps/desktop-electron/src/ui-template.a11y.test.ts` ✅（新規ケース: トリム済みステータス表示）。