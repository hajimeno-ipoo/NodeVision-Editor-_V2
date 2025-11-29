import { getLuminance } from '../processors/color-math';

export interface LumaKeyParams {
    center: number;   // 0.0 - 1.0
    width: number;    // 0.0 - 1.0
    softness: number; // 0.0 - 1.0
}

/**
 * Generate a luminance key mask
 * 
 * @param r - Red channel (0-1)
 * @param g - Green channel (0-1)
 * @param b - Blue channel (0-1)
 * @param params - Luma key parameters
 * @returns Alpha value (0.0 = transparent, 1.0 = opaque)
 */
export function calculateLumaKey(
    r: number,
    g: number,
    b: number,
    params: LumaKeyParams
): number {
    const luma = getLuminance(r, g, b);

    // Calculate distance from center
    const dist = Math.abs(luma - params.center);

    // Hard cutoff width (half width)
    const halfWidth = params.width / 2;

    // If within the hard width, it's fully selected
    if (dist <= halfWidth) {
        return 1.0;
    }

    // Softness range
    // Softness extends outside the width
    // 0.0 softness means hard edge
    // 1.0 softness means falloff is equal to width? Or some other scale?
    // Let's define softness as an additional range outside width.
    // If softness is 0, falloff is instant.
    // If softness is > 0, falloff happens over (softness * 0.5) distance?
    // A common approach:
    // range = halfWidth
    // feather = softness
    // if dist < range: 1.0
    // if dist > range + feather: 0.0
    // else: smooth interpolation

    // Let's use a normalized softness relative to the remaining space or fixed amount?
    // DaVinci Resolve style: Softness is usually an absolute value added to the range.

    // Let's assume softness is a value 0.0-1.0 that represents the falloff distance.
    // However, to keep it proportional, maybe just add it.

    const feather = Math.max(0.0001, params.softness * 0.5); // Avoid division by zero

    if (dist >= halfWidth + feather) {
        return 0.0;
    }

    // Linear falloff
    // dist is between halfWidth and halfWidth + feather
    // (halfWidth + feather - dist) / feather
    // when dist = halfWidth, result = 1.0
    // when dist = halfWidth + feather, result = 0.0

    return (halfWidth + feather - dist) / feather;
}
