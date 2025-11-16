import type { RendererNode, NodePort } from '../types';
import type { NodeRendererContext } from './types';

interface InfoOptions {
  tipKey?: string;
  extraHtml?: string;
}

const isInputConnected = (context: NodeRendererContext, nodeId: string, portId: string): boolean =>
  context.state.connections.some(connection => connection.toNodeId === nodeId && connection.toPortId === portId);

const resolvePortLabel = (node: RendererNode, port: NodePort, context: NodeRendererContext): string => {
  const key = `nodeTemplate.${node.typeId}.port.${port.id}`;
  const translated = context.t(key);
  if (translated && translated !== key) {
    return translated;
  }
  return port.label ?? port.id;
};

const buildInputStatusList = (node: RendererNode, context: NodeRendererContext): string => {
  const inputs = node.inputs ?? [];
  if (!inputs.length) {
    return '';
  }
  const items = inputs
    .map(port => {
      const connected = isInputConnected(context, node.id, port.id);
      const statusKey = connected ? 'nodes.status.connected' : 'nodes.status.missing';
      const statusClass = connected ? 'node-status-ok' : 'node-status-warn';
      const label = resolvePortLabel(node, port, context);
      return `<li class="node-status ${statusClass}"><span>${context.escapeHtml(label)}</span><span>${context.escapeHtml(
        context.t(statusKey)
      )}</span></li>`;
    })
    .join('');
  return `<ul class="node-status-list">${items}</ul>`;
};

export const buildNodeInfoSection = (
  node: RendererNode,
  context: NodeRendererContext,
  options: InfoOptions = {}
): string => {
  const template = context.getTemplateByType(node.typeId);
  const titleKey = `nodeTemplate.${node.typeId}.title`;
  const titleCandidate = context.t(titleKey);
  const localizedTitle = titleCandidate && titleCandidate !== titleKey ? titleCandidate : template?.title ?? node.title ?? node.typeId;
  const descKey = `nodeTemplate.${node.typeId}.description`;
  const descCandidate = context.t(descKey);
  const localizedDescription = descCandidate && descCandidate !== descKey ? descCandidate : template?.description ?? '';
  const category = template?.category ?? '';
  const tip = options.tipKey ? context.t(options.tipKey) : '';
  const tipHtml = tip && tip !== options.tipKey ? `<p class="node-info-tip">${context.escapeHtml(tip)}</p>` : '';
  const statusList = buildInputStatusList(node, context);
  const extraHtml = options.extraHtml ?? '';
  return `<section class="node-info" data-node-info="${context.escapeHtml(node.id)}">
    <div class="node-info-heading">
      <span class="node-info-title">${context.escapeHtml(localizedTitle)}</span>
      ${category ? `<span class="node-info-chip">${context.escapeHtml(category)}</span>` : ''}
    </div>
    <p class="node-info-desc">${context.escapeHtml(localizedDescription)}</p>
    ${statusList}
    ${tipHtml}
    ${extraHtml}
  </section>`;
};
