Step2: applyAspectConstraintを優先軸ベースに整理
- `applyAspectConstraint` に preferredAxis を受け取る引数を追加し、forceWidth/forceHeight が境界に当たるまではその候補を採用するよう変更。
- fallback は比率誤差と境界接触で決める簡潔なロジックに差し替え、毎フレームの width↔height 切り替えを抑制。