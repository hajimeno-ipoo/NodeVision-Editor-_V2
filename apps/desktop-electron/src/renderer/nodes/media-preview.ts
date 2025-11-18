import type { RendererNode } from '../types';
import type { NodeRendererContext, NodeRendererModule, NodeRendererView } from './types';
import { getMediaPreviewReservedHeight } from './preview-layout';
import { calculatePreviewSize } from './preview-size';
import { ensureTrimSettings, formatTrimTimecode } from './trim-shared';

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
    const hasVideoEdit = settings.startMs !== null || settings.endMs !== null || settings.strictCut;
    if (!hasImageEdit && !hasVideoEdit) {
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
    if (hasVideoEdit) {
      const startLabel = formatTrimTimecode(settings.startMs ?? 0);
      const endLabel =
        settings.endMs === null ? t('nodes.trim.status.videoEndLabel') : formatTrimTimecode(settings.endMs);
      const strictSuffix = settings.strictCut ? ` ${t('nodes.trim.status.videoStrictSuffix')}` : '';
      messages.push(
        t('nodes.mediaPreview.trimmedRange', {
          start: startLabel,
          end: endLabel,
          strict: strictSuffix
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
    const preview = sourceNodeId ? getMediaPreview(sourceNodeId) : undefined;
    const nodeSize = state.nodeSizes.get(node.id) ?? { width: node.width ?? 0, height: node.height ?? 0 };
    const chrome = getNodeChromePadding(node.id);
    const nodeWidth = nodeSize.width || node.width || 0;
    const nodeHeight = nodeSize.height || node.height || 0;
    const reservedHeight = getMediaPreviewReservedHeight(Boolean(preview));
    const widthLimit = getPreviewWidthForNodeWidth(Math.max(nodeWidth, 0));
    const ratio = getPreviewAspectRatio(sourceNodeId ?? node.id);
    const previewBox = calculatePreviewSize({
      nodeWidth,
      nodeHeight,
      chromePadding: chrome,
      reservedHeight,
      widthLimit,
      minHeight: minPreviewHeight,
      minWidth: minPreviewWidth,
      aspectRatio: ratio,
      originalWidth: preview?.width ?? null,
      originalHeight: preview?.height ?? null,
      minimumNodePortion: 0.95
    });
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
    const toolbar = `
      <div class="node-media-toolbar">
        <span class="node-media-filename" title="${fileLabel}">${fileLabel}</span>
      </div>
      <p class="node-media-aspect">${escapeHtml(t('nodes.mediaPreview.sourceLabel', { title: sourceTitle }))}</p>
      ${trimHintHtml}
    `;
    const aspectText = preview?.width && preview?.height
      ? `${preview.width} × ${preview.height}`
      : t('nodes.mediaPreview.metaUnknown');
    const aspectHtml = `<p class="node-media-aspect">${escapeHtml(aspectText)}</p>`;

    if (!preview) {
      const messageKey = sourceNodeId ? 'nodes.mediaPreview.waiting' : 'nodes.mediaPreview.noInput';
      return `<div class="node-media" data-node-id="${escapeHtml(node.id)}"${inlineStyle}>
        ${toolbar}
        <p class="node-media-empty">${escapeHtml(t(messageKey))}</p>
        ${aspectHtml}
      </div>`;
    }

    const kind = preview.kind === 'video' ? 'video' : 'image';
    const mediaTag =
      kind === 'video'
        ? `<video src="${preview.url}" controls playsinline preload="metadata" muted></video>`
        : `<img src="${preview.url}" alt="${escapeHtml(preview.name)}" />`;

    return `<div class="node-media" data-node-id="${escapeHtml(node.id)}"${inlineStyle}>
      ${toolbar}
      <div class="node-media-frame">
        <div class="node-media-preview" data-kind="${kind}">
          ${mediaTag}
        </div>
      </div>
      ${aspectHtml}
    </div>`;
  };

  const render = (node: RendererNode): NodeRendererView => ({
    afterPortsHtml: buildPreviewSection(node)
  });

  return {
    id: 'media-preview',
    typeIds: [MEDIA_PREVIEW_NODE_TYPE],
    render
  };
};
