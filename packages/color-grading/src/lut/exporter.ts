/**
 * CUBE LUT Exporter
 * Exports 3D LUTs to Adobe/DaVinci compatible .cube format
 */

import type { LUT3D, LUTMetadata } from './types.js';

/**
 * Export a 3D LUT to .cube format string
 * 
 * @param lut - The 3D LUT to export
 * @param metadata - Optional metadata (title, etc.)
 * @returns String content of the .cube file
 */
export function exportCubeLUT(
    lut: LUT3D,
    metadata: Partial<LUTMetadata> = {}
): string {
    const { resolution, data } = lut;
    const title = metadata.title || 'NodeVision LUT';

    // Header
    let output = `TITLE "${title}"\n`;
    output += `LUT_3D_SIZE ${resolution}\n`;

    // Domain (Input range)
    // Standard is 0.0 to 1.0
    output += `DOMAIN_MIN 0.0 0.0 0.0\n`;
    output += `DOMAIN_MAX 1.0 1.0 1.0\n\n`;

    // Data
    // Format: R G B (floating point)
    // Loop order must match generator: Blue (outer) -> Green -> Red (inner)
    for (let i = 0; i < data.length; i += 3) {
        const r = data[i].toFixed(6);
        const g = data[i + 1].toFixed(6);
        const b = data[i + 2].toFixed(6);

        output += `${r} ${g} ${b}\n`;
    }

    return output;
}
