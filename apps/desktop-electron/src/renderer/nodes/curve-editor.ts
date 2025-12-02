import type { ColorGradingPipeline } from '@nodevision/color-grading';
import type { CurvesNodeSettings, CurvePoint } from '@nodevision/editor';

import type { RendererNode } from '../types';

import { calculateHistogram, type HistogramData } from './histogram-utils';
import type { NodeRendererContext, NodeRendererModule } from './types';
import { WebGLLUTProcessor } from './webgl-lut-processor';

// デバッグログのオンオフ
const DEBUG_CURVES = false;

// 動的にモジュールを読み込む
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const colorGrading = (window as any).nodeRequire('@nodevision/color-grading');
const { evaluateCurve, buildColorTransform, generateLUT3D } = colorGrading;

// チャンネル定義
type ChannelType = 'master' | 'red' | 'green' | 'blue' | 'hueVsHue' | 'hueVsSat' | 'hueVsLuma';

const CHANNEL_COLORS = {
    master: '#ffffff',
    red: '#ff4444',
    green: '#44ff44',
    blue: '#4488ff',
    hueVsHue: '#ff00ff',
    hueVsSat: '#00ffff',
    hueVsLuma: '#ffff00'
};

// UI用の淡いチャンネルカラー（ノードのトーンに合わせてパステル寄せ）
const LIGHT_CHANNEL_COLORS: Record<ChannelType, string> = {
    master: '#ffffff',
    red: '#ffb3b3',
    green: '#b6e3b3',
    blue: '#b3d1ff',
    hueVsHue: '#f3b3ff',
    hueVsSat: '#b3f0ff',
    hueVsLuma: '#fff7b3'
};

/**
 * 動画からヒストグラムを抽出するヘルパー関数
 */
const extractHistogramFromVideo = async (videoUrl: string): Promise<HistogramData | null> => {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        video.crossOrigin = 'anonymous';
        video.src = videoUrl;
        video.muted = true;
        video.playsInline = true;

        const cleanup = () => {
            video.onloadeddata = null;
            video.onseeked = null;
            video.onerror = null;
            video.src = '';
            video.load();
        };

        const timeoutId = setTimeout(() => {
            cleanup();
            resolve(null);
        }, 5000);

        video.onloadeddata = () => {
            video.currentTime = 0;
        };

        video.onseeked = () => {
            clearTimeout(timeoutId);
            try {
                const canvas = document.createElement('canvas');
                // パフォーマンスのためにリサイズ（最大幅320px）
                const scale = Math.min(1, 320 / video.videoWidth);
                canvas.width = Math.floor(video.videoWidth * scale);
                canvas.height = Math.floor(video.videoHeight * scale);

                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    // Uint8ClampedArray -> Uint8Array
                    const data = new Uint8Array(imageData.data.buffer);
                    const hist = calculateHistogram(data, canvas.width, canvas.height);
                    cleanup();
                    resolve(hist);
                } else {
                    cleanup();
                    resolve(null);
                }
            } catch (e) {
                console.error('[Curves] Histogram extraction failed:', e);
                cleanup();
                resolve(null);
            }
        };

        video.onerror = () => {
            clearTimeout(timeoutId);
            cleanup();
            resolve(null);
        };
    });
};

const processors = new Map<string, WebGLLUTProcessor>();
const lastSourceByNode = new Map<string, string>();
const lastProcessedSourceUrl = new Map<string, string>(); // 入力ソースの変更検知用
const activeChannels = new Map<string, ChannelType>(); // ノードごとのアクティブチャンネル
const noSourceCleaned = new Set<string>(); // ソース切断後にクリーンアップ済みか

// ヒストグラム関連の状態
type HistogramMode = 'input' | 'output' | 'off';
const histogramModes = new Map<string, HistogramMode>();
const inputHistograms = new Map<string, HistogramData>();
const outputHistograms = new Map<string, HistogramData>();

// 動画プレビュー生成のフラグ
let isGeneratingFFmpeg = false;
let pendingFFmpegNode: RendererNode | null = null;

// 初期化済みフラグ（無限ループ防止）
const initializedNodes = new Map<string, boolean>();

// リアルタイム動画プレビュー関連
const videoElements = new Map<string, HTMLVideoElement>();
const animationFrameIds = new Map<string, number>();
const realtimeMode = new Map<string, boolean>(); // ノードごとのリアルタイムモードフラグ
const needsHistogramUpdate = new Map<string, boolean>(); // ヒストグラム更新フラグ
const frameCounts = new Map<string, number>(); // フレームカウンタ
const lastFailedVideoUrl = new Map<string, string>();
const lastHistogramUpdateAt = new Map<string, number>();
const lastPreviewUpdateAt = new Map<string, number>();
const lastKindByNode = new Map<string, 'video' | 'image'>();
const HIST_FRAME_INTERVAL = 10;
const HIST_UPDATE_MIN_MS = 120;
const PREVIEW_UPDATE_MIN_MS = 60;
const HIST_DOWNSAMPLE_STEP = 2; // ヒスト計算を1/2解像度で
const ENABLE_REALTIME_HISTOGRAM = true; // 重いときは false にして負荷軽減
let globalContext: NodeRendererContext | null = null;

const createProcessor = (): WebGLLUTProcessor => {
    const canvas = document.createElement('canvas');
    return new WebGLLUTProcessor(canvas);
};

/**
 * カーブエディタのCanvasを描画
 */
function drawCurveEditor(
    canvas: HTMLCanvasElement,
    points: CurvePoint[],
    channel: ChannelType,
    histogramData: HistogramData | null,
    activePointIndex: number = -1
) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const padding = 10;
    const drawWidth = width - padding * 2;
    const drawHeight = height - padding * 2;

    // 背景クリア（さらに明るめに）
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(0, 0, width, height);

    // Hueカーブの場合は背景に色相グラデーションを描画
    const isHue = channel.startsWith('hueVs');
    if (isHue) {
        const gradient = ctx.createLinearGradient(padding, 0, width - padding, 0);
        gradient.addColorStop(0, '#ff0000');
        gradient.addColorStop(0.17, '#ffff00');
        gradient.addColorStop(0.33, '#00ff00');
        gradient.addColorStop(0.5, '#00ffff');
        gradient.addColorStop(0.67, '#0000ff');
        gradient.addColorStop(0.83, '#ff00ff');
        gradient.addColorStop(1, '#ff0000');

        ctx.fillStyle = gradient;
        ctx.globalAlpha = 0.2; // 背景として控えめに表示
        ctx.fillRect(padding, padding, drawWidth, drawHeight);
        ctx.globalAlpha = 1.0;

        // 中心線 (Y=0.5)
        const centerY = height - padding - 0.5 * drawHeight;
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padding, centerY);
        ctx.lineTo(width - padding, centerY);
        ctx.stroke();
    }

    // ヒストグラム描画
    if (histogramData) {
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#888'; // デフォルト色

        let data: number[] = [];
        if (isHue) {
            data = histogramData.hue;
        } else {
            switch (channel) {
                case 'master': data = histogramData.master; break;
                case 'red': data = histogramData.red; ctx.fillStyle = '#ff4444'; break;
                case 'green': data = histogramData.green; ctx.fillStyle = '#44ff44'; break;
                case 'blue': data = histogramData.blue; ctx.fillStyle = '#4488ff'; break;
            }
        }

        if (data && data.length > 0) {
            ctx.beginPath();
            ctx.moveTo(padding, height - padding);

            const binWidth = drawWidth / data.length;
            for (let i = 0; i < data.length; i++) {
                const h = data[i] * drawHeight;
                const x = padding + i * binWidth;
                const y = height - padding - h;
                ctx.lineTo(x, y);
            }

            ctx.lineTo(width - padding, height - padding);
            ctx.closePath();
            ctx.fill();
        }
        ctx.globalAlpha = 1.0;
    }

    // グリッド描画
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.beginPath();

    // 縦線 (25%刻み)
    for (let i = 0; i <= 4; i++) {
        const x = padding + (drawWidth * i) / 4;
        ctx.moveTo(x, padding);
        ctx.lineTo(x, height - padding);
    }

    // 横線 (25%刻み)
    for (let i = 0; i <= 4; i++) {
        const y = padding + (drawHeight * i) / 4;
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
    }
    ctx.stroke();

    // 対角線（基準線） - RGBカーブのみ
    if (!isHue) {
        ctx.strokeStyle = '#333';
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(padding, height - padding);
        ctx.lineTo(width - padding, padding);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // カーブ描画
    ctx.strokeStyle = CHANNEL_COLORS[channel];
    ctx.lineWidth = 2;
    ctx.beginPath();

    // 描画範囲の決定
    let startT = 0;
    let endT = 1;

    // RGB/Lumaカーブでポイントが2つ以上ある場合、
    // ポイントの範囲外（水平線になる部分）を描画しないようにする
    if (!isHue && points.length >= 2) {
        startT = points[0].x;
        endT = points[points.length - 1].x;
    }

    // 0から1まで細かく評価して描画
    const steps = 100;
    const range = endT - startT;

    // 範囲が0の場合は描画しない（または点として描画すべきだが、通常2ポイント以上なら範囲はある）
    if (range > 0) {
        for (let i = 0; i <= steps; i++) {
            const t = startT + (i / steps) * range;
            const val = evaluateCurve(points, t, isHue); // Hueカーブはループ有効

            const x = padding + t * drawWidth;
            const y = height - padding - val * drawHeight; // Y軸は下が大きいので反転

            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
    } else if (points.length === 1) {
        // 1ポイントのみ（かつ範囲0）の場合のフォールバック
        // 通常ここには来ない（startT=0, endT=1になるはず）
        const val = points[0].y;
        const y = height - padding - val * drawHeight;
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
    }

    ctx.stroke();

    // ポイント描画
    points.forEach((p, index) => {
        const x = padding + p.x * drawWidth;
        const y = height - padding - p.y * drawHeight;

        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = index === activePointIndex ? '#fff' : CHANNEL_COLORS[channel];
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();
    });
}

/**
 * リアルタイム動画プレビューを開始
 */
const startRealtimeVideoPreview = (node: RendererNode, videoUrl: string) => {
    // 既存のプレビューを停止
    stopRealtimeVideoPreview(node.id);

    if (!videoUrl) return;
    if (lastFailedVideoUrl.get(node.id) === videoUrl) return;

    const video = document.createElement('video');
    video.src = videoUrl;
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.loop = true;
    video.playsInline = true;

    video.onloadeddata = () => {
        lastFailedVideoUrl.delete(node.id);
        videoElements.set(node.id, video);
        realtimeMode.set(node.id, true);
        video.play();
        renderVideoFrame(node);
    };

    video.onerror = (e) => {
        if (DEBUG_CURVES) {
            console.error('[Curves] Video load error:', e);
        }
        lastFailedVideoUrl.set(node.id, videoUrl);
        stopRealtimeVideoPreview(node.id);
    };
};

/**
 * リアルタイム動画プレビューを停止
 */
const stopRealtimeVideoPreview = (nodeId: string) => {
    // アニメーションフレームをキャンセル
    const frameId = animationFrameIds.get(nodeId);
    if (frameId !== undefined) {
        cancelAnimationFrame(frameId);
        animationFrameIds.delete(nodeId);
    }

    // 動画要素を削除
    const video = videoElements.get(nodeId);
    if (video) {
        video.pause();
        video.src = '';
        video.load();
        videoElements.delete(nodeId);
    }

    realtimeMode.delete(nodeId);
};

/**
 * 動画フレームをレンダリング（リアルタイムループ）
 */
const renderVideoFrame = (node: RendererNode) => {
    if (!realtimeMode.get(node.id)) return;
    const video = videoElements.get(node.id);
    const processor = processors.get(node.id);

    if (!video || !processor || !realtimeMode.get(node.id)) {
        return;
    }

    // 動画が再生中でフレームが更新されている場合のみ処理
    if (video.paused || video.ended || video.readyState < 2) {
        const frameId = requestAnimationFrame(() => renderVideoFrame(node));
        animationFrameIds.set(node.id, frameId);
        return;
    }

    try {
        // 新しいAPIを使用して動画フレームをロード
        processor.loadVideoFrame(video);
        processor.renderWithCurrentTexture();
        // 背景Canvasに描画結果を表示
        const canvas = processor.getContext().canvas as HTMLCanvasElement;
        updateBackgroundCanvas(node.id, canvas);

        // ヒストグラム更新が必要な場合、または動画再生中は定期的に更新
        // 動画の場合はInput/Outputに関わらず内容が変化するため常時更新する
        const count = (frameCounts.get(node.id) || 0) + 1;
        frameCounts.set(node.id, count);

        const now = Date.now();
        const lastHistTs = lastHistogramUpdateAt.get(node.id) || 0;
        const intervalOk = now - lastHistTs >= HIST_UPDATE_MIN_MS;
        const shouldUpdate =
            (needsHistogramUpdate.get(node.id) || count % HIST_FRAME_INTERVAL === 0) && intervalOk;

        if (shouldUpdate && ENABLE_REALTIME_HISTOGRAM) {
            const pixels = processor.getOutputPixels();
            if (pixels) {
                // ダウンサンプルしてヒスト計算を軽量化
                const sw = Math.max(1, Math.floor(canvas.width / HIST_DOWNSAMPLE_STEP));
                const sh = Math.max(1, Math.floor(canvas.height / HIST_DOWNSAMPLE_STEP));
                const sampled = new Uint8Array(sw * sh * 4);
                const stride = HIST_DOWNSAMPLE_STEP;
                let si = 0;
                for (let y = 0; y < sh; y++) {
                    const srcY = y * stride;
                    const baseY = srcY * canvas.width * 4;
                    for (let x = 0; x < sw; x++) {
                        const srcX = x * stride;
                        const srcIdx = baseY + srcX * 4;
                        sampled[si++] = pixels[srcIdx];
                        sampled[si++] = pixels[srcIdx + 1];
                        sampled[si++] = pixels[srcIdx + 2];
                        sampled[si++] = pixels[srcIdx + 3];
                    }
                }

                const hist = calculateHistogram(sampled, sw, sh);
                outputHistograms.set(node.id, hist);
                needsHistogramUpdate.set(node.id, false);
                lastHistogramUpdateAt.set(node.id, now);

                // ヒストグラム表示を更新するために再描画
                const curveCanvas = document.querySelector(
                    `.node[data-id="${node.id}"] .node-curve-editor canvas`
                ) as HTMLCanvasElement;

                if (curveCanvas) {
                    const channel = activeChannels.get(node.id) || 'master';
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const settings = (node as any).data.settings as CurvesNodeSettings;
                    const points = settings[channel];

                    if (points) {
                        drawCurveEditor(curveCanvas, points, channel, hist);
                    }
                }

                // Media Previewへの反映（ヒスト更新と同じ頻度で実行）
                propagateToMediaPreview(node, processor);
            }
        }
    } catch (e) {
        console.error('[Curves] Frame render error:', e);
    }

    // 次のフレーム
    const frameId = requestAnimationFrame(() => renderVideoFrame(node));
    animationFrameIds.set(node.id, frameId);
};

/**
 * 背景Canvasに描画結果を表示
 */
const updateBackgroundCanvas = (nodeId: string, sourceCanvas: HTMLCanvasElement) => {
    const bgCanvas = document.querySelector(
        `.node[data-id="${nodeId}"] canvas.node-background`
    ) as HTMLCanvasElement;

    if (bgCanvas) {
        const bgCtx = bgCanvas.getContext('2d');
        if (bgCtx) {
            bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
            bgCtx.drawImage(sourceCanvas, 0, 0, bgCanvas.width, bgCanvas.height);
        }
    }
};

/**
 * メディアプレビューノードへ補正後の dataURL を反映
 */
function propagateToMediaPreview(node: RendererNode, processor?: WebGLLUTProcessor) {
    if (!globalContext) return;
    const { state } = globalContext;

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
                    } else if (!img && dataUrl && globalContext) {
                        globalContext.renderNodes();
                    }
                }
            });
        });
    }
}

export const createCurveEditorNodeRenderer = (context: NodeRendererContext): NodeRendererModule => {
    const { state, escapeHtml, cleanupMediaPreview } = context;
    globalContext = context;



    /**
     * 上流ノードから元メディアの URL を取得
     */
    const getSourceMedia = (node: RendererNode): string | null => {
        const inputPorts = ['source', 'input']; // 'program'は動画編集ノード用
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

    /**
     * カーブエディタのCanvasを描画
     */
    function drawCurveEditor(
        canvas: HTMLCanvasElement,
        points: CurvePoint[],
        channel: ChannelType,
        histogramData: HistogramData | null,
        activePointIndex: number = -1
    ) {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const width = canvas.width;
        const height = canvas.height;
        const padding = 10;
        const drawWidth = width - padding * 2;
        const drawHeight = height - padding * 2;

        // 背景クリア
        ctx.fillStyle = '#222';
        ctx.fillRect(0, 0, width, height);

        // Hueカーブの場合は背景に色相グラデーションを描画
        const isHue = channel.startsWith('hueVs');
        if (isHue) {
            const gradient = ctx.createLinearGradient(padding, 0, width - padding, 0);
            gradient.addColorStop(0, '#ff0000');
            gradient.addColorStop(0.17, '#ffff00');
            gradient.addColorStop(0.33, '#00ff00');
            gradient.addColorStop(0.5, '#00ffff');
            gradient.addColorStop(0.67, '#0000ff');
            gradient.addColorStop(0.83, '#ff00ff');
            gradient.addColorStop(1, '#ff0000');

            ctx.fillStyle = gradient;
            ctx.globalAlpha = 0.8; // Hue系は明るめに表示
            ctx.fillRect(padding, padding, drawWidth, drawHeight);
            ctx.globalAlpha = 1.0;

            // 中心線 (Y=0.5)
            const centerY = height - padding - 0.5 * drawHeight;
            ctx.strokeStyle = '#888';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(padding, centerY);
            ctx.lineTo(width - padding, centerY);
            ctx.stroke();
        }

        // ヒストグラム描画
        if (histogramData) {
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = '#888'; // デフォルト色

            let data: number[] = [];
            if (isHue) {
                data = histogramData.hue;
            } else {
                switch (channel) {
                    case 'master': data = histogramData.master; break;
                    case 'red': data = histogramData.red; ctx.fillStyle = '#ff4444'; break;
                    case 'green': data = histogramData.green; ctx.fillStyle = '#44ff44'; break;
                    case 'blue': data = histogramData.blue; ctx.fillStyle = '#4488ff'; break;
                }
            }

            if (data && data.length > 0) {
                ctx.beginPath();
                ctx.moveTo(padding, height - padding);

                const binWidth = drawWidth / data.length;
                for (let i = 0; i < data.length; i++) {
                    const h = data[i] * drawHeight;
                    const x = padding + i * binWidth;
                    const y = height - padding - h;
                    ctx.lineTo(x, y);
                }

                ctx.lineTo(width - padding, height - padding);
                ctx.closePath();
                ctx.fill();
            }
            ctx.globalAlpha = 1.0;
        }

        // グリッド描画：チャンネルで分岐
        //  - Master/Red/Green/Blue: メジャー5x5（濃い線）＋各メジャー5x5サブ（薄い線）
        //  - Hue系: 現行の6x2メジャー＋各メジャー8x8サブ
        ctx.save();
        ctx.translate(0.5, 0.5); // 線をシャープに

        const useHueGrid = isHue;
        const majorDivX = useHueGrid ? 6 : 5;
        const majorDivY = useHueGrid ? 2 : 5;
        const subDivsPerMajor = useHueGrid ? 8 : 5;
        const subLineWidth = useHueGrid ? 0.5 : 0.6;
        const majorLineWidth = useHueGrid ? 1.0 : 1.2;

        // サブグリッド
        ctx.strokeStyle = '#333';
        ctx.lineWidth = subLineWidth;
        ctx.beginPath();
        for (let mx = 0; mx < majorDivX; mx++) {
            const startX = padding + (drawWidth / majorDivX) * mx;
            for (let sx = 0; sx <= subDivsPerMajor; sx++) {
                const x = startX + (drawWidth / majorDivX) * (sx / subDivsPerMajor);
                ctx.moveTo(x, padding);
                ctx.lineTo(x, height - padding);
            }
        }
        for (let my = 0; my < majorDivY; my++) {
            const startY = padding + (drawHeight / majorDivY) * my;
            for (let sy = 0; sy <= subDivsPerMajor; sy++) {
                const y = startY + (drawHeight / majorDivY) * (sy / subDivsPerMajor);
                ctx.moveTo(padding, y);
                ctx.lineTo(width - padding, y);
            }
        }
        ctx.stroke();

        // メジャーグリッド
        ctx.strokeStyle = '#444';
        ctx.lineWidth = majorLineWidth;
        ctx.beginPath();
        for (let i = 0; i <= majorDivX; i++) {
            const x = padding + (drawWidth * i) / majorDivX;
            ctx.moveTo(x, padding);
            ctx.lineTo(x, height - padding);
        }
        for (let i = 0; i <= majorDivY; i++) {
            const y = padding + (drawHeight * i) / majorDivY;
            ctx.moveTo(padding, y);
            ctx.lineTo(width - padding, y);
        }
        ctx.stroke();
        ctx.restore();

        // 対角線（基準線） - RGBカーブのみ
        if (!isHue) {
            ctx.strokeStyle = '#333';
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(padding, height - padding);
            ctx.lineTo(width - padding, padding);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // カーブ描画
        ctx.strokeStyle = CHANNEL_COLORS[channel];
        ctx.lineWidth = 2;
        ctx.beginPath();

        // 描画範囲の決定
        let startT = 0;
        let endT = 1;

        // RGB/Lumaカーブでポイントが2つ以上ある場合、
        // ポイントの範囲外（水平線になる部分）を描画しないようにする
        if (!isHue && points.length >= 2) {
            startT = points[0].x;
            endT = points[points.length - 1].x;
        }

        // 0から1まで細かく評価して描画
        const steps = 100;
        const range = endT - startT;

        // 範囲が0の場合は描画しない（または点として描画すべきだが、通常2ポイント以上なら範囲はある）
        if (range > 0) {
            for (let i = 0; i <= steps; i++) {
                const t = startT + (i / steps) * range;
                const val = evaluateCurve(points, t, isHue); // Hueカーブはループ有効

                const x = padding + t * drawWidth;
                const y = height - padding - val * drawHeight; // Y軸は下が大きいので反転

                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
        } else if (points.length === 1) {
            // 1ポイントのみ（かつ範囲0）の場合のフォールバック
            // 通常ここには来ない（startT=0, endT=1になるため）
        }

        ctx.stroke();

        // コントロールポイント描画
        points.forEach((p, index) => {
            const x = padding + p.x * drawWidth;
            const y = height - padding - p.y * drawHeight;

            ctx.fillStyle = '#fff';
            ctx.beginPath();

            // アクティブなポイントは大きく描画
            const radius = index === activePointIndex ? 6 : 4;
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();

            // 選択中のようなエフェクト
            ctx.strokeStyle = index === activePointIndex ? '#ff0' : '#000';
            ctx.lineWidth = index === activePointIndex ? 2 : 1;
            ctx.stroke();
        });
    };

    const buildControls = (node: RendererNode): string => {
        // settings変数は使用されていないが、型チェックのために取得しておく
        // const settings = (node.settings as CurvesNodeSettings) || {
        //     kind: 'curves',
        //     master: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
        //     red: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
        //     green: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
        //     blue: [{ x: 0, y: 0 }, { x: 1, y: 1 }]
        // };

        const activeChannel = activeChannels.get(node.id) || 'master';
        const histogramMode = histogramModes.get(node.id) || 'input';

        return `
      <div class="node-controls" style="padding: 12px;">
        <div class="channel-tabs" style="display: flex; gap: 4px; margin-bottom: 8px; flex-wrap: wrap;">
          ${['master', 'red', 'green', 'blue', 'hueVsHue', 'hueVsSat', 'hueVsLuma'].map(ch => `
            <button 
              class="channel-tab ${ch === activeChannel ? 'active' : ''}" 
              data-channel="${ch}"
              style="
                flex: 1; 
                min-width: 60px;
                padding: 4px; 
                border: 1px solid ${ch === activeChannel ? LIGHT_CHANNEL_COLORS[ch as ChannelType] : '#cbd6ff'};
                background: ${ch === activeChannel ? LIGHT_CHANNEL_COLORS[ch as ChannelType] : '#e9edff'};
                color: ${ch === activeChannel ? '#111' : '#202840'};
                cursor: pointer;
                font-size: 10px;
                border-radius: 12px;
              "
            >
              ${ch.replace('hueVs', 'Hue ')}
            </button>
          `).join('')}
        </div>
        
        <div class="curve-editor-container" style="position: relative; width: 100%; height: 200px; background: #222; border-radius: 4px; overflow: hidden;">
          <canvas 
            class="curve-canvas" 
            data-node-id="${escapeHtml(node.id)}"
            data-node-interactive="true"
            width="280" 
            height="200"
            style="width: 100%; height: 100%; cursor: crosshair;"
          ></canvas>
        </div>
        
        <div style="display: flex; justify-content: space-between; margin-top: 8px; align-items: center;">
          <div class="histogram-controls" style="display: flex; gap: 2px;">
             <button class="hist-mode-btn ${histogramMode === 'input' ? 'active' : ''}" data-mode="input" style="font-size: 10px; padding: 4px 10px; border: 1px solid ${histogramMode === 'input' ? '#aebff5' : '#cbd6ff'}; background: ${histogramMode === 'input' ? '#cbd6ff' : '#e9edff'}; color: ${histogramMode === 'input' ? '#111' : '#202840'}; border-radius: 10px; cursor: pointer;">Input</button>
             <button class="hist-mode-btn ${histogramMode === 'output' ? 'active' : ''}" data-mode="output" style="font-size: 10px; padding: 4px 10px; border: 1px solid ${histogramMode === 'output' ? '#aebff5' : '#cbd6ff'}; background: ${histogramMode === 'output' ? '#cbd6ff' : '#e9edff'}; color: ${histogramMode === 'output' ? '#111' : '#202840'}; border-radius: 10px; cursor: pointer;">Output</button>
             <button class="hist-mode-btn ${histogramMode === 'off' ? 'active' : ''}" data-mode="off" style="font-size: 10px; padding: 4px 10px; border: 1px solid ${histogramMode === 'off' ? '#aebff5' : '#cbd6ff'}; background: ${histogramMode === 'off' ? '#cbd6ff' : '#e9edff'}; color: ${histogramMode === 'off' ? '#111' : '#202840'}; border-radius: 10px; cursor: pointer;">Off</button>
          </div>
          <div style="display: flex; gap: 4px;">
            <button 
              class="reset-channel-btn press-feedback" 
              data-base-bg="#e9edff" data-base-border="#cbd6ff"
              data-active-bg="#c0cbf7" data-active-border="#99b4ff"
              style="font-size: 11px; padding: 6px 10px; border: 1px solid #cbd6ff; background: #e9edff; color: #202840; border-radius: 8px; cursor: pointer; transition: background-color 120ms ease, border-color 120ms ease;">
                Reset Channel
            </button>
            <button 
              class="reset-all-btn press-feedback"
              data-base-bg="#e9edff" data-base-border="#cbd6ff"
              data-active-bg="#c0cbf7" data-active-border="#99b4ff"
              style="font-size: 11px; padding: 6px 10px; border: 1px solid #cbd6ff; background: #e9edff; color: #202840; border-radius: 8px; cursor: pointer; transition: background-color 120ms ease, border-color 120ms ease;">
                Reset All
            </button>
          </div>
        </div>
      </div>
    `;
    };

    return {
        id: 'curve-editor',
        typeIds: ['curves'],
        render: (node) => ({
            afterPortsHtml: buildControls(node),
            afterRender: async (element) => {
                let processor = processors.get(node.id);
                if (!processor) {
                    processor = createProcessor();
                    processors.set(node.id, processor);
                }

                const settings = (node.settings as CurvesNodeSettings) || {
                    kind: 'curves',
                    master: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
                    red: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
                    green: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
                    blue: [{ x: 0, y: 0 }, { x: 1, y: 1 }]
                };

                // 初期設定がない場合のフォールバック
                const defaultLinear = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
                const defaultFlat: CurvePoint[] = []; // DaVinci Resolve starts with empty

                if (!settings.master) settings.master = [...defaultLinear];
                if (!settings.red) settings.red = [...defaultLinear];
                if (!settings.green) settings.green = [...defaultLinear];
                if (!settings.blue) settings.blue = [...defaultLinear];
                if (!settings.hueVsHue) settings.hueVsHue = [...defaultFlat];
                if (!settings.hueVsSat) settings.hueVsSat = [...defaultFlat];
                if (!settings.hueVsLuma) settings.hueVsLuma = [...defaultFlat];

                const activeChannel = activeChannels.get(node.id) || 'master';
                const histogramMode = histogramModes.get(node.id) || 'input';
                const canvas = element.querySelector('.curve-canvas') as HTMLCanvasElement;

                // Canvas描画
                if (canvas) {
                    // 解像度調整
                    const rect = canvas.getBoundingClientRect();
                    canvas.width = rect.width;
                    canvas.height = rect.height;

                    const points = settings[activeChannel];
                    if (!points) return;

                    let histData: HistogramData | null = null;
                    if (histogramMode === 'input') {
                        histData = inputHistograms.get(node.id) || null;
                    } else if (histogramMode === 'output') {
                        histData = outputHistograms.get(node.id) || null;
                    }

                    drawCurveEditor(canvas, points, activeChannel, histData);

                    // マウス操作
                    let isDragging = false;
                    let dragIndex = -1;
                    const padding = 10;

                    const getPointFromEvent = (e: MouseEvent | PointerEvent) => {
                        const rect = canvas.getBoundingClientRect();
                        // CSS座標系で計算（高DPIディスプレイ対応）
                        const canvasWidth = rect.width;
                        const canvasHeight = rect.height;
                        const drawWidth = canvasWidth - padding * 2;
                        const drawHeight = canvasHeight - padding * 2;

                        const x = Math.max(0, Math.min(1, (e.clientX - rect.left - padding) / drawWidth));
                        const y = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top - padding) / drawHeight));
                        return { x, y };
                    };

                    canvas.addEventListener('pointerdown', (e) => {
                        e.stopPropagation(); // ノードのドラッグ/選択を防止
                        e.preventDefault(); // テキスト選択やスクロール開始を防ぐ

                        canvas.setPointerCapture(e.pointerId); // キャプチャしてドラッグを追跡

                        const { x, y } = getPointFromEvent(e);
                        const points = settings[activeChannel];
                        if (!points) return;

                        // 既存のポイントをクリックしたか判定 (距離判定)
                        const threshold = 0.05;
                        const foundIndex = points.findIndex(p =>
                            Math.abs(p.x - x) < threshold && Math.abs(p.y - y) < threshold
                        );

                        if (foundIndex !== -1) {
                            // 既存ポイントのドラッグ開始
                            isDragging = true;
                            dragIndex = foundIndex;
                        } else {
                            // カーブ上（付近）をクリックした場合のみポイント追加
                            const isHue = activeChannel.startsWith('hueVs');
                            // evaluateCurve は正規化されたカーブを期待するため、念のためソート済みのものを使用
                            // points は参照渡しだが、evaluateCurve 内で副作用はないはず
                            const curveY = evaluateCurve(points, x, isHue);

                            if (Math.abs(curveY - y) < threshold) {
                                // 新しいポイントを追加
                                const newPoint = { x, y };
                                points.push(newPoint);
                                // X座標でソート
                                points.sort((a, b) => a.x - b.x);

                                isDragging = true;
                                dragIndex = points.indexOf(newPoint);
                                updateSettings();
                            }
                        }
                    });

                    window.addEventListener('pointermove', (e) => {
                        if (!isDragging || dragIndex === -1) return;
                        e.preventDefault();
                        e.stopPropagation();

                        const { x, y } = getPointFromEvent(e);
                        const points = settings[activeChannel];
                        if (!points) return;

                        const point = points[dragIndex];

                        // ポイント数に応じた操作制限（DaVinci Resolve仕様）
                        const isHue = activeChannel.startsWith('hueVs');

                        if (points.length === 1 && !isHue) {
                            // 1ポイントのみ：Y座標のみ変更可能（RGBカーブの場合）
                            if (isHue) {
                                point.x = x;
                                point.y = y;
                            } else {
                                point.y = y;
                            }
                        } else {
                            // 端点の判定（配列の最初と最後）
                            const isLeftEndpoint = dragIndex === 0;
                            const isRightEndpoint = dragIndex === points.length - 1;

                            if (isLeftEndpoint && !isHue) {
                                // 左端点：L字型の移動制限（左端または下端に吸着）
                                if (x < y) {
                                    point.x = 0;
                                    point.y = y;
                                } else {
                                    const maxX = points.length > 1 ? points[1].x - 0.01 : 1;
                                    point.x = Math.max(0, Math.min(maxX, x));
                                    point.y = 0;
                                }
                            } else if (isRightEndpoint && !isHue) {
                                // 右端点：逆L字型の移動制限（右端または上端に吸着）
                                if ((1 - x) < (1 - y)) {
                                    point.x = 1;
                                    point.y = y;
                                } else {
                                    const minX = points.length > 1 ? points[points.length - 2].x + 0.01 : 0;
                                    point.x = Math.max(minX, Math.min(1, x));
                                    point.y = 1;
                                }
                            } else {
                                // 中間ポイント（またはHueカーブの全ポイント）：X/Y両方向に移動可能
                                const minX = dragIndex > 0 ? points[dragIndex - 1].x + 0.01 : 0;
                                const maxX = dragIndex < points.length - 1 ? points[dragIndex + 1].x - 0.01 : 1;
                                point.x = Math.max(minX, Math.min(maxX, x));
                                point.y = y;
                            }
                        }

                        let histData: HistogramData | null = null;
                        if (histogramMode === 'input') {
                            histData = inputHistograms.get(node.id) || null;
                        } else if (histogramMode === 'output') {
                            histData = outputHistograms.get(node.id) || null;
                        }

                        drawCurveEditor(canvas, points, activeChannel, histData);
                        // 間引いたタイミングだけ設定を保存（Canvasのみ更新）
                        updateSettings(true); // true = skip renderNodes (Canvasだけ更新)
                    });

                    window.addEventListener('pointerup', (e) => {
                        if (isDragging) {
                            isDragging = false;
                            dragIndex = -1;
                            canvas.releasePointerCapture(e.pointerId);
                            needsHistogramUpdate.set(node.id, true);
                            updateSettings(); // 最終確定
                        }
                    });

                    window.addEventListener('pointercancel', (e) => {
                        if (isDragging) {
                            isDragging = false;
                            dragIndex = -1;
                            canvas.releasePointerCapture(e.pointerId);
                        }
                    });

                    // ダブルクリックでポイント削除（両端以外）
                    canvas.addEventListener('dblclick', (e) => {
                        e.stopPropagation(); // ノードのダブルクリック動作を防止
                        const points = settings[activeChannel];
                        if (!points) return;

                        const rect = canvas.getBoundingClientRect();
                        const x = (e.clientX - rect.left) / rect.width;
                        const y = 1 - (e.clientY - rect.top) / rect.height;

                        // 既存のポイントをクリックした場合は削除
                        const threshold = 10 / rect.width;
                        let foundIndex = -1;
                        for (let i = 0; i < points.length; i++) {
                            const dx = Math.abs(points[i].x - x);
                            const dy = Math.abs(points[i].y - y);
                            if (dx < threshold && dy < threshold) {
                                foundIndex = i;
                                break;
                            }
                        }

                        if (foundIndex !== -1) {
                            points.splice(foundIndex, 1);
                            updateSettings();
                        }
                    });
                }

                // チャンネルタブ切り替え
                element.querySelectorAll('.channel-tab').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const target = e.currentTarget as HTMLElement;
                        const channel = target.dataset.channel as ChannelType;
                        activeChannels.set(node.id, channel);
                        context.renderNodes(); // 再描画してタブの状態とCanvasを更新
                    });
                });

                // 押下時に色が変わるフィードバック（Reset系ボタン）
                element.querySelectorAll('.press-feedback').forEach(btn => {
                    const el = btn as HTMLButtonElement;
                    const baseBg = el.dataset.baseBg || el.style.backgroundColor;
                    const baseBorder = el.dataset.baseBorder || el.style.borderColor;
                    const activeBg = el.dataset.activeBg || baseBg;
                    const activeBorder = el.dataset.activeBorder || baseBorder;

                    const setBase = () => {
                        el.style.backgroundColor = baseBg;
                        el.style.borderColor = baseBorder;
                    };
                    const setActive = () => {
                        el.style.backgroundColor = activeBg;
                        el.style.borderColor = activeBorder;
                    };

                    el.addEventListener('mousedown', setActive);
                    el.addEventListener('mouseup', setBase);
                    el.addEventListener('mouseleave', setBase);
                    el.addEventListener('touchstart', setActive, { passive: true });
                    el.addEventListener('touchend', setBase, { passive: true });
                });

                // リセットボタン
                const resetChannelBtn = element.querySelector('.reset-channel-btn');
                if (resetChannelBtn) {
                    resetChannelBtn.addEventListener('click', () => {
                        const isHue = activeChannel.startsWith('hueVs');
                        settings[activeChannel] = isHue
                            ? [] // DaVinci Resolve starts with empty
                            : [{ x: 0, y: 0 }, { x: 1, y: 1 }];
                        updateSettings();
                    });
                }

                const resetAllBtn = element.querySelector('.reset-all-btn');
                if (resetAllBtn) {
                    resetAllBtn.addEventListener('click', () => {
                        const defaultLinear = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
                        const defaultFlat: CurvePoint[] = []; // DaVinci Resolve starts with empty

                        settings.master = [...defaultLinear];
                        settings.red = [...defaultLinear];
                        settings.green = [...defaultLinear];
                        settings.blue = [...defaultLinear];
                        settings.hueVsHue = [...defaultFlat];
                        settings.hueVsSat = [...defaultFlat];
                        settings.hueVsLuma = [...defaultFlat];
                        updateSettings();
                    });
                }

                // ヒストグラムモード切り替え
                element.querySelectorAll('.hist-mode-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const target = e.currentTarget as HTMLElement;
                        const mode = target.dataset.mode as HistogramMode;
                        histogramModes.set(node.id, mode);
                        context.renderNodes(); // 再描画
                    });
                });

                // 設定更新とプレビュー反映
                const updateSettings = (skipRenderNodes = false) => {
                    if (DEBUG_CURVES) {
                        console.log('[Curves] updateSettings called', { skipRenderNodes });
                    }
                    const targetNode = state.nodes.find((n) => n.id === node.id);
                    if (targetNode) {
                        // オブジェクトの参照を新しくして変更を検知させる
                        const newSettings: CurvesNodeSettings = {
                            kind: 'curves',
                            master: [...settings.master],
                            red: [...settings.red],
                            green: [...settings.green],
                            blue: [...settings.blue],
                            hueVsHue: settings.hueVsHue ? [...settings.hueVsHue] : [],
                            hueVsSat: settings.hueVsSat ? [...settings.hueVsSat] : [],
                            hueVsLuma: settings.hueVsLuma ? [...settings.hueVsLuma] : []
                        };
                        targetNode.settings = newSettings;
                        node.settings = newSettings;

                        if (!skipRenderNodes) {
                            // Canvas再描画のためにrenderNodesを呼ぶとちらつく可能性があるので
                            // 基本的にはCanvasは自前で更新し、設定だけ保存する
                            const channelPoints = settings[activeChannel];
                            if (channelPoints) {
                                let histData: HistogramData | null = null;
                                if (histogramMode === 'input') {
                                    histData = inputHistograms.get(node.id) || null;
                                } else if (histogramMode === 'output') {
                                    histData = outputHistograms.get(node.id) || null;
                                }
                                drawCurveEditor(canvas, channelPoints, activeChannel, histData);
                            }
                        }

                        // プレビュー更新：動画か画像かを判定
                        const sourcePreview = state.mediaPreviews.get(
                            state.connections.find(c => c.toNodeId === node.id)?.fromNodeId || ''
                        );
                        const isVideo = sourcePreview?.kind === 'video';

                        if (isVideo) {
                            // 動画の場合：リアルタイムモードならLUT更新のみ、それ以外はFFmpeg再生成
                            const isRealtime = realtimeMode.get(node.id);

                            if (isRealtime) {
                                // リアルタイムモード：LUT更新のみ（次のフレームで自動反映）
                                const processor = processors.get(node.id);
                                if (processor) {
                                    const pipeline: ColorGradingPipeline = {
                                        curves: {
                                            master: newSettings.master,
                                            red: newSettings.red,
                                            green: newSettings.green,
                                            blue: newSettings.blue
                                        },
                                        hueCurves: {
                                            hueVsHue: newSettings.hueVsHue || [],
                                            hueVsSat: newSettings.hueVsSat || [],
                                            hueVsLuma: newSettings.hueVsLuma || []
                                        }
                                    };

                                    const transform = buildColorTransform(pipeline);
                                    const lut = generateLUT3D(33, transform); // preview speed

                                    if (DEBUG_CURVES) {
                                        console.log(
                                            `[Curves] LUT generated. Data[0-3]:`,
                                            lut.data[0],
                                            lut.data[1],
                                            lut.data[2],
                                            lut.data[3]
                                        );
                                    }

                                    processor.loadLUT(lut);
                                    processor.setIntensity(1.0); // 念のため強度をリセット

                                    // ヒストグラム更新をリクエスト
                                    needsHistogramUpdate.set(node.id, true);
                                }
                            } else {
                                // 非リアルタイムモード：FFmpegで再生成
                                generateFFmpegVideoPreview(targetNode).catch(err => {
                                    console.error('[Curves] Failed to update video preview:', err);
                                });
                            }
                        } else {
                            // 画像の場合：動画ループを確実に停止してからWebGL更新
                            stopRealtimeVideoPreview(node.id);
                            realtimeMode.delete(node.id);
                            lastFailedVideoUrl.delete(node.id);
                            // WebGLで即座に更新（skipRenderNodesでも反映させる）
                            updatePreview();
                        }
                    }
                };

                /**
                 * FFmpegを使って動画にカーブを適用したプレビューを生成
                 */
                const generateFFmpegVideoPreview = async (nodeToProcess: RendererNode) => {
                    if (isGeneratingFFmpeg) {
                        pendingFFmpegNode = nodeToProcess;
                        return;
                    }

                    isGeneratingFFmpeg = true;
                    pendingFFmpegNode = null;

                    try {
                        // 上流ノードチェーンを収集
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const collectUpstreamNodes = (startNodeId: string): any[] => {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const nodes: any[] = [];
                            let currentId = startNodeId;
                            let depth = 0;
                            const MAX_DEPTH = 50;

                            while (currentId && depth < MAX_DEPTH) {
                                const currentNode = state.nodes.find(n => n.id === currentId);
                                if (!currentNode) break;

                                const nodeSettings = currentNode.settings || {};
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const mediaNode: any = {
                                    id: currentNode.id,
                                    typeId: currentNode.typeId,
                                    nodeVersion: '1.0.0',
                                    ...nodeSettings
                                };

                                if (currentNode.typeId === 'loadVideo' || currentNode.typeId === 'loadImage') {
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

                        const upstreamNodes = collectUpstreamNodes(nodeToProcess.id);
                        const result = await window.nodevision.generatePreview({ nodes: upstreamNodes });

                        if (result.ok && result.url) {
                            // 元のソース動画のサイズを取得
                            const sourceConn = state.connections.find(c => c.toNodeId === nodeToProcess.id);
                            const sourceNode = sourceConn ? state.nodes.find(n => n.id === sourceConn.fromNodeId) : null;
                            const sourcePreview = sourceNode ? state.mediaPreviews.get(sourceNode.id) : null;

                            const width = sourcePreview?.width ?? 1280;
                            const height = sourcePreview?.height ?? 720;

                            state.mediaPreviews.set(nodeToProcess.id, {
                                url: result.url,
                                name: 'Preview',
                                kind: 'video',
                                width,
                                height,
                                size: 0,
                                type: 'video/mp4',
                                ownedUrl: true
                            });

                            // Outputヒストグラム更新（動画）
                            // 既に存在する場合はスキップして無限ループを防ぐ
                            if (!outputHistograms.has(nodeToProcess.id)) {
                                extractHistogramFromVideo(result.url).then(hist => {
                                    if (hist) {
                                        outputHistograms.set(nodeToProcess.id, hist);
                                        // updateSettings呼び出しは無限ループを引き起こすため、直接キャンバス再描画
                                        const histMode = histogramModes.get(nodeToProcess.id);
                                        if (histMode === 'output') {
                                            const canvas = document.querySelector(`.node[data-id="${nodeToProcess.id}"] canvas.curve-canvas`);
                                            const activeChannel = activeChannels.get(nodeToProcess.id) || 'master';
                                            const channelPoints = (nodeToProcess.settings as CurvesNodeSettings)[activeChannel];
                                            if (canvas && channelPoints) {
                                                drawCurveEditor(canvas as HTMLCanvasElement, channelPoints, activeChannel, hist);
                                            }
                                        }
                                    }
                                });
                            }

                            // Media Previewノードへプレビューを伝播
                            // video.srcの直接設定は不安定なため、state.mediaPreviewsを経由する
                            state.mediaPreviews.set(nodeToProcess.id, {
                                url: result.url,
                                name: 'Video Preview',
                                kind: 'video',
                                width: sourcePreview?.width || 1920,
                                height: sourcePreview?.height || 1080,
                                size: 0,
                                type: 'video/mp4',
                                ownedUrl: true,
                            });

                            // renderNodesを呼んでMedia Previewノードを更新
                            context.renderNodes();
                        } else {
                            console.error('[Curves] FFmpeg preview generation failed:', result);
                        }
                    } catch (error) {
                        console.error('[Curves] FFmpeg preview generation error:', error);
                    } finally {
                        isGeneratingFFmpeg = false;

                        if (pendingFFmpegNode) {
                            const nextNode = pendingFFmpegNode;
                            pendingFFmpegNode = null;
                            setTimeout(() => generateFFmpegVideoPreview(nextNode), 100);
                        }
                    }
                };

                // WebGLプレビュー更新（画像用）
                const updatePreview = () => {
                    const now = Date.now();
                    const last = lastPreviewUpdateAt.get(node.id) || 0;
                    if (now - last < PREVIEW_UPDATE_MIN_MS) return;
                    lastPreviewUpdateAt.set(node.id, now);

                    const sourceMediaUrl = getSourceMedia(node);
                    if (sourceMediaUrl && processor) {
                        // パイプライン構築
                        const pipeline: ColorGradingPipeline = {
                            curves: {
                                master: settings.master,
                                red: settings.red,
                                green: settings.green,
                                blue: settings.blue
                            },
                            hueCurves: {
                                hueVsHue: settings.hueVsHue || [],
                                hueVsSat: settings.hueVsSat || [],
                                hueVsLuma: settings.hueVsLuma || []
                            }
                        };

                        // LUT生成
                        const transform = buildColorTransform(pipeline);
                        const lut = generateLUT3D(33, transform); // 33^3 preview

                        // WebGL適用
                        processor.loadLUT(lut);
                        processor.renderWithCurrentTexture();
                        propagateToMediaPreview(node, processor);

                        // Outputヒストグラム更新
                        const pixels = processor.getOutputPixels();
                        if (pixels) {
                            const { width, height } = processor.getContext().canvas;
                            const hist = calculateHistogram(pixels, width, height);
                            outputHistograms.set(node.id, hist);

                            // Outputモードなら再描画
                            if (histogramMode === 'output') {
                                const channelPoints = settings[activeChannel];
                                if (channelPoints && canvas) {
                                    drawCurveEditor(canvas, channelPoints, activeChannel, hist);
                                }
                            }
                        }
            }
        };

        // 初期化：画像/動画ロードとプレビュー
        // 無限ループ防止：初回のみ初期化を実行、ただしソースが変更された場合は再実行
        const isInitialized = initializedNodes.get(node.id);
        const sourceMediaUrl = getSourceMedia(node);
        const lastUrl = lastProcessedSourceUrl.get(node.id);

        const sourcePreviewKind = state.mediaPreviews.get(
            state.connections.find(c => c.toNodeId === node.id)?.fromNodeId || ''
        )?.kind;
        const currentKind: 'video' | 'image' | null =
            sourcePreviewKind === 'video'
                ? 'video'
                : sourcePreviewKind === 'image'
                    ? 'image'
                    : sourceMediaUrl
                        ? (sourceMediaUrl.toLowerCase().match(/\.(mp4|mov|mkv|webm)$/) ? 'video' : 'image')
                        : null;
        const lastKind = lastKindByNode.get(node.id);

        if (DEBUG_CURVES) {
            console.log('[Curves] render check:', {
                id: node.id,
                sourceMediaUrl,
                lastUrl,
                isInitialized,
                match: sourceMediaUrl === lastUrl,
                currentKind,
                lastKind
            });
        }

                const needsInit =
                    sourceMediaUrl &&
                    (!isInitialized || sourceMediaUrl !== lastUrl || (currentKind && lastKind && currentKind !== lastKind));

                if (needsInit) {
                    // 初期化済みフラグと最終ソースを更新
                    initializedNodes.set(node.id, true);
                    lastProcessedSourceUrl.set(node.id, sourceMediaUrl);
                    if (currentKind) lastKindByNode.set(node.id, currentKind);
                    noSourceCleaned.delete(node.id);

                    // 動画かどうかを判定
                    const sourcePreview = state.mediaPreviews.get(
                        state.connections.find(c => c.toNodeId === node.id)?.fromNodeId || ''
                    );
                    const isVideo = sourcePreview?.kind === 'video';

                    if (isVideo) {
                        // Inputヒストグラム更新（動画）
                        // URLが変わった場合、またはヒストグラムが未計算の場合に実行
                        if (!inputHistograms.has(node.id) || sourceMediaUrl !== lastUrl) {
                            if (sourceMediaUrl) {
                                extractHistogramFromVideo(sourceMediaUrl).then(hist => {
                                    if (hist) {
                                        inputHistograms.set(node.id, hist);
                                        updateSettings(true);
                                    }
                                });
                            }
                        }

                        // 動画の場合：リアルタイムWebGLプレビューを開始（初回のみ）
                        if (sourceMediaUrl) {
                            startRealtimeVideoPreview(node, sourceMediaUrl);
                        }

                        // FFmpegエンコードは初回のみ実行（Media Previewノード用）
                        await generateFFmpegVideoPreview(node);
                    } else {
                        // 画像モードに切り替わるので動画ループを確実に停止
                        stopRealtimeVideoPreview(node.id);
                        realtimeMode.delete(node.id);
                        lastFailedVideoUrl.delete(node.id);

                        // 画像の場合：WebGLで処理
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

                            // Inputヒストグラム計算
                            const pixels = processor.getInputPixels();
                            if (pixels && processor.hasImage()) {
                                // processorのcanvasサイズを取得（リサイズされている可能性があるため）
                                const { width, height } = processor.getContext().canvas;
                                const hist = calculateHistogram(pixels, width, height);
                                inputHistograms.set(node.id, hist);
                            }
                        }

                        updatePreview();
                    }
                } else if (!sourceMediaUrl) {
                    // ソースがない場合はクリーンアップ（動画ループを確実に停止）
                    if (noSourceCleaned.has(node.id)) {
                        return;
                    }
                    noSourceCleaned.add(node.id);
                    stopRealtimeVideoPreview(node.id);
                    realtimeMode.delete(node.id);
                    videoElements.delete(node.id);
                    lastFailedVideoUrl.delete(node.id);
                    needsHistogramUpdate.delete(node.id);
                    inputHistograms.delete(node.id);
                    outputHistograms.delete(node.id);
                    lastHistogramUpdateAt.delete(node.id);
                    lastPreviewUpdateAt.delete(node.id);
                    lastSourceByNode.delete(node.id);
                    lastProcessedSourceUrl.delete(node.id);
                    initializedNodes.delete(node.id);
                    lastKindByNode.delete(node.id);
                    cleanupMediaPreview(node.id);
                    propagateToMediaPreview(node, undefined);
                }
            },
        }),
    };
};
