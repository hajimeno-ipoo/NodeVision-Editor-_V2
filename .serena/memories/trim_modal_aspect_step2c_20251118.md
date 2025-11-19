Step2-c: 実表示サイズを考慮
- imageElement の object-fit により DOMRect だけでは実際の表示サイズが分からなかったため、stageRect と naturalWidth/Height から displayWidth/Height・オフセットを算出し、stage<->image 変換に適用。
- これにより縦長画像でも正しい表示領域を基準に比率計算できるようになった。
- `pnpm --filter desktop-electron build` を再実行し、型チェックOK。