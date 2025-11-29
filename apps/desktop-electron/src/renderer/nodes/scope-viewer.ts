import type { ScopeViewerNodeSettings } from '@nodevision/editor';

import type { RendererNode } from '../types';
import type { NodeRendererContext, NodeRendererModule } from './types';

export const createScopeViewerNodeRenderer = (context: NodeRendererContext): NodeRendererModule => {
    const { state, escapeHtml } = context;

    // キャンバスとヒストグラムデータのキャッシュ
    const scopeCanvases = new Map<string, HTMLCanvasElement>();
    const histogramCache = new Map<string, { r: number[], g: number[], b: number[], luma: number[] }>();

    /**
     * 上流ノードから元メディアの URL を取得
     */
    const getSourceMedia = (node: RendererNode): string | null => {
        const conn = state.connections.find(
            (c) => c.toNodeId === node.id && c.toPortId === 'source'
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
     * 画像からRGBヒストグラムを計算
     */
    const calculateHistogram = async (imageUrl: string): Promise<{ r: number[], g: number[], b: number[], luma: number[] }> => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';

            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');

                if (!ctx) {
                    reject(new Error('Failed to get canvas context'));
                    return;
                }

                ctx.drawImage(img, 0, 0);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;

                // 256ビンのヒストグラム
                const r = new Array(256).fill(0);
                const g = new Array(256).fill(0);
                const b = new Array(256).fill(0);
                const luma = new Array(256).fill(0);

                // ピクセルごとにカウント
                for (let i = 0; i < data.length; i += 4) {
                    const rVal = data[i];
                    const gVal = data[i + 1];
                    const bVal = data[i + 2];

                    r[rVal]++;
                    g[gVal]++;
                    b[bVal]++;

                    // 輝度値（Rec. 709）
                    const lumaVal = Math.round(0.299 * rVal + 0.587 * gVal + 0.114 * bVal);
                    luma[lumaVal]++;
                }

                // 正規化（最大値を1.0に）
                const normalize = (arr: number[]) => {
                    const max = Math.max(...arr);
                    return max > 0 ? arr.map(v => v / max) : arr;
                };

                resolve({
                    r: normalize(r),
                    g: normalize(g),
                    b: normalize(b),
                    luma: normalize(luma)
                });
            };

            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = imageUrl;
        });
    };

    /**
     * RGBヒストグラムを描画
     */
    const drawHistogram = (canvas: HTMLCanvasElement, histogram: { r: number[], g: number[], b: number[], luma: number[] }) => {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const width = canvas.width;
        const height = canvas.height;

        // 背景クリア
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, width, height);

        // グリッド描画
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i <= 4; i++) {
            const x = (width * i) / 4;
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
        }
        ctx.stroke();

        const binWidth = width / 256;
        const maxHeight = height * 0.9; // 上部に余白

        // 輝度ヒストグラム（グレー、半透明）
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        for (let i = 0; i < 256; i++) {
            const x = i * binWidth;
            const barHeight = histogram.luma[i] * maxHeight;
            const y = height - barHeight;
            ctx.fillRect(x, y, Math.ceil(binWidth), barHeight);
        }

        // Redチャンネル（加算ブレンドっぽく）
        ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
        for (let i = 0; i < 256; i++) {
            const x = i * binWidth;
            const barHeight = histogram.r[i] * maxHeight;
            const y = height - barHeight;
            ctx.fillRect(x, y, Math.ceil(binWidth), barHeight);
        }

        // Greenチャンネル
        ctx.fillStyle = 'rgba(0, 255, 0, 0.5)';
        for (let i = 0; i < 256; i++) {
            const x = i * binWidth;
            const barHeight = histogram.g[i] * maxHeight;
            const y = height - barHeight;
            ctx.fillRect(x, y, Math.ceil(binWidth), barHeight);
        }

        // Blueチャンネル
        ctx.fillStyle = 'rgba(0, 0, 255, 0.5)';
        for (let i = 0; i < 256; i++) {
            const x = i * binWidth;
            const barHeight = histogram.b[i] * maxHeight;
            const y = height - barHeight;
            ctx.fillRect(x, y, Math.ceil(binWidth), barHeight);
        }

        // ラベル
        ctx.fillStyle = '#ccc';
        ctx.font = '10px monospace';
        ctx.fillText('0', 5, height - 5);
        ctx.fillText('128', width / 2 - 15, height - 5);
        ctx.fillText('255', width - 25, height - 5);
    };

    const buildControls = (node: RendererNode): string => {
        const settings = (node.settings as ScopeViewerNodeSettings) || {
            kind: 'scopeViewer',
            scopeType: 'histogram'
        };

        return `
      <div class="node-controls" style="padding: 12px;">
        <div style="margin-bottom: 12px;">
          <label style="display: block; font-size: 11px; color: #ccc; margin-bottom: 4px;">Scope Type</label>
          <select class="scope-type-select" style="width: 100%; padding: 4px; background: #222; color: #eee; border: 1px solid #444; border-radius: 3px;">
            <option value="histogram" ${settings.scopeType === 'histogram' ? 'selected' : ''}>RGB Histogram</option>
            <option value="waveform" ${settings.scopeType === 'waveform' ? 'selected' : ''}>Waveform (Coming Soon)</option>
            <option value="vectorscope" ${settings.scopeType === 'vectorscope' ? 'selected' : ''}>Vectorscope (Coming Soon)</option>
          </select>
        </div>
        
        <div class="scope-canvas-container" style="width: 100%; height: 250px; background: #1a1a1a; border-radius: 4px; border: 1px solid #333;">
          <canvas 
            class="scope-canvas" 
            data-node-id="${escapeHtml(node.id)}"
            width="650"
            height="500"
            style="width: 100%; height: 100%;"
          ></canvas>
        </div>
        
        <div style="font-size: 10px; color: #666; margin-top: 8px; text-align: center;">
          ${settings.scopeType === 'histogram' ? 'RGB Histogram + Luma' : 'Feature not yet implemented'}
        </div>
      </div>
    `;
    };

    return {
        id: 'scope-viewer',
        typeIds: ['scopeViewer'],
        render: (node) => ({
            afterPortsHtml: buildControls(node),
            afterRender: async (element) => {
                const settings = (node.settings as ScopeViewerNodeSettings) || {
                    kind: 'scopeViewer',
                    scopeType: 'histogram'
                };

                const canvas = element.querySelector('.scope-canvas') as HTMLCanvasElement;
                if (!canvas) return;

                scopeCanvases.set(node.id, canvas);

                // Scope Type変更イベント
                const select = element.querySelector('.scope-type-select');
                if (select) {
                    select.addEventListener('change', (e) => {
                        const target = e.target as HTMLSelectElement;
                        const newType = target.value as 'histogram' | 'waveform' | 'vectorscope';

                        const targetNode = state.nodes.find((n) => n.id === node.id);
                        if (targetNode) {
                            const newSettings: ScopeViewerNodeSettings = {
                                kind: 'scopeViewer',
                                scopeType: newType
                            };
                            targetNode.settings = newSettings;
                            node.settings = newSettings;
                            context.renderNodes();
                        }
                    });
                }

                // ソース画像取得
                const sourceMediaUrl = getSourceMedia(node);
                if (!sourceMediaUrl) return;

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

                    // ヒストグラムタイプのみ実装
                    if (settings.scopeType === 'histogram') {
                        const histogram = await calculateHistogram(imageUrl);
                        histogramCache.set(node.id, histogram);
                        drawHistogram(canvas, histogram);
                    }
                } catch (error) {
                    console.error('[ScopeViewer] Failed to render scope:', error);
                }
            },
        }),
    };
};
