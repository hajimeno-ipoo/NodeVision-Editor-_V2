import type {
    ColorGradingPipeline,
    LUT3D
} from '@nodevision/color-grading';
import type { SecondaryGradingNodeSettings, SecondaryGradingLayer } from '@nodevision/editor';

import type { RendererNode } from '../types';
import { clampLutRes, scheduleHighResLUTViaWorker } from './lut-utils';

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
    const { state, escapeHtml, t } = context;

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
    const getExportLutRes = (): number => clampLutRes(state.lutResolutionExport ?? 65);
    const toastHQStart = () => context.showToast(t('toast.hqLutGenerating'));
    const toastHQApplied = () => context.showToast(t('toast.hqLutApplied'));
    const toastHQError = (err: unknown) => context.showToast(String(err), 'error');

    const randomId = () =>
        crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);

    type Processor = WebGLLUTProcessor;
    const processors = new Map<string, Processor>();
    const lastSourceByNode = new Map<string, string>();
    const lutCache = new Map<string, { params: string; lut: LUT3D }>();
    const issuedWarnings = new Set<string>();
    const videoProcessors = new Map<string, HTMLVideoElement>();
    const videoCleanup = new Map<string, () => void>();

    const warnOnce = (key: string, msg: string, level: 'error' | 'info' = 'error') => {
        if (issuedWarnings.has(key)) return;
        issuedWarnings.add(key);
        context.showToast(msg, level);
        console.warn(`[SecondaryGrading] ${msg}`);
    };

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

        if (isNewSource || !videoProcessors.has(node.id)) {
            const oldCleanup = videoCleanup.get(node.id);
            if (oldCleanup) oldCleanup();

            const video = document.createElement('video');
            video.crossOrigin = 'anonymous';
            video.muted = true;
            video.loop = true;
            video.playsInline = true;
            video.src = mediaUrl;

            await new Promise<void>((resolve) => {
                video.onloadedmetadata = () => resolve();
            });

            video.play().catch((err) => console.error('[SecondaryGrading] Video play failed', err));
            videoProcessors.set(node.id, video);
            lastSourceByNode.set(node.id, mediaUrl);

            const loopState = {
                currentLut: lutCache.get(node.id)?.lut ?? null,
                currentParams: lutCache.get(node.id)?.params ?? '',
            };
            (video as any).__loopState = loopState;

            let animationFrameId: number;
            const updateLoop = () => {
                if (video.paused || video.ended) {
                    animationFrameId = requestAnimationFrame(updateLoop);
                    return;
                }

                if (processor && loopState.currentLut) {
                    processor.loadVideoFrame(video);
                    processor.loadLUT(loopState.currentLut);
                    processor.renderWithCurrentTexture();
                    propagateToMediaPreview(node, processor);
                }

                animationFrameId = requestAnimationFrame(updateLoop);
            };
            updateLoop();

            videoCleanup.set(node.id, () => {
                cancelAnimationFrame(animationFrameId);
                video.pause();
                video.src = '';
                video.load();
                videoProcessors.delete(node.id);
                delete (video as any).__loopState;
            });
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
     * メディアプレビューノードへ補正後の dataURL を反映
     */
    const propagateToMediaPreview = (node: RendererNode, processor?: Processor) => {
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
    type SourceMedia = { url: string; kind: 'image' | 'video' } | null;

    const getSourceMedia = (node: RendererNode): SourceMedia => {
        const inputPorts = ['source'];
        const conn = state.connections.find(
            (c) => c.toNodeId === node.id && inputPorts.includes(c.toPortId)
        );
        if (!conn) return null;

        const sourceNode = state.nodes.find((n) => n.id === conn.fromNodeId);
        if (!sourceNode) return null;

        const preview = state.mediaPreviews.get(sourceNode.id);
        if (preview?.url) {
            return { url: preview.url, kind: preview.kind === 'video' ? 'video' : 'image' };
        }

        if (sourceNode.typeId === 'loadVideo' || sourceNode.typeId === 'loadImage') {
            const settings = sourceNode.settings as { filePath?: string } | undefined;
            if (settings?.filePath) {
                return { url: settings.filePath, kind: sourceNode.typeId === 'loadVideo' ? 'video' : 'image' };
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
                            `<button class="sg-layer-tab" data-sg-layer-idx="${idx}" style="padding:6px 10px; border-radius:8px; border:1px solid ${
                                idx === activeIdx ? '#99b4ff' : '#cbd6ff'
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
                        'hueCenter','hueWidth','hueSoftness',
                        'satCenter','satWidth','satSoftness',
                        'lumCenter','lumWidth','lumSoftness',
                        'invert','saturation','hueShift','brightness','showMask','intensity'
                    ];
                    fields.forEach((f) => {
                        (settings as any)[f] = (layer0 as any)[f];
                    });
                };

                const bindInteractions = () => {
                    // スライダー入力イベント
                    const inputs = element.querySelectorAll('input[type="range"]');
                    inputs.forEach((input) => {
                        input.addEventListener('input', (e) => {
                            const target = e.target as HTMLInputElement;
                            const key = target.getAttribute('data-sg-key');
                            if (!key) return;
                            const val = parseFloat(target.value);
                            updateValueAndPreview(key as keyof SecondaryGradingNodeSettings, val, false); // 低画質プレビュー
                        });
                        input.addEventListener('change', (e) => {
                            const target = e.target as HTMLInputElement;
                            const key = target.getAttribute('data-sg-key');
                            if (!key) return;
                            const val = parseFloat(target.value);
                            updateValueAndPreview(key as keyof SecondaryGradingNodeSettings, val, true); // 高画質LUT再生成
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
                            updateValueAndPreview(key as keyof SecondaryGradingNodeSettings, val);
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
                        });
                    });

                    // レイヤー追加
                    const addBtn = element.querySelector<HTMLButtonElement>('.sg-layer-add');
                    addBtn?.addEventListener('click', () => {
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
                        controls.outerHTML = html;
                    }
                    // rebind to freshly rendered controls
                    bindInteractions();
                };

                const updateValueAndPreview = (key: keyof SecondaryGradingNodeSettings, val: number | boolean, highRes: boolean = true) => {
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
                        const currentSettings = targetNode.settings as SecondaryGradingNodeSettings;
                        const activeLayerNow = getActiveLayer(currentSettings);

                        if (processor) {
                            const paramsHash = JSON.stringify({
                                layers: currentSettings.layers,
                                active: currentSettings.activeLayerIndex,
                                showMask: activeLayerNow.showMask,
                            });
                            let lut = lutCache.get(node.id)?.lut;

                            // 設定が変わったらLUT再生成
                            if (!lut || lutCache.get(node.id)?.params !== paramsHash) {
                                let transform;
                                if (activeLayerNow.showMask) {
                                    transform = buildMaskTransform(activeLayerNow);
                                } else {
                                    const pipeline = buildPipeline(currentSettings);
                                    transform = buildColorTransform(pipeline);
                                }
                                lut = generateLUT3D(getPreviewLutRes(), transform); // preview speed
                                if (lut) {
                                    lutCache.set(node.id, { params: paramsHash, lut });
                                }
                            }

                            if (lut) {
                                processor.loadLUT(lut);
                                processor.renderWithCurrentTexture();

                                if (highRes) {
                                    const highResSize = Math.max(getPreviewLutRes(), getExportLutRes());
                                    scheduleHighResLUTViaWorker(
                                        `${node.id}-secondary`,
                                        120,
                                        () => activeLayerNow.showMask ? buildMaskTransform(activeLayerNow) : buildPipeline(currentSettings),
                                        highResSize,
                                        (hiLut) => {
                                            lutCache.set(node.id, { params: paramsHash, lut: hiLut });
                                            processor.loadLUT(hiLut);
                                            processor.renderWithCurrentTexture();
                                            toastHQApplied();
                                            const video = videoProcessors.get(node.id);
                                            if (video && (video as any).__loopState) {
                                                (video as any).__loopState.currentLut = hiLut;
                                                (video as any).__loopState.currentParams = paramsHash;
                                            }
                                        },
                                        'pipeline',
                                        toastHQStart,
                                        toastHQError
                                    );
                                }
                                const video = videoProcessors.get(node.id);
                                if (video && (video as any).__loopState) {
                                    (video as any).__loopState.currentLut = lut;
                                    (video as any).__loopState.currentParams = paramsHash;
                                }
                            }

                            propagateToMediaPreview(node, processor);
                        }
                    }
                };

                // 初期化処理
                if (sourceMedia) {
                    try {
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
                            }
                        } else {
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
                    const cleanup = videoCleanup.get(node.id);
                    if (cleanup) {
                        cleanup();
                        videoCleanup.delete(node.id);
                    }
                    propagateToMediaPreview(node, undefined);
                }

                // 初回バインド
                bindInteractions();
            },
        }),
    };
};
