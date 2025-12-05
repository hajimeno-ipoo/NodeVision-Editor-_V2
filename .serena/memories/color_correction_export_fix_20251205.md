# Color Correction エクスポート色一致修正 (2025-12-05)

## 問題
プレビューとエクスポートで色が一致しない問題があった。
特に色温度（Temperature）設定で顕著。

### 症状
- プレビュー: 青みがかった色調（色温度 -100）
- エクスポート: 暖色系（オレンジ/黄色っぽい）

## 原因
### ピクセルフォーマットの問題
PNG画像出力時に `yuv420p`（動画用）ピクセルフォーマットが使用されていた。

`packages/engine/src/ffmpeg/builder.ts` の元のコード:
```typescript
const isLikelyImageOutput = loadNode.typeId === 'loadImage' && !exportNode.container;
```

`exportNode.container` が `'png'` の場合、truthy なので `!exportNode.container` は `false` になり、
`yuv420p` が選択されていた。

## 修正内容

### 1. ピクセルフォーマット選択ロジックの修正
**ファイル**: `packages/engine/src/ffmpeg/builder.ts`

```typescript
// 出力形式に応じて適切なピクセルフォーマットを選択
// 画像形式(png, jpg, webp, gif): rgb24
// 動画形式(mp4, mov, mkv等): yuv420p
const imageFormats = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
const containerFormat = exportNode.container?.toLowerCase() ?? '';
const isImageOutput = imageFormats.includes(containerFormat);
const defaultPixelFormat = isImageOutput ? 'rgb24' : 'yuv420p';
```

## テスト結果

### 確認済みパラメータ（全て一致）
| パラメータ | テスト値 | 結果 |
|-----------|----------|------|
| 色温度 (Temperature) | -100 / +100 | ✅ |
| ティント (Tint) | ±50 | ✅ |
| 彩度 (Saturation) | 0.5 / 2.0 | ✅ |
| コントラスト (Contrast) | 2.0 | ✅ |
| 露出 (Exposure) | ±1.0 | ✅ |
| シャドウ (Shadows) | ±50 | ✅ |
| ハイライト (Highlights) | ±50 | ✅ |
| ガンマ (Gamma) | 0.5 / 2.0 | ✅ |

### 出力形式別テスト
- ✅ **PNG出力**: `rgb24`ピクセルフォーマットで色が正確
- ✅ **MP4出力**: `yuv420p`ピクセルフォーマットで色が正確

## 関連ファイル
- `packages/engine/src/ffmpeg/builder.ts`: ピクセルフォーマット選択ロジック
- `apps/desktop-electron/src/renderer/nodes/webgl-color-processor.ts`: 画像プレビュー用WebGLシェーダー
- `apps/desktop-electron/src/renderer/nodes/webgl-video-processor.ts`: 動画プレビュー用WebGLシェーダー
- `apps/desktop-electron/src/renderer/nodes/lut-worker.ts`: LUT生成ワーカー
- `packages/color-grading/src/primary/temperature.ts`: 温度調整ロジック

## 技術的背景
- **プレビュー**: WebGLシェーダーによるリアルタイム処理
- **エクスポート**: 3D LUT（.cube）生成 → FFmpegで適用
- 両方のパイプラインで同一の色変換ロジックを使用することで一致を保証

## 未対応項目
- Primary Grading（カラーホイール）ノードのエクスポート（builder.tsに未実装）
- Secondary Gradingノードのエクスポート

## 更新したドキュメント
- `docs/color_grading_system/testing_guide.md`: エクスポートテストセクションを拡充
