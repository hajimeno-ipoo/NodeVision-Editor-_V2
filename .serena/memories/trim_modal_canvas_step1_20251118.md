## Step1: トリム設定のデータモデル拡張 (2025-11-18)
- `packages/editor/src/types.ts` に `rotationDeg`, `zoom`, `flipHorizontal`, `flipVertical`, `aspectMode` を追加し、`TrimAspectMode` 型を定義。今後の回転/反転/ズーム機能の設定値を保持できるようにした。
- `packages/editor/src/templates.ts` および Renderer 側 `apps/desktop-electron/src/renderer/nodes/trim-shared.ts` の `DEFAULT_TRIM_SETTINGS`/`cloneSettings`/`ensureTrimSettings` を更新し、既存プロジェクトでも欠けたフィールドにデフォルトが入るよう後方互換性を確保。
- テスト: `pnpm vitest run packages/editor/src/templates.test.ts packages/editor/src/persistence.test.ts` ✅（テンプレート期待値を新フィールドに合わせて更新済み）。