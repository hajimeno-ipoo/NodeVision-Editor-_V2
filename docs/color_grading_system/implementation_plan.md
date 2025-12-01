# 動画プレビュー更新の修正

## ゴール
Curvesノードに動画を読み込んだ際、プレビューが即座に更新されない問題を修正します。現在は、プレビューを表示させるためにノードを再接続したりUIを操作したりする必要があります。

## 提案される変更
### `apps/desktop-electron/src/renderer/nodes/curve-editor.ts`
#### [MODIFY] [curve-editor.ts](file:///Users/apple/Desktop/AI アプリ/NodeVision Editor _V2/apps/desktop-electron/src/renderer/nodes/curve-editor.ts)
- `generateFFmpegVideoPreview` 関数を修正します。
- `requestAnimationFrame` コールバック内で、`video` 要素が存在するかどうかを確認します。
- `video` 要素が見つからない場合（初期ロード時によく発生します）、`context.renderNodes()` を呼び出して Media Preview ノードの再レンダリングをトリガーし、`video` 要素が生成されソースが設定されるようにします。

## 検証計画
### 手動検証
1.  `Load Video` -> `Curves` -> `Media Preview` を接続します。
2.  `Load Video` で動画ファイルを読み込みます。
3.  再接続やノードのクリックなしで、`Media Preview` ノードに動画プレビューが即座に表示されることを確認します。
4.  カーブのパラメータを変更して、プレビューが期待通りに更新されることを確認します。
