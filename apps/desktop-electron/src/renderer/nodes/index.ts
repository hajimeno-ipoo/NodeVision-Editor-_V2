import type { NodeRendererContext, NodeRendererModule } from './types';
import { createLoadNodeRenderer } from './load';
import { createTrimNodeRenderer } from './trim';
import { createResizeNodeRenderer } from './resize';
import { createOverlayNodeRenderer } from './overlay';
import { createTextNodeRenderer } from './text';
import { createCropNodeRenderer } from './crop';
import { createSpeedNodeRenderer } from './speed';
import { createChangeFpsNodeRenderer } from './change-fps';
import { createExportNodeRenderer } from './export-node';

export const createNodeRenderers = (context: NodeRendererContext): NodeRendererModule[] => [
  createLoadNodeRenderer(context),
  createTrimNodeRenderer(context),
  createResizeNodeRenderer(context),
  createOverlayNodeRenderer(context),
  createTextNodeRenderer(context),
  createCropNodeRenderer(context),
  createSpeedNodeRenderer(context),
  createChangeFpsNodeRenderer(context),
  createExportNodeRenderer(context)
];
