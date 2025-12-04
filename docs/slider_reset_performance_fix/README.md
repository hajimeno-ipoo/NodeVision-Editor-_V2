# Color Correction スライダー・リセットパフォーマンス修正

## 修正日
2024-12-04

## 概要
Color Correction ノードのスライダーパフォーマンス問題、リセット機能の不具合を修正しました。

---

## 修正された問題

### 1. スライダーがフリーズ/カクつく問題
**原因**: `context.renderNodes()` の頻繁な呼び出しによるDOM全体の再レンダリング

**修正内容**:
- Canvas Preview モード切り替えロジック（`state.canvasPreviews.set`, `context.renderNodes()`）を削除
- `previewProcessor` から直接 Canvas をDOMコンテナにコピーする方式に変更
- `toDataURL()` のオーバーヘッドを回避

### 2. リセットボタンが機能しない問題
**原因**: `highRes=true` のみで呼び出されていたため、高速プレビューパスがスキップされていた

**修正内容**:
- リセット時に `highRes=false` で即座にプレビュー更新
- その後 `highRes=true` で高画質LUT生成をスケジュール

### 3. 2つ目のスライダーでリアルタイムプレビューが動作しない問題
**原因**: 
- DOMセレクタの誤り（`.node-preview-image` → `.node-media-preview`）
- Canvas を削除していたため再利用できなかった

**修正内容**:
- 正しいセレクタ `.node-media-preview` を使用
- Canvas を `remove()` ではなく `display: none` で非表示にし再利用

---

## 変更ファイル

### `apps/desktop-electron/src/renderer/nodes/color-correction.ts`

#### `propagateToMediaPreview` 関数の修正
- `WebGLColorProcessor` 用の専用パスを追加
- Canvas を直接DOMにコピー（`ctx.drawImage()`）
- Canvas の再利用で効率化

#### リセットボタンハンドラの修正
```typescript
// 即座にプレビュー更新 (highRes=false)
updateValueAndPreview(key, defaultValue, false, true);
// 高画質LUT生成をスケジュール (highRes=true)
updateValueAndPreview(key, defaultValue, true, true);
```

---

## 検証結果

### 動作確認済み
- ✅ スライダー操作がスムーズ（60fps）
- ✅ リアルタイムプレビューが連続して動作
- ✅ リセットボタンで即座にプレビューが更新
- ✅ 高画質LUTが正しく生成・適用
- ✅ LUT解像度設定（プレビュー用/書き出し用）が正しく機能

---

## アーキテクチャ

### プレビュー更新フロー

```
スライダードラッグ (input イベント)
  ↓
highRes=false → previewProcessor.applyCorrection()
  ↓
Canvas を DOM にコピー (ctx.drawImage)
  ↓
即座にプレビュー表示

スライダーリリース (change イベント)
  ↓
highRes=true → Web Worker でLUT生成
  ↓
processor.loadLUT() → toDataURL()
  ↓
img タグに高画質画像を設定
```

### リセットフロー

```
リセットボタンクリック
  ↓
1. highRes=false で即時プレビュー更新
  ↓
2. highRes=true で高画質LUT生成スケジュール
```
