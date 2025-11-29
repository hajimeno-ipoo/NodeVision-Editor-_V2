# カラーグレーディングシステム - タスクリスト

## 現状分析

### 既存の問題点
- ✅ **分析完了**: Canvas/WebGLとFFmpegで異なるアルゴリズムを使用
- ✅ **分析完了**: プレビューと書き出しの結果が一致しない
- ✅ **分析完了**: FFmpegでは一部パラメータ（shadows, highlights, temperature, tint）が無視される
- ✅ **分析完了**: 簡易的な色調整のみで、プロレベルのグレーディングができない

### 採用するアプローチ
- **3D LUT方式**: プレビューと書き出しで同一のルックアップテーブルを使用
- **ノードベース**: DaVinci Resolveスタイルの段階的グレーディング
- **プロフェッショナル機能**: カラーホイール、カーブ、セカンダリーグレーディング

---

## 📊 実装進捗サマリー

### ✅ 完了した機能
- **Phase 1**: LUT基盤（生成、パーサー、エクスポーター）
- **Phase 2**: プライマリーカラーコレクション（Basic, Temperature, Tonal, Color Wheels）
- **Phase 3**: カーブエディタ（RGB Curves, Hue Curves）
- **Phase 4**: セカンダリーグレーディング（HSL Keyer, Luma Keyer）
- **Phase 5-7**: パイプライン統合、WebGL、FFmpeg統合
- **Phase 8**: 全UIノード実装（Color Correction, Primary Grading, Curves, LUT Loader, Secondary Grading, Scope Viewer）

### 🎯 追加実装
- **Scope Viewerノード**: 独立したRGBヒストグラム表示ノード
- **Hue Curves**: 色相ベースのカーブ調整（Hue vs Hue/Sat/Luma）

### ⏳ 残タスク
- **Phase 9**: テストと最適化
  - ユニットテストカバレッジ向上
  - パフォーマンス最適化
  - ドキュメント作成

---

## Phase 1: 基盤構築 (Completed)

### Task 1.1: 新規パッケージ作成
- [x] `packages/color-grading/` ディレクトリ作成
- [x] `package.json` 作成
- [x] `tsconfig.json` 作成（tsconfig.base.json継承）
- [x] `src/index.ts` 作成（エクスポートポイント）
- [x] pnpm workspace登録確認
- [x] ビルド設定確認（`pnpm build` テスト）

### Task 1.2: LUT型定義
- [x] `src/lut/types.ts` 作成
- [x] 以下の型を定義: `LUTResolution`, `LUT3D`, `LUTMetadata`

### Task 1.3: LUT生成エンジン - 基礎
- [x] `src/lut/generator.ts` 作成
- [x] `generateLUT3D()` 関数実装
- [x] 単純なパススルーLUTでテスト
- [x] ユニットテスト作成（`tests/lut/generator.test.ts`）

### Task 1.4: CUBE形式エクスポーター
- [x] `src/lut/exporter.ts` 作成
- [x] `exportCubeLUT()` 関数実装
- [x] テストLUTで生成確認

### Task 1.5: CUBE形式パーサー
- [x] `src/lut/parser.ts` 作成
- [x] `parseCubeLUT()` 関数実装
- [x] 複数の実LUTファイルでテスト
- [x] ユニットテスト作成

### Task 1.6: WebGL & FFmpeg統合 (先行実装)
- [x] `WebGLLUTProcessor` 実装 (WebGL 2.0 3D Texture)
- [x] `colorCorrection` ノードのLUT対応
- [x] FFmpegビルダーのLUT対応 (`lut3d_generator`)
- [x] `.cube` ファイル生成と `lut3d` フィルター適用

---

## Phase 2: プライマリーカラーコレクション (Week 3-4)

### Task 2.1: 基本補正 - 型定義
- [x] `src/primary/types.ts` 作成
- [x] `BasicCorrection` インターフェース定義

### Task 2.2: 基本補正 - 実装
- [x] `src/primary/basic.ts` 作成
- [x] `applyBasicCorrection()` 関数実装
- [x] 既存のCanvas/WebGL実装からロジック移植

### Task 2.3: 色温度/ティント実装
- [x] `src/primary/temperature.ts` 作成
- [x] `applyTemperature()` 関数実装
- [x] `applyTint()` 関数実装

### Task 2.4: トーン別調整実装
- [x] `src/primary/tonal.ts` 作成
- [x] Shadows/Midtones/Highlights分離アルゴリズム実装
- [x] `applyTonalCorrection()` 関数実装
- [x] Debug Color Correction Node
  - [x] Fix black preview issue (WebGL OES_texture_float_linear extension)
  - [x] Verify slider interactions
  - [x] Ensure correct image propagation to Media Preview
  - [x] Fix video preview loading issue
  - [x] Fix reset button styling

### Summary
Color Correction node debugging and styling is complete.
The next step is to proceed with testing other color grading nodes as per the testing guide.

### Task 2.5: カラーホイール - 型定義
- [x] `src/primary/types.ts` に追加: `ColorWheelControl`, `ColorWheels`

### Task 2.6: カラーホイール実装
- [x] `src/primary/wheels.ts` 作成
- [x] HSL → RGB変換関数
- [x] Lift/Gamma/Gain適用アルゴリズム実装
- [x] `applyColorWheels()` 関数実装
- [x] `ColorGradingPipeline` に `wheels` プロパティ追加
- [x] `pipeline.ts` で統合完了
- [x] ビルド・テスト成功

---

## Phase 3: カーブエディタ (Week 5-6)

### Task 3.1: カーブ - 型定義
- [x] `src/curves/types.ts` 作成
- [x] `CurvePoint`, `Curve`, `RGBCurves`, `HueCurves` 型定義

### Task 3.2: カーブ補間実装
- [x] `src/curves/curve-math.ts` 作成
- [x] Catmull-Rom スプライン補間実装
- [x] `evaluateCurve(curve: Curve, x: number): number` 関数
- [x] エッジケース処理（x < 0, x > 1）
- [x] パフォーマンステスト
- [x] ユニットテスト作成

### Task 3.3: RGBカーブ実装
- [x] `src/curves/rgb-curves.ts` 作成
- [x] `applyRGBCurves()` 関数実装
- [x] LUT生成への統合
- [x] テストケース作成

### Task 3.4: Hueカーブ実装
- [x] `src/curves/hue-curves.ts` 作成
- [x] **Secondary Gradingノード** <!-- id: 7 -->
  - [x] HSL Keyerロジック
  - [x] UI実装
  - [x] マスク表示機能

---

## Phase 4: セカンダリーカラーコレクション (Week 7-8)

### Task 4.1: HSLキー - 型定義
- [x] `src/secondary/types.ts` 作成
- [x] `HSLKey` 型定義

### Task 4.2: HSLキー実装
- [x] `src/secondary/hsl-keyer.ts` 作成
- [x] `generateHSLMask()` 関数実装
- [x] アルファマスク生成
- [x] テストケース作成

### Task 4.3: ルミナンスキー実装
- [x] `src/secondary/luma-key.ts` 作成
- [x] `calculateLumaKey()` 関数実装
- [x] テストケース作成

### Task 4.4: マスキングシステム
- [x] `src/secondary/masking.ts` 作成
- [x] マスク合成関数実装
- [x] マスク適用カラー補正
- [x] テストケース作成

---

## Phase 5: パイプライン統合 (Week 9)

### Task 5.1: パイプライン型定義
- [x] `src/processors/types.ts` 作成
- [x] `ColorGradingPipeline` 型定義

### Task 5.2: パイプライン実装
- [x] `src/processors/pipeline.ts` 作成
- [x] `buildColorTransform()` 関数実装
- [x] LUT生成エンジンと統合

---

## Phase 6: WebGL実装 (Completed)
※ Phase 1で先行実装済み

---

## Phase 7: FFmpeg統合 (Completed)
※ Phase 1で先行実装済み

---

### Task 2.5: Electron統合とモジュール解決 (New)
- [x] Electronの `nodeIntegration` を有効化
- [x] `preload.ts` で `require` を公開
- [x] レンダラープロセスでの動的モジュール読み込み実装
- [x] カラーグレーディングノードの有効化と動作確認

## Phase 3: 高度な機能 (Next)

### Task 3.1: カーブエディタUI
- [x] `packages/editor/src/components/CurveEditor/` 作成
- [x] ベジェ曲線操作ロジック実装
- [x] ヒストグラム表示（Scope Viewerノードとして実装）
- [x] ノードUIへの統合`curves` ノード追加
- [x] `secondaryGrading` ノード追加
- [x] `lutLoader` ノード追加

### Task 8.2: カラーホイールUI
- [x] `apps/desktop-electron/src/renderer/nodes/primary-grading.ts` 作成
- [x] SVG円形グラデーション描画
- [x] ドラッグ操作実装
- [x] Lift/Gamma/Gain切り替え
- [x] ノードに統合

### Task 8.3: カーブエディタUI
- [x] `apps/desktop-electron/src/renderer/nodes/curve-editor.ts` 作成
- [x] Canvas描画実装
- [x] カーブポイント追加/削除/ドラッグ
- [x] チャンネル切り替え（Master/R/G/B/Hue）
- [x] ノードに統合

### Task 8.4: LUTローダーUI
- [x] ファイル選択ダイアログ統合
- [x] LUTプレビュー表示
- [x] LUTライブラリ管理
- [x] ノード実装

### Task 8.5: Scope Viewerノード（新規追加）
- [x] `apps/desktop-electron/src/renderer/nodes/scope-viewer.ts` 作成
- [x] RGBヒストグラム計算実装
- [x] Canvas描画実装（RGB + Luminance）
- [x] ノードテンプレート追加（`scopeViewer`）
- [x] Waveform/Vectorscope用の拡張ポイント準備
- [x] ノードに統合

---

## Phase 9: テストと最適化 (Week 15)

### Task 9.1: ユニットテスト整備
- [x] LUTパーサーのテスト作成
- [x] カーブ補間のテスト作成
- [x] HSL Keyerのテスト作成
- [x] パイプライン統合のテスト作成
- [ ] 全モジュールのテストカバレッジ80%以上
- [ ] エッジケーステスト追加
- [ ] CI統合

### Task 9.2: 統合テスト
- [ ] プレビューと書き出しの一致検証
- [ ] 複数ノードチェーンテスト
- [ ] 外部LUT読み込みテスト
- [ ] エラーケーステスト

### Task 9.3: パフォーマンス最適化
- [ ] LUT生成時間計測
- [ ] WebGLレンダリングプロファイリング
- [ ] メモリ使用量最適化
- [ ] 必要に応じてWorker化

### Task 9.4: ドキュメント作成
- [ ] API仕様書
- [ ] ユーザーガイド
- [ ] サンプルワークフロー
- [ ] トラブルシューティング
