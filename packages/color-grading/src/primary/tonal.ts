/**
 * Tonal corrections for different luminance ranges
 * Allows independent adjustment of shadows, midtones, and highlights
 */

import { getLuminance, clampRGB } from '../processors/color-math.js';
import type { TonalCorrection } from './types.js';

/**
 * Generate a soft mask for a specific tonal range
 * Uses smooth falloff for natural blending
 * 
 * @param luma - Luminance value (0-1)
 * @param center - Center of the range (0-1)
 * @param width - Width of the falloff
 * @returns Mask strength (0-1)
 */
function generateTonalMask(luma: number, center: number, width: number): number {
    const distance = Math.abs(luma - center);
    const falloff = Math.max(0, 1 - distance / width);

    // Smooth step for natural blending
    return falloff * falloff * (3 - 2 * falloff);
}

/**
 * Apply tonal corrections to RGB
 * Adjusts shadows, midtones, and highlights independently
 * 
 * @param r - Red channel (0-1)
 * @param g - Green channel (0-1)
 * @param b - Blue channel (0-1)
 * @param tonal - Tonal correction settings
 * @returns Adjusted RGB
 */
export function applyTonalCorrection(
    r: number,
    g: number,
    b: number,
    tonal: TonalCorrection
): [number, number, number] {
    // Calculate luminance for mask generation
    const luma = getLuminance(r, g, b);

    // Shadow mask: strongest at luma = 0, fades out by 0.5
    const shadowMask = tonal.shadows !== 0
        ? generateTonalMask(luma, 0, 0.5)
        : 0;

    // Midtone mask: strongest at luma = 0.5, fades out by 0.3 on each side
    const midtoneMask = tonal.midtones !== 0
        ? generateTonalMask(luma, 0.5, 0.3)
        : 0;

    // Highlight mask: strongest at luma = 1, fades out by 0.5
    const highlightMask = tonal.highlights !== 0
        ? generateTonalMask(luma, 1, 0.5)
        : 0;

    // Calculate total adjustment
    // Normalize adjustments from -100~100 to -0.2~0.2 for lift
    const shadowLift = (tonal.shadows / 100) * 0.2 * shadowMask;
    const midtoneLift = (tonal.midtones / 100) * 0.2 * midtoneMask;
    const highlightLift = (tonal.highlights / 100) * 0.2 * highlightMask;

    const totalLift = shadowLift + midtoneLift + highlightLift;

    // Apply adjustment
    return clampRGB(
        r + totalLift,
        g + totalLift,
        b + totalLift
    );
}
