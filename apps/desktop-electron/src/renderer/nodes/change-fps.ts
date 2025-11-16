import type { NodeRendererContext, NodeRendererModule } from './types';
import { buildNodeInfoSection } from './shared';

export const createChangeFpsNodeRenderer = (context: NodeRendererContext): NodeRendererModule => ({
  id: 'change-fps-info',
  typeIds: ['changeFps'],
  render: node => ({
    afterPortsHtml: buildNodeInfoSection(node, context, { tipKey: 'nodes.changeFps.tip' })
  })
});
