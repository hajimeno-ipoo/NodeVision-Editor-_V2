import { evaluateCurve, curveTolookupTable } from './curve-math';
import type { RGBCurves } from './types';

/**
 * RGB Curves を RGB 値に適用
 * 
 * 処理順序:
 * 1. Master カーブを全チャンネルに適用
 * 2. 各チャンネルのカーブを適用
 * 
 * @param r - 赤チャンネル値（0.0 ~ 1.0）
 * @param g - 緑チャンネル値（0.0 ~ 1.0）
 * @param b - 青チャンネル値（0.0 ~ 1.0）
 * @param curves - RGB カーブ設定
 * @returns [r, g, b] - 補正後の RGB 値
 */
export function applyRGBCurves(
    r: number,
    g: number,
    b: number,
    curves: RGBCurves
): [number, number, number] {
    // 1. Master カーブを全チャンネルに適用
    let rOut = evaluateCurve(curves.master, r);
    let gOut = evaluateCurve(curves.master, g);
    let bOut = evaluateCurve(curves.master, b);

    // 2. 個別チャンネルのカーブを適用
    rOut = evaluateCurve(curves.red, rOut);
    gOut = evaluateCurve(curves.green, gOut);
    bOut = evaluateCurve(curves.blue, bOut);

    // クランプ
    return [
        Math.max(0, Math.min(1, rOut)),
        Math.max(0, Math.min(1, gOut)),
        Math.max(0, Math.min(1, bOut)),
    ];
}

/**
 * RGB Curves を LUT 用に事前計算
 * バッチ処理や LUT 生成時に使用
 * 
 * @param curves - RGB カーブ設定
 * @param resolution - LUT 解像度（デフォルト: 256）
 * @returns { master, red, green, blue } - 各チャンネルのルックアップテーブル
 */
export function precomputeRGBCurvesLUT(curves: RGBCurves, resolution = 256) {
    return {
        master: curveTolookupTable(curves.master, resolution),
        red: curveTolookupTable(curves.red, resolution),
        green: curveTolookupTable(curves.green, resolution),
        blue: curveTolookupTable(curves.blue, resolution),
    };
}

/**
 * 事前計算された LUT を使って RGB Curves を適用
 * パフォーマンス重視の実装
 * 
 * @param r - 赤チャンネル値（0.0 ~ 1.0）
 * @param g - 緑チャンネル値（0.0 ~ 1.0）
 * @param b - 青チャンネル値（0.0 ~ 1.0）
 * @param lut - 事前計算された LUT
 * @returns [r, g, b] - 補正後の RGB 値
 */
export function applyRGBCurvesWithLUT(
    r: number,
    g: number,
    b: number,
    lut: ReturnType<typeof precomputeRGBCurvesLUT>
): [number, number, number] {
    const resolution = lut.master.length;

    // インデックスを計算（クランプ済み）
    function lookup(value: number, table: number[]): number {
        const clamped = Math.max(0, Math.min(1, value));
        const index = Math.floor(clamped * (resolution - 1));
        return table[index];
    }

    // 1. Master カーブを全チャンネルに適用
    let rOut = lookup(r, lut.master);
    let gOut = lookup(g, lut.master);
    let bOut = lookup(b, lut.master);

    // 2. 個別チャンネルのカーブを適用
    rOut = lookup(rOut, lut.red);
    gOut = lookup(gOut, lut.green);
    bOut = lookup(bOut, lut.blue);

    return [rOut, gOut, bOut];
}

/**
 * カーブが変更されているかチェック
 * すべてのカーブがデフォルト（線形）の場合は false
 */
export function hasRGBCurvesModified(curves: RGBCurves): boolean {
    function isLinearCurve(points: { x: number; y: number }[]): boolean {
        if (points.length !== 2) return false;
        return points[0].x === 0 && points[0].y === 0 && points[1].x === 1 && points[1].y === 1;
    }

    return !(
        isLinearCurve(curves.master) &&
        isLinearCurve(curves.red) &&
        isLinearCurve(curves.green) &&
        isLinearCurve(curves.blue)
    );
}
