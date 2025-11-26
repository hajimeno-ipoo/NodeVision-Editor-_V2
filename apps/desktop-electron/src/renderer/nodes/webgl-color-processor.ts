/**
 * WebGL-based color correction processor for real-time preview.
 * Falls back to 2D canvas in caller when WebGL 初期化に失敗した場合を想定。
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

type GL = WebGLRenderingContext;

export class WebGLColorProcessor {
    private canvas: HTMLCanvasElement;
    private gl: GL;
    private program: WebGLProgram;
    private positionBuffer: WebGLBuffer;
    private texcoordBuffer: WebGLBuffer;
    private texture: WebGLTexture | null = null;
    private imageSize: { width: number; height: number } | null = null;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
        if (!gl) {
            throw new Error('WebGL not supported');
        }
        this.gl = gl;
        this.program = this.createProgram();
        this.positionBuffer = this.createQuadBuffer();
        this.texcoordBuffer = this.createTexcoordBuffer();
    }

    hasImage(): boolean {
        return !!this.texture && !!this.imageSize;
    }

    getSize(): { width: number; height: number } | null {
        return this.imageSize;
    }

    /**
     * Load image into WebGL texture
     */
    async loadImage(imageUrl: string): Promise<void> {
        const img = await this.loadHtmlImage(imageUrl);

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
        this.imageSize = { width, height };

        const gl = this.gl;

        if (!this.texture) {
            this.texture = gl.createTexture();
        }
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        // Draw to a temp canvas to resize if必要
        if (width !== img.width || height !== img.height) {
            const tmp = document.createElement('canvas');
            tmp.width = width;
            tmp.height = height;
            const ctx = tmp.getContext('2d');
            if (!ctx) throw new Error('Failed to get 2d context');
            ctx.drawImage(img, 0, 0, width, height);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tmp);
        } else {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        }
    }

    /**
     * Apply color correction and render to framebuffer (canvas)
     */
    applyCorrection(settings: ColorCorrectionSettings): void {
        if (!this.texture || !this.imageSize) return;

        const gl = this.gl;
        gl.viewport(0, 0, this.imageSize.width, this.imageSize.height);

        gl.useProgram(this.program);

        // Position buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        const positionLoc = gl.getAttribLocation(this.program, 'a_position');
        gl.enableVertexAttribArray(positionLoc);
        gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

        // Texcoord buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, this.texcoordBuffer);
        const texcoordLoc = gl.getAttribLocation(this.program, 'a_texCoord');
        gl.enableVertexAttribArray(texcoordLoc);
        gl.vertexAttribPointer(texcoordLoc, 2, gl.FLOAT, false, 0, 0);

        // Texture
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.uniform1i(gl.getUniformLocation(this.program, 'u_image'), 0);

        // Uniforms
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_exposure'), settings.exposure);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_brightness'), settings.brightness);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_contrast'), settings.contrast);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_saturation'), settings.saturation);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_gamma'), settings.gamma);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_shadows'), settings.shadows / 100);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_highlights'), settings.highlights / 100);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_temperature'), settings.temperature / 100);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_tint'), settings.tint / 100);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    toDataURL(type = 'image/png', quality = 0.95): string {
        return this.canvas.toDataURL(type, quality);
    }

    dispose(): void {
        const gl = this.gl;
        if (this.texture) gl.deleteTexture(this.texture);
        gl.deleteBuffer(this.positionBuffer);
        gl.deleteBuffer(this.texcoordBuffer);
        gl.deleteProgram(this.program);
    }

    // --- helpers ---
    private createProgram(): WebGLProgram {
        const gl = this.gl;
        const vsSource = `
          attribute vec2 a_position;
          attribute vec2 a_texCoord;
          varying vec2 v_texCoord;
          void main() {
            gl_Position = vec4(a_position, 0.0, 1.0);
            v_texCoord = a_texCoord;
          }
        `;
        const fsSource = `
          precision mediump float;
          uniform sampler2D u_image;
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

          void main() {
            vec4 tex = texture2D(u_image, v_texCoord);
            vec3 c = tex.rgb;

            // Exposure (2^exposure)
            float exposureFactor = pow(2.0, u_exposure);
            c *= exposureFactor;

            // Brightness (-1..1)
            c += u_brightness;

            // Contrast
            c = (c - 0.5) * u_contrast + 0.5;

            // Saturation
            float gray = dot(c, vec3(0.299, 0.587, 0.114));
            c = mix(vec3(gray), c, u_saturation);

            // Gamma (approx)
            c = pow(max(c, 0.0), vec3(1.0 / max(0.001, u_gamma)));

            // Shadows / Highlights
            float lum = dot(c, vec3(0.333, 0.333, 0.333));
            float shadowLift = u_shadows * 0.2;
            float highlightCompress = -u_highlights * 0.2;
            float tone = lum < 0.5
              ? 1.0 + shadowLift * (1.0 - lum * 2.0)
              : 1.0 + highlightCompress * (lum * 2.0 - 1.0);
            c *= tone;

            // Temperature / Tint
            c.r *= (1.0 + u_temperature * 0.3);
            c.b *= (1.0 - u_temperature * 0.3);
            c.g *= (1.0 + u_tint * 0.2);

            c = clamp(c, 0.0, 1.0);
            gl_FragColor = vec4(c, tex.a);
          }
        `;

        const vs = this.compileShader(gl.VERTEX_SHADER, vsSource);
        const fs = this.compileShader(gl.FRAGMENT_SHADER, fsSource);

        const program = gl.createProgram()!;
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const info = gl.getProgramInfoLog(program);
            throw new Error(`Could not compile WebGL program: ${info}`);
        }
        return program;
    }

    private compileShader(type: number, source: string): WebGLShader {
        const gl = this.gl;
        const shader = gl.createShader(type)!;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const info = gl.getShaderInfoLog(shader);
            throw new Error(`Could not compile shader: ${info}`);
        }
        return shader;
    }

    private createQuadBuffer(): WebGLBuffer {
        const gl = this.gl;
        const buffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        // full-screen triangle strip
        gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array([
                -1, -1,
                1, -1,
                -1, 1,
                1, 1
            ]),
            gl.STATIC_DRAW
        );
        return buffer;
    }

    private createTexcoordBuffer(): WebGLBuffer {
        const gl = this.gl;
        const buffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array([
                0, 0,
                1, 0,
                0, 1,
                1, 1
            ]),
            gl.STATIC_DRAW
        );
        return buffer;
    }

    private loadHtmlImage(src: string): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = src;
        });
    }
}
