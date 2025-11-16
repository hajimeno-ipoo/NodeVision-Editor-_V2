import type { NodeRendererContext, NodeRendererModule } from './types';
import { buildNodeInfoSection } from './shared';

export const createCropNodeRenderer = (context: NodeRendererContext): NodeRendererModule => ({
  id: 'crop-info',
  typeIds: ['crop'],
  render: node => ({
    afterPortsHtml: buildNodeInfoSection(node, context, { tipKey: 'nodes.crop.tip' })
  })
});
