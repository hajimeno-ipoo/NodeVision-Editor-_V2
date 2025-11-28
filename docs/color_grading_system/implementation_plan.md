# カラーグレーディングシステム実装計画

## 概要

DaVinci Resolveスタイルのノードベースカラーグレーディングシステムを3D LUT方式で実装します。プレビューと書き出しの完全な一致を保証し、プロフェッショナルレベルのカラーグレーディング機能を提供します。

## アーキテクチャ設計

### 全体フロー

```
[カラー補正パラメータ]
    ↓
[3D LUT生成エンジン]
    ↓
    ├─→ [WebGL2プレビュー: 3D LUTテクスチャ適用]
    ├─→ [FFmpeg書き出し: lut3d フィルター]
    └─→ [.cube/.3dl エクスポート]
```

### モジュール構成

```
packages/
├── color-grading/          # 新規パッケージ
│   ├── src/
│   │   ├── lut/
│   │   │   ├── generator.ts        # LUT生成エンジン
│   │   │   ├── parser.ts           # .cube/.3dl パーサー
│   │   │   ├── exporter.ts         # .cube/.3dl エクスポーター
│   │   │   └── types.ts            # LUT関連型定義
│   │   ├── primary/
│   │   │   ├── basic.ts            # 基本補正（明るさ、コントラスト等）
│   │   │   ├── wheels.ts           # カラーホイール（Lift/Gamma/Gain）
│   │   │   └── temperature.ts      # 色温度/ティント
│   │   ├── curves/
│   │   │   ├── rgb-curves.ts       # RGBカーブ
│   │   │   ├── hue-curves.ts       # Hue vs Sat/Hue
│   │   │   └── curve-math.ts       # カーブ計算ユーティリティ
│   │   ├── secondary/
│   │   │   ├── hsl-key.ts          # HSLキー
│   │   │   ├── luma-key.ts         # ルミナンスキー
│   │   │   └── masking.ts          # マスク計算
│   │   ├── processors/
│   │   │   ├── pipeline.ts         # 処理パイプライン統合
│   │   │   └── color-math.ts       # 色空間変換
│   │   └── index.ts
│   └── package.json
├── editor/
│   └── src/
│       └── templates.ts            # ノードテンプレート定義更新
└── engine/
    └── src/
        └── ffmpeg/
            └── builder.ts           # FFmpeg統合更新
```

## 機能実装ロードマップ

### Phase 1: 基盤構築 (Week 1-2)

#### 1.1 新規パッケージ作成
- **タスク**: `packages/color-grading` パッケージ作成
- **ファイル**:
  - `package.json`
  - `tsconfig.json`
  - `src/index.ts`
  
#### 1.2 LUT生成エンジン
- **ファイル**: `packages/color-grading/src/lut/generator.ts`
- **機能**:
  - 3D LUT生成（17³, 33³, 65³ サイズ対応）
  - カラー補正パイプラインの適用
  - Float32Array形式での出力

```typescript
export interface LUTGeneratorOptions {
  resolution: 17 | 33 | 65;
  pipeline: ColorGradingPipeline;
}

export function generateLUT3D(options: LUTGeneratorOptions): Float32Array
```

#### 1.3 LUTパーサー/エクスポーター
- **ファイル**: 
  - `packages/color-grading/src/lut/parser.ts`
  - `packages/color-grading/src/lut/exporter.ts`
- **機能**:
  - .cube 形式の読み込み/書き込み
  - .3dl 形式の読み込み/書き込み
  - バリデーション

### Phase 2: プライマリーカラーコレクション (Week 3-4)

#### 2.1 基本補正実装
- **ファイル**: `packages/color-grading/src/primary/basic.ts`
- **パラメータ**:
  ```typescript
  interface BasicCorrection {
    brightness: number;     // -1.0 ~ 1.0
    contrast: number;       // 0.0 ~ 3.0
    saturation: number;     // 0.0 ~ 3.0
    gamma: number;          // 0.1 ~ 3.0
    exposure: number;       // -3.0 ~ 3.0 (EV)
  }
  ```

#### 2.2 トーン別調整
- **ファイル**: `packages/color-grading/src/primary/tonal.ts`
- **パラメータ**:
  ```typescript
  interface TonalCorrection {
    shadows: number;        // -100 ~ 100
    midtones: number;       // -100 ~ 100
    highlights: number;     // -100 ~ 100
  }
  ```

#### 2.3 色温度/ティント
- **ファイル**: `packages/color-grading/src/primary/temperature.ts`
- **機能**:
  - ケルビン値ベースの色温度調整 (2000K ~ 10000K)
  - グリーン/マゼンタティント調整
  - RGB係数マトリックス変換

#### 2.4 カラーホイール (Lift/Gamma/Gain)
- **ファイル**: `packages/color-grading/src/primary/wheels.ts`
- **パラメータ**:
  ```typescript
  interface ColorWheels {
    lift: {
      hue: number;          // 0 ~ 360
      saturation: number;   // 0.0 ~ 1.0
      luminance: number;    // -1.0 ~ 1.0
    };
    gamma: {
      hue: number;
      saturation: number;
      luminance: number;
    };
    gain: {
      hue: number;
      saturation: number;
      luminance: number;
    };
  }
  ```

### Phase 3: カーブエディタ (Week 5-6)

#### 3.1 RGBカーブ
- **ファイル**: `packages/color-grading/src/curves/rgb-curves.ts`
- **機能**:
  - Master カーブ（全チャンネル）
  - Red チャンネルカーブ
  - Green チャンネルカーブ
  - Blue チャンネルカーブ
  - カーブポイント管理（追加/削除/移動）

```typescript
interface CurvePoint {
  x: number;  // 入力値 0.0 ~ 1.0
  y: number;  // 出力値 0.0 ~ 1.0
}

interface RGBCurves {
  master: CurvePoint[];
  red: CurvePoint[];
  green: CurvePoint[];
  blue: CurvePoint[];
}
```

#### 3.2 Hueカーブ
- **ファイル**: `packages/color-grading/src/curves/hue-curves.ts`
- **機能**:
  - Hue vs Sat（特定の色相の彩度調整）
  - Hue vs Hue（色相シフト）
  - Hue vs Luma（特定色相の明度調整）

#### 3.3 カーブ補間
- **ファイル**: `packages/color-grading/src/curves/curve-math.ts`
- **アルゴリズム**:
  - Catmull-Rom スプライン補間
  - LUTへの効率的な変換

### Phase 4: セカンダリーカラーコレクション (Week 7-8)

#### 4.1 HSLキー
- **ファイル**: `packages/color-grading/src/secondary/hsl-key.ts`
- **パラメータ**:
  ```typescript
  interface HSLKey {
    hueCenter: number;      // 0 ~ 360
    hueRange: number;       // 0 ~ 180
    satCenter: number;      // 0.0 ~ 1.0
    satRange: number;       // 0.0 ~ 1.0
    lumaCenter: number;     // 0.0 ~ 1.0
    lumaRange: number;      // 0.0 ~ 1.0
    softness: number;       // 0.0 ~ 1.0 (フェザー)
  }
  ```

#### 4.2 ルミナンスキー
- **ファイル**: `packages/color-grading/src/secondary/luma-key.ts`
- **機能**:
  - 輝度範囲選択
  - ソフトエッジ処理
  - プレビューマスク表示

#### 4.3 マスキングシステム
- **ファイル**: `packages/color-grading/src/secondary/masking.ts`
- **機能**:
  - アルファマスク生成
  - マスク合成（AND/OR/NOT）
  - スピル除去

### Phase 5: UI実装 (Week 9-10)

#### 5.1 ノードテンプレート更新
- **ファイル**: `packages/editor/src/templates.ts`
- **新規ノード**:
  ```typescript
  {
    typeId: 'primaryGrading',
    title: 'Primary Grading',
    category: 'Color',
    // ...
  },
  {
    typeId: 'curves',
    title: 'Curves',
    category: 'Color',
    // ...
  },
  {
    typeId: 'secondaryGrading',
    title: 'Secondary Grading',
    category: 'Color',
    // ...
  },
  {
    typeId: 'lutLoader',
    title: 'LUT Loader',
    category: 'Color',
    // ...
  }
  ```

#### 5.2 カラーホイールUI
- **ファイル**: `apps/desktop-electron/src/renderer/components/color-wheel.ts`
- **機能**:
  - SVG円形カラーピッカー
  - Lift/Gamma/Gain 切り替え
  - リアルタイムプレビュー

#### 5.3 カーブエディタUI
- **ファイル**: `apps/desktop-electron/src/renderer/components/curve-editor.ts`
- **機能**:
  - Canvas ベースのカーブ描画
  - ポイント追加/削除/ドラッグ
  - チャンネル切り替え（Master/R/G/B）

### Phase 6: WebGL統合 (Week 11)

#### 6.1 WebGL2 3Dテクスチャ実装
- **ファイル**: `apps/desktop-electron/src/renderer/nodes/webgl-lut-processor.ts`
- **機能**:
  - WebGL2コンテキスト取得
  - 3D テクスチャ作成とアップロード
  - フラグメントシェーダーでのLUT適用

```glsl
#version 300 es
precision highp float;
precision highp sampler3D;

uniform sampler2D u_image;
uniform sampler3D u_lut;
in vec2 v_texCoord;
out vec4 fragColor;

void main() {
  vec4 color = texture(u_image, v_texCoord);
  vec3 corrected = texture(u_lut, color.rgb).rgb;
  fragColor = vec4(corrected, color.a);
}
```

#### 6.2 WebGL1フォールバック
- **ファイル**: `apps/desktop-electron/src/renderer/nodes/webgl-lut-fallback.ts`
- **戦略**:
  - 3D LUTを2Dテクスチャにマッピング
  - 33x33x33 → 1089x33 テクスチャ
  - 手動で3D座標計算

### Phase 7: FFmpeg統合 (Week 12)

#### 7.1 lut3dフィルター実装
- **ファイル**: `packages/engine/src/ffmpeg/builder.ts`
- **実装**:
  ```typescript
  if (stage.typeId === 'primaryGrading' || stage.typeId === 'curves') {
    // 1. LUT生成
    const lut = generateLUT3D({
      resolution: 33,
      pipeline: buildPipeline(stage.settings)
    });
    
    // 2. .cube ファイル保存
    const lutPath = path.join(tempRoot, `lut-${stage.id}.cube`);
    await fs.writeFile(lutPath, exportCubeLUT(lut, 33));
    
    // 3. FFmpegフィルターチェーンに追加
    filterChain.push(`[${lastLabel}]lut3d=file='${lutPath}'[${nextLabel}]`);
  }
  ```

#### 7.2 複数LUTの最適化
- **戦略**:
  - 連続する複数のカラーグレーディングノードを1つのLUTに統合
  - パフォーマンス向上

### Phase 8: LUTファイル管理 (Week 13)

#### 8.1 LUTインポート機能
- **UI**: ファイル選択ダイアログ
- **対応形式**: .cube, .3dl
- **検証**: サイズ、形式、値範囲チェック

#### 8.2 LUTライブラリ
- **ファイル**: プリセットLUTの同梱
  - `assets/luts/cinematic/`
    - hollywood.cube
    - teal-orange.cube
  - `assets/luts/vintage/`
    - film-70s.cube
    - polaroid.cube
  - `assets/luts/creative/`
    - bleach-bypass.cube
    - cross-process.cube

#### 8.3 LUTプレビュー
- **機能**: サムネイル生成
- **実装**: テスト画像にLUT適用して表示

## 技術仕様

### LUT解像度戦略

| 解像度 | サイズ | 用途 | メモリ |
|--------|--------|------|--------|
| 17³ | 17×17×17 | プレビュー、軽量処理 | ~17KB |
| 33³ | 33×33×33 | 標準（推奨） | ~108KB |
| 65³ | 65×65×65 | 高精度書き出し | ~823KB |

### カラー処理パイプライン順序

1. **入力線形化**: Gamma → Linear
2. **色温度/ティント**: RGB係数変換
3. **Exposure**: 2^EV 乗算
4. **Contrast**: ミッドポイント基準スケーリング
5. **Lift/Gamma/Gain**: カラーホイール適用
6. **カーブ**: RGB/Hueカーブ適用
7. **Saturation**: HSL変換後に彩度調整
8. **セカンダリー**: マスクベース補正
9. **出力ガンマ補正**: Linear → sRGB

### パフォーマンス目標

- **リアルタイムプレビュー**: 60fps @ 1920x1080
- **LUT生成時間**: < 100ms（33³）
- **書き出し速度**: ネイティブFFmpegと同等

## テスト計画

### ユニットテスト
- LUT生成の正確性検証
- カーブ補間の精度テスト
- 色空間変換の正確性

### 統合テスト
- プレビューと書き出しの一致検証
- 複数ノードチェーンのテスト
- 外部LUT読み込みテスト

### パフォーマンステスト
- 大規模LUT（65³）のレンダリング性能
- 複数グレーディングノードの処理速度
- メモリ使用量計測

## マイルストーン

- **Week 2 終了**: LUT基盤完成、基本補正動作
- **Week 4 終了**: プライマリーカラーコレクション全機能実装
- **Week 6 終了**: カーブエディタ完成
- **Week 8 終了**: セカンダリーグレーディング実装
- **Week 10 終了**: UI実装完了
- **Week 12 終了**: FFmpeg統合完了
- **Week 13 終了**: 外部LUT対応、全機能テスト完了

## リスクと対策

### リスク1: WebGL2非対応環境
- **対策**: WebGL1フォールバック実装
- **代替案**: 2Dテクスチャマッピング

### リスク2: LUT精度不足
- **対策**: 解像度の動的切り替え（プレビュー17³、書き出し65³）
- **代替案**: 16bit LUT対応

### リスク3: パフォーマンス問題
- **対策**: LUTキャッシング、差分更新
- **代替案**: ワーカースレッドでLUT生成

### リスク4: FFmpegとの色空間不一致
- **対策**: sRGB ↔︎ Linear変換の明示化
- **検証**: テストパターンでの精度確認

## 次のアクション

1. **Week 1 開始**: `packages/color-grading` パッケージ作成
2. LUT生成エンジンのプロトタイプ実装
3. 簡単なWebGLテストで3D LUTテクスチャ動作確認
4. 基本補正パラメータでの動作検証

この実装計画に基づいて、段階的に高品質なカラーグレーディングシステムを構築していきます。
