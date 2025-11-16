import type { NodeRendererContext, NodeRendererModule } from './types';
import { buildNodeInfoSection } from './shared';

export const createExportNodeRenderer = (context: NodeRendererContext): NodeRendererModule => ({
  id: 'export-info',
  typeIds: ['export'],
  render: node => ({
    afterPortsHtml: buildNodeInfoSection(node, context, { tipKey: 'nodes.export.tip' })
  })
});
