import type { NodeRendererContext, NodeRendererModule } from './types';
import { buildNodeInfoSection } from './shared';

export const createOverlayNodeRenderer = (context: NodeRendererContext): NodeRendererModule => ({
  id: 'overlay-info',
  typeIds: ['overlay'],
  render: node => ({
    afterPortsHtml: buildNodeInfoSection(node, context, { tipKey: 'nodes.overlay.tip' })
  })
});
