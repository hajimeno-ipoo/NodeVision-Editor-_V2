import { describe, it, expect } from 'vitest';

import { generateLUT3D } from '../../lut/generator';
import { buildColorTransform } from '../../processors/pipeline';
import type { ColorGradingPipeline } from '../../processors/types';

describe('buildColorTransform integration', () => {
    it('should apply basic correction', () => {
        const pipeline: ColorGradingPipeline = {
            basic: {
                exposure: 1,
                brightness: 0,
                contrast: 1,
                saturation: 1,
                gamma: 1
            }
        };

        const transform = buildColorTransform(pipeline);
        const [r, g, b] = transform(0.5, 0.5, 0.5);

        // Exposure +1 should double the values (but clamp to 1)
        expect(r).toBeGreaterThan(0.5);
        expect(g).toBeGreaterThan(0.5);
        expect(b).toBeGreaterThan(0.5);
    });

    it('should apply temperature adjustment', () => {
        const pipeline: ColorGradingPipeline = {
            temperature: 50 // Warm
        };

        const transform = buildColorTransform(pipeline);
        const result = transform(0.5, 0.5, 0.5);

        // Warm temperature should increase red
        expect(result[0]).toBeGreaterThan(0.5);
    });

    it('should apply color wheels', () => {
        const pipeline: ColorGradingPipeline = {
            wheels: {
                lift: { hue: 0, saturation: 0, luminance: 0.1 },
                gamma: { hue: 0, saturation: 0, luminance: 0 },
                gain: { hue: 0, saturation: 0, luminance: 0 }
            }
        };

        const transform = buildColorTransform(pipeline);

        // Lift affects shadows
        const [darkR, darkG, darkB] = transform(0.1, 0.1, 0.1);
        expect(darkR).toBeGreaterThan(0.1);
        expect(darkG).toBeGreaterThan(0.1);
        expect(darkB).toBeGreaterThan(0.1);
    });

    it('should apply RGB curves', () => {
        const pipeline: ColorGradingPipeline = {
            curves: {
                master: [{ x: 0, y: 0 }, { x: 0.5, y: 0.7 }, { x: 1, y: 1 }],
                red: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
                green: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
                blue: [{ x: 0, y: 0 }, { x: 1, y: 1 }]
            }
        };

        const transform = buildColorTransform(pipeline);
        const [r, g, b] = transform(0.5, 0.5, 0.5);

        // Master curve should lift midtones to 0.7
        expect(r).toBeCloseTo(0.7, 1);
        expect(g).toBeCloseTo(0.7, 1);
        expect(b).toBeCloseTo(0.7, 1);
    });

    it('should apply secondary grading', () => {
        const pipeline: ColorGradingPipeline = {
            secondary: [{
                keyer: {
                    hueCenter: 0,
                    hueWidth: 30,
                    hueSoftness: 0,
                    satCenter: 0.75,
                    satWidth: 0.25,
                    satSoftness: 0,
                    lumCenter: 0.5,
                    lumWidth: 0.5,
                    lumSoftness: 0,
                    invert: false
                },
                correction: {
                    saturation: 0.5 // Desaturate reds
                }
            }]
        };

        const transform = buildColorTransform(pipeline);

        // Test red color
        const [r1, g1, b1] = transform(1, 0, 0);

        // Should be less saturated (closer to gray)
        expect(Math.abs(r1 - g1)).toBeLessThan(1);
        expect(Math.abs(r1 - b1)).toBeLessThan(1);
    });

    it('should combine multiple corrections in correct order', () => {
        const pipeline: ColorGradingPipeline = {
            basic: {
                exposure: 0,
                brightness: 0.1,
                contrast: 1.2,
                saturation: 1,
                gamma: 1
            },
            temperature: 10,
            wheels: {
                lift: { hue: 0, saturation: 0, luminance: 0.05 },
                gamma: { hue: 0, saturation: 0, luminance: 0 },
                gain: { hue: 0, saturation: 0, luminance: 0 }
            },
            curves: {
                master: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
                red: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
                green: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
                blue: [{ x: 0, y: 0 }, { x: 1, y: 1 }]
            }
        };

        const transform = buildColorTransform(pipeline);
        const [r, g, b] = transform(0.5, 0.5, 0.5);

        // Should have applied all corrections
        expect(r).toBeDefined();
        expect(g).toBeDefined();
        expect(b).toBeDefined();

        // Values should be clamped to [0, 1]
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(1);
        expect(g).toBeGreaterThanOrEqual(0);
        expect(g).toBeLessThanOrEqual(1);
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThanOrEqual(1);
    });

    it('should preserve pure black', () => {
        const pipeline: ColorGradingPipeline = {
            basic: {
                exposure: 0,
                brightness: 0,
                contrast: 1,
                saturation: 1,
                gamma: 1
            }
        };

        const transform = buildColorTransform(pipeline);
        const [r, g, b] = transform(0, 0, 0);

        expect(r).toBe(0);
        expect(g).toBe(0);
        expect(b).toBe(0);
    });

    it('should preserve pure white with neutral settings', () => {
        const pipeline: ColorGradingPipeline = {
            basic: {
                exposure: 0,
                brightness: 0,
                contrast: 1,
                saturation: 1,
                gamma: 1
            }
        };

        const transform = buildColorTransform(pipeline);
        const [r, g, b] = transform(1, 1, 1);

        // Use toBeCloseTo for floating point comparison
        expect(r).toBeCloseTo(1, 10);
        expect(g).toBeCloseTo(1, 10);
        expect(b).toBeCloseTo(1, 10);
    });

    it('should generate valid LUT from pipeline', () => {
        const pipeline: ColorGradingPipeline = {
            basic: {
                exposure: 0.5,
                brightness: 0,
                contrast: 1.1,
                saturation: 1.2,
                gamma: 1
            },
            temperature: 20,
            tint: -10,
            wheels: {
                lift: { hue: 0, saturation: 0, luminance: 0 },
                gamma: { hue: 0, saturation: 0, luminance: 0.1 },
                gain: { hue: 0, saturation: 0, luminance: 0 }
            }
        };

        const transform = buildColorTransform(pipeline);
        const lut = generateLUT3D(17, transform);

        expect(lut.resolution).toBe(17);
        expect(lut.data.length).toBe(17 * 17 * 17 * 3);

        // Check that all LUT values are valid
        for (let i = 0; i < lut.data.length; i++) {
            expect(lut.data[i]).toBeGreaterThanOrEqual(0);
            expect(lut.data[i]).toBeLessThanOrEqual(1);
            expect(Number.isFinite(lut.data[i])).toBe(true);
        }
    });

    it('should handle edge cases without crashing', () => {
        const extremePipeline: ColorGradingPipeline = {
            basic: {
                exposure: 5,
                brightness: 1,
                contrast: 3,
                saturation: 5,
                gamma: 2
            },
            temperature: 100,
            tint: 100,
            wheels: {
                lift: { hue: 180, saturation: 1, luminance: 1 },
                gamma: { hue: 180, saturation: 1, luminance: 1 },
                gain: { hue: 180, saturation: 1, luminance: 1 }
            },
            curves: {
                master: [{ x: 0, y: 1 }, { x: 1, y: 0 }], // Inverted
                red: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
                green: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
                blue: [{ x: 0, y: 0 }, { x: 1, y: 1 }]
            }
        };

        const transform = buildColorTransform(extremePipeline);

        // Should not crash with various inputs
        expect(() => transform(0, 0, 0)).not.toThrow();
        expect(() => transform(0.5, 0.5, 0.5)).not.toThrow();
        expect(() => transform(1, 1, 1)).not.toThrow();
        expect(() => transform(1, 0, 0)).not.toThrow();
    });
});
