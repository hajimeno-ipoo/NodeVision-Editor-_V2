import type {
    ColorGradingPipeline,
    ColorWheels,
    LUT3D,
} from '@nodevision/color-grading';
import type { PrimaryGradingNodeSettings } from '@nodevision/editor';

import type { RendererNode } from '../types';
import type { NodeRendererContext, NodeRendererModule } from './types';
import { WebGLLUTProcessor } from './webgl-lut-processor';

// 動的にモジュールを読み込む
const colorGrading = (window as any).nodeRequire('@nodevision/color-grading');
const { buildColorTransform, generateLUT3D } = colorGrading;

export const createPrimaryGradingNodeRenderer = (context: NodeRendererContext): NodeRendererModule => {
    const { state, escapeHtml, t } = context;

    type Processor = WebGLLUTProcessor;
    const processors = new Map<string, Processor>();
    const lastSourceByNode = new Map<string, string>();
    const lutCache = new Map<string, { params: string; lut: LUT3D }>();

    const createProcessor = (): Processor => {
        const canvas = document.createElement('canvas');
        return new WebGLLUTProcessor(canvas);
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
    const propagateToMediaPreview = (node: RendererNode, processor?: Processor) => {
        let dataUrl: string | null = null;
        let size = { width: 0, height: 0 };

        if (processor) {
            const canvas = processor.getContext().canvas;
            size = { width: canvas.width, height: canvas.height };
            dataUrl = (canvas as HTMLCanvasElement).toDataURL();
        }

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
    const getSourceMedia = (node: RendererNode): string | null => {
        const inputPorts = ['source'];
        const conn = state.connections.find(
            (c) => c.toNodeId === node.id && inputPorts.includes(c.toPortId)
        );
        if (!conn) return null;

        const sourceNode = state.nodes.find((n) => n.id === conn.fromNodeId);
        if (!sourceNode) return null;

        const preview = state.mediaPreviews.get(sourceNode.id);
        if (preview?.url) return preview.url;

        if (sourceNode.typeId === 'loadVideo' || sourceNode.typeId === 'loadImage') {
            const settings = sourceNode.settings as { filePath?: string } | undefined;
            if (settings?.filePath) {
                return settings.filePath;
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
            <button class="reset-btn" data-target-key="${key}" data-default-value="${defaultValue}" title="リセット" aria-label="リセット" style="background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 4px; cursor: pointer; color: #e8eaed; padding: 0 8px; font-size: 14px; height: 24px; display: flex; align-items: center; justify-content: center; transition: background 0.2s;">↺</button>
          </div>
        </div>
        <input 
          type="range" 
          class="node-slider" 
          data-pg-key="${key}" 
          data-node-id="${escapeHtml(node.id)}"
          min="${min}" max="${max}" step="${step}" value="${value}"
          style="width: 100%;"
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
            <div class="color-wheel-control" style="display: flex; flex-direction: column; align-items: center; margin-bottom: 16px;">
                <div style="display: flex; justify-content: space-between; width: 100%; margin-bottom: 4px;">
                    <label style="font-size: 12px;">${label}</label>
                    <button class="reset-wheel-btn" data-wheel-target="${keyPrefix}" style="background: none; border: none; color: #888; cursor: pointer; font-size: 12px;">↺</button>
                </div>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <div class="wheel-area" style="position: relative; width: 120px; height: 120px; cursor: crosshair;">
                        <div class="wheel-bg" style="
                            width: 100%; height: 100%; border-radius: 50%;
                            background: radial-gradient(circle, white 0%, transparent 70%), conic-gradient(red, magenta, blue, cyan, lime, yellow, red);
                        "></div>
                        <svg width="120" height="120" class="color-wheel-svg" data-wheel-key="${keyPrefix}" style="position: absolute; top: 0; left: 0;">
                            <circle cx="${x}" cy="${y}" r="5" fill="none" stroke="black" stroke-width="2" class="wheel-indicator" style="pointer-events: none;" />
                            <circle cx="${x}" cy="${y}" r="4" fill="none" stroke="white" stroke-width="2" class="wheel-indicator-inner" style="pointer-events: none;" />
                        </svg>
                    </div>
                    <div class="lum-slider-container" style="height: 120px; display: flex; flex-direction: column; justify-content: center; align-items: center;">
                        <input 
                            type="range" 
                            class="lum-slider" 
                            data-pg-key="${keyPrefix}_luminance" 
                            min="-1" max="1" step="0.01" value="${lum}"
                            style="
                                writing-mode: bt-lr; /* IE/Edge */
                                -webkit-appearance: slider-vertical; /* WebKit */
                                width: 8px; 
                                height: 100%;
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

                const sourceMediaUrl = getSourceMedia(node);

                const updateValueAndPreview = (key: string, val: number) => {
                    // スライダー更新
                    const display = element.querySelector(`.control-value[data-pg-value="${key}"]`);
                    if (display) display.textContent = val.toFixed(2);

                    const slider = element.querySelector(`input[data-pg-key="${key}"]`) as HTMLInputElement;
                    if (slider && parseFloat(slider.value) !== val) {
                        slider.value = val.toString();
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
                        if (processor) {
                            const paramsHash = JSON.stringify(settings);
                            let lut = lutCache.get(node.id)?.lut;

                            if (!lut || lutCache.get(node.id)?.params !== paramsHash) {
                                const pipeline = buildPipeline(settings);
                                const transform = buildColorTransform(pipeline);
                                lut = generateLUT3D(33, transform);
                                if (lut) {
                                    lutCache.set(node.id, { params: paramsHash, lut });
                                }
                            }

                            if (lut) {
                                processor.loadLUT(lut);
                                processor.renderWithCurrentTexture();
                            }

                            propagateToMediaPreview(node, processor);
                        }
                    }
                };

                // カラーホイールのイベント処理
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
                        const dx = e.clientX - rect.left - cx;
                        const dy = e.clientY - rect.top - cy;

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

                    svg.addEventListener('mousedown', (e) => {
                        isDragging = true;
                        updateFromEvent(e as MouseEvent);
                    });

                    window.addEventListener('mousemove', (e) => {
                        if (!isDragging) return;
                        // SVG外に出てもドラッグ継続するためにwindowでlistenするが、
                        // 座標計算のためにrectが必要。
                        // 簡易的に、svg要素上の座標系で計算したいので、
                        // ここではsvg要素に対して座標を計算するロジックを再利用する
                        // ただし、getBoundingClientRectはスクロール等で変わる可能性があるので注意

                        // マウス位置がSVG矩形外にある場合でも、中心からの角度と距離（制限付き）で計算すればOK
                        const rect = svg.getBoundingClientRect();
                        const dx = e.clientX - rect.left - cx;
                        const dy = e.clientY - rect.top - cy;

                        let r = Math.sqrt(dx * dx + dy * dy);
                        const angle = Math.atan2(dy, dx);

                        if (r > radius) r = radius;
                        const sat = r / radius;
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

                        updateValueAndPreview(`${keyPrefix}_hue`, hue);
                        updateValueAndPreview(`${keyPrefix}_saturation`, sat);
                    });

                    window.addEventListener('mouseup', () => {
                        isDragging = false;
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
                    btn.addEventListener('click', (e) => {
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
                if (sourceMediaUrl) {
                    try {
                        let imageUrl = sourceMediaUrl;

                        if (sourceMediaUrl.startsWith('file://')) {
                            const result = await window.nodevision.loadImageAsDataURL({
                                filePath: sourceMediaUrl,
                            });
                            if (result.ok && result.dataURL) {
                                imageUrl = result.dataURL;
                            }
                        }

                        const lastSource = lastSourceByNode.get(node.id);
                        const shouldReload = !processor.hasImage?.() || lastSource !== imageUrl;

                        if (shouldReload) {
                            await processor.loadImage(imageUrl);
                            lastSourceByNode.set(node.id, imageUrl);
                        }

                        const settings = node.settings as PrimaryGradingNodeSettings;
                        updateValueAndPreview('exposure', settings.exposure ?? 0);
                    } catch (error) {
                        console.error('[PrimaryGrading] Preview setup failed', error);
                    }
                } else {
                    lastSourceByNode.delete(node.id);
                    propagateToMediaPreview(node, undefined);
                }

                // スライダー入力イベント
                const inputs = element.querySelectorAll('input[type="range"]');
                inputs.forEach((input) => {
                    input.addEventListener('input', (e) => {
                        const target = e.target as HTMLInputElement;
                        const key = target.getAttribute('data-pg-key');
                        if (!key) return;
                        const val = parseFloat(target.value);
                        updateValueAndPreview(key, val);
                    });
                });

                // リセットボタンイベント
                const resetButtons = element.querySelectorAll('.reset-btn');
                resetButtons.forEach((btn) => {
                    btn.addEventListener('click', (e) => {
                        const target = e.currentTarget as HTMLButtonElement;
                        const key = target.getAttribute('data-target-key');
                        const defaultValue = parseFloat(
                            target.getAttribute('data-default-value') || '0'
                        );

                        if (key) {
                            updateValueAndPreview(key, defaultValue);
                        }
                    });
                });
            },
        }),
    };
};
