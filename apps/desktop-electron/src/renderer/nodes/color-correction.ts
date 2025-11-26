import type { RendererNode } from '../types';
import type { NodeRendererContext, NodeRendererModule } from './types';
import type { ColorCorrectionNodeSettings } from '@nodevision/editor';
import { CanvasColorProcessor } from './canvas-color-processor';

export const createColorCorrectionNodeRenderer = (context: NodeRendererContext): NodeRendererModule => {
    const { state, escapeHtml, t } = context;

    // ノードごとにオフスクリーンの Canvas 処理を保持
    const canvasProcessors = new Map<string, CanvasColorProcessor>();

    /**
     * 上流ノードから元画像の URL を取得
     */
    const getSourceImageUrl = (node: RendererNode): string | null => {
        const inputPorts = ['program', 'source', 'input', 'base', 'background'];
        const conn = state.connections.find(c => c.toNodeId === node.id && inputPorts.includes(c.toPortId));
        if (!conn) return null;

        const sourceNode = state.nodes.find(n => n.id === conn.fromNodeId);
        if (!sourceNode) return null;

        const preview = state.mediaPreviews.get(sourceNode.id);
        if (preview?.url) return preview.url;

        if (sourceNode.typeId === 'loadVideo' || sourceNode.typeId === 'loadImage') {
            const settings = sourceNode.settings as any;
            if (settings?.filePath) {
                return settings.filePath;
            }
        }

        return null;
    };

    /**
     * メディアプレビューノードへ補正後の dataURL を反映
     */
    const propagateToMediaPreview = (node: RendererNode, processor: CanvasColorProcessor) => {
        const dataUrl = processor.toDataURL();
        const size = processor.getSize();
        const connectedPreviewNodes = state.connections
            .filter(c => c.fromNodeId === node.id)
            .map(c => c.toNodeId);

        connectedPreviewNodes.forEach(previewNodeId => {
            const previewNode = state.nodes.find(n => n.id === previewNodeId);
            if (previewNode && previewNode.typeId === 'mediaPreview') {
                // DOM反映（即時表示）
                const img = document.querySelector(`.node-media[data-node-id="${previewNodeId}"] img`);
                if (img) {
                    (img as HTMLImageElement).src = dataUrl;
                }
            }
        });

        // upstream ノード（このカラーコレクションノード）のプレビューを state に保持
        state.mediaPreviews.set(node.id, {
            url: dataUrl,
            name: 'Preview',
            kind: 'image',
            width: size?.width ?? 0,
            height: size?.height ?? 0,
            size: 0,
            type: 'image/png',
            ownedUrl: true
        });
    };

    const buildControls = (node: RendererNode): string => {
        const settings = (node.settings as ColorCorrectionNodeSettings) || {
            kind: 'colorCorrection',
            brightness: 0,
            contrast: 1,
            saturation: 1,
            gamma: 1,
            exposure: 0,
            shadows: 0,
            highlights: 0,
            temperature: 0,
            tint: 0
        };

        const renderSlider = (labelKey: string, key: keyof ColorCorrectionNodeSettings, min: number, max: number, step: number, value: number) => `
      <label class="control-label" style="display: block; margin-bottom: 8px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
          <span class="control-label-text" data-i18n-key="${labelKey}">${escapeHtml(t(labelKey))}</span>
          <span class="control-value" data-cc-value="${key}">${value.toFixed(2)}</span>
        </div>
        <input 
          type="range" 
          class="node-slider" 
          data-cc-key="${key}" 
          data-node-id="${escapeHtml(node.id)}"
          min="${min}" max="${max}" step="${step}" value="${value}"
          style="width: 100%;"
        />
      </label>
    `;

        return `
      <div class="node-controls" style="padding: 12px;">
        ${renderSlider('nodes.colorCorrection.exposure', 'exposure', -2, 2, 0.1, settings.exposure ?? 0)}
        ${renderSlider('nodes.colorCorrection.brightness', 'brightness', -1, 1, 0.05, settings.brightness ?? 0)}
        ${renderSlider('nodes.colorCorrection.contrast', 'contrast', 0, 3, 0.05, settings.contrast ?? 1)}
        ${renderSlider('nodes.colorCorrection.saturation', 'saturation', 0, 3, 0.05, settings.saturation ?? 1)}
        ${renderSlider('nodes.colorCorrection.gamma', 'gamma', 0.1, 3, 0.05, settings.gamma ?? 1)}
        ${renderSlider('nodes.colorCorrection.shadows', 'shadows', -100, 100, 1, settings.shadows ?? 0)}
        ${renderSlider('nodes.colorCorrection.highlights', 'highlights', -100, 100, 1, settings.highlights ?? 0)}
        ${renderSlider('nodes.colorCorrection.temperature', 'temperature', -100, 100, 1, settings.temperature ?? 0)}
        ${renderSlider('nodes.colorCorrection.tint', 'tint', -100, 100, 1, settings.tint ?? 0)}
      </div>
    `;
    };

    return {
        id: 'color-correction',
        typeIds: ['colorCorrection'],
        render: node => ({
            afterPortsHtml: buildControls(node),
            afterRender: async element => {
                // オフスクリーン Canvas を準備（UIへは表示しない）
                const canvas = document.createElement('canvas');
                let processor = canvasProcessors.get(node.id);

                if (!processor) {
                    processor = new CanvasColorProcessor(canvas);
                    canvasProcessors.set(node.id, processor);
                } else {
                    processor.attachCanvas(canvas);
                }

                // 画像をロードして初期補正を適用
                const sourceUrl = getSourceImageUrl(node);
                if (sourceUrl) {
                    try {
                        let imageUrl = sourceUrl;
                        if (sourceUrl.startsWith('file://')) {
                            const result = await window.nodevision.loadImageAsDataURL({ filePath: sourceUrl });
                            if (result.ok && result.dataURL) {
                                imageUrl = result.dataURL;
                            }
                        }
                        if (!processor.hasImage()) {
                            await processor.loadImage(imageUrl);
                        }

                        const settings = node.settings as ColorCorrectionNodeSettings;
                        processor.applyCorrection({
                            exposure: settings.exposure ?? 0,
                            brightness: settings.brightness ?? 0,
                            contrast: settings.contrast ?? 1,
                            saturation: settings.saturation ?? 1,
                            gamma: settings.gamma ?? 1,
                            shadows: settings.shadows ?? 0,
                            highlights: settings.highlights ?? 0,
                            temperature: settings.temperature ?? 0,
                            tint: settings.tint ?? 0
                        });

                        propagateToMediaPreview(node, processor);
                    } catch (error) {
                        console.error('[ColorCorrection] Offscreen preview setup failed', error);
                    }
                }

                // スライダー入力で設定更新＆プレビュー伝搬
                const inputs = element.querySelectorAll('input[type="range"]');

                inputs.forEach(input => {
                    input.addEventListener('input', (e) => {
                        const target = e.target as HTMLInputElement;
                        const key = target.getAttribute('data-cc-key') as keyof ColorCorrectionNodeSettings;
                        if (!key) return;

                        const val = parseFloat(target.value);

                        // Update value display
                        const display = element.querySelector(`.control-value[data-cc-value="${key}"]`);
                        if (display) display.textContent = val.toFixed(2);

                        // Update global state
                        const targetNode = state.nodes.find(n => n.id === node.id);
                        if (targetNode) {
                            const currentSettings = (targetNode.settings as ColorCorrectionNodeSettings) || {};
                            targetNode.settings = { ...currentSettings, [key]: val } as any;
                            node.settings = targetNode.settings;
                        }

                        if (processor && processor.hasImage()) {
                            const settings = node.settings as ColorCorrectionNodeSettings;
                            processor.applyCorrection({
                                exposure: settings.exposure ?? 0,
                                brightness: settings.brightness ?? 0,
                                contrast: settings.contrast ?? 1,
                                saturation: settings.saturation ?? 1,
                                gamma: settings.gamma ?? 1,
                                shadows: settings.shadows ?? 0,
                                highlights: settings.highlights ?? 0,
                                temperature: settings.temperature ?? 0,
                                tint: settings.tint ?? 0
                            });
                            propagateToMediaPreview(node, processor);
                        }
                    });
                });
            }
        })
    };
};
