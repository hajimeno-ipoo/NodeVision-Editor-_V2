import type { NodeRendererContext, NodeRendererModule } from './types';
import { buildNodeInfoSection } from './shared';

export const createTextNodeRenderer = (context: NodeRendererContext): NodeRendererModule => ({
  id: 'text-info',
  typeIds: ['text'],
  render: node => ({
    afterPortsHtml: buildNodeInfoSection(node, context, { tipKey: 'nodes.text.tip' })
  })
});
