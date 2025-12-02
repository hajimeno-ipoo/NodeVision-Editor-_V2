import type {
    ColorGradingPipeline,
    LUT3D
} from '@nodevision/color-grading';
import type { SecondaryGradingNodeSettings } from '@nodevision/editor';

import type { RendererNode } from '../types';

// 動的にモジュールを読み込む
const colorGrading = (window as any).nodeRequire('@nodevision/color-grading');
const { buildColorTransform, calculateHSLKey, generateLUT3D } = colorGrading;
import type { NodeRendererContext, NodeRendererModule } from './types';
import { WebGLLUTProcessor } from './webgl-lut-processor';

export const createSecondaryGradingNodeRenderer = (context: NodeRendererContext): NodeRendererModule => {
    const { state, escapeHtml } = context;

    type Processor = WebGLLUTProcessor;
    const processors = new Map<string, Processor>();
    const lastSourceByNode = new Map<string, string>();
    const lutCache = new Map<string, { params: string; lut: LUT3D }>();

    const createProcessor = (): Processor => {
        const canvas = document.createElement('canvas');
        return new WebGLLUTProcessor(canvas);
    };

    /**
     * Secondary Grading設定からColorGradingPipelineを構築
     */
    function buildPipeline(settings: SecondaryGradingNodeSettings): ColorGradingPipeline {
        return {
            secondary: [{
                keyer: {
                    hueCenter: settings.hueCenter,
                    hueWidth: settings.hueWidth,
                    hueSoftness: settings.hueSoftness,
                    satCenter: settings.satCenter,
                    satWidth: settings.satWidth,
                    satSoftness: settings.satSoftness,
                    lumCenter: settings.lumCenter,
                    lumWidth: settings.lumWidth,
                    lumSoftness: settings.lumSoftness,
                    invert: settings.invert
                },
                correction: {
                    saturation: settings.saturation,
                    hueShift: settings.hueShift,
                    brightness: settings.brightness
                }
            }]
        };
    }

    /**
     * マスク表示用の変換関数を構築
     */
    function buildMaskTransform(settings: SecondaryGradingNodeSettings) {
        return (r: number, g: number, b: number): [number, number, number] => {
            const keyerParams = {
                hueCenter: settings.hueCenter,
                hueWidth: settings.hueWidth,
                hueSoftness: settings.hueSoftness,
                satCenter: settings.satCenter,
                satWidth: settings.satWidth,
                satSoftness: settings.satSoftness,
                lumCenter: settings.lumCenter,
                lumWidth: settings.lumWidth,
                lumSoftness: settings.lumSoftness,
                invert: settings.invert
            };

            const key = calculateHSLKey(r, g, b, keyerParams);

            // マスクを白黒で表示
            return [key, key, key];
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
        const settings = (node.settings as SecondaryGradingNodeSettings) || {
            kind: 'secondaryGrading',
            hueCenter: 0,
            hueWidth: 20,
            hueSoftness: 10,
            satCenter: 0.5,
            satWidth: 0.5,
            satSoftness: 0.1,
            lumCenter: 0.5,
            lumWidth: 0.5,
            lumSoftness: 0.1,
            invert: false,
            saturation: 1.0,
            hueShift: 0,
            brightness: 0,
            showMask: false
        };

        const renderSlider = (
            label: string,
            key: string,
            min: number,
            max: number,
            step: number,
            value: number
        ) => {
            return `
      <label class="control-label" style="display: block; margin-bottom: 8px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px; align-items: center;">
          <span class="control-label-text" style="font-size: 11px; color: #ccc;">${label}</span>
          <span class="control-value" data-sg-value="${key}" style="font-size: 11px; color: #888;">${value.toFixed(2)}</span>
        </div>
        <input 
          type="range" 
          class="node-slider" 
          data-sg-key="${key}" 
          data-node-id="${escapeHtml(node.id)}"
          min="${min}" max="${max}" step="${step}" value="${value}"
          style="width: 100%;"
        />
      </label>
    `;
        };

        return `
      <div class="node-controls" style="padding: 12px;">
        <div class="sg-renderer-indicator" data-renderer="WebGL 2.0 (3D LUT)" style="font-size: 11px; color: #9aa0a6; margin-bottom: 8px;">
          レンダラー: WebGL 2.0 (3D LUT)
        </div>
        
        <div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #333;">
            <div style="font-size: 12px; font-weight: bold; margin-bottom: 8px; color: #eee;">HSL Qualifier</div>
            
            <div style="margin-bottom: 8px;">
                <div style="font-size: 11px; color: #aaa; margin-bottom: 4px;">Hue</div>
                ${renderSlider('Center', 'hueCenter', 0, 360, 1, settings.hueCenter)}
                ${renderSlider('Width', 'hueWidth', 0, 180, 1, settings.hueWidth)}
                ${renderSlider('Softness', 'hueSoftness', 0, 50, 1, settings.hueSoftness)}
            </div>

            <div style="margin-bottom: 8px;">
                <div style="font-size: 11px; color: #aaa; margin-bottom: 4px;">Saturation</div>
                ${renderSlider('Center', 'satCenter', 0, 1, 0.01, settings.satCenter)}
                ${renderSlider('Width', 'satWidth', 0, 1, 0.01, settings.satWidth)}
                ${renderSlider('Softness', 'satSoftness', 0, 0.5, 0.01, settings.satSoftness)}
            </div>

            <div style="margin-bottom: 8px;">
                <div style="font-size: 11px; color: #aaa; margin-bottom: 4px;">Luminance</div>
                ${renderSlider('Center', 'lumCenter', 0, 1, 0.01, settings.lumCenter)}
                ${renderSlider('Width', 'lumWidth', 0, 1, 0.01, settings.lumWidth)}
                ${renderSlider('Softness', 'lumSoftness', 0, 0.5, 0.01, settings.lumSoftness)}
            </div>

            <div style="display: flex; align-items: center; gap: 8px; margin-top: 8px;">
                <label style="display: flex; align-items: center; gap: 4px; font-size: 11px; color: #ccc; cursor: pointer;">
                    <input type="checkbox" data-sg-key="invert" ${settings.invert ? 'checked' : ''}>
                    Invert Selection
                </label>
                <label style="display: flex; align-items: center; gap: 4px; font-size: 11px; color: #ccc; cursor: pointer;">
                    <input type="checkbox" data-sg-key="showMask" ${settings.showMask ? 'checked' : ''}>
                    Show Mask
                </label>
            </div>
        </div>

        <div>
            <div style="font-size: 12px; font-weight: bold; margin-bottom: 8px; color: #eee;">Correction</div>
            ${renderSlider('Saturation', 'saturation', 0, 2, 0.01, settings.saturation)}
            ${renderSlider('Hue Shift', 'hueShift', -180, 180, 1, settings.hueShift)}
            ${renderSlider('Brightness', 'brightness', -1, 1, 0.01, settings.brightness)}
        </div>
      </div>
    `;
    };

    return {
        id: 'secondary-grading',
        typeIds: ['secondaryGrading'],
        render: (node) => ({
            afterPortsHtml: buildControls(node),
            afterRender: async (element) => {
                let processor = processors.get(node.id);
                if (!processor) {
                    processor = createProcessor();
                    processors.set(node.id, processor);
                }

                const sourceMediaUrl = getSourceMedia(node);

                const updateValueAndPreview = (key: keyof SecondaryGradingNodeSettings, val: number | boolean) => {
                    // スライダー更新
                    if (typeof val === 'number') {
                        const display = element.querySelector(`.control-value[data-sg-value="${key}"]`);
                        if (display) display.textContent = val.toFixed(2);
                    }

                    const targetNode = state.nodes.find((n) => n.id === node.id);
                    if (targetNode) {
                        const currentSettings = (targetNode.settings as SecondaryGradingNodeSettings) || {
                            kind: 'secondaryGrading',
                            hueCenter: 0,
                            hueWidth: 20,
                            hueSoftness: 10,
                            satCenter: 0.5,
                            satWidth: 0.5,
                            satSoftness: 0.1,
                            lumCenter: 0.5,
                            lumWidth: 0.5,
                            lumSoftness: 0.1,
                            invert: false,
                            saturation: 1.0,
                            hueShift: 0,
                            brightness: 0,
                            showMask: false
                        };

                        // 型安全な代入
                        if (typeof val === 'boolean' && (key === 'invert' || key === 'showMask')) {
                            (currentSettings as any)[key] = val;
                        } else if (typeof val === 'number' && key !== 'kind' && key !== 'invert' && key !== 'showMask') {
                            (currentSettings as any)[key] = val;
                        }

                        targetNode.settings = currentSettings;
                        node.settings = currentSettings;

                        // プレビュー更新
                        const settings = currentSettings;
                        if (processor) {
                            const paramsHash = JSON.stringify(settings);
                            let lut = lutCache.get(node.id)?.lut;

                            // 設定が変わったらLUT再生成
                            if (!lut || lutCache.get(node.id)?.params !== paramsHash) {
                                let transform;
                                if (settings.showMask) {
                                    transform = buildMaskTransform(settings);
                                } else {
                                    const pipeline = buildPipeline(settings);
                                    transform = buildColorTransform(pipeline);
                                }
                                lut = generateLUT3D(33, transform); // preview speed
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

                        // 初回描画
                        const settings = node.settings as SecondaryGradingNodeSettings;
                        // ダミー更新でプレビュー生成
                        updateValueAndPreview('hueCenter', settings.hueCenter ?? 0);

                    } catch (error) {
                        console.error('[SecondaryGrading] Preview setup failed', error);
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
                        const key = target.getAttribute('data-sg-key');
                        if (!key) return;
                        const val = parseFloat(target.value);
                        updateValueAndPreview(key as keyof SecondaryGradingNodeSettings, val);
                    });
                });

                // チェックボックス入力イベント
                const checkboxes = element.querySelectorAll('input[type="checkbox"]');
                checkboxes.forEach((input) => {
                    input.addEventListener('change', (e) => {
                        const target = e.target as HTMLInputElement;
                        const key = target.getAttribute('data-sg-key');
                        if (!key) return;
                        const val = target.checked;
                        updateValueAndPreview(key as keyof SecondaryGradingNodeSettings, val);
                    });
                });
            },
        }),
    };
};
