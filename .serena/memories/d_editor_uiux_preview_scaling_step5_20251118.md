## 2025-11-18 Preview scaling step 5
- `pnpm --filter desktop-electron build` → `node tmp/render-preview.js` で preview HTML を再生成し、Chrome DevTools MCP から nodevision-preview.html を確認。
- リポジトリ全体で `pnpm test` (Vitest + coverage) を実行し、全テスト/アクセシビリティチェックがパスすることを確認。