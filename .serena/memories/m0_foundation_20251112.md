## 2025-11-12 — W1 M0 Foundation
- ルートに pnpm モノレポ基盤 (package.json/tsconfig.base.json/eslint.config.mjs/prettier/vitest.config.ts) を追加し、workspace `apps/*` / `packages/*` を定義。
- packages/settings: tempRoot/HTTP/tokenLabel等を含む設定CRUDと診断ヘルパー、Vitestで100%カバレッジ。
- packages/tokens: TokenManager + Keytar/File fallback + CLI向けtoken diagnostics、grace window/rotate/revokeテスト完備。
- packages/system-check: FFmpeg検出・tempRoot監視ロジック、Windows擬似分岐やPATH未定義ケースまでE2Eテスト済み。
- packages/nvctl: commander製CLI (`token issue/rotate/revoke/list`, `settings show/temp-root`) とactionsユニットテスト。
- apps/desktop-electron: Electron mainプロセス骨組みで設定ロード/FFmpeg検出/HTTPトークン自動生成/簡易ウィンドウ表示を実装。
- scripts/generate-sample-media.ts: FFmpeg経由で720p/1080p 10sサンプルを再生成。
- `pnpm test` で全パッケージのVitest + V8カバレッジ100%達成 (ステートメント/ブランチ/関数/ライン)。