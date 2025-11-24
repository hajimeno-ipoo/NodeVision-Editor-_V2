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
  const format: ExportSettings['format'] = settings.format ?? undefined;
  const quality: ExportSettings['quality'] = settings.quality ?? undefined;

  return `
    <div class="node-launcher">
      <div class="node-controls" style="display: flex; flex-direction: column; gap: 12px;">
        <label class="control-label" style="margin: 0; padding-left: 8px;">
          <span class="control-label-text" style="display: block; margin-bottom: 6px;">${escapeHtml(t('nodes.export.format'))}</span>
          <div class="node-media-toolbar">
            <button type="button" class="node-media-arrow" data-export-nav="format" data-direction="prev" data-node-id="${escapeHtml(node.id)}" aria-label="previous format">◀</button>
            <select class="control-select node-media-file-dropdown" data-export-format data-node-id="${escapeHtml(node.id)}">
              <option value="" ${!format ? 'selected' : ''}>${escapeHtml(t('nodes.load.noFile'))}</option>
              <option value="mp4" ${format === 'mp4' ? 'selected' : ''}>MP4 (H.264)</option>
              <option value="mov" ${format === 'mov' ? 'selected' : ''}>MOV (ProRes)</option>
              <option value="png" ${format === 'png' ? 'selected' : ''}>PNG (Image)</option>
              <option value="jpg" ${format === 'jpg' ? 'selected' : ''}>JPG (Image)</option>
            </select>
            <button type="button" class="node-media-arrow" data-export-nav="format" data-direction="next" data-node-id="${escapeHtml(node.id)}" aria-label="next format">▶</button>
          </div>
        </label>

        <label class="control-label" style="margin: 0; padding-left: 8px;">
          <span class="control-label-text" style="display: block; margin-bottom: 6px;">${escapeHtml(t('nodes.export.quality'))}</span>
          <div class="node-media-toolbar">
            <button type="button" class="node-media-arrow" data-export-nav="quality" data-direction="prev" data-node-id="${escapeHtml(node.id)}" aria-label="previous quality">◀</button>
            <select class="control-select node-media-file-dropdown" data-export-quality data-node-id="${escapeHtml(node.id)}">
              <option value="" ${!quality ? 'selected' : ''}>${escapeHtml(t('nodes.load.noFile'))}</option>
              <option value="high" ${quality === 'high' ? 'selected' : ''}>${escapeHtml(t('nodes.export.qualityHigh'))}</option>
              <option value="medium" ${quality === 'medium' ? 'selected' : ''}>${escapeHtml(t('nodes.export.qualityMedium'))}</option>
              <option value="low" ${quality === 'low' ? 'selected' : ''}>${escapeHtml(t('nodes.export.qualityLow'))}</option>
            </select>
            <button type="button" class="node-media-arrow" data-export-nav="quality" data-direction="next" data-node-id="${escapeHtml(node.id)}" aria-label="next quality">▶</button>
          </div>
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

  const cycleSelect = (select: HTMLSelectElement | null, direction: 'prev' | 'next'): void => {
    if (!select) return;
    const options = Array.from(select.options).filter(opt => opt.value !== '');
    if (options.length === 0) return;
    const currentValue = select.value;
    const currentIndex = options.findIndex(opt => opt.value === currentValue);
    const fallbackIndex = 0;
    const activeIndex = currentIndex >= 0 ? currentIndex : fallbackIndex;
    const delta = direction === 'next' ? 1 : -1;
    const nextIndex = (activeIndex + delta + options.length) % options.length;
    const nextValue = options[nextIndex].value;
    select.value = nextValue;
    select.dispatchEvent(new Event('change'));
  };

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

  // Arrow buttons for cycling format/quality
  const navButtons = document.querySelectorAll<HTMLButtonElement>(
    `[data-export-nav][data-node-id="${node.id}"]`
  );
  navButtons.forEach(btn => {
    const target = btn.dataset.exportNav as 'format' | 'quality' | undefined;
    const direction = btn.dataset.direction as 'prev' | 'next' | undefined;
    if (!target || !direction) return;
    btn.addEventListener('click', () => {
      if (target === 'format') {
        cycleSelect(formatSelect, direction);
      } else {
        cycleSelect(qualitySelect, direction);
      }
    });
  });

  // Export button
  const exportBtn = document.querySelector<HTMLButtonElement>(
    `[data-export-btn][data-node-id="${node.id}"]`
  );
  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      const targetNode = state.nodes.find(n => n.id === node.id);
      if (!targetNode) return;

      const { t } = context;
      const settings: ExportSettings = (targetNode.settings as ExportSettings) || {};
      const format: ExportSettings['format'] = (settings.format as ExportSettings['format']) || 'mp4';
      const quality = settings.quality || 'high';

      // Open save dialog
      const extensions = format === 'png' || format === 'jpg' ? [format] : [format === 'mov' ? 'mov' : 'mp4'];

      try {
        const result = await window.nodevision.showSaveDialog({
          title: t('nodes.export.save'),
          filters: [
            { name: format.toUpperCase(), extensions }
          ]
        });

        if (result.canceled || !result.filePath) {
          return;
        }

        // Update settings with output path
        targetNode.settings = {
          ...settings,
          outputPath: result.filePath
        } as any;

        // Find source file path from connected node
        const connection = context.state.connections.find(
          c => c.toNodeId === node.id && c.toPortId === 'program'
        );

        if (!connection) {
          alert('No input connected');
          return;
        }

        const sourcePreview = context.state.mediaPreviews.get(connection.fromNodeId);
        if (!sourcePreview?.filePath) {
          alert('Source file not found');
          return;
        }

        // Enqueue export job
        const jobResult = await window.nodevision.enqueueExportJob({
          sourcePath: sourcePreview.filePath,
          outputPath: result.filePath,
          format,
          quality
        });

        if (!jobResult.ok) {
          console.error('[Export] Job enqueue failed:', jobResult.message);
          alert(`Export failed: ${jobResult.message}`);
        } else {
          console.log('[Export] Job enqueued successfully');
        }
      } catch (error) {
        console.error('[Export] Failed to open save dialog:', error);
      }
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
