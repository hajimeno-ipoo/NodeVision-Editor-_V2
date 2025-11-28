/**
 * HSL Keyer Implementation
 * Isolates specific colors based on Hue, Saturation, and Luminance ranges.
 */

import { rgbToHSL, clamp01 } from '../processors/color-math';

export interface HSLKeyerParams {
    // Hue (0-360)
    hueCenter: number;
    hueWidth: number;
    hueSoftness: number;

    // Saturation (0-1)
    satCenter: number;
    satWidth: number;
    satSoftness: number;

    // Luminance (0-1)
    lumCenter: number;
    lumWidth: number;
    lumSoftness: number;

    // Invert selection
    invert: boolean;
}

/**
 * Calculate the key (alpha mask) for a given RGB color
 * 
 * @param r - Red (0-1)
 * @param g - Green (0-1)
 * @param b - Blue (0-1)
 * @param params - Keyer parameters
 * @returns Key value (0-1, where 1 is selected)
 */
export function calculateHSLKey(
    r: number,
    g: number,
    b: number,
    params: HSLKeyerParams
): number {
    const [h, s, l] = rgbToHSL(r, g, b);

    // Hue distance calculation (circular)
    let hueDist = Math.abs(h - params.hueCenter);
    if (hueDist > 180) {
        hueDist = 360 - hueDist;
    }

    // Calculate component masks
    const hMask = calculateComponentMask(hueDist, params.hueWidth, params.hueSoftness);
    const sMask = calculateComponentMask(Math.abs(s - params.satCenter), params.satWidth, params.satSoftness);
    const lMask = calculateComponentMask(Math.abs(l - params.lumCenter), params.lumWidth, params.lumSoftness);

    // Combine masks
    let key = hMask * sMask * lMask;

    if (params.invert) {
        key = 1.0 - key;
    }

    return key;
}

/**
 * Calculate mask for a single component using smoothstep-like falloff
 * 
 * @param distance - Distance from center
 * @param width - Selection width (half-width)
 * @param softness - Falloff width
 * @returns Mask value (0-1)
 */
function calculateComponentMask(distance: number, width: number, softness: number): number {
    // If inside the hard width, return 1.0
    if (distance <= width) {
        return 1.0;
    }

    // If outside width + softness, return 0.0
    if (distance >= width + softness) {
        return 0.0;
    }

    // Falloff region
    // Map [width, width + softness] to [1, 0]
    const t = (distance - width) / Math.max(0.0001, softness);
    return 1.0 - clamp01(t);
}
