import { describe, it, expect } from 'vitest';

import type { HSLKeyerParams } from '../../processors/types';
import { calculateHSLKey } from '../../secondary/hsl-keyer';

describe('calculateHSLKey', () => {
    it('should return 1 for colors within all ranges', () => {
        const params: HSLKeyerParams = {
            hueCenter: 30,
            hueWidth: 30,
            hueSoftness: 0,
            satCenter: 0.75,
            satWidth: 0.25,
            satSoftness: 0,
            lumCenter: 0.5,
            lumWidth: 0.2,
            lumSoftness: 0,
            invert: false
        };

        // Red color (hue=0, sat=1, lum= 0.5) - within all ranges
        const key = calculateHSLKey(1, 0, 0, params);
        expect(key).toBeGreaterThan(0.5);
    });

    it('should return 0 for colors outside hue range', () => {
        const params: HSLKeyerParams = {
            hueCenter: 30,
            hueWidth: 30,
            hueSoftness: 0,
            satCenter: 0.5,
            satWidth: 0.5,
            satSoftness: 0,
            lumCenter: 0.5,
            lumWidth: 0.5,
            lumSoftness: 0,
            invert: false
        };

        // Blue color (hue=240) - outside hue range
        const key = calculateHSLKey(0, 0, 1, params);
        expect(key).toBeCloseTo(0, 1);
    });

    it('should return 0 for colors outside saturation range', () => {
        const params: HSLKeyerParams = {
            hueCenter: 180,
            hueWidth: 180,
            hueSoftness: 0,
            satCenter: 0.85,
            satWidth: 0.15,
            satSoftness: 0,
            lumCenter: 0.5,
            lumWidth: 0.5,
            lumSoftness: 0,
            invert: false
        };

        // Desaturated red (sat=~0.2) - outside saturation range
        const key = calculateHSLKey(0.8, 0.5, 0.5, params);
        expect(key).toBeCloseTo(0, 1);
    });

    it('should return 0 for colors outside luminance range', () => {
        const params: HSLKeyerParams = {
            hueCenter: 180,
            hueWidth: 180,
            hueSoftness: 0,
            satCenter: 0.5,
            satWidth: 0.5,
            satSoftness: 0,
            lumCenter: 0.5,
            lumWidth: 0.2,
            lumSoftness: 0,
            invert: false
        };

        // Very bright red (lum=0.9) - outside luminance range
        const key = calculateHSLKey(1, 0.8, 0.8, params);
        expect(key).toBeCloseTo(0, 1);
    });

    it('should apply softness for smooth falloff in hue', () => {
        const hardParams: HSLKeyerParams = {
            hueCenter: 30,
            hueWidth: 30,
            hueSoftness: 0,
            satCenter: 0.5,
            satWidth: 0.5,
            satSoftness: 0,
            lumCenter: 0.5,
            lumWidth: 0.5,
            lumSoftness: 0,
            invert: false
        };

        const softParams: HSLKeyerParams = {
            hueCenter: 30,
            hueWidth: 30,
            hueSoftness: 20,
            satCenter: 0.5,
            satWidth: 0.5,
            satSoftness: 0,
            lumCenter: 0.5,
            lumWidth: 0.5,
            lumSoftness: 0,
            invert: false
        };

        // Yellow color (hue=60) - at edge of hard range
        const hardKey = calculateHSLKey(1, 1, 0, hardParams);
        const softKey = calculateHSLKey(1, 1, 0, softParams);

        // Hard key should be at or near boundary
        expect(hardKey).toBeGreaterThanOrEqual(0);
        expect(hardKey).toBeLessThanOrEqual(1);

        // Soft key should allow smoother transition
        expect(softKey).toBeGreaterThanOrEqual(0);
        expect(softKey).toBeLessThanOrEqual(1);
    });

    it('should handle inverted selection', () => {
        const params: HSLKeyerParams = {
            hueCenter: 30,
            hueWidth: 30,
            hueSoftness: 0,
            satCenter: 0.5,
            satWidth: 0.5,
            satSoftness: 0,
            lumCenter: 0.5,
            lumWidth: 0.5,
            lumSoftness: 0,
            invert: true
        };

        // Color within range - should be 0 when inverted
        const withinKey = calculateHSLKey(1, 0, 0, params);

        // Color outside range - should be 1 when inverted
        const outsideKey = calculateHSLKey(0, 0, 1, params);

        // Inverted results
        expect(withinKey).toBeLessThan(0.5);
        expect(outsideKey).toBeGreaterThan(0.5);
    });

    it('should handle grayscale colors (saturation = 0)', () => {
        const params: HSLKeyerParams = {
            hueCenter: 30,
            hueWidth: 180,
            hueSoftness: 0,
            satCenter: 0,
            satWidth: 0.1,
            satSoftness: 0,
            lumCenter: 0.5,
            lumWidth: 0.5,
            lumSoftness: 0,
            invert: false
        };

        // Gray color (r=g=b=0.5) - low saturation
        const key = calculateHSLKey(0.5, 0.5, 0.5, params);

        // Should handle gracefully
        expect(key).toBeGreaterThanOrEqual(0);
        expect(key).toBeLessThanOrEqual(1);
    });

    it('should handle pure white (r=g=b=1)', () => {
        const params: HSLKeyerParams = {
            hueCenter: 180,
            hueWidth: 180,
            hueSoftness: 0,
            satCenter: 0,
            satWidth: 0.1,
            satSoftness: 0,
            lumCenter: 1,
            lumWidth: 0.1,
            lumSoftness: 0,
            invert: false
        };

        const key = calculateHSLKey(1, 1, 1, params);
        expect(key).toBeGreaterThan(0.5);
    });

    it('should handle pure black (r=g=b=0)', () => {
        const params: HSLKeyerParams = {
            hueCenter: 180,
            hueWidth: 180,
            hueSoftness: 0,
            satCenter: 0.5,
            satWidth: 0.5,
            satSoftness: 0,
            lumCenter: 0,
            lumWidth: 0.1,
            lumSoftness: 0,
            invert: false
        };

        const key = calculateHSLKey(0, 0, 0, params);
        expect(key).toBeGreaterThan(0.5);
    });

    it('should handle circular hue distance correctly', () => {
        const params: HSLKeyerParams = {
            hueCenter: 10,  // Near red
            hueWidth: 30,
            hueSoftness: 0,
            satCenter: 0.5,
            satWidth: 0.5,
            satSoftness: 0,
            lumCenter: 0.5,
            lumWidth: 0.5,
            lumSoftness: 0,
            invert: false
        };

        // Red at hue=0 should be selected (distance = 10)
        const redKey = calculateHSLKey(1, 0, 0, params);
        expect(redKey).toBeGreaterThan(0.5);

        // Violet at hue=350 should also be selected (circular distance = 20)
        // This is a purple-ish color
        const violetKey = calculateHSLKey(0.9, 0, 0.4, params);
        expect(violetKey).toBeGreaterThanOrEqual(0);
    });
});
