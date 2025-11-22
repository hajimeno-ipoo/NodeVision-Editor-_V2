2025-11-21 正規化を幅・高さ別に戻し等方化を撤廃
- convertStageRegionToImageRegion：クリップ後の正規化を幅/高さ別スケール（viewport.width/height）で行うよう変更。短辺等方化は廃止。
- convertImageRegionToStageRegion も同様に width/height を個別スケールで逆変換。
- getImageStageMetrics は実描画×zoomのまま。キャッシュは使用せず。
- ビルド: pnpm --filter desktop-electron build パス。
