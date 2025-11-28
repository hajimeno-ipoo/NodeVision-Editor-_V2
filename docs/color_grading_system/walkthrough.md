# カラーグレーディングシステム - 実装ウォークスルー

このドキュメントでは、3D LUTベースのカラーグレーディングシステムの実装の詳細を説明します。

---

## 1. アーキテクチャ概要

### 1.1 データフロー

```
┌─────────────────────────────────────────────────────────────┐
│                    ユーザー操作                              │
│  (スライダー、カラーホイール、カーブエディタ)                  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              カラーグレーディングパラメータ                    │
│  { exposure, contrast, wheels, curves, ... }                │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  3D LUT生成エンジン                          │
│  各RGB入力値に対してカラー変換を適用                          │
│  → Float32Array (33³ × 3 = 107,811 values)                  │
└────────────┬───────────────────────┬────────────────────────┘
             │                       │
             ▼                       ▼
┌──────────────────────┐   ┌──────────────────────────────┐
│  WebGL2プレビュー     │   │  FFmpeg書き出し               │
│  3Dテクスチャとして   │   │  .cubeファイルとして          │
│  GPUに転送            │   │  一時ファイルに保存           │
│  ↓                    │   │  ↓                            │
│  フラグメント         │   │  ffmpeg -vf lut3d=file.cube  │
│  シェーダーで適用     │   │                              │
└──────────────────────┘   └──────────────────────────────┘
```

### 1.2 主要コンポーネント

# Color Grading System Implementation Walkthrough

## Phase 1: Core Implementation & Legacy Node Migration (Completed)

### 1. New Package Structure (`packages/color-grading`)
- **Entry Point**: `src/index.ts`
- **Types**: `src/lut/types.ts`, `src/primary/types.ts`, `src/processors/types.ts`
- **Core Logic**:
  - `src/lut/generator.ts`: 3D LUT generation engine
  - `src/lut/exporter.ts`: .cube file exporter
  - `src/processors/color-math.ts`: Color space conversions
  - `src/processors/pipeline.ts`: Color grading pipeline builder
  - `src/primary/basic.ts`: Basic corrections (exposure, contrast, etc.)
  - `src/primary/temperature.ts`: White balance
  - `src/primary/tonal.ts`: Shadows/Midtones/Highlights

### 2. Renderer Integration (`apps/desktop-electron`)
- **WebGL LUT Processor**: `src/renderer/nodes/webgl-lut-processor.ts`
  - Implements WebGL 2.0 3D Texture rendering
  - Handles dynamic LUT updates
- **Node Renderer**: `src/renderer/nodes/color-correction.ts`
  - Updated to use `WebGLLUTProcessor` when available
  - Falls back to WebGL 1.0 or Canvas 2D
  - Generates LUTs on-the-fly based on slider values

### 3. FFmpeg Integration (`packages/engine` & `apps/desktop-electron`)
- **Plan Builder**: `packages/engine/src/ffmpeg/builder.ts`
  - Adds `lut3d_generator` stage for color correction nodes
- **Export Execution**: `apps/desktop-electron/src/main.ts`
  - Detects `lut3d_generator` stage
  - Generates .cube file to temporary directory
  - Applies `lut3d` filter in FFmpeg command

---

## Phase 2: Advanced Features (Next)
| コンポーネント | 責任 | 場所 |
|--------------|------|------|
| **LUT Generator** | パラメータからLUT生成 | `packages/color-grading/src/lut/generator.ts` |
| **Color Pipeline** | 補正処理の統合 | `packages/color-grading/src/processors/pipeline.ts` |
| **WebGL Renderer** | リアルタイムプレビュー | `apps/desktop-electron/src/renderer/nodes/webgl-lut-processor.ts` |
| **FFmpeg Builder** | 書き出し統合 | `packages/engine/src/ffmpeg/builder.ts` |
| **UI Components** | ユーザーインターフェース | `apps/desktop-electron/src/renderer/components/` |

---

## 2. LUT生成エンジンの詳細

### 2.1 基本原理

3D LUTは、入力RGB値を出力RGB値にマッピングするルックアップテーブルです。

**例**: 33³ LUTの場合
- 33 × 33 × 33 = 35,937 個のRGBエントリ
- 各エントリは3つの浮動小数点数（R, G, B）
- 合計: 35,937 × 3 = 107,811 値

### 2.2 実装詳細

```typescript
// packages/color-grading/src/lut/generator.ts

export function generateLUT3D(
  resolution: LUTResolution,
  pipeline: ColorGradingPipeline
): LUT3D {
  const size = resolution ** 3 * 3;
  const data = new Float32Array(size);
  
  // カラー変換関数をパイプラインから構築
  const colorTransform = buildColorTransform(pipeline);
  
  // 全RGB組み合わせをイテレート
  for (let b = 0; b < resolution; b++) {
    for (let g = 0; g < resolution; g++) {
      for (let r = 0; r < resolution; r++) {
        // インデックス計算: (r, g, b) → 1次元配列位置
        const index = (r + g * resolution + b * resolution * resolution) * 3;
        
        // 正規化 (0 ~ resolution-1 → 0.0 ~ 1.0)
        const normR = r / (resolution - 1);
        const normG = g / (resolution - 1);
        const normB = b / (resolution - 1);
        
        // カラー変換適用
        const [outR, outG, outB] = colorTransform(normR, normG, normB);
        
        // クランプ (0.0 ~ 1.0 範囲内に収める)
        data[index] = Math.max(0, Math.min(1, outR));
        data[index + 1] = Math.max(0, Math.min(1, outG));
        data[index + 2] = Math.max(0, Math.min(1, outB));
      }
    }
  }
  
  return { resolution, data };
}
```

### 2.3 最適化戦略

**メモリ最適化**:
```typescript
// 解像度を動的に選択
const resolution = isPreview ? 17 : (isExport && highQuality) ? 65 : 33;
```

**キャッシング**:
```typescript
const lutCache = new Map<string, LUT3D>();

function getCachedLUT(settingsHash: string, pipeline: ColorGradingPipeline): LUT3D {
  if (lutCache.has(settingsHash)) {
    return lutCache.get(settingsHash)!;
  }
  
  const lut = generateLUT3D(33, pipeline);
  lutCache.set(settingsHash, lut);
  
  // キャッシュサイズ制限
  if (lutCache.size > 10) {
    const firstKey = lutCache.keys().next().value;
    lutCache.delete(firstKey);
  }
  
  return lut;
}
```

---

## 3. カラー処理パイプライン

### 3.1 処理順序

カラーグレーディングの処理順序は結果に大きく影響します。以下の順序を推奨:

1. **入力線形化** (Gamma → Linear)
2. **色温度/ティント**
3. **Exposure**
4. **Contrast**
5. **Lift/Gamma/Gain** (カラーホイール)
6. **RGBカーブ**
7. **Saturation**
8. **Hueカーブ**
9. **セカンダリーグレーディング**
10. **出力ガンマ補正** (Linear → sRGB)

### 3.2 パイプライン実装

```typescript
// packages/color-grading/src/processors/pipeline.ts

export function buildColorTransform(
  pipeline: ColorGradingPipeline
): ColorTransformFunction {
  return (r: number, g: number, b: number): [number, number, number] => {
    // 1. 入力線形化 (sRGB → Linear)
    [r, g, b] = sRGBToLinear(r, g, b);
    
    // 2. 色温度/ティント
    if (pipeline.temperature !== undefined || pipeline.tint !== undefined) {
      [r, g, b] = applyTemperatureAndTint(r, g, b, pipeline.temperature ?? 0, pipeline.tint ?? 0);
    }
    
    // 3. Exposure
    if (pipeline.basic?.exposure) {
      const factor = Math.pow(2, pipeline.basic.exposure);
      r *= factor;
      g *= factor;
      b *= factor;
    }
    
    // 4. Contrast
    if (pipeline.basic?.contrast !== undefined && pipeline.basic.contrast !== 1) {
      const c = pipeline.basic.contrast;
      r = (r - 0.5) * c + 0.5;
      g = (g - 0.5) * c + 0.5;
      b = (b - 0.5) * c + 0.5;
    }
    
    // 5. Lift/Gamma/Gain
    if (pipeline.wheels) {
      [r, g, b] = applyColorWheels(r, g, b, pipeline.wheels);
    }
    
    // 6. RGBカーブ
    if (pipeline.rgbCurves) {
      // Masterカーブ
      r = evaluateCurve(pipeline.rgbCurves.master, r);
      g = evaluateCurve(pipeline.rgbCurves.master, g);
      b = evaluateCurve(pipeline.rgbCurves.master, b);
      
      // 個別チャンネル
      r = evaluateCurve(pipeline.rgbCurves.red, r);
      g = evaluateCurve(pipeline.rgbCurves.green, g);
      b = evaluateCurve(pipeline.rgbCurves.blue, b);
    }
    
    // 7. Saturation
    if (pipeline.basic?.saturation !== undefined && pipeline.basic.saturation !== 1) {
      const [h, s, l] = rgbToHSL(r, g, b);
      const newS = s * pipeline.basic.saturation;
      [r, g, b] = hslToRGB(h, newS, l);
    }
    
    // 8. Hueカーブ
    if (pipeline.hueCurves) {
      [r, g, b] = applyHueCurves(r, g, b, pipeline.hueCurves);
    }
    
    // 9. セカンダリーグレーディング
    if (pipeline.secondary && pipeline.secondary.length > 0) {
      [r, g, b] = applySecondaryGrading(r, g, b, pipeline.secondary);
    }
    
    // 10. 出力ガンマ補正 (Linear → sRGB)
    [r, g, b] = linearToSRGB(r, g, b);
    
    return [r, g, b];
  };
}
```

### 3.3 色空間変換

**sRGB ↔︎ Linear変換**:
```typescript
export function sRGBToLinear(r: number, g: number, b: number): [number, number, number] {
  const toLinear = (c: number): number => {
    if (c <= 0.04045) {
      return c / 12.92;
    } else {
      return Math.pow((c + 0.055) / 1.055, 2.4);
    }
  };
  
  return [toLinear(r), toLinear(g), toLinear(b)];
}

export function linearToSRGB(r: number, g: number, b: number): [number, number, number] {
  const toSRGB = (c: number): number => {
    if (c <= 0.0031308) {
      return c * 12.92;
    } else {
      return 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    }
  };
  
  return [toSRGB(r), toSRGB(g), toSRGB(b)];
}
```

**RGB ↔︎ HSL変換**:
```typescript
export function rgbToHSL(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  
  if (max === min) {
    return [0, 0, l]; // グレースケール
  }
  
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  
  let h = 0;
  if (max === r) {
    h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  } else if (max === g) {
    h = ((b - r) / d + 2) / 6;
  } else {
    h = ((r - g) / d + 4) / 6;
  }
  
  return [h * 360, s, l];
}

export function hslToRGB(h: number, s: number, l: number): [number, number, number] {
  h = h / 360; // 0-1範囲に正規化
  
  if (s === 0) {
    return [l, l, l]; // グレースケール
  }
  
  const hue2rgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  
  const r = hue2rgb(p, q, h + 1/3);
  const g = hue2rgb(p, q, h);
  const b = hue2rgb(p, q, h - 1/3);
  
  return [r, g, b];
}
```

---

## 4. Lift/Gamma/Gain実装

### 4.1 理論

DaVinci Resolveのカラーホイールと同様の動作:

- **Lift**: 暗部（シャドウ）の色を調整
- **Gamma**: 中間調（ミッドトーン）の色を調整
- **Gain**: 明部（ハイライト）の色を調整

### 4.2 実装

```typescript
// packages/color-grading/src/primary/wheels.ts

export function applyColorWheels(
  r: number,
  g: number,
  b: number,
  wheels: ColorWheels
): [number, number, number] {
  // 輝度計算（トーンマスク用）
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  
  // Lift (Shadows)
  if (wheels.lift) {
    const liftColor = hueToRGB(wheels.lift.hue, wheels.lift.saturation);
    const liftAmount = wheels.lift.luminance;
    
    // シャドウマスク: 暗いほど強く適用
    const shadowMask = 1 - luma;
    
    r += liftColor[0] * liftAmount * shadowMask;
    g += liftColor[1] * liftAmount * shadowMask;
    b += liftColor[2] * liftAmount * shadowMask;
  }
  
  // Gamma (Midtones)
  if (wheels.gamma) {
    const gammaColor = hueToRGB(wheels.gamma.hue, wheels.gamma.saturation);
    const gammaAmount = wheels.gamma.luminance;
    
    // ミッドトーンマスク: 中間調で最大
    const midtoneMask = 1 - Math.abs(luma - 0.5) * 2;
    
    const factor = 1 + gammaAmount * midtoneMask;
    r *= factor * (1 + gammaColor[0] - 0.5);
    g *= factor * (1 + gammaColor[1] - 0.5);
    b *= factor * (1 + gammaColor[2] - 0.5);
  }
  
  // Gain (Highlights)
  if (wheels.gain) {
    const gainColor = hueToRGB(wheels.gain.hue, wheels.gain.saturation);
    const gainAmount = wheels.gain.luminance;
    
    // ハイライトマスク: 明るいほど強く適用
    const highlightMask = luma;
    
    const factor = 1 + gainAmount * highlightMask;
    r *= factor * (1 + gainColor[0] - 0.5);
    g *= factor * (1 + gainColor[1] - 0.5);
    b *= factor * (1 + gainColor[2] - 0.5);
  }
  
  return [r, g, b];
}

function hueToRGB(hue: number, saturation: number): [number, number, number] {
  // Hue (0-360) を RGB に変換
  const h = hue / 60;
  const c = saturation;
  const x = c * (1 - Math.abs(h % 2 - 1));
  
  let r = 0, g = 0, b = 0;
  
  if (h >= 0 && h < 1) {
    [r, g, b] = [c, x, 0];
  } else if (h >= 1 && h < 2) {
    [r, g, b] = [x, c, 0];
  } else if (h >= 2 && h < 3) {
    [r, g, b] = [0, c, x];
  } else if (h >= 3 && h < 4) {
    [r, g, b] = [0, x, c];
  } else if (h >= 4 && h < 5) {
    [r, g, b] = [x, 0, c];
  } else {
    [r, g, b] = [c, 0, x];
  }
  
  return [r, g, b];
}
```

---

## 5. カーブエディタ実装

### 5.1 Catmull-Romスプライン補間

```typescript
// packages/color-grading/src/curves/curve-math.ts

export function evaluateCurve(curve: Curve, x: number): number {
  // エッジケース
  if (curve.length === 0) return x; // 恒等関数
  if (curve.length === 1) return curve[0].y;
  
  // ソート確認（x昇順）
  const sortedCurve = [...curve].sort((a, b) => a.x - b.x);
  
  // xの範囲外処理
  if (x <= sortedCurve[0].x) return sortedCurve[0].y;
  if (x >= sortedCurve[sortedCurve.length - 1].x) {
    return sortedCurve[sortedCurve.length - 1].y;
  }
  
  // xが含まれるセグメント検索
  let i = 0;
  while (i < sortedCurve.length - 1 && sortedCurve[i + 1].x < x) {
    i++;
  }
  
  // Catmull-Rom補間のための4点取得
  const p0 = sortedCurve[Math.max(0, i - 1)];
  const p1 = sortedCurve[i];
  const p2 = sortedCurve[i + 1];
  const p3 = sortedCurve[Math.min(sortedCurve.length - 1, i + 2)];
  
  // 正規化されたt (0-1)
  const t = (x - p1.x) / (p2.x - p1.x);
  
  // Catmull-Rom基底関数
  const t2 = t * t;
  const t3 = t2 * t;
  
  const v0 = p0.y;
  const v1 = p1.y;
  const v2 = p2.y;
  const v3 = p3.y;
  
  const y = 0.5 * (
    (2 * v1) +
    (-v0 + v2) * t +
    (2 * v0 - 5 * v1 + 4 * v2 - v3) * t2 +
    (-v0 + 3 * v1 - 3 * v2 + v3) * t3
  );
  
  return Math.max(0, Math.min(1, y)); // クランプ
}
```

### 5.2 カーブUI実装

```typescript
// apps/desktop-electron/src/renderer/components/curve-editor.ts

export class CurveEditor {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private curve: Curve = [
    { x: 0, y: 0 },
    { x: 1, y: 1 }
  ];
  private selectedPoint: number | null = null;
  
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    
    this.setupEventListeners();
    this.render();
  }
  
  private setupEventListeners() {
    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.canvas.addEventListener('mouseup', () => this.onMouseUp());
    this.canvas.addEventListener('dblclick', (e) => this.onDoubleClick(e));
  }
  
  private onMouseDown(e: MouseEvent) {
    const pos = this.getCanvasPos(e);
    
    // ポイント選択
    this.selectedPoint = this.findNearestPoint(pos.x, pos.y);
  }
  
  private onMouseMove(e: MouseEvent) {
    if (this.selectedPoint === null) return;
    
    const pos = this.getCanvasPos(e);
    
    // ポイント移動（最初と最後は固定）
    if (this.selectedPoint > 0 && this.selectedPoint < this.curve.length - 1) {
      this.curve[this.selectedPoint].x = Math.max(0, Math.min(1, pos.x));
      this.curve[this.selectedPoint].y = Math.max(0, Math.min(1, pos.y));
      
      this.render();
      this.triggerChange();
    }
  }
  
  private onDoubleClick(e: MouseEvent) {
    const pos = this.getCanvasPos(e);
    
    // 新しいポイント追加
    this.curve.push({ x: pos.x, y: pos.y });
    this.curve.sort((a, b) => a.x - b.x);
    
    this.render();
    this.triggerChange();
  }
  
  private render() {
    const { width, height } = this.canvas;
    this.ctx.clearRect(0, 0, width, height);
    
    // グリッド描画
    this.drawGrid();
    
    // カーブ描画
    this.drawCurve();
    
    // ポイント描画
    this.drawPoints();
  }
  
  private drawCurve() {
    const { width, height } = this.canvas;
    this.ctx.beginPath();
    this.ctx.strokeStyle = '#00ff00';
    this.ctx.lineWidth = 2;
    
    // 滑らかなカーブを描画
    for (let i = 0; i <= 100; i++) {
      const x = i / 100;
      const y = evaluateCurve(this.curve, x);
      
      const canvasX = x * width;
      const canvasY = (1 - y) * height; // Y軸反転
      
      if (i === 0) {
        this.ctx.moveTo(canvasX, canvasY);
      } else {
        this.ctx.lineTo(canvasX, canvasY);
      }
    }
    
    this.ctx.stroke();
  }
  
  private drawPoints() {
    const { width, height } = this.canvas;
    
    this.curve.forEach((point, index) => {
      const x = point.x * width;
      const y = (1 - point.y) * height;
      
      this.ctx.beginPath();
      this.ctx.arc(x, y, 5, 0, 2 * Math.PI);
      this.ctx.fillStyle = index === this.selectedPoint ? '#ff0000' : '#ffffff';
      this.ctx.fill();
      this.ctx.strokeStyle = '#000000';
      this.ctx.stroke();
    });
  }
  
  private getCanvasPos(e: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = 1 - (e.clientY - rect.top) / rect.height; // Y軸反転
    
    return { x, y };
  }
  
  private findNearestPoint(x: number, y: number): number | null {
    const threshold = 0.05; // 5%以内
    
    for (let i = 0; i < this.curve.length; i++) {
      const dx = this.curve[i].x - x;
      const dy = this.curve[i].y - y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < threshold) {
        return i;
      }
    }
    
    return null;
  }
  
  private triggerChange() {
    this.canvas.dispatchEvent(new CustomEvent('curvechange', {
      detail: { curve: this.curve }
    }));
  }
}
```

---

## 6. WebGL統合

### 6.1 WebGL2シェーダー

**頂点シェーダー**:
```glsl
#version 300 es
in vec2 a_position;
in vec2 a_texCoord;
out vec2 v_texCoord;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
```

**フラグメントシェーダー**:
```glsl
#version 300 es
precision highp float;
precision highp sampler3D;

uniform sampler2D u_image;
uniform sampler3D u_lut;
uniform float u_lutSize;

in vec2 v_texCoord;
out vec4 fragColor;

void main() {
  vec4 color = texture(u_image, v_texCoord);
  
  // LUT座標計算（正確なサンプリング）
  vec3 scale = vec3((u_lutSize - 1.0) / u_lutSize);
  vec3 offset = vec3(0.5 / u_lutSize);
  vec3 lutCoord = color.rgb * scale + offset;
  
  // 3D LUTサンプリング
  vec3 graded = texture(u_lut, lutCoord).rgb;
  
  fragColor = vec4(graded, color.a);
}
```

### 6.2 WebGL2実装

```typescript
// apps/desktop-electron/src/renderer/nodes/webgl-lut-processor.ts

export class WebGLLUTProcessor {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private lut3DTexture: WebGLTexture | null = null;
  
  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2');
    if (!gl) {
      throw new Error('WebGL2 not supported');
    }
    this.gl = gl;
    this.program = this.createProgram();
  }
  
  loadLUT(lut: LUT3D): void {
    const { gl } = this;
    
    // 3Dテクスチャ作成
    if (!this.lut3DTexture) {
      this.lut3DTexture = gl.createTexture();
    }
    
    gl.bindTexture(gl.TEXTURE_3D, this.lut3DTexture);
    
    // テクスチャパラメータ
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    
    // データアップロード
    const size = lut.resolution;
    gl.texImage3D(
      gl.TEXTURE_3D,
      0,                    // level
      gl.RGB32F,            // internal format
      size, size, size,     // width, height, depth
      0,                    // border
      gl.RGB,               // format
      gl.FLOAT,             // type
      lut.data              // pixels
    );
  }
  
  render(inputTexture: WebGLTexture): void {
    const { gl } = this;
    
    gl.useProgram(this.program);
    
    // 入力画像テクスチャ
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, inputTexture);
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_image'), 0);
    
    // LUT 3Dテクスチャ
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, this.lut3DTexture);
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_lut'), 1);
    
    // LUTサイズ
    gl.uniform1f(
      gl.getUniformLocation(this.program, 'u_lutSize'),
      this.currentLUTSize
    );
    
    // フルスクリーンクワッド描画
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
```

---

## 7. FFmpeg統合

### 7.1 CUBE形式エクスポート

```typescript
// packages/color-grading/src/lut/exporter.ts

export function exportCubeLUT(
  lut: LUT3D,
  metadata: Partial<LUTMetadata> = {}
): string {
  const { resolution, data } = lut;
  const title = metadata.title || 'NodeVision LUT';
  
  let output = `TITLE "${title}"\n`;
  output += `LUT_3D_SIZE ${resolution}\n`;
  output += `DOMAIN_MIN 0.0 0.0 0.0\n`;
  output += `DOMAIN_MAX 1.0 1.0 1.0\n\n`;
  
  // データ出力 (R, G, B per line)
  for (let i = 0; i < data.length; i += 3) {
    const r = data[i].toFixed(6);
    const g = data[i + 1].toFixed(6);
    const b = data[i + 2].toFixed(6);
    output += `${r} ${g} ${b}\n`;
  }
  
  return output;
}
```

### 7.2 FFmpegビルダー統合

```typescript
// packages/engine/src/ffmpeg/builder.ts (更新)

import { generateLUT3D, exportCubeLUT } from '@nodevision/color-grading';

// ... 既存コード ...

if (stage.typeId === 'primaryGrading' || stage.typeId === 'curves') {
  // 1. パイプライン構築
  const pipeline = buildPipelineFromSettings(stage.settings);
  
  // 2. LUT生成
  const lut = generateLUT3D(33, pipeline);
  
  // 3. .cubeファイルとして保存
  const lutPath = path.join(tempRoot, `lut-${stage.id}.cube`);
  const cubeContent = exportCubeLUT(lut, { title: stage.title });
  await fs.writeFile(lutPath, cubeContent, 'utf-8');
  
  // 4. FFmpegフィルターチェーンに追加
  const nextLabel = `tmp${filterChain.length}`;
  filterChain.push(`[${lastLabel}]lut3d=file='${lutPath}'[${nextLabel}]`);
  lastLabel = nextLabel;
}
```

---

## 8. パフォーマンス最適化

### 8.1 差分更新

```typescript
class LUTManager {
  private lastPipeline: string = '';
  private cachedLUT: LUT3D | null = null;
  
  getLUT(pipeline: ColorGradingPipeline): LUT3D {
    const pipelineHash = JSON.stringify(pipeline);
    
    if (pipelineHash === this.lastPipeline && this.cachedLUT) {
      return this.cachedLUT;
    }
    
    this.cachedLUT = generateLUT3D(33, pipeline);
    this.lastPipeline = pipelineHash;
    
    return this.cachedLUT;
  }
}
```

### 8.2 Worker化（将来の拡張）

```typescript
// lut-worker.ts
self.addEventListener('message', (e) => {
  const { resolution, pipeline } = e.data;
  
  const lut = generateLUT3D(resolution, pipeline);
  
  self.postMessage({ lut }, [lut.data.buffer]);
});

// メインスレッド
const worker = new Worker('lut-worker.js');
worker.postMessage({ resolution: 33, pipeline });
worker.addEventListener('message', (e) => {
  const lut = e.data.lut;
  webglProcessor.loadLUT(lut);
});
```

---

## 9. テスト戦略

### 9.1 LUT生成精度テスト

```typescript
describe('LUT Generator', () => {
  it('should generate identity LUT (pass-through)', () => {
    const lut = generateLUT3D(17, (r, g, b) => [r, g, b]);
    
    // チェック: 各色が変化していないこと
    for (let i = 0; i < lut.data.length; i += 3) {
      const expected = (i / 3) / (17 ** 3 - 1);
      expect(lut.data[i]).toBeCloseTo(expected, 4);
    }
  });
  
  it('should apply brightness correctly', () => {
    const brightness = 0.1;
    const pipeline = { basic: { brightness } };
    const lut = generateLUT3D(17, buildColorTransform(pipeline));
    
    // 中央の値をチェック
    const midIndex = (17 ** 3 / 2) * 3;
    const expected = 0.5 + brightness;
    expect(lut.data[midIndex]).toBeCloseTo(expected, 4);
  });
});
```

### 9.2 プレビューと書き出しの一致検証

```typescript
describe('Preview vs Export consistency', () => {
  it('should match WebGL and FFmpeg output', async () => {
    const testImage = loadTestImage('test-pattern.png');
    const pipeline = createTestPipeline();
    
    // WebGLプレビュー
    const webglOutput = await renderWithWebGL(testImage, pipeline);
    
    // FFmpeg書き出し
    const ffmpegOutput = await exportWithFFmpeg(testImage, pipeline);
    
    // ピクセル比較（許容誤差: 1/255）
    const diff = compareImages(webglOutput, ffmpegOutput);
    expect(diff.maxError).toBeLessThan(1 / 255);
    expect(diff.avgError).toBeLessThan(0.5 / 255);
  });
});
```

---

## 10. 次のステップ

1. **Phase 1タスク開始**: 
   - `packages/color-grading` パッケージ作成
   - LUT生成エンジンのプロトタイプ実装

2. **動作検証**:
   - 簡単なパススルーLUTでWebGL表示確認
   - FFmpegでの.cube読み込み確認

3. **段階的機能追加**:
   - 基本補正 → カラーホイール → カーブ → セカンダリー

この詳細な実装ウォークスルーに従うことで、プロフェッショナルレベルのカラーグレーディングシステムを構築できます。
