## 2025-11-17 Port layout & alignment fix summary
- 問題点まとめ:
  - 入力/出力ポートの HTML は常に `.ports input` / `.ports output` コンテナを描画しており、片側だけのノードでも空コンテナが残ってノード中央で詰まる。
  - CSS では `.node-ports` を grid レイアウト + `grid-template-columns:1fr 1fr` にしていたため、入出力が両方無いケースでも必ず2カラムぶんの余白が発生し、ComfyUI 風「入力左・出力右」の見た目が崩れた。
  - `.port.output` に対して実際の HTML クラス名（`.port port-output`）と異なるセレクタを書いていたため、flex 方向や文字揃えが効かず、ポートボタン内の「ラベル + 丸」がボタン左寄りに表示されていた。
- 修正内容:
  1. `apps/desktop-electron/src/renderer/app.ts` の `buildPortGroup` で、ポート配列が空のときは空の `<div>` を出さず `''` を返すように変更。入力だけ/出力だけのノードでは片側コンテナが完全に消える。
  2. `apps/desktop-electron/src/ui-template.ts` の `.node-ports` を flex レイアウト化し、左右コンテナ間を `justify-content: space-between` で離す。`.ports.input` は左寄せ、`.ports.output` は右寄せに。
  3. `.port` セレクタを `.port.port-input` / `.port.port-output` に修正し、出力ポート用ボタンは `flex-direction: row; justify-content: flex-end;` で「ラベル＋丸」をボタン右端に揃える。入力ポートは `flex-start` のまま。
- 結果:
  - 入力のみのノード → 左寄せポートのみ表示。
  - 出力のみのノード → 右寄せポートのみ表示。
  - 入出力の両方を持つノード → 左端と右端にそれぞれのポートリストが配置。
  - ボタン内部のラベルとポート丸も、入力は左、出力は右に揃う。