import type { LUT3D } from '@nodevision/color-grading';
import type { LUTLoaderNodeSettings } from '@nodevision/editor';

import type { RendererNode } from '../types';
import type { NodeRendererContext, NodeRendererModule } from './types';
import { WebGLLUTProcessor } from './webgl-lut-processor';

// 動的にモジュールを読み込む
const colorGrading = (window as any).nodeRequire('@nodevision/color-grading');
const { parseCubeLUT, validateImportedLUT } = colorGrading;

export const createLUTLoaderNodeRenderer = (context: NodeRendererContext): NodeRendererModule => {
    const { state, escapeHtml } = context;


    const processors = new Map<string, WebGLLUTProcessor>();
    const lastSourceByNode = new Map<string, string>();
    const loadedLUTs = new Map<string, LUT3D>();
    // 動画プレビュー用の状態管理
    const videoProcessors = new Map<string, HTMLVideoElement>();
    const videoCleanup = new Map<string, () => void>();

    const createProcessor = (): WebGLLUTProcessor => {
        const canvas = document.createElement('canvas');
        return new WebGLLUTProcessor(canvas);
    };

    const buildIdentityLut = (size = 17): LUT3D => {
        const data = new Float32Array(size * size * size * 3);
        let ptr = 0;
        for (let b = 0; b < size; b++) {
            for (let g = 0; g < size; g++) {
                for (let r = 0; r < size; r++) {
                    data[ptr++] = r / (size - 1);
                    data[ptr++] = g / (size - 1);
                    data[ptr++] = b / (size - 1);
                }
            }
        }
        return { resolution: size, data };
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
    /**
     * 上流ノードから元メディアの URL と種別を取得
     */
    const getSourceMedia = (node: RendererNode): { url: string; kind: 'image' | 'video' } | null => {
        const inputPorts = ['source'];
        const conn = state.connections.find(
            (c) => c.toNodeId === node.id && inputPorts.includes(c.toPortId)
        );
        if (!conn) return null;

        const sourceNode = state.nodes.find((n) => n.id === conn.fromNodeId);
        if (!sourceNode) return null;

        const preview = state.mediaPreviews.get(sourceNode.id);
        if (preview?.url) {
            return {
                url: preview.url,
                kind: preview.kind === 'video' ? 'video' : 'image'
            };
        }

        if (sourceNode.typeId === 'loadVideo') {
            const settings = sourceNode.settings as { filePath?: string } | undefined;
            if (settings?.filePath) {
                return { url: settings.filePath, kind: 'video' };
            }
        } else if (sourceNode.typeId === 'loadImage') {
            const settings = sourceNode.settings as { filePath?: string } | undefined;
            if (settings?.filePath) {
                return { url: settings.filePath, kind: 'image' };
            }
        }

        return null;
    };

    const buildControls = (node: RendererNode): string => {
        const settings = (node.settings as LUTLoaderNodeSettings) || {
            kind: 'lutLoader',
            intensity: 1.0,
        };

        const hasLUT = !!settings.lutFilePath;
        const lutSource: 'library' | 'local' = (settings as any).lutSource === 'library' ? 'library' : 'local';
        const intensityValue = settings.intensity ?? 1.0;
        const lutName = settings.lutFilePath
            ? settings.lutFilePath.split('/').pop() || 'LUT file'
            : 'No LUT loaded';

        const library = state.lutLibrary;
        const currentIndex = library.findIndex(entry => entry.path === settings.lutFilePath);
        const resolvedIndex = currentIndex >= 0 ? currentIndex : -1;
        const prevDisabled = resolvedIndex <= 0 ? 'disabled' : '';
        const nextDisabled = resolvedIndex === -1 || resolvedIndex >= library.length - 1 ? 'disabled' : '';

        const placeholderOption = `<option value="" ${resolvedIndex === -1 ? 'selected' : ''}>ファイル未選択</option>`;
        const libraryOptions =
            placeholderOption +
            (library.length > 0
                ? library
                      .map((entry, idx) => {
                          const selected = idx === resolvedIndex ? ' selected' : '';
                          return `<option value="${escapeHtml(entry.id)}"${selected}>${escapeHtml(entry.name || entry.filename)}</option>`;
                      })
                      .join('')
                : '');

        return `
      <div class="node-controls" style="padding: 12px;">
        <div class="lut-loader-indicator" style="font-size: 11px; color: #9aa0a6; margin-bottom: 8px;">
          レンダラー: WebGL 2.0 (3D LUT)
        </div>

        <div class="node-media-toolbar" style="margin-bottom: 12px;">
          <button type="button" class="node-media-arrow lut-lib-prev" data-direction="prev" ${prevDisabled}>◀</button>
          <select class="node-media-file-dropdown lut-lib-select" ${library.length === 0 ? 'disabled' : ''}>
            ${libraryOptions}
          </select>
          <button type="button" class="node-media-arrow lut-lib-next" data-direction="next" ${nextDisabled}>▶</button>
        </div>
        
        <div style="margin-bottom: 16px;">
          <button class="load-lut-btn">
            ${hasLUT ? '別のLUTを読み込む' : 'LUTファイルを読み込む'}
          </button>
          <div class="lut-file-name" style="margin-top: 8px; font-size: 11px; color: ${hasLUT ? '#e8eaed' : '#9aa0a6'
            }; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${escapeHtml(lutName)}
          </div>
        </div>
        <p class="lut-active-label" style="margin: 0 0 10px; text-align: center; font-size: 12px; color: rgba(48,48,60,0.75);">
          ${hasLUT ? `現在適用中: ${escapeHtml(lutName)}（${lutSource === 'library' ? 'ライブラリ' : 'ローカル'}）` : '現在適用中: なし'}
        </p>
        <label class="control-label" style="display: block; margin-bottom: 8px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px; align-items: center;">
            <span class="control-label-text">Intensity</span>
            <span class="control-value" data-lut-value="intensity">${(intensityValue * 100).toFixed(0)}%</span>
          </div>
          <input 
            type="range" 
            class="node-slider lut-intensity-slider" 
            data-node-id="${escapeHtml(node.id)}"
            min="0" max="1" step="0.01" value="${intensityValue}"
            style="width: 100%;"
          />
        </label>
      </div>
    `;
    };

    return {
        id: 'lut-loader',
        typeIds: ['lutLoader'],
        render: (node) => ({
            afterPortsHtml: buildControls(node),
            afterRender: async (element) => {
                let processor = processors.get(node.id);
                if (!processor) {
                    processor = createProcessor();
                    processors.set(node.id, processor);
                }

                const settings = node.settings as LUTLoaderNodeSettings;
                const sourceMediaUrl = getSourceMedia(node);

                const selectEl = element.querySelector<HTMLSelectElement>('.lut-lib-select');
                const prevBtn = element.querySelector<HTMLButtonElement>('.lut-lib-prev');
                const nextBtn = element.querySelector<HTMLButtonElement>('.lut-lib-next');

                const applyLutEntry = async (entryId: string | null) => {
                    if (!entryId) return;
                    const library = state.lutLibrary;
                    const entry = library.find(e => e.id === entryId);
                    if (!entry) return;
                    try {
                        const fileContent = await window.nodevision.readTextFile({ filePath: entry.path });
                        if (!fileContent?.ok || !fileContent.content) {
                            alert('Failed to read LUT file');
                            return;
                        }
                        const lut = parseCubeLUT(fileContent.content);
                        if (!validateImportedLUT(lut)) {
                            alert('Invalid LUT file');
                            return;
                        }
                        loadedLUTs.set(node.id, lut);
                        const targetNode = state.nodes.find(n => n.id === node.id);
                        if (targetNode) {
                            const newSettings: LUTLoaderNodeSettings = {
                                kind: 'lutLoader',
                                lutFilePath: entry.path,
                                intensity: settings?.intensity ?? 1.0
                            };
                            (newSettings as any).lutSource = 'library';
                            targetNode.settings = newSettings;
                            node.settings = newSettings;
                        }
                        // 適用
                        const media = getSourceMedia(node);
                        if (processor && media) {
                            if (media.kind === 'video') {
                                const loopState = (videoProcessors.get(node.id) as any)?.__loopState;
                                if (loopState) {
                                    loopState.currentLut = lut;
                                }
                                // ensure intensity up to date
                                processor.setIntensity(settings?.intensity ?? 1.0);
                            } else {
                                processor.loadLUT(lut);
                                processor.setIntensity(settings?.intensity ?? 1.0);
                                processor.renderWithCurrentTexture();
                                propagateToMediaPreview(node, processor);
                            }
                        }
                        // UI更新
                        const nameLabel = element.querySelector('.lut-file-name');
                        if (nameLabel) {
                            nameLabel.textContent = entry.filename;
                            nameLabel.setAttribute('title', entry.filename);
                            nameLabel.setAttribute('style', nameLabel.getAttribute('style')?.replace('#9aa0a6', '#e8eaed') ?? '');
                        }
                        setActiveLabel(entry.filename, true);
                        if (slider) {
                            slider.disabled = false;
                            slider.value = String(settings?.intensity ?? 1.0);
                        }
                        if (sliderValue) {
                            sliderValue.textContent = `${((settings?.intensity ?? 1.0) * 100).toFixed(0)}%`;
                        }
                    } catch (error) {
                        console.error('[LUTLoader] apply from library failed', error);
                        alert('Failed to apply LUT');
                    }
                };

                const updateNavState = () => {
                    const library = state.lutLibrary;
                    const idx =
                        selectEl && library.length
                            ? library.findIndex(e => e.id === selectEl.value)
                            : -1;
                    const fallbackIdx = library.findIndex(e => e.path === settings?.lutFilePath);
                    const resolvedIdx = idx >= 0 ? idx : fallbackIdx >= 0 ? fallbackIdx : -1;
                    if (selectEl) {
                        selectEl.disabled = library.length === 0;
                        if (resolvedIdx >= 0 && library[resolvedIdx]) {
                            selectEl.value = library[resolvedIdx].id;
                        } else {
                            selectEl.value = '';
                        }
                    }
                    if (prevBtn) prevBtn.disabled = resolvedIdx <= 0;
                    if (nextBtn) nextBtn.disabled = resolvedIdx === -1 || resolvedIdx >= library.length - 1;
                };

                if (selectEl) {
                    updateNavState();
                    selectEl.addEventListener('change', () => {
                        const val = selectEl.value || null;
                        if (!val) {
                            void clearAppliedLut();
                            updateNavState();
                            return;
                        }
                        void applyLutEntry(val);
                        updateNavState();
                    });
                }
                const stepLibrary = (delta: number) => {
                    const library = state.lutLibrary;
                    if (!library.length) return;
                    const currentIdx =
                        library.findIndex(entry => entry.id === (selectEl?.value ?? '')) >= 0
                            ? library.findIndex(entry => entry.id === (selectEl?.value ?? ''))
                            : library.findIndex(entry => entry.path === settings?.lutFilePath);
                    const baseIdx = currentIdx >= 0 ? currentIdx : 0;
                    const nextIdx = baseIdx + delta;
                    if (nextIdx < 0 || nextIdx >= library.length) return;
                    const nextEntry = library[nextIdx];
                    if (selectEl) selectEl.value = nextEntry.id;
                    void applyLutEntry(nextEntry.id);
                    updateNavState();
                };
                prevBtn?.addEventListener('click', () => stepLibrary(-1));
                nextBtn?.addEventListener('click', () => stepLibrary(1));

                // LUT読み込みボタン
                const loadBtn = element.querySelector('.load-lut-btn');
                const activeLabel = element.querySelector<HTMLElement>('.lut-active-label');
                const slider = element.querySelector<HTMLInputElement>('.lut-intensity-slider');
                const sliderValue = element.querySelector<HTMLElement>('.control-value[data-lut-value="intensity"]');

                const setActiveLabel = (text: string, fromLibrary: boolean): void => {
                    if (!activeLabel) return;
                    activeLabel.textContent = fromLibrary ? `現在適用中: ${text}（ライブラリ）` : `現在適用中: ${text}（ローカル）`;
                };

                const clearAppliedLut = async (): Promise<void> => {
                    const targetNode = state.nodes.find(n => n.id === node.id);
                    if (targetNode) {
                        const current = targetNode.settings as LUTLoaderNodeSettings;
                        targetNode.settings = { ...current, lutFilePath: undefined };
                        node.settings = targetNode.settings;
                    }
                    loadedLUTs.delete(node.id);

                    const nameLabel = element.querySelector('.lut-file-name');
                    if (nameLabel) {
                        nameLabel.textContent = 'No LUT loaded';
                        nameLabel.setAttribute('title', 'No LUT loaded');
                        nameLabel.setAttribute('style', nameLabel.getAttribute('style')?.replace('#e8eaed', '#9aa0a6') ?? '');
                    }
                    setActiveLabel('現在適用中: なし', false);
                    if (slider) {
                        slider.disabled = false;
                        slider.value = '0';
                    }
                    if (sliderValue) sliderValue.textContent = '0%';

                    const media = getSourceMedia(node);
                    if (processor && media) {
                        if (media.kind === 'image') {
                            let imageUrl = media.url;
                            if (imageUrl.startsWith('file://')) {
                                const res = await window.nodevision.loadImageAsDataURL({ filePath: imageUrl });
                                if (res.ok && res.dataURL) {
                                    imageUrl = res.dataURL;
                                }
                            }
                            await processor.loadImage(imageUrl);
                            const identity = buildIdentityLut();
                            processor.loadLUT(identity);
                            processor.setIntensity(0);
                            processor.renderWithCurrentTexture();
                            propagateToMediaPreview(node, processor);
                        } else {
                            const video = videoProcessors.get(node.id);
                            if (video) {
                                processor.loadVideoFrame(video);
                                const identity = buildIdentityLut();
                                processor.loadLUT(identity);
                                processor.setIntensity(0);
                                processor.renderWithCurrentTexture();
                                propagateToMediaPreview(node, processor);
                                const loopState = (video as any).__loopState;
                                if (loopState) {
                                    loopState.currentLut = identity;
                                    loopState.currentIntensity = 0;
                                }
                            }
                        }
                    }
                    context.renderNodes();
                };

                // 初期表示
                if (settings?.lutFilePath) {
                    const isLibrary = (settings as any).lutSource === 'library';
                    setActiveLabel(settings.lutFilePath.split('/').pop() ?? 'LUT file', isLibrary);
                    if (slider) slider.disabled = false;
                    if (sliderValue) sliderValue.textContent = `${((settings.intensity ?? 1) * 100).toFixed(0)}%`;
                } else {
                    setActiveLabel('現在適用中: なし', false);
                    if (slider) {
                        slider.disabled = false;
                        slider.value = String(settings.intensity ?? 1);
                    }
                    if (sliderValue) sliderValue.textContent = `${((settings.intensity ?? 1) * 100).toFixed(0)}%`;
                }
                if (loadBtn) {
                    loadBtn.addEventListener('click', async () => {
                        // ファイル選択ダイアログを開く
                        const result = await window.nodevision.openFileDialog({
                            filters: [
                                { name: 'LUT Files', extensions: ['cube'] },
                                { name: 'All Files', extensions: ['*'] },
                            ],
                        });

                        if (result.ok && result.filePaths && result.filePaths.length > 0) {
                            const lutPath = result.filePaths[0];

                            try {
                                // ファイルを読み込む
                                const fileContent = await window.nodevision.readTextFile({
                                    filePath: lutPath,
                                });

                                if (fileContent.ok && fileContent.content) {
                                    // パースしてLUTを生成
                                    const lut = parseCubeLUT(fileContent.content);

                                    if (validateImportedLUT(lut)) {
                                        // 設定を更新
                                        const targetNode = state.nodes.find((n) => n.id === node.id);
                                        if (targetNode) {
                                            const newSettings: LUTLoaderNodeSettings = {
                                                kind: 'lutLoader',
                                                lutFilePath: lutPath,
                                                intensity: settings?.intensity ?? 1.0,
                                            };
                                            (newSettings as any).lutSource = 'local';
                                            targetNode.settings = newSettings;
                                            node.settings = newSettings;

                                            // LUTをキャッシュ
                                            loadedLUTs.set(node.id, lut);

                                            // UIを更新
                                            const filename = lutPath.split('/').pop() || 'LUT file';
                                            const nameLabel = element.querySelector('.lut-file-name');
                                            if (nameLabel) {
                                                nameLabel.textContent = filename;
                                                nameLabel.setAttribute('title', filename);
                                                nameLabel.setAttribute('style', nameLabel.getAttribute('style')?.replace('#9aa0a6', '#e8eaed') ?? '');
                                            }
                                            setActiveLabel(filename, true);

                                        if (slider) {
                                            slider.disabled = false;
                                            slider.value = String(settings?.intensity ?? 1.0);
                                        }
                                        if (sliderValue) {
                                            sliderValue.textContent = `${((settings?.intensity ?? 1.0) * 100).toFixed(0)}%`;
                                        }

                                        // プレビューへ適用
                                        const media = getSourceMedia(node);
                                        if (processor && media) {
                                            if (media.kind === 'image') {
                                                processor.loadLUT(lut);
                                                processor.setIntensity(settings?.intensity ?? 1.0);
                                                processor.renderWithCurrentTexture();
                                                propagateToMediaPreview(node, processor);
                                            } else if (media.kind === 'video') {
                                                processor.setIntensity(settings?.intensity ?? 1.0);
                                                const loopState = (videoProcessors.get(node.id) as any)?.__loopState;
                                                if (loopState) {
                                                    loopState.currentLut = lut;
                                                    loopState.currentIntensity = settings?.intensity ?? 1.0;
                                                }
                                            }
                                        }
                                        context.renderNodes();
                                    }
                                    } else {
                                        alert('Invalid LUT file');
                                    }
                                } else {
                                    alert('Failed to read LUT file');
                                }
                            } catch (error) {
                                console.error('[LUTLoader] Failed to load LUT:', error);
                                alert(`Failed to load LUT: ${error}`);
                            }
                        }
                    });
                }

                // Intensityスライダー
                const intensitySlider = element.querySelector('.lut-intensity-slider');
                if (intensitySlider) {
                    intensitySlider.addEventListener('input', (e) => {
                        const target = e.target as HTMLInputElement;
                        const val = parseFloat(target.value);

                        // 表示を更新
                        const display = element.querySelector('.control-value[data-lut-value="intensity"]');
                        if (display) {
                            display.textContent = `${(val * 100).toFixed(0)}%`;
                        }

                        // 設定を更新
                        const targetNode = state.nodes.find((n) => n.id === node.id);
                        if (targetNode) {
                            const currentSettings = targetNode.settings as LUTLoaderNodeSettings;
                            const newSettings: LUTLoaderNodeSettings = {
                                ...currentSettings,
                                intensity: val,
                            };
                            targetNode.settings = newSettings;
                            node.settings = newSettings;

                            // プレビュー更新
                            const lut = loadedLUTs.get(node.id);
                            if (lut && processor && sourceMediaUrl) {
                                // 動画再生中ならループ内で自動更新されるので、ここでは設定値の更新のみで良い
                                // 画像の場合は明示的に再描画
                                if (sourceMediaUrl.kind === 'image') {
                                    processor.setIntensity(val);
                                    processor.loadLUT(lut);
                                    processor.renderWithCurrentTexture();
                                    propagateToMediaPreview(node, processor);
                                }
                                // 動画の場合はループ内で settings.intensity を参照するようにしているので、
                                // node.settings が更新されていればOK
                            }
                        }
                    });
                }

                // 初期化処理
                if (settings?.lutFilePath && sourceMediaUrl) {
                    try {
                        // LUTがキャッシュにない場合は読み込む
                        let lut = loadedLUTs.get(node.id);
                        if (!lut) {
                            const fileContent = await window.nodevision.readTextFile({
                                filePath: settings.lutFilePath,
                            });

                            if (fileContent.ok && fileContent.content) {
                                lut = parseCubeLUT(fileContent.content);
                                if (lut && validateImportedLUT(lut)) {
                                    loadedLUTs.set(node.id, lut);
                                }
                            }
                        }

                        if (lut) {
                            const { url: mediaUrl, kind } = sourceMediaUrl;

                            if (kind === 'video') {
                                // 動画の場合
                                const lastSource = lastSourceByNode.get(node.id);
                                const isNewSource = lastSource !== mediaUrl;

                                if (isNewSource || !videoProcessors.has(node.id)) {
                                    // 以前の動画リソースをクリーンアップ
                                    const oldCleanup = videoCleanup.get(node.id);
                                    if (oldCleanup) oldCleanup();

                                    // 新しい動画要素を作成
                                    const video = document.createElement('video');
                                    video.crossOrigin = 'anonymous';
                                    video.muted = true;
                                    video.loop = true;
                                    video.playsInline = true;
                                    video.src = mediaUrl;

                                    // メタデータ読み込み完了を待つ
                                    await new Promise<void>((resolve) => {
                                        video.onloadedmetadata = () => resolve();
                                    });

                                    video.play().catch(err => console.error('[LUTLoader] Video play failed', err));
                                    videoProcessors.set(node.id, video);
                                    lastSourceByNode.set(node.id, mediaUrl);

                                    // Mutable state for the loop to access current settings
                                    const loopState = {
                                        currentLut: lut,
                                        currentIntensity: settings.intensity
                                    };
                                    // Store loop state to update it on subsequent renders
                                    (video as any).__loopState = loopState;

                                    // 更新ループ
                                    let animationFrameId: number;
                                    const updateLoop = () => {
                                        if (video.paused || video.ended) {
                                            animationFrameId = requestAnimationFrame(updateLoop);
                                            return;
                                        }

                                        if (processor && loopState.currentLut) {
                                            processor.loadVideoFrame(video);
                                            processor.setIntensity(loopState.currentIntensity);
                                            processor.loadLUT(loopState.currentLut);
                                            processor.renderWithCurrentTexture();
                                            propagateToMediaPreview(node, processor);
                                        }

                                        animationFrameId = requestAnimationFrame(updateLoop);
                                    };
                                    updateLoop();

                                    // クリーンアップ関数を登録
                                    videoCleanup.set(node.id, () => {
                                        cancelAnimationFrame(animationFrameId);
                                        video.pause();
                                        video.src = '';
                                        video.load();
                                        videoProcessors.delete(node.id);
                                        delete (video as any).__loopState;
                                    });
                                } else {
                                    // 既存の動画ループのステートを更新する
                                    const video = videoProcessors.get(node.id);
                                    if (video && (video as any).__loopState) {
                                        const loopState = (video as any).__loopState;
                                        loopState.currentLut = lut;
                                        loopState.currentIntensity = settings.intensity;
                                    }
                                }
                            } else {
                                // 画像の場合：動画リソースがあればクリーンアップ
                                const oldCleanup = videoCleanup.get(node.id);
                                if (oldCleanup) {
                                    oldCleanup();
                                    videoCleanup.delete(node.id);
                                    lastSourceByNode.delete(node.id); // ソース種別が変わったのでリセット
                                }

                                // 画像読み込み処理
                                let imageUrl = mediaUrl;
                                if (mediaUrl.startsWith('file://')) {
                                    const result = await window.nodevision.loadImageAsDataURL({
                                        filePath: mediaUrl,
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

                                // LUTを適用
                                processor.loadLUT(lut);
                                processor.setIntensity(settings.intensity);
                                processor.renderWithCurrentTexture();
                                propagateToMediaPreview(node, processor);
                            }
                        }
                    } catch (error) {
                        console.error('[LUTLoader] Preview setup failed', error);
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
            },
        }),
    };
};
