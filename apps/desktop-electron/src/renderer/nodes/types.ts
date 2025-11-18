import type { RendererNode, RendererState, TemplateVars, NodeTemplate, NodeMediaPreview } from '../types';

export interface NodeRendererView {
  afterPortsHtml?: string;
  afterRender?: (nodeElement: HTMLElement) => void;
}

export interface NodeRendererModule {
  id: string;
  typeIds: string[];
  render: (node: RendererNode) => NodeRendererView | null;
  onBeforeNodeRemove?: (nodeId: string) => void;
}

export interface NodeRendererContext {
  state: RendererState;
  t: (key: string, vars?: TemplateVars) => string;
  escapeHtml: (value: unknown) => string;
  showToast: (message: string, type?: 'info' | 'error') => void;
  renderNodes: () => void;
  cleanupMediaPreview: (nodeId: string) => void;
  updateMediaPreviewDimensions: (
    nodeId: string,
    width: number | null,
    height: number | null,
    extra?: Partial<NodeMediaPreview>
  ) => void;
  getNodeChromePadding: (nodeId: string) => number;
  getPreviewWidthForNodeWidth: (width: number) => number;
  getPreviewAspectRatio: (nodeId: string) => number;
  minPreviewHeight: number;
  minPreviewWidth: number;
  getTemplateByType: (typeId: string) => NodeTemplate | undefined;
  getMediaPreview: (nodeId: string) => NodeMediaPreview | undefined;
  openTrimModal: (mode: 'image' | 'video', nodeId: string) => void;
}
