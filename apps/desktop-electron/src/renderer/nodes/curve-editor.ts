import type { ColorGradingPipeline } from '@nodevision/color-grading';
import type { CurvesNodeSettings, CurvePoint } from '@nodevision/editor';

import type { RendererNode } from '../types';
import type { NodeRendererContext, NodeRendererModule } from './types';

// 動的にモジュールを読み込む
const colorGrading = (window as any).nodeRequire('@nodevision/color-grading');
const { evaluateCurve, buildColorTransform, generateLUT3D } = colorGrading;
import { WebGLLUTProcessor } from './webgl-lut-processor';

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

export const createCurveEditorNodeRenderer = (context: NodeRendererContext): NodeRendererModule => {
    const { state, escapeHtml } = context;

    const processors = new Map<string, WebGLLUTProcessor>();
    const lastSourceByNode = new Map<string, string>();
    const activeChannels = new Map<string, ChannelType>(); // ノードごとのアクティブチャンネル

    const createProcessor = (): WebGLLUTProcessor => {
        const canvas = document.createElement('canvas');
        return new WebGLLUTProcessor(canvas);
    };

    /**
     * メディアプレビューノードへ補正後の dataURL を反映
     */
    const propagateToMediaPreview = (node: RendererNode, processor?: WebGLLUTProcessor) => {
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

    /**
     * カーブエディタのCanvasを描画
     */
    const drawCurveEditor = (
        canvas: HTMLCanvasElement,
        points: CurvePoint[],
        channel: ChannelType,
        activePointIndex: number = -1
    ) => {
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

        // 対角線（基準線）
        ctx.strokeStyle = '#333';
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(padding, height - padding);
        ctx.lineTo(width - padding, padding);
        ctx.stroke();
        ctx.setLineDash([]);

        // カーブ描画
        ctx.strokeStyle = CHANNEL_COLORS[channel];
        ctx.lineWidth = 2;
        ctx.beginPath();

        // 0から1まで細かく評価して描画
        const steps = 100;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const val = evaluateCurve(points, t);

            const x = padding + t * drawWidth;
            const y = height - padding - val * drawHeight; // Y軸は下が大きいので反転

            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
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
                border: none; 
                background: ${ch === activeChannel ? '#444' : '#222'}; 
                color: ${ch === activeChannel ? '#fff' : '#888'};
                border-bottom: 2px solid ${ch === activeChannel ? CHANNEL_COLORS[ch as ChannelType] : 'transparent'};
                cursor: pointer;
                font-size: 10px;
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
            width="280" 
            height="200"
            style="width: 100%; height: 100%; cursor: crosshair;"
          ></canvas>
        </div>
        
        <div style="display: flex; justify-content: space-between; margin-top: 8px;">
          <button class="reset-channel-btn" style="font-size: 11px; padding: 4px 8px; background: #333; color: #ccc; border: none; border-radius: 2px; cursor: pointer;">
            Reset Channel
          </button>
          <button class="reset-all-btn" style="font-size: 11px; padding: 4px 8px; background: #333; color: #ccc; border: none; border-radius: 2px; cursor: pointer;">
            Reset All
          </button>
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
                if (!settings.master) settings.master = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
                if (!settings.red) settings.red = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
                if (!settings.green) settings.green = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
                if (!settings.blue) settings.blue = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
                if (!settings.hueVsHue) settings.hueVsHue = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
                if (!settings.hueVsSat) settings.hueVsSat = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
                if (!settings.hueVsLuma) settings.hueVsLuma = [{ x: 0, y: 0 }, { x: 1, y: 1 }];

                const activeChannel = activeChannels.get(node.id) || 'master';
                const canvas = element.querySelector('.curve-canvas') as HTMLCanvasElement;

                // Canvas描画
                if (canvas) {
                    // 解像度調整
                    const rect = canvas.getBoundingClientRect();
                    canvas.width = rect.width;
                    canvas.height = rect.height;

                    const points = settings[activeChannel];
                    drawCurveEditor(canvas, points, activeChannel);

                    // マウス操作
                    let isDragging = false;
                    let dragIndex = -1;
                    const padding = 10;

                    const getPointFromEvent = (e: MouseEvent) => {
                        const rect = canvas.getBoundingClientRect();
                        const x = Math.max(0, Math.min(1, (e.clientX - rect.left - padding) / (canvas.width - padding * 2)));
                        const y = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top - padding) / (canvas.height - padding * 2)));
                        return { x, y };
                    };

                    canvas.addEventListener('mousedown', (e) => {
                        const { x, y } = getPointFromEvent(e);
                        const points = settings[activeChannel];

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
                            // 新しいポイントを追加
                            // 両端（x=0, x=1）以外に追加
                            if (x > 0.02 && x < 0.98) {
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

                    window.addEventListener('mousemove', (e) => {
                        if (!isDragging || dragIndex === -1) return;

                        const { x, y } = getPointFromEvent(e);
                        const points = settings[activeChannel];
                        const point = points[dragIndex];

                        // 両端のポイントはX座標を固定
                        if (dragIndex === 0) {
                            point.y = y;
                        } else if (dragIndex === points.length - 1) {
                            point.y = y;
                        } else {
                            // 中間のポイント
                            // 隣接するポイントを超えないように制限
                            const prevX = points[dragIndex - 1].x;
                            const nextX = points[dragIndex + 1].x;

                            point.x = Math.max(prevX + 0.01, Math.min(nextX - 0.01, x));
                            point.y = y;
                        }

                        drawCurveEditor(canvas, points, activeChannel);
                        // リアルタイム更新は重いかもしれないので、requestAnimationFrameなどで間引くべきだが
                        // ここでは簡易的に直接更新
                        updateSettings(true); // true = skip renderNodes (Canvasだけ更新)
                    });

                    window.addEventListener('mouseup', () => {
                        if (isDragging) {
                            isDragging = false;
                            dragIndex = -1;
                            updateSettings(); // 最終確定
                        }
                    });

                    // ダブルクリックでポイント削除（両端以外）
                    canvas.addEventListener('dblclick', (e) => {
                        const { x, y } = getPointFromEvent(e);
                        const points = settings[activeChannel];

                        const threshold = 0.05;
                        const foundIndex = points.findIndex(p =>
                            Math.abs(p.x - x) < threshold && Math.abs(p.y - y) < threshold
                        );

                        if (foundIndex > 0 && foundIndex < points.length - 1) {
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

                // リセットボタン
                const resetChannelBtn = element.querySelector('.reset-channel-btn');
                if (resetChannelBtn) {
                    resetChannelBtn.addEventListener('click', () => {
                        settings[activeChannel] = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
                        updateSettings();
                    });
                }

                const resetAllBtn = element.querySelector('.reset-all-btn');
                if (resetAllBtn) {
                    resetAllBtn.addEventListener('click', () => {
                        settings.master = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
                        settings.red = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
                        settings.green = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
                        settings.blue = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
                        settings.hueVsHue = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
                        settings.hueVsSat = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
                        settings.hueVsLuma = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
                        updateSettings();
                    });
                }

                // 設定更新とプレビュー反映
                const updateSettings = (skipRenderNodes = false) => {
                    const targetNode = state.nodes.find((n) => n.id === node.id);
                    if (targetNode) {
                        // オブジェクトの参照を新しくして変更を検知させる
                        const newSettings: CurvesNodeSettings = {
                            kind: 'curves',
                            master: [...settings.master],
                            red: [...settings.red],
                            green: [...settings.green],
                            blue: [...settings.blue],
                            hueVsHue: settings.hueVsHue ? [...settings.hueVsHue] : [{ x: 0, y: 0 }, { x: 1, y: 1 }],
                            hueVsSat: settings.hueVsSat ? [...settings.hueVsSat] : [{ x: 0, y: 0 }, { x: 1, y: 1 }],
                            hueVsLuma: settings.hueVsLuma ? [...settings.hueVsLuma] : [{ x: 0, y: 0 }, { x: 1, y: 1 }]
                        };
                        targetNode.settings = newSettings;
                        node.settings = newSettings;

                        if (!skipRenderNodes) {
                            // Canvas再描画のためにrenderNodesを呼ぶとちらつく可能性があるので
                            // 基本的にはCanvasは自前で更新し、設定だけ保存する
                            drawCurveEditor(canvas, settings[activeChannel], activeChannel);
                        }

                        updatePreview();
                    }
                };

                // WebGLプレビュー更新
                const updatePreview = () => {
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
                                hueVsHue: settings.hueVsHue || [{ x: 0, y: 0 }, { x: 1, y: 1 }],
                                hueVsSat: settings.hueVsSat || [{ x: 0, y: 0 }, { x: 1, y: 1 }],
                                hueVsLuma: settings.hueVsLuma || [{ x: 0, y: 0 }, { x: 1, y: 1 }]
                            }
                        };

                        // LUT生成
                        const transform = buildColorTransform(pipeline);
                        const lut = generateLUT3D(33, transform); // 33x33x33

                        // WebGL適用
                        processor.loadLUT(lut);
                        processor.renderWithCurrentTexture();
                        propagateToMediaPreview(node, processor);
                    }
                };

                // 初期化：画像ロードとプレビュー
                const sourceMediaUrl = getSourceMedia(node);
                if (sourceMediaUrl) {
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

                    updatePreview();
                } else {
                    lastSourceByNode.delete(node.id);
                    propagateToMediaPreview(node, undefined);
                }
            },
        }),
    };
};
