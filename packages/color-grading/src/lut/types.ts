/**
 * Color Grading LUT (Look-Up Table) types
 */

/**
 * Supported LUT resolutions
 * - 17: Fast, lightweight (17³ = 4,913 entries)
 * - 33: Standard, balanced (33³ = 35,937 entries)
 * - 65: High quality (65³ = 274,625 entries)
 */
export type LUTResolution = number;

/**
 * 3D LUT data structure
 */
export interface LUT3D {
    /** Resolution of the LUT (size of each dimension) */
    resolution: LUTResolution;

    /** RGB data in Float32Array format (interleaved R,G,B values) */
    data: Float32Array;
}

/**
 * LUT metadata for file formats
 */
export interface LUTMetadata {
    /** Title/name of the LUT */
    title: string;

    /** Domain range [min, max], typically [0, 1] */
    domain: [number, number];

    /** File format */
    format: 'cube' | '3dl';
}

/**
 * Complete LUT file representation
 */
export interface LUTFile extends LUT3D, LUTMetadata { }

/**
 * Color transformation function type
 * Takes input RGB (0-1) and returns output RGB (0-1)
 */
export type ColorTransformFunction = (
    r: number,
    g: number,
    b: number
) => [number, number, number];
