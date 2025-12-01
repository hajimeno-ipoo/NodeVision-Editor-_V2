# 動画ヒストグラムの実装

## ゴール
画像入力と同様に、Curve Editorノードで動画入力に対してもヒストグラムを表示できるようにします。現在は画像入力の場合のみヒストグラムが表示されています。

## 提案される変更
### `apps/desktop-electron/src/renderer/nodes/curve-editor.ts`
#### [MODIFY] [curve-editor.ts](file:///Users/apple/Desktop/AI アプリ/NodeVision Editor _V2/apps/desktop-electron/src/renderer/nodes/curve-editor.ts)
- ヘルパー関数 `extractHistogramFromVideo(videoUrl: string)` を実装します：
    - 非表示の `video` 要素を作成します。
    - 指定されたURLから動画をロードします。
    - 最初のフレーム（または代表的なフレーム）にシークします。
    - フレームを一時的なCanvasに描画します。
    - `calculateHistogram` を使用してヒストグラムを計算します。
- 動画入力時のレンダリングロジックを更新します：
    - 動画ソースが検出された場合、ソースURLで `extractHistogramFromVideo` を呼び出し、`inputHistograms` にデータを格納します。
    - FFmpegプレビュー生成が完了した後、生成されたプレビューURLで `extractHistogramFromVideo` を呼び出し、`outputHistograms` にデータを格納します。
- ヒストグラム計算後にUI更新（`updateSettings` または `drawCurveEditor`）をトリガーします。

## 検証計画
### 手動検証
1.  `Load Video` -> `Curves` を接続します。
2.  動画ファイルを読み込みます。
3.  カーブエディタの背景にヒストグラム（Input）が表示されることを確認します。
4.  カーブを調整し、プレビューが更新されるのを待ちます。
5.  ヒストグラム（Output）が変更を反映して更新されることを確認します（Outputモードが選択されている場合）。
