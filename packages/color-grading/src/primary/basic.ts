/**
 * Basic color correction operations
 * Implements fundamental adjustments: exposure, brightness, contrast, saturation, gamma
 */

import { rgbToHSL, hslToRGB, clampRGB } from '../processors/color-math.js';
import type { BasicCorrection } from './types.js';

/**
 * Apply exposure adjustment
 * Exponential brightness change measured in EV (Exposure Value)
 * 
 * @param r - Red channel (0-1)
 * @param g - Green channel (0-1)
 * @param b - Blue channel (0-1)
 * @param exposure - EV adjustment (-3 to 3)
 * @returns Adjusted RGB
 */
export function applyExposure(
    r: number,
    g: number,
    b: number,
    exposure: number
): [number, number, number] {
    const factor = Math.pow(2, exposure);
    return [r * factor, g * factor, b * factor];
}

/**
 * Apply brightness adjustment
 * Linear offset to all channels
 * 
 * @param r - Red channel (0-1)
 * @param g - Green channel (0-1)
 * @param b - Blue channel (0-1)
 * @param brightness - Brightness offset (-1 to 1)
 * @returns Adjusted RGB
 */
export function applyBrightness(
    r: number,
    g: number,
    b: number,
    brightness: number
): [number, number, number] {
    return [r + brightness, g + brightness, b + brightness];
}

/**
 * Apply contrast adjustment
 * Scales values around midpoint (0.5)
 * 
 * @param r - Red channel (0-1)
 * @param g - Green channel (0-1)
 * @param b - Blue channel (0-1)
 * @param contrast - Contrast multiplier (0 to 3, 1 = no change)
 * @returns Adjusted RGB
 */
export function applyContrast(
    r: number,
    g: number,
    b: number,
    contrast: number
): [number, number, number] {
    const adjustChannel = (c: number): number => {
        return (c - 0.5) * contrast + 0.5;
    };

    return [adjustChannel(r), adjustChannel(g), adjustChannel(b)];
}

/**
 * Apply saturation adjustment
 * Preserves luminance while adjusting color intensity
 * 
 * @param r - Red channel (0-1)
 * @param g - Green channel (0-1)
 * @param b - Blue channel (0-1)
 * @param saturation - Saturation multiplier (0 to 3, 1 = no change)
 * @returns Adjusted RGB
 */
export function applySaturation(
    r: number,
    g: number,
    b: number,
    saturation: number
): [number, number, number] {
    const [h, s, l] = rgbToHSL(r, g, b);
    const newS = Math.max(0, Math.min(1, s * saturation));
    return hslToRGB(h, newS, l);
}

/**
 * Apply gamma adjustment
 * Power curve transformation
 * 
 * @param r - Red channel (0-1)
 * @param g - Green channel (0-1)
 * @param b - Blue channel (0-1)
 * @param gamma - Gamma value (0.1 to 3, 1 = no change)
 * @returns Adjusted RGB
 */
export function applyGamma(
    r: number,
    g: number,
    b: number,
    gamma: number
): [number, number, number] {
    const invGamma = 1 / gamma;

    return [
        Math.pow(Math.max(0, r), invGamma),
        Math.pow(Math.max(0, g), invGamma),
        Math.pow(Math.max(0, b), invGamma)
    ];
}

/**
 * Apply all basic corrections in sequence
 * Order: Exposure → Brightness → Contrast → Saturation → Gamma
 * 
 * @param r - Red channel (0-1)
 * @param g - Green channel (0-1)
 * @param b - Blue channel (0-1)
 * @param correction - Basic correction settings
 * @returns Adjusted RGB
 */
export function applyBasicCorrection(
    r: number,
    g: number,
    b: number,
    correction: BasicCorrection
): [number, number, number] {
    // 1. Exposure
    if (correction.exposure !== 0) {
        [r, g, b] = applyExposure(r, g, b, correction.exposure);
    }

    // 2. Brightness
    if (correction.brightness !== 0) {
        [r, g, b] = applyBrightness(r, g, b, correction.brightness);
    }

    // 3. Contrast
    if (correction.contrast !== 1) {
        [r, g, b] = applyContrast(r, g, b, correction.contrast);
    }

    // 4. Saturation
    if (correction.saturation !== 1) {
        [r, g, b] = applySaturation(r, g, b, correction.saturation);
    }

    // 5. Gamma
    if (correction.gamma !== 1) {
        [r, g, b] = applyGamma(r, g, b, correction.gamma);
    }

    return clampRGB(r, g, b);
}
