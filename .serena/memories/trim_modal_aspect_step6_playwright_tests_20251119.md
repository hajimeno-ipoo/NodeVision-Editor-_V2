Playwright回帰テスト追加
- 依存に `@playwright/test` を導入し、`playwright.config.ts` と `tests/playwright/trim-aspect-ratio.spec.ts` を新設。
- テストでは `tmp/render-preview.js` を実行して stub HTML を生成し、doc/ハロウィン.png をアップロード→画像トリムモーダルを開いてアスペクト比 (square, 4:3, 16:9, 9:16) × 各ハンドルをステージ端までドラッグ。`[data-trim-box]` の実寸から比率を算出し、±0.005 以内か検証。
- `pnpm playwright test` がローカルでグリーン。scripts に `test:playwright` / `playwright:install` を追加済み。