import { HueCurves } from './types';
import { evaluateCurve } from './curve-math';
import { rgbToHSL, hslToRGB, clampRGB } from '../processors/color-math';

// オプション：Rec.709(gamma2.4) で処理したい場合は true
const USE_REC709_GAMMA = true;
const toRec709Linear = (v: number) => Math.pow(v, 2.4);
const fromRec709Linear = (v: number) => Math.pow(v, 1 / 2.4);

/**
 * Apply Hue Curves to an RGB color
 * 
 * @param r - Red channel (0-1)
 * @param g - Green channel (0-1)
 * @param b - Blue channel (0-1)
 * @param curves - Hue curves definition
 * @returns Modified RGB values
 */
export function applyHueCurves(
    r: number,
    g: number,
    b: number,
    curves: HueCurves
): [number, number, number] {
    // Rec.709ガンマを想定した線形域に変換
    let rWork = USE_REC709_GAMMA ? toRec709Linear(r) : r;
    let gWork = USE_REC709_GAMMA ? toRec709Linear(g) : g;
    let bWork = USE_REC709_GAMMA ? toRec709Linear(b) : b;

    // 1. Convert to HSL
    const [h, s, l] = rgbToHSL(rWork, gWork, bWork);

    // Normalize Hue to 0-1 for curve evaluation
    const normalizedHue = h / 360;

    // 2. Apply Hue vs Hue
    // Y=0.5 means no shift. Range is +/- 180 degrees (or similar)
    // We assume Y=0.5 is neutral.
    const hueShiftVal = evaluateCurve(curves.hueVsHue, normalizedHue, true);
    // Map 0.0-1.0 to -180 to +180 degrees shift
    // 0.5 -> 0
    // 1.0 -> +180
    // 0.0 -> -180
    const hueShift = (hueShiftVal - 0.5) * 360;
    let newH = h + hueShift;

    // Normalize new Hue to 0-360
    newH = newH % 360;
    if (newH < 0) newH += 360;

    // 3. Apply Hue vs Saturation
    // Y=0.5 means scale 1.0. Range 0.0 to 2.0x?
    // Or maybe Y is absolute saturation? Usually it's a scaler.
    // Let's assume Y=0.5 is 1.0x, Y=0 is 0.0x, Y=1 is 2.0x
    const satScaleVal = evaluateCurve(curves.hueVsSat, normalizedHue, true);
    const satScale = satScaleVal * 2.0;
    let newS = s * satScale;

    // Clamp Saturation
    newS = Math.max(0, Math.min(1, newS));

    // 4. Apply Hue vs Luma
    // 中央(0.5)を基準に、色を保ったまま明暗を調整
    const lumaVal = evaluateCurve(curves.hueVsLuma, normalizedHue, true);

    // ゲイン計算（中央基準のマッピング）
    // lumaVal = 0.0 → gain = 0.4（さらに明るく、色がはっきり残る）
    // lumaVal = 0.5 → gain = 1.0（変化なし）
    // lumaVal = 1.0 → gain = 4.0（より強く明るく、発光感を出す）
    const gain = lumaVal < 0.5
        ? 1.2 * lumaVal + 0.4   // 下半分: 0.4 〜 1.0
        : 6.0 * lumaVal - 2.0;  // 上半分: 1.0 〜 4.0

    // Hue/Sat 反映後のRGB
    let [newR, newG, newB] = hslToRGB(newH, newS, l);

    // 彩度補正：輝度を下げる時に彩度を上げて、色がくすむのを防ぐ
    if (gain < 1.0) {
        // ゲインが低いほど彩度を上げる（最大1.35倍程度）
        const satBoost = 1.0 + (1.0 - gain) * 0.5;
        newS = Math.min(1.0, newS * satBoost);
        [newR, newG, newB] = hslToRGB(newH, newS, l);
    }
    // ハイライト側の彩度調整：明るくしすぎると色が濃くなりすぎるため、わずかに彩度を抑えて「光の強さ」を表現
    else if (gain > 1.0) {
        // gain=4.0の時、彩度を約0.9倍に
        const satDamp = 1.0 - (gain - 1.0) * 0.03;
        newS = Math.max(0.0, newS * satDamp);
        [newR, newG, newB] = hslToRGB(newH, newS, l);
    }

    // Y'計算（Rec.709係数）
    const currentY = 0.2126 * newR + 0.7152 * newG + 0.0722 * newB;

    // 目標輝度
    const targetY = currentY * gain;

    // RGBを輝度比率でスケーリング
    const scale = currentY > 1e-6 ? targetY / currentY : gain;
    newR *= scale;
    newG *= scale;
    newB *= scale;

    // 表示用にガンマ戻し
    if (USE_REC709_GAMMA) {
        newR = fromRec709Linear(newR);
        newG = fromRec709Linear(newG);
        newB = fromRec709Linear(newB);
    }

    return clampRGB(newR, newG, newB);
}
