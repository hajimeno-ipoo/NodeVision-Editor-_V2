import type { RendererNode } from '../types';
import { buildNodeInfoSection } from './shared';
import { ensureTrimSettings } from './trim-shared';
import type { NodeRendererContext, NodeRendererModule } from './types';

const buildStatusLabel = (node: RendererNode, context: NodeRendererContext): string => {
  const settings = ensureTrimSettings(node);
  const { t } = context;
  const region = settings.region ?? { x: 0, y: 0, width: 1, height: 1 };
  const hasImageEdit = region.x !== 0 || region.y !== 0 || region.width !== 1 || region.height !== 1;
  if (!hasImageEdit) {
    return t('nodes.trim.status.empty');
  }
  const widthPct = Math.round(region.width * 100);
  const heightPct = Math.round(region.height * 100);
  return t('nodes.trim.status.imageSummary', { width: widthPct, height: heightPct });
};

const buildLauncher = (node: RendererNode, context: NodeRendererContext): string => {
  const { escapeHtml, t } = context;
  // Default to slot 1 if not set
  const activeSlot = ((node as any).data?.activeSlot as number) || 1;

  return `
    <section class="trim-launcher batch-crop-launcher" data-trim-node="${escapeHtml(node.id)}">
      <div class="batch-crop-slots">
        <label class="batch-crop-slot">
          <input type="radio" name="slot-${escapeHtml(node.id)}" value="1" ${activeSlot === 1 ? 'checked' : ''} data-node-interactive="true">
          <span>Source 1</span>
        </label>
        <label class="batch-crop-slot">
          <input type="radio" name="slot-${escapeHtml(node.id)}" value="2" ${activeSlot === 2 ? 'checked' : ''} data-node-interactive="true">
          <span>Source 2</span>
        </label>
        <label class="batch-crop-slot">
          <input type="radio" name="slot-${escapeHtml(node.id)}" value="3" ${activeSlot === 3 ? 'checked' : ''} data-node-interactive="true">
          <span>Source 3</span>
        </label>
      </div>
      <div class="trim-launcher-buttons">
        <button type="button" class="trim-launcher-btn" data-trim-launch="image" data-node-interactive="true">
          ${escapeHtml(t('nodes.trim.imageButton'))}
        </button>
      </div>
      <p class="trim-launcher-status">${escapeHtml(buildStatusLabel(node, context))}</p>
    </section>
  `;
};

const bindLauncher = (panel: HTMLElement, node: RendererNode, context: NodeRendererContext): void => {
  // Bind crop launch button
  panel.querySelectorAll<HTMLButtonElement>('[data-trim-launch]').forEach(button => {
    button.addEventListener('click', () => {
      // Pass the active slot to the modal opener
      const activeSlot = ((node as any).data?.activeSlot as number) || 1;
      context.openTrimModal(node.id, activeSlot);
    });
  });

  // Bind slot selection radio buttons
  panel.querySelectorAll<HTMLInputElement>('input[type="radio"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      if (target.checked) {
        const slot = parseInt(target.value, 10);
        // Update node data to persist selection
        if (!(node as any).data) (node as any).data = {};
        (node as any).data.activeSlot = slot;
        context.scheduleTrimPreviewUpdate(node.id);
      }
    });
  });
};

export const createBatchCropNodeRenderer = (context: NodeRendererContext): NodeRendererModule => ({
  id: 'batch-crop-launcher',
  typeIds: ['batchcrop'],
  render: node => ({
    afterPortsHtml: [
      buildLauncher(node, context),
      buildNodeInfoSection(node, context, { tipKey: 'nodes.batchcrop.tip' })
    ].join(''),
    afterRender: element => {
      const panel = element.querySelector<HTMLElement>('.trim-launcher');
      if (panel) {
        bindLauncher(panel, node, context);
      }
    }
  })
});
