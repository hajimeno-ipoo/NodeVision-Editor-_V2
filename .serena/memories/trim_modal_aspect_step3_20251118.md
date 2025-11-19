Step3: アスペクト適用タイミングの整理
- initializeTrimImageControls 内に enforceAspect ヘルパーを追加し、初期表示・リセット・アスペクト比変更時に必ず applyAspectConstraint→updateCropBoxStyles がセットで呼ばれるよう統一。
- これで適用タイミングが分散していた箇所を一元化し、今後の変更でも比率拘束が抜け落ちない体制にした。
- `pnpm --filter desktop-electron build` で型チェックを再実行。