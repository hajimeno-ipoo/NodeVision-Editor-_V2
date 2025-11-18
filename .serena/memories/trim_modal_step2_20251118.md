## Step2 完了 (共通モーダル基盤)
- Renderer にモーダル基盤を追加：`.nv-modal-backdrop`/`.nv-modal` 要素を生成して、バックドロップ/フォーカストラップ/Escape閉じを実装。`openTrimModal` が実際にモーダルを開くようになり、プレースホルダー文言（画像/動画別）を表示する。
- i18n に `common.close` とモーダルのプレースホルダー文言を追加し、CSS でモーダル/ボタンのスタイルを作成。
- `ui-template.test.ts` にトリムボタンクリックでモーダルが開くテストを追加。検証手順: `pnpm --filter desktop-electron build` → `pnpm vitest run apps/desktop-electron/src/ui-template.test.ts apps/desktop-electron/src/ui-template.a11y.test.ts` ✅。