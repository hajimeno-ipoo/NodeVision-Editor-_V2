import type { Curve, CurvePoint } from './types';

/**
 * Catmull-Rom スプライン補間
 * 4つの制御点 p0, p1, p2, p3 を使って p1 と p2 の間を補間
 * 
 * @param p0 - 制御点0
 * @param p1 - 制御点1（開始点）
 * @param p2 - 制御点2（終了点）
 * @param p3 - 制御点3
 * @param t - 補間パラメータ（0.0 ~ 1.0）
 * @returns p1 と p2 の間の補間された値
 */
function catmullRomInterpolate(
    p0: number,
    p1: number,
    p2: number,
    p3: number,
    t: number
): number {
    const t2 = t * t;
    const t3 = t2 * t;

    // Catmull-Rom 係数
    const a = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3;
    const b = p0 - 2.5 * p1 + 2.0 * p2 - 0.5 * p3;
    const c = -0.5 * p0 + 0.5 * p2;
    const d = p1;

    return a * t3 + b * t2 + c * t + d;
}

/**
 * カーブポイントをソートして重複を除去
 * x が同一のポイントがある場合、最初のものを残す
 */
function normalizeCurve(curve: Curve): Curve {
    // x でソート
    const sorted = [...curve].sort((a, b) => a.x - b.x);

    // 重複除去
    const unique: Curve = [];
    for (let i = 0; i < sorted.length; i++) {
        if (i === 0 || sorted[i].x !== sorted[i - 1].x) {
            unique.push(sorted[i]);
        }
    }

    // 最低限 (0, 0) と (1, 1) を確保
    if (unique.length === 0) {
        return [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
        ];
    }

    // 先頭が 0 でない場合は (0, 0) を追加
    if (unique[0].x > 0) {
        unique.unshift({ x: 0, y: 0 });
    }

    // 末尾が 1 でない場合は (1, 1) を追加
    if (unique[unique.length - 1].x < 1) {
        unique.push({ x: 1, y: 1 });
    }

    return unique;
}

/**
 * カーブから x に対応する y 値をルックアップ
 * Catmull-Rom スプライン補間を使用
 * 
 * @param curve - カーブ定義
 * @param x - 入力値（0.0 ~ 1.0）
 * @returns 補間された出力値（クランプされた 0.0 ~ 1.0）
 */
export function evaluateCurve(curve: Curve, x: number): number {
    // クランプ
    if (x <= 0) return 0;
    if (x >= 1) return 1;

    // カーブを正規化
    const normalized = normalizeCurve(curve);

    // 該当する区間を見つける
    let i1 = 0;
    let i2 = 0;
    for (let i = 0; i < normalized.length - 1; i++) {
        if (x >= normalized[i].x && x <= normalized[i + 1].x) {
            i1 = i;
            i2 = i + 1;
            break;
        }
    }

    const p1 = normalized[i1];
    const p2 = normalized[i2];

    // 線形補間の場合（ポイントが2つだけ、または区間が狭い）
    if (normalized.length === 2 || i1 === i2) {
        const t = (x - p1.x) / (p2.x - p1.x);
        const y = p1.y + t * (p2.y - p1.y);
        return Math.max(0, Math.min(1, y));
    }

    // Catmull-Rom のための4つの制御点を取得
    const p0 = i1 > 0 ? normalized[i1 - 1] : p1;
    const p3 = i2 < normalized.length - 1 ? normalized[i2 + 1] : p2;

    // 正規化されたパラメータ t（p1 と p2 の間）
    const t = (x - p1.x) / (p2.x - p1.x);

    // Catmull-Rom 補間
    const y = catmullRomInterpolate(p0.y, p1.y, p2.y, p3.y, t);

    // クランプして返す
    return Math.max(0, Math.min(1, y));
}

/**
 * カーブを指定された解像度のルックアップテーブル (LUT) に変換
 * 
 * @param curve - カーブ定義
 * @param resolution - LUT の解像度（デフォルト: 256）
 * @returns 0.0 ~ 1.0 の値を含む配列
 */
export function curveTolookupTable(curve: Curve, resolution = 256): number[] {
    const lut: number[] = [];
    for (let i = 0; i < resolution; i++) {
        const x = i / (resolution - 1);
        lut.push(evaluateCurve(curve, x));
    }
    return lut;
}

/**
 * カーブにポイントを追加
 * 同じ x 座標のポイントがある場合は置き換える
 */
export function addCurvePoint(curve: Curve, point: CurvePoint): Curve {
    const newCurve = curve.filter((p) => p.x !== point.x);
    newCurve.push(point);
    return normalizeCurve(newCurve);
}

/**
 * カーブからポイントを削除
 * 両端 (x=0, x=1) は削除できない
 */
export function removeCurvePoint(curve: Curve, x: number): Curve {
    // 両端は削除不可
    if (x === 0 || x === 1) {
        return curve;
    }
    return normalizeCurve(curve.filter((p) => p.x !== x));
}

/**
 * カーブをリセット（線形に戻す）
 */
export function resetCurve(): Curve {
    return [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
    ];
}
