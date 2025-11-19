Step4: テスト・挙動チェック
- `pnpm vitest run apps/desktop-electron/src/ui-template.test.ts apps/desktop-electron/src/ui-template.a11y.test.ts` を実行し、既存テストを通過。
- Playwright で `doc/ハロウィン.png` を読み込み、アスペクト比セレクトを正方形に切り替える手順を再現（node tmp/render-preview.js → ファイルアップロード → 画像トリム）。
- 結果: 枠の style.width/style.height が 100% のままで実寸も 16:9 のまま。比率拘束がまだ効いていないことを確認。