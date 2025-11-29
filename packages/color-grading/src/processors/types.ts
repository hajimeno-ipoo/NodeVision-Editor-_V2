/**
 * Complete color grading pipeline configuration
 */

import type { RGBCurves, HueCurves } from '../curves/types';
import type { BasicCorrection, TonalCorrection, ColorWheels } from '../primary/types';
import type { HSLKeyerParams } from '../secondary/hsl-keyer';

export type { HSLKeyerParams };

export interface SecondaryCorrection {
    keyer: HSLKeyerParams;
    correction: {
        saturation?: number; // multiplier (1.0 = no change)
        hueShift?: number;   // degrees shift
        brightness?: number; // offset
    };
}

/**
 * Complete color grading pipeline
 * All corrections are optional and applied in a specific order
 */
export interface ColorGradingPipeline {
    /** Basic corrections (exposure, brightness, contrast, saturation, gamma) */
    basic?: BasicCorrection;

    /** Color temperature adjustment (-100 to 100, Kelvin) */
    temperature?: number;

    /** Tint adjustment (-100 to 100, Green/Magenta) */
    tint?: number;

    /** Color wheels (Lift/Gamma/Gain) */
    wheels?: ColorWheels;

    /** Tonal corrections (shadows, midtones, highlights) */
    tonal?: TonalCorrection;

    /** RGB Curves (Master, R, G, B) */
    curves?: RGBCurves;

    /** Hue Curves (Hue vs Hue, Hue vs Sat, Hue vs Luma) */
    hueCurves?: HueCurves;

    /** Secondary corrections (HSL Keyer + Adjustment) */
    secondary?: SecondaryCorrection[];
}
