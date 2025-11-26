import type { RendererNode } from '../types';
import type { NodeRendererContext, NodeRendererModule } from './types';
import type { ColorCorrectionNodeSettings } from '@nodevision/editor';
import { CanvasColorProcessor } from './canvas-color-processor';
import { WebGLColorProcessor } from './webgl-color-processor';

export const createColorCorrectionNodeRenderer = (context: NodeRendererContext): NodeRendererModule => {
    const { state, escapeHtml, t } = context;

    // ノードごとにオフスクリーン処理器を保持（WebGL優先）
    type Processor = CanvasColorProcessor | WebGLColorProcessor;
    const processors = new Map<string, Processor>();
    const lastSourceByNode = new Map<string, string>();
    const hasGeneratedVideoPreview = new Map<string, boolean>(); // 動画プレビューを既に生成したかを追跡

    const createProcessor = (): Processor => {
        try {
            return new WebGLColorProcessor(document.createElement('canvas'));
        } catch {
            return new CanvasColorProcessor(document.createElement('canvas'));
        }
    };

    // FFmpeg preview generation state
    let isGeneratingFFmpeg = false;
    let pendingFFmpegNode: RendererNode | null = null;

    /**
     * FFmpegを使って動画にカラー補正を適用したプレビューを生成
     */
    const generateFFmpegVideoPreview = async (node: RendererNode) => {
        if (isGeneratingFFmpeg) {
            pendingFFmpegNode = node;
            return;
        }

        isGeneratingFFmpeg = true;
        pendingFFmpegNode = null;

        try {
            // 上流ノードチェーンを収集
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
                console.warn('[ColorCorrection] No upstream nodes found for FFmpeg generation');
                return;
            }

            console.log('[ColorCorrection] Generating FFmpeg preview with chain:', chain.map(n => n.typeId).join(' -> '));

            if (!window.nodevision.generatePreview) {
                console.error('[ColorCorrection] FFmpeg generatePreview not available');
                return;
            }

            const result = await window.nodevision.generatePreview({ nodes: chain });

            if (result.ok && result.url) {
                console.log('[ColorCorrection] FFmpeg preview generated successfully:', result.url);

                state.mediaPreviews.set(node.id, {
                    url: result.url,
                    name: 'Preview',
                    kind: 'video', // 動画として設定
                    width: 1280,
                    height: 720,
                    size: 0,
                    type: 'video/mp4',
                    ownedUrl: true
                });

                // UI更新: renderNodes()を呼ばずに、接続されているメディアプレビューノードを直接更新
                requestAnimationFrame(() => {
                    const connectedPreviewNodes = state.connections
                        .filter(c => c.fromNodeId === node.id)
                        .map(c => c.toNodeId);

                    connectedPreviewNodes.forEach(previewNodeId => {
                        const previewNode = state.nodes.find(n => n.id === previewNodeId);
                        if (previewNode && previewNode.typeId === 'mediaPreview') {
                            // メディアプレビューノードのvideoタグを直接更新
                            const nodeElement = document.querySelector(`[data-node-id="${previewNodeId}"]`);
                            if (nodeElement && result.url) {
                                console.log('[ColorCorrection] Updating media preview node', previewNodeId);

                                // videoタグを探す（動画プレビューの場合）
                                const video = nodeElement.querySelector('video');
                                if (video) {
                                    console.log('[ColorCorrection] Found video element, updating src to', result.url);
                                    (video as HTMLVideoElement).src = result.url;
                                    (video as HTMLVideoElement).load();
                                } else {
                                    // videoタグがまだない場合は全体を再描画
                                    console.log('[ColorCorrection] Video element not found, triggering renderNodes()');
                                    context.renderNodes();
                                }
                            }
                        }
                    });
                });
            } else {
                console.error('[ColorCorrection] FFmpeg preview generation failed:', result);
            }
        } catch (error) {
            console.error('[ColorCorrection] FFmpeg preview generation error:', error);
        } finally {
            isGeneratingFFmpeg = false;

            // Retry pending request
            if (pendingFFmpegNode) {
                const nextNode = pendingFFmpegNode;
                pendingFFmpegNode = null;
                setTimeout(() => generateFFmpegVideoPreview(nextNode), 100);
            }
        }
    };

    type SourceMedia = { url: string; isVideo: boolean } | null;

    /**
     * 上流ノードから元メディアの URL と種別を取得
     */
    const getSourceMedia = (node: RendererNode): SourceMedia => {
        const inputPorts = ['program', 'source', 'input', 'base', 'background'];
        const conn = state.connections.find(c => c.toNodeId === node.id && inputPorts.includes(c.toPortId));
        if (!conn) return null;

        const sourceNode = state.nodes.find(n => n.id === conn.fromNodeId);
        if (!sourceNode) return null;

        const preview = state.mediaPreviews.get(sourceNode.id);
        if (preview?.url) return { url: preview.url, isVideo: preview.kind === 'video' };

        if (sourceNode.typeId === 'loadVideo' || sourceNode.typeId === 'loadImage') {
            const settings = sourceNode.settings as any;
            if (settings?.filePath) {
                return { url: settings.filePath, isVideo: sourceNode.typeId === 'loadVideo' };
            }
        }

        return null;
    };

    /**
     * メディアプレビューノードへ補正後の dataURL を反映
     */
    const propagateToMediaPreview = (node: RendererNode, processor?: Processor) => {
        const dataUrl = processor ? processor.toDataURL() : null;
        const size = processor?.getSize();

        console.log('[ColorCorrection] Propagating preview for node', node.id, 'hasDataUrl:', !!dataUrl, 'size:', size);

        // upstream ノード（このカラーコレクションノード）のプレビューを state に保持 or クリア
        if (dataUrl) {
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
            console.log('[ColorCorrection] Updated state.mediaPreviews for node', node.id);
        } else {
            state.mediaPreviews.delete(node.id);
            console.log('[ColorCorrection] Removed state.mediaPreviews for node', node.id);
        }

        const connectedPreviewNodes = state.connections
            .filter(c => c.fromNodeId === node.id)
            .map(c => c.toNodeId);

        console.log('[ColorCorrection] Connected preview nodes:', connectedPreviewNodes);

        // Check if we have connected preview nodes - if so, we need to trigger a re-render
        // so that the media preview nodes can display the updated preview
        if (connectedPreviewNodes.length > 0) {
            // Use requestAnimationFrame to avoid blocking the current rendering
            requestAnimationFrame(() => {
                connectedPreviewNodes.forEach(previewNodeId => {
                    const previewNode = state.nodes.find(n => n.id === previewNodeId);
                    if (previewNode && previewNode.typeId === 'mediaPreview') {
                        // Try direct DOM manipulation first (fast path)
                        const img = document.querySelector(`.node-media[data-node-id="${previewNodeId}"] img`);
                        console.log('[ColorCorrection] Found preview img element:', !!img, 'for node', previewNodeId);

                        if (img && dataUrl) {
                            (img as HTMLImageElement).src = dataUrl;
                            console.log('[ColorCorrection] Updated preview img src via direct DOM');
                        } else if (img && !dataUrl) {
                            (img as HTMLImageElement).src = '';
                            console.log('[ColorCorrection] Cleared preview img src via direct DOM');
                        } else if (!img && dataUrl) {
                            // If img doesn't exist yet, trigger a full re-render
                            console.log('[ColorCorrection] Preview img not found, triggering renderNodes()');
                            context.renderNodes();
                        }
                    }
                });
            });
        }
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
        <div class="cc-renderer-indicator" data-renderer="unknown" style="font-size: 11px; color: #9aa0a6; margin-bottom: 8px;">
          レンダラー: -
        </div>
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
                // オフスクリーン処理器（WebGL優先）を準備（UIへは表示しない）
                let processor = processors.get(node.id);
                if (!processor) {
                    processor = createProcessor();
                    processors.set(node.id, processor);
                }

                const rendererBadge = element.querySelector<HTMLElement>('.cc-renderer-indicator');
                if (rendererBadge) {
                    const isWebGL = processor instanceof WebGLColorProcessor;
                    rendererBadge.dataset.renderer = isWebGL ? 'webgl' : 'canvas';
                    rendererBadge.textContent = `レンダラー: ${isWebGL ? 'WebGL' : 'Canvas'}`;
                }

                // メディアをロードして初期補正を適用
                const sourceMedia = getSourceMedia(node);
                if (sourceMedia) {
                    try {
                        if (sourceMedia.isVideo) {
                            // 動画の場合はFFmpegで処理（初回のみ）
                            const needsGeneration = !hasGeneratedVideoPreview.get(node.id);
                            if (needsGeneration) {
                                console.log('[ColorCorrection]動画ソースを検出、初回FFmpegプレビューを生成中...');
                                hasGeneratedVideoPreview.set(node.id, true);
                                await generateFFmpegVideoPreview(node);

                                // レンダラーバッジを更新
                                if (rendererBadge) {
                                    rendererBadge.dataset.renderer = 'ffmpeg';
                                    rendererBadge.textContent = 'レンダラー: FFmpeg (動画)';
                                }
                            } else {
                                console.log('[ColorCorrection]動画プレビューは既に生成済み、スキップ');
                                // レンダラーバッジを更新
                                if (rendererBadge) {
                                    rendererBadge.dataset.renderer = 'ffmpeg';
                                    rendererBadge.textContent = 'レンダラー: FFmpeg (動画)';
                                }
                            }
                        } else {
                            // 静止画の場合はCanvas/WebGLで処理
                            let imageUrl = sourceMedia.url;

                            if (sourceMedia.url.startsWith('file://')) {
                                const result = await window.nodevision.loadImageAsDataURL({ filePath: sourceMedia.url });
                                if (result.ok && result.dataURL) {
                                    imageUrl = result.dataURL;
                                }
                            }

                            const lastSource = lastSourceByNode.get(node.id);
                            const shouldReload = !processor.hasImage() || lastSource !== imageUrl;

                            if (shouldReload) {
                                await processor.loadImage(imageUrl);
                                lastSourceByNode.set(node.id, imageUrl);
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
                        }
                    } catch (error) {
                        console.error('[ColorCorrection] Offscreen preview setup failed', error);
                    }
                } else {
                    // ソースが無い場合は既存プレビューをクリア
                    lastSourceByNode.delete(node.id);
                    propagateToMediaPreview(node, undefined);
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

                        // プレビュー更新
                        const sourceMedia = getSourceMedia(node);
                        if (sourceMedia?.isVideo) {
                            // 動画の場合：デバウンスしてFFmpegで再生成
                            // （ドラッグ中は頻繁に生成しないように）
                            if (pendingFFmpegNode !== node) {
                                pendingFFmpegNode = node;
                                setTimeout(() => {
                                    if (pendingFFmpegNode === node) {
                                        generateFFmpegVideoPreview(node);
                                    }
                                }, 500);
                            }
                        } else {
                            // 静止画の場合：即座にCanvas/WebGL更新
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
                        }
                    });
                });
            }
        })
    };
};
