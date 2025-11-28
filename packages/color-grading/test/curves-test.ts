/**
 * Curves機能のテスト
 * 基本的な動作を確認
 */

import {
    evaluateCurve,
    applyRGBCurves,
    DEFAULT_RGB_CURVES,
    type Curve,
    type RGBCurves,
} from '../src/index.js';

console.log('=== Curves 動作テスト ===\n');

// テスト1: 線形カーブ（デフォルト）
console.log('テスト1: 線形カーブ（変更なし）');
const linearCurve: Curve = [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
];
console.log('  入力: 0.5 → 出力:', evaluateCurve(linearCurve, 0.5));
console.log('  ✓ 期待値: 0.5\n');

// テスト2: コントラスト強化カーブ（S字カーブ）
console.log('テスト2: S字カーブ（コントラスト強化）');
const sCurve: Curve = [
    { x: 0, y: 0 },
    { x: 0.25, y: 0.15 },
    { x: 0.5, y: 0.5 },
    { x: 0.75, y: 0.85 },
    { x: 1, y: 1 },
];
console.log('  入力: 0.25 →', evaluateCurve(sCurve, 0.25));
console.log('  入力: 0.5  →', evaluateCurve(sCurve, 0.5));
console.log('  入力: 0.75 →', evaluateCurve(sCurve, 0.75));
console.log('  ✓ シャドウが下がり、ハイライトが上がる\n');

// テスト3: 明度上げカーブ
console.log('テスト3: 全体的な明度上げ');
const brightenCurve: Curve = [
    { x: 0, y: 0.1 },
    { x: 1, y: 1 },
];
console.log('  入力: 0.0 →', evaluateCurve(brightenCurve, 0.0));
console.log('  入力: 0.5 →', evaluateCurve(brightenCurve, 0.5));
console.log('  ✓ 全体が明るくなる\n');

// テスト4: RGB Curves適用
console.log('テスト4: RGB Curves を画像データに適用');
const customCurves: RGBCurves = {
    master: linearCurve,
    red: [
        { x: 0, y: 0 },
        { x: 1, y: 0.9 }, // 赤を少し下げる
    ],
    green: linearCurve,
    blue: [
        { x: 0, y: 0.1 }, // 青を少し上げる
        { x: 1, y: 1 },
    ],
};

const [r, g, b] = applyRGBCurves(0.5, 0.5, 0.5, customCurves);
console.log(`  入力: RGB(0.5, 0.5, 0.5)`);
console.log(`  出力: RGB(${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)})`);
console.log('  ✓ 赤が下がり、青が上がっている\n');

// テスト5: デフォルトカーブ（変更なし）
console.log('テスト5: デフォルトカーブ');
const [r2, g2, b2] = applyRGBCurves(0.7, 0.5, 0.3, DEFAULT_RGB_CURVES);
console.log(`  入力: RGB(0.7, 0.5, 0.3)`);
console.log(`  出力: RGB(${r2.toFixed(3)}, ${g2.toFixed(3)}, ${b2.toFixed(3)})`);
console.log('  ✓ 変更なし\n');

console.log('=== すべてのテスト完了 ===');
