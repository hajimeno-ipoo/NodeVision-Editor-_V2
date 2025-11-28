/**
 * Color grading pipeline
 * Combines all correction types in the correct order
 */

import { applyRGBCurves } from '../curves/rgb-curves';
import type { ColorTransformFunction } from '../lut/types';
import { applyBasicCorrection } from '../primary/basic';
import { applyTemperature, applyTint } from '../primary/temperature';
import { applyTonalCorrection } from '../primary/tonal';
import { applyColorWheels } from '../primary/wheels';

import { calculateHSLKey } from '../secondary/hsl-keyer';
import { rgbToHSL, hslToRGB, sRGBToLinear, linearToSRGB } from './color-math';
import type { ColorGradingPipeline } from './types';

/**
 * Build a single color transform function from a complete grading pipeline
 * All operations are applied in a specific order for consistency
 * 
 * @param pipeline - Complete color grading pipeline configuration
 * @returns Color transform function suitable for LUT generation
 */
export function buildColorTransform(pipeline: ColorGradingPipeline): ColorTransformFunction {
    return (r: number, g: number, b: number): [number, number, number] => {
        // Step 1: Convert from sRGB to linear
        let [rLin, gLin, bLin] = sRGBToLinear(r, g, b);

        // Step 2: Apply basic corrections (exposure, brightness, contrast, saturation, gamma)
        if (pipeline.basic) {
            [rLin, gLin, bLin] = applyBasicCorrection(rLin, gLin, bLin, pipeline.basic);
        }

        // Step 3: Apply temperature and tint adjustments
        if (typeof pipeline.temperature === 'number' && pipeline.temperature !== 0) {
            [rLin, gLin, bLin] = applyTemperature(rLin, gLin, bLin, pipeline.temperature);
        }
        if (typeof pipeline.tint === 'number' && pipeline.tint !== 0) {
            [rLin, gLin, bLin] = applyTint(rLin, gLin, bLin, pipeline.tint);
        }

        // Step 4: Apply color wheels (Lift/Gamma/Gain)
        if (pipeline.wheels) {
            [rLin, gLin, bLin] = applyColorWheels(rLin, gLin, bLin, pipeline.wheels);
        }

        // Step 5: Apply tonal corrections (shadows, midtones, highlights)
        if (pipeline.tonal) {
            [rLin, gLin, bLin] = applyTonalCorrection(rLin, gLin, bLin, pipeline.tonal);
        }

        // Step 6: Convert back to sRGB
        let [rOut, gOut, bOut] = linearToSRGB(rLin, gLin, bLin);



        // Step 7: Apply RGB curves (in sRGB space)
        if (pipeline.curves) {
            [rOut, gOut, bOut] = applyRGBCurves(rOut, gOut, bOut, pipeline.curves);
        }

        // Step 8: Apply Secondary Corrections
        if (pipeline.secondary && pipeline.secondary.length > 0) {
            for (const sec of pipeline.secondary) {
                // Calculate key (alpha mask)
                const key = calculateHSLKey(rOut, gOut, bOut, sec.keyer);

                if (key > 0) {
                    // Apply corrections if key is active
                    let [h, s, l] = rgbToHSL(rOut, gOut, bOut);

                    // Saturation adjustment
                    if (sec.correction.saturation !== undefined) {
                        s *= sec.correction.saturation;
                    }

                    // Hue shift
                    if (sec.correction.hueShift !== undefined) {
                        h += sec.correction.hueShift;
                        if (h > 360) h -= 360;
                        if (h < 0) h += 360;
                    }

                    // Brightness (Luminance) adjustment
                    if (sec.correction.brightness !== undefined) {
                        l += sec.correction.brightness;
                        l = Math.max(0, Math.min(1, l));
                    }

                    // Convert back to RGB
                    const [rCorr, gCorr, bCorr] = hslToRGB(h, s, l);

                    // Mix original and corrected based on key
                    rOut = rOut * (1 - key) + rCorr * key;
                    gOut = gOut * (1 - key) + gCorr * key;
                    bOut = bOut * (1 - key) + bCorr * key;
                }
            }
        }

        // Clamp to valid range
        return [
            Math.max(0, Math.min(1, rOut)),
            Math.max(0, Math.min(1, gOut)),
            Math.max(0, Math.min(1, bOut)),
        ];
    };
}

/**
 * Build a color grading pipeline configuration for legacy colorCorrection nodes
 * Maps old parameter names to the new pipeline structure
 * 
 * @param settings - Legacy color correction settings
 * @returns Color grading pipeline configuration
 */
export function buildLegacyColorCorrectionPipeline(settings: {
    exposure?: number;
    brightness?: number;
    contrast?: number;
    saturation?: number;
    gamma?: number;
    shadows?: number;
    highlights?: number;
    temperature?: number;
    tint?: number;
}): ColorGradingPipeline {
    return {
        basic: {
            exposure: settings.exposure ?? 0,
            brightness: settings.brightness ?? 0,
            contrast: settings.contrast ?? 1,
            saturation: settings.saturation ?? 1,
            gamma: settings.gamma ?? 1,
        },
        temperature: settings.temperature ?? 0,
        tint: settings.tint ?? 0,
        tonal: {
            shadows: settings.shadows ?? 0,
            midtones: 0, // Legacy node doesn't have midtones
            highlights: settings.highlights ?? 0,
        },
    };
}

/**
 * Build a color transformation specifically for legacy colorCorrection nodes
 * Maps old parameter names to the new pipeline structure
 * 
 * @param settings - Legacy color correction settings
 * @returns Color transformation function
 */
export function buildLegacyColorCorrectionTransform(settings: {
    exposure?: number;
    brightness?: number;
    contrast?: number;
    saturation?: number;
    gamma?: number;
    shadows?: number;
    highlights?: number;
    temperature?: number;
    tint?: number;
}): ColorTransformFunction {
    const pipeline = buildLegacyColorCorrectionPipeline(settings);
    return buildColorTransform(pipeline);
}
