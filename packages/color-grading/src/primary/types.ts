/**
 * Primary color correction settings
 */

/**
 * Basic color correction parameters
 */
export interface BasicCorrection {
    /** Exposure adjustment in EV (-3.0 to 3.0) */
    exposure: number;

    /** Brightness adjustment (-1.0 to 1.0) */
    brightness: number;

    /** Contrast adjustment (0.0 to 3.0, 1.0 = no change) */
    contrast: number;

    /** Saturation adjustment (0.0 to 3.0, 1.0 = no change) */
    saturation: number;

    /** Gamma adjustment (0.1 to 3.0, 1.0 = no change) */
    gamma: number;
}

/**
 * Tonal correction for different luminance ranges
 */
export interface TonalCorrection {
    /** Shadows adjustment (-100 to 100) */
    shadows: number;

    /** Midtones adjustment (-100 to 100) */
    midtones: number;

    /** Highlights adjustment (-100 to 100) */
    highlights: number;
}

/**
 * Color wheel control (Lift/Gamma/Gain)
 */
export interface ColorWheelControl {
    /** Hue in degrees (0 to 360) */
    hue: number;

    /** Saturation (0.0 to 1.0) */
    saturation: number;

    /** Luminance adjustment (-1.0 to 1.0) */
    luminance: number;
}

/**
 * Complete color wheel settings
 */
export interface ColorWheels {
    /** Lift controls (affects shadows) */
    lift: ColorWheelControl;

    /** Gamma controls (affects midtones) */
    gamma: ColorWheelControl;

    /** Gain controls (affects highlights) */
    gain: ColorWheelControl;
}
