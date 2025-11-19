## 2025-11-18 Trim modal aspect step 5
- 追加フィールド `regionSpace` を TrimNodeSettings に導入し、保存時は必ず image 空間に変換してセット。既存データはフラグ未定義なので stage 扱いのまま開いて、モーダル表示時に DOM メトリクスで stage 座標へ変換。
- `initializeTrimImageControls` に ensureStageRegion ヘルパーを新設し、UI操作/スタイル更新/アスペクト拘束の前に座標系を揃えるようにした。
- `applyAspectConstraint` は実ピクセル比で誤差を評価するよう修正。これで正方形選択時に枠が 326.25×326.25px で描画され、保存後のプレビューも 2088×2088px に。
- `pnpm --filter desktop-electron build`、`pnpm vitest run apps/desktop-electron/src/ui-template.test.ts apps/desktop-electron/src/ui-template.a11y.test.ts` がグリーン。`node tmp/render-preview.js` → Playwright で doc/ハロウィン.png を読み込み、正方形アスペクトの実測を記録済み。