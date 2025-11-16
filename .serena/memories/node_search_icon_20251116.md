## 2025-11-16 ノード検索アイコン差し替え
- `apps/desktop-electron/src/ui-template.ts` で `doc/icon/ノード検索.png` をBase64データURIとして埋め込み、サイドバーのノード検索アイコンをPNGに変更。
- 同ファイルのCSSに `.sidebar-icon-symbol img` を追加し、24px枠でのスケーリングを安定化。
- アイコンが見つからない場合は既存のSVGをフォールバックに使用し、Vitest (`apps/desktop-electron/src/ui-template.test.ts`) に画像が`data:image/png;base64,`で埋まっていることを確認するテストを追加。
- `$1
- 23:20頃、`collectAssetCandidates` を追加して `doc/icon/ノード検索.png` の探索範囲をルートまで広げ、Electron本番ビルドでも画像が読めるように調整。