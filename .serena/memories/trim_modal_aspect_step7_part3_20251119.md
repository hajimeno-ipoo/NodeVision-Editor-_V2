Step3: 角ハンドルのアンカー安定化
- `buildRegionFromAnchor` に axisHint を受け取る引数を追加し、角ハンドルで優先軸が決まっている場合はドラッグ開始時のコーナーを基準に幅/高さを組み立てるようにした。
- `applyAspectConstraint` で `buildRegionFromAnchor` を呼ぶ際に axisHint を渡し、corner→center→cornerへのスイッチで座標が跳ねないようにした。