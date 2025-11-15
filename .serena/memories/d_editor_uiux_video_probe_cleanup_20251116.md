## 2025-11-16 Video preview stabilization
- ブラウザコンソールで`Blocked attempt to create a WebMediaPlayer`が大量発生していた原因は、`measureVideoDimensions`が生成した`<video>`要素を破棄しておらずWebMediaPlayerが上限に達していたため。ノードを再起動せず大量の動画を読み込むとプレビューが真っ黒になる＆落ちる状況だった。
- `apps/desktop-electron/src/renderer/app.ts`に測定用コンテナ`#nodevision-media-measurements`を追加し、非表示の`<video>`をそこで使い回すように変更。メタデータ取得後はpause→src解除→load→DOMからremoveまで行い、エラーログも出すようにした。
- `pnpm test` で回帰なし（coverage 100%）を確認。