import type { RendererNode } from '../types';
import type { NodeRendererContext, NodeRendererModule } from './types';
import type { ColorCorrectionNodeSettings } from '@nodevision/editor';
import { CanvasColorProcessor } from './canvas-color-processor';

// Debounce for FFmpeg preview (fallback/final)
const FFMPEG_DEBOUNCE_MS = 500;

export const createColorCorrectionNodeRenderer = (context: NodeRendererContext): NodeRendererModule => {
    const { state, escapeHtml, renderNodes } = context;

    let ffmpegDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    let isGeneratingFFmpeg = false;
    let pendingFFmpegPreview: RendererNode | null = null;

    // Canvas processor instance per node (for real-time preview)
    const canvasProcessors = new Map<string, CanvasColorProcessor>();

    /**
     * Generate FFmpeg-based preview (for final confirmation)
     */
    const generateFFmpegPreview = async (node: RendererNode) => {
        if (isGeneratingFFmpeg) {
            pendingFFmpegPreview = node;
            return;
        }

        isGeneratingFFmpeg = true;
        pendingFFmpegPreview = null;

        const collectUpstreamNodes = (startNodeId: string): any[] => {
            const nodes: any[] = [];
            let currentId = startNodeId;
            let depth = 0;
            const MAX_DEPTH = 50;

            while (currentId && depth < MAX_DEPTH) {
                const currentNode = state.nodes.find(n => n.id === currentId);
                if (!currentNode) break;

                const nodeSettings = currentNode.settings || {};
                const mediaNode: any = {
                    id: currentNode.id,
                    typeId: currentNode.typeId,
                    nodeVersion: '1.0.0',
                    ...nodeSettings
                };

                if (currentNode.typeId === 'loadVideo' || currentNode.typeId === 'loadImage') {
                    mediaNode.path = (nodeSettings as any).filePath;
                }

                nodes.unshift(mediaNode);

                const inputPorts = ['program', 'source', 'input', 'base', 'background'];
                const conn = state.connections.find(c => c.toNodeId === currentId && inputPorts.includes(c.toPortId));
                if (!conn) break;
                currentId = conn.fromNodeId;
                depth++;
            }
            return nodes;
        };

        const chain = collectUpstreamNodes(node.id);
        if (chain.length === 0) {
            isGeneratingFFmpeg = false;
            return;
        }

        try {
            if (!window.nodevision.generatePreview) {
                isGeneratingFFmpeg = false;
                return;
            }

            const result = await window.nodevision.generatePreview({ nodes: chain });
            if (result.ok && result.url) {
                state.mediaPreviews.set(node.id, {
                    url: result.url,
                    name: 'Preview',
                    kind: 'image',
                    width: 1280,
                    height: 720,
                    size: 0,
                    type: 'image/png',
                    ownedUrl: true
                });
                renderNodes();
            }
        } catch (error) {
            console.error('FFmpeg preview generation failed', error);
        } finally {
            isGeneratingFFmpeg = false;

            if (pendingFFmpegPreview) {
                const nextNode = pendingFFmpegPreview;
                pendingFFmpegPreview = null;
                setTimeout(() => generateFFmpegPreview(nextNode), 0);
            }
        }
    };

    const debouncedFFmpegPreview = (node: RendererNode) => {
        if (ffmpegDebounceTimer) clearTimeout(ffmpegDebounceTimer);
        ffmpegDebounceTimer = setTimeout(() => generateFFmpegPreview(node), FFMPEG_DEBOUNCE_MS);
    };

    /**
     * Get source image URL from upstream nodes
     */
    const getSourceImageUrl = (node: RendererNode): string | null => {
        const inputPorts = ['program', 'source', 'input', 'base', 'background'];
        const conn = state.connections.find(c => c.toNodeId === node.id && inputPorts.includes(c.toPortId));
        if (!conn) return null;

        const sourceNode = state.nodes.find(n => n.id === conn.fromNodeId);
        if (!sourceNode) return null;

        // Check if source has a preview
        const preview = state.mediaPreviews.get(sourceNode.id);
        if (preview?.url) return preview.url;

        // Check if it's a load node with file
        if (sourceNode.typeId === 'loadVideo' || sourceNode.typeId === 'loadImage') {
            const settings = sourceNode.settings as any;
            if (settings?.filePath) {
                return settings.filePath;
            }
        }

        return null;
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
          <span class="control-label-text" data-i18n-key="${labelKey}">${escapeHtml(context.t(labelKey))}</span>
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
        <!-- Real-time Canvas Preview -->
        <div class="node-group" style="margin-bottom: 12px;">
            <label class="node-label">リアルタイムプレビュー</label>
            <canvas id="cc-canvas-${escapeHtml(node.id)}" class="cc-preview-canvas" style="max-width: 100%; max-height: 200px; width: auto; height: auto; display: block; margin: 8px auto; background: #1a1a1a; border-radius: 4px;"></canvas>
        </div>
        <!-- Color Correction Sliders -->
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
                // Initialize Canvas for real-time preview
                const canvas = element.querySelector<HTMLCanvasElement>(`#cc-canvas-${node.id}`);
                if (!canvas) {
                    console.warn('[ColorCorrection] Canvas element not found');
                    return;
                }

                let processor: CanvasColorProcessor | undefined;
                const sourceUrl = getSourceImageUrl(node);

                try {
                    // Check if processor exists and has image
                    if (!canvasProcessors.has(node.id)) {
                        processor = new CanvasColorProcessor(canvas);
                        canvasProcessors.set(node.id, processor);
                        console.log('[ColorCorrection] Created new canvas processor');
                    } else {
                        processor = canvasProcessors.get(node.id)!;
                        processor.attachCanvas(canvas);
                        console.log('[ColorCorrection] Restored canvas state');
                    }

                    // Load image if needed
                    if (sourceUrl && (!processor.hasImage() || !canvasProcessors.has(node.id))) {
                        let imageUrl = sourceUrl;
                        if (sourceUrl.startsWith('file://')) {
                            const result = await window.nodevision.loadImageAsDataURL({ filePath: sourceUrl });
                            if (result.ok && result.dataURL) {
                                imageUrl = result.dataURL;
                            }
                        }
                        await processor.loadImage(imageUrl);

                        // Apply initial correction
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
                    }
                } catch (error) {
                    console.error('[ColorCorrection] Error in canvas setup:', error);
                }

                // Setup slider events
                const inputs = element.querySelectorAll('input[type="range"]');
                let isDragging = false;

                inputs.forEach(input => {
                    input.addEventListener('mousedown', () => {
                        isDragging = true;
                        // Clear pending FFmpeg preview to prevent re-render during drag
                        if (ffmpegDebounceTimer) {
                            clearTimeout(ffmpegDebounceTimer);
                            ffmpegDebounceTimer = null;
                        }
                    });

                    input.addEventListener('mouseup', () => {
                        isDragging = false;
                        // Generate final FFmpeg preview when drag ends
                        debouncedFFmpegPreview(node);
                    });

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

                        // REAL-TIME Canvas preview update
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

                            // Propagate to connected Media Preview nodes in real-time
                            const dataUrl = processor.toDataURL();
                            const connectedPreviewNodes = state.connections
                                .filter(c => c.fromNodeId === node.id)
                                .map(c => c.toNodeId);

                            connectedPreviewNodes.forEach(previewNodeId => {
                                const previewNode = state.nodes.find(n => n.id === previewNodeId);
                                if (previewNode && previewNode.typeId === 'mediaPreview') {
                                    const img = document.querySelector(`.node-media[data-node-id="${previewNodeId}"] img`);
                                    if (img) {
                                        (img as HTMLImageElement).src = dataUrl;
                                    }
                                }
                            });
                        }

                        // Trigger debounced FFmpeg preview (only if not dragging)
                        if (!isDragging) {
                            debouncedFFmpegPreview(node);
                        }
                    });

                    input.addEventListener('change', () => {
                        isDragging = false;
                        // Generate final FFmpeg preview immediately
                        if (ffmpegDebounceTimer) clearTimeout(ffmpegDebounceTimer);
                        generateFFmpegPreview(node);
                    });
                });
            }
        })
    };
};
