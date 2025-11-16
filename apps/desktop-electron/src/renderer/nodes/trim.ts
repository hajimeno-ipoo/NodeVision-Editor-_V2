import type { NodeRendererContext, NodeRendererModule } from './types';
import { buildNodeInfoSection } from './shared';

export const createTrimNodeRenderer = (context: NodeRendererContext): NodeRendererModule => ({
  id: 'trim-info',
  typeIds: ['trim'],
  render: node => ({
    afterPortsHtml: buildNodeInfoSection(node, context, { tipKey: 'nodes.trim.tip' })
  })
});
