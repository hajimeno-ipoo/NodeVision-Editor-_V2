Step1: startResizeに優先軸判定を追加
- 画像トリムの `startResize` でドラッグ開始時のハンドル・pointer初動から `effectiveAxis` を決定し、角ハンドルは初動デルタで横or縦を一度決めて最後まで保持するようにした。
- `applyAspectConstraint` に渡す第3引数として伝播させる仕組みを追加。