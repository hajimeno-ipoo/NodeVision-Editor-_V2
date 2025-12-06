# LUT Loader 動画プレビュー実装計画

## 目標
LUT Loaderノードにおいて、動画ファイルのプレビューを正常に表示し、色再現の一貫性を確保します。Curve Editorなどと同様に、動画プロセッサーを用いたパイプラインを実装します。

## 実装計画書: LUT Loader 動画プレビュー & 書き出し対応

## 概要
LUT Loader ノードにおいて、動画ファイルのプレビュー機能と、書き出し（エクスポート）時のLUT適用機能を実装します。

## User Review Required
- **Export Logic**: FFmpeg を使用した書き出し時に、LUTの強度 (`intensity`) をサポートするため、`blend` フィルタを使用する複雑なフィルタチェーンを生成します。

## Proposed Changes

### [Preview] Video Preview Implementation
#### [MODIFY] [lut-loader.ts](file:///Users/apple/Desktop/Dev_App/NodeVision%20Editor%20_V2/apps/desktop-electron/src/renderer/nodes/lut-loader.ts)
- `HTMLVideoElement` の管理機能を追加。
- `requestAnimationFrame` による動画フレームの定期更新ループを実装。
- ソースメディアの種別（動画/静止画）判定ロジックを強化。
- **動画プロセッサー管理の追加**:
    - `videoProcessors` Mapを追加し、動画要素 (`HTMLVideoElement`) を管理します。
    - `videoCleanup` Mapを追加し、クリーンアップ関数を管理します。
- **入力種別の判定**:
    - ソースURLの拡張子または種別判定を行い、画像と動画で処理を分岐させます。
- **動画プレビューの実装**:
    - 動画入力時、`video` 要素を作成し、`WebGLLUTProcessor` にテクスチャとして渡します。
    - `requestVideoFrameCallback` または `requestAnimationFrame` を使用して、フレームごとの更新ループを実装します。
    - プレビューキャンバスの内容を `MediaPreview` ノードへ伝播させます。
- **クリーンアップ処理**:
    - ノード削除時やソース変更時に、生成した `video` 要素やイベントリスナーを適切に破棄します。

## 検証計画
- **ビルド検証**: `pnpm build` が成功することを確認。
- **動作確認手順（Walkthrough）**:
    1. LUT Loaderに `.cube` ファイルをロード。
    2. 動画読み込みノードを LUT Loader に接続。
    3. プレビューが表示され、動画が再生（またはシーク）されることを確認。
    4. LUTが適用された色が反映されていることを確認。
