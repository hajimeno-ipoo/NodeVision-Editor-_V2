/**
 * WebGL-based 3D LUT Processor
 * Applies color grading using 3D textures (WebGL 2.0)
 */

import type { LUT3D } from '@nodevision/color-grading';

export class WebGLLUTProcessor {
    private gl: WebGL2RenderingContext;
    private program!: WebGLProgram;
    private lut3DTexture: WebGLTexture | null = null;
    private inputTexture: WebGLTexture | null = null;
    private intensity: number = 1.0;
    private currentLUTSize: number = 0;
    private imageSize: { width: number; height: number } | null = null;

    // Quad buffers
    private positionBuffer!: WebGLBuffer;
    private texcoordBuffer!: WebGLBuffer;

    constructor(canvas: HTMLCanvasElement) {
        // Require WebGL 2 for 3D textures
        const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true });
        if (!gl) {
            throw new Error('WebGL 2.0 is required for 3D LUTs');
        }
        this.gl = gl;

        // Enable float texture linear filtering
        if (!gl.getExtension('OES_texture_float_linear')) {
            console.warn('[WebGLLUT] OES_texture_float_linear not supported, LUT quality may be degraded');
        }
        if (!gl.getExtension('EXT_color_buffer_float')) {
            console.warn('[WebGLLUT] EXT_color_buffer_float not supported');
        }

        this.initGL();
    }

    private initGL() {
        this.program = this.createProgram();
        this.positionBuffer = this.createQuadBuffer();
        this.texcoordBuffer = this.createTexcoordBuffer();
    }

    /**
     * Load an image from URL
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

        this.gl.canvas.width = width;
        this.gl.canvas.height = height;
        this.imageSize = { width, height };

        this.createInputTexture(img, width, height);
    }

    private createInputTexture(img: HTMLImageElement, width: number, height: number) {
        const gl = this.gl;
        console.log('[WebGLLUT] Creating input texture:', width, 'x', height);

        if (!this.inputTexture) {
            this.inputTexture = gl.createTexture();
        }

        gl.bindTexture(gl.TEXTURE_2D, this.inputTexture);

        // Ensure pixel store is correct for 2D image
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        // Draw to a temp canvas to resize if needed
        try {
            if (width !== img.width || height !== img.height) {
                const tmp = document.createElement('canvas');
                tmp.width = width;
                tmp.height = height;
                const ctx = tmp.getContext('2d');
                if (ctx) {
                    ctx.drawImage(img, 0, 0, width, height);
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tmp);
                }
            } else {
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
            }

            const error = gl.getError();
            if (error !== gl.NO_ERROR) {
                console.error('[WebGLLUT] Error uploading input texture:', error);
            } else {
                console.log('[WebGLLUT] Input texture uploaded successfully');
            }
        } catch (e) {
            console.error('[WebGLLUT] Exception uploading input texture:', e);
        }
    }

    /**
     * Load a 3D LUT into GPU memory
     */
    loadLUT(lut: LUT3D): void {
        const { gl } = this;
        // console.log('[WebGLLUT] Loading LUT, size:', lut.resolution);

        if (!this.lut3DTexture) {
            this.lut3DTexture = gl.createTexture();
        }

        gl.bindTexture(gl.TEXTURE_3D, this.lut3DTexture);

        // IMPORTANT: 3D textures don't support FLIP_Y or PREMULTIPLY_ALPHA
        // Reset pixel store parameters to default before uploading
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);

        // Set texture parameters for trilinear filtering
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        const size = lut.resolution;
        this.currentLUTSize = size;

        // Upload data
        try {
            gl.texImage3D(
                gl.TEXTURE_3D,
                0,                  // level
                gl.RGB32F,          // internal format (High precision float)
                size, size, size,   // width, height, depth
                0,                  // border
                gl.RGB,             // format
                gl.FLOAT,           // type
                lut.data            // pixels
            );

            const error = gl.getError();
            if (error !== gl.NO_ERROR) {
                console.error('[WebGLLUT] Error uploading 3D LUT:', error);
            }
        } catch (e) {
            console.error('[WebGLLUT] Exception uploading 3D LUT:', e);
        }
    }

    /**
     * Set LUT intensity (0.0 - 1.0)
     */
    setIntensity(value: number): void {
        this.intensity = Math.max(0, Math.min(1, value));
    }

    /**
     * Render using the currently loaded input texture and LUT
     */
    renderWithCurrentTexture(): void {
        if (this.inputTexture && this.imageSize) {
            this.render(this.inputTexture, this.imageSize.width, this.imageSize.height);
        } else {
            console.warn('[WebGLLUT] Cannot render: missing input texture or image size');
        }
    }

    /**
     * Render the input image with LUT applied
     */
    render(inputTexture: WebGLTexture, width: number, height: number): void {
        const { gl } = this;

        if (!this.lut3DTexture) {
            console.warn('[WebGLLUT] Cannot render: missing 3D LUT texture');
            return;
        }

        gl.viewport(0, 0, width, height);
        gl.useProgram(this.program);

        // Setup attributes
        this.bindAttributes();

        // Bind input texture (Unit 0)
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, inputTexture);
        gl.uniform1i(gl.getUniformLocation(this.program, 'u_image'), 0);

        // Bind LUT 3D texture (Unit 1)
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_3D, this.lut3DTexture);
        gl.uniform1i(gl.getUniformLocation(this.program, 'u_lut'), 1);

        // Set LUT size uniform
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_lutSize'), this.currentLUTSize);

        // Set intensity uniform
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_intensity'), this.intensity);

        // Draw
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        const error = gl.getError();
        if (error !== gl.NO_ERROR) {
            console.error('[WebGLLUT] WebGL Error during render:', error);
        } else {
            // console.log('[WebGLLUT] Render successful');
        }
    }

    hasImage(): boolean {
        return !!this.inputTexture && !!this.imageSize;
    }

    getContext(): WebGL2RenderingContext {
        return this.gl;
    }

    private createProgram(): WebGLProgram {
        const gl = this.gl;

        const vsSource = `#version 300 es
            in vec2 a_position;
            in vec2 a_texCoord;
            out vec2 v_texCoord;
            
            void main() {
                gl_Position = vec4(a_position, 0.0, 1.0);
                v_texCoord = a_texCoord;
            }
        `;

        const fsSource = `#version 300 es
            precision highp float;
            precision highp sampler3D;

            uniform sampler2D u_image;
            uniform sampler3D u_lut;
            uniform float u_lutSize;
            uniform float u_intensity;

            in vec2 v_texCoord;
            out vec4 fragColor;

            void main() {
                vec4 color = texture(u_image, v_texCoord);
                
                // LUT coordinate calculation
                // Map 0.0-1.0 to center of texels to avoid edge artifacts
                // Formula: (color * (size - 1) + 0.5) / size
                vec3 scale = vec3((u_lutSize - 1.0) / u_lutSize);
                vec3 offset = vec3(0.5 / u_lutSize);
                
                vec3 lutCoord = color.rgb * scale + offset;
                
                // Sample 3D LUT with trilinear interpolation
                vec3 graded = texture(u_lut, lutCoord).rgb;
                
                // Mix original and graded color based on intensity
                vec3 finalColor = mix(color.rgb, graded, u_intensity);
                
                fragColor = vec4(finalColor, color.a);
            }
        `;

        const program = gl.createProgram()!;
        const vs = this.compileShader(gl.VERTEX_SHADER, vsSource);
        const fs = this.compileShader(gl.FRAGMENT_SHADER, fsSource);

        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error(`WebGL Program Link Error: ${gl.getProgramInfoLog(program)}`);
        }

        return program;
    }

    private compileShader(type: number, source: string): WebGLShader {
        const gl = this.gl;
        const shader = gl.createShader(type)!;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            throw new Error(`Shader Compile Error: ${gl.getShaderInfoLog(shader)}`);
        }
        return shader;
    }

    private createQuadBuffer(): WebGLBuffer {
        const gl = this.gl;
        const buffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1,
            1, -1,
            -1, 1,
            1, 1
        ]), gl.STATIC_DRAW);
        return buffer;
    }

    private createTexcoordBuffer(): WebGLBuffer {
        const gl = this.gl;
        const buffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            0, 0,
            1, 0,
            0, 1,
            1, 1
        ]), gl.STATIC_DRAW);
        return buffer;
    }

    private bindAttributes() {
        const gl = this.gl;

        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        const posLoc = gl.getAttribLocation(this.program, 'a_position');
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.texcoordBuffer);
        const texLoc = gl.getAttribLocation(this.program, 'a_texCoord');
        gl.enableVertexAttribArray(texLoc);
        gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);
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
