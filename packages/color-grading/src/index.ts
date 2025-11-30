/**
 * @nodevision/color-grading
 * Professional color grading system using 3D LUTs
 */

// LUT generation and export
export { generateLUT3D, generateIdentityLUT, validateLUT } from './lut/generator.js';
export { exportCubeLUT } from './lut/exporter.js';
export { parseCubeLUT, validateImportedLUT, CubeParseError } from './lut/parser.js';
export type { LUT3D, LUTResolution, LUTMetadata, ColorTransformFunction } from './lut/types.js';

// Primary color correction
export type { BasicCorrection, TonalCorrection, ColorWheelControl, ColorWheels } from './primary/types.js';
export {
    applyBasicCorrection,
    applyExposure,
    applyBrightness,
    applyContrast,
    applySaturation,
    applyGamma
} from './primary/basic.js';
export { applyTemperature, applyTint } from './primary/temperature.js';
export { applyTonalCorrection } from './primary/tonal.js';
export { applyColorWheels, applyLift, applyGamma as applyGammaWheel, applyGain, colorWheelToRGB } from './primary/wheels.js';

// Curves
export type { CurvePoint, Curve, RGBCurves, HueCurves } from './curves/types.js';
export { DEFAULT_CURVE, DEFAULT_FLAT_CURVE, DEFAULT_RGB_CURVES, DEFAULT_HUE_CURVES } from './curves/types.js';
export {
    evaluateCurve,
    curveTolookupTable,
    addCurvePoint,
    removeCurvePoint,
    resetCurve
} from './curves/curve-math.js';
export {
    applyRGBCurves,
    precomputeRGBCurvesLUT,
    applyRGBCurvesWithLUT,
    hasRGBCurvesModified
} from './curves/rgb-curves.js';

// Color processing pipeline
export type { ColorGradingPipeline } from './processors/types.js';
export { buildColorTransform, buildLegacyColorCorrectionTransform, buildLegacyColorCorrectionPipeline } from './processors/pipeline.js';
export * from './processors/color-math.js';
export * from './secondary/hsl-keyer.js';
export * from './secondary/luma-key.js';
