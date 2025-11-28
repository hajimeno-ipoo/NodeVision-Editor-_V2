/**
 * Color space conversion utilities
 * Provides conversions between different color representations
 */

/**
 * Convert sRGB to Linear RGB
 * Removes gamma correction for linear color operations
 * 
 * @param r - Red channel (0-1)
 * @param g - Green channel (0-1)
 * @param b - Blue channel (0-1)
 * @returns Linear RGB values
 */
export function sRGBToLinear(r: number, g: number, b: number): [number, number, number] {
    const toLinear = (c: number): number => {
        if (c <= 0.04045) {
            return c / 12.92;
        } else {
            return Math.pow((c + 0.055) / 1.055, 2.4);
        }
    };

    return [toLinear(r), toLinear(g), toLinear(b)];
}

/**
 * Convert Linear RGB to sRGB
 * Applies gamma correction for display
 * 
 * @param r - Linear red (0-1)
 * @param g - Linear green (0-1)
 * @param b - Linear blue (0-1)
 * @returns sRGB values
 */
export function linearToSRGB(r: number, g: number, b: number): [number, number, number] {
    const toSRGB = (c: number): number => {
        if (c <= 0.0031308) {
            return c * 12.92;
        } else {
            return 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
        }
    };

    return [toSRGB(r), toSRGB(g), toSRGB(b)];
}

/**
 * Convert RGB to HSL (Hue, Saturation, Lightness)
 * 
 * @param r - Red channel (0-1)
 * @param g - Green channel (0-1)
 * @param b - Blue channel (0-1)
 * @returns [hue (0-360), saturation (0-1), lightness (0-1)]
 */
export function rgbToHSL(r: number, g: number, b: number): [number, number, number] {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;

    if (max === min) {
        return [0, 0, l]; // Grayscale
    }

    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    let h = 0;
    if (max === r) {
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    } else if (max === g) {
        h = ((b - r) / d + 2) / 6;
    } else {
        h = ((r - g) / d + 4) / 6;
    }

    return [h * 360, s, l];
}

/**
 * Convert HSL to RGB
 * 
 * @param h - Hue (0-360)
 * @param s - Saturation (0-1)
 * @param l - Lightness (0-1)
 * @returns [red, green, blue] (0-1)
 */
export function hslToRGB(h: number, s: number, l: number): [number, number, number] {
    h = h / 360; // Normalize to 0-1

    if (s === 0) {
        return [l, l, l]; // Grayscale
    }

    const hue2rgb = (p: number, q: number, t: number): number => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    const r = hue2rgb(p, q, h + 1 / 3);
    const g = hue2rgb(p, q, h);
    const b = hue2rgb(p, q, h - 1 / 3);

    return [r, g, b];
}

/**
 * Calculate luminance (relative brightness)
 * Uses Rec. 709 coefficients
 * 
 * @param r - Red channel (0-1)
 * @param g - Green channel (0-1)
 * @param b - Blue channel (0-1)
 * @returns Luminance value (0-1)
 */
export function getLuminance(r: number, g: number, b: number): number {
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Clamp a value to [0, 1] range
 * 
 * @param value - Input value
 * @returns Clamped value
 */
export function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
}

/**
 * Clamp RGB values to [0, 1] range
 * 
 * @param r - Red channel
 * @param g - Green channel
 * @param b - Blue channel
 * @returns Clamped RGB values
 */
export function clampRGB(r: number, g: number, b: number): [number, number, number] {
    return [clamp01(r), clamp01(g), clamp01(b)];
}
