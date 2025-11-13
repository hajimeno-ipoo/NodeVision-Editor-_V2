## 2025-11-13 Eセクション実装ログ
- packages/engine/src/media/ 以下に MediaGraph/FFmpegビルダー/プレビュー同期を追加し、Load→Trim→Resize→Export の最短経路生成、SAR=1/VFR→CFR/strictCut/色空間(bilinear preview, bicubic export)を実装。
- JobQueue に PreviewProgressBridge を統合し、previewSyncオプションと `recordFrame()` で JobProgress を1フレーム以内に同期するよう拡張。previewSync未設定/無効FPS/推定合計時間などの分岐もユニットテスト化。
- packages/editor/src/templates.ts に TextOverlay/Crop/Speed/ChangeFPS ノードを登録し、doc/check list の E-01〜E-05 を[x]化。Vitestを追加して coverage 100% を維持。