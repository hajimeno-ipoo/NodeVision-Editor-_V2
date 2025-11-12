## 2025-11-12 Foundation fixes
- ESLint ignoresへ `doc/NodeVision-skeleton-v1.0.4_secure/**` を追加し、apps/packages/vitest.config の import/order を整理。`pnpm lint` がノーエラーで完走。
- Electronブート (`apps/desktop-electron/src/main.ts`) で `BinaryNotFoundError` を捕捉し、FFmpeg未検出時に `dialog.showMessageBox` + `shell.showItemInFolder` で設定ファイルを開ける誘導を追加。失敗時はダイアログの二重表示を避けるため `reportFatal` に silent option を実装。
- チェックリストに A-01/A-02 の証跡を追記済み。