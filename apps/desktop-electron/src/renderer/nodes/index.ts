
import { createBatchCropNodeRenderer } from './batch-crop';
import { createChangeFpsNodeRenderer } from './change-fps';
import { createColorCorrectionNodeRenderer } from './color-correction';
import { createCurveEditorNodeRenderer } from './curve-editor';
import { createExportNodeRenderer } from './export-node';
import { createLoadNodeRenderer } from './load';
import { createLUTLoaderNodeRenderer } from './lut-loader';
import { createMediaPreviewNodeRenderer } from './media-preview';
import { createOverlayNodeRenderer } from './overlay';
import { createPrimaryGradingNodeRenderer } from './primary-grading';
import { createResizeNodeRenderer } from './resize';
import { createSecondaryGradingNodeRenderer } from './secondary-grading';
import { createSpeedNodeRenderer } from './speed';
import { createTextNodeRenderer } from './text';
import { createTrimNodeRenderer } from './trim';
import type { NodeRendererContext, NodeRendererModule } from './types';

export const createNodeRenderers = (context: NodeRendererContext): NodeRendererModule[] => [
  createBatchCropNodeRenderer(context),
  createChangeFpsNodeRenderer(context),
  createColorCorrectionNodeRenderer(context),
  createCurveEditorNodeRenderer(context),
  createExportNodeRenderer(context),
  createLoadNodeRenderer(context),
  createLUTLoaderNodeRenderer(context),
  createMediaPreviewNodeRenderer(context),
  createOverlayNodeRenderer(context),
  createPrimaryGradingNodeRenderer(context),
  createResizeNodeRenderer(context),
  createSecondaryGradingNodeRenderer(context),
  createSpeedNodeRenderer(context),
  createTextNodeRenderer(context),
  createTrimNodeRenderer(context)
];
