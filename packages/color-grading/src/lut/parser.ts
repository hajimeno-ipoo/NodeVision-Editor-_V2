import type { LUT3D, LUTResolution, LUTFile } from './types';

/**
 * Parse error for .cube files
 */
export class CubeParseError extends Error {
    constructor(message: string, public line?: number) {
        super(line !== undefined ? `Line ${line}: ${message}` : message);
        this.name = 'CubeParseError';
    }
}

/**
 * Parse a .cube LUT file
 * 
 * Format spec:
 * - Lines starting with # are comments
 * - TITLE "Name" - optional title
 * - LUT_3D_SIZE N - size of the LUT (e.g., 33 for 33x33x33)
 * - DOMAIN_MIN r g b - minimum input values (usually 0 0 0)
 * - DOMAIN_MAX r g b - maximum input values (usually 1 1 1)
 * - Data lines: r g b (one color per line, in order)
 * 
 * @param content - .cube file content as string
 * @returns Parsed LUTFile
 */
export function parseCubeLUT(content: string): LUTFile {
    const lines = content.split('\n').map(line => line.trim());

    let title = 'Untitled';
    let size: number | undefined;
    let domainMin = [0, 0, 0];
    let domainMax = [1, 1, 1];
    const dataLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        // Skip empty lines
        if (!line) continue;

        // Skip comments
        if (line.startsWith('#')) continue;

        // Parse TITLE
        if (line.startsWith('TITLE')) {
            const match = line.match(/TITLE\s+"?([^"]+)"?/);
            if (match) {
                title = match[1];
            }
            continue;
        }

        // Parse LUT_3D_SIZE
        if (line.startsWith('LUT_3D_SIZE')) {
            const match = line.match(/LUT_3D_SIZE\s+(\d+)/);
            if (!match) {
                throw new CubeParseError('Invalid LUT_3D_SIZE format', lineNum);
            }
            size = parseInt(match[1], 10);
            if (size < 2 || size > 256) {
                throw new CubeParseError(`Invalid LUT size: ${size} (must be 2-256)`, lineNum);
            }
            continue;
        }

        // Parse DOMAIN_MIN
        if (line.startsWith('DOMAIN_MIN')) {
            const match = line.match(/DOMAIN_MIN\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)/);
            if (!match) {
                throw new CubeParseError('Invalid DOMAIN_MIN format', lineNum);
            }
            domainMin = [
                parseFloat(match[1]),
                parseFloat(match[2]),
                parseFloat(match[3])
            ];
            continue;
        }

        // Parse DOMAIN_MAX
        if (line.startsWith('DOMAIN_MAX')) {
            const match = line.match(/DOMAIN_MAX\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)/);
            if (!match) {
                throw new CubeParseError('Invalid DOMAIN_MAX format', lineNum);
            }
            domainMax = [
                parseFloat(match[1]),
                parseFloat(match[2]),
                parseFloat(match[3])
            ];
            continue;
        }

        // Assume it's a data line (r g b)
        const dataMatch = line.match(/^([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)$/);
        if (dataMatch) {
            dataLines.push(line);
        }
    }

    // Validate size
    if (!size) {
        throw new CubeParseError('Missing LUT_3D_SIZE');
    }

    const expectedCount = size * size * size;
    if (dataLines.length !== expectedCount) {
        throw new CubeParseError(
            `Expected ${expectedCount} data lines for ${size}x${size}x${size} LUT, got ${dataLines.length}`
        );
    }

    // Parse data
    const data = new Float32Array(expectedCount * 3);
    let dataIndex = 0;

    for (let i = 0; i < dataLines.length; i++) {
        const match = dataLines[i].match(/^([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)$/);
        if (!match) {
            throw new CubeParseError('Invalid data line format', i + 1);
        }

        let r = parseFloat(match[1]);
        let g = parseFloat(match[2]);
        let b = parseFloat(match[3]);

        // Normalize from domain to [0, 1]
        if (domainMin[0] !== 0 || domainMax[0] !== 1) {
            r = (r - domainMin[0]) / (domainMax[0] - domainMin[0]);
        }
        if (domainMin[1] !== 0 || domainMax[1] !== 1) {
            g = (g - domainMin[1]) / (domainMax[1] - domainMin[1]);
        }
        if (domainMin[2] !== 0 || domainMax[2] !== 1) {
            b = (b - domainMin[2]) / (domainMax[2] - domainMin[2]);
        }

        data[dataIndex++] = r;
        data[dataIndex++] = g;
        data[dataIndex++] = b;
    }

    return {
        resolution: size as LUTResolution,
        data,
        title,
        domain: [domainMin[0], domainMax[0]],
        format: 'cube'
    };
}

/**
 * Validate a LUT3D object
 */
export function validateImportedLUT(lut: LUT3D): boolean {
    if (!lut.resolution || lut.resolution < 2) {
        return false;
    }

    const expectedLength = lut.resolution * lut.resolution * lut.resolution * 3;
    if (lut.data.length !== expectedLength) {
        return false;
    }

    // Check for NaN or Infinity
    for (let i = 0; i < lut.data.length; i++) {
        if (!isFinite(lut.data[i])) {
            return false;
        }
    }

    return true;
}
