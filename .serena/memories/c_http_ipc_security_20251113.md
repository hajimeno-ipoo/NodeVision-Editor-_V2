## 2025-11-13 HTTP/IPC security closure
- packages/engine/src/http/inspect-server.ts で localhost 強制・token ヘッダ検証・128KB/1s ガード・maxConcurrent=2 → 429/E4080/E4130 応答をVitestで検証済み。
- TokenManager (packages/tokens) が rotate grace 15分と401/403判定を提供し、apps/desktop-electron/main.ts が NV_HTTP と settings.http.enabled の両方が true のときのみ HTTP サーバーを起動。
- inspectConcat (packages/engine/src/inspect/concat.ts) で UNC, symlink, 非ファイル, R/O パスを正規化時に拒否する実装を確認。
- doc/check list/NodeVision_Implementation_Checklist_v1.0.7.md のC-01〜C-05を [x] に更新し、証跡を追記。pnpm test で coverage 100% 維持。