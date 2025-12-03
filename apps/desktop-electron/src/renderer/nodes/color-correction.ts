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
    const lastSourceByNode = new Map<string, string>();

    // LUTキャッシュ（パラメータが変わらない限り再利用）
    const lutCache = new Map<string, { params: string, lut: LUT3D }>();

    // 動画専用プロセッサーとvideoタグの管理
    const videoProcessors = new Map<string, WebGLVideoProcessor>();
    const isVideoSource = new Map<string, boolean>(); // ノードが動画ソースかどうかを追跡

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
    const propagateToMediaPreview = (node: RendererNode, processor: Processor | WebGLVideoProcessor | undefined) => {
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

        if (processor) {
            // WebGLLUTProcessor の場合、getSize() メソッドがないので canvas から取得
            if (processor instanceof WebGLLUTProcessor) {
                const canvas = processor.getContext().canvas;
                size = { width: canvas.width, height: canvas.height };
                dataUrl = (canvas as any).toDataURL();
            } else {
                dataUrl = processor.toDataURL();
                const s = processor.getSize();
                if (s) size = s;
            }
        }

        // upstream ノード（このカラーコレクションノード）のプレビューを state に保持 or クリア
        if (dataUrl) {
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
        } else {
            state.mediaPreviews.delete(node.id);
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
                // オフスクリーン処理器（WebGL優先）を準備
                let processor = processors.get(node.id);
                if (!processor) {
                    processor = createProcessor();
                    processors.set(node.id, processor);
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
                const updateValueAndPreview = (key: keyof ColorCorrectionNodeSettings, val: number) => {
                    // Update value display
                    const display = element.querySelector(`.control-value[data-cc-value="${key}"]`);
                    if (display) display.textContent = val.toFixed(2);

                    // Update slider position
                    const slider = element.querySelector(`input[data-cc-key="${key}"]`) as HTMLInputElement;
                    if (slider && parseFloat(slider.value) !== val) {
                        slider.value = val.toString();
                    }

                    // Update global state
                    const targetNode = state.nodes.find(n => n.id === node.id);
                    if (targetNode) {
                        const currentSettings = (targetNode.settings as ColorCorrectionNodeSettings) || {};
                        targetNode.settings = { ...currentSettings, [key]: val } as any;
                        node.settings = targetNode.settings;
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
                                // 3D LUT生成と適用
                                const paramsHash = JSON.stringify(settings);
                                let lut = lutCache.get(node.id)?.lut;

                                if (!lut || lutCache.get(node.id)?.params !== paramsHash) {
                                    // LUT再生成
                                    const transform = buildLegacyColorCorrectionTransform(settings);
                                    lut = generateLUT3D(getPreviewLutRes(), transform); // preview uses user setting
                                    if (lut) {
                                        lutCache.set(node.id, { params: paramsHash, lut });
                                    }

                                    const highRes = Math.max(getPreviewLutRes(), getExportLutRes());
                                    scheduleHighResLUTViaWorker(
                                        `${node.id}-color-correction`,
                                        200,
                                        () => settings,
                                        highRes,
                                        (hiLut) => {
                                            lutCache.set(node.id, { params: paramsHash, lut: hiLut });
                                            processor.loadLUT(hiLut);
                                            processor.renderWithCurrentTexture();
                                            toastHQApplied();
                                        },
                                        'legacyColor',
                                        toastHQStart,
                                        toastHQError
                                    );
                                }

                                if (lut) {
                                    processor.loadLUT(lut);
                                    processor.renderWithCurrentTexture();
                                }
                            } else if (processor instanceof WebGLColorProcessor) {
                                processor.applyCorrection(settings);
                            } else if (processor instanceof CanvasColorProcessor) {
                                processor.applyCorrection(settings);
                            }

                            propagateToMediaPreview(node, processor);
                        }
                    }
                };

                // 初期化処理（ソースがある場合）
                if (sourceMedia) {
                    try {
                        const isVideo = sourceMedia.isVideo;
                        const wasVideo = isVideoSource.get(node.id);

                        if (wasVideo !== undefined && wasVideo !== isVideo) {
                            if (wasVideo) {
                                state.canvasPreviews.delete(node.id);
                                state.mediaPreviews.delete(node.id);
                            } else {
                                lastSourceByNode.delete(node.id);
                            }
                            propagateToMediaPreview(node, undefined);
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
                                lastSourceByNode.set(node.id, imageUrl);
                            }

                            // Apply initial correction
                            const settings = node.settings as ColorCorrectionNodeSettings;
                            updateValueAndPreview('exposure', settings.exposure ?? 0); // Trigger update
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
                    input.addEventListener('input', (e) => {
                        const target = e.target as HTMLInputElement;
                        const key = target.getAttribute('data-cc-key') as keyof ColorCorrectionNodeSettings;
                        if (!key) return;
                        const val = parseFloat(target.value);
                        updateValueAndPreview(key, val);
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
                            updateValueAndPreview(key, defaultValue);
                        }
                    });
                });
            }
        })
    };
};
