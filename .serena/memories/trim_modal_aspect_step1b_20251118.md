Step1-extended: ステージ/画像変換ヘルパー
- trimモーダルのクロップ領域を画像表示に合わせて扱えるよう、stage<->image座標変換ヘルパーを追加。
- applyAspectConstraint 内で stage→image→stage の変換を行い、比率制約は常に画像基準(0-1)で計算するように変更。
- build 成功を確認。