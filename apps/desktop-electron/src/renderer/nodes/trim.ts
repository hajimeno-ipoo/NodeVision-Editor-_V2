import type { RendererNode } from '../types';
import { buildNodeInfoSection } from './shared';
import { ensureTrimSettings } from './trim-shared';
import type { NodeRendererContext, NodeRendererModule } from './types';

const MIN_REGION_WIDTH = 0.05;

const clamp = (value: number, min = 0, max = 1): number => Math.min(max, Math.max(min, value));

const formatTimecode = (value: number | null, context: NodeRendererContext): string => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return context.t('nodes.trim.unset');
  }
  const total = Math.max(0, Math.round(value));
  const minutes = Math.floor(total / 60000)
    .toString()
    .padStart(2, '0');
  const seconds = Math.floor((total % 60000) / 1000)
    .toString()
    .padStart(2, '0');
  const millis = (total % 1000).toString().padStart(3, '0');
  return `${minutes}:${seconds}.${millis}`;
};

const parseTimecode = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return Math.max(0, Math.round(parseFloat(trimmed) * 1000));
  }
  const parts = trimmed.split(':').map(part => part.trim());
  if (parts.length === 1) {
    const seconds = Number.parseFloat(parts[0]);
    return Number.isNaN(seconds) ? null : Math.max(0, Math.round(seconds * 1000));
  }
  let multiplier = 1000;
  let totalMs = 0;
  while (parts.length) {
    const segment = parts.pop();
    if (!segment) {
      continue;
    }
    const numeric = Number.parseFloat(segment);
    if (Number.isNaN(numeric)) {
      return null;
    }
    totalMs += Math.round(numeric * multiplier);
    multiplier *= 60;
  }
  return Math.max(0, totalMs);
};

const updateTimelineStyles = (panel: HTMLElement, region: NonNullable<RendererNode['settings']>['region']): void => {
  const track = panel.querySelector<HTMLElement>('.trim-track');
  if (!track) return;
  const start = clamp(region?.x ?? 0) * 100;
  const end = clamp((region?.x ?? 0) + (region?.width ?? 1)) * 100;
  track.style.setProperty('--trim-start', `${start}%`);
  track.style.setProperty('--trim-end', `${end}%`);
};

const buildTrimControls = (node: RendererNode, context: NodeRendererContext): string => {
  const settings = ensureTrimSettings(node);
  const region = settings.region ?? { x: 0, y: 0, width: 1, height: 1 };
  const { escapeHtml, t } = context;
  const startLabel = escapeHtml(t('nodes.trim.startLabel'));
  const endLabel = escapeHtml(t('nodes.trim.endLabel'));
  const strictLabel = escapeHtml(t('nodes.trim.strictLabel'));
  const timelineLabel = escapeHtml(t('nodes.trim.timelineLabel'));
  const startTimecode = escapeHtml(formatTimecode(settings.startMs, context));
  const endTimecode = escapeHtml(formatTimecode(settings.endMs, context));
  const strictAttr = settings.strictCut ? 'checked' : '';
  const startPercent = clamp(region.x) * 100;
  const endPercent = clamp(region.x + region.width) * 100;
  const timelineStyle = `style="--trim-start:${startPercent}%;--trim-end:${endPercent}%;"`;
  return `
    <section class="trim-panel" data-trim-node="${escapeHtml(node.id)}">
      <header class="trim-panel-header">
        <div class="trim-timecode">
          <label>
            <span>${startLabel}</span>
            <input type="text" value="${startTimecode}" data-trim-input="start" data-node-interactive="true" />
          </label>
          <label>
            <span>${endLabel}</span>
            <input type="text" value="${endTimecode}" data-trim-input="end" data-node-interactive="true" />
          </label>
        </div>
        <label class="trim-toggle" data-node-interactive="true">
          <input type="checkbox" data-trim-input="strict" ${strictAttr} />
          <span>${strictLabel}</span>
        </label>
      </header>
      <div class="trim-timeline" aria-label="${timelineLabel}">
        <div class="trim-track" ${timelineStyle} data-node-interactive="true">
          <div class="trim-handle trim-handle-start" data-trim-handle="start" tabindex="0" role="slider" aria-label="${startLabel}"></div>
          <div class="trim-window"></div>
          <div class="trim-handle trim-handle-end" data-trim-handle="end" tabindex="0" role="slider" aria-label="${endLabel}"></div>
        </div>
      </div>
    </section>
  `;
};

const updateTimeSetting = (
  nodeId: string,
  field: 'start' | 'end',
  value: number | null,
  context: NodeRendererContext
): void => {
  const target = context.state.nodes.find(entry => entry.id === nodeId);
  if (!target) {
    return;
  }
  const settings = ensureTrimSettings(target);
  if (field === 'start') {
    settings.startMs = value;
    if (value !== null && settings.endMs !== null && value > settings.endMs) {
      settings.endMs = value;
    }
  } else {
    settings.endMs = value;
    if (value !== null && settings.startMs !== null && value < settings.startMs) {
      settings.startMs = value;
    }
  }
  context.renderNodes();
};

const updateStrictSetting = (nodeId: string, checked: boolean, context: NodeRendererContext): void => {
  const target = context.state.nodes.find(entry => entry.id === nodeId);
  if (!target) {
    return;
  }
  const settings = ensureTrimSettings(target);
  settings.strictCut = checked;
  context.renderNodes();
};

const startHandleDrag = (
  panel: HTMLElement,
  nodeId: string,
  type: 'start' | 'end',
  context: NodeRendererContext,
  event: PointerEvent
): void => {
  const track = panel.querySelector<HTMLElement>('.trim-track');
  if (!track) return;
  const pointerId = event.pointerId ?? 1;
  const target = context.state.nodes.find(entry => entry.id === nodeId);
  if (!target) return;
  const settings = ensureTrimSettings(target);
  const region = settings.region ?? { x: 0, y: 0, width: 1, height: 1 };
  const onPointerMove = (moveEvent: PointerEvent): void => {
    if (moveEvent.pointerId !== pointerId) return;
    const rect = track.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = clamp((moveEvent.clientX - rect.left) / rect.width);
    if (type === 'start') {
      const maxStart = clamp(region.x + region.width - MIN_REGION_WIDTH);
      const nextStart = clamp(ratio, 0, maxStart);
      const delta = region.x - nextStart;
      region.x = nextStart;
      region.width = clamp(region.width + delta, MIN_REGION_WIDTH, 1 - region.x);
    } else {
      const minEnd = clamp(region.x + MIN_REGION_WIDTH);
      const nextEnd = clamp(ratio, minEnd, 1);
      region.width = clamp(nextEnd - region.x, MIN_REGION_WIDTH, 1 - region.x);
    }
    updateTimelineStyles(panel, region);
  };
  const onPointerUp = (upEvent: PointerEvent): void => {
    if (upEvent.pointerId !== pointerId) return;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    context.renderNodes();
  };
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
};

const bindTrimPanel = (panel: HTMLElement, node: RendererNode, context: NodeRendererContext): void => {
  const nodeId = node.id;
  const startInput = panel.querySelector<HTMLInputElement>('input[data-trim-input="start"]');
  const endInput = panel.querySelector<HTMLInputElement>('input[data-trim-input="end"]');
  const strictInput = panel.querySelector<HTMLInputElement>('input[data-trim-input="strict"]');
  startInput?.addEventListener('blur', () => {
    const value = parseTimecode(startInput.value);
    updateTimeSetting(nodeId, 'start', value, context);
  });
  endInput?.addEventListener('blur', () => {
    const value = parseTimecode(endInput.value);
    updateTimeSetting(nodeId, 'end', value, context);
  });
  strictInput?.addEventListener('change', () => {
    updateStrictSetting(nodeId, Boolean(strictInput.checked), context);
  });
  panel.querySelectorAll<HTMLElement>('[data-trim-handle]').forEach(handle => {
    handle.addEventListener('pointerdown', event => {
      event.preventDefault();
      const kind = (handle.getAttribute('data-trim-handle') as 'start' | 'end') ?? 'start';
      startHandleDrag(panel, nodeId, kind, context, event as PointerEvent);
    });
  });
};

export const createTrimNodeRenderer = (context: NodeRendererContext): NodeRendererModule => ({
  id: 'trim-info',
  typeIds: ['trim'],
  render: node => ({
    afterPortsHtml: [
      buildTrimControls(node, context),
      buildNodeInfoSection(node, context, { tipKey: 'nodes.trim.tip' })
    ].join(''),
    afterRender: element => {
      const panel = element.querySelector<HTMLElement>('.trim-panel');
      if (panel) {
        bindTrimPanel(panel, node, context);
      }
    }
  })
});
