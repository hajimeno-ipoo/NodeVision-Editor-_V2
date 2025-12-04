# Color Grading シェーダー統一 実装計画

## 目的
画像と動画のプレビューで色補正結果が異なる問題を解決し、LUT処理パイプラインと一貫した結果を得る。

## 現状分析

### 画像処理パイプライン（LUT）
```
入力(sRGB) → sRGBToLinear → 色補正 → linearToSRGB → 出力(sRGB)
```

### 現在のシェーダー（WebGLColorProcessor / WebGLVideoProcessor）
```
入力(sRGB) → 色補正 → 出力(sRGB)  ← sRGB/リニア変換なし
```

## 主な差異

| 項目 | LUT処理 | 現在のシェーダー |
|------|---------|------------------|
| sRGB/リニア変換 | あり（ピースワイズ関数） | なし |
| ルミナンス係数 | Rec.709 (0.2126, 0.7152, 0.0722) | 混在 |
| シャドウ/ハイライト | smoothstepマスク | 線形補間 |
| Temperature/Tint | リニア空間で適用 | sRGB空間で適用 |

## 改善内容

### 1. sRGB ↔ リニア変換関数の追加

```glsl
// sRGB → リニア変換
vec3 sRGBToLinear(vec3 srgb) {
    // ピースワイズ関数（正確な変換）
    vec3 linearLow = srgb / 12.92;
    vec3 linearHigh = pow((srgb + 0.055) / 1.055, vec3(2.4));
    return mix(linearLow, linearHigh, step(vec3(0.04045), srgb));
}

// リニア → sRGB変換
vec3 linearToSRGB(vec3 linear) {
    // ピースワイズ関数（正確な変換）
    vec3 srgbLow = linear * 12.92;
    vec3 srgbHigh = 1.055 * pow(linear, vec3(1.0/2.4)) - 0.055;
    return mix(srgbLow, srgbHigh, step(vec3(0.0031308), linear));
}
```

### 2. ルミナンス計算の統一

```glsl
// Rec.709係数に統一
float getLuminance(vec3 color) {
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
}
```

### 3. シャドウ/ハイライト処理の改善

```glsl
// smoothstepマスクを使用
float generateTonalMask(float luma, float center, float width) {
    float distance = abs(luma - center);
    float t = clamp(1.0 - distance / width, 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);  // smoothstep
}

vec3 applyTonalCorrection(vec3 color, float shadows, float highlights) {
    float luma = getLuminance(color);
    
    // シャドウマスク: luma=0で最大、0.5で0
    float shadowMask = shadows != 0.0 ? generateTonalMask(luma, 0.0, 0.5) : 0.0;
    
    // ハイライトマスク: luma=1で最大、0.5で0
    float highlightMask = highlights != 0.0 ? generateTonalMask(luma, 1.0, 0.5) : 0.0;
    
    // 調整値を計算（-100〜100 → -0.2〜0.2）
    float shadowLift = (shadows / 100.0) * 0.2 * shadowMask;
    float highlightLift = (highlights / 100.0) * 0.2 * highlightMask;
    
    return color + shadowLift + highlightLift;
}
```

### 4. 処理順序の統一

```
1. sRGBToLinear      ← 追加
2. Exposure
3. Brightness
4. Contrast
5. Saturation
6. Gamma
7. Temperature/Tint
8. Shadows/Highlights
9. linearToSRGB      ← 追加
```

## 対象ファイル

1. `apps/desktop-electron/src/renderer/nodes/webgl-color-processor.ts`
   - `createProgram()` メソッドのフラグメントシェーダーを更新

2. `apps/desktop-electron/src/renderer/nodes/webgl-video-processor.ts`
   - `getFragmentShaderSource()` メソッドのフラグメントシェーダーを更新

## パフォーマンス考慮事項

- 現代のGPUでは `pow()` 演算は効率的に処理される
- `mix()` と `step()` を使ったブランチレス実装でパフォーマンスを維持
- リアルタイム動画プレビューでも問題ないレベル

## テスト計画

1. 画像読み込み → Color Correction → Media Preview で確認
2. 動画読み込み → Color Correction → Media Preview で確認
3. 画像と動画で同じパラメータを適用し、見た目が一致することを確認
4. スライダー操作のスムーズさを確認
5. エクスポート結果との一致を確認

## 作成日
2024-12-04
