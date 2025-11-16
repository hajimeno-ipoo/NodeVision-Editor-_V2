import type { NodeRendererContext, NodeRendererModule } from './types';
import { buildNodeInfoSection } from './shared';

export const createResizeNodeRenderer = (context: NodeRendererContext): NodeRendererModule => ({
  id: 'resize-info',
  typeIds: ['resize'],
  render: node => ({
    afterPortsHtml: buildNodeInfoSection(node, context, { tipKey: 'nodes.resize.tip' })
  })
});
