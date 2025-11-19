Step1: pickBestImageRegionロジック改修
- apps/desktop-electron/src/renderer/app.ts の `applyAspectConstraint` で handle 別の固定分岐をやめ、幅/高さ候補を両方評価する仕組みに変更。
- `projectCandidate` で候補→stage→再度imageの往復を行い、クランプ後の比率誤差や境界接触をスコア化。縦ハンドルでも誤差が小さい方（場合によっては高さ案）を選べるようにした。