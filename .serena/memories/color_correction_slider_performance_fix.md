# Color Correction スライダー・リセットパフォーマンス修正 (2024-12-04)

## 修正された問題

### 1. スライダーがフリーズ/カクつく
- **原因**: `context.renderNodes()` の頻繁な呼び出し
- **修正**: Canvas Preview モード切り替えを削除し、`previewProcessor` の Canvas を直接DOMにコピー

### 2. リセットボタンが機能しない
- **原因**: `highRes=true` のみで呼ばれていた
- **修正**: `highRes=false` で即時更新後、`highRes=true` でHQ生成

### 3. 2つ目のスライダーでリアルタイムプレビューが動かない
- **原因**: DOMセレクタ誤り、Canvas削除
- **修正**: `.node-media-preview` を使用、Canvas を非表示で再利用

## 重要なコードパターン

### propagateToMediaPreview (WebGLColorProcessor用)
```typescript
// Canvas を直接DOMにコピー
const existingCanvas = imgOrCanvasContainer.querySelector('canvas.preview-canvas');
if (!existingCanvas) {
    existingCanvas = document.createElement('canvas');
    existingCanvas.className = 'preview-canvas';
    imgOrCanvasContainer.appendChild(existingCanvas);
}
const ctx = existingCanvas.getContext('2d');
ctx.drawImage(processor.getCanvas(), 0, 0);
```

### リセットボタン
```typescript
updateValueAndPreview(key, defaultValue, false, true); // 即時プレビュー
updateValueAndPreview(key, defaultValue, true, true);  // HQ生成
```

## 関連ファイル
- `apps/desktop-electron/src/renderer/nodes/color-correction.ts`
- `apps/desktop-electron/src/renderer/nodes/webgl-color-processor.ts`

## 設計原則
- ドラッグ中は `toDataURL()` を避ける（重い処理）
- Canvas は削除せず非表示で再利用
- 高速プレビューと高画質パスを分離
