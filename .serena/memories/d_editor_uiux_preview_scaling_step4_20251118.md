## 2025-11-18 Preview scaling step 4
- ui-template の .node-media 系スタイルを Flex レイアウト化し、min-height を撤廃・min()/max() を使って `--preview-width/height` がノードサイズ変化に滑らかに追従するように調整。
- メディア枠の overflow を hidden、img/video に max-width/max-height を追加して縦横比を保ったままカードいっぱいにフィットする挙動にした。
- `pnpm vitest run apps/desktop-electron/src/renderer/nodes/preview-size.test.ts apps/desktop-electron/src/renderer/nodes/preview-layout.test.ts` を再実行し、CSS 変更による副作用がないことを確認。