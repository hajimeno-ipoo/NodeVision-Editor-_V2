import type {
    ColorGradingPipeline,
    ColorWheels,
    LUT3D,
} from '@nodevision/color-grading';
import type { PrimaryGradingNodeSettings } from '@nodevision/editor';

import type { RendererNode } from '../types';
import type { NodeRendererContext, NodeRendererModule } from './types';
import { WebGLLUTProcessor } from './webgl-lut-processor';
import { WebGLVideoProcessor } from './webgl-video-processor';
import { resolveExportLutRes, resolvePreviewLutRes, scheduleHighResLUTViaWorker } from './lut-utils';

// 動的にモジュールを読み込む
const colorGrading = (window as any).nodeRequire('@nodevision/color-grading');
const { buildColorTransform, generateLUT3D } = colorGrading;

export const createPrimaryGradingNodeRenderer = (context: NodeRendererContext): NodeRendererModule => {
    const { state, escapeHtml, t } = context;
    const getPreviewLutRes = (): number => resolvePreviewLutRes(state.lutResolutionPreview);
    const getExportLutRes = (): number => resolveExportLutRes(state.lutResolutionExport);
    const toastHQStart = () => context.showToast(t('toast.hqLutGenerating'));
    const toastHQApplied = () => context.showToast(t('toast.hqLutApplied'));
    const toastHQError = (err: unknown) => context.showToast(String(err), 'error');

    type Processor = WebGLLUTProcessor;
    const processors = new Map<string, Processor>();
    const videoProcessors = new Map<string, WebGLVideoProcessor>();
    const lastSourceByNode = new Map<string, string>();
    const isVideoSource = new Map<string, boolean>();
    const lutCache = new Map<string, { params: string; lut: LUT3D }>();

    const createProcessor = (): Processor => {
        const canvas = document.createElement('canvas');
        const processor = new WebGLLUTProcessor(canvas);
        // Enable WebGL float texture extension for high quality LUT application
        const gl = processor.getContext();
        gl.getExtension('OES_texture_float_linear');
        return processor;
    };

    /**
     * Primary Grading設定からColorGradingPipelineを構築
     */
    function buildPipeline(settings: PrimaryGradingNodeSettings): ColorGradingPipeline {
        const wheels: ColorWheels = {
            lift: {
                hue: settings.lift.hue,
                saturation: settings.lift.saturation,
                luminance: settings.lift.luminance,
            },
            gamma: {
                hue: settings.gamma.hue,
                saturation: settings.gamma.saturation,
                luminance: settings.gamma.luminance,
            },
            gain: {
                hue: settings.gain.hue,
                saturation: settings.gain.saturation,
                luminance: settings.gain.luminance,
            },
        };

        return {
            basic: {
                exposure: settings.exposure,
                brightness: 0,
                contrast: settings.contrast,
                saturation: settings.saturation,
                gamma: 1,
            },
            temperature: settings.temperature,
            tint: settings.tint,
            wheels: wheels,
        };
    }

    /**
     * メディアプレビューノードへ補正後の dataURL を反映
     */
    const propagateToMediaPreview = (node: RendererNode, processor?: Processor | WebGLVideoProcessor) => {
        if (!processor) {
            state.mediaPreviews.delete(node.id);
            state.canvasPreviews.delete(node.id);
            return;
        }

        let dataUrl: string | undefined;
        let size: { width: number; height: number } | undefined;

        if (processor instanceof WebGLVideoProcessor) {
            const canvas = processor.getCanvas();
            size = { width: canvas.width, height: canvas.height };
            // 動画の場合はCanvasPreviewとして登録
            state.canvasPreviews.set(node.id, canvas);
            // MediaPreviewにはダミーURLとメタデータを渡す
            state.mediaPreviews.set(node.id, {
                url: '', // CanvasPreviewが優先されるため空でOK
                width: size.width,
                height: size.height,
                kind: 'video',
                name: 'Primary Graded Video',
                size: 0,
                type: 'video/mp4',
                ownedUrl: false
            });
            return;
        }

        const canvas = processor.getContext().canvas;
        size = { width: canvas.width, height: canvas.height };
        dataUrl = (canvas as HTMLCanvasElement).toDataURL();

        if (dataUrl) {
            state.mediaPreviews.set(node.id, {
                url: dataUrl,
                name: 'Preview',
                kind: 'image',
                width: size.width,
                height: size.height,
                size: 0,
                type: 'image/png',
                ownedUrl: true,
            });
        } else {
            state.mediaPreviews.delete(node.id);
        }

        const connectedPreviewNodes = state.connections
            .filter((c) => c.fromNodeId === node.id)
            .map((c) => c.toNodeId);

        if (connectedPreviewNodes.length > 0) {
            requestAnimationFrame(() => {
                connectedPreviewNodes.forEach((previewNodeId) => {
                    const previewNode = state.nodes.find((n) => n.id === previewNodeId);
                    if (previewNode && previewNode.typeId === 'mediaPreview') {
                        const img = document.querySelector(
                            `.node-media[data-node-id="${previewNodeId}"] img`
                        );

                        if (img && dataUrl) {
                            (img as HTMLImageElement).src = dataUrl;
                        } else if (!img && dataUrl) {
                            context.renderNodes();
                        }
                    }
                });
            });
        }
    };

    /**
     * 上流ノードから元メディアの URL を取得
     */
    const getSourceMedia = (node: RendererNode): { url: string; isVideo: boolean } | null => {
        const inputPorts = ['source'];
        const conn = state.connections.find(
            (c) => c.toNodeId === node.id && inputPorts.includes(c.toPortId)
        );
        if (!conn) return null;

        const sourceNode = state.nodes.find((n) => n.id === conn.fromNodeId);
        if (!sourceNode) return null;

        const preview = state.mediaPreviews.get(sourceNode.id);
        if (preview?.url) {
            return {
                url: preview.url,
                isVideo: preview.kind === 'video'
            };
        }

        if (sourceNode.typeId === 'loadVideo' || sourceNode.typeId === 'loadImage') {
            const settings = sourceNode.settings as { filePath?: string } | undefined;
            if (settings?.filePath) {
                return { url: settings.filePath, isVideo: sourceNode.typeId === 'loadVideo' };
            }
        }

        return null;
    };

    const buildControls = (node: RendererNode): string => {
        const settings = (node.settings as PrimaryGradingNodeSettings) || {
            kind: 'primaryGrading',
            exposure: 0,
            contrast: 1,
            saturation: 1,
            temperature: 0,
            tint: 0,
            lift: { hue: 0, saturation: 0, luminance: 0 },
            gamma: { hue: 0, saturation: 0, luminance: 0 },
            gain: { hue: 0, saturation: 0, luminance: 0 },
        };

        const defaults: Record<string, number> = {
            exposure: 0,
            contrast: 1,
            saturation: 1,
            temperature: 0,
            tint: 0,
        };

        const resetIcon = (window as any).__NODEVISION_ICONS__?.reset ?? '↺';

        const renderSlider = (
            labelKey: string,
            key: string,
            min: number,
            max: number,
            step: number,
            value: number
        ) => {
            const defaultValue = defaults[key] ?? 0;
            return `
      <label class="control-label" style="display: block; margin-bottom: 8px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px; align-items: center;">
          <span class="control-label-text" data-i18n-key="${labelKey}">${escapeHtml(
                t(labelKey)
            )}</span>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="control-value" data-pg-value="${key}">${value.toFixed(2)}</span>
            <button class="reset-btn" data-target-key="${key}" data-default-value="${defaultValue}" title="リセット" aria-label="リセット" style="background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 4px; cursor: pointer; color: #e8eaed; padding: 0; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; line-height: 1; transition: background 0.2s;">
                <span style="pointer-events: none; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;">${resetIcon}</span>
            </button>
          </div>
        </div>
        <input 
          type="range" 
          class="node-slider" 
          data-pg-key="${key}" 
          data-node-id="${escapeHtml(node.id)}"
          data-node-interactive="true"
          min="${min}" max="${max}" step="${step}" value="${value}"
          style="width: 100%; position: relative; z-index: 10; pointer-events: auto;"
        />
      </label>
    `;
        };

        const renderColorWheel = (label: string, keyPrefix: string, hue: number, sat: number, lum: number) => {
            // Hue/Sat から XY座標への変換
            // 半径 50px
            const radius = 50;
            const cx = 60;
            const cy = 60;

            // Hueは0が赤(右)で、反時計回りが一般的だが、conic-gradientは上(0deg)から時計回り
            // 数学的には 0rad = 右。
            // conic-gradient: red at 0deg (上)
            // ここでは、0deg = 右 (赤) となるように調整が必要
            // CSS conic-gradient(from 90deg, ...) で右からスタートできるかも

            const rad = (hue * Math.PI) / 180;
            const r = sat * radius;
            const x = cx + r * Math.cos(rad);
            const y = cy + r * Math.sin(rad);

            return `
            <div class="color-wheel-control" style="display: flex; flex-direction: column; margin-bottom: 16px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px; align-items: center;">
                    <span class="control-label-text">${label}</span>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="control-value">
                            <span data-wheel-value="${keyPrefix}_hue">${hue.toFixed(0)}°</span> / 
                            <span data-wheel-value="${keyPrefix}_saturation">${(sat * 100).toFixed(0)}%</span> / 
                            <span data-wheel-value="${keyPrefix}_luminance">${(lum * 100).toFixed(0)}%</span>
                        </span>
                        <button class="reset-wheel-btn" data-wheel-target="${keyPrefix}" title="リセット" aria-label="リセット" style="background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 4px; cursor: pointer; color: #e8eaed; padding: 0; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; line-height: 1; transition: background 0.2s;">
                            <span style="pointer-events: none; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;">${resetIcon}</span>
                        </button>
                    </div>
                </div>
                <div style="display: flex; gap: 8px; align-items: center; justify-content: center;">
                    <div class="wheel-area" data-node-interactive="true" style="position: relative; width: 120px; height: 120px; cursor: crosshair;">
                        <div class="wheel-bg" style="
                            width: 100%; height: 100%; border-radius: 50%;
                            background: radial-gradient(circle, white 0%, transparent 70%), conic-gradient(red, magenta, blue, cyan, lime, yellow, red);
                        "></div>
                        <svg width="120" height="120" class="color-wheel-svg" data-wheel-key="${keyPrefix}" data-node-interactive="true" style="position: absolute; top: 0; left: 0;">
                            <circle cx="${x}" cy="${y}" r="5" fill="none" stroke="black" stroke-width="2" class="wheel-indicator" style="pointer-events: none;" />
                            <circle cx="${x}" cy="${y}" r="4" fill="none" stroke="white" stroke-width="2" class="wheel-indicator-inner" style="pointer-events: none;" />
                        </svg>
                    </div>
                    <div class="lum-slider-container" style="height: 120px; display: flex; flex-direction: column; justify-content: center; align-items: center;">
                        <input 
                            type="range" 
                            class="lum-slider" 
                            data-pg-key="${keyPrefix}_luminance"
                            data-node-interactive="true"
                            min="-1" max="1" step="0.01" value="${lum}"
                            orient="vertical"
                            style="
                                width: 120px;
                                height: 8px;
                                transform: rotate(-90deg);
                                transform-origin: center;
                                position: relative;
                                z-index: 10;
                                pointer-events: auto;
                            "
                        />
                    </div>
                </div>
            </div>
            `;
        };

        return `
      <div class="node-controls" style="padding: 12px;">
        <div class="pg-renderer-indicator" data-renderer="WebGL 2.0 (3D LUT)" style="font-size: 11px; color: #9aa0a6; margin-bottom: 8px;">
          レンダラー: WebGL 2.0 (3D LUT)
        </div>
        
        <div style="margin-bottom: 16px;">
            ${renderSlider('Exposure', 'exposure', -5, 5, 0.1, settings.exposure)}
            ${renderSlider('Contrast', 'contrast', 0, 2, 0.01, settings.contrast)}
            ${renderSlider('Saturation', 'saturation', 0, 2, 0.01, settings.saturation)}
            ${renderSlider('Temperature', 'temperature', -100, 100, 1, settings.temperature)}
            ${renderSlider('Tint', 'tint', -100, 100, 1, settings.tint)}
        </div>
        
        <div style="display: flex; flex-wrap: wrap; gap: 8px; justify-content: center;">
            ${renderColorWheel('Lift', 'lift', settings.lift.hue, settings.lift.saturation, settings.lift.luminance)}
            ${renderColorWheel('Gamma', 'gamma', settings.gamma.hue, settings.gamma.saturation, settings.gamma.luminance)}
            ${renderColorWheel('Gain', 'gain', settings.gain.hue, settings.gain.saturation, settings.gain.luminance)}
        </div>
      </div>
    `;
    };

    return {
        id: 'primary-grading',
        typeIds: ['primaryGrading'],
        render: (node) => ({
            afterPortsHtml: buildControls(node),
            afterRender: async (element) => {
                let processor = processors.get(node.id);
                if (!processor) {
                    processor = createProcessor();
                    processors.set(node.id, processor);
                }

                const updateValueAndPreview = (key: string, val: number) => {
                    // スライダー更新
                    const display = element.querySelector(`.control-value[data-pg-value="${key}"]`);
                    if (display) display.textContent = val.toFixed(2);

                    const slider = element.querySelector(`input[data-pg-key="${key}"]`) as HTMLInputElement;
                    if (slider && parseFloat(slider.value) !== val) {
                        slider.value = val.toString();
                    }

                    // ホイール値の表示更新
                    const wheelValueDisplay = element.querySelector(`[data-wheel-value="${key}"]`);
                    if (wheelValueDisplay) {
                        if (key.endsWith('_hue')) {
                            wheelValueDisplay.textContent = `${val.toFixed(0)}°`;
                        } else if (key.endsWith('_saturation')) {
                            wheelValueDisplay.textContent = `${(val * 100).toFixed(0)}%`;
                        } else if (key.endsWith('_luminance')) {
                            wheelValueDisplay.textContent = `${(val * 100).toFixed(0)}%`;
                        }
                    }

                    const targetNode = state.nodes.find((n) => n.id === node.id);
                    if (targetNode) {
                        const currentSettings = (targetNode.settings as PrimaryGradingNodeSettings) || {
                            kind: 'primaryGrading',
                            exposure: 0,
                            contrast: 1,
                            saturation: 1,
                            temperature: 0,
                            tint: 0,
                            lift: { hue: 0, saturation: 0, luminance: 0 },
                            gamma: { hue: 0, saturation: 0, luminance: 0 },
                            gain: { hue: 0, saturation: 0, luminance: 0 },
                        };

                        // Handle nested keys (lift_luminance, gamma_luminance, gain_luminance)
                        // Also handle hue/saturation updates from wheels
                        if (key.includes('_')) {
                            const [wheel, prop] = key.split('_');
                            if (wheel === 'lift' || wheel === 'gamma' || wheel === 'gain') {
                                // 型安全な更新
                                const wheelSettings = currentSettings[wheel];
                                if (prop === 'hue' || prop === 'saturation' || prop === 'luminance') {
                                    wheelSettings[prop] = val;
                                }
                            }
                        } else {
                            // 型安全な更新
                            if (key === 'exposure' || key === 'contrast' || key === 'saturation' || key === 'temperature' || key === 'tint') {
                                currentSettings[key] = val;
                            }
                        }

                        targetNode.settings = currentSettings;
                        node.settings = currentSettings;

                        // プレビュー更新
                        const settings = currentSettings;

                        // 動画プロセッサーの更新（動画の場合）
                        const videoProcessor = videoProcessors.get(node.id);
                        const isVideo = isVideoSource.get(node.id);

                        if (isVideo && videoProcessor) {
                            // 動画の場合：WebGLVideoProcessorで直接処理（LUT生成不要）
                            videoProcessor.applyPrimaryGrading(settings);
                        } else if (processor) {
                            // 画像の場合：Offscreen CanvasでLUT処理
                            const paramsHash = JSON.stringify(settings);
                            let lut = lutCache.get(node.id)?.lut;

                            if (!lut || lutCache.get(node.id)?.params !== paramsHash) {
                                const pipeline = buildPipeline(settings);
                                const transform = buildColorTransform(pipeline);
                                lut = generateLUT3D(getPreviewLutRes(), transform);
                                if (lut) {
                                    lutCache.set(node.id, { params: paramsHash, lut });
                                }
                            }

                            if (lut) {
                                processor.loadLUT(lut);
                                processor.renderWithCurrentTexture();

                                const highRes = Math.max(getPreviewLutRes(), getExportLutRes());
                                scheduleHighResLUTViaWorker(
                                    `${node.id}-primary`,
                                    200,
                                    () => buildPipeline(settings),
                                    highRes,
                                    (hiLut) => {
                                        lutCache.set(node.id, { params: JSON.stringify(settings), lut: hiLut });
                                        processor.loadLUT(hiLut);
                                        processor.renderWithCurrentTexture();
                                        toastHQApplied();
                                    },
                                    'pipeline',
                                    toastHQStart,
                                    toastHQError
                                );
                            }

                            propagateToMediaPreview(node, processor);
                        }
                    }
                };

                // スライダーのイベント処理
                const sliders = element.querySelectorAll('.node-slider');
                sliders.forEach(slider => {
                    // ノードのドラッグを防ぐが、スライダーのデフォルト動作は保持
                    slider.addEventListener('pointerdown', (e) => {
                        e.stopPropagation(); // ノードのドラッグハンドラーに伝播させない
                        // e.preventDefault() は呼ばない（スライダーのドラッグを許可）
                    });

                    // リアルタイム更新
                    slider.addEventListener('input', (e) => {
                        const target = e.target as HTMLInputElement;
                        const key = target.getAttribute('data-pg-key');
                        if (key) {
                            updateValueAndPreview(key, parseFloat(target.value));
                        }
                    });
                });

                // 輝度スライダー（縦型）のイベント処理
                const lumSliders = element.querySelectorAll('.lum-slider');
                lumSliders.forEach(slider => {
                    slider.addEventListener('pointerdown', (e) => {
                        e.stopPropagation();
                        // スライダーのデフォルト動作は保持
                    });

                    slider.addEventListener('input', (e) => {
                        const target = e.target as HTMLInputElement;
                        const key = target.getAttribute('data-pg-key');
                        if (key) {
                            updateValueAndPreview(key, parseFloat(target.value));
                        }
                    });
                });

                const resetBtns = element.querySelectorAll('.reset-btn');
                resetBtns.forEach(btn => {
                    btn.addEventListener('pointerdown', (e) => {
                        e.stopPropagation();
                    });
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation(); // ノード選択を防ぐ
                        const target = e.currentTarget as HTMLElement;
                        const key = target.getAttribute('data-target-key');
                        const defaultVal = target.getAttribute('data-default-value');

                        if (key && defaultVal !== null) {
                            updateValueAndPreview(key, parseFloat(defaultVal));
                        }
                    });
                });

                // カラーホイールのイベント処理
                const wheelAreas = element.querySelectorAll('.wheel-area');
                wheelAreas.forEach(area => {
                    // ホイールエリア全体でノード選択を防ぐ
                    area.addEventListener('pointerdown', (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                    });

                    area.addEventListener('pointerup', (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                    });

                    area.addEventListener('click', (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                    });
                });

                const wheels = element.querySelectorAll('.color-wheel-svg');
                wheels.forEach(svg => {
                    const keyPrefix = svg.getAttribute('data-wheel-key');
                    if (!keyPrefix) return;

                    let isDragging = false;
                    const radius = 50;
                    const cx = 60;
                    const cy = 60;

                    const updateFromEvent = (e: MouseEvent) => {
                        const rect = svg.getBoundingClientRect();

                        // SVGの定義サイズ（内部座標系）
                        const svgWidth = 120;
                        const svgHeight = 120;

                        // 表示サイズと内部サイズの比率（ズーム補正）
                        // rect.width/height は画面上の表示サイズ（ズーム適用後）
                        // これを使ってマウス移動量を内部座標系に変換する
                        const scaleX = svgWidth / rect.width;
                        const scaleY = svgHeight / rect.height;

                        // 内部座標系でのマウス位置（中心からのオフセット）
                        const dx = (e.clientX - rect.left) * scaleX - cx;
                        const dy = (e.clientY - rect.top) * scaleY - cy;

                        // 距離と角度を計算
                        let r = Math.sqrt(dx * dx + dy * dy);
                        const angle = Math.atan2(dy, dx); // -PI to PI

                        // 半径を制限 (0 to radius)
                        if (r > radius) r = radius;

                        // Saturation (0-1)
                        const sat = r / radius;

                        // Hue (0-360)
                        // atan2は右(0)から時計回りに正、反時計回りに負
                        // 0 -> 0deg
                        // PI/2 -> 90deg
                        // -PI/2 -> -90deg -> 270deg
                        let hue = (angle * 180) / Math.PI;
                        if (hue < 0) hue += 360;

                        // インジケーター更新
                        const indicator = svg.querySelector('.wheel-indicator');
                        const indicatorInner = svg.querySelector('.wheel-indicator-inner');
                        if (indicator && indicatorInner) {
                            const ix = cx + r * Math.cos(angle);
                            const iy = cy + r * Math.sin(angle);
                            indicator.setAttribute('cx', ix.toString());
                            indicator.setAttribute('cy', iy.toString());
                            indicatorInner.setAttribute('cx', ix.toString());
                            indicatorInner.setAttribute('cy', iy.toString());
                        }

                        // 設定更新
                        updateValueAndPreview(`${keyPrefix}_hue`, hue);
                        updateValueAndPreview(`${keyPrefix}_saturation`, sat);
                    };

                    const handlePointerMove = (e: Event) => {
                        const ptrEvent = e as PointerEvent;
                        if (!isDragging) return;
                        ptrEvent.preventDefault();
                        ptrEvent.stopPropagation();
                        updateFromEvent(ptrEvent as unknown as MouseEvent);
                    };

                    const handlePointerUp = (e: Event) => {
                        const ptrEvent = e as PointerEvent;
                        ptrEvent.stopPropagation();
                        ptrEvent.preventDefault();
                        isDragging = false;
                        try {
                            svg.releasePointerCapture(ptrEvent.pointerId);
                        } catch (err) {
                            // Ignore error if pointer capture was lost
                        }
                        svg.removeEventListener('pointermove', handlePointerMove);
                        svg.removeEventListener('pointerup', handlePointerUp);
                    };

                    svg.addEventListener('pointerdown', (e: Event) => {
                        const ptrEvent = e as PointerEvent;
                        ptrEvent.stopPropagation();
                        ptrEvent.preventDefault();
                        isDragging = true;
                        svg.setPointerCapture(ptrEvent.pointerId);
                        updateFromEvent(ptrEvent as unknown as MouseEvent);

                        svg.addEventListener('pointermove', handlePointerMove);
                        svg.addEventListener('pointerup', handlePointerUp);
                    });

                    // ダブルクリックでリセット
                    svg.addEventListener('dblclick', () => {
                        updateValueAndPreview(`${keyPrefix}_hue`, 0);
                        updateValueAndPreview(`${keyPrefix}_saturation`, 0);

                        // インジケーターもリセット
                        const cx = 60;
                        const cy = 60;
                        const indicator = svg.querySelector('.wheel-indicator');
                        const indicatorInner = svg.querySelector('.wheel-indicator-inner');
                        if (indicator && indicatorInner) {
                            indicator.setAttribute('cx', cx.toString());
                            indicator.setAttribute('cy', cy.toString());
                            indicatorInner.setAttribute('cx', cx.toString());
                            indicatorInner.setAttribute('cy', cy.toString());
                        }
                    });
                });

                // ホイールリセットボタン
                element.querySelectorAll('.reset-wheel-btn').forEach(btn => {
                    // Prevent node selection
                    btn.addEventListener('pointerdown', (e) => {
                        e.stopPropagation();
                    });

                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const target = e.currentTarget as HTMLElement;
                        const keyPrefix = target.getAttribute('data-wheel-target');
                        if (keyPrefix) {
                            updateValueAndPreview(`${keyPrefix}_hue`, 0);
                            updateValueAndPreview(`${keyPrefix}_saturation`, 0);
                            updateValueAndPreview(`${keyPrefix}_luminance`, 0);

                            // インジケーターもリセット
                            const svg = element.querySelector(`svg[data-wheel-key="${keyPrefix}"]`);
                            if (svg) {
                                const indicator = svg.querySelector('.wheel-indicator');
                                const indicatorInner = svg.querySelector('.wheel-indicator-inner');
                                if (indicator && indicatorInner) {
                                    const cx = 60;
                                    const cy = 60;
                                    indicator.setAttribute('cx', cx.toString());
                                    indicator.setAttribute('cy', cy.toString());
                                    indicatorInner.setAttribute('cx', cx.toString());
                                    indicatorInner.setAttribute('cy', cy.toString());
                                }
                            }
                        }
                    });
                });

                // 初期化処理
                const sourceMedia = getSourceMedia(node);
                if (sourceMedia) {
                    try {
                        const isVideo = sourceMedia.isVideo;
                        isVideoSource.set(node.id, isVideo);

                        if (isVideo) {
                            // 動画の場合：WebGLVideoProcessorで処理


                            const videoUrl = sourceMedia.url;
                            // VideoProcessorの取得または作成
                            let videoProcessor = videoProcessors.get(node.id);
                            if (!videoProcessor) {
                                const canvas = document.createElement('canvas');
                                canvas.width = 1280;
                                canvas.height = 720;
                                videoProcessor = new WebGLVideoProcessor(canvas);
                                videoProcessors.set(node.id, videoProcessor);
                            }

                            // 隠しvideo要素の管理
                            let video = (videoProcessor as any)._videoElement as HTMLVideoElement;
                            if (!video) {
                                video = document.createElement('video');
                                video.crossOrigin = 'anonymous';
                                video.loop = true;
                                video.muted = true;
                                video.playsInline = true;
                                (videoProcessor as any)._videoElement = video;
                            }

                            if (video.src !== videoUrl) {
                                video.src = videoUrl;
                                // 非同期で再生開始
                                video.play().catch(e => console.error('[PrimaryGrading] Video auto-play failed:', e));
                                videoProcessor.loadVideo(video);
                            }

                            // Apply primary grading settings to video processor
                            videoProcessor.applyPrimaryGrading(node.settings as PrimaryGradingNodeSettings);

                            // プレビュー伝播（メタデータのみ）
                            propagateToMediaPreview(node, videoProcessor);

                            // プレビュー伝播（再生開始を待たずに即座に登録）
                            propagateToMediaPreview(node, videoProcessor);
                        } else {
                            // 静止画の場合
                            let imageUrl = sourceMedia.url;

                            if (sourceMedia.url.startsWith('file://')) {
                                const result = await window.nodevision.loadImageAsDataURL({
                                    filePath: sourceMedia.url,
                                });
                                if (result.ok && result.dataURL) {
                                    imageUrl = result.dataURL;
                                }
                            }

                            const lastSource = lastSourceByNode.get(node.id);
                            // 画像がない場合、または異なるソースの場合は必ず再ロード
                            const shouldReload = !processor.hasImage?.() || lastSource !== imageUrl;

                            if (shouldReload) {
                                await processor.loadImage(imageUrl);
                                lastSourceByNode.set(node.id, imageUrl);
                            }

                            // 初期プレビュー生成
                            const settings = node.settings as PrimaryGradingNodeSettings;

                            const paramsHash = JSON.stringify(settings);
                            let lut = lutCache.get(node.id)?.lut;

                            if (!lut || lutCache.get(node.id)?.params !== paramsHash) {
                                const pipeline = buildPipeline(settings);
                                const transform = buildColorTransform(pipeline);
                                lut = generateLUT3D(getPreviewLutRes(), transform);
                                if (lut) {
                                    lutCache.set(node.id, { params: paramsHash, lut });
                                } else {
                                    console.error('[PrimaryGrading] LUT generation failed');
                                }
                            }

                            if (lut && processor.hasImage?.()) {
                                processor.loadLUT(lut);
                                processor.renderWithCurrentTexture();
                                propagateToMediaPreview(node, processor);

                                const highRes = Math.max(getPreviewLutRes(), getExportLutRes());
                                scheduleHighResLUTViaWorker(
                                    `${node.id}-primary-still`,
                                    200,
                                    () => buildPipeline(settings),
                                    highRes,
                                    (hiLut) => {
                                        lutCache.set(node.id, { params: JSON.stringify(settings), lut: hiLut });
                                        processor.loadLUT(hiLut);
                                        processor.renderWithCurrentTexture();
                                        propagateToMediaPreview(node, processor);
                                        toastHQApplied();
                                    },
                                    'pipeline',
                                    toastHQStart,
                                    toastHQError
                                );
                            } else {
                                console.warn('[PrimaryGrading] Skipping preview generation', {
                                    hasLUT: !!lut,
                                    hasImage: processor.hasImage?.()
                                });
                            }
                        }
                    } catch (error) {
                        console.error('[PrimaryGrading] Preview setup failed', error);
                    }
                } else {
                    lastSourceByNode.delete(node.id);
                    isVideoSource.delete(node.id);
                    propagateToMediaPreview(node, undefined);
                }
            },
        }),
    };
};
