import type { ColorCorrectionNodeSettings } from '@nodevision/editor';

/**
 * WebGL-based video processor for real-time color correction
 * Leverages GPU shaders for high-performance video processing
 */
export class WebGLVideoProcessor {
    private canvas: HTMLCanvasElement;
    private gl: WebGLRenderingContext | null = null;
    private program: WebGLProgram | null = null;
    private video: HTMLVideoElement | null = null;
    private texture: WebGLTexture | null = null;
    private animationFrameId: number | null = null;
    private isRendering = false;

    // Shader uniform locations
    private uniformLocations: {
        texture?: WebGLUniformLocation | null;
        exposure?: WebGLUniformLocation | null;
        brightness?: WebGLUniformLocation | null;
        contrast?: WebGLUniformLocation | null;
        saturation?: WebGLUniformLocation | null;
        gamma?: WebGLUniformLocation | null;
        shadows?: WebGLUniformLocation | null;
        highlights?: WebGLUniformLocation | null;
        temperature?: WebGLUniformLocation | null;
        tint?: WebGLUniformLocation | null;
    } = {};

    // Current correction settings
    private settings: ColorCorrectionNodeSettings = {
        kind: 'colorCorrection',
        exposure: 0,
        brightness: 0,
        contrast: 1,
        saturation: 1,
        gamma: 1,
        shadows: 0,
        highlights: 0,
        temperature: 0,
        tint: 0
    };

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.initWebGL();
    }

    private initWebGL(): void {
        // Get WebGL context (try WebGL2 first, fallback to WebGL1)
        this.gl = this.canvas.getContext('webgl2') as WebGLRenderingContext | null;
        if (!this.gl) {
            this.gl = this.canvas.getContext('webgl') as WebGLRenderingContext | null;
        }

        if (!this.gl) {
            console.error('[WebGLVideoProcessor] WebGL not supported');
            return;
        }

        console.log('[WebGLVideoProcessor] WebGL context created:', this.gl instanceof WebGL2RenderingContext ? 'WebGL2' : 'WebGL1');

        // Create shader program
        this.program = this.createShaderProgram();
        if (!this.program) {
            console.error('[WebGLVideoProcessor] Failed to create shader program');
            return;
        }

        // Get uniform locations
        this.uniformLocations = {
            texture: this.gl.getUniformLocation(this.program, 'u_texture'),
            exposure: this.gl.getUniformLocation(this.program, 'u_exposure'),
            brightness: this.gl.getUniformLocation(this.program, 'u_brightness'),
            contrast: this.gl.getUniformLocation(this.program, 'u_contrast'),
            saturation: this.gl.getUniformLocation(this.program, 'u_saturation'),
            gamma: this.gl.getUniformLocation(this.program, 'u_gamma'),
            shadows: this.gl.getUniformLocation(this.program, 'u_shadows'),
            highlights: this.gl.getUniformLocation(this.program, 'u_highlights'),
            temperature: this.gl.getUniformLocation(this.program, 'u_temperature'),
            tint: this.gl.getUniformLocation(this.program, 'u_tint')
        };

        // Create texture
        this.texture = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);

        // Setup geometry (fullscreen quad)
        this.setupGeometry();
    }

    private createShaderProgram(): WebGLProgram | null {
        if (!this.gl) return null;

        const vertexShader = this.compileShader(this.gl.VERTEX_SHADER, this.getVertexShaderSource());
        const fragmentShader = this.compileShader(this.gl.FRAGMENT_SHADER, this.getFragmentShaderSource());

        if (!vertexShader || !fragmentShader) return null;

        const program = this.gl.createProgram();
        if (!program) return null;

        this.gl.attachShader(program, vertexShader);
        this.gl.attachShader(program, fragmentShader);
        this.gl.linkProgram(program);

        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            console.error('[WebGLVideoProcessor] Shader program link error:', this.gl.getProgramInfoLog(program));
            return null;
        }

        return program;
    }

    private compileShader(type: number, source: string): WebGLShader | null {
        if (!this.gl) return null;

        const shader = this.gl.createShader(type);
        if (!shader) return null;

        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);

        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error('[WebGLVideoProcessor] Shader compile error:', this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }

        return shader;
    }

    private getVertexShaderSource(): string {
        return `
            attribute vec2 a_position;
            attribute vec2 a_texCoord;
            varying vec2 v_texCoord;

            void main() {
                gl_Position = vec4(a_position, 0.0, 1.0);
                v_texCoord = a_texCoord;
            }
        `;
    }

    private getFragmentShaderSource(): string {
        return `
            precision mediump float;
            
            uniform sampler2D u_texture;
            uniform float u_exposure;
            uniform float u_brightness;
            uniform float u_contrast;
            uniform float u_saturation;
            uniform float u_gamma;
            uniform float u_shadows;
            uniform float u_highlights;
            uniform float u_temperature;
            uniform float u_tint;
            
            varying vec2 v_texCoord;
            
            // RGB to HSV conversion
            vec3 rgb2hsv(vec3 c) {
                vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
                vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
                vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
                float d = q.x - min(q.w, q.y);
                float e = 1.0e-10;
                return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
            }
            
            // HSV to RGB conversion
            vec3 hsv2rgb(vec3 c) {
                vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
                vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
                return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
            }
            
            void main() {
                vec4 color = texture2D(u_texture, v_texCoord);
                vec3 rgb = color.rgb;
                
                // 1. Exposure (multiply by 2^exposure)
                rgb *= pow(2.0, u_exposure);
                
                // 2. Brightness & Contrast
                rgb = (rgb - 0.5) * u_contrast + 0.5 + u_brightness;
                
                // 3. Saturation
                float luminance = dot(rgb, vec3(0.299, 0.587, 0.114));
                rgb = mix(vec3(luminance), rgb, u_saturation);
                
                // 4. Shadows & Highlights
                // Apply shadows (darken dark areas)
                float shadowMask = 1.0 - smoothstep(0.0, 0.5, luminance);
                rgb += shadowMask * u_shadows / 100.0;
                
                // Apply highlights (brighten bright areas)
                float highlightMask = smoothstep(0.5, 1.0, luminance);
                rgb += highlightMask * u_highlights / 100.0;
                
                // 5. Temperature & Tint
                if (u_temperature != 0.0) {
                    // Warm (positive) or cool (negative)
                    rgb.r += u_temperature / 100.0;
                    rgb.b -= u_temperature / 100.0;
                }
                if (u_tint != 0.0) {
                    // Green (positive) or magenta (negative)
                    rgb.g += u_tint / 100.0;
                }
                
                // 6. Gamma correction
                rgb = pow(rgb, vec3(1.0 / u_gamma));
                
                // Clamp to valid range
                rgb = clamp(rgb, 0.0, 1.0);
                
                gl_FragColor = vec4(rgb, color.a);
            }
        `;
    }

    private setupGeometry(): void {
        if (!this.gl || !this.program) return;

        // Fullscreen quad vertices
        const positions = new Float32Array([
            -1, -1,
            1, -1,
            -1, 1,
            1, 1
        ]);

        // Texture coordinates
        const texCoords = new Float32Array([
            0, 1,
            1, 1,
            0, 0,
            1, 0
        ]);

        // Position buffer
        const positionBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.STATIC_DRAW);

        const positionLocation = this.gl.getAttribLocation(this.program, 'a_position');
        this.gl.enableVertexAttribArray(positionLocation);
        this.gl.vertexAttribPointer(positionLocation, 2, this.gl.FLOAT, false, 0, 0);

        // TexCoord buffer
        const texCoordBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, texCoordBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, texCoords, this.gl.STATIC_DRAW);

        const texCoordLocation = this.gl.getAttribLocation(this.program, 'a_texCoord');
        this.gl.enableVertexAttribArray(texCoordLocation);
        this.gl.vertexAttribPointer(texCoordLocation, 2, this.gl.FLOAT, false, 0, 0);
    }

    /**
     * Load and start rendering a video element
     */
    loadVideo(videoElement: HTMLVideoElement): void {
        this.video = videoElement;

        // Resize canvas to match video
        if (this.video.videoWidth && this.video.videoHeight) {
            this.canvas.width = this.video.videoWidth;
            this.canvas.height = this.video.videoHeight;
        }

        console.log('[WebGLVideoProcessor] Video loaded, dimensions:', this.canvas.width, 'x', this.canvas.height);

        // Start rendering if not already started
        if (!this.isRendering) {
            this.startRendering();
        }
    }

    /**
     * Start the rendering loop
     */
    startRendering(): void {
        if (this.isRendering) return;

        this.isRendering = true;
        console.log('[WebGLVideoProcessor] Starting rendering loop');
        this.render();
    }

    /**
     * Stop the rendering loop
     */
    stopRendering(): void {
        this.isRendering = false;
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        console.log('[WebGLVideoProcessor] Stopped rendering loop');
    }

    /**
     * Main rendering function
     */
    private render = (): void => {
        if (!this.isRendering || !this.gl || !this.program || !this.video || !this.texture) {
            return;
        }

        // Only render if video is playing and has data
        if (this.video.readyState >= this.video.HAVE_CURRENT_DATA) {
            // Update canvas size if video dimensions changed
            if (this.video.videoWidth !== this.canvas.width || this.video.videoHeight !== this.canvas.height) {
                this.canvas.width = this.video.videoWidth;
                this.canvas.height = this.video.videoHeight;
                this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
            }

            // Upload video frame to texture
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
            this.gl.texImage2D(
                this.gl.TEXTURE_2D,
                0,
                this.gl.RGBA,
                this.gl.RGBA,
                this.gl.UNSIGNED_BYTE,
                this.video
            );

            // Set uniforms
            this.gl.useProgram(this.program);

            this.gl.uniform1i(this.uniformLocations.texture!, 0);
            this.gl.uniform1f(this.uniformLocations.exposure!, this.settings.exposure ?? 0);
            this.gl.uniform1f(this.uniformLocations.brightness!, this.settings.brightness ?? 0);
            this.gl.uniform1f(this.uniformLocations.contrast!, this.settings.contrast ?? 1);
            this.gl.uniform1f(this.uniformLocations.saturation!, this.settings.saturation ?? 1);
            this.gl.uniform1f(this.uniformLocations.gamma!, this.settings.gamma ?? 1);
            this.gl.uniform1f(this.uniformLocations.shadows!, this.settings.shadows ?? 0);
            this.gl.uniform1f(this.uniformLocations.highlights!, this.settings.highlights ?? 0);
            this.gl.uniform1f(this.uniformLocations.temperature!, this.settings.temperature ?? 0);
            this.gl.uniform1f(this.uniformLocations.tint!, this.settings.tint ?? 0);

            // Draw fullscreen quad
            this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
        }

        // Continue rendering loop
        this.animationFrameId = requestAnimationFrame(this.render);
    };

    /**
     * Apply color correction settings
     */
    applyCorrection(settings: Partial<ColorCorrectionNodeSettings>): void {
        this.settings = { ...this.settings, ...settings };
        // Settings will be applied on next render frame
    }

    /**
     * Get the output canvas
     */
    getCanvas(): HTMLCanvasElement {
        return this.canvas;
    }

    /**
     * Get current canvas size
     */
    getSize(): { width: number; height: number } {
        return {
            width: this.canvas.width,
            height: this.canvas.height
        };
    }

    /**
     * Clean up resources
     */
    dispose(): void {
        this.stopRendering();

        if (this.gl && this.texture) {
            this.gl.deleteTexture(this.texture);
        }
        if (this.gl && this.program) {
            this.gl.deleteProgram(this.program);
        }

        this.video = null;
        this.gl = null;
        this.program = null;
        this.texture = null;

        console.log('[WebGLVideoProcessor] Disposed');
    }
}
