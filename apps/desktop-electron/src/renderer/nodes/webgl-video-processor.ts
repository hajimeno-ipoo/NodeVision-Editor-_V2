import type { ColorCorrectionNodeSettings, PrimaryGradingNodeSettings } from '@nodevision/editor';

// Helper functions for color conversion
function hslToRGB(h: number, s: number, l: number): [number, number, number] {
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

function colorWheelToRGB(wheel: { hue: number, saturation: number, luminance: number }): [number, number, number] {
    // Convert to RGB with base luminance 0.5
    const [r, g, b] = hslToRGB(wheel.hue, wheel.saturation, 0.5);

    // Subtract 0.5 to center the color adjustment around 0
    const rOffset = r - 0.5;
    const gOffset = g - 0.5;
    const bOffset = b - 0.5;

    // Apply luminance adjustment
    const lumFactor = wheel.luminance;

    return [
        rOffset + lumFactor,
        gOffset + lumFactor,
        bOffset + lumFactor
    ];
}

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
        // Primary Grading uniforms
        lift?: WebGLUniformLocation | null;
        gammaColor?: WebGLUniformLocation | null;
        gain?: WebGLUniformLocation | null;
    } = {};

    // Current correction settings
    private settings: ColorCorrectionNodeSettings | PrimaryGradingNodeSettings = {
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
        this.gl = this.canvas.getContext('webgl2') as WebGLRenderingContext ||
            this.canvas.getContext('webgl') as WebGLRenderingContext ||
            this.canvas.getContext('experimental-webgl') as WebGLRenderingContext;

        if (!this.gl) {
            console.error('[WebGLVideoProcessor] WebGL not supported');
            return;
        }



        // Create shader program
        this.program = this.createShaderProgram();
        if (!this.program) return;

        this.gl.useProgram(this.program);

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
            tint: this.gl.getUniformLocation(this.program, 'u_tint'),
            // Primary Grading uniforms
            lift: this.gl.getUniformLocation(this.program, 'u_lift'),
            gammaColor: this.gl.getUniformLocation(this.program, 'u_gamma_color'),
            gain: this.gl.getUniformLocation(this.program, 'u_gain')
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

            // Primary Grading uniforms
            uniform vec3 u_lift;
            uniform vec3 u_gamma_color;
            uniform vec3 u_gain;
            
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
            
            // Temperature and Tint
            vec3 applyTemperatureTint(vec3 color, float temp, float tint) {
                // Simplified temperature/tint implementation
                // Temp: blue <-> orange
                // Tint: green <-> magenta
                
                vec3 result = color;
                
                // Temperature (warm/cool)
                result.r += temp * 0.1;
                result.b -= temp * 0.1;
                
                // Tint (green/magenta)
                result.g += tint * 0.1;
                
                return result;
            }

            void main() {
                vec4 texColor = texture2D(u_texture, v_texCoord);
                vec3 color = texColor.rgb;
                
                // 1. Exposure
                color = color * pow(2.0, u_exposure);
                
                // 2. Brightness
                color = color + u_brightness;
                
                // 3. Contrast
                color = (color - 0.5) * u_contrast + 0.5;
                
                // 4. Primary Grading (Lift/Gamma/Gain)
                // Lift (Offset)
                color += u_lift;
                
                // Gamma (Power)
                // Avoid division by zero and negative values
                vec3 gammaExp = 1.0 / (1.0 + u_gamma_color);
                color = pow(max(color, vec3(0.0)), gammaExp);
                
                // Gain (Multiply)
                color *= (1.0 + u_gain);

                // 5. Saturation
                float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
                color = mix(vec3(luminance), color, u_saturation);
                
                // 6. Gamma (Scalar)
                if (u_gamma != 1.0) {
                    color = pow(max(color, vec3(0.0)), vec3(1.0 / u_gamma));
                }
                
                // 7. Shadows/Highlights (Simplified)
                // This is a very basic implementation
                float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
                if (luma < 0.5) {
                    color += u_shadows * (1.0 - luma * 2.0) * 0.2;
                } else {
                    color += u_highlights * (luma * 2.0 - 1.0) * 0.2;
                }
                
                // 8. Temperature/Tint
                color = applyTemperatureTint(color, u_temperature / 100.0, u_tint / 100.0);
                
                gl_FragColor = vec4(color, texColor.a);
            }
        `;
    }

    private setupGeometry(): void {
        if (!this.gl || !this.program) return;

        const positionBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);

        // Fullscreen quad
        const positions = [
            -1.0, -1.0,
            1.0, -1.0,
            -1.0, 1.0,
            1.0, 1.0,
        ];

        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(positions), this.gl.STATIC_DRAW);

        const positionLocation = this.gl.getAttribLocation(this.program, 'a_position');
        this.gl.enableVertexAttribArray(positionLocation);
        this.gl.vertexAttribPointer(positionLocation, 2, this.gl.FLOAT, false, 0, 0);

        const texCoordBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, texCoordBuffer);

        // Texture coordinates (flipped Y for WebGL)
        const texCoords = [
            0.0, 1.0,
            1.0, 1.0,
            0.0, 0.0,
            1.0, 0.0,
        ];

        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(texCoords), this.gl.STATIC_DRAW);

        const texCoordLocation = this.gl.getAttribLocation(this.program, 'a_texCoord');
        this.gl.enableVertexAttribArray(texCoordLocation);
        this.gl.vertexAttribPointer(texCoordLocation, 2, this.gl.FLOAT, false, 0, 0);
    }

    /**
     * Load and start rendering a video element
     */
    public loadVideo(video: HTMLVideoElement): void {
        this.video = video;

        // Resize canvas to match video
        if (this.video.videoWidth && this.video.videoHeight) {
            this.canvas.width = this.video.videoWidth;
            this.canvas.height = this.video.videoHeight;

            // Force display size to fill container
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
            this.canvas.style.objectFit = 'contain';
            this.canvas.style.position = 'absolute';
            this.canvas.style.top = '0';
            this.canvas.style.left = '0';
        }



        // Start rendering if not already started
        if (!this.isRendering) {
            this.startRendering();
        }
    }

    /**
     * Start the rendering loop
     */
    private startRendering(): void {
        this.isRendering = true;

        const render = () => {
            if (!this.isRendering) return;

            this.renderFrame();
            this.animationFrameId = requestAnimationFrame(render);
        };

        render();
    }

    public stopRendering(): void {
        this.isRendering = false;
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    private renderFrame(): void {
        if (!this.gl || !this.video || !this.program || this.video.readyState < 2) return;

        this.gl.useProgram(this.program);

        // Update canvas size if video dimensions changed
        if (this.video.videoWidth !== this.canvas.width || this.video.videoHeight !== this.canvas.height) {
            this.canvas.width = this.video.videoWidth;
            this.canvas.height = this.video.videoHeight;
            this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        }

        // Update texture from video
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, this.video);

        // Set uniforms based on settings type
        if (this.settings.kind === 'primaryGrading') {
            // Primary Grading
            const s = this.settings as PrimaryGradingNodeSettings;

            // Basic settings
            if (this.uniformLocations.exposure) this.gl.uniform1f(this.uniformLocations.exposure, s.exposure ?? 0);
            if (this.uniformLocations.contrast) this.gl.uniform1f(this.uniformLocations.contrast, s.contrast ?? 1);
            if (this.uniformLocations.saturation) this.gl.uniform1f(this.uniformLocations.saturation, s.saturation ?? 1);
            if (this.uniformLocations.temperature) this.gl.uniform1f(this.uniformLocations.temperature, s.temperature ?? 0);
            if (this.uniformLocations.tint) this.gl.uniform1f(this.uniformLocations.tint, s.tint ?? 0);

            // Set defaults for properties not present in PrimaryGrading
            if (this.uniformLocations.brightness) this.gl.uniform1f(this.uniformLocations.brightness, 0);
            if (this.uniformLocations.gamma) this.gl.uniform1f(this.uniformLocations.gamma, 1.0); // s.gamma is an object (wheel), not scalar
            if (this.uniformLocations.shadows) this.gl.uniform1f(this.uniformLocations.shadows, 0);
            if (this.uniformLocations.highlights) this.gl.uniform1f(this.uniformLocations.highlights, 0);

            // Wheels
            const defaultWheel = { hue: 0, saturation: 0, luminance: 0 };
            const liftRGB = colorWheelToRGB(s.lift || defaultWheel);
            const gammaRGB = colorWheelToRGB(s.gamma || defaultWheel);
            const gainRGB = colorWheelToRGB(s.gain || defaultWheel);

            if (this.uniformLocations.lift) this.gl.uniform3fv(this.uniformLocations.lift, liftRGB);
            if (this.uniformLocations.gammaColor) this.gl.uniform3fv(this.uniformLocations.gammaColor, gammaRGB);
            if (this.uniformLocations.gain) this.gl.uniform3fv(this.uniformLocations.gain, gainRGB);

        } else {
            // Color Correction (default)
            const s = this.settings as ColorCorrectionNodeSettings;

            if (this.uniformLocations.exposure) this.gl.uniform1f(this.uniformLocations.exposure, s.exposure ?? 0);
            if (this.uniformLocations.brightness) this.gl.uniform1f(this.uniformLocations.brightness, s.brightness ?? 0);
            if (this.uniformLocations.contrast) this.gl.uniform1f(this.uniformLocations.contrast, s.contrast ?? 1);
            if (this.uniformLocations.saturation) this.gl.uniform1f(this.uniformLocations.saturation, s.saturation ?? 1);
            if (this.uniformLocations.gamma) this.gl.uniform1f(this.uniformLocations.gamma, s.gamma ?? 1);
            if (this.uniformLocations.shadows) this.gl.uniform1f(this.uniformLocations.shadows, s.shadows ?? 0);
            if (this.uniformLocations.highlights) this.gl.uniform1f(this.uniformLocations.highlights, s.highlights ?? 0);
            if (this.uniformLocations.temperature) this.gl.uniform1f(this.uniformLocations.temperature, s.temperature ?? 0);
            if (this.uniformLocations.tint) this.gl.uniform1f(this.uniformLocations.tint, s.tint ?? 0);
        }

        // Draw
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    }

    /**
     * Apply color correction settings
     */
    applyCorrection(settings: Partial<ColorCorrectionNodeSettings>): void {
        this.settings = { ...this.settings, ...settings } as ColorCorrectionNodeSettings;
        // Settings will be applied on next render frame
    }

    /**
     * Apply primary grading settings
     */
    public applyPrimaryGrading(settings: PrimaryGradingNodeSettings): void {
        this.settings = settings;
        // Settings will be applied on next render frame
    }

    public getCanvas(): HTMLCanvasElement {
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

    public dispose(): void {
        this.stopRendering();
        if (this.gl) {
            if (this.texture) this.gl.deleteTexture(this.texture);
            if (this.program) this.gl.deleteProgram(this.program);
        }
        this.video = null;
        this.gl = null;
        this.program = null;
        this.texture = null;

    }
}
