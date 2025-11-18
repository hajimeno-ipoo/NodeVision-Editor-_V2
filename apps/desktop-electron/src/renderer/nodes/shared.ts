import type { RendererNode } from '../types';
import type { NodeRendererContext } from './types';

export interface InfoOptions {
  tipKey?: string;
  extraHtml?: string;
}

const translateOrFallback = (
  key: string,
  fallback: string,
  t: NodeRendererContext['t']
): string => {
  const translated = t(key);
  return translated === key ? fallback : translated;
};

const escape = (value: string, context: NodeRendererContext) =>
  context.escapeHtml(value);

export const buildNodeInfoSection = (
  node: RendererNode,
  context: NodeRendererContext,
  options: InfoOptions = {}
): string => {
  const { state, t, getTemplateByType } = context;
  const template = getTemplateByType(node.typeId);
  const title = translateOrFallback(`nodeTemplate.${node.typeId}.title`, node.title, t);
  const description = translateOrFallback(
    `nodeTemplate.${node.typeId}.description`,
    template?.description ?? '',
    t
  );
  const ports = template?.inputs ?? node.inputs ?? [];
  const statuses = ports
    .map(port => {
      const portLabel = translateOrFallback(
        `nodeTemplate.${node.typeId}.port.${port.id}`,
        port.label,
        t
      );
      const connected = state.connections.some(
        connection => connection.toNodeId === node.id && connection.toPortId === port.id
      );
      const statusLabel = translateOrFallback(
        connected ? 'nodes.status.connected' : 'nodes.status.missing',
        connected ? 'Connected' : 'Missing',
        t
      );
      return `<div class="node-status"><span class="node-status-label">${escape(
        portLabel,
        context
      )}</span><span class="node-status-value">${escape(statusLabel, context)}</span></div>`;
    })
    .join('');
  const tip =
    options.tipKey && options.tipKey.length
      ? `<p class="node-info-tip">${escape(
          translateOrFallback(options.tipKey, options.tipKey, t),
          context
        )}</p>`
      : '';
  const extra = options.extraHtml ?? '';
  if (!statuses && !tip && !extra) {
    return '';
  }
  const descriptionHtml = description
    ? `<p class="node-info-desc">${escape(description, context)}</p>`
    : '';
  return `<section class="node-info">
    <div class="node-info-heading">${escape(title, context)}</div>
    ${descriptionHtml}
    ${statuses}
    ${tip}
    ${extra}
  </section>`;
};
