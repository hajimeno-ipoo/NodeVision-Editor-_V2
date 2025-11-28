# 既存カラーコレクションノードの移行戦略

## 現状分析

### 既存ノード: `colorCorrection`
- **typeId**: `colorCorrection`
- **パラメータ**: exposure, brightness, contrast, saturation, gamma, shadows, highlights, temperature, tint (9項目)
- **実装**: Canvas/WebGLによる独自処理 + FFmpegのeqフィルター（不完全）
- **問題点**: プレビューと書き出しの結果が一致しない

---

## 選択肢と比較

### 🔴 選択肢A: 既存ノードを完全置き換え（内部実装を3D LUTに変換）

**アプローチ**:
- typeId `colorCorrection` はそのまま維持
- 内部実装を3D LUT方式に完全移行
- 既存のワークフローファイルは無修正で動作

**メリット**:
- ✅ ユーザー影響ゼロ（既存プロジェクトがそのまま動く）
- ✅ シームレスな改善（気づかないうちに高品質になる）
- ✅ ノード数が増えない（UIがシンプル）
- ✅ 実装が集中（1つのノードタイプのみメンテナンス）

**デメリット**:
- ❌ 段階的導入が難しい（一気に置き換える必要がある）
- ❌ ロールバックが難しい（問題があった場合）
- ❌ 将来的に高度な機能（カーブ、カラーホイール）を追加しづらい（UIが肥大化）

**実装**:
```typescript
// packages/editor/src/templates.ts (変更なし)
{
  typeId: 'colorCorrection',  // 既存のまま
  // ... 設定も同じ
}

// apps/desktop-electron/src/renderer/nodes/color-correction.ts (内部を変更)
import { generateLUT3D, buildColorTransform } from '@nodevision/color-grading';

// 既存のパラメータから3D LUTを生成
const pipeline = buildPipelineFromSettings(node.settings);
const lut = generateLUT3D(33, pipeline);
webglProcessor.loadLUT(lut);
```

---

### 🟡 選択肢B: 新旧並存（既存は非推奨、新ノード追加）

**アプローチ**:
- 既存 `colorCorrection` は残すが「非推奨」マーク
- 新規ノードを追加:
  - `primaryGrading` (プライマリーカラーコレクション)
  - `curves` (カーブエディタ)
  - `secondaryGrading` (セカンダリーグレーディング)
  - `lutLoader` (外部LUT読み込み)

**メリット**:
- ✅ 段階的導入が可能
- ✅ 既存プロジェクトは影響なし
- ✅ 新機能を明確に分離（カーブ、カラーホイールなど）
- ✅ 問題があれば古いノードに戻れる
- ✅ 将来的に旧ノード削除が容易

**デメリット**:
- ❌ ノード数が増える（初心者が混乱する可能性）
- ❌ メンテナンスコストが高い（2つのシステムを維持）
- ❌ ユーザーが手動で移行が必要
- ❌ ドキュメントで説明が必要

**実装**:
```typescript
// packages/editor/src/templates.ts
export const DEFAULT_NODE_TEMPLATES: NodeTemplate[] = [
  // ... 既存ノード ...
  
  {
    typeId: 'colorCorrection',  // 既存（非推奨）
    title: 'Color Correction (Legacy)',
    category: 'Color',
    description: '⚠️ Legacy node. Use Primary Grading instead.',
    deprecated: true,  // 新規フラグ
    // ...
  },
  
  {
    typeId: 'primaryGrading',  // 新規
    title: 'Primary Grading',
    category: 'Color',
    description: 'Professional color grading with LUT-based processing',
    // ...
  },
  
  {
    typeId: 'curves',
    title: 'Curves',
    category: 'Color',
    // ...
  }
];
```

---

### 🟢 選択肢C: 段階的移行（内部実装を段階的に変更）

**アプローチ**:
- Phase 1: 既存ノードの内部を3D LUT方式に変換（選択肢A）
- Phase 2: 高度な機能を持つ新ノードを追加（選択肢B）
- Phase 3: 旧ノードを非推奨化、最終的に削除

**メリット**:
- ✅ 最初の改善が早い（既存ユーザーが即座に恩恵を受ける）
- ✅ 段階的にリスク分散
- ✅ フィードバックを受けながら進められる
- ✅ 将来的に高度な機能も提供できる

**デメリット**:
- ❌ 実装期間が長い
- ❌ Phase 1と2の間でコード重複の可能性
- ❌ 移行パスの設計が複雑

**実装タイムライン**:
1. **Week 1-4**: 既存`colorCorrection`を3D LUT化（選択肢A）
2. **Week 5-10**: 新ノード`primaryGrading`等を追加（選択肢B）
3. **Week 11-12**: 旧ノードに非推奨マーク、移行ガイド作成
4. **将来**: 旧ノード削除（メジャーバージョンアップ時）

---

## 推奨案: **選択肢C（段階的移行）**

### 理由
1. **即座の改善**: 既存ユーザーがすぐにプレビュー/書き出しの一致を体験
2. **リスク最小化**: 段階的導入で問題を早期発見
3. **将来性**: 高度な機能も追加できる余地を残す
4. **ユーザー体験**: 既存プロジェクトが壊れない

### 具体的な実装プラン

#### Phase 1: 既存ノードの内部改善 (Week 1-4)

**目標**: プレビューと書き出しの完全一致

**実装内容**:
```typescript
// packages/color-grading/src/legacy/color-correction-pipeline.ts
// 既存のパラメータから3D LUTを生成する専用関数

export function buildLegacyColorCorrectionPipeline(
  settings: ColorCorrectionNodeSettings
): ColorGradingPipeline {
  return {
    basic: {
      exposure: settings.exposure ?? 0,
      brightness: settings.brightness ?? 0,
      contrast: settings.contrast ?? 1,
      saturation: settings.saturation ?? 1,
      gamma: settings.gamma ?? 1,
    },
    temperature: settings.temperature ?? 0,
    tint: settings.tint ?? 0,
    tonal: {
      shadows: settings.shadows ?? 0,
      midtones: 0,  // 既存ノードには無いが、内部で計算
      highlights: settings.highlights ?? 0,
    }
  };
}
```

**変更ファイル**:
- `apps/desktop-electron/src/renderer/nodes/color-correction.ts`
  - WebGL/Canvasプロセッサーを3D LUT方式に置き換え
  - FFmpeg統合を更新
- `packages/engine/src/ffmpeg/builder.ts`
  - `colorCorrection`ノードでLUT生成とlut3dフィルター使用

**ユーザー影響**: なし（既存プロジェクトがそのまま動作、品質向上のみ）

---

#### Phase 2: 新ノード追加 (Week 5-12)

**目標**: プロフェッショナル機能の提供

**新規ノード**:

1. **Primary Grading** (`primaryGrading`)
   - 基本補正 + カラーホイール（Lift/Gamma/Gain）
   - より直感的なUI
   - 既存の`colorCorrection`の上位互換

2. **Curves** (`curves`)
   - RGBカーブエディタ
   - Hueカーブ（Hue vs Sat/Hue/Luma）
   - 専用のカーブ描画UI

3. **LUT Loader** (`lutLoader`)
   - 外部LUT読み込み（.cube, .3dl）
   - プリセットライブラリ
   - カスタムLook適用

4. **Secondary Grading** (`secondaryGrading`) ※将来
   - HSLキー、ルミナンスキー
   - マスクベース補正

**ノード一覧UIでの表示**:
```
Color カテゴリ:
├── Primary Grading          [推奨]
├── Curves
├── LUT Loader
└── Color Correction (Legacy) [⚠️ 非推奨]
```

---

#### Phase 3: 移行促進 (Week 13+)

**実装内容**:
1. `colorCorrection`に非推奨バッジ表示
2. ワンクリック変換機能
   ```typescript
   // 既存ノードを右クリック → "Convert to Primary Grading"
   function convertLegacyToPrimaryGrading(oldNode: RendererNode): RendererNode {
     return {
       ...oldNode,
       typeId: 'primaryGrading',
       settings: {
         ...oldNode.settings,
         // 自動マッピング
       }
     };
   }
   ```
3. 移行ガイドドキュメント作成
4. トースト通知: "より高度なPrimary Gradingノードが利用可能です"

---

## 実装の優先順位

### 🔴 最優先（Week 1-2）
- [ ] `packages/color-grading` パッケージ作成
- [ ] LUT生成エンジン実装
- [ ] 既存`colorCorrection`のWebGL部分を3D LUTに変換

### 🟡 高優先（Week 3-4）
- [ ] FFmpeg統合をlut3dフィルターに変更
- [ ] プレビュー/書き出し一致の検証テスト
- [ ] パフォーマンス最適化

### 🟢 中優先（Week 5-8）
- [ ] `primaryGrading`ノード実装
- [ ] カラーホイールUI実装
- [ ] `lutLoader`ノード実装

### ⚪ 低優先（Week 9+）
- [ ] `curves`ノード実装
- [ ] 非推奨マークと移行ツール
- [ ] ドキュメント整備

---

## 設定ファイルの互換性

### 既存プロジェクトの保証

**保存形式** (変更なし):
```json
{
  "nodes": [
    {
      "id": "node-123",
      "typeId": "colorCorrection",
      "settings": {
        "kind": "colorCorrection",
        "exposure": 0.5,
        "contrast": 1.2,
        // ... 既存パラメータ
      }
    }
  ]
}
```

**読み込み時**:
- `typeId: "colorCorrection"` → 新しい3D LUT実装で処理
- パラメータ構造は変更なし
- ユーザーは何も変更不要

---

## 決定事項

### ✅ 推奨する実装戦略

1. **Phase 1を最優先で実施**
   - 既存`colorCorrection`を3D LUT化
   - プレビュー/書き出しの一致問題を即座に解決

2. **Phase 2で機能拡張**
   - 新規ノード追加でプロ機能提供
   - 既存ノードと共存

3. **Phase 3で段階的移行**
   - 非推奨マークと変換ツール
   - 将来的な削除を視野に

### 次のアクション

1. **Week 1開始**: LUT生成エンジンの実装
2. **Week 2**: 既存`color-correction.ts`の内部改修
3. **Week 3-4**: FFmpeg統合とテスト
4. **Week 5以降**: 新ノードの追加

この戦略により、既存ユーザーに迷惑をかけず、段階的に高品質なカラーグレーディングシステムを提供できます。
