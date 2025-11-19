Step2: クロップ枠の比率再計算アルゴリズムを実装
- applyAspectConstraint を全面的に書き換え、ターゲット比率をそのまま使ってwidth/height候補を生成し、アンカーに合わせて位置調整する仕組みに変更。
- 比率誤差→面積の順で候補を評価することで、自由/固定比どちらでも自然な挙動に寄せた。
- 未使用になった getNormalizedAspectRatio を削除し、再度 `pnpm --filter desktop-electron build` でタイプチェックを実行。