import type { NodeRendererContext, NodeRendererModule } from './types';
import { buildNodeInfoSection } from './shared';

export const createSpeedNodeRenderer = (context: NodeRendererContext): NodeRendererModule => ({
  id: 'speed-info',
  typeIds: ['speed'],
  render: node => ({
    afterPortsHtml: buildNodeInfoSection(node, context, { tipKey: 'nodes.speed.tip' })
  })
});
