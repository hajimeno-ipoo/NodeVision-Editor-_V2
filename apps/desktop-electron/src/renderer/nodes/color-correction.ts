import type { RendererBootstrapWindow, RendererNode } from '../types';
import type { NodeRendererContext, NodeRendererModule } from './types';
import type { ColorCorrectionNodeSettings } from '@nodevision/editor';
import { CanvasColorProcessor } from './canvas-color-processor';
import { WebGLColorProcessor } from './webgl-color-processor';
import { WebGLVideoProcessor } from './webgl-video-processor';
import { WebGLLUTProcessor } from './webgl-lut-processor';
import type { LUT3D } from '@nodevision/color-grading';
import { resolveExportLutRes, resolvePreviewLutRes, scheduleHighResLUTViaWorker } from './lut-utils';

// 動的にモジュールを読み込む
const colorGrading = (window as any).nodeRequire('@nodevision/color-grading');
const { generateLUT3D, buildLegacyColorCorrectionTransform } = colorGrading;

export const createColorCorrectionNodeRenderer = (context: NodeRendererContext): NodeRendererModule => {
    const { state, escapeHtml, t } = context;
    const getPreviewLutRes = (): number => resolvePreviewLutRes(state.lutResolutionPreview);
    const getExportLutRes = (): number => resolveExportLutRes(state.lutResolutionExport);
    const toastHQStart = () => context.showToast(t('toast.hqLutGenerating'));
    const toastHQApplied = () => context.showToast(t('toast.hqLutApplied'));
    const toastHQError = (err: unknown) => context.showToast(String(err), 'error');

    // ノードごとにプロセッサーを保持
    // WebGL2 (LUT) > WebGL1 > Canvas の順で優先
    type Processor = WebGLLUTProcessor | WebGLColorProcessor | CanvasColorProcessor;
    const processors = new Map<string, Processor>();
    const previewProcessors = new Map<string, WebGLColorProcessor>();
    const lastSourceByNode = new Map<string, string>();
    const isVideoSource = new Map<string, boolean>();
    const lastInteractionTime = new Map<string, number>();

    // LUTキャッシュ（パラメータが変わらない限り再利用）
    const lutCache = new Map<string, { params: string, lut: LUT3D }>();

    // 動画専用プロセッサーとvideoタグの管理
    const videoProcessors = new Map<string, WebGLVideoProcessor>();
    // 高速プレビュー用プロセッサー (WebGLColorProcessor)

    const createProcessor = (): Processor => {
        const canvas = document.createElement('canvas');

        // Try WebGL 2 (3D LUT) first
        try {
            // Check if WebGL2 is supported
            const gl2 = canvas.getContext('webgl2');
            if (gl2) {
                console.log('[ColorCorrection] Using WebGL 2.0 (3D LUT) processor');
                return new WebGLLUTProcessor(canvas);
            }
        } catch (e) {
            console.warn('[ColorCorrection] WebGL 2.0 not supported, falling back', e);
        }

        // Fallback to WebGL 1
        try {
            console.log('[ColorCorrection] Using WebGL 1.0 processor');
            return new WebGLColorProcessor(canvas);
        } catch {
            console.log('[ColorCorrection] Using Canvas 2D processor');
            return new CanvasColorProcessor(canvas);
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

                // 元のソース動画のサイズを取得
                const sourceConn = state.connections.find(c => c.toNodeId === node.id);
                const sourceNode = sourceConn ? state.nodes.find(n => n.id === sourceConn.fromNodeId) : null;
                const sourcePreview = sourceNode ? state.mediaPreviews.get(sourceNode.id) : null;

                const width = sourcePreview?.width ?? 1280;
                const height = sourcePreview?.height ?? 720;

                state.mediaPreviews.set(node.id, {
                    url: result.url,
                    name: 'Preview',
                    kind: 'video', // 動画として設定
                    width,
                    height,
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
    /**
     * メディアプレビューノードへ補正後の dataURL を反映
     */
    const propagateToMediaPreview = (node: RendererNode, processor: Processor | WebGLVideoProcessor | undefined, forceRender = false) => {
        if (!processor) {
            state.mediaPreviews.delete(node.id);
            state.canvasPreviews.delete(node.id);

            // DOM内のプレビューCanvasも削除
            const connectedPreviewNodes = state.connections
                .filter(c => c.fromNodeId === node.id)
                .map(c => c.toNodeId)
                .filter((id, index, self) => self.indexOf(id) === index);

            connectedPreviewNodes.forEach(previewNodeId => {
                const previewNode = state.nodes.find(n => n.id === previewNodeId);
                if (previewNode && previewNode.typeId === 'mediaPreview') {
                    const nodeElement = document.querySelector(`[data-node-id="${previewNodeId}"]`);
                    if (nodeElement) {
                        const imgOrCanvasContainer = nodeElement.querySelector('.node-media-preview');
                        if (imgOrCanvasContainer) {
                            const existingCanvas = imgOrCanvasContainer.querySelector('canvas.preview-canvas');
                            if (existingCanvas) {
                                existingCanvas.remove();
                            }
                            const img = imgOrCanvasContainer.querySelector('img');
                            if (img) {
                                img.style.display = '';
                            }
                        }
                    }
                }
            });

            if (forceRender) {
                context.renderNodes();
            }
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
                name: 'Color Corrected Video',
                size: 0,
                type: 'video/mp4',
                ownedUrl: false
            });
            // 接続されたプレビューノードの更新をトリガー
            const connectedPreviewNodes = state.connections
                .filter(c => c.fromNodeId === node.id)
                .map(c => c.toNodeId)
                .filter((id, index, self) => self.indexOf(id) === index);

            connectedPreviewNodes.forEach(previewNodeId => {
                const previewNode = state.nodes.find(n => n.id === previewNodeId);
                if (previewNode && previewNode.typeId === 'mediaPreview') {
                    // Force update logic if needed, usually state change is enough
                }
            });
            return;
        }

        // WebGLColorProcessor (高速プレビュー用) の場合は Canvas を直接使用
        if (processor instanceof WebGLColorProcessor) {
            const canvas = processor.getCanvas();
            size = processor.getSize() ?? undefined;

            // Canvas Previewモードに設定
            state.canvasPreviews.set(node.id, canvas);
            state.mediaPreviews.set(node.id, {
                url: '', // Canvas が優先されるため空でOK
                width: size?.width ?? 0,
                height: size?.height ?? 0,
                kind: 'image',
                name: 'Color Corrected Image',
                size: 0,
                type: 'image/png',
                ownedUrl: false
            });

            // 接続されたプレビューノードの canvas を直接更新
            const connectedPreviewNodes = state.connections
                .filter(c => c.fromNodeId === node.id)
                .map(c => c.toNodeId)
                .filter((id, index, self) => self.indexOf(id) === index);

            connectedPreviewNodes.forEach(previewNodeId => {
                const previewNode = state.nodes.find(n => n.id === previewNodeId);
                if (previewNode && previewNode.typeId === 'mediaPreview') {
                    const nodeElement = document.querySelector(`[data-node-id="${previewNodeId}"]`);
                    if (nodeElement) {
                        const imgOrCanvasContainer = nodeElement.querySelector('.node-media-preview');

                        if (imgOrCanvasContainer) {
                            // 既存の canvas があるか確認 (コンテナ内を検索)
                            let existingCanvas = imgOrCanvasContainer.querySelector('canvas.preview-canvas') as HTMLCanvasElement | null;
                            const img = imgOrCanvasContainer.querySelector('img');

                            if (img) {
                                img.style.display = 'none';
                            }

                            if (!existingCanvas) {
                                // Canvas を作成して挿入
                                existingCanvas = document.createElement('canvas');
                                existingCanvas.className = 'preview-canvas';
                                existingCanvas.style.cssText = 'display: block; width: 100%; height: auto; max-width: 100%; object-fit: contain;';
                                imgOrCanvasContainer.appendChild(existingCanvas);
                            } else {
                                // 既存のCanvasを表示
                                existingCanvas.style.display = 'block';
                            }

                            // Canvas のサイズを設定
                            if (existingCanvas.width !== canvas.width || existingCanvas.height !== canvas.height) {
                                existingCanvas.width = canvas.width;
                                existingCanvas.height = canvas.height;
                            }

                            // Canvas の内容をコピー
                            const ctx = existingCanvas.getContext('2d');
                            if (ctx) {
                                ctx.drawImage(canvas, 0, 0);
                            }
                        }
                    }
                }
            });
            return;
        }

        if (processor) {
            // WebGLLUTProcessor の場合、getSize() メソッドがないので canvas から取得
            if (processor instanceof WebGLLUTProcessor) {
                const canvas = processor.getContext().canvas;
                size = { width: canvas.width, height: canvas.height };
                dataUrl = (canvas as HTMLCanvasElement).toDataURL();
            } else if (processor instanceof CanvasColorProcessor) {
                dataUrl = processor.toDataURL();
                const s = processor.getSize();
                if (s) size = s;
            }
        }

        // upstream ノード（このカラーコレクションノード）のプレビューを state に保持 or クリア
        if (dataUrl) {
            // Canvas Previewモードを解除
            state.canvasPreviews.delete(node.id);

            state.mediaPreviews.set(node.id, {
                url: dataUrl,
                width: size?.width ?? 0,
                height: size?.height ?? 0,
                kind: 'image',
                name: 'Color Corrected Image',
                size: 0,
                type: 'image/png',
                ownedUrl: true
            });

            // Update connected Media Preview nodes
            const connectedPreviewNodes = state.connections
                .filter(c => c.fromNodeId === node.id)
                .map(c => c.toNodeId)
                .filter((id, index, self) => self.indexOf(id) === index);

            connectedPreviewNodes.forEach(previewNodeId => {
                const previewNode = state.nodes.find(n => n.id === previewNodeId);
                if (previewNode && previewNode.typeId === 'mediaPreview') {
                    const nodeElement = document.querySelector(`[data-node-id="${previewNodeId}"]`);
                    if (nodeElement) {
                        const imgOrCanvasContainer = nodeElement.querySelector('.node-media-preview');
                        if (imgOrCanvasContainer) {
                            // Canvas を非表示にして img を表示
                            const existingCanvas = imgOrCanvasContainer.querySelector('canvas.preview-canvas') as HTMLCanvasElement | null;
                            if (existingCanvas) {
                                existingCanvas.style.display = 'none';
                            }

                            const img = imgOrCanvasContainer.querySelector('img');
                            if (img) {
                                img.style.display = '';
                                img.src = dataUrl!;
                            } else if (forceRender) {
                                // If no img tag, we need to re-render to show the image
                                context.renderNodes();
                            }
                        }
                    }
                }
            });
        } else {
            state.mediaPreviews.delete(node.id);
            if (forceRender) {
                context.renderNodes();
            }
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

        // デフォルト値を定義
        const defaults: Record<string, number> = {
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

        const resetIconSymbol =
            (window as RendererBootstrapWindow | undefined)?.__NODEVISION_ICONS__?.reset ?? '↺';

        const renderSlider = (labelKey: string, key: keyof ColorCorrectionNodeSettings, min: number, max: number, step: number, value: number) => {
            const defaultValue = defaults[key] ?? 0;
            return `
      <label class="control-label" style="display: block; margin-bottom: 8px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px; align-items: center;">
          <span class="control-label-text" data-i18n-key="${labelKey}">${escapeHtml(t(labelKey))}</span>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="control-value" data-cc-value="${key}">${value.toFixed(2)}</span>
            <button class="reset-btn" data-target-key="${key}" data-default-value="${defaultValue}" title="リセット" aria-label="リセット" style="background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 4px; cursor: pointer; color: #e8eaed; padding: 0; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; line-height: 1; transition: background 0.2s;">
                <span style="pointer-events: none; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;">${resetIconSymbol}</span>
            </button>
          </div>
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
        };

        return `
      <div class="node-controls" style="padding: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <div class="cc-renderer-indicator" data-renderer="unknown" style="font-size: 11px; color: #9aa0a6;">
            レンダラー: -
          </div>
          <button class="all-reset-btn" style="font-size: 11px; padding: 6px 10px; border: 1px solid #cbd6ff; background: #e9edff; color: #202840; border-radius: 8px; cursor: pointer; transition: background-color 120ms ease, border-color 120ms ease;">
            All Reset
          </button>
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
        id: 'colorCorrection',
        typeIds: ['colorCorrection'],
        render: node => ({
            afterPortsHtml: buildControls(node),
            afterRender: async element => {
                // オフスクリーン処理器（WebGL優先）を準備
                let processor = processors.get(node.id);
                if (!processor) {
                    processor = createProcessor();
                    processors.set(node.id, processor);
                }

                // 高速プレビュー用プロセッサー (WebGLColorProcessor)
                let previewProcessor = previewProcessors.get(node.id);
                if (!previewProcessor) {
                    const canvas = document.createElement('canvas');
                    // WebGLColorProcessorは常にWebGL1を使用（高速）
                    previewProcessor = new WebGLColorProcessor(canvas);
                    previewProcessors.set(node.id, previewProcessor);
                }

                // WebGL Video Processor (動画用)
                let videoProcessor = videoProcessors.get(node.id);
                if (!videoProcessor) {
                    // hidden canvas for WebGL processing
                    const canvas = document.createElement('canvas');
                    canvas.width = 1280; // default
                    canvas.height = 720;
                    videoProcessor = new WebGLVideoProcessor(canvas);
                    videoProcessors.set(node.id, videoProcessor);
                }

                const rendererBadge = element.querySelector<HTMLElement>('.cc-renderer-indicator');
                if (rendererBadge) {
                    let rendererType = 'Canvas';
                    if (processor instanceof WebGLLUTProcessor) rendererType = 'WebGL 2.0 (3D LUT)';
                    else if (processor instanceof WebGLColorProcessor) rendererType = 'WebGL 1.0';

                    rendererBadge.dataset.renderer = rendererType;
                    rendererBadge.textContent = `レンダラー: ${rendererType}`;
                }

                // メディアをロードして初期補正を適用
                const sourceMedia = getSourceMedia(node);

                // 共通の更新ロジック
                const updateValueAndPreview = (
                    key: keyof ColorCorrectionNodeSettings,
                    value: number,
                    highRes: boolean,
                    forceRender: boolean = false
                ) => {
                    // Update value display
                    const display = element.querySelector(`.control-value[data-cc-value="${key}"]`);
                    if (display) display.textContent = value.toFixed(2);

                    // Update slider position
                    const slider = element.querySelector(`input[data-cc-key="${key}"]`) as HTMLInputElement;
                    if (slider && parseFloat(slider.value) !== value) {
                        slider.value = value.toString();
                    }

                    // Update global state
                    const targetNode = state.nodes.find(n => n.id === node.id);
                    if (targetNode) {
                        const currentSettings = (targetNode.settings as ColorCorrectionNodeSettings) || {};
                        targetNode.settings = { ...currentSettings, [key]: value } as any;
                        node.settings = targetNode.settings;
                    }

                    if (!highRes) {
                        lastInteractionTime.set(node.id, Date.now());
                    }

                    // プレビュー更新
                    const sourceMedia = getSourceMedia(node);
                    const isVideo = isVideoSource.get(node.id) || false;
                    const settings = node.settings as ColorCorrectionNodeSettings;

                    if (isVideo) {
                        // 動画の場合：WebGLプロセッサーで即座に更新
                        const videoProcessor = videoProcessors.get(node.id);
                        if (videoProcessor) {
                            videoProcessor.applyCorrection(settings);
                        }
                    } else if (sourceMedia?.isVideo) {
                        // 動画の場合（予備）
                    } else {
                        // 静止画の場合
                        if (processor) {
                            if (processor instanceof WebGLLUTProcessor) {
                                // highRes=false (ドラッグ中) の場合は、高速プレビュー用プロセッサーを使用
                                if (!highRes && previewProcessor) {
                                    previewProcessor.applyCorrection(settings);
                                    propagateToMediaPreview(node, previewProcessor, forceRender);
                                    return;
                                }

                                // highRes=true (ドロップ時) の場合はLUT生成
                                const paramsHash = JSON.stringify(settings);
                                const transform = buildLegacyColorCorrectionTransform(settings);
                                const lut = generateLUT3D(getPreviewLutRes(), transform);

                                if (lut) {
                                    lutCache.set(node.id, { params: paramsHash, lut });
                                    processor.loadLUT(lut);
                                    processor.renderWithCurrentTexture();
                                }

                                if (highRes) {
                                    const targetRes = Math.max(getPreviewLutRes(), getExportLutRes());
                                    scheduleHighResLUTViaWorker(
                                        `${node.id}-color-correction`,
                                        200,
                                        () => settings,
                                        targetRes,
                                        (hiLut) => {
                                            lutCache.set(node.id, { params: paramsHash, lut: hiLut });
                                            processor.loadLUT(hiLut);
                                            processor.renderWithCurrentTexture();
                                            propagateToMediaPreview(node, processor, true);
                                            toastHQApplied();
                                        },
                                        'legacyColor',
                                        toastHQStart,
                                        toastHQError
                                    );
                                }
                            } else if (processor instanceof WebGLColorProcessor) {
                                processor.applyCorrection(settings);
                            } else if (processor instanceof CanvasColorProcessor) {
                                processor.applyCorrection(settings);
                            }

                            propagateToMediaPreview(node, processor, forceRender);
                        }
                    }
                };

                // 初期化処理（ソースがある場合）
                if (sourceMedia) {
                    try {
                        const isVideo = sourceMedia.isVideo;
                        const wasVideo = isVideoSource.get(node.id);
                        const lastKnownSource = lastSourceByNode.get(node.id);
                        const sourceChanged = lastKnownSource !== sourceMedia.url;

                        // ソース種別が変わった場合（画像↔動画）
                        if (wasVideo !== undefined && wasVideo !== isVideo) {
                            console.log('[ColorCorrection] Source type changed:', wasVideo ? 'video→image' : 'image→video');
                            if (wasVideo) {
                                // 動画→画像: 動画プロセッサーをクリア
                                state.canvasPreviews.delete(node.id);
                                state.mediaPreviews.delete(node.id);
                                const vp = videoProcessors.get(node.id);
                                if (vp) {
                                    vp.dispose();
                                    videoProcessors.delete(node.id);
                                }
                            } else {
                                // 画像→動画: 画像プロセッサーをクリア
                                lastSourceByNode.delete(node.id);
                            }
                            propagateToMediaPreview(node, undefined);
                        } else if (sourceChanged && !isVideo) {
                            // 同じ種類でもソースURLが変わった場合（画像→別の画像）
                            console.log('[ColorCorrection] Image source changed');
                            lastSourceByNode.delete(node.id);
                        } else if (sourceChanged && isVideo) {
                            // 動画→別の動画
                            console.log('[ColorCorrection] Video source changed');
                        }

                        isVideoSource.set(node.id, isVideo);

                        if (isVideo) {
                            // 動画の場合：WebGLプロセッサーで即座に更新
                            console.log('[ColorCorrection] Using WebGL real-time preview for video');
                            let videoUrl = sourceMedia.url;
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
                                // 非同期で再生開始（エラーはログ出力のみで処理を止めない）
                                video.play().catch(e => console.error('[ColorCorrection] Video auto-play failed:', e));
                                videoProcessor.loadVideo(video);
                            }

                            // 初期設定の適用
                            const settings = node.settings as ColorCorrectionNodeSettings;
                            videoProcessor.applyCorrection(settings);

                            // プレビュー伝播（再生開始を待たずに即座に登録）
                            propagateToMediaPreview(node, videoProcessor);
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
                            const hasImage = processor.hasImage ? processor.hasImage() : false;
                            const shouldReload = !hasImage || lastSource !== imageUrl;

                            if (shouldReload) {
                                await processor.loadImage(imageUrl);
                                if (previewProcessor) {
                                    await previewProcessor.loadImage(imageUrl);
                                }
                                lastSourceByNode.set(node.id, imageUrl);
                            }

                            // Apply initial correction
                            const settings = node.settings as ColorCorrectionNodeSettings;
                            updateValueAndPreview('exposure', settings.exposure ?? 0, false, false); // Trigger update without forcing render, skip HQ
                        }
                    } catch (error) {
                        console.error('[ColorCorrection] Offscreen preview setup failed', error);
                    }
                } else {
                    // ソースが無い場合
                    const wasVideo = isVideoSource.get(node.id);
                    if (wasVideo) {
                        state.canvasPreviews.delete(node.id);
                        state.mediaPreviews.delete(node.id);
                        isVideoSource.delete(node.id);
                    } else {
                        lastSourceByNode.delete(node.id);
                        propagateToMediaPreview(node, undefined);
                    }
                }

                // スライダー入力イベント
                const inputs = element.querySelectorAll('input[type="range"]');
                inputs.forEach(input => {
                    // ドラッグ中 (低画質・高速)
                    input.addEventListener('input', (e) => {
                        const target = e.target as HTMLInputElement;
                        const key = target.getAttribute('data-cc-key') as keyof ColorCorrectionNodeSettings;
                        if (!key) return;
                        const val = parseFloat(target.value);
                        updateValueAndPreview(key, val, false, true); // highRes=false
                    });

                    // ドラッグ終了 (高画質)
                    input.addEventListener('change', (e) => {
                        const target = e.target as HTMLInputElement;
                        const key = target.getAttribute('data-cc-key') as keyof ColorCorrectionNodeSettings;
                        if (!key) return;
                        const val = parseFloat(target.value);
                        updateValueAndPreview(key, val, true, true); // highRes=true
                    });
                });

                // リセットボタンイベント
                const resetButtons = element.querySelectorAll('.reset-btn');
                resetButtons.forEach(btn => {
                    // ノードのドラッグ/選択を防ぐためにイベント伝播を止める
                    btn.addEventListener('mousedown', (e) => {
                        e.stopPropagation();
                    });

                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const target = e.currentTarget as HTMLButtonElement;
                        const key = target.getAttribute('data-target-key') as keyof ColorCorrectionNodeSettings;
                        const defaultValue = parseFloat(target.getAttribute('data-default-value') || '0');

                        if (key) {
                            // 即座にプレビュー更新 (highRes=false)
                            updateValueAndPreview(key, defaultValue, false, true);
                            // 高画質LUT生成をスケジュール (highRes=true)
                            updateValueAndPreview(key, defaultValue, true, true);
                        }
                    });
                });

                // All Reset ボタンイベント
                const allResetBtn = element.querySelector('.all-reset-btn');
                if (allResetBtn) {
                    allResetBtn.addEventListener('mousedown', (e) => {
                        e.stopPropagation();
                    });

                    allResetBtn.addEventListener('click', (e) => {
                        e.stopPropagation();

                        // 全てのスライダーをデフォルト値にリセット
                        const allDefaults: Record<string, number> = {
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

                        // 全ての設定を更新
                        const targetNode = state.nodes.find(n => n.id === node.id);
                        if (targetNode) {
                            targetNode.settings = { ...targetNode.settings, ...allDefaults } as ColorCorrectionNodeSettings;
                            node.settings = targetNode.settings;
                        }

                        // 各スライダーのUIを更新
                        Object.entries(allDefaults).forEach(([key, defaultValue]) => {
                            // スライダー値
                            const slider = element.querySelector(`input[data-cc-key="${key}"]`) as HTMLInputElement;
                            if (slider) {
                                slider.value = String(defaultValue);
                            }
                            // 表示値
                            const display = element.querySelector(`.control-value[data-cc-value="${key}"]`);
                            if (display) {
                                display.textContent = defaultValue.toFixed(2);
                            }
                        });

                        // プレビューを更新（一度だけ）
                        updateValueAndPreview('exposure', 0, false, true);
                        updateValueAndPreview('exposure', 0, true, true);
                    });
                }
            }
        })
    };
};
