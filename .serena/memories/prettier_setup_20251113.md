## 2025-11-13 Prettier install support
- VS Code Prettier拡張が `Cannot find module 'prettier'` になる原因はルートに node_modules が存在せず依存未インストールだったため。
- `pnpm install` を実行して全7パッケージをセットアップ、prettier@3.6.2 を取得。peer warning は eslint 9.x + unused-imports 3.2 の組み合わせによる既知差分。
- `pnpm format:check` を走らせて動作確認したところ、多数の Doc/Serenaメモ/履歴HTML がPrettier整形対象に含まれており未整形で失敗することを確認（現時点ではノータッチ）。
- `pnpm test` (Vitest + coverage) は引き続き statements/branches/functions/lines 100% を維持して通過。