import type { RendererBootstrapWindow, RendererNode } from '../types';
import type { NodeRendererContext, NodeRendererModule } from './types';
import type { ColorCorrectionNodeSettings } from '@nodevision/editor';
import { CanvasColorProcessor } from './canvas-color-processor';
import { WebGLColorProcessor } from './webgl-color-processor';
import { WebGLVideoProcessor } from './webgl-video-processor';

export const createColorCorrectionNodeRenderer = (context: NodeRendererContext): NodeRendererModule => {
    const { state, escapeHtml, t } = context;

    // ノードごとにオフスクリーン処理器を保持（WebGL優先）
    type Processor = CanvasColorProcessor | WebGLColorProcessor;
    const processors = new Map<string, Processor>();
    const lastSourceByNode = new Map<string, string>();


    // 動画専用プロセッサーとvideoタグの管理
    const videoProcessors = new Map<string, WebGLVideoProcessor>();
    // const videoElements = new Map<string, HTMLVideoElement>(); // Unused
    const isVideoSource = new Map<string, boolean>(); // ノードが動画ソースかどうかを追跡

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
     * WebGL動画canvasをstateに保存（DOM操作はmedia-preview.tsが担当）
     */
    const hasTriggeredRenderForCanvas = new Map<string, boolean>(); // renderNodesを一度だけ呼ぶためのフラグ

    const saveCanvasPreview = (node: RendererNode, videoProcessor: WebGLVideoProcessor) => {
        const canvas = videoProcessor.getCanvas();
        const size = videoProcessor.getSize();

        console.log('[ColorCorrection] Saving canvas preview for node', node.id);
        console.log('[ColorCorrection] Canvas actual size:', canvas.width, 'x', canvas.height);
        console.log('[ColorCorrection] Size from getSize():', size);

        // canvas要素への参照をstateに保存
        state.canvasPreviews.set(node.id, canvas);

        // メタデータをmediaPreviewsに保存
        const previewData = {
            url: '', // canvas の場合、URLは不要
            name: 'Preview (WebGL Video)',
            kind: 'video' as const,
            width: size.width,
            height: size.height,
            size: 0,
            type: 'video/mp4',
            ownedUrl: true
        };
        state.mediaPreviews.set(node.id, previewData);
        console.log('[ColorCorrection] Saved to mediaPreviews:', previewData);

        // media-preview nodeを再レンダリング（一度だけ）
        if (!hasTriggeredRenderForCanvas.get(node.id)) {
            hasTriggeredRenderForCanvas.set(node.id, true);
            console.log('[ColorCorrection] Triggering renderNodes for canvas preview');
            context.renderNodes();
        }
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
            <button class="reset-btn" data-target-key="${key}" data-default-value="${defaultValue}" title="リセット" aria-label="リセット" style="background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 4px; cursor: pointer; color: #e8eaed; padding: 0 8px; font-size: 14px; height: 24px; display: flex; align-items: center; justify-content: center; transition: background 0.2s;">${resetIconSymbol}</button>
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
                // オフスクリーン処理器（WebGL優先）を準備（UIへは表示しない）
                let processor = processors.get(node.id);
                if (!processor) {
                    processor = createProcessor();
                    processors.set(node.id, processor);
                }

                // WebGL Video Processor
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
                    const isWebGL = processor instanceof WebGLColorProcessor;
                    rendererBadge.dataset.renderer = isWebGL ? 'webgl' : 'canvas';
                    rendererBadge.textContent = `レンダラー: ${isWebGL ? 'WebGL' : 'Canvas'}`;
                }

                // メディアをロードして初期補正を適用
                const sourceMedia = getSourceMedia(node);

                // 初期化処理（ソースがある場合）
                if (sourceMedia) {
                    try {
                        const isVideo = sourceMedia.isVideo;
                        const wasVideo = isVideoSource.get(node.id);

                        // ソースタイプが変わった場合（静止画⇔動画）、クリーンアップ
                        if (wasVideo !== undefined && wasVideo !== isVideo) {
                            if (wasVideo) {
                                state.canvasPreviews.delete(node.id);
                                state.mediaPreviews.delete(node.id);
                            } else {
                                lastSourceByNode.delete(node.id);
                            }
                            // 強制的に再描画を促すためにnullをセット
                            propagateToMediaPreview(node, undefined);
                        }

                        isVideoSource.set(node.id, isVideo);

                        if (isVideo) {
                            // 動画の場合：隠しvideo要素を作成してロード
                            // 既存のvideo要素があれば再利用、なければ作成
                            let videoElement = document.getElementById(`cc-video-${node.id}`) as HTMLVideoElement;

                            // ソースURLが変わった場合は再作成する（古い映像が残るのを防ぐため）
                            const lastVideoUrl = videoElement?.getAttribute('data-source-url');
                            if (videoElement && lastVideoUrl !== sourceMedia.url) {
                                console.log('[ColorCorrection] Video source changed, recreating video element');
                                videoElement.remove();
                                videoElement = null as any;

                                // プロセッサーもリセット
                                videoProcessors.delete(node.id);
                                const canvas = document.createElement('canvas');
                                canvas.width = 1280;
                                canvas.height = 720;
                                videoProcessor = new WebGLVideoProcessor(canvas);
                                videoProcessors.set(node.id, videoProcessor);
                            }

                            if (!videoElement) {
                                videoElement = document.createElement('video');
                                videoElement.id = `cc-video-${node.id}`;
                                videoElement.style.display = 'none';
                                videoElement.muted = true;
                                videoElement.loop = true;
                                videoElement.playsInline = true;
                                videoElement.crossOrigin = 'anonymous';
                                videoElement.setAttribute('data-source-url', sourceMedia.url); // URLを記録
                                document.body.appendChild(videoElement);

                                console.log('[ColorCorrection] Created hidden video element for', sourceMedia.url);
                            }

                            // ソース設定
                            if (videoElement.src !== sourceMedia.url) {
                                videoElement.src = sourceMedia.url;
                                videoElement.load(); // 重要: load()を呼ばないとloadedmetadataが発火しないことがある
                            }

                            // 再生開始
                            videoElement.play().catch(e => console.warn('[ColorCorrection] Auto-play failed', e));

                            // WebGLプロセッサーに接続
                            const initVideoProcessor = () => {
                                if (videoElement.readyState >= 1) { // HAVE_METADATA
                                    console.log('[ColorCorrection] initVideoProcessor called. ReadyState:', videoElement.readyState);
                                    if (videoProcessor) {
                                        videoProcessor.loadVideo(videoElement);

                                        // 初回フレームをキャプチャしてプレビュー更新
                                        saveCanvasPreview(node, videoProcessor);

                                        // リアルタイム更新ループ開始
                                        const updateLoop = () => {
                                            // ノードが存在し、動画ソースである場合のみ更新
                                            if (state.nodes.find(n => n.id === node.id) && isVideoSource.get(node.id)) {
                                                saveCanvasPreview(node, videoProcessor!);
                                                requestAnimationFrame(updateLoop);
                                            }
                                        };
                                        requestAnimationFrame(updateLoop);
                                    }
                                } else {
                                    // まだ準備できていない場合は少し待つ
                                    console.log('[ColorCorrection] Video not ready, retrying...');
                                    setTimeout(initVideoProcessor, 100);
                                }
                            };

                            // 動画のメタデータロード完了を待つ
                            if (videoElement.readyState >= videoElement.HAVE_METADATA) {
                                console.log('[ColorCorrection] Metadata already loaded');
                                initVideoProcessor();
                            } else {
                                console.log('[ColorCorrection] Waiting for loadedmetadata');
                                videoElement.addEventListener('loadedmetadata', initVideoProcessor, { once: true });
                                // videoElement.load(); // 上で呼んでいるのでここでは不要かもしれないが、念のため
                            }

                            // レンダラーバッジを更新
                            const rendererBadge = element.querySelector('.cc-renderer-indicator') as HTMLElement;
                            if (rendererBadge) {
                                rendererBadge.dataset.renderer = 'webgl-video';
                                rendererBadge.textContent = 'レンダラー: WebGL (リアルタイム動画)';
                            }

                            // 動画の場合はFFmpeg生成をスキップ（WebGLリアルタイムプレビューで十分）
                            // FFmpegで生成すると、そのプレビュー情報がcanvasのサイズ情報を上書きしてしまう
                            console.log('[ColorCorrection] Skipping FFmpeg generation for video (using WebGL real-time preview)');

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
                    // ソースが無い場合
                    const wasVideo = isVideoSource.get(node.id);

                    if (wasVideo) {
                        // 動画ソースの場合は、canvas previewをクリア
                        state.canvasPreviews.delete(node.id);
                        state.mediaPreviews.delete(node.id);
                        isVideoSource.delete(node.id);
                        console.log('[ColorCorrection] Cleared video canvas preview for node', node.id);
                    } else {
                        // 静止画ソースの場合は、既存プレビューをクリア
                        lastSourceByNode.delete(node.id);
                        propagateToMediaPreview(node, undefined);
                    }
                }

                // 共通の更新ロジック
                const updateValueAndPreview = (key: keyof ColorCorrectionNodeSettings, val: number) => {
                    // Update value display
                    const display = element.querySelector(`.control-value[data-cc-value="${key}"]`);
                    if (display) display.textContent = val.toFixed(2);

                    // Update slider position if needed (for reset button)
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

                    if (isVideo) {
                        // 動画の場合：WebGLプロセッサーで即座に更新
                        const videoProcessor = videoProcessors.get(node.id);
                        if (videoProcessor) {
                            const settings = node.settings as ColorCorrectionNodeSettings;
                            videoProcessor.applyCorrection(settings);
                            console.log('[ColorCorrection] WebGL video correction updated in real-time');
                        }
                    } else if (sourceMedia?.isVideo) {
                        // 動画の場合（予備）
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
                };

                // スライダー入力で設定更新＆プレビュー伝搬
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

                // リセットボタンのイベントリスナー
                const resetButtons = element.querySelectorAll('.reset-btn');
                resetButtons.forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const target = e.currentTarget as HTMLButtonElement;
                        const key = target.getAttribute('data-target-key') as keyof ColorCorrectionNodeSettings;
                        const defaultValue = parseFloat(target.getAttribute('data-default-value') || '0');

                        if (key) {
                            console.log(`[ColorCorrection] Resetting ${key} to ${defaultValue}`);
                            updateValueAndPreview(key, defaultValue);
                        }
                    });
                });
            }
        })
    };
};
