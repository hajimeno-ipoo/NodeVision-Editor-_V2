import type {
    ColorGradingPipeline,
    LUT3D
} from '@nodevision/color-grading';
import type { SecondaryGradingNodeSettings, SecondaryGradingLayer } from '@nodevision/editor';

import type { RendererNode } from '../types';
import { clampLutRes } from './lut-utils';

// 動的にモジュールを読み込む（nodeRequire が無い環境でも落ちないようガード）
const nodeRequire = (window as any).nodeRequire ?? (typeof require !== 'undefined' ? require : null);
const crypto = nodeRequire?.('crypto');

let colorGrading: any = null;
try {
    colorGrading = nodeRequire?.('@nodevision/color-grading') ?? null;
} catch (e) {
    console.error('[SecondaryGrading] Failed to require @nodevision/color-grading', e);
}

const fallbackTransform = (() => {
    throw new Error('[SecondaryGrading] color-grading module missing');
}) as typeof import('@nodevision/color-grading').buildColorTransform;
const fallbackHslKey = (() => {
    throw new Error('[SecondaryGrading] color-grading module missing');
}) as typeof import('@nodevision/color-grading').calculateHSLKey;
const fallbackLut = (() => {
    throw new Error('[SecondaryGrading] color-grading module missing');
}) as typeof import('@nodevision/color-grading').generateLUT3D;

const buildColorTransform = (colorGrading?.buildColorTransform ?? fallbackTransform) as typeof import('@nodevision/color-grading').buildColorTransform;
const calculateHSLKey = (colorGrading?.calculateHSLKey ?? fallbackHslKey) as typeof import('@nodevision/color-grading').calculateHSLKey;
const generateLUT3D = (colorGrading?.generateLUT3D ?? fallbackLut) as typeof import('@nodevision/color-grading').generateLUT3D;

const guardColorGrading = () => {
    if (!colorGrading) {
        console.error('[SecondaryGrading] color-grading module is unavailable');
        return false;
    }
    return true;
};
import type { NodeRendererContext, NodeRendererModule } from './types';
import { WebGLLUTProcessor } from './webgl-lut-processor';

export const createSecondaryGradingNodeRenderer = (context: NodeRendererContext): NodeRendererModule => {
    const { state, escapeHtml } = context;

    // color-grading モジュールが取得できない場合は、落ちずに簡易UIだけ出す
    if (!guardColorGrading()) {
        return {
            id: 'secondary-grading',
            typeIds: ['secondaryGrading'],
            render: () => ({
                afterPortsHtml:
                    '<div style="padding:12px;color:#f55;font-size:12px;">Secondary Grading の内部モジュールが読み込めなくて無効化されたよ。nodeIntegration と preload 設定を確認してね。</div>',
                afterRender: () => {
                    context.showToast('Secondary Grading module missing. Check preload / nodeIntegration.', 'error');
                }
            })
        };
    }
    const getPreviewLutRes = (): number => clampLutRes(state.lutResolutionPreview ?? 33);

    const randomId = () =>
        crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);

    type Processor = WebGLLUTProcessor;
    const processors = new Map<string, Processor>();
    const lastSourceByNode = new Map<string, string>();
    const lastSourceKindByNode = new Map<string, 'video' | 'image' | null>();
    const lutCache = new Map<string, { params: string; lut: LUT3D }>();
    const issuedWarnings = new Set<string>();
    const videoProcessors = new Map<string, HTMLVideoElement>();
    const videoCleanup = new Map<string, () => void>();
    const videoLastLut = new Map<string, LUT3D | null>();
    const canvasPreviewAttached = new Map<string, { w: number; h: number }>();
    const sourceWatchers = new Map<string, number>();
    const scrollPositions = new Map<string, number>();
    const lastPreviewAt = new Map<string, number>();
    const pendingPreviewHandles = new Map<string, number>();
    // 動画ループ初期化中フラグ（多重起動防止）
    const videoLoopInitializing = new Map<string, boolean>();
    // 再レンダリングスケジュール済みフラグ（renderNodes多重呼び出し防止）
    const pendingRenderScheduled = new Map<string, boolean>();
    // 初回プレビュー完了フラグ
    const initialPreviewDone = new Map<string, boolean>();

    // メディアプレビューノードのcanvasを直接アタッチ（renderNodes呼び出しを避ける）
    const attachCanvasToMediaPreview = (nodeId: string) => {
        // state.canvasPreviewsからcanvasを取得
        const canvas = state.canvasPreviews.get(nodeId);
        if (!canvas) return;

        // このノードに接続されているメディアプレビューノードを探す
        const downstreamConn = state.connections.find(
            c => c.fromNodeId === nodeId && c.fromPortId === 'result'
        );
        if (!downstreamConn) return;

        const previewNode = state.nodes.find(n => n.id === downstreamConn.toNodeId);
        if (!previewNode || previewNode.typeId !== 'mediaPreview') return;

        // メディアプレビューノードのDOM要素を探す
        const previewContainer = document.querySelector(
            `[data-canvas-source="${nodeId}"]`
        ) as HTMLElement | null;

        if (previewContainer && !previewContainer.contains(canvas)) {
            previewContainer.innerHTML = '';
            canvas.style.cssText = 'width: 100%; height: 100%; object-fit: contain;';
            previewContainer.appendChild(canvas);
        }
    };

    // 遅延再レンダリング（初回のみ、無限ループ防止）
    const scheduleRenderNodes = (nodeId: string) => {
        // 初回プレビュー完了済みなら何もしない
        if (initialPreviewDone.get(nodeId)) {
            // canvasを直接アタッチするだけ
            attachCanvasToMediaPreview(nodeId);
            return;
        }

        if (pendingRenderScheduled.get(nodeId)) return;
        pendingRenderScheduled.set(nodeId, true);
        window.setTimeout(() => {
            pendingRenderScheduled.set(nodeId, false);
            initialPreviewDone.set(nodeId, true);
            context.renderNodes();
        }, 50);
    };


    const clearVideoState = (nodeId: string) => {

        const cleanup = videoCleanup.get(nodeId);
        if (cleanup) {
            cleanup();
            videoCleanup.delete(nodeId);
        }
        // video loop で使ったリソースを完全に破棄
        videoProcessors.delete(nodeId);
        videoLastLut.delete(nodeId);
        canvasPreviewAttached.delete(nodeId);
        state.canvasPreviews.delete(nodeId);
        lastSourceByNode.delete(nodeId);
        state.mediaPreviews.delete(nodeId);
        const pending = pendingPreviewHandles.get(nodeId);
        if (pending) {
            window.clearTimeout(pending);
            pendingPreviewHandles.delete(nodeId);
        }
        lastPreviewAt.delete(nodeId);
        lutCache.delete(nodeId);
        // ソース変更時に初回プレビューフラグをリセット
        initialPreviewDone.delete(nodeId);
    };


    const setVideoPreview = (node: RendererNode, processor?: Processor) => {
        if (!processor) return;
        const glCanvas = processor.getContext().canvas as HTMLCanvasElement;
        state.canvasPreviews.set(node.id, glCanvas);
        state.mediaPreviews.set(node.id, {
            url: '',
            width: glCanvas.width,
            height: glCanvas.height,
            kind: 'video',
            name: 'Preview',
            size: 0,
            type: 'video/mp4',
            ownedUrl: true,
        });

        // ノード再レンダーは行わず、サイズだけ記録（再レンダーはスクロール位置をリセットするため避ける）
        const prev = canvasPreviewAttached.get(node.id);
        if (!prev || prev.w !== glCanvas.width || prev.h !== glCanvas.height) {
            canvasPreviewAttached.set(node.id, { w: glCanvas.width, h: glCanvas.height });
        }
    };

    const warnOnce = (key: string, msg: string, level: 'error' | 'info' = 'error') => {
        if (issuedWarnings.has(key)) return;
        issuedWarnings.add(key);
        context.showToast(msg, level);
        console.warn(`[SecondaryGrading] ${msg}`);
    };

    // 画像の実寸を取得するヘルパー（dataURL/ファイルURL両対応）
    const probeImageSize = (url: string): Promise<{ width: number; height: number }> =>
        new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
            img.onerror = (e) => reject(e);
            img.src = url;
        });

    /**
     * 動画プレビュー用のループをセットアップ
     */
    const ensureVideoLoop = async (
        node: RendererNode,
        processor: Processor,
        mediaUrl: string
    ) => {
        const lastSource = lastSourceByNode.get(node.id);
        const isNewSource = lastSource !== mediaUrl;

        // 初期化中なら早期リターン（多重起動防止）
        if (videoLoopInitializing.get(node.id)) {
            console.log('[SecondaryGrading] Video loop already initializing, skipping');
            return;
        }

        if (isNewSource || !videoProcessors.has(node.id)) {
            // 初期化開始をマーク
            videoLoopInitializing.set(node.id, true);

            try {
                const oldCleanup = videoCleanup.get(node.id);
                if (oldCleanup) oldCleanup();

                const video = document.createElement('video');
                video.crossOrigin = 'anonymous';
                video.muted = true;
                video.loop = true;
                video.playsInline = true;
                video.src = mediaUrl;

                await new Promise<void>((resolve, reject) => {
                    const timeoutId = window.setTimeout(() => {
                        reject(new Error('Video load timeout'));
                    }, 10000);
                    video.onloadedmetadata = () => {
                        window.clearTimeout(timeoutId);
                        resolve();
                    };
                    video.onerror = () => {
                        window.clearTimeout(timeoutId);
                        reject(new Error('Video load error'));
                    };
                });

                // 動画の実寸に合わせてGLキャンバスをリサイズ
                const glCanvas = processor.getContext().canvas as HTMLCanvasElement;
                glCanvas.width = video.videoWidth || glCanvas.width;
                glCanvas.height = video.videoHeight || glCanvas.height;

                video.play().catch((err) => console.error('[SecondaryGrading] Video play failed', err));
                videoProcessors.set(node.id, video);
                lastSourceByNode.set(node.id, mediaUrl);

                const loopState = {
                    currentLut: lutCache.get(node.id)?.lut ?? null,
                    currentParams: lutCache.get(node.id)?.params ?? '',
                    suspend: false,
                };
                (video as any).__loopState = loopState;

                let animationFrameId: number | null = null;
                let videoFrameCallbackId: number | null = null;
                let lastRendered = 0;
                const targetInterval = 1000 / 24; // 24fps で十分

                const renderFrame = () => {
                    // 画像モードに切り替わっていたら描画をスキップ
                    if (
                        !processor ||
                        !loopState.currentLut ||
                        lastSourceKindByNode.get(node.id) !== 'video' ||
                        loopState.suspend
                    ) {
                        return;
                    }
                    processor.loadVideoFrame(video);
                    const size = (processor as any).imageSize;
                    const tex = (processor as any).inputTexture;
                    if (!size?.width || !size?.height) return;
                    if (!tex) return;
                    if (!processor.hasImage || !processor.hasImage()) return;
                    const currentLut = loopState.currentLut;
                    const lastLut = videoLastLut.get(node.id);
                    if (lastLut !== currentLut) {
                        processor.loadLUT(currentLut);
                        videoLastLut.set(node.id, currentLut);
                    }
                    try {
                        processor.renderWithCurrentTexture();
                        setVideoPreview(node, processor); // Canvasを直接使う
                    } catch (err) {
                        console.warn('[SecondaryGrading] renderFrame skipped', err);
                    }
                };

                if ('requestVideoFrameCallback' in video) {
                    const onVideoFrame = (_now: number, _metadata: VideoFrameCallbackMetadata) => {
                        renderFrame();
                        videoFrameCallbackId = video.requestVideoFrameCallback(onVideoFrame);
                    };
                    videoFrameCallbackId = video.requestVideoFrameCallback(onVideoFrame);
                } else {
                    const updateLoop = (now: number) => {
                        const elapsed = now - lastRendered;
                        if (elapsed >= targetInterval) {
                            lastRendered = now;
                            renderFrame();
                        }
                        animationFrameId = requestAnimationFrame(updateLoop);
                    };
                    animationFrameId = requestAnimationFrame(updateLoop);
                }

                videoCleanup.set(node.id, () => {
                    if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
                    if (videoFrameCallbackId !== null && 'cancelVideoFrameCallback' in video) {
                        (video as any).cancelVideoFrameCallback(videoFrameCallbackId);
                    }
                    video.pause();
                    video.src = '';
                    video.load();
                    videoProcessors.delete(node.id);
                    videoLastLut.delete(node.id);
                    canvasPreviewAttached.delete(node.id);
                    delete (video as any).__loopState;
                    state.canvasPreviews.delete(node.id);
                    videoLoopInitializing.delete(node.id);
                });

                // 初回フレームを描画（動画が再生可能になってから）
                const drawInitialFrame = () => {
                    if (!loopState.currentLut) return;

                    // 動画のreadyStateを確認
                    if (video.readyState < 2) {
                        // まだ十分にロードされていない場合、少し待ってリトライ
                        setTimeout(drawInitialFrame, 50);
                        return;
                    }

                    try {
                        processor.loadVideoFrame(video);
                        processor.loadLUT(loopState.currentLut);
                        videoLastLut.set(node.id, loopState.currentLut);
                        processor.renderWithCurrentTexture();
                        setVideoPreview(node, processor);
                        // メディアプレビューノードを強制的に再描画（遅延実行）
                        scheduleRenderNodes(node.id);
                    } catch (err) {
                        console.warn('[SecondaryGrading] Initial frame render failed, retrying...', err);
                        setTimeout(drawInitialFrame, 100);
                    }
                };

                // 動画が再生開始したら初回フレームを描画
                video.addEventListener('playing', drawInitialFrame, { once: true });
                // フォールバック: timeupdate でも初回フレームを描画（playing が発火しない場合用）
                video.addEventListener('timeupdate', drawInitialFrame, { once: true });

            } finally {
                // 初期化完了
                videoLoopInitializing.set(node.id, false);
            }

        } else {
            const video = videoProcessors.get(node.id);
            if (video && (video as any).__loopState) {
                const loopState = (video as any).__loopState;
                loopState.currentLut = lutCache.get(node.id)?.lut ?? null;
                loopState.currentParams = lutCache.get(node.id)?.params ?? '';
            }
        }
    };


    const createProcessor = (): Processor | undefined => {
        const canvas = document.createElement('canvas');
        const gl2 = canvas.getContext('webgl2');
        if (!gl2) {
            warnOnce(
                'sg-webgl2-missing',
                'Secondary Grading は WebGL2 必須だよ。環境に WebGL2 が無いのでプレビューをスキップするね。'
            );
            return undefined;
        }
        return new WebGLLUTProcessor(canvas);
    };

    type Layer = SecondaryGradingLayer;

    const defaultLayer = (): Layer => ({
        id: randomId(),
        name: '',
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
        showMask: false,
        intensity: 1.0,
    });

    const hydrateLayer = (layer: Partial<Layer>, idx = 0): Layer => {
        const base = defaultLayer();
        return {
            ...base,
            ...layer,
            id: layer.id ?? base.id ?? `sg-${idx}`,
            intensity: layer.intensity ?? base.intensity,
        };
    };

    /**
     * Secondary Grading設定からColorGradingPipelineを構築
     */
    function buildPipeline(settings: SecondaryGradingNodeSettings): ColorGradingPipeline {
        const layers: Layer[] =
            (settings.layers && settings.layers.length > 0
                ? settings.layers
                : [settings as unknown as Layer]).map((layer, idx) => ({
                    id: layer.id ?? `sg-${idx}`,
                    name: layer.name,
                    hueCenter: layer.hueCenter,
                    hueWidth: layer.hueWidth,
                    hueSoftness: layer.hueSoftness,
                    satCenter: layer.satCenter,
                    satWidth: layer.satWidth,
                    satSoftness: layer.satSoftness,
                    lumCenter: layer.lumCenter,
                    lumWidth: layer.lumWidth,
                    lumSoftness: layer.lumSoftness,
                    invert: layer.invert,
                    saturation: layer.saturation,
                    hueShift: layer.hueShift,
                    brightness: layer.brightness,
                    showMask: layer.showMask,
                    intensity: layer.intensity ?? 1.0,
                }));

        return {
            secondary: layers.map((layer) => ({
                keyer: {
                    hueCenter: layer.hueCenter,
                    hueWidth: layer.hueWidth,
                    hueSoftness: layer.hueSoftness,
                    satCenter: layer.satCenter,
                    satWidth: layer.satWidth,
                    satSoftness: layer.satSoftness,
                    lumCenter: layer.lumCenter,
                    lumWidth: layer.lumWidth,
                    lumSoftness: layer.lumSoftness,
                    invert: layer.invert,
                },
                correction: {
                    saturation: layer.saturation,
                    hueShift: layer.hueShift,
                    brightness: layer.brightness,
                },
                intensity: layer.intensity ?? 1.0,
            })),
        };
    }

    /**
     * マスク表示用の変換関数を構築（アクティブレイヤーのみ）
     */
    function buildMaskTransform(layer: Layer) {
        return (r: number, g: number, b: number): [number, number, number] => {
            const keyerParams = {
                hueCenter: layer.hueCenter,
                hueWidth: layer.hueWidth,
                hueSoftness: layer.hueSoftness,
                satCenter: layer.satCenter,
                satWidth: layer.satWidth,
                satSoftness: layer.satSoftness,
                lumCenter: layer.lumCenter,
                lumWidth: layer.lumWidth,
                lumSoftness: layer.lumSoftness,
                invert: layer.invert,
            };

            const key = calculateHSLKey(r, g, b, keyerParams);

            // マスクを白黒で表示
            return [key, key, key];
        };
    }

    /**
     * メディアプレビューノードへ補正後のプレビューを反映
     * heavyな toDataURL を使わず、Canvas を直接コピーする
     */
    const propagateToMediaPreview = (node: RendererNode, processor?: Processor) => {
        if (!processor) {
            state.mediaPreviews.delete(node.id);
            state.canvasPreviews.delete(node.id);
            const connectedPreviewNodes = state.connections
                .filter((c) => c.fromNodeId === node.id)
                .map((c) => c.toNodeId);
            connectedPreviewNodes.forEach((previewNodeId) => {
                const container = document.querySelector(
                    `[data-node-id="${previewNodeId}"] .node-media-preview`
                );
                if (container) {
                    const existingCanvas = container.querySelector('canvas.preview-canvas') as HTMLCanvasElement | null;
                    if (existingCanvas) existingCanvas.style.display = 'none';
                    const img = container.querySelector('img');
                    if (img) img.style.removeProperty('display');
                    const video = container.querySelector('video');
                    if (video) video.style.removeProperty('display');
                }
            });
            return;
        }

        const canvas = processor.getContext().canvas as HTMLCanvasElement;
        const width = canvas.width;
        const height = canvas.height;

        // 常に実寸で MediaPreview へ渡す
        state.canvasPreviews.set(node.id, canvas);
        state.mediaPreviews.set(node.id, {
            url: '', // Canvas優先なので空でOK
            name: 'Preview',
            kind: 'image',
            width,
            height,
            size: 0,
            type: 'image/png',
            ownedUrl: false,
        });

        // 重複する接続先を除去して過剰描画を防ぐ
        const connectedPreviewNodes = state.connections
            .filter((c) => c.fromNodeId === node.id)
            .map((c) => c.toNodeId)
            .filter((id, idx, arr) => arr.indexOf(id) === idx);

        connectedPreviewNodes.forEach((previewNodeId) => {
            const container = document.querySelector(
                `[data-node-id="${previewNodeId}"] .node-media-preview`
            );
            if (!container) {
                // MediaPreview側がまだ描画されていない場合は再試行をスケジュール
                const retry = window.setTimeout(() => propagateToMediaPreview(node, processor), 50);
                pendingPreviewHandles.set(node.id, retry as number);
                return;
            }

            // 既存の canvas を1つ再利用し、余計な要素を残さない
            let previewCanvas = container.querySelector('canvas.preview-canvas') as HTMLCanvasElement | null;
            const canvases = Array.from(container.querySelectorAll('canvas.preview-canvas')) as HTMLCanvasElement[];
            canvases.slice(1).forEach((c) => c.remove());

            if (!previewCanvas) {
                previewCanvas = document.createElement('canvas');
                previewCanvas.className = 'preview-canvas';
                container.appendChild(previewCanvas);
            }

            // サイズを常に実寸に合わせる
            previewCanvas.width = width;
            previewCanvas.height = height;
            previewCanvas.style.cssText =
                'display:block;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;margin:0 auto;';

            const ctx = previewCanvas.getContext('2d');
            if (ctx) {
                ctx.clearRect(0, 0, width, height);
                ctx.drawImage(canvas, 0, 0);
            }
        });
    };

    /**
     * 上流ノードから元メディアの URL と寸法を取得
     */
    type SourceMedia = { url: string; kind: 'image' | 'video'; width?: number; height?: number } | null;

    /**
     * 上流を再帰的に辿って元のソース（loadImage/loadVideo）を見つける
     */
    const findUpstreamSourceNode = (nodeId: string, depth = 0): RendererNode | null => {
        if (depth > 10) return null; // 無限ループ防止

        const node = state.nodes.find(n => n.id === nodeId);
        if (!node) return null;

        // loadImage/loadVideo ノードに到達したらそれを返す
        if (node.typeId === 'loadVideo' || node.typeId === 'loadImage') {
            return node;
        }

        // 処理ノードの場合は上流を辿る
        const processingNodes = ['colorCorrection', 'primaryGrading', 'secondaryGrading', 'curves', 'lutLoader'];
        if (processingNodes.includes(node.typeId)) {
            const conn = state.connections.find(c => c.toNodeId === nodeId && c.toPortId === 'source');
            if (conn) {
                return findUpstreamSourceNode(conn.fromNodeId, depth + 1);
            }
        }

        return node;
    };

    const getSourceMedia = (node: RendererNode): SourceMedia => {
        const inputPorts = ['source'];
        const conn = state.connections.find(
            (c) => c.toNodeId === node.id && inputPorts.includes(c.toPortId)
        );
        if (!conn) return null;

        const sourceNode = state.nodes.find((n) => n.id === conn.fromNodeId);
        if (!sourceNode) return null;

        // 直接接続されたノードのプレビュー情報を確認
        const preview = state.mediaPreviews.get(sourceNode.id);
        if (preview?.url) {
            return {
                url: preview.url,
                kind: preview.kind === 'video' ? 'video' : 'image',
                width: preview.width ?? undefined,
                height: preview.height ?? undefined,
            };
        }

        // 直接接続がloadImage/loadVideoならsettings.filePathから取得
        if (sourceNode.typeId === 'loadVideo' || sourceNode.typeId === 'loadImage') {
            const settings = sourceNode.settings as { filePath?: string } | undefined;
            if (settings?.filePath) {
                return {
                    url: settings.filePath,
                    kind: sourceNode.typeId === 'loadVideo' ? 'video' : 'image',
                    width: preview?.width ?? undefined,
                    height: preview?.height ?? undefined,
                };
            }
        }

        // 処理ノード経由の場合は上流を辿って元のソースを取得
        const originalSource = findUpstreamSourceNode(conn.fromNodeId);
        if (originalSource && (originalSource.typeId === 'loadVideo' || originalSource.typeId === 'loadImage')) {
            const settings = originalSource.settings as { filePath?: string } | undefined;
            if (settings?.filePath) {
                // 元のソースのプレビュー情報も確認
                const originalPreview = state.mediaPreviews.get(originalSource.id);
                return {
                    url: settings.filePath,
                    kind: originalSource.typeId === 'loadVideo' ? 'video' : 'image',
                    width: originalPreview?.width ?? undefined,
                    height: originalPreview?.height ?? undefined,
                };
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
            showMask: false,
            intensity: 1.0,
            layers: [],
            activeLayerIndex: 0,
        };

        const scrollbarStyles = `
      <style>
        .sg-scroll::-webkit-scrollbar {
          width: 8px;
        }
        .sg-scroll::-webkit-scrollbar-track {
          background: #e6ebff;
          border-radius: 8px;
        }
        .sg-scroll::-webkit-scrollbar-thumb {
          background: #b7c5ff;
          border-radius: 8px;
        }
        .sg-scroll::-webkit-scrollbar-thumb:hover {
          background: #9fb2ff;
        }
      </style>`;

        const renderSlider = (
            label: string,
            key: keyof Layer,
            min: number,
            max: number,
            step: number,
            value: number
        ) => {
            const safeValue = Number.isFinite(value) ? value : 0;
            const formatted =
                Math.abs(max) > 5 ? safeValue.toFixed(0) : safeValue.toFixed(2);
            return `
      <label class="control-label" style="display: block; margin-bottom: 8px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px; align-items: center;">
          <span class="control-label-text" style="font-size: 13px; color: #1f2430; font-weight: 600; letter-spacing: 0.01em;">${label}</span>
          <span class="control-value" data-sg-value="${key}" style="color: #1f2933; font-weight: 600; font-variant-numeric: tabular-nums;">${formatted}</span>
        </div>
        <input 
          type="range" 
          class="node-slider" 
          data-sg-key="${key}" 
          data-node-id="${escapeHtml(node.id)}"
          min="${min}" max="${max}" step="${step}" value="${safeValue}"
          style="width: 100%;"
        />
      </label>
    `;
        };

        const rawLayers = settings.layers && settings.layers.length > 0 ? settings.layers : [settings as unknown as Layer];
        const layers = rawLayers.map((layer, idx) => hydrateLayer(layer, idx));
        const activeIdx = Math.max(0, Math.min(settings.activeLayerIndex ?? 0, Math.max(0, layers.length - 1)));
        const activeLayer = layers[activeIdx] || defaultLayer();

        const renderLayerTabs = () => {
            return `
              <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
                ${layers
                    .map(
                        (layer, idx) =>
                            `<button class="sg-layer-tab" data-sg-layer-idx="${idx}" style="padding:6px 10px; border-radius:8px; border:1px solid ${idx === activeIdx ? '#99b4ff' : '#cbd6ff'
                            }; background:${idx === activeIdx ? '#c0cbf7' : '#e9edff'}; color:${idx === activeIdx ? '#111' : '#202840'}; font-size:11px; cursor:pointer; transition: background-color 120ms ease, border-color 120ms ease;">
                              ${layer.name || `Layer ${idx + 1}`}
                            </button>`
                    )
                    .join('')}
                <button class="sg-layer-add" style="padding:6px 10px; border-radius:8px; border:1px solid #cbd6ff; background:#e9edff; color:#202840; font-size:11px; cursor:pointer; transition: background-color 120ms ease, border-color 120ms ease;">+ Add</button>
                ${layers.length > 1 ? `<button class="sg-layer-delete" style="padding:6px 10px; border-radius:8px; border:1px solid #cbd6ff; background:#e9edff; color:#202840; font-size:11px; cursor:pointer; transition: background-color 120ms ease, border-color 120ms ease;">- Delete</button>` : ''}
              </div>
            `;
        };

        return `
      ${scrollbarStyles}
      <div class="node-controls sg-scroll" style="
        padding: 12px;
        max-height: calc(100vh - 180px);
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 8px;
      ">
        <div class="sg-renderer-indicator" data-renderer="WebGL 2.0 (3D LUT)" style="font-size: 11px; color: #9aa0a6; margin-bottom: 8px;">
          レンダラー: WebGL 2.0 (3D LUT)
        </div>

        ${renderLayerTabs()}
        
        <div style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid #333;">
            <div style="font-size: 14px; font-weight: 700; color: #1f2430; margin-bottom: 6px;">HSL Qualifier</div>
            
            <div style="margin-bottom: 8px;">
                <div style="font-size: 13px; color: #2d3238; font-weight: 600; margin-bottom: 4px;">Hue</div>
                ${renderSlider('Center', 'hueCenter', 0, 360, 1, activeLayer.hueCenter)}
                ${renderSlider('Width', 'hueWidth', 0, 180, 1, activeLayer.hueWidth)}
                ${renderSlider('Softness', 'hueSoftness', 0, 50, 1, activeLayer.hueSoftness)}
            </div>

            <div style="margin-bottom: 8px;">
                <div style="font-size: 13px; color: #2d3238; font-weight: 600; margin-bottom: 4px;">Saturation</div>
                ${renderSlider('Center', 'satCenter', 0, 1, 0.01, activeLayer.satCenter)}
                ${renderSlider('Width', 'satWidth', 0, 1, 0.01, activeLayer.satWidth)}
                ${renderSlider('Softness', 'satSoftness', 0, 0.5, 0.01, activeLayer.satSoftness)}
            </div>

            <div style="margin-bottom: 8px;">
                <div style="font-size: 13px; color: #2d3238; font-weight: 600; margin-bottom: 4px;">Luminance</div>
                ${renderSlider('Center', 'lumCenter', 0, 1, 0.01, activeLayer.lumCenter)}
                ${renderSlider('Width', 'lumWidth', 0, 1, 0.01, activeLayer.lumWidth)}
                ${renderSlider('Softness', 'lumSoftness', 0, 0.5, 0.01, activeLayer.lumSoftness)}
            </div>

            <div style="display: flex; align-items: center; gap: 8px; margin-top: 8px;">
                <label style="display: flex; align-items: center; gap: 4px; font-size: 12px; color: #2d3238; cursor: pointer;">
                    <input type="checkbox" data-sg-key="invert" ${activeLayer.invert ? 'checked' : ''}>
                    Invert Selection
                </label>
                <label style="display: flex; align-items: center; gap: 4px; font-size: 12px; color: #2d3238; cursor: pointer;">
                    <input type="checkbox" data-sg-key="showMask" ${activeLayer.showMask ? 'checked' : ''}>
                    Show Mask
                </label>
            </div>
        </div>

        <div style="margin-bottom: 8px; padding-bottom: 8px;">
            <div style="font-size: 14px; font-weight: 700; color: #1f2430; margin-bottom: 6px;">Correction</div>
            ${renderSlider('Saturation', 'saturation', 0, 2, 0.01, activeLayer.saturation)}
            ${renderSlider('Hue Shift', 'hueShift', -180, 180, 1, activeLayer.hueShift)}
            ${renderSlider('Brightness', 'brightness', -1, 1, 0.01, activeLayer.brightness)}
            ${renderSlider('Intensity', 'intensity', 0, 1, 0.01, activeLayer.intensity ?? 1)}
        </div>

        <div style="display:flex; gap:8px; margin-top:8px;">
          <button class="sg-layer-reset press-feedback"
            data-base-bg="#e9edff" data-base-border="#cbd6ff"
            data-active-bg="#c0cbf7" data-active-border="#99b4ff"
            style="flex:1; padding:6px 10px; border:1px solid #cbd6ff; background:#e9edff; color:#202840; border-radius:8px; font-size:11px; cursor:pointer; transition: background-color 120ms ease, border-color 120ms ease;">
            Reset Layer
          </button>
          <button class="sg-all-reset press-feedback"
            data-base-bg="#e9edff" data-base-border="#cbd6ff"
            data-active-bg="#c0cbf7" data-active-border="#99b4ff"
            style="flex:1; padding:6px 10px; border:1px solid #cbd6ff; background:#e9edff; color:#202840; border-radius:8px; font-size:11px; cursor:pointer; transition: background-color 120ms ease, border-color 120ms ease;">
            Reset All
          </button>
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
                // 既存のソース監視タイマーをクリア
                const prevWatch = sourceWatchers.get(node.id);
                if (prevWatch) {
                    window.clearInterval(prevWatch);
                    sourceWatchers.delete(node.id);
                }

                let processor = processors.get(node.id);
                if (!processor) {
                    processor = createProcessor();
                    if (processor) {
                        processors.set(node.id, processor);
                    } else {
                        // フォールバックなしなのでプレビューをクリア
                        state.mediaPreviews.delete(node.id);
                        return;
                    }
                }

                const sourceMedia = getSourceMedia(node);
                const prevKind = lastSourceKindByNode.get(node.id) ?? null;
                const currentKind: 'video' | 'image' | null = sourceMedia?.kind === 'video'
                    ? 'video'
                    : sourceMedia?.kind === 'image'
                        ? 'image'
                        : null;

                // ソース種別が video→image/null に変わったときは即クリーンアップ＆表示リセット
                if (currentKind !== 'video') {
                    const cleanup = videoCleanup.get(node.id);
                    if (cleanup) {
                        cleanup();
                        videoCleanup.delete(node.id);
                    }
                    videoProcessors.delete(node.id);
                    videoLastLut.delete(node.id);
                    canvasPreviewAttached.delete(node.id);
                    state.canvasPreviews.delete(node.id);
                    lastSourceByNode.delete(node.id);
                    propagateToMediaPreview(node, undefined);
                }

                const ensureLayerState = () => {
                    const settings = (node.settings as SecondaryGradingNodeSettings) || {} as SecondaryGradingNodeSettings;
                    if (!settings.layers || settings.layers.length === 0) {
                        const baseLayer: Layer = {
                            ...defaultLayer(),
                            ...settings,
                        };
                        settings.layers = [baseLayer];
                        settings.activeLayerIndex = 0;
                        node.settings = settings;
                        const target = state.nodes.find((n) => n.id === node.id);
                        if (target) target.settings = settings;
                    }
                    if ((settings.activeLayerIndex ?? 0) >= (settings.layers?.length ?? 1)) {
                        settings.activeLayerIndex = Math.max(0, (settings.layers?.length ?? 1) - 1);
                    }
                    return settings;
                };

                const getActiveLayer = (settings: SecondaryGradingNodeSettings): Layer => {
                    const layers = settings.layers && settings.layers.length > 0 ? settings.layers : [settings as unknown as Layer];
                    const idx = Math.max(0, Math.min(settings.activeLayerIndex ?? 0, layers.length - 1));
                    return layers[idx] || defaultLayer();
                };

                const setActiveLayer = (settings: SecondaryGradingNodeSettings, idx: number) => {
                    if (!settings.layers || settings.layers.length === 0) return settings;
                    settings.activeLayerIndex = Math.max(0, Math.min(idx, settings.layers.length - 1));
                    return settings;
                };

                const applyToLayer = (layer: Layer, key: keyof Layer, val: number | boolean) => {
                    if (typeof val === 'boolean') {
                        (layer as any)[key] = val;
                    } else {
                        (layer as any)[key] = val;
                    }
                };

                const syncBaseFromLayer0 = (settings: SecondaryGradingNodeSettings) => {
                    if (!settings.layers || settings.layers.length === 0) return;
                    const layer0 = settings.layers[0];
                    const fields: (keyof Layer)[] = [
                        'hueCenter', 'hueWidth', 'hueSoftness',
                        'satCenter', 'satWidth', 'satSoftness',
                        'lumCenter', 'lumWidth', 'lumSoftness',
                        'invert', 'saturation', 'hueShift', 'brightness', 'showMask', 'intensity'
                    ];
                    fields.forEach((f) => {
                        (settings as any)[f] = (layer0 as any)[f];
                    });
                    // レイヤー0からコピーしたら古いLUTやプレビュー間引き情報を無効化
                    lutCache.delete(node.id);
                    lastPreviewAt.delete(node.id);
                };

                const bindInteractions = () => {
                    const controlsEl = element.querySelector('.node-controls');
                    if (controlsEl) {
                        controlsEl.addEventListener('scroll', () => {
                            scrollPositions.set(node.id, controlsEl.scrollTop);
                        });
                    }

                    // スライダー入力イベント
                    const inputs = element.querySelectorAll('input[type="range"]');
                    inputs.forEach((input) => {
                        // ドラッグ中は低解像度（17^3）で軽いプレビュー
                        input.addEventListener('input', (e) => {
                            const target = e.target as HTMLInputElement;
                            const key = target.getAttribute('data-sg-key');
                            if (!key) return;
                            const val = parseFloat(target.value);
                            const controls = element.querySelector('.node-controls');
                            if (controls) scrollPositions.set(node.id, controls.scrollTop);
                            if (!pendingPreviewHandles.has(node.id)) {
                                updateValueAndPreview(key as keyof SecondaryGradingNodeSettings, val, 17);
                            }
                        });
                        // ドラッグ終了時に通常解像度で確定
                        input.addEventListener('change', (e) => {
                            const target = e.target as HTMLInputElement;
                            const key = target.getAttribute('data-sg-key');
                            if (!key) return;
                            const val = parseFloat(target.value);
                            const controls = element.querySelector('.node-controls');
                            if (controls) scrollPositions.set(node.id, controls.scrollTop);
                            updateValueAndPreview(key as keyof SecondaryGradingNodeSettings, val, undefined);
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
                            const controls = element.querySelector('.node-controls');
                            if (controls) scrollPositions.set(node.id, controls.scrollTop);
                            updateValueAndPreview(key as keyof SecondaryGradingNodeSettings, val, undefined);
                        });
                    });

                    // レイヤータブ切替
                    const layerTabs = element.querySelectorAll<HTMLButtonElement>('.sg-layer-tab');
                    layerTabs.forEach((btn) => {
                        btn.addEventListener('click', () => {
                            const idxStr = btn.getAttribute('data-sg-layer-idx');
                            if (!idxStr) return;
                            const idx = parseInt(idxStr, 10);
                            const settings = ensureLayerState();
                            setActiveLayer(settings, idx);
                            syncBaseFromLayer0(settings);
                            const targetNode = state.nodes.find((n) => n.id === node.id);
                            if (targetNode) {
                                targetNode.settings = settings;
                                node.settings = settings;
                            }
                            rebuildControlsAndBind();
                            // レイヤー切替後に即プレビューを更新
                            if (!pendingPreviewHandles.has(node.id)) {
                                updateValueAndPreview('hueCenter', settings.layers?.[settings.activeLayerIndex ?? 0]?.hueCenter ?? 0, undefined);
                            }
                        });
                    });

                    // レイヤー追加
                    const addBtn = element.querySelector<HTMLButtonElement>('.sg-layer-add');
                    addBtn?.addEventListener('click', () => {
                        // 追加中は動画ループを一時停止（揺れ防止）
                        const video = videoProcessors.get(node.id);
                        const loopState = (video as any)?.__loopState;
                        if (loopState) loopState.suspend = true;

                        const settings = ensureLayerState();
                        const activeLayer = getActiveLayer(settings);
                        const newLayer = { ...activeLayer, id: randomId(), name: '' };
                        settings.layers!.push(newLayer);
                        settings.activeLayerIndex = settings.layers!.length - 1;
                        syncBaseFromLayer0(settings);
                        const targetNode = state.nodes.find((n) => n.id === node.id);
                        if (targetNode) {
                            targetNode.settings = settings;
                            node.settings = settings;
                        }
                        rebuildControlsAndBind();
                        // 追加直後にプレビューを1回更新（多重スケジュールを避けるガード付き）
                        if (!pendingPreviewHandles.has(node.id)) {
                            updateValueAndPreview('hueCenter', newLayer.hueCenter ?? 0, undefined);
                        }

                        // レイヤー追加処理が終わったので動画ループを再開
                        if (loopState) loopState.suspend = false;
                    });

                    // レイヤー削除
                    const delBtn = element.querySelector<HTMLButtonElement>('.sg-layer-delete');
                    delBtn?.addEventListener('click', () => {
                        const settings = ensureLayerState();
                        if (!settings.layers || settings.layers.length <= 1) return;
                        const idx = settings.activeLayerIndex ?? 0;
                        settings.layers.splice(idx, 1);
                        settings.activeLayerIndex = Math.max(0, idx - 1);
                        syncBaseFromLayer0(settings);
                        const targetNode = state.nodes.find((n) => n.id === node.id);
                        if (targetNode) {
                            targetNode.settings = settings;
                            node.settings = settings;
                        }
                        rebuildControlsAndBind();
                    });

                    // レイヤーリセット
                    const resetBtn = element.querySelector<HTMLButtonElement>('.sg-layer-reset');
                    resetBtn?.addEventListener('click', () => {
                        const settings = ensureLayerState();
                        const idx = settings.activeLayerIndex ?? 0;
                        if (!settings.layers) return;
                        settings.layers[idx] = { ...defaultLayer(), id: settings.layers[idx].id };
                        syncBaseFromLayer0(settings);
                        const targetNode = state.nodes.find((n) => n.id === node.id);
                        if (targetNode) {
                            targetNode.settings = settings;
                            node.settings = settings;
                        }
                        rebuildControlsAndBind();
                    });

                    // 全部リセット
                    const allResetBtn = element.querySelector<HTMLButtonElement>('.sg-all-reset');
                    allResetBtn?.addEventListener('click', () => {
                        const settings = ensureLayerState();
                        const fresh = defaultLayer();
                        settings.layers = [fresh];
                        settings.activeLayerIndex = 0;
                        syncBaseFromLayer0(settings);
                        const targetNode = state.nodes.find((n) => n.id === node.id);
                        if (targetNode) {
                            targetNode.settings = settings;
                            node.settings = settings;
                        }
                        rebuildControlsAndBind();
                    });
                };

                const rebuildControlsAndBind = () => {
                    const html = buildControls(node);
                    const controls = element.querySelector('.node-controls');
                    if (controls) {
                        const scrollTop = controls.scrollTop;
                        controls.innerHTML = html;
                        const newControls = element.querySelector('.node-controls');
                        if (newControls) newControls.scrollTop = scrollTop;
                        bindInteractions();
                    } else {
                        bindInteractions();
                    }
                };

                // 初回描画直後にもスクロール位置を復元
                requestAnimationFrame(() => {
                    const controls = element.querySelector('.node-controls');
                    if (controls) {
                        const saved = scrollPositions.get(node.id);
                        if (typeof saved === 'number') controls.scrollTop = saved;
                    }
                });

                const updateValueAndPreview = (
                    key: keyof SecondaryGradingNodeSettings,
                    val: number | boolean,
                    lutResOverride?: number
                ) => {
                    const settingsState = ensureLayerState();
                    const layers = settingsState.layers!;
                    const activeIdx = settingsState.activeLayerIndex ?? 0;
                    const activeLayer = layers[activeIdx];

                    // UI表示更新
                    // スライダー更新
                    if (typeof val === 'number') {
                        const display = element.querySelector(`.control-value[data-sg-value="${key}"]`);
                        if (display) display.textContent = val.toFixed(2);
                    }

                    const targetNode = state.nodes.find((n) => n.id === node.id);
                    if (targetNode && activeLayer) {
                        // 型安全な代入
                        applyToLayer(activeLayer as any, key as any, val);
                        // active layer 0 なら互換用フィールドも更新
                        if (activeIdx === 0 && key !== 'kind') {
                            (settingsState as any)[key] = val as any;
                        }
                        syncBaseFromLayer0(settingsState);

                        targetNode.settings = settingsState;
                        node.settings = settingsState;

                        // プレビュー更新
                        const schedulePreview = () => {
                            const processor = processors.get(node.id);
                            const hasImage = processor?.hasImage ? processor.hasImage() : true;
                            if (!(processor && hasImage)) {
                                propagateToMediaPreview(node, undefined);
                                return;
                            }

                            const video = videoProcessors.get(node.id);
                            const latestSettings = node.settings as SecondaryGradingNodeSettings;
                            const activeLayerLatest = getActiveLayer(latestSettings);
                            const paramsHash = JSON.stringify({
                                layers: latestSettings.layers,
                                active: latestSettings.activeLayerIndex,
                                showMask: activeLayerLatest.showMask,
                            });
                            let lut = lutCache.get(node.id)?.lut;

                            if (!lut || lutCache.get(node.id)?.params !== paramsHash) {
                                const transform = activeLayerLatest.showMask
                                    ? buildMaskTransform(activeLayerLatest)
                                    : buildColorTransform(buildPipeline(latestSettings));
                                const res = lutResOverride ?? getPreviewLutRes();
                                lut = generateLUT3D(res, transform);
                                if (lut) {
                                    lutCache.set(node.id, { params: paramsHash, lut });
                                }
                            }

                            if (lut) {
                                processor.loadLUT(lut);
                                const video = videoProcessors.get(node.id);
                                if (video && (video as any).__loopState) {
                                    (video as any).__loopState.currentLut = lut;
                                    (video as any).__loopState.currentParams = paramsHash;
                                }
                                // 動画の場合の描画・伝播はループ側に任せる
                                if (!video) {
                                    const size = (processor as any).imageSize;
                                    const tex = (processor as any).inputTexture;
                                    if (size?.width && size?.height && tex && processor.hasImage && processor.hasImage()) {
                                        try {
                                            processor.renderWithCurrentTexture();
                                            propagateToMediaPreview(node, processor);
                                        } catch (err) {
                                            console.warn('[SecondaryGrading] render skipped (image)', err);
                                        }
                                    } else {
                                        console.warn('[SecondaryGrading] skip render: image/texture missing');
                                    }
                                }
                            }

                            if (!video) {
                                propagateToMediaPreview(node, processor);
                                lastPreviewAt.set(node.id, performance.now());
                            }
                        };

                        const now = performance.now();
                        const last = lastPreviewAt.get(node.id) ?? 0;
                        const elapsed = now - last;
                        if (elapsed >= 33) {
                            schedulePreview();
                        } else {
                            if (pendingPreviewHandles.has(node.id)) {
                                // 既に予約済みなら何もしない（最新状態はnode.settingsに反映済み）
                            } else {
                                const handle = window.setTimeout(() => {
                                    pendingPreviewHandles.delete(node.id);
                                    schedulePreview();
                                }, 33 - elapsed);
                                pendingPreviewHandles.set(node.id, handle as number);
                            }
                        }
                    }
                };

                // 初期化処理
                if (sourceMedia) {
                    try {
                        // 直前まで動画ループが回っていた場合、静止画に切り替えるタイミングでクリーンアップ
                        if (sourceMedia.kind !== 'video') {
                            const cleanup = videoCleanup.get(node.id);
                            if (cleanup) {
                                cleanup();
                                videoCleanup.delete(node.id);
                                videoProcessors.delete(node.id);
                            }
                        }

                        if (sourceMedia.kind === 'video') {
                            const settings = ensureLayerState();
                            const activeLayerNow = getActiveLayer(settings);

                            // LUTを用意（キャッシュになければ生成）
                            const paramsHash = JSON.stringify({
                                layers: settings.layers,
                                active: settings.activeLayerIndex,
                                showMask: activeLayerNow.showMask,
                            });
                            if (!lutCache.get(node.id) || lutCache.get(node.id)?.params !== paramsHash) {
                                const transform = activeLayerNow.showMask
                                    ? buildMaskTransform(activeLayerNow)
                                    : buildColorTransform(buildPipeline(settings));
                                const lut = generateLUT3D(getPreviewLutRes(), transform);
                                if (lut) {
                                    lutCache.set(node.id, { params: paramsHash, lut });
                                }
                            }

                            if (processor) {
                                const lut = lutCache.get(node.id)?.lut;
                                if (lut) {
                                    processor.loadLUT(lut);
                                }
                                await ensureVideoLoop(node, processor, sourceMedia.url);
                                // 初回フレーム待ちで真っ白に見えないよう、直後にレンダー＆伝播
                                processor.renderWithCurrentTexture();
                                propagateToMediaPreview(node, processor);
                            }
                        } else {
                            // 直前まで動画だった場合は完全クリーンアップしてから静止画処理
                            const wasVideo = prevKind === 'video';
                            if (!processor || wasVideo) {
                                processor = createProcessor();
                                if (processor) {
                                    processors.set(node.id, processor);
                                }
                            }

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
                            const shouldReload = !processor?.hasImage?.() || lastSource !== imageUrl;

                            if (shouldReload && processor) {
                                await processor.loadImage(imageUrl);
                                lastSourceByNode.set(node.id, imageUrl);
                                // 読み込み直後に即描画して反映
                                processor.renderWithCurrentTexture();
                                propagateToMediaPreview(node, processor);
                                // メディアプレビューノードを強制的に再描画（遅延実行）
                                scheduleRenderNodes(node.id);
                            }


                            // 初回描画
                            const settings = node.settings as SecondaryGradingNodeSettings;
                            const activeLayerNow = getActiveLayer(settings);
                            // ダミー更新でプレビュー生成
                            updateValueAndPreview('hueCenter', activeLayerNow.hueCenter ?? 0);
                        }


                    } catch (error) {
                        console.error('[SecondaryGrading] Preview setup failed', error);
                    }
                } else {
                    lastSourceByNode.delete(node.id);
                    lastSourceKindByNode.set(node.id, null);
                    const cleanup = videoCleanup.get(node.id);
                    if (cleanup) {
                        cleanup();
                        videoCleanup.delete(node.id);
                    }
                    propagateToMediaPreview(node, undefined);
                }

                // 現在のソース種別を記録（次回比較用）
                lastSourceKindByNode.set(node.id, currentKind);

                // ソース変更を監視してプレビュー更新（即時1回＋以降ポーリング）
                const refreshSourcePreview = async () => {
                    const mediaNow = getSourceMedia(node);
                    const kindNow: 'video' | 'image' | null = mediaNow?.kind === 'video'
                        ? 'video'
                        : mediaNow?.kind === 'image'
                            ? 'image'
                            : null;
                    const urlNow = mediaNow?.url ?? null;
                    const lastUrl = lastSourceByNode.get(node.id) ?? null;
                    const lastKind = lastSourceKindByNode.get(node.id) ?? null;

                    if (!mediaNow) {
                        clearVideoState(node.id);
                        propagateToMediaPreview(node, undefined);
                        lastSourceKindByNode.set(node.id, null);
                        return;
                    }

                    const changed = kindNow !== lastKind || urlNow !== lastUrl;
                    if (!changed) return;

                    if (kindNow === 'video') {
                        // 切替時に既存の動画ループを完全停止してから再構築（多重ループ防止）
                        clearVideoState(node.id);
                        lutCache.delete(node.id);
                        lastPreviewAt.delete(node.id);

                        let proc = processors.get(node.id);
                        if (!proc) {
                            proc = createProcessor();
                            if (!proc) return;
                            processors.set(node.id, proc);
                        }
                        const settings = ensureLayerState();
                        const activeLayerNow = getActiveLayer(settings);
                        const paramsHash = JSON.stringify({
                            layers: settings.layers,
                            active: settings.activeLayerIndex,
                            showMask: activeLayerNow.showMask,
                        });
                        if (!lutCache.get(node.id) || lutCache.get(node.id)?.params !== paramsHash) {
                            const transform = activeLayerNow.showMask
                                ? buildMaskTransform(activeLayerNow)
                                : buildColorTransform(buildPipeline(settings));
                            const lut = generateLUT3D(getPreviewLutRes(), transform);
                            if (lut) lutCache.set(node.id, { params: paramsHash, lut });
                        }
                        const lut = lutCache.get(node.id)?.lut;
                        if (lut) proc.loadLUT(lut);
                        await ensureVideoLoop(node, proc, mediaNow.url);
                        // 初回描画はループ側に任せ、ここでは行わない（サイズ/テクスチャ未設定エラー防止）
                        lastSourceByNode.set(node.id, mediaNow.url);
                        lastSourceKindByNode.set(node.id, 'video');
                        return;
                    }

                    // image
                    // ここで動画ループを完全停止し、古い動画プレビューを消す
                    clearVideoState(node.id);
                    lutCache.delete(node.id);
                    lastPreviewAt.delete(node.id);

                    // 画像用に毎回新しい Processor を用意（動画テクスチャを確実に切り離す）
                    const proc = createProcessor();
                    if (!proc) return;
                    processors.set(node.id, proc);
                    let imageUrl = mediaNow.url;
                    if (imageUrl.startsWith('file://')) {
                        const result = await window.nodevision.loadImageAsDataURL({ filePath: imageUrl });
                        if (result.ok && result.dataURL) imageUrl = result.dataURL;
                    }
                    let imgW = mediaNow.width;
                    let imgH = mediaNow.height;
                    if (!imgW || !imgH) {
                        try {
                            const probed = await probeImageSize(imageUrl);
                            imgW = probed.width;
                            imgH = probed.height;
                        } catch {
                            // ignore, fallback to existing canvas size
                        }
                    }

                    const glCanvas = proc.getContext().canvas as HTMLCanvasElement;
                    if (imgW && imgH) {
                        glCanvas.width = imgW;
                        glCanvas.height = imgH;
                    }

                    await proc.loadImage(imageUrl);
                    lastSourceByNode.set(node.id, imageUrl);
                    const settings = ensureLayerState();
                    const activeLayerNow = getActiveLayer(settings);
                    proc.renderWithCurrentTexture();
                    propagateToMediaPreview(node, proc);
                    updateValueAndPreview('hueCenter', activeLayerNow.hueCenter ?? 0);
                    lastSourceKindByNode.set(node.id, 'image');
                };

                // 即時一度実行して遅延を防ぐ
                await refreshSourcePreview();
                const watchHandle = window.setInterval(refreshSourcePreview, 400);
                sourceWatchers.set(node.id, watchHandle);

                // 初回バインド
                bindInteractions();
            },
        }),
    };
};
