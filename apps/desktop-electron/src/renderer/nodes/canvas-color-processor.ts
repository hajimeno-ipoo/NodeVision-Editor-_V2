/**
 * Canvas-based color correction processor for real-time preview
 * Provides instant visual feedback without FFmpeg overhead
 */

export interface ColorCorrectionSettings {
    exposure: number;
    brightness: number;
    contrast: number;
    saturation: number;
    gamma: number;
    shadows: number;
    highlights: number;
    temperature: number;
    tint: number;
}

export class CanvasColorProcessor {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private originalImageData: ImageData | null = null;
    private processedImageData: ImageData | null = null; // Cache processed result

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    }

    /**
     * Attach a new canvas element (e.g. after re-render) and restore state
     */
    attachCanvas(newCanvas: HTMLCanvasElement) {
        this.canvas = newCanvas;
        this.ctx = newCanvas.getContext('2d', { willReadFrequently: true })!;

        // Restore content immediately if we have data
        if (this.processedImageData) {
            this.canvas.width = this.processedImageData.width;
            this.canvas.height = this.processedImageData.height;
            this.ctx.putImageData(this.processedImageData, 0, 0);
        } else if (this.originalImageData) {
            this.canvas.width = this.originalImageData.width;
            this.canvas.height = this.originalImageData.height;
            this.ctx.putImageData(this.originalImageData, 0, 0);
        }
    }

    /**
     * Load image from URL and prepare for processing
     */
    async loadImage(imageUrl: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            // img.crossOrigin = 'anonymous'; // Removed as it might cause issues with blob: URLs

            img.onload = () => {
                // Set canvas size to match image (with max size for performance)
                const maxSize = 1280;
                let width = img.width;
                let height = img.height;

                if (width > maxSize || height > maxSize) {
                    const ratio = Math.min(maxSize / width, maxSize / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }

                this.canvas.width = width;
                this.canvas.height = height;

                // Draw original image
                this.ctx.drawImage(img, 0, 0, width, height);

                // Store original image data
                this.originalImageData = this.ctx.getImageData(0, 0, width, height);
                this.processedImageData = this.ctx.getImageData(0, 0, width, height); // Initialize processed data

                // Debug: Check first pixel
                if (this.originalImageData.data.length > 0) {
                    const d = this.originalImageData.data;
                    console.log(`[CanvasProcessor] Loaded image size: ${width}x${height}`);
                    console.log(`[CanvasProcessor] First pixel (raw): R=${d[0]}, G=${d[1]}, B=${d[2]}, A=${d[3]}`);
                }

                resolve();
            };

            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = imageUrl;
        });
    }

    /**
     * Apply color correction and render to canvas
     */
    applyCorrection(settings: ColorCorrectionSettings): void {
        if (!this.originalImageData) return;

        // Create a copy of original image data
        const imageData = new ImageData(
            new Uint8ClampedArray(this.originalImageData.data),
            this.originalImageData.width,
            this.originalImageData.height
        );

        // Apply color correction
        this.processPixels(imageData, settings);

        // Render to canvas
        this.ctx.putImageData(imageData, 0, 0);
        this.processedImageData = imageData; // Cache for restoration
    }

    /**
     * Process each pixel with color correction algorithms
     */
    private processPixels(imageData: ImageData, settings: ColorCorrectionSettings): void {
        const data = imageData.data;
        const len = data.length;

        for (let i = 0; i < len; i += 4) {
            let r = data[i];
            let g = data[i + 1];
            let b = data[i + 2];
            // alpha channel (data[i + 3]) is preserved

            // 1. Exposure (exponential brightness adjustment)
            const exposureFactor = Math.pow(2, settings.exposure);
            r *= exposureFactor;
            g *= exposureFactor;
            b *= exposureFactor;

            // 2. Brightness (linear offset)
            const brightness = settings.brightness * 255;
            r += brightness;
            g += brightness;
            b += brightness;

            // 3. Contrast (scale from midpoint)
            const contrast = settings.contrast;
            r = ((r / 255 - 0.5) * contrast + 0.5) * 255;
            g = ((g / 255 - 0.5) * contrast + 0.5) * 255;
            b = ((b / 255 - 0.5) * contrast + 0.5) * 255;

            // 4. Saturation (preserve luminance)
            const saturation = settings.saturation;
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;
            r = gray + (r - gray) * saturation;
            g = gray + (g - gray) * saturation;
            b = gray + (b - gray) * saturation;

            // 5. Gamma (power curve)
            const gamma = settings.gamma;
            r = Math.pow(Math.max(0, r / 255), 1 / gamma) * 255;
            g = Math.pow(Math.max(0, g / 255), 1 / gamma) * 255;
            b = Math.pow(Math.max(0, b / 255), 1 / gamma) * 255;

            // 6. Shadows/Highlights (tone curve approximation)
            const normalized = (r + g + b) / (3 * 255);
            const shadowLift = (settings.shadows / 100) * 0.2;
            const highlightCompress = (settings.highlights / 100) * -0.2;

            let toneFactor = 1.0;
            if (normalized < 0.5) {
                // Shadows (darks)
                toneFactor = 1.0 + shadowLift * (1 - normalized * 2);
            } else {
                // Highlights (brights)
                toneFactor = 1.0 + highlightCompress * (normalized * 2 - 1);
            }

            r *= toneFactor;
            g *= toneFactor;
            b *= toneFactor;

            // 7. Temperature/Tint (color balance)
            const tempFactor = settings.temperature / 100;
            const tintFactor = settings.tint / 100;

            r *= (1.0 + tempFactor * 0.3);
            g *= (1.0 + tintFactor * 0.2);
            b *= (1.0 - tempFactor * 0.3);

            // Clamp to valid range [0, 255]
            data[i] = Math.max(0, Math.min(255, r));
            data[i + 1] = Math.max(0, Math.min(255, g));
            data[i + 2] = Math.max(0, Math.min(255, b));
        }
    }

    /**
     * Clear canvas
     */
    clear(): void {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    /**
     * Reset to original image
     */
    reset(): void {
        if (this.originalImageData) {
            this.ctx.putImageData(this.originalImageData, 0, 0);
        }
    }

    /**
     * Check if the processor has an image loaded
     */
    hasImage(): boolean {
        return !!this.originalImageData;
    }

    /**
     * Get current canvas size
     */
    getSize(): { width: number; height: number } | null {
        return this.canvas?.width && this.canvas?.height
            ? { width: this.canvas.width, height: this.canvas.height }
            : null;
    }

    /**
     * Get current canvas as data URL
     */
    toDataURL(type = 'image/png', quality = 0.95): string {
        return this.canvas.toDataURL(type, quality);
    }
}
