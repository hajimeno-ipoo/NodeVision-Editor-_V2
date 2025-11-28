/**
 * 3D LUT Generator
 * Generates look-up tables for color grading transformations
 */

import type { LUT3D, LUTResolution, ColorTransformFunction } from './types.js';

/**
 * Generate a 3D LUT from a color transformation function
 * 
 * @param resolution - Size of the LUT (17, 33, or 65)
 * @param colorTransform - Function that transforms RGB input to RGB output
 * @returns 3D LUT data structure
 * 
 * @example
 * ```ts
 * // Identity LUT (pass-through)
 * const lut = generateLUT3D(33, (r, g, b) => [r, g, b]);
 * 
 * // Brightness +0.1
 * const lut = generateLUT3D(33, (r, g, b) => [r + 0.1, g + 0.1, b + 0.1]);
 * ```
 */
export function generateLUT3D(
    resolution: LUTResolution,
    colorTransform: ColorTransformFunction
): LUT3D {
    // Allocate Float32Array for RGB data
    // Size: resolution³ entries × 3 channels (RGB)
    const size = resolution ** 3 * 3;
    const data = new Float32Array(size);

    let dataIndex = 0;

    // Iterate through all possible RGB combinations
    // Order: Blue (outer) → Green → Red (inner)
    // This matches the standard LUT cube format
    for (let b = 0; b < resolution; b++) {
        for (let g = 0; g < resolution; g++) {
            for (let r = 0; r < resolution; r++) {
                // Normalize to 0.0 - 1.0 range
                const normR = r / (resolution - 1);
                const normG = g / (resolution - 1);
                const normB = b / (resolution - 1);

                // Apply color transformation
                const [outR, outG, outB] = colorTransform(normR, normG, normB);

                // Clamp output to valid range [0, 1]
                data[dataIndex++] = Math.max(0, Math.min(1, outR));
                data[dataIndex++] = Math.max(0, Math.min(1, outG));
                data[dataIndex++] = Math.max(0, Math.min(1, outB));
            }
        }
    }

    return { resolution, data };
}

/**
 * Generate an identity LUT (pass-through, no color change)
 * Useful for testing and validation
 * 
 * @param resolution - Size of the LUT
 * @returns Identity LUT
 */
export function generateIdentityLUT(resolution: LUTResolution): LUT3D {
    return generateLUT3D(resolution, (r, g, b) => [r, g, b]);
}

/**
 * Validate LUT data integrity
 * 
 * @param lut - LUT to validate
 * @returns true if valid, false otherwise
 */
export function validateLUT(lut: LUT3D): boolean {
    const expectedSize = lut.resolution ** 3 * 3;

    if (lut.data.length !== expectedSize) {
        console.error(`[LUT] Invalid data size: expected ${expectedSize}, got ${lut.data.length}`);
        return false;
    }

    // Check for NaN or invalid values
    for (let i = 0; i < lut.data.length; i++) {
        const value = lut.data[i];
        if (isNaN(value) || value < 0 || value > 1) {
            console.error(`[LUT] Invalid value at index ${i}: ${value}`);
            return false;
        }
    }

    return true;
}
