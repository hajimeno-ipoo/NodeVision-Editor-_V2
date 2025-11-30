/**
 * Histogram calculation utilities
 */

export type HistogramData = {
    master: number[]; // Luminance
    red: number[];
    green: number[];
    blue: number[];
    hue: number[]; // Hue distribution
};

/**
 * Calculate histogram from pixel data
 * @param pixels RGBA pixel data
 * @param width Image width
 * @param height Image height
 * @returns Normalized histogram data (0.0 - 1.0)
 */
export function calculateHistogram(pixels: Uint8Array, width: number, height: number): HistogramData {
    const bins = 256;
    const master = new Uint32Array(bins);
    const red = new Uint32Array(bins);
    const green = new Uint32Array(bins);
    const blue = new Uint32Array(bins);
    const hue = new Uint32Array(bins);

    // Downsample for performance if image is too large
    // Step size ensures we check roughly 100,000 pixels max
    const totalPixels = width * height;
    const targetSampleCount = 100000;
    const step = Math.max(1, Math.floor(totalPixels / targetSampleCount)) * 4; // *4 for RGBA

    for (let i = 0; i < pixels.length; i += step) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        // alpha = pixels[i + 3] is ignored for histogram

        // RGB
        red[r]++;
        green[g]++;
        blue[b]++;

        // Luminance (Rec.709 coefficients)
        // Y = 0.2126 R + 0.7152 G + 0.0722 B
        const luma = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
        master[Math.min(255, luma)]++;

        // Hue calculation
        const rNorm = r / 255;
        const gNorm = g / 255;
        const bNorm = b / 255;

        const max = Math.max(rNorm, gNorm, bNorm);
        const min = Math.min(rNorm, gNorm, bNorm);
        const d = max - min;

        let h = 0;
        if (d === 0) {
            h = 0; // achromatic
        } else {
            switch (max) {
                case rNorm: h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0); break;
                case gNorm: h = (bNorm - rNorm) / d + 2; break;
                case bNorm: h = (rNorm - gNorm) / d + 4; break;
            }
            h /= 6;
        }

        // Map 0.0-1.0 to 0-255 bin
        hue[Math.floor(h * 255)]++;
    }

    // Normalize
    const normalize = (arr: Uint32Array) => {
        let maxVal = 0;
        for (let i = 0; i < bins; i++) maxVal = Math.max(maxVal, arr[i]);

        // Avoid division by zero
        if (maxVal === 0) return Array.from(arr).map(() => 0);

        // Logarithmic scaling can be better for visualization, but linear is standard
        // Using linear for now
        return Array.from(arr).map(v => v / maxVal);
    };

    return {
        master: normalize(master),
        red: normalize(red),
        green: normalize(green),
        blue: normalize(blue),
        hue: normalize(hue)
    };
}
