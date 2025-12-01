import type { RendererNode } from '../types';
import type { NodeRendererContext, NodeRendererModule, NodeRendererView } from './types';
import { getMediaPreviewReservedHeight } from './preview-layout';
import { calculatePreviewSize } from './preview-size';
import { ensureTrimSettings } from './trim-shared';

const DEBUG_MEDIA_PREVIEW = false;

const MEDIA_PREVIEW_NODE_TYPE = 'mediaPreview';

const resolveNodeTitle = (node: RendererNode | undefined, context: NodeRendererContext): string => {
  if (!node) {
    return context.t('nodes.mediaPreview.disconnected');
  }
  const key = `nodeTemplate.${node.typeId}.title`;
  const translated = context.t(key);
  if (translated && translated !== key) {
    return translated;
  }
  return node.title ?? node.typeId;
};

const buildCropTransform = (preview: ReturnType<NodeRendererContext['getMediaPreview']>): { style: string; hasCrop: boolean } => {
  if (preview?.isCroppedOutput) {
    return { style: '', hasCrop: false };
  }
  const region = preview?.cropRegion;
  if (!region || region.width == null || region.height == null) {
    return { style: '', hasCrop: false };
  }
  const clamp01 = (value: number, fallback: number): number => {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(1, Math.max(0, value));
  };
  const width = region.width > 0 ? region.width : 1;
  const height = region.height > 0 ? region.height : 1;
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return { style: '', hasCrop: false };
  }
  const normalizedWidth = width > 1 ? 1 : clamp01(width, 1);
  const normalizedHeight = height > 1 ? 1 : clamp01(height, 1);
  const x = region.width > 1 ? 0 : clamp01(region.x ?? 0, 0);
  const y = region.height > 1 ? 0 : clamp01(region.y ?? 0, 0);
  const scaleX = 1 / Math.max(normalizedWidth, 0.001);
  const scaleY = 1 / Math.max(normalizedHeight, 0.001);
  const flipX = preview?.cropFlipHorizontal ? -1 : 1;
  const flipY = preview?.cropFlipVertical ? -1 : 1;
  const rotation = preview?.cropRotationDeg ?? 0;
  const translate = `translate(-${(x * 100).toFixed(4)}%, -${(y * 100).toFixed(4)}%)`;
  const scale = `scale(${(scaleX * flipX).toFixed(4)}, ${(scaleY * flipY).toFixed(4)})`;
  const rotate = rotation ? ` rotate(${rotation}deg)` : '';
  const style = `transform-origin: top left; transform: ${translate} ${scale}${rotate};`;
  return { style, hasCrop: true };
};

export const createMediaPreviewNodeRenderer = (context: NodeRendererContext): NodeRendererModule => {
  const {
    state,
    t,
    escapeHtml,
    getNodeChromePadding,
    getPreviewWidthForNodeWidth,
    getPreviewAspectRatio,
    minPreviewHeight,
    minPreviewWidth,
    getMediaPreview
  } = context;

  const buildTrimHints = (
    sourceNode: RendererNode | undefined
  ): { badge: string; messages: string[] } | null => {
    if (!sourceNode || sourceNode.typeId !== 'trim') {
      return null;
    }
    const settings = ensureTrimSettings(sourceNode);
    const region = settings.region ?? { x: 0, y: 0, width: 1, height: 1 };
    const hasImageEdit = region.x !== 0 || region.y !== 0 || region.width !== 1 || region.height !== 1;
    if (!hasImageEdit) {
      return null;
    }
    const messages: string[] = [];
    if (hasImageEdit) {
      messages.push(
        t('nodes.mediaPreview.trimmedCrop', {
          width: Math.round(region.width * 100),
          height: Math.round(region.height * 100)
        })
      );
    }
    return { badge: t('nodes.mediaPreview.trimmedBadge'), messages };
  };

  const buildPreviewSection = (node: RendererNode): string => {
    const connection = state.connections.find(
      conn => conn.toNodeId === node.id && conn.toPortId === 'source'
    );
    const sourceNodeId = connection?.fromNodeId ?? null;
    const sourceNode = sourceNodeId ? state.nodes.find(entry => entry.id === sourceNodeId) : undefined;
    let preview = sourceNodeId ? getMediaPreview(sourceNodeId) : undefined;

    // Batch Cropノードなど、outputsプロパティを持つノードの場合
    if (preview?.outputs && connection?.fromPortId) {
      // 該当する出力ポートのプレビューを取得
      if (preview.outputs[connection.fromPortId]) {
        preview = preview.outputs[connection.fromPortId];
      } else {
        // 該当する出力ポートにプレビューがない場合は、undefinedにする
        // （メインプレビューを使用しない）
        preview = undefined;
      }
    }
    const nodeSize = state.nodeSizes.get(node.id) ?? { width: node.width ?? 0, height: node.height ?? 0 };
    const chrome = getNodeChromePadding(node.id);
    const nodeWidth = nodeSize.width || node.width || 0;
    const nodeHeight = nodeSize.height || node.height || 0;
    const reservedHeight = getMediaPreviewReservedHeight(Boolean(preview));
    // canvas プレビューがある場合（WebGL動画など）
    const canvasPreview = sourceNodeId ? state.canvasPreviews.get(sourceNodeId) : undefined;
    const widthLimit = getPreviewWidthForNodeWidth(Math.max(nodeWidth, 0));

    // Canvas preview の場合、最低600pxを確保しつつ、ノードサイズとcanvasサイズに応じて調整
    const effectiveWidthLimit = canvasPreview
      ? Math.min(canvasPreview.width, Math.max(600, nodeWidth - 80))
      : widthLimit;

    const ratio = getPreviewAspectRatio(sourceNodeId ?? node.id);

    // Canvas preview の場合、chrome paddingを最小限にしてプレビューを大きく表示
    const effectiveChrome = canvasPreview ? 40 : chrome; // canvas の場合は40pxの余白のみ

    const previewBox = calculatePreviewSize({
      nodeWidth,
      nodeHeight,
      chromePadding: effectiveChrome,
      reservedHeight,
      widthLimit: effectiveWidthLimit,
      minHeight: minPreviewHeight,
      minWidth: minPreviewWidth,
      aspectRatio: ratio,
      // canvasPreviewがある場合は、そのサイズを優先（古いメタデータの影響を避けるため）
      originalWidth: canvasPreview?.width ?? preview?.width ?? null,
      originalHeight: canvasPreview?.height ?? preview?.height ?? null,
      minimumNodePortion: 0.95
    });

  if (DEBUG_MEDIA_PREVIEW) {
    console.log('[MediaPreview] Node size:', nodeWidth, 'x', nodeHeight);
    console.log(
      '[MediaPreview] widthLimit:',
      widthLimit,
      '=>',
      effectiveWidthLimit,
      'chromePadding:',
      chrome,
      '=>',
      effectiveChrome,
      'reservedHeight:',
      reservedHeight
    );
    console.log('[MediaPreview] Canvas dimensions:', canvasPreview?.width, 'x', canvasPreview?.height);
    console.log('[MediaPreview] Calculated previewBox:', previewBox);
  }

    const inlineStyle = ` style="--preview-width:${previewBox.width}px;--preview-height:${previewBox.height}px"`;
    const sourceTitle = resolveNodeTitle(sourceNode, context);
    const fileLabel = escapeHtml(preview?.name ?? sourceTitle);
    const trimHints = buildTrimHints(sourceNode);
    const trimHintHtml = trimHints
      ? `
        <div class="node-media-hints">
          <p class="node-media-hint accent">${escapeHtml(trimHints.badge)}</p>
          ${trimHints.messages.map(message => `<p class="node-media-hint">${escapeHtml(message)}</p>`).join('')}
        </div>
      `
      : '';
    const crop = buildCropTransform(preview);
    const toolbar = `
      <div class="node-media-toolbar">
        <span class="node-media-filename" title="${fileLabel}">${fileLabel}</span>
      </div>
      <p class="node-media-aspect">${escapeHtml(t('nodes.mediaPreview.sourceLabel', { title: sourceTitle }))}</p>
      ${trimHintHtml}
    `;
    const aspectText = (preview?.width && preview?.height)
      ? `${preview.width} × ${preview.height}`
      : (canvasPreview ? `${canvasPreview.width} × ${canvasPreview.height}` : t('nodes.mediaPreview.metaUnknown'));
    const aspectHtml = `<p class="node-media-aspect">${escapeHtml(aspectText)}</p>`;

    if (!preview && !canvasPreview) {
      const messageKey = sourceNodeId ? 'nodes.mediaPreview.waiting' : 'nodes.mediaPreview.noInput';
      return `<div class="node-media" data-node-id="${escapeHtml(node.id)}"${inlineStyle}>
        ${toolbar}
        <p class="node-media-empty">${escapeHtml(t(messageKey))}</p>
        ${aspectHtml}
      </div>`;
    }

    if (canvasPreview) {
      // Canvas preview の場合は、固定サイズ計算（calculatePreviewSize）を使用せず、
      // 親コンテナ（.node-media-frame）に合わせて100%のサイズで表示する。
      // これにより、ノードのリサイズに合わせてプレビューも自動的に拡大縮小される。
      // アスペクト比は canvas の object-fit: contain で維持される。

      // コンテナ自体にも width: 100%; height: 100% を適用して、frameいっぱいに広げる
      // CSS変数を100%に上書きして、親コンテナのサイズに追従させる
      // さらに、display: flex; flex-direction: column; を指定して、
      // 内部の .node-media-frame (flex: 1) が縦方向に広がるようにする
      const fluidInlineStyle = ` style="--preview-width: 100%; --preview-height: 100%; width: 100%; height: 100%; display: flex; flex-direction: column; flex: 1;"`;

      // コンテナ自体にも width: 100%; height: 100% を適用して、frameいっぱいに広げる
      // position: relative を追加して、内部の canvas を absolute で配置できるようにする
      const fluidStyle = 'width: 100%; height: 100%; position: relative; display: flex; align-items: center; justify-content: center; overflow: hidden;';

      return `<div class="node-media" data-node-id="${escapeHtml(node.id)}"${fluidInlineStyle}>
        ${toolbar}
        <div class="node-media-frame" style="flex: 1; min-height: 0; display: flex;">
          <div class="node-media-preview" data-kind="video" data-canvas-source="${escapeHtml(sourceNodeId)}" style="${fluidStyle}">
            <!-- canvas will be injected in afterRender -->
          </div>
        </div>
        ${aspectHtml}
      </div>`;
    }

    const kind = preview!.kind === 'video' ? 'video' : 'image';
    const mediaTag =
      kind === 'video'
        ? `<video src="${preview!.url}" controls playsinline preload="metadata" muted style="${crop.style}"></video>`
        : `<img src="${preview!.url}" alt="${escapeHtml(preview!.name)}" style="${crop.style}" />`;

    return `<div class="node-media" data-node-id="${escapeHtml(node.id)}"${inlineStyle}>
      ${toolbar}
      <div class="node-media-frame${crop.hasCrop ? ' is-cropped' : ''}">
        <div class="node-media-preview" data-kind="${kind}">
          ${mediaTag}
        </div>
      </div>
      ${aspectHtml}
    </div>`;
  };

  const render = (node: RendererNode): NodeRendererView => ({
    afterPortsHtml: buildPreviewSection(node),
    afterRender: async (element: HTMLElement) => {
      // canvas プレビューの挿入
      const canvasPlaceholder = element.querySelector('[data-canvas-source]');

      if (canvasPlaceholder) {
        const sourceNodeId = canvasPlaceholder.getAttribute('data-canvas-source');
        // const canvasStyle = canvasPlaceholder.getAttribute('data-canvas-style'); // Unused

        if (DEBUG_MEDIA_PREVIEW) {
          console.log('[MediaPreview] Found placeholder for source:', sourceNodeId);
        }

        if (sourceNodeId) {
          const canvas = state.canvasPreviews.get(sourceNodeId);
          if (DEBUG_MEDIA_PREVIEW) {
            console.log('[MediaPreview] Canvas found in state:', !!canvas);
          }

          if (canvas) {
            if (DEBUG_MEDIA_PREVIEW) {
              console.log('[MediaPreview] Canvas dims:', canvas.width, 'x', canvas.height);
              console.log('[MediaPreview] Canvas style before:', canvas.getAttribute('style'));
            }

            // Canvasが見つかった場合、スタイルを常に適用する（DOMに既に存在する場合も含む）
            // position: absolute で強制的に広げる
            canvas.style.setProperty('position', 'absolute', 'important');
            canvas.style.setProperty('top', '0', 'important');
            canvas.style.setProperty('left', '0', 'important');
            canvas.style.setProperty('width', '100%', 'important');
            canvas.style.setProperty('height', '100%', 'important');
            canvas.style.setProperty('object-fit', 'contain', 'important');
            canvas.style.setProperty('display', 'block', 'important');

            if (!canvasPlaceholder.contains(canvas)) {
              // 既存のコンテンツをクリア
              canvasPlaceholder.innerHTML = '';
              canvasPlaceholder.appendChild(canvas);
              if (DEBUG_MEDIA_PREVIEW) {
                console.log('[MediaPreview] Canvas inserted. Dimensions:', canvas.width, 'x', canvas.height);
              }
            } else {
              if (DEBUG_MEDIA_PREVIEW) {
                console.log('[MediaPreview] Canvas already in placeholder, styles updated.');
              }
            }
          }
        }
      } else {
        // console.log('[MediaPreview] No canvas placeholder found');
      }
    }
  });

  return {
    id: 'media-preview',
    typeIds: [MEDIA_PREVIEW_NODE_TYPE],
    render
  };
};
