import { HueCurves } from './types';
import { evaluateCurve } from './curve-math';
import { rgbToHSL, hslToRGB, clampRGB } from '../processors/color-math';

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
    // 1. Convert to HSL
    const [h, s, l] = rgbToHSL(r, g, b);

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

    // 4. Apply Hue vs Luma（ゲイン＋肩落ち＋シャドウリフトでDaVinci寄せ）
    const lumaVal = evaluateCurve(curves.hueVsLuma, normalizedHue, true);
    // 0.5→1.0倍、1.0→2.0倍、0.0→0.0倍（レンジ広めに戻すが下は0.4で止める）
    const gainRaw = 1 + (lumaVal - 0.5) * 2.0;
    const gainClamped = Math.min(2.0, Math.max(0.4, gainRaw));

    // Hue/Sat 反映後のRGB
    let [newR, newG, newB] = hslToRGB(newH, newS, l);

    // Y' 計算
    const currentY = 0.2126 * newR + 0.7152 * newG + 0.0722 * newB;
    // ハイライト肩落ち（Reinhard風）
    const shoulder = (gainClamped * currentY) / (1 + (gainClamped - 1) * currentY);
    // シャドウリフトで真っ黒回避（0.02〜0.05 好みで。ここでは 0.03）
    const lifted = Math.max(0.03, shoulder);

    // RGBを等比スケール
    const scale = currentY > 1e-6 ? lifted / currentY : lifted;
    newR *= scale;
    newG *= scale;
    newB *= scale;

    return clampRGB(newR, newG, newB);
}
