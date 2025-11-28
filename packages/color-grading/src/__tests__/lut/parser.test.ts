import { describe, it, expect } from 'vitest';

import { parseCubeLUT, validateImportedLUT, CubeParseError } from '../../lut/parser';

describe('parseCubeLUT', () => {
    it('should parse a valid 17x17x17 LUT', () => {
        const cubeContent = `
# Test LUT
TITLE "Test LUT"
LUT_3D_SIZE 17

${generateLUTData(17)}
`;
        const lut = parseCubeLUT(cubeContent);

        expect(lut.resolution).toBe(17);
        expect(lut.data.length).toBe(17 * 17 * 17 * 3);
    });

    it('should parse a valid 33x33x33 LUT', () => {
        const cubeContent = `
LUT_3D_SIZE 33

${generateLUTData(33)}
`;
        const lut = parseCubeLUT(cubeContent);

        expect(lut.resolution).toBe(33);
        expect(lut.data.length).toBe(33 * 33 * 33 * 3);
    });

    it('should handle DOMAIN_MIN and DOMAIN_MAX', () => {
        const cubeContent = `
LUT_3D_SIZE 2
DOMAIN_MIN 0.0 0.0 0.0
DOMAIN_MAX 1.0 1.0 1.0

0.0 0.0 0.0
1.0 0.0 0.0
0.0 1.0 0.0
1.0 1.0 0.0
0.0 0.0 1.0
1.0 0.0 1.0
0.0 1.0 1.0
1.0 1.0 1.0
`;
        const lut = parseCubeLUT(cubeContent);

        expect(lut.resolution).toBe(17); // 2 は 17 に変換される
        expect(lut.data[0]).toBe(0);
        expect(lut.data[1]).toBe(0);
        expect(lut.data[2]).toBe(0);
    });

    it('should normalize values with custom domain', () => {
        const cubeContent = `
LUT_3D_SIZE 2
DOMAIN_MIN 0.0 0.0 0.0
DOMAIN_MAX 255.0 255.0 255.0

0.0 0.0 0.0
255.0 0.0 0.0
0.0 255.0 0.0
255.0 255.0 0.0
0.0 0.0 255.0
255.0 0.0 255.0
0.0 255.0 255.0
255.0 255.0 255.0
`;
        const lut = parseCubeLUT(cubeContent);

        expect(lut.data[0]).toBe(0);
        expect(lut.data[3]).toBe(1); // 255 / 255 = 1
    });

    it('should skip comments', () => {
        const cubeContent = `
# This is a comment
LUT_3D_SIZE 2
# Another comment

${generateLUTData(2)}
`;
        const lut = parseCubeLUT(cubeContent);

        expect(lut.resolution).toBe(17);
    });

    it('should throw error if LUT_3D_SIZE is missing', () => {
        const cubeContent = `
0.0 0.0 0.0
1.0 1.0 1.0
`;

        expect(() => parseCubeLUT(cubeContent)).toThrow(CubeParseError);
        expect(() => parseCubeLUT(cubeContent)).toThrow('Missing LUT_3D_SIZE');
    });

    it('should throw error if data count is incorrect', () => {
        const cubeContent = `
LUT_3D_SIZE 2

0.0 0.0 0.0
1.0 1.0 1.0
`;

        expect(() => parseCubeLUT(cubeContent)).toThrow(CubeParseError);
    });

    it('should throw error for invalid LUT size', () => {
        const cubeContent = `
LUT_3D_SIZE 1

0.0 0.0 0.0
`;

        expect(() => parseCubeLUT(cubeContent)).toThrow('Invalid LUT size');
    });

    it('should handle scientific notation', () => {
        const cubeContent = `
LUT_3D_SIZE 2

1.0e-1 2.0e-1 3.0e-1
4.0e-1 5.0e-1 6.0e-1
7.0e-1 8.0e-1 9.0e-1
1.0e0 9.0e-1 8.0e-1
7.0e-1 6.0e-1 5.0e-1
4.0e-1 3.0e-1 2.0e-1
1.0e-1 1.0e-1 1.0e-1
9.0e-1 9.0e-1 9.0e-1
`;

        const lut = parseCubeLUT(cubeContent);

        expect(lut.data[0]).toBeCloseTo(0.1);
        expect(lut.data[1]).toBeCloseTo(0.2);
        expect(lut.data[2]).toBeCloseTo(0.3);
    });
});

describe('validateImportedLUT', () => {
    it('should validate a correct 33x33x33 LUT', () => {
        const lut = {
            resolution: 33 as const,
            data: new Float32Array(33 * 33 * 33 * 3).fill(0.5)
        };

        expect(validateImportedLUT(lut)).toBe(true);
    });

    it('should reject LUT with invalid resolution', () => {
        const lut = {
            resolution: 64 as unknown as 17 | 33 | 65,
            data: new Float32Array(64 * 64 * 64 * 3)
        };

        expect(validateImportedLUT(lut)).toBe(false);
    });

    it('should reject LUT with incorrect data length', () => {
        const lut = {
            resolution: 33 as const,
            data: new Float32Array(100) // 間違った長さ
        };

        expect(validateImportedLUT(lut)).toBe(false);
    });

    it('should reject LUT with NaN values', () => {
        const data = new Float32Array(33 * 33 * 33 * 3).fill(0.5);
        data[100] = NaN;

        const lut = {
            resolution: 33 as const,
            data
        };

        expect(validateImportedLUT(lut)).toBe(false);
    });

    it('should reject LUT with Infinity values', () => {
        const data = new Float32Array(33 * 33 * 33 * 3).fill(0.5);
        data[100] = Infinity;

        const lut = {
            resolution: 33 as const,
            data
        };

        expect(validateImportedLUT(lut)).toBe(false);
    });
});

// Helper function to generate LUT data
function generateLUTData(size: number): string {
    const lines: string[] = [];

    for (let b = 0; b < size; b++) {
        for (let g = 0; g < size; g++) {
            for (let r = 0; r < size; r++) {
                const rVal = r / (size - 1);
                const gVal = g / (size - 1);
                const bVal = b / (size - 1);
                lines.push(`${rVal.toFixed(6)} ${gVal.toFixed(6)} ${bVal.toFixed(6)}`);
            }
        }
    }

    return lines.join('\n');
}
