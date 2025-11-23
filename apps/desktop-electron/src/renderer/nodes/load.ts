import type { RendererNode, NodevisionApi } from '../types';
import type { NodeRendererContext, NodeRendererModule, NodeRendererView } from './types';
import { getLoadNodeReservedHeight } from './preview-layout';
import { calculatePreviewSize } from './preview-size';
import { DEFAULT_NODE_HEIGHT } from '../state';

export type LoadNodeKind = 'image' | 'video' | 'any';

const LOAD_NODE_TYPES = ['loadImage', 'loadVideo', 'loadMedia'];
const IMAGE_LOAD_TYPES = new Set(['loadImage', 'loadMedia']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'flv']);

const getLoadNodeKindFromType = (typeId: string): LoadNodeKind => {
  if (typeId === 'loadVideo') {
    return 'video';
  }
  if (IMAGE_LOAD_TYPES.has(typeId)) {
    return 'image';
  }
  return 'any';
};

const inferMediaKind = (file: File): 'image' | 'video' => {
  if (file.type?.startsWith('video/')) {
    return 'video';
  }
  if (file.type?.startsWith('image/')) {
    return 'image';
  }
  const ext = file.name?.split('.').pop()?.toLowerCase() ?? '';
  if (VIDEO_EXTENSIONS.has(ext)) {
    return 'video';
  }
  return 'image';
};

const toFileUrl = (path: string): string => {
  const normalized = path.replace(/\\/g, '/');
  return `file://${encodeURI(normalized)}`;
};

let measurementContainer: HTMLElement | null = null;
const getMeasurementContainer = (): HTMLElement | null => {
  if (!document?.body) {
    return null;
  }
  if (measurementContainer && document.body.contains(measurementContainer)) {
    return measurementContainer;
  }
  measurementContainer = document.createElement('div');
  measurementContainer.id = 'nodevision-media-measurements';
  Object.assign(measurementContainer.style, {
    position: 'fixed',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    pointerEvents: 'none',
    opacity: '0',
    zIndex: '-1'
  });
  document.body.appendChild(measurementContainer);
  return measurementContainer;
};

export const createLoadNodeRenderer = (context: NodeRendererContext): NodeRendererModule => {
  const {
    state,
    t,
    escapeHtml,
    showToast,
    renderNodes,
    cleanupMediaPreview,
    updateMediaPreviewDimensions,
    getNodeChromePadding,
    getPreviewWidthForNodeWidth,
    getPreviewAspectRatio,
    minPreviewHeight,
    minPreviewWidth
  } = context;

  const getLoadNodeKindById = (nodeId: string): LoadNodeKind => {
    const node = state.nodes.find(item => item.id === nodeId);
    return node ? getLoadNodeKindFromType(node.typeId) : 'any';
  };

  const adjustConnectedPreviewNodes = (sourceNodeId: string): void => {
    // Find Media Preview nodes connected to this source
    const connectedPreviews = state.connections
      .filter(conn => conn.fromNodeId === sourceNodeId && conn.toPortId === 'source')
      .map(conn => conn.toNodeId)
      .filter(nodeId => {
        const node = state.nodes.find(n => n.id === nodeId);
        return node?.typeId === 'mediaPreview';
      });

    // Adjust their heights if still at default
    connectedPreviews.forEach(previewNodeId => {
      const currentSize = state.nodeSizes.get(previewNodeId);
      if (currentSize && currentSize.height === DEFAULT_NODE_HEIGHT) {
        state.nodeSizes.set(previewNodeId, { ...currentSize, height: 600 });
      }
    });
  };

  const measureImageDimensions = (nodeId: string, file: File, url: string): void => {
    if (typeof window.createImageBitmap === 'function') {
      void window
        .createImageBitmap(file)
        .then(bitmap => {
          updateMediaPreviewDimensions(nodeId, bitmap.width, bitmap.height);
          // Adjust node height for portrait media
          if (bitmap.height > bitmap.width) {
            const currentSize = state.nodeSizes.get(nodeId);
            if (currentSize && currentSize.height === DEFAULT_NODE_HEIGHT) {
              state.nodeSizes.set(nodeId, { ...currentSize, height: 600 });
              adjustConnectedPreviewNodes(nodeId);
              renderNodes();
            }
          }
          if (typeof bitmap.close === 'function') {
            bitmap.close();
          }
        })
        .catch(() => {
          const img = new Image();
          img.decoding = 'async';
          img.onload = () => {
            const width = img.naturalWidth || img.width;
            const height = img.naturalHeight || img.height;
            updateMediaPreviewDimensions(nodeId, width, height);
            // Adjust node height for portrait media
            if (height > width) {
              const currentSize = state.nodeSizes.get(nodeId);
              if (currentSize && currentSize.height === DEFAULT_NODE_HEIGHT) {
                state.nodeSizes.set(nodeId, { ...currentSize, height: 600 });
                adjustConnectedPreviewNodes(nodeId);
                renderNodes();
              }
            }
            img.src = '';
          };
          img.onerror = () => {
            updateMediaPreviewDimensions(nodeId, null, null);
          };
          img.src = url;
        });
      return;
    }
    const fallbackImg = new Image();
    fallbackImg.decoding = 'async';
    fallbackImg.onload = () => {
      const width = fallbackImg.naturalWidth || fallbackImg.width;
      const height = fallbackImg.naturalHeight || fallbackImg.height;
      updateMediaPreviewDimensions(nodeId, width, height);
      // Adjust node height for portrait media
      if (height > width) {
        const currentSize = state.nodeSizes.get(nodeId);
        if (currentSize && currentSize.height === DEFAULT_NODE_HEIGHT) {
          state.nodeSizes.set(nodeId, { ...currentSize, height: 600 });
          adjustConnectedPreviewNodes(nodeId);
          renderNodes();
        }
      }
      fallbackImg.src = '';
    };
    fallbackImg.onerror = () => {
      updateMediaPreviewDimensions(nodeId, null, null);
    };
    fallbackImg.src = url;
  };

  const measureVideoDimensions = (nodeId: string, url: string): void => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.controls = false;
    video.setAttribute('aria-hidden', 'true');
    Object.assign(video.style, {
      position: 'fixed',
      left: '-9999px',
      top: '-9999px',
      width: '1px',
      height: '1px',
      pointerEvents: 'none'
    });
    const container = getMeasurementContainer();
    if (container) {
      container.appendChild(video);
    }

    const cleanup = (warn?: string): void => {
      video.onloadedmetadata = null;
      video.onerror = null;
      try {
        video.pause();
      } catch (error) {
        console.warn('[NodeVision] video pause failed', error);
      }
      video.removeAttribute('src');
      try {
        video.load();
      } catch (error) {
        console.warn('[NodeVision] video load reset failed', error);
      }
      if (video.parentNode) {
        video.parentNode.removeChild(video);
      }
      if (warn) {
        console.warn('[NodeVision]', warn);
      }
    };

    video.onloadedmetadata = () => {
      const durationMs = Number.isFinite(video.duration) && video.duration > 0 ? Math.round(video.duration * 1000) : null;
      const width = video.videoWidth || null;
      const height = video.videoHeight || null;
      updateMediaPreviewDimensions(nodeId, width, height, {
        durationMs
      });
      // Adjust node height for portrait media
      if (width && height && height > width) {
        const currentSize = state.nodeSizes.get(nodeId);
        if (currentSize && currentSize.height === DEFAULT_NODE_HEIGHT) {
          state.nodeSizes.set(nodeId, { ...currentSize, height: 600 });
          adjustConnectedPreviewNodes(nodeId);
          renderNodes();
        }
      }
      cleanup();
    };

    video.onerror = () => {
      updateMediaPreviewDimensions(nodeId, null, null, { durationMs: null });
      cleanup('Failed to read video metadata for preview');
    };

    try {
      video.src = url;
      video.load();
    } catch (error) {
      cleanup('Unable to schedule video metadata probe');
    }
  };

  const ingestMediaFile = (nodeId: string, file: File): void => {
    const mode = getLoadNodeKindById(nodeId);
    const kind = inferMediaKind(file);
    if (mode === 'image' && kind !== 'image') {
      showToast(t('toast.mediaWrongTypeImage'), 'error');
      return;
    }
    if (mode === 'video' && kind !== 'video') {
      showToast(t('toast.mediaWrongTypeVideo'), 'error');
      return;
    }
    const fallbackType = file.name?.split('.').pop()?.toUpperCase() ?? '';
    const resolvedType = file.type || fallbackType;

    const saveAndPreview = async () => {
      cleanupMediaPreview(nodeId);
      let storedPath: string | null = null;
      let storedUrl: string | null = null;
      const bridge = (window as unknown as { nodevision?: NodevisionApi }).nodevision;
      if (typeof bridge?.storeMediaFile === 'function') {
        try {
          const buffer = await file.arrayBuffer();
          const stored = await bridge.storeMediaFile({ name: file.name || 'media', buffer });
          if (stored?.ok && (stored.path || stored.url)) {
            storedPath = stored.path ?? null;
            storedUrl = stored.url ?? null;
          } else {
            console.warn('[NodeVision] storeMediaFile failed, falling back to blob URL');
          }
        } catch (error) {
          console.warn('[NodeVision] storeMediaFile error', error);
        }
      }

      let previewUrl: string;
      if (typeof URL?.createObjectURL === 'function') {
        previewUrl = URL.createObjectURL(file);
      } else if (storedUrl) {
        previewUrl = storedUrl;
      } else if (storedPath) {
        previewUrl = toFileUrl(storedPath);
      } else {
        console.error('[NodeVision] cannot create preview URL');
        showToast(t('toast.mediaFailed'), 'error');
        return;
      }

      state.mediaPreviews.set(nodeId, {
        url: previewUrl,
        name: file.name || 'media',
        size: file.size ?? 0,
        type: resolvedType,
        kind,
        width: null,
        height: null,
        ownedUrl: Boolean(storedPath || storedUrl) || previewUrl.startsWith('blob:'),
        filePath: storedPath
      });
      renderNodes();
      if (kind === 'image') {
        measureImageDimensions(nodeId, file, previewUrl);
      } else {
        measureVideoDimensions(nodeId, previewUrl);
      }
      if (file.name) {
        showToast(t('toast.mediaSelected', { name: file.name }));
      }
    };

    void saveAndPreview();
  };

  const handleMediaInputChange = (nodeId: string, input: HTMLInputElement): void => {
    if (state.readonly) {
      input.value = '';
      return;
    }
    const file = input.files?.[0];
    if (!file) {
      input.value = '';
      return;
    }
    ingestMediaFile(nodeId, file);
    input.value = '';
  };

  const buildLoadNodeMediaSection = (node: RendererNode): string => {
    const nodeId = node.id;
    const preview = state.mediaPreviews.get(nodeId);
    const nodeSize = state.nodeSizes.get(nodeId) ?? { width: 0, height: 0 };
    const chrome = getNodeChromePadding(nodeId);
    const reservedHeight = getLoadNodeReservedHeight(Boolean(preview));
    const nodeKind = getLoadNodeKindFromType(node.typeId);
    const ratio = getPreviewAspectRatio(nodeId);
    const widthLimit = getPreviewWidthForNodeWidth(nodeSize.width);
    const previewBox = calculatePreviewSize({
      nodeWidth: nodeSize.width || node.width || 0,
      nodeHeight: nodeSize.height || node.height || 0,
      chromePadding: chrome,
      reservedHeight,
      widthLimit,
      minHeight: minPreviewHeight,
      minWidth: minPreviewWidth,
      aspectRatio: ratio,
      originalWidth: preview?.width ?? null,
      originalHeight: preview?.height ?? null,
      minimumNodePortion: 0.85
    });
    const inlineStyle = ` style="--preview-width:${previewBox.width}px;--preview-height:${previewBox.height}px"`;
    const acceptAttr = nodeKind === 'image' ? 'image/*' : nodeKind === 'video' ? 'video/*' : 'image/*,video/*';
    const disabledAttr = state.readonly ? 'disabled' : '';
    const uploadControl = `
      <label class="node-media-upload${state.readonly ? ' disabled' : ''}">
        <span>${escapeHtml(t('nodes.load.selectButton'))}</span>
        <input type="file" accept="${acceptAttr}" ${disabledAttr} data-media-input="${escapeHtml(nodeId)}" />
      </label>
    `;
    const fileLabel = escapeHtml(preview?.name ?? t('nodes.load.noFile'));
    const aspectText =
      preview?.width && preview?.height
        ? `${preview.width} × ${preview.height}`
        : t('nodes.load.aspectUnknown');
    const aspectHtml = `<p class="node-media-aspect">${escapeHtml(aspectText)}</p>`;

    const toolbar = `
      <div class="node-media-toolbar">
        <button type="button" class="node-media-arrow" disabled aria-hidden="true">◀</button>
        <span class="node-media-filename" title="${fileLabel}">${fileLabel}</span>
        <button type="button" class="node-media-arrow" disabled aria-hidden="true">▶</button>
      </div>
    `;

    if (!preview) {
      return `<div class="node-media" data-node-id="${escapeHtml(nodeId)}"${inlineStyle}>
        ${toolbar}
        ${uploadControl}
        <p class="node-media-empty">${escapeHtml(t('nodes.load.empty'))}</p>
        ${aspectHtml}
      </div>`;
    }
    const kind = preview.kind === 'video' ? 'video' : 'image';
    const mediaTag =
      kind === 'video'
        ? `<video src="${preview.url}" controls playsinline preload="metadata" muted></video>`
        : `<img src="${preview.url}" alt="${escapeHtml(preview.name)}" />`;
    return `<div class="node-media" data-node-id="${escapeHtml(nodeId)}"${inlineStyle}>
      ${toolbar}
      ${uploadControl}
      <div class="node-media-frame">
        <div class="node-media-preview" data-kind="${kind}">
          ${mediaTag}
        </div>
      </div>
      ${aspectHtml}
    </div>`;
  };

  const renderMediaSection = (node: RendererNode): NodeRendererView => ({
    afterPortsHtml: buildLoadNodeMediaSection(node),
    afterRender: element => {
      element
        .querySelectorAll<HTMLInputElement>('input[data-media-input]')
        .forEach(input => input.addEventListener('change', () => handleMediaInputChange(node.id, input)));
    }
  });

  return {
    id: 'load-media',
    typeIds: LOAD_NODE_TYPES,
    render: renderMediaSection,
    onBeforeNodeRemove: (nodeId: string) => {
      cleanupMediaPreview(nodeId);
    }
  };
};
