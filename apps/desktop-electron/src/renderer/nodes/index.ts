import type { NodeRendererContext, NodeRendererModule } from './types';
import { createBatchCropNodeRenderer } from './batch-crop';
import { createLoadNodeRenderer } from './load';
import { createTrimNodeRenderer } from './trim';
import { createResizeNodeRenderer } from './resize';
import { createOverlayNodeRenderer } from './overlay';
import { createTextNodeRenderer } from './text';
import { createSpeedNodeRenderer } from './speed';
import { createChangeFpsNodeRenderer } from './change-fps';
import { createExportNodeRenderer } from './export-node';
import { createColorCorrectionNodeRenderer } from './color-correction';
import { createMediaPreviewNodeRenderer } from './media-preview';

export const createNodeRenderers = (context: NodeRendererContext): NodeRendererModule[] => [
  createBatchCropNodeRenderer(context),
  createLoadNodeRenderer(context),
  createTrimNodeRenderer(context),
  createResizeNodeRenderer(context),
  createOverlayNodeRenderer(context),
  createTextNodeRenderer(context),
  createSpeedNodeRenderer(context),
  createChangeFpsNodeRenderer(context),
  createColorCorrectionNodeRenderer(context),
  createExportNodeRenderer(context),
  createMediaPreviewNodeRenderer(context)
];
