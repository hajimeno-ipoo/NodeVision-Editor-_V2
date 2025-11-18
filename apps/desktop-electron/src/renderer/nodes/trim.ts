import type { RendererNode } from '../types';
import { buildNodeInfoSection } from './shared';
import { ensureTrimSettings, formatTrimTimecode } from './trim-shared';
import type { NodeRendererContext, NodeRendererModule } from './types';

const buildStatusLabel = (node: RendererNode, context: NodeRendererContext): string => {
  const settings = ensureTrimSettings(node);
  const { t } = context;
  const region = settings.region ?? { x: 0, y: 0, width: 1, height: 1 };
  const hasImageEdit = region.x !== 0 || region.y !== 0 || region.width !== 1 || region.height !== 1;
  const hasVideoEdit = settings.startMs !== null || settings.endMs !== null || settings.strictCut;
  if (!hasImageEdit && !hasVideoEdit) {
    return t('nodes.trim.status.empty');
  }
  const parts: string[] = [];
  if (hasImageEdit) {
    const widthPct = Math.round(region.width * 100);
    const heightPct = Math.round(region.height * 100);
    parts.push(t('nodes.trim.status.imageSummary', { width: widthPct, height: heightPct }));
  }
  if (hasVideoEdit) {
    const startLabel = formatTrimTimecode(settings.startMs ?? 0);
    const endLabel =
      settings.endMs === null ? t('nodes.trim.status.videoEndLabel') : formatTrimTimecode(settings.endMs);
    const strictSuffix = settings.strictCut ? ` ${t('nodes.trim.status.videoStrictSuffix')}` : '';
    parts.push(t('nodes.trim.status.videoSummary', { start: startLabel, end: endLabel, strict: strictSuffix }));
  }
  return parts.join(' / ');
};

const buildLauncher = (node: RendererNode, context: NodeRendererContext): string => {
  const { escapeHtml, t } = context;
  return `
    <section class="trim-launcher" data-trim-node="${escapeHtml(node.id)}">
      <div class="trim-launcher-buttons">
        <button type="button" class="trim-launcher-btn" data-trim-launch="image" data-node-interactive="true">
          ${escapeHtml(t('nodes.trim.imageButton'))}
        </button>
        <button type="button" class="trim-launcher-btn" data-trim-launch="video" data-node-interactive="true">
          ${escapeHtml(t('nodes.trim.videoButton'))}
        </button>
      </div>
      <p class="trim-launcher-status">${escapeHtml(buildStatusLabel(node, context))}</p>
    </section>
  `;
};

const bindLauncher = (panel: HTMLElement, node: RendererNode, context: NodeRendererContext): void => {
  panel.querySelectorAll<HTMLButtonElement>('[data-trim-launch]').forEach(button => {
    button.addEventListener('click', () => {
      const mode = (button.getAttribute('data-trim-launch') as 'image' | 'video') ?? 'image';
      context.openTrimModal(mode, node.id);
    });
  });
};

export const createTrimNodeRenderer = (context: NodeRendererContext): NodeRendererModule => ({
  id: 'trim-launcher',
  typeIds: ['trim'],
  render: node => ({
    afterPortsHtml: [
      buildLauncher(node, context),
      buildNodeInfoSection(node, context, { tipKey: 'nodes.trim.tip' })
    ].join(''),
    afterRender: element => {
      const panel = element.querySelector<HTMLElement>('.trim-launcher');
      if (panel) {
        bindLauncher(panel, node, context);
      }
    }
  })
});
