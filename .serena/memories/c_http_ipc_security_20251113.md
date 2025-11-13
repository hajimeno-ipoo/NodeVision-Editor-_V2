## 2025-11-13 C章 HTTP/IPC 対応
- apps/desktop-electron に `http-server.ts` を追加し、`NV_HTTP=1` + NV_HTTP_TOKEN 必須のローカル(127.0.0.1)限定サーバーを実装。TokenManager.validate による401/403/TokenExpired、同時実行2件制限(429)、128KBボディ制限、1s body timeout→E1004、JSONレスポンス整形を実装。
- packages/engine に `inspect/concat.ts` と `probe/ffprobe.ts` を追加。`clips[].path` の拡張子/実体検証・シンボリックリンク/UNC拒否・ffprobe結果の正規化を実装し、`inspectConcat`/`probeClips`用Vitestを 100% coverage で追加。
- `pnpm test` で全パッケージ 100% ステートメント/ブランチ coverage を確認。
- `doc/check list/NodeVision_Implementation_Checklist_v1.0.7.md` のC-01〜C-05を `[x]` 更新し、証跡に http-server.ts/inspectConcat 実装＋pnpm test を追記。