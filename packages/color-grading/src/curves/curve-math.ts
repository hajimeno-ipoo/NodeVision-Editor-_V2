import type { Curve, CurvePoint } from './types';

// デバッグ・検証用: RGBカーブを線形補間に固定するトグル
const USE_LINEAR_RGB_CURVE = false;
// Catmull-Rom のオーバーシュートを抑えるモノトニック補間を使うか
const USE_MONOTONIC_RGB_CURVE = true;

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
 * カーブを正規化（ソート + 重複除去）
 */
function normalizeCurve(curve: Curve): Curve {
    if (curve.length === 0) return [];

    // X座標でソート
    const sorted = [...curve].sort((a, b) => a.x - b.x);

    // 重複除去
    const unique: Curve = [];
    for (let i = 0; i < sorted.length; i++) {
        if (i === 0 || sorted[i].x !== sorted[i - 1].x) {
            unique.push(sorted[i]);
        }
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
export function evaluateCurve(curve: Curve, x: number, loop: boolean = false): number {
    // カーブを正規化
    const normalized = normalizeCurve(curve);

    // 空配列の場合：Hueカーブの中立値（0.5）を返す
    if (normalized.length === 0) {
        return loop ? 0.5 : 0;
    }

    // 1ポイントのみの場合
    if (normalized.length === 1) {
        // Hueカーブ（ループ）の場合は水平線
        if (loop) return normalized[0].y;
        // RGBカーブの場合は下の端点補間処理に任せる（(0,0) -> P -> (1,1) の直線になる）
    }

    // ループ処理（Hueカーブ用）
    if (loop) {
        // ポイントが1つもない場合は中立（0.5）
        if (normalized.length === 0) return 0.5;

        // ポイントが1つだけの場合は水平線
        if (normalized.length === 1) return normalized[0].y;

        // 仮想的にポイントを前後に追加してループを表現
        // 前: x - 1, 後: x + 1
        const prevPoints = normalized.map(p => ({ x: p.x - 1, y: p.y }));
        const nextPoints = normalized.map(p => ({ x: p.x + 1, y: p.y }));

        // 検索範囲を広げる
        const extended = [...prevPoints, ...normalized, ...nextPoints];

        // 該当する区間を見つける
        let i1 = 0;
        for (let i = 0; i < extended.length - 1; i++) {
            if (x >= extended[i].x && x <= extended[i + 1].x) {
                i1 = i;
                break;
            }
        }

        const p1 = extended[i1];
        const p2 = extended[i1 + 1];



        // Catmull-Rom 制御点（線形外挿で仮想制御点を作成）
        const p0 = i1 > 0 ? extended[i1 - 1] : {
            x: 2 * p1.x - p2.x,
            y: 2 * p1.y - p2.y
        };
        const p3 = i1 < extended.length - 2 ? extended[i1 + 2] : {
            x: 2 * p2.x - p1.x,
            y: 2 * p2.y - p1.y
        };

        const t = (p2.x === p1.x) ? 0 : (x - p1.x) / (p2.x - p1.x);
        const y = catmullRomInterpolate(p0.y, p1.y, p2.y, p3.y, t);

        return Math.max(0, Math.min(1, y));
    }

    // 通常のクランプ処理（RGBカーブ用）
    // DaVinci Resolve仕様：端点の外側は直線補間
    if (x <= normalized[0].x) {
        // 最初のポイントより左側：(0, 0)から最初のポイントまで直線補間
        const p = normalized[0];
        if (p.x === 0) return p.y;
        const t = x / p.x;
        return t * p.y;
    }

    if (x >= normalized[normalized.length - 1].x) {
        // 最後のポイントより右側：最後のポイントから(1, 1)まで直線補間
        const p = normalized[normalized.length - 1];
        if (p.x === 1) return p.y;
        const t = (x - p.x) / (1 - p.x);
        return p.y + t * (1 - p.y);
    }

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

    // RGBカーブ検証用：Catmull-Rom の代わりに線形で挙動を確認
    if (!loop && USE_LINEAR_RGB_CURVE) {
        const t = (x - p1.x) / (p2.x - p1.x);
        const y = p1.y + t * (p2.y - p1.y);
        return Math.max(0, Math.min(1, y));
    }

    // RGBカーブ用：モノトニック Hermite 補間でオーバーシュート抑制
    if (!loop && USE_MONOTONIC_RGB_CURVE) {
        const h = p2.x - p1.x;
        const delta = (p2.y - p1.y) / h;

        // 近傍の傾きを取得（端は線形外挿）
        const p0 = i1 > 0 ? normalized[i1 - 1] : {
            x: 2 * p1.x - p2.x,
            y: 2 * p1.y - p2.y
        };
        const p3 = i2 < normalized.length - 1 ? normalized[i2 + 1] : {
            x: 2 * p2.x - p1.x,
            y: 2 * p2.y - p1.y
        };

        const delta0 = (p1.y - p0.y) / (p1.x - p0.x);
        const delta2 = (p3.y - p2.y) / (p3.x - p2.x);

        let m1 = 0.5 * (delta0 + delta);
        let m2 = 0.5 * (delta + delta2);

        // Fritsch-Carlson で傾きをクリップしてモノトニックを保証
        if (Math.abs(delta) < 1e-9) {
            m1 = 0;
            m2 = 0;
        } else {
            const a = m1 / delta;
            const b = m2 / delta;
            const maxMag = Math.max(Math.abs(a), Math.abs(b));
            const limit = 3;
            if (maxMag > limit) {
                const scale = limit / maxMag;
                m1 *= scale;
                m2 *= scale;
            }
        }

        const t = (x - p1.x) / h;
        const t2 = t * t;
        const t3 = t2 * t;

        const y =
            (2 * t3 - 3 * t2 + 1) * p1.y +
            (t3 - 2 * t2 + t) * m1 * h +
            (-2 * t3 + 3 * t2) * p2.y +
            (t3 - t2) * m2 * h;

        return Math.max(0, Math.min(1, y));
    }

    // 線形補間の場合（ポイントが2つだけ）
    if (normalized.length === 2) {
        const t = (x - p1.x) / (p2.x - p1.x);
        const y = p1.y + t * (p2.y - p1.y);
        return Math.max(0, Math.min(1, y));
    }

    // Catmull-Rom のための4つの制御点を取得
    // 端点では線形外挿で仮想制御点を作成（端が不自然に曲がるのを防ぐ）
    const p0 = i1 > 0 ? normalized[i1 - 1] : {
        x: 2 * p1.x - p2.x,
        y: 2 * p1.y - p2.y
    };
    const p3 = i2 < normalized.length - 1 ? normalized[i2 + 1] : {
        x: 2 * p2.x - p1.x,
        y: 2 * p2.y - p1.y
    };

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
