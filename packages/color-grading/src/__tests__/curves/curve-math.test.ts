import { describe, it, expect } from 'vitest';

import { evaluateCurve } from '../../curves/curve-math';
import type { CurvePoint } from '../../curves/types';

describe('evaluateCurve', () => {
    it('should return correct values for a linear curve', () => {
        const curve: CurvePoint[] = [
            { x: 0, y: 0 },
            { x: 1, y: 1 }
        ];

        expect(evaluateCurve(curve, 0)).toBe(0);
        expect(evaluateCurve(curve, 0.5)).toBe(0.5);
        expect(evaluateCurve(curve, 1)).toBe(1);
    });

    it('should handle values below the curve range', () => {
        const curve: CurvePoint[] = [
            { x: 0, y: 0.2 },
            { x: 1, y: 0.8 }
        ];

        // x <= 0 should return 0 (clamped to 0)
        expect(evaluateCurve(curve, -0.1)).toBe(0);
    });

    it('should handle values above the curve range', () => {
        const curve: CurvePoint[] = [
            { x: 0, y: 0.2 },
            { x: 1, y: 0.8 }
        ];

        // x >= 1 should return 1 (clamped to 1)
        expect(evaluateCurve(curve, 1.1)).toBe(1);
    });

    it('should interpolate correctly with 3 points', () => {
        const curve: CurvePoint[] = [
            { x: 0, y: 0 },
            { x: 0.5, y: 1 },
            { x: 1, y: 0 }
        ];

        // At control points, should return exact y values
        expect(evaluateCurve(curve, 0)).toBe(0);
        expect(evaluateCurve(curve, 0.5)).toBe(1);
        // x=1 is clamped to 1 by the implementation
        expect(evaluateCurve(curve, 1)).toBe(1);
    });

    it('should handle S-curve', () => {
        const curve: CurvePoint[] = [
            { x: 0, y: 0 },
            { x: 0.25, y: 0.1 },
            { x: 0.75, y: 0.9 },
            { x: 1, y: 1 }
        ];

        const mid = evaluateCurve(curve, 0.5);

        // Mid value should be close to 0.5 for an S-curve
        expect(mid).toBeGreaterThan(0.4);
        expect(mid).toBeLessThan(0.6);
    });

    it('should handle inverted curve', () => {
        const curve: CurvePoint[] = [
            { x: 0, y: 1 },
            { x: 1, y: 0 }
        ];

        // Boundary values may be clamped to [0, 1]
        expect(evaluateCurve(curve, 0)).toBe(0); // Clamped to 0
        expect(evaluateCurve(curve, 0.5)).toBeCloseTo(0.5, 1);
        expect(evaluateCurve(curve, 1)).toBe(1); // Clamped to 1
    });

    it('should produce smooth transitions', () => {
        const curve: CurvePoint[] = [
            { x: 0, y: 0 },
            { x: 0.3, y: 0.7 },
            { x: 0.7, y: 0.3 },
            { x: 1, y: 1 }
        ];

        // Sample curve at multiple points
        const samples = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
        const values = samples.map(x => evaluateCurve(curve, x));

        // Check that values are within valid range
        values.forEach(v => {
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(1);
        });

        // Check that there are no discontinuities
        for (let i = 1; i < values.length; i++) {
            const diff = Math.abs(values[i] - values[i - 1]);
            expect(diff).toBeLessThan(0.5); // No jumps larger than 0.5
        }
    });

    it('should handle flat curve', () => {
        const curve: CurvePoint[] = [
            { x: 0, y: 0.5 },
            { x: 0.5, y: 0.5 },
            { x: 1, y: 0.5 }
        ];

        expect(evaluateCurve(curve, 0.25)).toBeCloseTo(0.5, 1);
        expect(evaluateCurve(curve, 0.75)).toBeCloseTo(0.5, 1);
    });

    it('should handle extreme contrast curve', () => {
        const curve: CurvePoint[] = [
            { x: 0, y: 0 },
            { x: 0.49, y: 0 },
            { x: 0.51, y: 1 },
            { x: 1, y: 1 }
        ];

        // Should have values near 0 for x < 0.5
        expect(evaluateCurve(curve, 0.4)).toBeLessThan(0.3);

        // Should have values near 1 for x > 0.5
        expect(evaluateCurve(curve, 0.6)).toBeGreaterThan(0.7);
    });

    it('should handle single control point', () => {
        const curve: CurvePoint[] = [
            { x: 0.5, y: 0.5 }
        ];

        // Normalized curve will have (0,0) and (1,1) added
        // So it becomes a linear curve from (0,0) to (1,1)
        expect(evaluateCurve(curve, 0)).toBe(0);
        expect(evaluateCurve(curve, 0.5)).toBeCloseTo(0.5, 1);
        expect(evaluateCurve(curve, 1)).toBe(1);
    });

    it('should handle two identical points', () => {
        const curve: CurvePoint[] = [
            { x: 0.5, y: 0.5 },
            { x: 0.5, y: 0.5 }
        ];

        // Should not crash and return a valid value
        const result = evaluateCurve(curve, 0.5);
        expect(result).toBe(0.5);
    });
});
