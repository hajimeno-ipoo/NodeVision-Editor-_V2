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
    const hueShiftVal = evaluateCurve(curves.hueVsHue, normalizedHue);
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
    const satScaleVal = evaluateCurve(curves.hueVsSat, normalizedHue);
    const satScale = satScaleVal * 2.0;
    let newS = s * satScale;

    // Clamp Saturation
    newS = Math.max(0, Math.min(1, newS));

    // 4. Apply Hue vs Luma
    // Y=0.5 means no change.
    // This modifies Lightness (L) based on Hue.
    const lumaOffsetVal = evaluateCurve(curves.hueVsLuma, normalizedHue);
    // Map 0.0-1.0 to -1.0 to +1.0 offset? Or smaller range?
    // Let's try +/- 0.5 for smoother control, or +/- 1.0 for full range.
    // Let's use +/- 1.0
    const lumaOffset = (lumaOffsetVal - 0.5) * 2.0;
    let newL = l + lumaOffset;

    // Clamp Lightness
    newL = Math.max(0, Math.min(1, newL));

    // 5. Convert back to RGB
    const [newR, newG, newB] = hslToRGB(newH, newS, newL);

    return clampRGB(newR, newG, newB);
}
