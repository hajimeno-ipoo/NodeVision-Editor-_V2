/**
 * Color temperature and tint adjustments
 * Implements white balance controls similar to professional grading tools
 */

import { clampRGB } from '../processors/color-math.js';

/**
 * Apply color temperature adjustment
 * Simulates warming (positive) or cooling (negative) the image
 * 
 * Temperature scale: -100 (cool/blue) to +100 (warm/orange)
 * 
 * @param r - Red channel (0-1)
 * @param g - Green channel (0-1)
 * @param b - Blue channel (0-1)
 * @param temperature - Temperature adjustment (-100 to 100)
 * @returns Adjusted RGB
 */
export function applyTemperature(
    r: number,
    g: number,
    b: number,
    temperature: number
): [number, number, number] {
    // Normalize temperature to -1.0 ~ 1.0
    const tempFactor = temperature / 100;

    // Warm: increase red, decrease blue
    // Cool: decrease red, increase blue
    const redMultiplier = 1 + tempFactor * 0.3;
    const blueMultiplier = 1 - tempFactor * 0.3;

    return [
        r * redMultiplier,
        g,
        b * blueMultiplier
    ];
}

/**
 * Apply tint adjustment
 * Shifts the color balance between green and magenta
 * 
 * Tint scale: -100 (magenta) to +100 (green)
 * 
 * @param r - Red channel (0-1)
 * @param g - Green channel (0-1)
 * @param b - Blue channel (0-1)
 * @param tint - Tint adjustment (-100 to 100)
 * @returns Adjusted RGB
 */
export function applyTint(
    r: number,
    g: number,
    b: number,
    tint: number
): [number, number, number] {
    // Normalize tint to -1.0 ~ 1.0
    const tintFactor = tint / 100;

    // Positive: increase green
    // Negative: increase red and blue (magenta is opposite of green)
    const greenMultiplier = 1 + tintFactor * 0.2;

    return [
        r,
        g * greenMultiplier,
        b
    ];
}

/**
 * Apply both temperature and tint adjustments
 * 
 * @param r - Red channel (0-1)
 * @param g - Green channel (0-1)
 * @param b - Blue channel (0-1)
 * @param temperature - Temperature adjustment (-100 to 100)
 * @param tint - Tint adjustment (-100 to 100)
 * @returns Adjusted RGB
 */
export function applyTemperatureAndTint(
    r: number,
    g: number,
    b: number,
    temperature: number,
    tint: number
): [number, number, number] {
    // Apply temperature first
    if (temperature !== 0) {
        [r, g, b] = applyTemperature(r, g, b, temperature);
    }

    // Then apply tint
    if (tint !== 0) {
        [r, g, b] = applyTint(r, g, b, tint);
    }

    return clampRGB(r, g, b);
}
