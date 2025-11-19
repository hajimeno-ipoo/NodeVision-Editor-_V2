Step1: アスペクト比選択ロジック整理
- renderer/app.ts の aspect 値テーブルを ASPECT_RATIO_MAP に整理し、free/original/プリセットの返却値を明確化。
- getSelectedAspectRatio がターゲット比率そのものを返すようにし、getNormalizedAspectRatio は暫定的にその値をそのまま返す形へ。
- pnpm --filter desktop-electron build で型チェック通過を確認。