import type { RendererNode } from '../types';
import type { NodeRendererContext, NodeRendererModule, NodeRendererView } from './types';
import { buildNodeInfoSection } from './shared';

interface ExportSettings {
  format?: 'mp4' | 'mov' | 'png' | 'jpg';
  quality?: 'high' | 'medium' | 'low';
  outputPath?: string;
}

const buildExportLauncher = (
  node: RendererNode,
  context: NodeRendererContext
): string => {
  const { escapeHtml, t } = context;
  const settings: ExportSettings = (node.settings as ExportSettings) || {};
  const format = settings.format || 'mp4';
  const quality = settings.quality || 'high';

  return `
    <div class="node-launcher">
      <div class="node-controls" style="display: flex; flex-direction: column; gap: 12px;">
        <label class="control-label" style="margin: 0;">
          <span class="control-label-text" style="display: block; margin-bottom: 6px;">${escapeHtml(t('nodes.export.format'))}</span>
          <select class="control-select" data-export-format data-node-id="${escapeHtml(node.id)}" style="width: 100%;">
            <option value="mp4" ${format === 'mp4' ? 'selected' : ''}>MP4 (H.264)</option>
            <option value="mov" ${format === 'mov' ? 'selected' : ''}>MOV (ProRes)</option>
            <option value="png" ${format === 'png' ? 'selected' : ''}>PNG Sequence</option>
            <option value="jpg" ${format === 'jpg' ? 'selected' : ''}>JPG Sequence</option>
          </select>
        </label>

        <label class="control-label" style="margin: 0;">
          <span class="control-label-text" style="display: block; margin-bottom: 6px;">${escapeHtml(t('nodes.export.quality'))}</span>
          <select class="control-select" data-export-quality data-node-id="${escapeHtml(node.id)}" style="width: 100%;">
            <option value="high" ${quality === 'high' ? 'selected' : ''}>${escapeHtml(t('nodes.export.qualityHigh'))}</option>
            <option value="medium" ${quality === 'medium' ? 'selected' : ''}>${escapeHtml(t('nodes.export.qualityMedium'))}</option>
            <option value="low" ${quality === 'low' ? 'selected' : ''}>${escapeHtml(t('nodes.export.qualityLow'))}</option>
          </select>
        </label>

        <button 
          type="button" 
          class="node-action-btn"
          data-export-btn 
          data-node-id="${escapeHtml(node.id)}"
          style="width: 100%; margin-top: 4px; padding: 10px; font-weight: 600;"
        >
          ${escapeHtml(t('nodes.export.save'))}
        </button>

        ${settings.outputPath ? `
          <div class="export-info" style="margin-top: 8px; padding-top: 12px; border-top: 1px solid rgba(0,0,0,0.1);">
            <small style="display: block; margin-bottom: 4px; opacity: 0.7;">${escapeHtml(t('nodes.export.savedTo'))}</small>
            <div class="export-path" style="font-size: 11px; word-break: break-all; opacity: 0.8;">${escapeHtml(settings.outputPath)}</div>
          </div>
        ` : ''}
      </div>
      ${buildNodeInfoSection(node, context, { tipKey: 'nodes.export.tip' })}
    </div>
  `;
};

const bindExportEvents = (
  node: RendererNode,
  context: NodeRendererContext
): void => {
  const { state } = context;

  // Format selector
  const formatSelect = document.querySelector<HTMLSelectElement>(
    `[data-export-format][data-node-id="${node.id}"]`
  );
  if (formatSelect) {
    formatSelect.addEventListener('change', () => {
      const targetNode = state.nodes.find(n => n.id === node.id);
      if (targetNode) {
        const currentSettings = (targetNode.settings || {}) as ExportSettings;
        targetNode.settings = {
          ...currentSettings,
          format: formatSelect.value as ExportSettings['format']
        } as any;
      }
    });
  }

  // Quality selector
  const qualitySelect = document.querySelector<HTMLSelectElement>(
    `[data-export-quality][data-node-id="${node.id}"]`
  );
  if (qualitySelect) {
    qualitySelect.addEventListener('change', () => {
      const targetNode = state.nodes.find(n => n.id === node.id);
      if (targetNode) {
        const currentSettings = (targetNode.settings || {}) as ExportSettings;
        targetNode.settings = {
          ...currentSettings,
          quality: qualitySelect.value as ExportSettings['quality']
        } as any;
      }
    });
  }

  // Export button
  const exportBtn = document.querySelector<HTMLButtonElement>(
    `[data-export-btn][data-node-id="${node.id}"]`
  );
  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      const targetNode = state.nodes.find(n => n.id === node.id);
      if (!targetNode) return;

      const settings: ExportSettings = (targetNode.settings as ExportSettings) || {};
      const format = settings.format || 'mp4';
      const quality = settings.quality || 'high';

      // TODO: Implement actual export logic
      console.log('[Export] Starting export:', { format, quality });

      // For now, just show a placeholder message
      alert(`Export started:\nFormat: ${format}\nQuality: ${quality}\n\nThis feature will be fully implemented soon.`);
    });
  }
};

export const createExportNodeRenderer = (context: NodeRendererContext): NodeRendererModule => ({
  id: 'export',
  typeIds: ['export'],
  render: (node: RendererNode): NodeRendererView => ({
    afterPortsHtml: buildExportLauncher(node, context),
    afterRender: () => {
      bindExportEvents(node, context);
    }
  })
});
