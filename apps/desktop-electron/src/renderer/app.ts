/// <reference lib="dom" />

import type CropperType from 'cropperjs';
import type { TrimNodeSettings } from '@nodevision/editor';

const resolveCropper = (): typeof CropperType | null => {
  const win = window as unknown as {
    Cropper?: typeof CropperType;
    nodeRequire?: (id: string) => unknown;
  };
  if (win.Cropper) {
    return win.Cropper;
  }
  if (typeof win.nodeRequire === 'function') {
    try {
      const mod = win.nodeRequire('cropperjs') as { default?: typeof CropperType } | undefined;
      if (mod) {
        return (mod.default ?? (mod as unknown as typeof CropperType)) as typeof CropperType;
      }
    } catch (error) {
      console.warn('[NodeVision] failed to load cropperjs via nodeRequire', error);
    }
  }
  return null;
};

const Cropper: typeof CropperType =
  resolveCropper() ??
  (class {
    constructor(_el: HTMLElement, _opts: unknown) {}
    getData() {
      return { x: 0, y: 0, width: 0, height: 0, rotate: 0, scaleX: 1, scaleY: 1 };
    }
    getImageData() {
      return { naturalWidth: 1, naturalHeight: 1, width: 1, height: 1 };
    }
    getCanvasData() {
      return { width: 1, height: 1 };
    }
    setData(): void {}
    setAspectRatio(): void {}
    zoom(): void {}
    rotate(): void {}
    scaleX(): void {}
    scaleY(): void {}
    reset(): void {}
    destroy(): void {}
  } as unknown as typeof CropperType);

import { captureDomElements } from './dom';
import {
  cloneConnection,
  clonePorts,
  createInitialState,
  deepClone
} from './state';
import { ensureTrimSettings } from './nodes/trim-shared';
import type {
  RendererBootstrapWindow,
  RendererState,
  RendererNode,
  RendererConnection,
  NodeTemplate,
  NodePort,
  PortDirection,
  JobSnapshot,
  JobHistoryEntry,
  HistoryEntry,
  RendererQueueState,
  TemplateVars,
  Point,
  SerializedNode,
  RendererDom,
  NodevisionApi,
  NodeSize,
  CanvasTool,
  NodeMediaPreview
} from './types';
import { createNodeRenderers } from './nodes';
import type { NodeRendererModule } from './nodes/types';
import type { StoredWorkflow } from './types';
import { syncPendingPortHighlight } from './ports';
import { getLoadNodeReservedHeight, getMediaPreviewReservedHeight } from './nodes/preview-layout';
import { calculatePreviewSize } from './nodes/preview-size';

(() => {
  const rendererWindow = window as RendererBootstrapWindow;
  const nodevision = (window as unknown as { nodevision?: NodevisionApi }).nodevision;
  const WORKFLOW_STORAGE_KEY = 'nodevision.workflows.v1';
  const SNAP = 4;
  const DRAG_THRESHOLD = 3;
  const SCHEMA = '1.0.7';
  const MIN_PREVIEW_WIDTH = 220;
  const MIN_PREVIEW_HEIGHT = 165;
  const HORIZONTAL_PREVIEW_PADDING = 40;
  const PREVIEW_FRAME_RATIO = MIN_PREVIEW_WIDTH / MIN_PREVIEW_HEIGHT;
  const MIN_NODE_CHROME = 180;
  const DEFAULT_NODE_CHROME = 260;
  const NODE_MIN_WIDTH = MIN_PREVIEW_WIDTH + HORIZONTAL_PREVIEW_PADDING;
  const NODE_MAX_WIDTH = 960;
  const NODE_MIN_HEIGHT = MIN_PREVIEW_HEIGHT + MIN_NODE_CHROME;
  const NODE_MAX_HEIGHT = 1000;
  const MAX_CHROME_SYNC_ATTEMPTS = 2;
  const LOAD_NODE_TYPE_IDS = new Set(['loadImage', 'loadVideo', 'loadMedia']);
  const GRID_MINOR_BASE = 8;
  const GRID_MAJOR_FACTOR = 4;
  const SELECTION_PADDING = 6;
  const LOCALE_STORAGE_KEY = 'nodevision.locale';
  const CANVAS_CONTROLS_POSITION_KEY = 'nodevision.canvasControls.position';
  const CANVAS_CONTROLS_MARGIN = 12;
  const TRANSLATIONS: Record<string, Record<string, string>> = rendererWindow.__NODEVISION_TRANSLATIONS__ ?? {};
  const SUPPORTED_LOCALES: string[] = Array.isArray(rendererWindow.__NODEVISION_SUPPORTED_LOCALES__) && rendererWindow.__NODEVISION_SUPPORTED_LOCALES__.length
    ? rendererWindow.__NODEVISION_SUPPORTED_LOCALES__!
    : Object.keys(TRANSLATIONS);
  const FALLBACK_LOCALE =
    typeof rendererWindow.__NODEVISION_FALLBACK_LOCALE__ === 'string'
      ? rendererWindow.__NODEVISION_FALLBACK_LOCALE__!
      : SUPPORTED_LOCALES[0] ?? 'en-US';
  const BOOTSTRAP = rendererWindow.__NODEVISION_BOOTSTRAP__;
  if (!BOOTSTRAP) {
    console.error('[NodeVision] renderer bootstrap payload is missing');
    return;
  }


  const elements: RendererDom = captureDomElements();
  let unsavedWorkflowLabel = 'Unsaved Workflow';

  type TrimImageModalState = {
    type: 'trim';
    nodeId: string;
    draftRegion: NonNullable<TrimNodeSettings['region']>;
    draftRegionSpace: 'stage' | 'image';
    sourcePreview: NodeMediaPreview | null;
    draftRotationDeg: number;
    draftZoom: number;
    draftFlipHorizontal: boolean;
    draftFlipVertical: boolean;
    draftAspectMode: TrimNodeSettings['aspectMode'];
    showGrid: boolean;
    lastPreferredAxis: 'width' | 'height' | null;
  };

  type ActiveModalState = TrimImageModalState;

  let activeModal: ActiveModalState | null = null;
  let modalBackdrop: HTMLElement | null = null;
  let modalContainer: HTMLElement | null = null;
  let modalTitleElement: HTMLElement | null = null;
  let modalContentElement: HTMLElement | null = null;
  let modalCloseButton: HTMLButtonElement | null = null;
  let modalLastFocused: HTMLElement | null = null;

  const MODAL_FOCUSABLE_SELECTORS = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  const DEFAULT_TRIM_REGION: NonNullable<TrimNodeSettings['region']> = { x: 0, y: 0, width: 1, height: 1 };
  let activeCropper: CropperType | null = null;

  const cloneNodeSettings = (settings?: RendererNode['settings']) =>
    settings ? deepClone(settings) : undefined;

  const getErrorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

  const readStoredLocale = (): string | null => {
    try {
      if (typeof localStorage === 'undefined') {
        return null;
      }
      return localStorage.getItem(LOCALE_STORAGE_KEY);
    } catch (error) {
      console.warn('[NodeVision] locale storage unavailable', error);
      return null;
    }
  };

  const detectLocale = (): string => {
    const stored = readStoredLocale();
    if (stored && TRANSLATIONS[stored]) {
      return stored;
    }
    const configured = (BOOTSTRAP?.status?.settings as { locale?: string } | undefined)?.locale;
    if (configured && TRANSLATIONS[configured]) {
      return configured;
    }
    const candidates: string[] = [];
    if (navigator?.language) {
      candidates.push(navigator.language);
    }
    if (Array.isArray(navigator?.languages)) {
      candidates.push(...navigator.languages);
    }
    for (const candidate of candidates) {
      if (!candidate) continue;
      const normalized = String(candidate).toLowerCase();
      const match = SUPPORTED_LOCALES.find(locale => normalized.startsWith(locale.toLowerCase()));
      if (match) {
        return match;
      }
    }
    return FALLBACK_LOCALE;
  };

  const createId = (base: string): string =>
    (crypto?.randomUUID ? crypto.randomUUID() : `${base}-${Date.now()}-${Math.floor(Math.random() * 9999)}`);

  const cssEscape = (value: string | number): string => {
    if (window.CSS?.escape) {
      return window.CSS.escape(String(value));
    }
    return String(value).replace(/([^a-zA-Z0-9_-])/g, '\\$1');
  };

  const state: RendererState = createInitialState(BOOTSTRAP, detectLocale());
  const nodeRendererByType = new Map<string, NodeRendererModule>();
  let nodeResizeObserver: ResizeObserver | null = null;
  const getNodeRenderer = (typeId: string): NodeRendererModule | undefined => nodeRendererByType.get(typeId);
  const toNodeTypeClass = (typeId: string): string =>
    'node-type-' + typeId.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();

  const readCanvasControlsPosition = (): Point | null => {
    try {
      if (typeof localStorage === 'undefined') {
        return null;
      }
      const raw = localStorage.getItem(CANVAS_CONTROLS_POSITION_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') {
        return { x: parsed.x, y: parsed.y };
      }
    } catch (error) {
      console.warn('[NodeVision] failed to read canvas controls position', error);
    }
    return null;
  };

  const persistCanvasControlsPosition = (pos: Point | null): void => {
    try {
      if (typeof localStorage === 'undefined') {
        return;
      }
      if (!pos) {
        localStorage.removeItem(CANVAS_CONTROLS_POSITION_KEY);
        return;
      }
      localStorage.setItem(CANVAS_CONTROLS_POSITION_KEY, JSON.stringify(pos));
    } catch (error) {
      console.warn('[NodeVision] failed to persist canvas controls position', error);
    }
  };

  const clampCanvasControlsPosition = (pos: Point, dims?: { width: number; height: number }): Point => {
    const rect = dims ?? elements.canvasControls.getBoundingClientRect();
    const width = Math.max(rect.width, 1);
    const height = Math.max(rect.height, 1);
    const maxX = Math.max(CANVAS_CONTROLS_MARGIN, window.innerWidth - width - CANVAS_CONTROLS_MARGIN);
    const maxY = Math.max(CANVAS_CONTROLS_MARGIN, window.innerHeight - height - CANVAS_CONTROLS_MARGIN);
    return {
      x: Math.min(Math.max(pos.x, CANVAS_CONTROLS_MARGIN), maxX),
      y: Math.min(Math.max(pos.y, CANVAS_CONTROLS_MARGIN), maxY)
    };
  };

  const applyCanvasControlsPosition = (pos: Point | null): void => {
    if (!pos) {
      elements.canvasControls.style.left = '';
      elements.canvasControls.style.top = '';
      elements.canvasControls.style.bottom = '';
      elements.canvasControls.style.right = '';
      state.canvasControlsPosition = null;
      return;
    }
    const clamped = clampCanvasControlsPosition(pos);
    elements.canvasControls.style.left = `${Math.round(clamped.x)}px`;
    elements.canvasControls.style.top = `${Math.round(clamped.y)}px`;
    elements.canvasControls.style.bottom = 'auto';
    elements.canvasControls.style.right = 'auto';
    state.canvasControlsPosition = { x: Math.round(clamped.x), y: Math.round(clamped.y) };
  };

  const storedControlsPosition = readCanvasControlsPosition();
  if (storedControlsPosition) {
    applyCanvasControlsPosition(storedControlsPosition);
  }

  const startCanvasControlsDrag = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target && (target.closest('button') || target.closest('input') || target.closest('select'))) {
      if (!event.altKey) {
        return;
      }
    }
    const rect = elements.canvasControls.getBoundingClientRect();
    canvasControlsDragSession = {
      pointerId: event.pointerId ?? 1,
      offset: { x: event.clientX - rect.left, y: event.clientY - rect.top },
      width: rect.width,
      height: rect.height
    };
    elements.canvasControls.classList.add('is-dragging');
    elements.canvasControls.style.left = `${rect.left}px`;
    elements.canvasControls.style.top = `${rect.top}px`;
    elements.canvasControls.style.bottom = 'auto';
    elements.canvasControls.style.right = 'auto';
    state.canvasControlsPosition = { x: rect.left, y: rect.top };
    window.addEventListener('pointermove', handleCanvasControlsPointerMove);
    window.addEventListener('pointerup', handleCanvasControlsPointerUp);
    window.addEventListener('pointercancel', handleCanvasControlsPointerCancel);
    try {
      elements.canvasControls.setPointerCapture(event.pointerId ?? 1);
    } catch {
      /* ignore */
    }
    event.preventDefault();
  };

  const updateCanvasControlsPositionFromEvent = (event: PointerEvent): void => {
    if (!canvasControlsDragSession) return;
    const { offset, width, height } = canvasControlsDragSession;
    const next = {
      x: event.clientX - offset.x,
      y: event.clientY - offset.y
    };
    const clamped = clampCanvasControlsPosition(next, { width, height });
    elements.canvasControls.style.left = `${Math.round(clamped.x)}px`;
    elements.canvasControls.style.top = `${Math.round(clamped.y)}px`;
    state.canvasControlsPosition = { x: Math.round(clamped.x), y: Math.round(clamped.y) };
  };

  const stopCanvasControlsDrag = (persist: boolean, event?: PointerEvent): void => {
    if (!canvasControlsDragSession) return;
    window.removeEventListener('pointermove', handleCanvasControlsPointerMove);
    window.removeEventListener('pointerup', handleCanvasControlsPointerUp);
    window.removeEventListener('pointercancel', handleCanvasControlsPointerCancel);
    if (persist) {
      persistCanvasControlsPosition(state.canvasControlsPosition ?? null);
    }
    elements.canvasControls.classList.remove('is-dragging');
    if (event) {
      try {
        elements.canvasControls.releasePointerCapture(event.pointerId ?? canvasControlsDragSession.pointerId);
      } catch {
        /* ignore */
      }
    }
    canvasControlsDragSession = null;
  };

  const handleCanvasControlsPointerMove = (event: PointerEvent): void => {
    if (!canvasControlsDragSession || (event.pointerId ?? 1) !== canvasControlsDragSession.pointerId) {
      return;
    }
    event.preventDefault();
    updateCanvasControlsPositionFromEvent(event);
  };

  const handleCanvasControlsPointerUp = (event: PointerEvent): void => {
    if (!canvasControlsDragSession || (event.pointerId ?? 1) !== canvasControlsDragSession.pointerId) {
      return;
    }
    event.preventDefault();
    stopCanvasControlsDrag(true, event);
  };

  const handleCanvasControlsPointerCancel = (event: PointerEvent): void => {
    if (!canvasControlsDragSession || (event.pointerId ?? 1) !== canvasControlsDragSession.pointerId) {
      return;
    }
    stopCanvasControlsDrag(false, event);
  };

  const handleCanvasControlsResize = (): void => {
    if (!state.canvasControlsPosition) {
      return;
    }
    applyCanvasControlsPosition(state.canvasControlsPosition);
    persistCanvasControlsPosition(state.canvasControlsPosition);
  };

  const isEventInsideCanvas = (event: WheelEvent | PointerEvent): boolean => {
    const rect = elements.canvas.getBoundingClientRect();
    return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
  };

  const MIN_ZOOM = 0.25;
  const MAX_ZOOM = 3;
  const ZOOM_STEP = 0.1;

  type PanSession = { pointerId: number; start: Point; startViewport: Point };
  let panSession: PanSession | null = null;
  type CanvasControlsDragSession = { pointerId: number; offset: Point; width: number; height: number };
  let canvasControlsDragSession: CanvasControlsDragSession | null = null;
  let zoomMenuOpen = false;

  let activeConnectionDrag: {
    portEl: HTMLElement;
    pointerId: number;
    origin: Point;
    started: boolean;
  } | null = null;
  let dropTargetPort: HTMLElement | null = null;
  type NormalizedRect = { minX: number; minY: number; maxX: number; maxY: number };
  type MarqueeSession = {
    pointerId: number;
    start: Point;
    additive: boolean;
    baseSelection: Set<string>;
    lastRect: NormalizedRect | null;
  };
  let marqueeSession: MarqueeSession | null = null;

  const formatTemplate = (template: string, vars: TemplateVars = {}): string => {
    let result = template;
    for (const [token, value] of Object.entries(vars)) {
      const placeholder = '{{' + token + '}}';
      result = result.split(placeholder).join(String(value));
    }
    let cleaned = '';
    let cursor = 0;
    while (cursor < result.length) {
      const open = result.indexOf('{{', cursor);
      if (open === -1) {
        cleaned += result.slice(cursor);
        break;
      }
      cleaned += result.slice(cursor, open);
      const close = result.indexOf('}}', open + 2);
      if (close === -1) {
        break;
      }
      cursor = close + 2;
    }
    return cleaned;
  };

  const hasOwn = (obj: Record<string, unknown>, key: string): boolean =>
    Object.prototype.hasOwnProperty.call(obj ?? {}, key);

  const lookupTranslation = (key: string): string | null => {
    const localeDict = TRANSLATIONS[state.locale];
    if (localeDict && hasOwn(localeDict, key)) {
      return localeDict[key];
    }
    const fallbackDict = TRANSLATIONS[FALLBACK_LOCALE];
    if (fallbackDict && hasOwn(fallbackDict, key)) {
      return fallbackDict[key];
    }
    return null;
  };

  const translateWithFallback = (key: string, fallback: string, vars: TemplateVars = {}): string => {
    const template = lookupTranslation(key);
    const base = template ?? fallback;
    if (!base) {
      return key;
    }
    return formatTemplate(base, vars);
  };

  const t = (key: string, vars: TemplateVars = {}) => translateWithFallback(key, key, vars);

  const getNodeTitle = (node: RendererNode): string =>
    translateWithFallback(`nodeTemplate.${node.typeId}.title`, node.title);

  const getPortLabel = (typeId: string, port: NodePort): string =>
    translateWithFallback(`nodeTemplate.${typeId}.port.${port.id}`, port.label);

  const getTemplateTitle = (template: NodeTemplate): string =>
    translateWithFallback(`nodeTemplate.${template.typeId}.title`, template.title);

  const getTemplateDescription = (template: NodeTemplate): string =>
    translateWithFallback(`nodeTemplate.${template.typeId}.description`, template.description ?? '');

  const applyI18nAttributes = (node: Element | null): void => {
    if (!node || !node.attributes) return;
    Array.from(node.attributes).forEach(attr => {
      if (!attr.name.startsWith('data-i18n-attr-')) return;
      const target = attr.name.replace('data-i18n-attr-', '');
      const key = attr.value;
      if (!key) return;
      node.setAttribute(target, t(key));
    });
  };

  const applyTranslations = (): void => {
    document.documentElement.lang = state.locale;
    document.querySelectorAll('[data-i18n-key]').forEach(node => {
      const key = node.getAttribute('data-i18n-key');
      if (!key) return;
      node.textContent = t(key);
      applyI18nAttributes(node);
    });
    document.querySelectorAll('[data-i18n-html]').forEach(node => {
      const key = node.getAttribute('data-i18n-html');
      if (!key) return;
      node.innerHTML = t(key);
      applyI18nAttributes(node);
    });
    document
      .querySelectorAll('[data-i18n-attr-placeholder], [data-i18n-attr-aria-label], [data-i18n-attr-title]')
      .forEach(applyI18nAttributes);
  };

  const templates: NodeTemplate[] = BOOTSTRAP.templates ?? [];
  const getTemplateByType = (typeId: string): NodeTemplate | undefined =>
    templates.find(template => template.typeId === typeId);
  applyTranslations();
  syncUnsavedWorkflowLabel();
  hydrateStoredWorkflows();

  const describeStatus = (status: string): string => {
    switch (status) {
      case 'running':
        return t('queue.status.running');
      case 'queued':
        return t('queue.status.queued');
      case 'coolingDown':
        return t('queue.status.coolingDown');
      case 'failed':
        return t('queue.status.failed');
      case 'canceled':
        return t('queue.status.canceled');
      default:
        return status;
    }
  };

  const escapeHtml = (value: unknown): string =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const trapFocusWithinModal = (event: KeyboardEvent): void => {
    if (!modalContainer) return;
    const focusable = Array.from(
      modalContainer.querySelectorAll<HTMLElement>(MODAL_FOCUSABLE_SELECTORS)
    ).filter(element => !element.hasAttribute('disabled'));
    if (!focusable.length) {
      event.preventDefault();
      (modalCloseButton ?? modalContainer).focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (event.shiftKey) {
      if (active === first || !focusable.includes(active!)) {
        event.preventDefault();
        last.focus();
      }
    } else if (active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const closeActiveModal = (): void => {
    if (!activeModal) {
      return;
    }
    activeModal = null;
    modalBackdrop?.setAttribute('data-open', 'false');
    modalContainer?.setAttribute('aria-hidden', 'true');
    if (modalTitleElement) {
      modalTitleElement.textContent = '';
    }
    if (modalContentElement) {
      modalContentElement.innerHTML = '';
    }
    const focusTarget = modalLastFocused;
    modalLastFocused = null;
    if (focusTarget) {
      focusTarget.focus();
    }
  };

  const ensureModalHost = (): void => {
    if (modalBackdrop) {
      return;
    }
    modalBackdrop = document.createElement('div');
    modalBackdrop.className = 'nv-modal-backdrop';
    modalBackdrop.dataset.open = 'false';
    modalBackdrop.innerHTML = `
      <div class="nv-modal" role="dialog" aria-modal="true" aria-hidden="true" tabindex="-1">
        <div class="nv-modal-header">
          <h2 data-modal-title></h2>
          <button type="button" class="nv-modal-close" data-modal-close aria-label="${escapeHtml(t('common.close'))}">
            ×
          </button>
        </div>
        <div class="nv-modal-content" data-modal-content></div>
      </div>
    `;
    document.body.appendChild(modalBackdrop);
    modalContainer = modalBackdrop.querySelector('.nv-modal') as HTMLElement;
    modalTitleElement = modalBackdrop.querySelector('[data-modal-title]') as HTMLElement;
    modalContentElement = modalBackdrop.querySelector('[data-modal-content]') as HTMLElement;
    modalCloseButton = modalBackdrop.querySelector('[data-modal-close]') as HTMLButtonElement;
    modalBackdrop.addEventListener('click', event => {
      if (event.target === modalBackdrop) {
        closeActiveModal();
      }
    });
    modalBackdrop.addEventListener('keydown', event => {
      if (event.key === 'Tab') {
        trapFocusWithinModal(event);
      }
    });
    modalCloseButton?.addEventListener('click', () => closeActiveModal());
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && activeModal) {
        event.preventDefault();
        closeActiveModal();
      }
    });
  };

  const renderTrimImageModal = (session: TrimImageModalState): void => {
    if (!modalTitleElement || !modalContentElement) {
      return;
    }
    modalTitleElement.textContent = t('nodes.trim.imageButton');
    modalContentElement.innerHTML = '';
    if (!session.sourcePreview) {
      const warning = document.createElement('p');
      warning.className = 'trim-modal-placeholder';
      warning.textContent = t('nodes.trim.modalPlaceholder.noImage');
      modalContentElement.appendChild(warning);
      return;
    }
    const aspectOptions: TrimNodeSettings['aspectMode'][] = ['free', 'original', 'square', '2:1', '3:1', '4:3', '16:9', '9:16', '1.618:1'];
    modalContentElement.innerHTML = `
      <div class="trim-image-toolbar" role="toolbar">
        <button type="button" class="trim-tool-button" data-trim-tool="zoom-out">${escapeHtml(t('nodes.trim.imageTools.zoomOut'))}</button>
        <button type="button" class="trim-tool-button" data-trim-tool="zoom-in">${escapeHtml(t('nodes.trim.imageTools.zoomIn'))}</button>
        <button type="button" class="trim-tool-button" data-trim-tool="rotate-left">${escapeHtml(t('nodes.trim.imageTools.rotateLeft'))}</button>
        <button type="button" class="trim-tool-button" data-trim-tool="rotate-right">${escapeHtml(t('nodes.trim.imageTools.rotateRight'))}</button>
        <button type="button" class="trim-tool-button" data-trim-tool="flip-horizontal">${escapeHtml(t('nodes.trim.imageTools.flipHorizontalShort'))}</button>
        <button type="button" class="trim-tool-button" data-trim-tool="flip-vertical">${escapeHtml(t('nodes.trim.imageTools.flipVerticalShort'))}</button>
        <button type="button" class="trim-tool-button" data-trim-tool="reset-transform">${escapeHtml(t('nodes.trim.imageTools.reset'))}</button>
      </div>

      <div class="trim-stage-wrapper">
        <div class="trim-image-stage">
          <img data-trim-image src="${session.sourcePreview.url}" alt="${escapeHtml(session.sourcePreview.name)}" />
        </div>
      </div>

      <div class="trim-image-controls">
        <div class="trim-control">
          <label>
            <span>${escapeHtml(t('nodes.trim.imageControls.aspect'))}</span>
            <select data-trim-aspect>
              ${aspectOptions
        .map(
          option => `
                  <option value="${option}" ${option === session.draftAspectMode ? 'selected' : ''}>
                    ${escapeHtml(t('nodes.trim.imageControls.aspectOption.' + option))}
                  </option>`
        )
        .join('')}
            </select>
          </label>
        </div>
      </div>

      <p class="trim-modal-hint">${escapeHtml(t('nodes.trim.modalPlaceholder.image'))}</p>
      <div class="trim-modal-actions">
        <button type="button" class="pill-button" data-trim-reset>${escapeHtml(t('actions.reset'))}</button>
        <span class="trim-modal-actions-spacer"></span>
        <button type="button" class="pill-button" data-trim-cancel>${escapeHtml(t('actions.cancel'))}</button>
        <button type="button" class="pill-button primary" data-trim-save>${escapeHtml(t('actions.save'))}</button>
      </div>
    `;
    const imageElement = modalContentElement.querySelector<HTMLImageElement>('[data-trim-image]');
    if (imageElement && (imageElement.complete ?? false)) {
      initializeTrimImageControls(session, imageElement);
    } else if (imageElement) {
      imageElement.addEventListener('load', () => initializeTrimImageControls(session, imageElement), { once: true });
    }
  };

  const renderTrimModalView = (state: Extract<ActiveModalState, { type: 'trim' }>): void => {
    if (!modalContentElement || !modalTitleElement) {
      return;
    }
    renderTrimImageModal(state);
  };

  const renderActiveModal = (): void => {
    if (!activeModal) {
      return;
    }
    switch (activeModal.type) {
      case 'trim':
        renderTrimModalView(activeModal);
        break;
      default:
        break;
    }
    modalBackdrop?.setAttribute('data-open', 'true');
    modalContainer?.setAttribute('aria-hidden', 'false');
    modalContainer?.focus();
  };

  const persistTrimSettings = async (
    nodeId: string,
    mutate: (settings: TrimNodeSettings) => void,
    toastKey: string
  ): Promise<void> => {
    const targetNode = state.nodes.find(entry => entry.id === nodeId);
    if (!targetNode) {
      closeActiveModal();
      return;
    }
    const settings = ensureTrimSettings(targetNode);
    mutate(settings);
    const sourcePreview = findTrimSourcePreview(nodeId);
    const region = settings.region ?? DEFAULT_TRIM_REGION;
    const zoomFactor = settings.zoom ?? 1;
    const widthHint = sourcePreview?.width ? Math.round(sourcePreview.width * region.width * zoomFactor) : null;
    const heightHint = sourcePreview?.height ? Math.round(sourcePreview.height * region.height * zoomFactor) : null;
    const durationMs = sourcePreview?.durationMs ?? null;
    const sourceId = state.connections.find(conn => conn.toNodeId === nodeId && conn.toPortId === 'source')?.fromNodeId;
    const signature = sourcePreview ? buildTrimSignature(sourceId ?? nodeId, sourcePreview, settings) : null;

    const applyFallback = () => {
      scheduleTrimPreviewUpdate(targetNode);
    };

    if (nodevision?.generateCroppedPreview && sourcePreview?.filePath) {
      try {
        console.debug('[NodeVision][debug] ffmpeg crop request', {
          nodeId,
          region,
          regionSpace: 'image',
          zoom: settings.zoom,
          rotationDeg: settings.rotationDeg,
          flipH: settings.flipHorizontal,
          flipV: settings.flipVertical,
          widthHint,
          heightHint,
          source: {
            width: sourcePreview.width,
            height: sourcePreview.height,
            filePath: sourcePreview.filePath,
            url: sourcePreview.url
          }
        });
        const response = await nodevision.generateCroppedPreview({
          sourcePath: sourcePreview.filePath,
          kind: sourcePreview.kind,
          region,
          regionSpace: 'image',
          rotationDeg: settings.rotationDeg,
          zoom: settings.zoom,
          flipHorizontal: settings.flipHorizontal,
          flipVertical: settings.flipVertical,
          aspectMode: settings.aspectMode,
          widthHint,
          heightHint,
          durationMs
        });
        if (response?.ok && response.preview) {
          const updated: NodeMediaPreview = {
            ...sourcePreview,
            ...response.preview,
            ownedUrl: true,
            derivedFrom: signature ?? undefined,
            cropRegion: region,
            cropSpace: 'image',
            cropRotationDeg: settings.rotationDeg ?? 0,
            cropZoom: settings.zoom ?? 1,
            cropFlipHorizontal: settings.flipHorizontal ?? false,
            cropFlipVertical: settings.flipVertical ?? false,
            isCroppedOutput: true
          };
          console.debug('[NodeVision][debug] ffmpeg crop response', {
            nodeId,
            preview: {
              url: response.preview.url,
              width: response.preview.width,
              height: response.preview.height,
              duration: response.preview.durationMs
            }
          });
          state.mediaPreviews.set(nodeId, updated);
          commitState();
          closeActiveModal();
          showToast(t(toastKey));
          renderNodes();
          return;
        }
      } catch (error) {
        console.warn('[NodeVision] generateCroppedPreview failed, fallback to client crop', error);
      }
    }

    applyFallback();
    closeActiveModal();
    commitState();
    showToast(t(toastKey));
  };


  const initializeTrimImageControls = (session: TrimImageModalState, imageElement: HTMLImageElement): void => {
    const modalContent = modalContentElement;
    if (!modalContent || !imageElement) {
      return;
    }
    session.draftRegionSpace = 'image';

    const getAspectRatio = (mode: TrimNodeSettings['aspectMode']): number => {
      const w = session.sourcePreview?.width ?? imageElement.naturalWidth ?? 1;
      const h = session.sourcePreview?.height ?? imageElement.naturalHeight ?? 1;
      switch (mode) {
        case 'original':
          return w / h;
        case 'square':
          return 1;
        case '2:1':
          return 2 / 1;
        case '3:1':
          return 3 / 1;
        case '4:3':
          return 4 / 3;
        case '16:9':
          return 16 / 9;
        case '9:16':
          return 9 / 16;
        case '1.618:1':
          return 1.61803398875;
        case 'free':
        default:
          return NaN;
      }
    };

    if (activeCropper) {
      activeCropper.destroy();
      activeCropper = null;
    }

    const aspectRatio = getAspectRatio(session.draftAspectMode ?? 'free');
    let cropper: CropperType | null = null;
    try {
      cropper = new Cropper(imageElement, {
        viewMode: 1,
        dragMode: 'move',
        aspectRatio: aspectRatio || NaN,
        autoCropArea: 1,
        movable: true,
        zoomable: true,
        rotatable: true,
        scalable: true,
        background: false,
        responsive: true
      });
      activeCropper = cropper;
    } catch (error) {
      console.error('[NodeVision] Cropper initialization failed', error);
      activeCropper = null;
      return;
    }

    const restoreInitialRegion = (): void => {
      const imgW = imageElement.naturalWidth || session.sourcePreview?.width || 1;
      const imgH = imageElement.naturalHeight || session.sourcePreview?.height || 1;
      const region = session.draftRegion ?? DEFAULT_TRIM_REGION;
      cropper.setData({
        x: region.x * imgW,
        y: region.y * imgH,
        width: region.width * imgW,
        height: region.height * imgH,
        rotate: session.draftRotationDeg ?? 0,
        scaleX: session.draftFlipHorizontal ? -1 : 1,
        scaleY: session.draftFlipVertical ? -1 : 1
      });
    };

    restoreInitialRegion();

    const aspectSelect = modalContent.querySelector<HTMLSelectElement>('[data-trim-aspect]');
    aspectSelect?.addEventListener('change', ev => {
      const mode = (ev.target as HTMLSelectElement).value as TrimNodeSettings['aspectMode'];
      session.draftAspectMode = mode;
      const ratio = getAspectRatio(mode);
      cropper.setAspectRatio(ratio || NaN);
    });

    modalContent.querySelectorAll<HTMLButtonElement>('[data-trim-tool]').forEach(button => {
      const tool = button.dataset.trimTool;
      button.addEventListener('click', () => {
        switch (tool) {
          case 'zoom-in':
            cropper.zoom(0.1);
            break;
          case 'zoom-out':
            cropper.zoom(-0.1);
            break;
          case 'rotate-left':
            cropper.rotate(-90);
            break;
          case 'rotate-right':
            cropper.rotate(90);
            break;
          case 'flip-horizontal': {
            const data = cropper.getData();
            const nextScaleX = (data.scaleX ?? 1) * -1;
            cropper.scaleX(nextScaleX);
            break;
          }
          case 'flip-vertical': {
            const data = cropper.getData();
            const nextScaleY = (data.scaleY ?? 1) * -1;
            cropper.scaleY(nextScaleY);
            break;
          }
          case 'reset-transform': {
            const currentAspect = session.draftAspectMode ?? 'free';
            cropper.reset();
            cropper.setAspectRatio(getAspectRatio(currentAspect) || NaN);
            break;
          }
          default:
            break;
        }
      });
    });

    modalContent.querySelector('[data-trim-reset]')?.addEventListener('click', () => {
      session.draftAspectMode = 'free';
      aspectSelect && (aspectSelect.value = 'free');
      cropper.reset();
      cropper.setAspectRatio(NaN);
    });

    modalContent.querySelector('[data-trim-cancel]')?.addEventListener('click', () => {
      activeCropper?.destroy();
      activeCropper = null;
      closeActiveModal();
    });

    modalContent.querySelector('[data-trim-save]')?.addEventListener('click', () => {
      const data = cropper.getData();
      const imageData = cropper.getImageData();
      const canvasData = cropper.getCanvasData();

      const imgW = imageData.naturalWidth || imageData.width || imageElement.naturalWidth || 1;
      const imgH = imageData.naturalHeight || imageData.height || imageElement.naturalHeight || 1;

      const region = {
        x: data.x / imgW,
        y: data.y / imgH,
        width: data.width / imgW,
        height: data.height / imgH
      };

      const zoom = imgW ? canvasData.width / imgW : 1;
      const rotation = data.rotate ?? 0;
      const flipH = (data.scaleX ?? 1) < 0;
      const flipV = (data.scaleY ?? 1) < 0;

      session.draftRegion = region;
      session.draftRegionSpace = 'image';
      session.draftRotationDeg = rotation;
      session.draftZoom = zoom;
      session.draftFlipHorizontal = flipH;
      session.draftFlipVertical = flipV;

      void persistTrimSettings(
        session.nodeId,
        settings => {
          settings.region = region;
          settings.regionSpace = 'image';
          settings.rotationDeg = rotation;
          settings.zoom = zoom;
          settings.flipHorizontal = flipH;
          settings.flipVertical = flipV;
          settings.aspectMode = session.draftAspectMode ?? 'free';
        },
        'nodes.trim.toast.imageSaved'
      );
    });
  };
  const openTrimModal = async (nodeId: string): Promise<void> => {
    ensureModalHost();
    modalLastFocused =
      document.activeElement instanceof HTMLElement ? (document.activeElement as HTMLElement) : null;
    const targetNode = state.nodes.find(entry => entry.id === nodeId);
    if (!targetNode) {
      console.warn('[NodeVision] trim modal requested for missing node', nodeId);
      return;
    }
    const settings = ensureTrimSettings(targetNode);
    const sourcePreview = findTrimSourcePreview(nodeId);
    let modalPreview: NodeMediaPreview | null = null;
    if (sourcePreview) {
      const frameCanvas = await captureFrameForPreview(sourcePreview);
      if (frameCanvas) {
        modalPreview = {
          ...sourcePreview,
          kind: 'image',
          type: 'image/png',
          width: frameCanvas.width,
          height: frameCanvas.height,
          url: frameCanvas.toDataURL('image/png')
        };
      } else if (sourcePreview.kind === 'image') {
        modalPreview = sourcePreview;
      }
    }
    const baseRegion = settings.region ?? DEFAULT_TRIM_REGION;
    const normalizedRegion =
      settings.regionSpace === 'stage' ? { ...baseRegion } : baseRegion;
    activeModal = {
      type: 'trim',
      nodeId,
      draftRegion: { ...normalizedRegion },
      draftRegionSpace: 'image',
      sourcePreview: modalPreview,
      draftRotationDeg: settings.rotationDeg ?? 0,
      draftZoom: settings.zoom ?? 1,
      draftFlipHorizontal: settings.flipHorizontal ?? false,
      draftFlipVertical: settings.flipVertical ?? false,
      draftAspectMode: settings.aspectMode ?? 'free',
      showGrid: false,
      lastPreferredAxis: null
    };
    renderActiveModal();
  };

  let openSidebarPanel: ((panelId: string | null) => void) | null = null;
  let workflowNameDialogResolver: ((value: string | null) => void) | null = null;

  function getWorkflowDisplayName(): string {
    return state.workflowName || unsavedWorkflowLabel;
  }

  function formatWorkflowTimestamp(value: string): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function updateWorkflowNameUi(): void {
    const label = getWorkflowDisplayName();
    elements.workflowNameLabel.textContent = state.workflowDirty ? label + ' *' : label;
  }

  function syncUnsavedWorkflowLabel(): void {
    const previousLabel = unsavedWorkflowLabel;
    const translated = t('workflow.unsaved');
    unsavedWorkflowLabel = translated;
    if (!state.activeWorkflowId && (!state.workflowName || state.workflowName === previousLabel)) {
      state.workflowName = translated;
    }
    updateWorkflowNameUi();
  }

  function markWorkflowDirty(): void {
    if (!state.workflowDirty) {
      state.workflowDirty = true;
      updateWorkflowNameUi();
    }
  }

  function setUnsavedWorkflow(options: { dirty?: boolean } = {}): void {
    state.activeWorkflowId = null;
    state.workflowName = unsavedWorkflowLabel;
    if (typeof options.dirty === 'boolean') {
      state.workflowDirty = options.dirty;
    }
    updateWorkflowNameUi();
  }

  const sanitizeWorkflowRecords = (records: unknown): StoredWorkflow[] => {
    if (!Array.isArray(records)) {
      return [];
    }
    return records
      .map(item => {
        if (!item || typeof item !== 'object') {
          return null;
        }
        const record = item as Record<string, unknown>;
        const id = typeof record.id === 'string' ? record.id : null;
        const name = typeof record.name === 'string' ? record.name : null;
        const data = typeof record.data === 'string' ? record.data : null;
        if (!id || !name || !data) {
          return null;
        }
        const updatedAtRaw = typeof record.updatedAt === 'string' ? record.updatedAt : null;
        const parsed = updatedAtRaw ? new Date(updatedAtRaw) : null;
        const updatedAt = parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString();
        return { id, name, data, updatedAt } as StoredWorkflow;
      })
      .filter((workflow): workflow is StoredWorkflow => Boolean(workflow));
  };

  function readStoredWorkflowsFallback(): StoredWorkflow[] {
    try {
      if (typeof localStorage === 'undefined') {
        return [];
      }
      const raw = localStorage.getItem(WORKFLOW_STORAGE_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw);
      return sanitizeWorkflowRecords(parsed);
    } catch (error) {
      console.warn('[NodeVision] Failed to load workflows', error);
      return [];
    }
  }

  function persistWorkflowsLocal(): void {
    try {
      if (typeof localStorage === 'undefined') {
        return;
      }
      localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(state.workflows));
    } catch (error) {
      console.warn('[NodeVision] Failed to persist workflows', error);
    }
  }

  function persistWorkflows(): void {
    if (nodevision?.saveWorkflows) {
      nodevision
        .saveWorkflows(state.workflows)
        .then(result => {
          if (!result?.ok) {
            console.warn('[NodeVision] Failed to persist workflows', result?.message ?? 'unknown error');
          }
        })
        .catch(error => console.warn('[NodeVision] Failed to persist workflows', error));
      return;
    }
    persistWorkflowsLocal();
  }

  function sortWorkflows(): void {
    state.workflows.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  function renderWorkflowList(): void {
    if (!elements.workflowList) return;
    if (elements.workflowSearch) {
      elements.workflowSearch.value = state.workflowSearch;
    }
    const term = state.workflowSearch.trim().toLowerCase();
    const filtered = state.workflows.filter(workflow => workflow.name.toLowerCase().includes(term));
    elements.workflowList.innerHTML = '';
    if (!filtered.length) {
      elements.workflowEmpty.style.display = 'block';
      return;
    }
    elements.workflowEmpty.style.display = 'none';
    filtered.forEach(workflow => {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.workflowId = workflow.id;
      button.classList.toggle('active', state.activeWorkflowId === workflow.id);
      button.innerHTML =
        '<span class="workflow-item-name">' +
        escapeHtml(workflow.name) +
        '</span><br /><span class="workflow-item-meta">' +
        escapeHtml(formatWorkflowTimestamp(workflow.updatedAt)) +
        '</span>';
      li.appendChild(button);
      elements.workflowList.appendChild(li);
    });
  }

  function hydrateStoredWorkflows(): void {
    if (nodevision?.loadWorkflows) {
      nodevision
        .loadWorkflows()
        .then(response => {
          if (!response?.ok) {
            console.warn('[NodeVision] Failed to load workflows via bridge', response?.message ?? 'unknown error');
            state.workflows = readStoredWorkflowsFallback();
          } else {
            state.workflows = sanitizeWorkflowRecords(response.workflows ?? []);
          }
          sortWorkflows();
          renderWorkflowList();
        })
        .catch(error => {
          console.warn('[NodeVision] Failed to load workflows via bridge', error);
          state.workflows = readStoredWorkflowsFallback();
          sortWorkflows();
          renderWorkflowList();
        });
      return;
    }
    state.workflows = readStoredWorkflowsFallback();
    sortWorkflows();
    renderWorkflowList();
  }

  function toggleWorkflowMenu(force?: boolean): void {
    const next = typeof force === 'boolean' ? force : !state.workflowMenuOpen;
    state.workflowMenuOpen = next;
    elements.workflowMenu.dataset.open = next ? 'true' : 'false';
    elements.workflowMenu.setAttribute('aria-hidden', next ? 'false' : 'true');
    elements.workflowToggle.setAttribute('aria-expanded', next ? 'true' : 'false');
  }

  function closeWorkflowMenu(): void {
    if (state.workflowMenuOpen) {
      toggleWorkflowMenu(false);
    }
  }

  function closeWorkflowContextMenu(): void {
    if (!state.workflowContextMenuOpen) {
      state.workflowContextTargetId = null;
      return;
    }
    state.workflowContextMenuOpen = false;
    state.workflowContextTargetId = null;
    elements.workflowContextMenu.dataset.open = 'false';
    elements.workflowContextMenu.setAttribute('aria-hidden', 'true');
  }

  function positionWorkflowContextMenu(clientX: number, clientY: number): void {
    const padding = 12;
    const width = 200;
    const height = 80;
    const left = Math.max(padding, Math.min(window.innerWidth - width, clientX));
    const top = Math.max(padding, Math.min(window.innerHeight - height, clientY));
    elements.workflowContextMenu.style.left = `${left}px`;
    elements.workflowContextMenu.style.top = `${top}px`;
  }

  function openWorkflowContextMenu(workflowId: string, clientX: number, clientY: number): void {
    closeWorkflowContextMenu();
    state.workflowContextTargetId = workflowId;
    state.workflowContextMenuOpen = true;
    positionWorkflowContextMenu(clientX, clientY);
    elements.workflowContextMenu.dataset.open = 'true';
    elements.workflowContextMenu.setAttribute('aria-hidden', 'false');
  }

  function openWorkflowBrowserPanel(): void {
    openSidebarPanel?.('panel-workflows');
  }

  function setWorkflowNameDialogVisibility(open: boolean): void {
    elements.workflowNameDialog.dataset.open = open ? 'true' : 'false';
    elements.workflowNameDialog.setAttribute('aria-hidden', open ? 'false' : 'true');
    document.body.classList.toggle('modal-open', open);
  }

  const closeWorkflowNameDialog = (result: string | null): void => {
    if (!workflowNameDialogResolver) {
      return;
    }
    setWorkflowNameDialogVisibility(false);
    workflowNameDialogResolver(result);
    workflowNameDialogResolver = null;
  };

  const promptWorkflowName = (initial?: string): Promise<string | null> => {
    if (workflowNameDialogResolver) {
      workflowNameDialogResolver(null);
    }
    elements.workflowNameInput.value = initial ?? getWorkflowDisplayName();
    elements.workflowNameInput.dataset.invalid = 'false';
    setWorkflowNameDialogVisibility(true);
    setTimeout(() => {
      elements.workflowNameInput.focus();
      elements.workflowNameInput.select();
    }, 0);
    return new Promise(resolve => {
      workflowNameDialogResolver = resolve;
    });
  };

  const submitWorkflowNameDialog = (): void => {
    const value = elements.workflowNameInput.value.trim();
    if (!value) {
      elements.workflowNameInput.dataset.invalid = 'true';
      elements.workflowNameInput.focus();
      return;
    }
    elements.workflowNameInput.dataset.invalid = 'false';
    closeWorkflowNameDialog(value);
  };

  const cancelWorkflowNameDialog = (): void => {
    closeWorkflowNameDialog(null);
  };

  const deleteWorkflowById = (workflowId: string | null): void => {
    if (!workflowId) {
      return;
    }
    const current = findWorkflowById(workflowId);
    if (!current) {
      return;
    }
    if (!window.confirm(t('workflow.confirmDelete', { name: current.name }))) {
      return;
    }
    state.workflows = state.workflows.filter(workflow => workflow.id !== workflowId);
    persistWorkflowsAndRender();
    if (state.activeWorkflowId === workflowId) {
      setUnsavedWorkflow({ dirty: true });
    }
    closeWorkflowContextMenu();
  };

  function persistWorkflowsAndRender(): void {
    sortWorkflows();
    persistWorkflows();
    renderWorkflowList();
  }

  function handleWorkflowSave(): void {
    if (!state.activeWorkflowId) {
      void handleWorkflowSaveAs();
      return;
    }
    const existing = findWorkflowById(state.activeWorkflowId);
    if (!existing) {
      handleWorkflowSaveAs();
      return;
    }
    const updated: StoredWorkflow = {
      ...existing,
      data: getSerializedProjectJson(),
      updatedAt: new Date().toISOString()
    };
    persistWorkflowRecord(updated);
    state.workflowName = updated.name;
    state.workflowDirty = false;
    updateWorkflowNameUi();
    renderWorkflowList();
    closeWorkflowMenu();
  }

  async function handleWorkflowSaveAs(): Promise<void> {
    const name = await promptWorkflowName(state.workflowName);
    if (!name) return;
    const entry: StoredWorkflow = {
      id: createId('workflow'),
      name,
      data: getSerializedProjectJson(),
      updatedAt: new Date().toISOString()
    };
    persistWorkflowRecord(entry);
    state.activeWorkflowId = entry.id;
    state.workflowName = entry.name;
    state.workflowDirty = false;
    updateWorkflowNameUi();
    renderWorkflowList();
    closeWorkflowMenu();
  }

  async function handleWorkflowRename(): Promise<void> {
    const workflow = findWorkflowById(state.activeWorkflowId);
    if (!workflow) {
      await handleWorkflowSaveAs();
      return;
    }
    const name = await promptWorkflowName(workflow.name);
    if (!name) return;
    workflow.name = name;
    workflow.updatedAt = new Date().toISOString();
    persistWorkflowRecord(workflow);
    state.workflowName = name;
    state.workflowDirty = false;
    updateWorkflowNameUi();
    renderWorkflowList();
    closeWorkflowMenu();
  }

  function handleWorkflowClear(): void {
    if (!window.confirm(t('workflow.confirmClear'))) {
      return;
    }
    const blank = {
      schemaVersion: SCHEMA,
      nodes: [],
      connections: []
    };
    applyProjectJson(JSON.stringify(blank), { markDirty: false });
    setUnsavedWorkflow({ dirty: false });
    closeWorkflowMenu();
  }

  function handleWorkflowFileLoad(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.position = 'fixed';
    input.style.left = '-1000px';
    const cleanup = (): void => {
      input.remove();
    };
    input.addEventListener(
      'change',
      () => {
        const file = input.files && input.files[0];
        if (!file) {
          cleanup();
          return;
        }
        const reader = new FileReader();
        reader.addEventListener('error', () => {
          alert(t('errors.jsonLoadFailed', { reason: reader.error?.message ?? 'unknown' }));
          cleanup();
        });
        reader.addEventListener('load', () => {
          try {
            const text = typeof reader.result === 'string' ? reader.result : '';
            elements.json.value = text;
            loadFromTextarea();
          } catch (error) {
            alert(t('errors.jsonLoadFailed', { reason: getErrorMessage(error) }));
          } finally {
            cleanup();
          }
        });
        reader.readAsText(file, 'utf-8');
      },
      { once: true }
    );
    document.body.appendChild(input);
    input.click();
  }

  function handleWorkflowMenuAction(action: string): void {
    switch (action) {
      case 'rename':
        void handleWorkflowRename();
        break;
      case 'fileSave':
        serializeAndDownload();
        closeWorkflowMenu();
        break;
      case 'fileLoad':
        closeWorkflowMenu();
        handleWorkflowFileLoad();
        break;
      case 'saveAs':
        void handleWorkflowSaveAs();
        break;
      case 'clear':
        handleWorkflowClear();
        break;
      case 'browse':
        closeWorkflowMenu();
        openWorkflowBrowserPanel();
        break;
      default:
        break;
    }
  }

  const formatTimestamp = (milliseconds: number | undefined): string => {
    if (typeof milliseconds !== 'number' || Number.isNaN(milliseconds)) {
      return '—';
    }
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString();
  };

  const formatIsoTime = (value: string | null | undefined): string => {
    if (!value) {
      return '—';
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString();
  };

  const logLevelClass = (level: string): string => {
    if (level === 'error') return 'log-error';
    if (level === 'warn') return 'log-warn';
    return 'log-info';
  };

  const showToast = (message: string, type: 'info' | 'error' = 'info'): void => {
    elements.toast.textContent = message;
    elements.toast.classList.remove('error');
    if (type === 'error') {
      elements.toast.classList.add('error');
    }
    elements.toast.classList.add('visible');
    setTimeout(() => elements.toast.classList.remove('visible'), 3000);
  };

  const cleanupMediaPreview = (nodeId: string): void => {
    const preview = state.mediaPreviews.get(nodeId);
    if (preview && preview.ownedUrl !== false && typeof URL?.revokeObjectURL === 'function') {
      URL.revokeObjectURL(preview.url);
    }
    if (preview) {
      state.mediaPreviews.delete(nodeId);
    }
  };

  const getMediaPreview = (nodeId: string) => state.mediaPreviews.get(nodeId);

  const cleanupAllMediaPreviews = (): void => {
    state.mediaPreviews.forEach(preview => {
      if (preview.ownedUrl !== false && typeof URL?.revokeObjectURL === 'function') {
        URL.revokeObjectURL(preview.url);
      }
    });
    state.mediaPreviews.clear();
  };

  const trimPreviewTasks = new Map<string, Promise<void>>();

  const getPreviewWorkbench = (): HTMLElement | null => {
    if (typeof document === 'undefined') {
      return null;
    }
    let container = document.getElementById('nodevision-trim-previews');
    if (!container) {
      container = document.createElement('div');
      container.id = 'nodevision-trim-previews';
      Object.assign(container.style, {
        position: 'fixed',
        left: '-9999px',
        top: '-9999px',
        width: '1px',
        height: '1px',
        overflow: 'hidden'
      });
      document.body.appendChild(container);
    }
    return container;
  };

  const captureImageFrame = (preview: NodeMediaPreview): Promise<HTMLCanvasElement | null> =>
    new Promise(resolve => {
      if (typeof document === 'undefined') {
        resolve(null);
        return;
      }
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;
        canvas.width = width || 1;
        canvas.height = height || 1;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas);
          return;
        }
        resolve(null);
      };
      img.onerror = () => resolve(null);
      img.src = preview.url;
    });

  const captureVideoFrame = (preview: NodeMediaPreview): Promise<HTMLCanvasElement | null> =>
    new Promise(resolve => {
      if (typeof document === 'undefined') {
        resolve(null);
        return;
      }
      const workbench = getPreviewWorkbench();
      if (!workbench) {
        resolve(null);
        return;
      }
      const video = document.createElement('video');
      video.preload = 'auto';
      video.muted = true;
      video.playsInline = true;
      video.controls = false;
      video.style.width = '1px';
      video.style.height = '1px';
      const cleanup = () => {
        video.pause();
        video.removeAttribute('src');
        try {
          video.load();
        } catch {
          /* noop */
        }
        video.remove();
      };
      const drawFrame = () => {
        const width = video.videoWidth || 0;
        const height = video.videoHeight || 0;
        if (!width || !height) {
          cleanup();
          resolve(null);
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          cleanup();
          resolve(null);
          return;
        }
        ctx.drawImage(video, 0, 0, width, height);
        cleanup();
        resolve(canvas);
      };
      const handleSeeked = () => {
        video.removeEventListener('seeked', handleSeeked);
        drawFrame();
      };
      video.onloadeddata = () => {
        drawFrame();
      };
      video.onerror = () => {
        cleanup();
        resolve(null);
      };
      workbench.appendChild(video);
      try {
        video.src = preview.url;
        video.load();
      } catch {
        cleanup();
        resolve(null);
      }
    });

  const captureFrameForPreview = (preview: NodeMediaPreview): Promise<HTMLCanvasElement | null> => {
    if (preview.kind === 'image') {
      return captureImageFrame(preview);
    }
    return captureVideoFrame(preview);
  };

  const clampTrimRotation = (value: number | null | undefined): number => {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return 0;
    }
    return Math.max(-180, Math.min(180, value));
  };
  const clampTrimZoom = (value: number | null | undefined): number => {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return 1;
    }
    return Math.max(0.25, Math.min(4, value));
  };

  const buildTrimSignature = (
    sourceNodeId: string,
    sourcePreview: NodeMediaPreview,
    settings: TrimNodeSettings
  ): string => {
    const region = settings.region ?? { x: 0, y: 0, width: 1, height: 1 };
    return [
      sourceNodeId,
      sourcePreview.url,
      sourcePreview.width ?? 'auto',
      sourcePreview.height ?? 'auto',
      region.x ?? 0,
      region.y ?? 0,
      region.width ?? 1,
      region.height ?? 1,
      clampTrimRotation(settings.rotationDeg),
      clampTrimZoom(settings.zoom),
      settings.flipHorizontal ? 'fh' : 'nh',
      settings.flipVertical ? 'fv' : 'nv',
      settings.aspectMode ?? 'free'
    ].join('|');
  };

  const findTrimSourcePreview = (nodeId: string): NodeMediaPreview | null => {
    const connection = state.connections.find(
      conn => conn.toNodeId === nodeId && conn.toPortId === 'source'
    );
    if (!connection) {
      return null;
    }
    return state.mediaPreviews.get(connection.fromNodeId) ?? null;
  };

  const deriveTrimPreview = async (node: RendererNode): Promise<void> => {
    if (node.typeId !== 'trim') {
      return;
    }
    const sourcePreview = findTrimSourcePreview(node.id);
    if (!sourcePreview) {
      cleanupMediaPreview(node.id);
      return;
    }
    const settings = ensureTrimSettings(node);
    const sourceId = state.connections.find(
      conn => conn.toNodeId === node.id && conn.toPortId === 'source'
    )?.fromNodeId;
    const signature = buildTrimSignature(sourceId ?? node.id, sourcePreview, settings);
    const existing = state.mediaPreviews.get(node.id);
    if (existing?.derivedFrom === signature) {
      return;
    }
    const frameCanvas = await captureFrameForPreview(sourcePreview);
    if (!frameCanvas) {
      cleanupMediaPreview(node.id);
      state.mediaPreviews.set(node.id, {
        ...sourcePreview,
        ownedUrl: false,
        derivedFrom: signature
      });
      renderNodes();
      return;
    }
    const cropRegion = settings.region ?? { x: 0, y: 0, width: 1, height: 1 };
    cleanupMediaPreview(node.id);
    state.mediaPreviews.set(node.id, {
      ...sourcePreview,
      cropRegion,
      cropSpace: 'image' as const,
      cropRotationDeg: settings.rotationDeg ?? 0,
      cropZoom: settings.zoom ?? 1,
      cropFlipHorizontal: settings.flipHorizontal ?? false,
      cropFlipVertical: settings.flipVertical ?? false,
      ownedUrl: sourcePreview.ownedUrl,
      derivedFrom: signature,
      name: `${sourcePreview.name} (trim)`
    });
    renderNodes();
  };

  const scheduleTrimPreviewUpdate = (node: RendererNode): void => {
    if (node.typeId !== 'trim') {
      return;
    }
    if (trimPreviewTasks.has(node.id)) {
      return;
    }
    const task = deriveTrimPreview(node)
      .catch(error => console.warn('[NodeVision] trim preview update failed', error))
      .finally(() => trimPreviewTasks.delete(node.id));
    trimPreviewTasks.set(node.id, task);
  };

  const getNodeChromePadding = (nodeId: string): number => {
    const stored = state.nodeChrome.get(nodeId);
    if (typeof stored === 'number' && stored >= MIN_NODE_CHROME) {
      return Math.min(NODE_MAX_HEIGHT, stored);
    }
    return DEFAULT_NODE_CHROME;
  };

  const getPreviewWidthForNodeWidth = (nodeWidth: number): number =>
    Math.max(MIN_PREVIEW_WIDTH, nodeWidth - HORIZONTAL_PREVIEW_PADDING);

  const getPreviewAspectRatio = (nodeId: string): number => {
    const preview = state.mediaPreviews.get(nodeId);
    if (preview?.width && preview?.height) {
      const ratio = preview.width / preview.height;
      if (Number.isFinite(ratio) && ratio > 0) {
        return ratio;
      }
    }
    return PREVIEW_FRAME_RATIO;
  };

  const updateNodeMediaPreviewStyles = (node: RendererNode, element: HTMLElement): void => {
    const mediaBlocks = element.querySelectorAll<HTMLElement>('.node-media');
    if (!mediaBlocks.length) {
      return;
    }
    const nodeSize = state.nodeSizes.get(node.id) ?? {
      width: node.width ?? NODE_MIN_WIDTH,
      height: node.height ?? NODE_MIN_HEIGHT
    };
    const chrome = getNodeChromePadding(node.id);
    let sourceNodeId: string | null = node.id;
    let reservedHeight = 0;
    let previewData = state.mediaPreviews.get(node.id);
    if (node.typeId === 'mediaPreview') {
      const connection = state.connections.find(
        conn => conn.toNodeId === node.id && conn.toPortId === 'source'
      );
      sourceNodeId = connection?.fromNodeId ?? node.id;
      previewData = sourceNodeId ? state.mediaPreviews.get(sourceNodeId) : undefined;
      reservedHeight = getMediaPreviewReservedHeight(Boolean(previewData));
    } else if (LOAD_NODE_TYPE_IDS.has(node.typeId)) {
      reservedHeight = getLoadNodeReservedHeight(Boolean(previewData));
    } else {
      previewData = undefined;
    }
    const widthLimit = getPreviewWidthForNodeWidth(nodeSize.width);
    const ratio = getPreviewAspectRatio(sourceNodeId ?? node.id);
    let previewFillPortion = 0.6;
    if (node.typeId === 'mediaPreview') {
      previewFillPortion = 0.95;
    } else if (LOAD_NODE_TYPE_IDS.has(node.typeId)) {
      previewFillPortion = 0.85;
    }
    const previewBox = calculatePreviewSize({
      nodeWidth: nodeSize.width,
      nodeHeight: nodeSize.height,
      chromePadding: chrome,
      reservedHeight,
      widthLimit,
      minHeight: MIN_PREVIEW_HEIGHT,
      minWidth: MIN_PREVIEW_WIDTH,
      aspectRatio: ratio,
      originalWidth: previewData?.width ?? null,
      originalHeight: previewData?.height ?? null,
      minimumNodePortion: previewFillPortion
    });
    mediaBlocks.forEach(block => {
      block.style.setProperty('--preview-width', `${previewBox.width}px`);
      block.style.setProperty('--preview-height', `${previewBox.height}px`);
    });
  };

  if (typeof ResizeObserver === 'function') {
    nodeResizeObserver = new ResizeObserver(entries => {
      entries.forEach(entry => {
        const target = entry.target as HTMLElement | null;
        const nodeId = target?.dataset?.id;
        if (!nodeId) {
          return;
        }
        const node = state.nodes.find(item => item.id === nodeId);
        if (!node) {
          return;
        }
        updateNodeMediaPreviewStyles(node, target);
      });
      refreshSelectionOutline();
    });
  }

  const getMinimumHeightForWidth = (nodeId: string, width: number): number => {
    const chrome = getNodeChromePadding(nodeId);
    const desiredPreviewWidth = getPreviewWidthForNodeWidth(width);
    const previewHeight = Math.max(MIN_PREVIEW_HEIGHT, desiredPreviewWidth / PREVIEW_FRAME_RATIO);
    const desired = previewHeight + chrome;
    return Math.max(NODE_MIN_HEIGHT, desired);
  };

  const pruneMediaPreviews = (): void => {
    const nodeIds = new Set(state.nodes.map(node => node.id));
    Array.from(state.mediaPreviews.keys()).forEach(nodeId => {
      if (!nodeIds.has(nodeId)) {
        cleanupMediaPreview(nodeId);
      }
    });
  };

  const clampWidth = (value: number): number => Math.min(NODE_MAX_WIDTH, Math.max(NODE_MIN_WIDTH, value));
  const clampHeight = (value: number): number => Math.min(NODE_MAX_HEIGHT, Math.max(NODE_MIN_HEIGHT, value));

  const ensureNodeSize = (node: RendererNode): NodeSize => {
    const stored = state.nodeSizes.get(node.id);
    const fallbackWidth = node.width ?? NODE_MIN_WIDTH;
    const fallbackHeight = node.height ?? NODE_MIN_HEIGHT;
    const width = clampWidth(stored?.width ?? fallbackWidth);
    const minHeight = getMinimumHeightForWidth(node.id, width);
    const height = Math.max(minHeight, clampHeight(stored?.height ?? fallbackHeight));
    const size: NodeSize = { width, height };
    if (!stored || stored.width !== width || stored.height !== height) {
      state.nodeSizes.set(node.id, size);
    }
    node.width = width;
    node.height = height;
    return size;
  };

  const pruneNodeSizes = (): void => {
    const nodeIds = new Set(state.nodes.map(node => node.id));
    Array.from(state.nodeSizes.keys()).forEach(nodeId => {
      if (!nodeIds.has(nodeId)) {
        state.nodeSizes.delete(nodeId);
      }
    });
  };

  const pruneNodeChrome = (): void => {
    const nodeIds = new Set(state.nodes.map(node => node.id));
    Array.from(state.nodeChrome.keys()).forEach(nodeId => {
      if (!nodeIds.has(nodeId)) {
        state.nodeChrome.delete(nodeId);
      }
    });
  };

  const syncNodeChromePadding = (): boolean => {
    let needsRerender = false;
    elements.nodeLayer.querySelectorAll<HTMLElement>('.node').forEach(el => {
      const nodeId = el.dataset.id;
      if (!nodeId) {
        return;
      }
      const previewEl = el.querySelector<HTMLElement>('.node-media-preview');
      if (!previewEl) {
        if (state.nodeChrome.has(nodeId)) {
          state.nodeChrome.delete(nodeId);
        }
        return;
      }
      const previewHeight = Math.max(
        MIN_PREVIEW_HEIGHT,
        Math.round(previewEl.scrollHeight || previewEl.getBoundingClientRect().height)
      );
      const chromeCandidate = Math.max(
        MIN_NODE_CHROME,
        Math.round(el.scrollHeight - previewHeight)
      );
      const stored = state.nodeChrome.get(nodeId);
      if (stored !== chromeCandidate) {
        state.nodeChrome.set(nodeId, chromeCandidate);
      }
      const size = state.nodeSizes.get(nodeId);
      if (size) {
        const minHeight = Math.max(NODE_MIN_HEIGHT, previewHeight + chromeCandidate);
        if (size.height < minHeight) {
          size.height = minHeight;
          const node = state.nodes.find(item => item.id === nodeId);
          if (node) {
            node.height = minHeight;
          }
          needsRerender = true;
        }
      }
    });
    return needsRerender;
  };

  const updateMediaPreviewDimensions = (
    nodeId: string,
    width: number | null,
    height: number | null,
    extra?: Partial<NodeMediaPreview>
  ): void => {
    const preview = state.mediaPreviews.get(nodeId);
    if (!preview) {
      return;
    }
    state.mediaPreviews.set(nodeId, {
      ...preview,
      width,
      height,
      ...(extra ?? {})
    });
    renderNodes();
  };

  const renderQueue = (): void => {
    const renderJobs = (container: HTMLElement, jobs: JobSnapshot[], emptyKey: string): void => {
      if (!jobs?.length) {
        container.innerHTML = `<p style="margin:4px 0;opacity:0.7;">${t(emptyKey)}</p>`;
        return;
      }
      container.innerHTML = jobs
        .map(job => `<div class="queue-row"><span>${escapeHtml(job.name ?? job.jobId ?? t('queue.defaultJob'))}</span><span class="queue-badge">${describeStatus(job.status)}</span></div>`)
        .join('');
    };

    renderJobs(elements.queueRunning, state.queue.active, 'queue.emptyActive');
    renderJobs(elements.queueQueued, state.queue.queued, 'queue.emptyQueued');
    renderQueueHistory();
    renderQueueWarnings();
  };

  const renderQueueHistory = (): void => {
    const history: JobHistoryEntry[] = (state.queue.history ?? []).slice(0, 20);
    if (!history.length) {
      elements.queueHistory.innerHTML = `<p style="opacity:0.7;">${t('queue.noHistory')}</p>`;
      return;
    }
    elements.queueHistory.innerHTML = history
      .map(entry => {
        const level = entry.logLevel ?? 'info';
        const message = entry.message ? escapeHtml(entry.message) : t('queue.noLogs');
        const finishedAt = entry.finishedAt ?? entry.startedAt ?? null;
        return `
          <div class="history-row">
            <div class="history-row-main">
              <span class="history-job">${escapeHtml(entry.name ?? t('queue.defaultJob'))}</span>
              <span class="queue-badge">${describeStatus(entry.status)}</span>
              <span class="log-level-badge ${logLevelClass(level)}">${level.toUpperCase()}</span>
              <span class="history-time">${formatTimestamp(finishedAt ?? undefined)}</span>
            </div>
            <p class="history-message">${message}</p>
          </div>
        `;
      })
      .join('');
  };

  const renderQueueWarnings = (): void => {
    const warnings = state.queue.warnings ?? [];
    const limits = state.queue.limits;
    if (!warnings.length) {
      const timeoutSeconds = Math.round(limits.queueTimeoutMs / 1000);
      elements.queueWarnings.innerHTML = `
        <div class="queue-warning queue-warning-info">
          <strong>${t('queue.stableTitle')}</strong>
          <span>${t('queue.stableSummary', {
        queued: state.queue.queued?.length ?? 0,
        limit: limits.maxQueueLength,
        timeout: timeoutSeconds || 0
      })}</span>
        </div>
      `;
      return;
    }
    elements.queueWarnings.innerHTML = warnings
      .map(warning => {
        const levelClass = warning.level === 'error' ? 'queue-warning-error' : warning.level === 'warn' ? 'queue-warning-warn' : 'queue-warning-info';
        return `
          <div class="queue-warning ${levelClass}">
            <strong>${warning.type}</strong>
            <span>${escapeHtml(warning.message)}</span>
            <span class="history-time">${formatIsoTime(warning.occurredAt)}</span>
          </div>
        `;
      })
      .join('');
  };

  const renderDiagnostics = () => {
    if (elements.crashConsent) {
      elements.crashConsent.checked = !!state.diagnostics.collectCrashDumps;
    }
    if (elements.exportStatus) {
      if (state.diagnostics.lastLogExportPath) {
        const sha = state.diagnostics.lastExportSha ?? t('diagnostics.unknownSha');
        elements.exportStatus.textContent = t('diagnostics.lastExport', {
          path: state.diagnostics.lastLogExportPath,
          sha
        });
      } else {
        elements.exportStatus.textContent = t('diagnostics.noExport');
      }
    }
    if (elements.inspectHistory) {
      const rows = (state.diagnostics.inspectHistory ?? [])
        .slice(0, 20)
        .map(item => {
          const level = item.logLevel ?? 'info';
          const infoParts = [
            `HTTP ${item.statusCode}`,
            item.responseCode ?? null,
            typeof item.clipCount === 'number' ? t('diagnostics.clipCount', { count: item.clipCount }) : null,
            item.remoteAddress ?? null
          ].filter(Boolean);
          return `
            <div class="inspect-row">
              <div class="inspect-row-main">
                <span class="log-level-badge ${logLevelClass(level)}">${level.toUpperCase()}</span>
                <span class="history-time">${formatIsoTime(item.timestamp)}</span>
              </div>
              <div class="inspect-row-meta">
                <strong>${escapeHtml(item.tokenLabel ?? t('diagnostics.defaultToken'))}</strong>
                <span>${infoParts.map(part => escapeHtml(part)).join(' · ') || t('diagnostics.noDetails')}</span>
              </div>
            </div>
          `;
        })
        .join('');
      elements.inspectHistory.innerHTML = rows || `<p style="opacity:0.7;">${t('diagnostics.historyEmpty')}</p>`;
    }
  };

  const getHighlightedNodeIds = (): Set<string> => {
    const ids = new Set<string>();
    state.connections.forEach(connection => {
      if (state.highlightedConnections.has(connection.id)) {
        ids.add(connection.fromNodeId);
        ids.add(connection.toNodeId);
      }
    });
    if (state.pressedNodeId) {
      ids.add(state.pressedNodeId);
    }
    return ids;
  };

  const applyNodeHighlightClasses = (): void => {
    const highlightedIds = getHighlightedNodeIds();
    elements.nodeLayer.querySelectorAll<HTMLElement>('.node').forEach(nodeEl => {
      const nodeId = nodeEl.dataset.id;
      if (!nodeId) return;
      nodeEl.classList.toggle('node-highlight', highlightedIds.has(nodeId));
    });
  };

  const renderConnections = (): void => {
    const activeIds = new Set(state.connections.map(connection => connection.id));
    state.highlightedConnections.forEach(id => {
      if (!activeIds.has(id)) {
        state.highlightedConnections.delete(id);
      }
    });
    if (!state.connections.length) {
      state.highlightedConnections.clear();
      elements.connectionsList.innerHTML = '<li class="connections-empty">' + t('connections.empty') + '</li>';
      renderConnectionPaths();
      applyNodeHighlightClasses();
      return;
    }
    elements.connectionsList.innerHTML = state.connections
      .map(connection => {
        const fromNode = state.nodes.find(node => node.id === connection.fromNodeId);
        const toNode = state.nodes.find(node => node.id === connection.toNodeId);
        const fromNodeTitle = fromNode ? getNodeTitle(fromNode) : connection.fromNodeId;
        const fromPort = fromNode?.outputs?.find(port => port.id === connection.fromPortId);
        const fromPortLabel = fromNode && fromPort ? getPortLabel(fromNode.typeId, fromPort) : connection.fromPortId;
        const fromLabel = fromNodeTitle + ' • ' + fromPortLabel;
        const toNodeTitle = toNode ? getNodeTitle(toNode) : connection.toNodeId;
        const toPort = toNode?.inputs?.find(port => port.id === connection.toPortId);
        const toPortLabel = toNode && toPort ? getPortLabel(toNode.typeId, toPort) : connection.toPortId;
        const toLabel = toNodeTitle + ' • ' + toPortLabel;
        const summary = t('connections.itemLabel', { from: fromLabel, to: toLabel });
        const isHighlighted = state.highlightedConnections.has(connection.id);
        const html = [
          '<li>',
          '<label class="connection-row">',
          '<input type="checkbox" data-connection-check="', escapeHtml(connection.id), '" ',
          isHighlighted ? 'checked aria-checked="true"' : '',
          ' />',
          '<span>', escapeHtml(summary), '</span>',
          '</label>',
          '</li>'
        ];
        return html.join('');
      })
      .join('');
    applyPressedNodeStyles();
    renderConnectionPaths();
    applyNodeHighlightClasses();
  };

  const setupSidebarPanels = (): void => {
    const container = document.getElementById('sidebar-panels');
    const sidebarEl = document.querySelector<HTMLElement>('.sidebar');
    const mainEl = document.querySelector<HTMLElement>('main');
    if (!container || !sidebarEl || !mainEl) {
      return;
    }
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.sidebar-icon'));
    const panels = new Map<string, HTMLElement>();
    buttons.forEach(button => {
      const panelId = button.dataset.panel;
      if (!panelId) return;
      const panelEl = document.getElementById(panelId);
      if (panelEl) {
        panels.set(panelId, panelEl);
      }
    });
    let activePanelId: string | null = null;
    const setActivePanel = (panelId: string | null): void => {
      panels.forEach((panel, id) => {
        const isActive = id === panelId;
        panel.classList.toggle('active', isActive);
        panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
      });
      buttons.forEach(button => {
        const isActive = button.dataset.panel === panelId;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-expanded', isActive ? 'true' : 'false');
      });
      container.setAttribute('data-state', panelId ? 'open' : 'closed');
      sidebarEl.setAttribute('data-panel-open', panelId ? 'true' : 'false');
      mainEl.classList.toggle('sidebar-open', Boolean(panelId));
      activePanelId = panelId;
    };
    openSidebarPanel = setActivePanel;
    buttons.forEach(button => {
      button.addEventListener('click', () => {
        const panelId = button.dataset.panel;
        if (!panelId || !panels.has(panelId)) {
          return;
        }
        setActivePanel(activePanelId === panelId ? null : panelId);
      });
    });
    document.addEventListener('click', event => {
      if (!activePanelId) return;
      const target = event.target as HTMLElement;
      if (!sidebarEl.contains(target)) {
        setActivePanel(null);
      }
    });
    document.addEventListener('keydown', event => {
      if (!activePanelId) return;
      if (event.key === 'Escape') {
        setActivePanel(null);
      }
    });
  };

  const refreshQueue = async (): Promise<void> => {
    if (!nodevision?.getQueueSnapshot) return;
    try {
      const snapshot = await nodevision.getQueueSnapshot();
      if (snapshot) {
        const nextQueue: RendererQueueState = {
          active: snapshot.active ?? [],
          queued: snapshot.queued ?? [],
          history: snapshot.history ?? [],
          warnings: snapshot.warnings ?? [],
          limits: snapshot.limits ?? state.queue.limits
        };
        state.queue = nextQueue;
        renderQueue();
      }
    } catch (error) {
      showToast(t('toast.queueRefreshFailed', { message: getErrorMessage(error) }), 'error');
    }
  };

  const snap = (value: number): number => Math.round(value / SNAP) * SNAP;

  const renderStatus = (): void => {
    const items = [
      `<li>FFmpeg: <strong>${BOOTSTRAP.status.ffmpeg.ffmpeg.path}</strong></li>`,
      `<li>FFprobe: <strong>${BOOTSTRAP.status.ffmpeg.ffprobe.path}</strong></li>`,
      `<li>tempRoot: ${BOOTSTRAP.status.settings.tempRoot}</li>`,
      `<li>HTTP Port: ${BOOTSTRAP.status.settings.http.port}</li>`,
      `<li>Token Label: ${BOOTSTRAP.status.token.label}</li>`
    ];
    elements.statusList.innerHTML = items.join('');
  };

  const renderAbout = (): void => {
    const metadata = BOOTSTRAP.status?.distribution?.ffmpeg;
    if (!metadata || !elements.aboutDistribution || !elements.aboutLicense) {
      return;
    }
    const licenseKey = metadata.license ?? 'unknown';
    const licenseLabel = t(`about.licenseValue.${licenseKey}`) ?? t('about.licenseValue.unknown');
    const originKey = metadata.origin === 'bundled' ? 'about.origin.bundled' : 'about.origin.external';
    elements.aboutDistribution.textContent = t(originKey);
    elements.aboutLicense.textContent = licenseLabel;
    if (elements.aboutPath) {
      elements.aboutPath.textContent = BOOTSTRAP.status.ffmpeg.ffmpeg.path;
    }
    if (elements.aboutVersion) {
      elements.aboutVersion.textContent =
        BOOTSTRAP.status.ffmpeg.ffmpeg.version ?? t('about.versionUnknown');
    }
    if (elements.aboutNotice) {
      const noticeKey = metadata.origin === 'bundled' ? 'about.noticeBundled' : 'about.noticeExternal';
      elements.aboutNotice.textContent = t(noticeKey, { license: licenseLabel });
    }
    if (elements.aboutLicenseLink && metadata.licenseUrl) {
      elements.aboutLicenseLink.setAttribute('href', metadata.licenseUrl);
    }
    if (elements.aboutSourceLink && metadata.sourceUrl) {
      elements.aboutSourceLink.setAttribute('href', metadata.sourceUrl);
    }
  };

  const setAutosaveMessage = (msg: string): void => {
    elements.autosave.textContent = msg;
  };

  const updateAutosaveIdleMessage = (): void => {
    const seconds = state.isRunning ? 10 : 2;
    const key = state.isRunning ? 'autosave.running' : 'autosave.idle';
    setAutosaveMessage(t(key, { seconds }));
  };

  const scheduleAutosave = (): void => {
    if (!state.autosaveTimer) {
      updateAutosaveIdleMessage();
    }
    const delay = state.isRunning ? 10_000 : 2_000;
    if (state.autosaveTimer) {
      clearTimeout(state.autosaveTimer);
    }
    state.autosaveTimer = window.setTimeout(() => {
      state.lastAutosave = new Date();
      const savedAt = state.lastAutosave?.toLocaleTimeString() ?? '';
      setAutosaveMessage(t('autosave.saved', { time: savedAt }));
      state.autosaveTimer = null;
    }, delay);
  };

  const pushHistory = (): void => {
    state.history.splice(state.historyIndex + 1);
    state.history.push({
      nodes: deepClone(state.nodes),
      connections: deepClone(state.connections)
    });
    if (state.history.length > 100) {
      state.history.shift();
    }
    state.historyIndex = state.history.length - 1;
    updateUndoRedoState();
  };

  const applySnapshot = (snapshot: HistoryEntry): void => {
    state.nodes = deepClone(snapshot.nodes);
    state.connections = deepClone(snapshot.connections ?? []);
    state.pendingConnection = null;
    state.draggingConnection = null;
    setDropTarget(null);
    state.selection.clear();
    renderNodes();
    renderConnections();
    updatePendingHint();
    updateSelectionUi();
    updateJsonPreview();
  };

  const updateUndoRedoState = (): void => {
    elements.undo.disabled = state.historyIndex <= 0;
    elements.redo.disabled = state.historyIndex >= state.history.length - 1;
  };

  const undo = (): void => {
    if (state.historyIndex <= 0) return;
    state.historyIndex -= 1;
    applySnapshot(state.history[state.historyIndex]);
  };

  const redo = (): void => {
    if (state.historyIndex >= state.history.length - 1) return;
    state.historyIndex += 1;
    applySnapshot(state.history[state.historyIndex]);
  };

  const applyPressedNodeStyles = (): void => {
    elements.nodeLayer.querySelectorAll<HTMLElement>('.node').forEach(nodeEl => {
      const id = nodeEl.dataset.id ?? '';
      nodeEl.classList.toggle('node-pressed', !!state.pressedNodeId && state.pressedNodeId === id);
    });
  };

  const setPressedNode = (nodeId: string | null): void => {
    if (state.pressedNodeId === nodeId) return;
    state.pressedNodeId = nodeId;
    applyPressedNodeStyles();
    renderConnectionPaths();
  };

  const updateSelectionUi = (): void => {
    elements.nodeLayer.querySelectorAll<HTMLElement>('.node').forEach(nodeEl => {
      const id = nodeEl.dataset.id ?? '';
      nodeEl.classList.toggle('selected', state.selection.has(id));
    });
    document.querySelectorAll<HTMLButtonElement>('[data-align]').forEach(button => {
      button.disabled = state.selection.size === 0 || state.readonly;
    });
    refreshSelectionOutline();
    renderConnectionPaths();
  };

  const removeNodeById = (nodeId: string): void => {
    const index = state.nodes.findIndex(node => node.id === nodeId);
    if (index < 0) {
      return;
    }
    if (state.readonly) {
      return;
    }
    const targetNode = state.nodes[index];
    const renderer = getNodeRenderer(targetNode.typeId);
    renderer?.onBeforeNodeRemove?.(nodeId);
    if (state.resizing?.nodeId === nodeId) {
      cancelResize();
    }
    cleanupMediaPreview(nodeId);
    state.nodeSizes.delete(nodeId);
    state.nodeChrome.delete(nodeId);
    state.selection.delete(nodeId);
    if (state.pressedNodeId === nodeId) {
      setPressedNode(null);
    }
    if (state.pendingConnection && state.pendingConnection.fromNodeId === nodeId) {
      state.pendingConnection = null;
      updatePendingHint();
      refreshPendingPortUi();
    }
    state.connections = state.connections.filter(connection => {
      if (connection.fromNodeId === nodeId || connection.toNodeId === nodeId) {
        state.highlightedConnections.delete(connection.id);
        return false;
      }
      return true;
    });
    state.nodes.splice(index, 1);
    commitState();
  };

  const describePort = (node: RendererNode, port: NodePort, direction: PortDirection): string =>
    t('ports.portLabel', {
      direction: t(direction === 'input' ? 'ports.direction.input' : 'ports.direction.output'),
      label: getPortLabel(node.typeId, port),
      dataType: port.dataType
    });

  const portIsConnected = (nodeId: string, portId: string, direction: PortDirection): boolean =>
    direction === 'input'
      ? state.connections.some(connection => connection.toNodeId === nodeId && connection.toPortId === portId)
      : state.connections.some(connection => connection.fromNodeId === nodeId && connection.fromPortId === portId);

  const portButtonHtml = (node: RendererNode, port: NodePort, direction: PortDirection): string => {
    const pending =
      direction === 'output' &&
      state.pendingConnection &&
      state.pendingConnection.fromNodeId === node.id &&
      state.pendingConnection.fromPortId === port.id;
    const connected = portIsConnected(node.id, port.id, direction);
    const classes = ['port', `port-${direction}`];
    if (pending) {
      classes.push('port-pending');
    }
    if (connected) {
      classes.push('port-connected');
    }
    const ariaPressed = direction === 'output' ? String(pending) : 'false';
    const portLabel = getPortLabel(node.typeId, port);
    const dot = '<span class="port-dot" aria-hidden="true"></span>';
    const labelHtml = `<span class="port-label">${escapeHtml(portLabel)}</span>`;
    const inner = direction === 'input' ? `${dot}${labelHtml}` : `${labelHtml}${dot}`;
    return `
      <button
        type="button"
        class="${classes.join(' ')}"
        role="button"
        data-node-id="${node.id}"
        data-port-id="${port.id}"
        data-direction="${direction}"
        aria-pressed="${ariaPressed}"
        aria-label="${escapeHtml(describePort(node, port, direction))}"
      >
        ${inner}
      </button>
    `;
  };

  const buildPortGroup = (node: RendererNode, ports: NodePort[] | undefined, direction: PortDirection): string => {
    const displayTitle = getNodeTitle(node);
    const labelKey = direction === 'input' ? 'ports.inputsLabel' : 'ports.outputsLabel';
    const label = escapeHtml(t(labelKey, { title: displayTitle }));
    if (!ports || !ports.length) return '';
    return `
      <div class="ports ${direction}" role="group" aria-label="${label}">
        ${ports.map(port => portButtonHtml(node, port, direction)).join('')}
      </div>
    `;
  };

  const getRelativePoint = (event: PointerEvent | MouseEvent): Point => {
    const rect = elements.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  };

  const getPortAnchorPoint = (portEl: HTMLElement | null): Point | null => {
    if (!portEl) return null;
    const dot = portEl.querySelector('.port-dot');
    const target = dot ?? portEl;
    const rect = target.getBoundingClientRect();
    const canvasRect = elements.canvas.getBoundingClientRect();
    return {
      x: rect.left - canvasRect.left + rect.width / 2,
      y: rect.top - canvasRect.top + rect.height / 2
    };
  };

  const buildCurvePath = (start: Point, end: Point): string => {
    const dx = end.x - start.x;
    const direction = Math.sign(dx || 1);
    const offset = Math.max(Math.abs(dx) * 0.5, 48);
    const c1x = start.x + direction * offset;
    const c2x = end.x - direction * offset;
    return (
      'M ' +
      start.x +
      ' ' +
      start.y +
      ' C ' +
      c1x +
      ' ' +
      start.y +
      ' ' +
      c2x +
      ' ' +
      end.y +
      ' ' +
      end.x +
      ' ' +
      end.y
    );
  };

  const findPortElement = (nodeId: string, portId: string, direction: PortDirection): HTMLElement | null => {
    const selector =
      '.port[data-node-id="' +
      cssEscape(nodeId) +
      '"][data-port-id="' +
      cssEscape(portId) +
      '"][data-direction="' +
      direction +
      '"]';
    return elements.nodeLayer.querySelector<HTMLElement>(selector);
  };

  const findIncomingConnection = (nodeId: string, portId: string): RendererConnection | undefined =>
    state.connections.find(connection => connection.toNodeId === nodeId && connection.toPortId === portId);

  const renderConnectionPaths = (): void => {
    if (!elements.connectionLayer) return;
    const rect = elements.canvas.getBoundingClientRect();
    elements.connectionLayer.setAttribute('viewBox', '0 0 ' + rect.width + ' ' + rect.height);
    elements.connectionLayer.setAttribute('width', String(rect.width));
    elements.connectionLayer.setAttribute('height', String(rect.height));
    const segments: string[] = [];
    const pushPath = (start: Point | null, end: Point | null, extraClass = ''): void => {
      if (!start || !end) return;
      const pathMarkup =
        '<path class="connection-path' +
        extraClass +
        '" d="' +
        buildCurvePath(start, end) +
        '" />';
      segments.push(pathMarkup);
    };
    state.connections.forEach(connection => {
      const fromEl = findPortElement(connection.fromNodeId, connection.fromPortId, 'output');
      const toEl = findPortElement(connection.toNodeId, connection.toPortId, 'input');
      const touchesPressed =
        state.pressedNodeId &&
        (state.pressedNodeId === connection.fromNodeId || state.pressedNodeId === connection.toNodeId);
      const glow = state.highlightedConnections.has(connection.id) || Boolean(touchesPressed);
      const extraClass = glow ? ' connection-highlight' : '';
      pushPath(getPortAnchorPoint(fromEl), getPortAnchorPoint(toEl), extraClass);
    });
    if (state.draggingConnection) {
      const fromEl = findPortElement(state.draggingConnection.fromNodeId, state.draggingConnection.fromPortId, 'output');
      const startPoint = getPortAnchorPoint(fromEl);
      const endPoint = state.draggingConnection.cursor ?? startPoint;
      pushPath(startPoint, endPoint, ' connection-preview');
    }
    elements.connectionLayer.innerHTML = segments.join('');
  };

  const INTERACTIVE_TAGS = new Set(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL']);

  const isInteractiveTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    if (INTERACTIVE_TAGS.has(target.tagName)) {
      return true;
    }
    if (target.closest('[data-node-interactive="true"]')) {
      return true;
    }
    if (target.hasAttribute('contenteditable')) {
      return true;
    }
    return false;
  };

  const clampZoom = (value: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

  const modulo = (value: number, modulus: number): number => {
    if (!Number.isFinite(modulus) || modulus === 0) {
      return 0;
    }
    return ((value % modulus) + modulus) % modulus;
  };

  const updateGridBackdrop = (): void => {
    const minor = Math.max(1, GRID_MINOR_BASE * state.zoom);
    const major = Math.max(minor * GRID_MAJOR_FACTOR, minor);
    elements.canvasGrid.style.setProperty('--grid-minor-size', `${minor}px`);
    elements.canvasGrid.style.setProperty('--grid-major-size', `${major}px`);
    const offsetX = modulo(state.viewport.x, minor);
    const offsetY = modulo(state.viewport.y, minor);
    elements.canvasGrid.style.setProperty('--grid-offset-x', `${offsetX}px`);
    elements.canvasGrid.style.setProperty('--grid-offset-y', `${offsetY}px`);
  };

  const updateCanvasTransform = (): void => {
    elements.canvas.style.transform = `translate(${state.viewport.x}px, ${state.viewport.y}px) scale(${state.zoom})`;
    updateGridBackdrop();
    refreshSelectionOutline();
  };

  const updateZoomUi = (): void => {
    const percent = Math.round(state.zoom * 100);
    elements.zoomDisplay.textContent = percent + '%';
    elements.zoomInput.value = String(percent);
  };

  const openZoomMenu = (): void => {
    zoomMenuOpen = true;
    elements.zoomMenu.dataset.open = 'true';
    elements.zoomMenu.setAttribute('aria-hidden', 'false');
    elements.zoomDisplay.setAttribute('aria-expanded', 'true');
    elements.zoomInput.focus();
    elements.zoomInput.select();
  };

  const closeZoomMenu = (): void => {
    if (!zoomMenuOpen) {
      elements.zoomMenu.dataset.open = 'false';
      elements.zoomMenu.setAttribute('aria-hidden', 'true');
      elements.zoomDisplay.setAttribute('aria-expanded', 'false');
      return;
    }
    zoomMenuOpen = false;
    elements.zoomMenu.dataset.open = 'false';
    elements.zoomMenu.setAttribute('aria-hidden', 'true');
    elements.zoomDisplay.setAttribute('aria-expanded', 'false');
  };

  const toggleZoomMenu = (force?: boolean): void => {
    if (typeof force === 'boolean') {
      if (force) {
        openZoomMenu();
      } else {
        closeZoomMenu();
      }
      return;
    }
    if (zoomMenuOpen) {
      closeZoomMenu();
    } else {
      openZoomMenu();
    }
  };

  const setActiveTool = (tool: CanvasTool): void => {
    state.activeTool = tool;
    elements.toolSelect.classList.toggle('active', tool === 'select');
    elements.toolSelect.setAttribute('aria-pressed', tool === 'select' ? 'true' : 'false');
    elements.toolPan.classList.toggle('active', tool === 'pan');
    elements.toolPan.setAttribute('aria-pressed', tool === 'pan' ? 'true' : 'false');
    if (document.body) {
      document.body.dataset.canvasTool = tool;
    }
  };

  const resetViewport = (): void => {
    state.viewport.x = 0;
    state.viewport.y = 0;
    updateCanvasTransform();
  };

  const getViewportSize = (): { width: number; height: number } => {
    const wrap = elements.canvas.parentElement;
    if (!wrap) {
      return { width: window.innerWidth || 1, height: window.innerHeight || 1 };
    }
    const rect = wrap.getBoundingClientRect();
    return { width: rect.width || 1, height: rect.height || 1 };
  };

  const getWorldPoint = (event: PointerEvent | MouseEvent): Point => {
    const rect = elements.canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / state.zoom,
      y: (event.clientY - rect.top) / state.zoom
    };
  };

  const getCanvasCenterAnchor = (): { clientX: number; clientY: number } => {
    const rect = elements.canvas.getBoundingClientRect();
    return { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
  };

  const getNodeSizeForSelection = (node: RendererNode): NodeSize => {
    const stored = state.nodeSizes.get(node.id);
    if (stored) return stored;
    return {
      width: node.width ?? NODE_MIN_WIDTH,
      height: node.height ?? NODE_MIN_HEIGHT
    };
  };

  const getSelectionPadding = (): number => SELECTION_PADDING / (state.zoom || 1);

  const refreshSelectionOutline = (): void => {
    if (!elements.selectionOutline) return;
    if (!state.selection.size) {
      elements.selectionOutline.style.display = 'none';
      return;
    }
    const nodeEls = Array.from(elements.nodeLayer.querySelectorAll<HTMLElement>('.node.selected'));
    if (!nodeEls.length) {
      elements.selectionOutline.style.display = 'none';
      return;
    }
    const canvasRect = elements.canvas.getBoundingClientRect();
    const zoom = state.zoom || 1;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    nodeEls.forEach(nodeEl => {
      const rect = nodeEl.getBoundingClientRect();
      const localMinX = (rect.left - canvasRect.left) / zoom;
      const localMinY = (rect.top - canvasRect.top) / zoom;
      const localMaxX = (rect.right - canvasRect.left) / zoom;
      const localMaxY = (rect.bottom - canvasRect.top) / zoom;
      minX = Math.min(minX, localMinX);
      minY = Math.min(minY, localMinY);
      maxX = Math.max(maxX, localMaxX);
      maxY = Math.max(maxY, localMaxY);
    });
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      elements.selectionOutline.style.display = 'none';
      return;
    }
    const padding = getSelectionPadding();
    elements.selectionOutline.style.display = 'block';
    elements.selectionOutline.style.transform = `translate(${minX - padding}px, ${minY - padding}px)`;
    elements.selectionOutline.style.width = `${Math.max(0, maxX - minX + padding * 2)}px`;
    elements.selectionOutline.style.height = `${Math.max(0, maxY - minY + padding * 2)}px`;
  };

  const drawSelectionRect = (start: Point, end: Point): NormalizedRect => {
    const minX = Math.min(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxX = Math.max(start.x, end.x);
    const maxY = Math.max(start.y, end.y);
    elements.selectionRect.style.display = 'block';
    elements.selectionRect.style.transform = `translate(${minX}px, ${minY}px)`;
    elements.selectionRect.style.width = `${Math.max(1, maxX - minX)}px`;
    elements.selectionRect.style.height = `${Math.max(1, maxY - minY)}px`;
    return { minX, minY, maxX, maxY };
  };

  const applyMarqueeSelection = (session: MarqueeSession, rect: NormalizedRect): void => {
    const nextSelection = session.additive ? new Set(session.baseSelection) : new Set<string>();
    state.selection.clear();
    nextSelection.forEach(id => state.selection.add(id));
    state.nodes.forEach(node => {
      const size = getNodeSizeForSelection(node);
      const minX = node.position.x;
      const minY = node.position.y;
      const maxX = minX + size.width;
      const maxY = minY + size.height;
      const intersects = !(maxX < rect.minX || minX > rect.maxX || maxY < rect.minY || minY > rect.maxY);
      if (intersects) {
        state.selection.add(node.id);
      }
    });
    updateSelectionUi();
  };

  const stopMarqueeTracking = (): void => {
    window.removeEventListener('pointermove', handleMarqueePointerMove);
    window.removeEventListener('pointerup', completeMarqueeSelection);
    window.removeEventListener('pointercancel', cancelMarqueeSelection);
    elements.selectionRect.style.display = 'none';
  };

  const handleMarqueePointerMove = (event: PointerEvent): void => {
    if (!marqueeSession) {
      return;
    }
    const pointerId = typeof event.pointerId === 'number' ? event.pointerId : 1;
    if (pointerId !== marqueeSession.pointerId) {
      return;
    }
    event.preventDefault();
    const current = getWorldPoint(event);
    marqueeSession.lastRect = drawSelectionRect(marqueeSession.start, current);
    applyMarqueeSelection(marqueeSession, marqueeSession.lastRect);
  };

  const completeMarqueeSelection = (event: PointerEvent): void => {
    if (!marqueeSession) {
      return;
    }
    const pointerId = typeof event.pointerId === 'number' ? event.pointerId : 1;
    if (pointerId !== marqueeSession.pointerId) {
      return;
    }
    event.preventDefault();
    if (!marqueeSession.lastRect) {
      state.selection.clear();
      if (marqueeSession.additive) {
        marqueeSession.baseSelection.forEach(id => state.selection.add(id));
      }
      updateSelectionUi();
    }
    stopMarqueeTracking();
    marqueeSession = null;
  };

  const cancelMarqueeSelection = (event: PointerEvent): void => {
    if (!marqueeSession) {
      return;
    }
    const pointerId = typeof event.pointerId === 'number' ? event.pointerId : 1;
    if (pointerId !== marqueeSession.pointerId) {
      return;
    }
    stopMarqueeTracking();
    state.selection.clear();
    marqueeSession.baseSelection.forEach(id => state.selection.add(id));
    updateSelectionUi();
    marqueeSession = null;
  };

  const maybeStartMarquee = (event: PointerEvent): boolean => {
    if (state.readonly) return false;
    if (state.activeTool !== 'select') return false;
    if (event.button !== 0) return false;
    const target = event.target as HTMLElement | null;
    if (target && (target.closest('.node') || target.closest('.canvas-controls'))) {
      return false;
    }
    const pointerId = typeof event.pointerId === 'number' ? event.pointerId : 1;
    const worldPoint = getWorldPoint(event);
    marqueeSession = {
      pointerId,
      start: worldPoint,
      additive: event.shiftKey,
      baseSelection: new Set(state.selection),
      lastRect: null
    };
    event.preventDefault();
    elements.selectionRect.style.display = 'block';
    elements.selectionRect.style.transform = `translate(${worldPoint.x}px, ${worldPoint.y}px)`;
    elements.selectionRect.style.width = '0px';
    elements.selectionRect.style.height = '0px';
    window.addEventListener('pointermove', handleMarqueePointerMove);
    window.addEventListener('pointerup', completeMarqueeSelection);
    window.addEventListener('pointercancel', cancelMarqueeSelection);
    return true;
  };

  const shouldPanFromEvent = (event: PointerEvent): boolean => {
    const wantsPan = (state.activeTool === 'pan' && event.button === 0) || event.button === 1;
    if (!wantsPan) {
      return false;
    }
    if (
      isInteractiveTarget(event.target) &&
      !(state.activeTool === 'pan' && event.button === 0) &&
      event.button !== 1
    ) {
      return false;
    }
    if (event.target instanceof HTMLElement && event.target.closest('.canvas-controls')) {
      return false;
    }
    return true;
  };

  const matchesKey = (event: KeyboardEvent, matcher: { codes?: string[]; keys?: string[] }): boolean => {
    const codes = matcher.codes ?? [];
    const keys = matcher.keys ?? [];
    if (codes.some(code => code === event.code)) {
      return true;
    }
    if (keys.some(key => key === event.key)) {
      return true;
    }
    return false;
  };

  const isZoomInShortcut = (event: KeyboardEvent): boolean =>
    event.altKey &&
    !event.metaKey &&
    !event.ctrlKey &&
    matchesKey(event, {
      codes: ['Equal', 'NumpadAdd', 'Semicolon'],
      keys: ['=', '+', '＋']
    });

  const isZoomOutShortcut = (event: KeyboardEvent): boolean =>
    event.altKey &&
    !event.metaKey &&
    !event.ctrlKey &&
    matchesKey(event, {
      codes: ['Minus', 'NumpadSubtract', 'Backquote'],
      keys: ['-', '_', '−', 'ー', 'ｰ', '~', '〜']
    });

  const handlePanPointerMove = (event: PointerEvent): void => {
    if (!panSession) {
      return;
    }
    if ((event.pointerId ?? 1) !== panSession.pointerId) {
      return;
    }
    event.preventDefault();
    const deltaX = event.clientX - panSession.start.x;
    const deltaY = event.clientY - panSession.start.y;
    state.viewport.x = panSession.startViewport.x + deltaX;
    state.viewport.y = panSession.startViewport.y + deltaY;
    updateCanvasTransform();
  };

  type ActiveDragSession = {
    pointerId: number;
    start: Point;
    targets: RendererNode[];
    startPositions: Map<string, { x: number; y: number }>;
    nodeElementCache: Map<string, HTMLElement>;
    dragging: boolean;
    moved: boolean;
    anchorNodeId: string | null;
    startBounds: NormalizedRect | null;
  };
  let dragSession: ActiveDragSession | null = null;

  const stopDragSessionListeners = (): void => {
    window.removeEventListener('pointermove', handleSelectionDragMove);
    window.removeEventListener('pointerup', finishSelectionDrag);
    window.removeEventListener('pointercancel', cancelSelectionDrag);
  };

  const beginSelectionDrag = (
    event: PointerEvent,
    anchorNode?: RendererNode,
    anchorEl?: HTMLElement
  ): boolean => {
    if (state.readonly) return false;
    if (event.button !== 0) return false;
    if (state.activeTool === 'pan') return false;
    const pointerId = typeof event.pointerId === 'number' ? event.pointerId : 1;
    const selectedIds = state.selection.size
      ? Array.from(state.selection)
      : anchorNode
        ? [anchorNode.id]
        : [];
    if (!selectedIds.length) {
      return false;
    }
    const dragTargets = state.nodes.filter(node => selectedIds.includes(node.id));
    if (anchorNode && !dragTargets.some(node => node.id === anchorNode.id)) {
      dragTargets.push(anchorNode);
    }
    if (!dragTargets.length) {
      return false;
    }
    const startPositions = new Map<string, { x: number; y: number }>();
    dragTargets.forEach(target => {
      startPositions.set(target.id, { x: target.position.x, y: target.position.y });
    });
    const nodeElementCache = new Map<string, HTMLElement>();
    if (anchorNode && anchorEl) {
      nodeElementCache.set(anchorNode.id, anchorEl);
    }
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    dragTargets.forEach(target => {
      const size = getNodeSizeForSelection(target);
      minX = Math.min(minX, target.position.x);
      minY = Math.min(minY, target.position.y);
      maxX = Math.max(maxX, target.position.x + size.width);
      maxY = Math.max(maxY, target.position.y + size.height);
    });
    const startBounds: NormalizedRect | null =
      Number.isFinite(minX) && Number.isFinite(minY) && Number.isFinite(maxX) && Number.isFinite(maxY)
        ? { minX, minY, maxX, maxY }
        : null;

    dragSession = {
      pointerId,
      start: getWorldPoint(event),
      targets: dragTargets,
      startPositions,
      nodeElementCache,
      dragging: false,
      moved: false,
      anchorNodeId: anchorNode?.id ?? null,
      startBounds
    };
    event.preventDefault();
    stopDragSessionListeners();
    window.addEventListener('pointermove', handleSelectionDragMove);
    window.addEventListener('pointerup', finishSelectionDrag);
    window.addEventListener('pointercancel', cancelSelectionDrag);
    if (document.body && !document.body.classList.contains('node-dragging')) {
      document.body.classList.add('node-dragging');
    }
    refreshSelectionOutline();
    return true;
  };

  const handleSelectionDragMove = (event: PointerEvent): void => {
    if (!dragSession) {
      return;
    }
    const pointerId = typeof event.pointerId === 'number' ? event.pointerId : 1;
    if (pointerId !== dragSession.pointerId) {
      return;
    }
    event.preventDefault();
    const current = getWorldPoint(event);
    const deltaX = current.x - dragSession.start.x;
    const deltaY = current.y - dragSession.start.y;
    if (!dragSession.dragging) {
      const distance = Math.hypot(deltaX, deltaY);
      if (distance < DRAG_THRESHOLD) {
        return;
      }
      dragSession.dragging = true;
    }
    let anyChanged = false;
    dragSession.targets.forEach(target => {
      const startPos = dragSession!.startPositions.get(target.id);
      if (!startPos) {
        return;
      }
      const nextX = snap(startPos.x + deltaX);
      const nextY = snap(startPos.y + deltaY);
      if (nextX === target.position.x && nextY === target.position.y) {
        return;
      }
      target.position.x = nextX;
      target.position.y = nextY;
      anyChanged = true;
      let targetEl = dragSession!.nodeElementCache.get(target.id);
      if (!targetEl) {
        const found = elements.nodeLayer.querySelector<HTMLElement>(
          `.node[data-id="${cssEscape(target.id)}"]`
        );
        if (found) {
          dragSession!.nodeElementCache.set(target.id, found);
          targetEl = found;
        }
      }
      if (targetEl) {
        targetEl.style.transform = `translate(${nextX}px, ${nextY}px)`;
      }
    });
    if (anyChanged) {
      dragSession.moved = true;
      refreshSelectionOutline();
      renderConnectionPaths();
    } else {
      refreshSelectionOutline();
    }
  };

  const finishSelectionDrag = (event: PointerEvent): void => {
    if (!dragSession) {
      return;
    }
    const pointerId = typeof event.pointerId === 'number' ? event.pointerId : 1;
    if (pointerId !== dragSession.pointerId) {
      return;
    }
    event.preventDefault();
    stopDragSessionListeners();
    if (dragSession.anchorNodeId) {
      setPressedNode(null);
    }
    if (dragSession.dragging && dragSession.moved) {
      suppressChromeMeasurement = true;
      commitState();
    }
    document.body?.classList.remove('node-dragging');
    dragSession = null;
  };

  const cancelSelectionDrag = (event: PointerEvent): void => {
    if (!dragSession) {
      return;
    }
    const pointerId = typeof event.pointerId === 'number' ? event.pointerId : 1;
    if (pointerId !== dragSession.pointerId) {
      return;
    }
    stopDragSessionListeners();
    if (dragSession.anchorNodeId) {
      setPressedNode(null);
    }
    document.body?.classList.remove('node-dragging');
    dragSession = null;
  };

  const endPanSession = (event: PointerEvent): void => {
    if (!panSession) {
      return;
    }
    if ((event.pointerId ?? 1) !== panSession.pointerId) {
      return;
    }
    window.removeEventListener('pointermove', handlePanPointerMove);
    window.removeEventListener('pointerup', endPanSession);
    window.removeEventListener('pointercancel', endPanSession);
    if (document.body) {
      document.body.classList.remove('is-panning');
    }
    panSession = null;
  };

  const startPanSession = (event: PointerEvent): boolean => {
    if (panSession || !shouldPanFromEvent(event)) {
      return false;
    }
    const pointerId = typeof event.pointerId === 'number' ? event.pointerId : 1;
    panSession = {
      pointerId,
      start: { x: event.clientX, y: event.clientY },
      startViewport: { x: state.viewport.x, y: state.viewport.y }
    };
    event.preventDefault();
    if (document.body) {
      document.body.classList.add('is-panning');
    }
    window.addEventListener('pointermove', handlePanPointerMove);
    window.addEventListener('pointerup', endPanSession);
    window.addEventListener('pointercancel', endPanSession);
    return true;
  };

  updateCanvasTransform();
  updateZoomUi();
  closeZoomMenu();
  setActiveTool(state.activeTool);

  type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se';

  const buildResizeHandles = (nodeId: string): string =>
    ['se']
      .map(
        handle =>
          `<div class="node-resize-handle node-resize-${handle}" data-resize-handle="${handle}" data-node-id="${escapeHtml(
            nodeId
          )}" data-node-interactive="true" aria-hidden="true"></div>`
      )
      .join('');

  const startResize = (node: RendererNode, handle: ResizeHandle, element: HTMLElement, event: PointerEvent): void => {
    if (state.readonly) return;
    event.preventDefault();
    event.stopPropagation();
    const size = ensureNodeSize(node);
    state.resizing = {
      nodeId: node.id,
      handle,
      startPointer: { x: event.clientX, y: event.clientY },
      startSize: size,
      startPosition: { x: node.position.x, y: node.position.y },
      element
    };
    window.addEventListener('pointermove', handleResizePointerMove);
    window.addEventListener('pointerup', finishResize);
    window.addEventListener('pointercancel', cancelResize);
  };

  const handleResizePointerMove = (event: PointerEvent): void => {
    const session = state.resizing;
    if (!session) {
      return;
    }
    event.preventDefault();
    const node = state.nodes.find(item => item.id === session.nodeId);
    if (!node) {
      return;
    }
    const deltaX = (event.clientX - session.startPointer.x) / state.zoom;
    const deltaY = (event.clientY - session.startPointer.y) / state.zoom;
    let width = session.startSize.width;
    let height = session.startSize.height;
    let posX = session.startPosition.x;
    let posY = session.startPosition.y;

    if (session.handle.includes('e')) {
      width = clampWidth(session.startSize.width + deltaX);
    } else if (session.handle.includes('w')) {
      const rightEdge = session.startPosition.x + session.startSize.width;
      const newX = snap(session.startPosition.x + deltaX);
      const candidateWidth = rightEdge - newX;
      const clampedWidth = clampWidth(candidateWidth);
      width = clampedWidth;
      posX = rightEdge - clampedWidth;
    }

    const minHeightForWidth = getMinimumHeightForWidth(node.id, width);

    if (session.handle.includes('s')) {
      height = clampHeight(session.startSize.height + deltaY);
    } else if (session.handle.includes('n')) {
      const bottomEdge = session.startPosition.y + session.startSize.height;
      const newY = snap(session.startPosition.y + deltaY);
      const candidateHeight = bottomEdge - newY;
      const clampedHeight = clampHeight(candidateHeight);
      height = clampedHeight;
      posY = bottomEdge - clampedHeight;
    }

    const enforcedHeight = Math.max(minHeightForWidth, height);
    if (session.handle.includes('n') && enforcedHeight !== height) {
      const bottomEdge = session.startPosition.y + session.startSize.height;
      posY = bottomEdge - enforcedHeight;
    }
    height = enforcedHeight;

    node.position.x = posX;
    node.position.y = posY;
    node.width = width;
    node.height = height;
    const storedSize = state.nodeSizes.get(node.id);
    if (!storedSize || storedSize.width !== width || storedSize.height !== height) {
      state.nodeSizes.set(node.id, { width, height });
    }
    session.element.style.width = `${width}px`;
    session.element.style.height = `${height}px`;
    session.element.style.transform = `translate(${node.position.x}px, ${node.position.y}px)`;
    updateNodeMediaPreviewStyles(node, session.element);
    renderConnectionPaths();
  };

  const endResizeSession = (commit: boolean): void => {
    if (!state.resizing) {
      return;
    }
    window.removeEventListener('pointermove', handleResizePointerMove);
    window.removeEventListener('pointerup', finishResize);
    window.removeEventListener('pointercancel', cancelResize);
    state.resizing = null;
    if (commit) {
      commitState({ skipRender: true });
    }
  };

  const finishResize = (): void => endResizeSession(true);
  const cancelResize = (): void => endResizeSession(false);

  let suppressChromeMeasurement = false;

  const renderNodes = (attempt: number = 0): void => {
    const host = elements.nodeLayer;
    pruneMediaPreviews();
    pruneNodeSizes();
    pruneNodeChrome();
    setDropTarget(null);
    if (nodeResizeObserver) {
      nodeResizeObserver.disconnect();
    }
    host.innerHTML = '';
    state.nodes.forEach(node => {
      const localizedTitle = getNodeTitle(node);
      const template = templates.find(item => item.typeId === node.typeId);
      const description = template ? getTemplateDescription(template) : '';
      const nodeVersion = node.nodeVersion ?? '1.0.0';
      const metaText = node.typeId + ' • v' + nodeVersion;
      const el = document.createElement('div');
      el.className = 'node';
      el.dataset.id = node.id;
      el.dataset.typeId = node.typeId;
      el.setAttribute('data-type-id', node.typeId);
      el.classList.add(toNodeTypeClass(node.typeId));
      el.tabIndex = 0;
      el.setAttribute('role', 'group');
      el.setAttribute('aria-label', t('nodes.ariaLabel', { title: localizedTitle }));
      el.style.transform = 'translate(' + node.position.x + 'px, ' + node.position.y + 'px)';
      const inputsGroup = buildPortGroup(node, node.inputs, 'input');
      const outputsGroup = buildPortGroup(node, node.outputs, 'output');
      const descriptionHtml = description
        ? '<p class="node-description">' + escapeHtml(description) + '</p>'
        : '';
      const nodeSize = ensureNodeSize(node);
      const nodeWidth = nodeSize.width;
      const nodeHeight = nodeSize.height;
      const deleteButton = `<button type="button" class="node-delete-btn${state.readonly ? ' disabled' : ''}" data-remove-node="${escapeHtml(
        node.id
      )}" data-node-interactive="true" aria-label="${escapeHtml(
        t('nodes.delete')
      )}" ${state.readonly ? 'disabled' : ''}></button>`;
      const renderer = getNodeRenderer(node.typeId);
      const extension = renderer?.render(node) ?? null;
      const htmlParts = [
        '<header class="node-header">',
        deleteButton,
        '<div class="node-header-main">',
        '<p class="node-title">', escapeHtml(localizedTitle), '</p>',
        '<p class="node-meta">', escapeHtml(metaText), '</p>',
        descriptionHtml,
        '</div>',
        '<span class="node-chip">v', escapeHtml(nodeVersion), '</span>',
        '</header>',
        '<div class="node-ports">',
        inputsGroup,
        outputsGroup,
        '</div>'
      ];
      if (extension?.afterPortsHtml) {
        htmlParts.push(extension.afterPortsHtml);
      }
      htmlParts.push(buildResizeHandles(node.id));
      el.innerHTML = htmlParts.join('');
      el.style.width = `${nodeWidth}px`;
      el.style.height = `${nodeHeight}px`;
      el.style.minWidth = `${NODE_MIN_WIDTH}px`;
      el.style.maxWidth = `${NODE_MAX_WIDTH}px`;
      el.style.minHeight = `${NODE_MIN_HEIGHT}px`;
      el.style.maxHeight = `${NODE_MAX_HEIGHT}px`;
      if (state.selection.has(node.id)) {
        el.classList.add('selected');
      }
      attachNodeEvents(el, node);
      attachPortEvents(el);
      const deleteButtonEl = el.querySelector<HTMLButtonElement>('[data-remove-node]');
      deleteButtonEl?.addEventListener('click', event => {
        event.stopPropagation();
        event.preventDefault();
        removeNodeById(node.id);
      });
      el.querySelectorAll<HTMLElement>('[data-resize-handle]').forEach(handle => {
        handle.addEventListener('pointerdown', event => {
          const direction = (handle.getAttribute('data-resize-handle') as ResizeHandle) ?? 'se';
          startResize(node, direction, el, event);
        });
      });
      host.appendChild(el);
      extension?.afterRender?.(el);
      if (nodeResizeObserver && el.querySelector('.node-media')) {
        nodeResizeObserver.observe(el);
      }
      if (node.typeId === 'trim') {
        scheduleTrimPreviewUpdate(node);
      }
    });
    const needsSync = !suppressChromeMeasurement && syncNodeChromePadding();
    suppressChromeMeasurement = false;
    if (needsSync && attempt < MAX_CHROME_SYNC_ATTEMPTS) {
      renderNodes(attempt + 1);
      return;
    }
    renderConnectionPaths();
    applyNodeHighlightClasses();
    refreshPendingPortUi();
  };

  const initializeNodeRenderers = (): void => {
    nodeRendererByType.clear();
    const modules = createNodeRenderers({
      state,
      t,
      escapeHtml,
      showToast,
      renderNodes,
      cleanupMediaPreview,
      updateMediaPreviewDimensions,
      getNodeChromePadding,
      getPreviewWidthForNodeWidth,
      getPreviewAspectRatio,
      minPreviewHeight: MIN_PREVIEW_HEIGHT,
      minPreviewWidth: MIN_PREVIEW_WIDTH,
      getTemplateByType,
      getMediaPreview,
      openTrimModal
    });
    modules.forEach(module => {
      module.typeIds.forEach(typeId => {
        nodeRendererByType.set(typeId, module);
      });
    });
  };

  const attachNodeEvents = (el: HTMLElement, node: RendererNode): void => {
    const onPointerDown = (event: PointerEvent): void => {
      if (startPanSession(event)) {
        return;
      }
      if (state.readonly) return;
      if (event.button !== 0) return;
      if (isInteractiveTarget(event.target)) {
        return;
      }
      const additive = event.shiftKey;
      if (additive) {
        if (state.selection.has(node.id)) {
          state.selection.delete(node.id);
        } else {
          state.selection.add(node.id);
        }
      } else {
        if (!state.selection.has(node.id)) {
          state.selection.clear();
          state.selection.add(node.id);
        }
      }
      updateSelectionUi();
      setPressedNode(node.id);
      beginSelectionDrag(event, node, el);
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('click', event => {
      if (state.activeTool === 'pan') {
        event.preventDefault();
        return;
      }
      if (state.readonly) return;
      if (isInteractiveTarget(event.target)) {
        return;
      }
      if (!state.selection.has(node.id)) {
        state.selection.clear();
        state.selection.add(node.id);
        updateSelectionUi();
      }
    });
    el.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        el.click();
      }
    });
  };

  const attachPortEvents = (container: HTMLElement): void => {
    container.querySelectorAll<HTMLElement>('.port').forEach(portEl => {
      portEl.addEventListener('click', (event: MouseEvent) => {
        if (state.activeTool === 'pan') {
          event.preventDefault();
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        handlePortActivation(portEl);
      });
      portEl.addEventListener('pointerdown', (event: PointerEvent) => {
        if (startPanSession(event)) {
          return;
        }
        if (state.readonly) return;
        const direction = portEl.getAttribute('data-direction');
        if (direction === 'input') {
          const nodeId = portEl.getAttribute('data-node-id');
          const portId = portEl.getAttribute('data-port-id');
          if (nodeId && portId) {
            const existing = findIncomingConnection(nodeId, portId);
            if (existing) {
              startRewireFromInput(existing, event);
              return;
            }
          }
        }
        startConnectionDrag(portEl, event);
      });
      portEl.addEventListener('pointerenter', () => {
        if (state.draggingConnection && portEl.getAttribute('data-direction') === 'input') {
          setDropTarget(portEl);
        }
      });
      portEl.addEventListener('pointerleave', () => {
        if (dropTargetPort === portEl) {
          setDropTarget(null);
        }
      });
      portEl.addEventListener('keydown', (event: KeyboardEvent) => {
        if (state.activeTool === 'pan') {
          return;
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handlePortActivation(portEl);
        } else if (event.key === 'Escape' && state.pendingConnection) {
          event.preventDefault();
          clearPendingConnection();
        }
      });
    });
  };

  const updatePendingHint = (): void => {
    if (!state.pendingConnection) {
      elements.connectionHint.textContent = t('connections.ready');
      return;
    }
    const pending = state.pendingConnection;
    const fromNode = state.nodes.find(node => node.id === pending.fromNodeId);
    const fromLabel = fromNode ? getNodeTitle(fromNode) : pending.fromNodeId;
    elements.connectionHint.textContent = t('connections.pending', {
      from: fromLabel
    });
  };

  const refreshPendingPortUi = (): void => {
    syncPendingPortHighlight(elements.nodeLayer, state.pendingConnection);
  };

  const setDropTarget = (target: HTMLElement | null): void => {
    if (dropTargetPort === target) {
      return;
    }
    if (dropTargetPort) {
      dropTargetPort.classList.remove('port-drop-target');
    }
    dropTargetPort = target ?? null;
    if (dropTargetPort) {
      dropTargetPort.classList.add('port-drop-target');
    }
  };

  const primePendingConnection = (nodeId: string, portId: string): void => {
    if (
      state.pendingConnection &&
      state.pendingConnection.fromNodeId === nodeId &&
      state.pendingConnection.fromPortId === portId
    ) {
      return;
    }
    state.pendingConnection = { fromNodeId: nodeId, fromPortId: portId };
    updatePendingHint();
    refreshPendingPortUi();
  };

  const handleConnectionDragMove = (event: PointerEvent): void => {
    if (!activeConnectionDrag) return;
    const pointerId = typeof event.pointerId === 'number' ? event.pointerId : 1;
    if (pointerId !== activeConnectionDrag.pointerId) {
      return;
    }
    if (!activeConnectionDrag.started) {
      const distance = Math.hypot(
        event.clientX - activeConnectionDrag.origin.x,
        event.clientY - activeConnectionDrag.origin.y
      );
      if (distance > 3) {
        const nodeId = activeConnectionDrag.portEl.getAttribute('data-node-id');
        const portId = activeConnectionDrag.portEl.getAttribute('data-port-id');
        if (nodeId && portId) {
          primePendingConnection(nodeId, portId);
          activeConnectionDrag.started = true;
          state.draggingConnection = {
            fromNodeId: nodeId,
            fromPortId: portId,
            cursor: getRelativePoint(event)
          };
          renderConnectionPaths();
        }
      }
      return;
    }
    if (state.draggingConnection) {
      state.draggingConnection.cursor = getRelativePoint(event);
      renderConnectionPaths();
    }
  };

  const handleConnectionDragUp = (event: PointerEvent): void => {
    if (!activeConnectionDrag) return;
    const pointerId = typeof event.pointerId === 'number' ? event.pointerId : 1;
    if (pointerId !== activeConnectionDrag.pointerId) {
      return;
    }
    if (activeConnectionDrag.started && dropTargetPort) {
      handlePortActivation(dropTargetPort);
    } else if (activeConnectionDrag.started) {
      const shouldDetach = Boolean(state.pendingConnection?.detachedConnectionId);
      clearPendingConnection(shouldDetach ? { detachExisting: true } : undefined);
    }
    endConnectionDrag();
  };

  const endConnectionDrag = (): void => {
    if (activeConnectionDrag) {
      window.removeEventListener('pointermove', handleConnectionDragMove);
      window.removeEventListener('pointerup', handleConnectionDragUp);
      activeConnectionDrag = null;
    }
    state.draggingConnection = null;
    setDropTarget(null);
    renderConnectionPaths();
  };

  const startConnectionDrag = (
    portEl: HTMLElement,
    event: PointerEvent,
    options?: { forceStart?: boolean; cursorOverride?: Point }
  ): void => {
    if (state.readonly) return;
    if (portEl.getAttribute('data-direction') !== 'output') return;
    if (typeof event.button === 'number' && event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    activeConnectionDrag = {
      portEl,
      pointerId: typeof event.pointerId === 'number' ? event.pointerId : 1,
      origin: { x: event.clientX, y: event.clientY },
      started: !!options?.forceStart
    };
    if (activeConnectionDrag.started) {
      const nodeId = portEl.getAttribute('data-node-id');
      const portId = portEl.getAttribute('data-port-id');
      if (nodeId && portId) {
        state.draggingConnection = {
          fromNodeId: nodeId,
          fromPortId: portId,
          cursor: options?.cursorOverride ?? getRelativePoint(event)
        };
        renderConnectionPaths();
      }
    }
    window.addEventListener('pointermove', handleConnectionDragMove);
    window.addEventListener('pointerup', handleConnectionDragUp);
  };

  const startRewireFromInput = (connection: RendererConnection, event: PointerEvent): void => {
    if (typeof event.button === 'number' && event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const fromEl = findPortElement(connection.fromNodeId, connection.fromPortId, 'output');
    if (!fromEl) {
      state.connections = [connection, ...state.connections];
      renderConnections();
      return;
    }
    state.connections = state.connections.filter(conn => conn.id !== connection.id);
    renderConnections();
    const cursorPoint = getRelativePoint(event);
    state.pendingConnection = {
      fromNodeId: connection.fromNodeId,
      fromPortId: connection.fromPortId,
      detachedConnectionId: connection.id
    };
    updatePendingHint();
    renderNodes();
    state.draggingConnection = {
      fromNodeId: connection.fromNodeId,
      fromPortId: connection.fromPortId,
      cursor: cursorPoint
    };
    startConnectionDrag(fromEl, event, { forceStart: true, cursorOverride: cursorPoint });
  };

  const clearPendingConnection = (options?: { detachExisting?: boolean }): void => {
    if (!state.pendingConnection) return;
    const pending = state.pendingConnection;
    const detach = options?.detachExisting ?? false;
    let removed = false;
    if (detach) {
      let nextConnections: RendererConnection[];
      if (pending.detachedConnectionId) {
        nextConnections = state.connections.filter(connection => connection.id !== pending.detachedConnectionId);
      } else {
        nextConnections = state.connections.filter(
          connection => !(connection.fromNodeId === pending.fromNodeId && connection.fromPortId === pending.fromPortId)
        );
      }
      removed = nextConnections.length !== state.connections.length;
      state.connections = nextConnections;
      if (!removed && pending.detachedConnectionId) {
        removed = true;
      }
    }
    state.pendingConnection = null;
    updatePendingHint();
    endConnectionDrag();
    refreshPendingPortUi();
    if (removed) {
      commitState();
    }
  };

  const handlePortActivation = (portEl: HTMLElement): void => {
    const nodeId = portEl.getAttribute('data-node-id');
    const portId = portEl.getAttribute('data-port-id');
    const direction = portEl.getAttribute('data-direction') as PortDirection | null;
    if (!nodeId || !portId || !direction) return;
    if (state.readonly) return;
    if (direction === 'output') {
      if (state.pendingConnection && state.pendingConnection.fromNodeId === nodeId && state.pendingConnection.fromPortId === portId) {
        clearPendingConnection();
        return;
      }
      primePendingConnection(nodeId, portId);
      return;
    }
    if (!state.pendingConnection) {
      return;
    }
    const pending = state.pendingConnection;
    if (pending.fromNodeId === nodeId && pending.fromPortId === portId) {
      return;
    }
    const exists = state.connections.some(
      connection =>
        connection.fromNodeId === pending.fromNodeId &&
        connection.fromPortId === pending.fromPortId &&
        connection.toNodeId === nodeId &&
        connection.toPortId === portId
    );
    if (exists) {
      state.pendingConnection = null;
      updatePendingHint();
      endConnectionDrag();
      refreshPendingPortUi();
      return;
    }
    const connection = {
      id: createId('connection'),
      fromNodeId: pending.fromNodeId,
      fromPortId: pending.fromPortId,
      toNodeId: nodeId,
      toPortId: portId
    } as RendererConnection;
    state.connections = [connection, ...state.connections];
    state.pendingConnection = null;
    updatePendingHint();
    endConnectionDrag();
    commitState();
  };

  const commitState = (options: { skipDirtyFlag?: boolean; skipRender?: boolean } = {}): void => {
    if (!options.skipRender) {
      renderNodes();
      renderConnections();
    } else {
      renderConnectionPaths();
      applyNodeHighlightClasses();
    }
    updateSelectionUi();
    updateJsonPreview();
    pushHistory();
    scheduleAutosave();
    if (!options.skipDirtyFlag) {
      markWorkflowDirty();
    }
  };

  const serializeProject = () => ({
    schemaVersion: SCHEMA,
    nodes: state.nodes.map(node => ({
      id: node.id,
      typeId: node.typeId,
      nodeVersion: node.nodeVersion,
      title: node.title,
      position: node.position,
      settings: cloneNodeSettings(node.settings)
    })),
    connections: state.connections.map(connection => deepClone(connection)),
    metadata: {
      name: 'NodeVision Demo',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      readonly: state.readonly
    }
  });

  const updateJsonPreview = (): void => {
    elements.json.value = JSON.stringify(serializeProject(), null, 2);
  };

  const addNodeFromTemplate = (template: NodeTemplate): void => {
    const position = { x: snap(120 + Math.random() * 320), y: snap(80 + Math.random() * 220) };
    const templateTokens = (template as { searchTokens?: string[] }).searchTokens ?? [];
    const node: RendererNode = {
      id: createId(template.typeId),
      typeId: template.typeId,
      nodeVersion: template.nodeVersion,
      title: template.title,
      position,
      width: template.width ?? 220,
      height: template.height ?? 120,
      searchTokens: templateTokens,
      inputs: clonePorts(template.inputs),
      outputs: clonePorts(template.outputs),
      settings: template.defaultSettings ? deepClone(template.defaultSettings) : undefined
    };
    state.nodes.push(node);
    state.selection = new Set([node.id]);
    commitState();
  };

  const updateSuggestions = (query: string): NodeTemplate[] => {
    const normalized = query.trim().toLowerCase();
    const results = templates
      .filter(template => {
        if (!normalized) return true;
        const localizedTitle = getTemplateTitle(template).toLowerCase();
        const localizedDescription = getTemplateDescription(template).toLowerCase();
        const haystacks = [
          template.title.toLowerCase(),
          (template.description ?? '').toLowerCase(),
          localizedTitle,
          localizedDescription,
          ...(template.keywords ?? []).map((keyword: string) => keyword.toLowerCase())
        ];
        return haystacks.some(text => text && text.includes(normalized));
      })
      .slice(0, 6);
    elements.suggestions.innerHTML = '';
    results.forEach((template, index) => {
      const li = document.createElement('li');
      li.role = 'option';
      li.id = `suggestion-${index}`;
      const localizedTitle = getTemplateTitle(template);
      const localizedDescription = getTemplateDescription(template);
      li.textContent = `${localizedTitle} — ${localizedDescription}`;
      li.addEventListener('click', () => addNodeFromTemplate(template));
      elements.suggestions.appendChild(li);
    });
    return results;
  };

  const copySelection = (): void => {
    if (!state.selection.size) return;
    state.clipboard = state.nodes
      .filter(node => state.selection.has(node.id))
      .map(node => deepClone(node));
  };

  const pasteSelection = (offset: Point = { x: 40, y: 40 }): void => {
    if (!state.clipboard.length || state.readonly) return;
    const newNodes = state.clipboard.map((node, index) => ({
      ...deepClone(node),
      id: createId(node.typeId + '-' + index),
      position: {
        x: snap(node.position.x + offset.x),
        y: snap(node.position.y + offset.y)
      }
    }));
    state.nodes.push(...newNodes);
    state.selection = new Set(newNodes.map(node => node.id));
    commitState();
  };

  const duplicateSelection = (): void => {
    copySelection();
    pasteSelection({ x: 24, y: 24 });
  };

  const alignSelection = (mode: 'left' | 'top' | 'center'): void => {
    if (!state.selection.size) return;
    const nodes = state.nodes.filter(node => state.selection.has(node.id));
    if (!nodes.length) return;
    const aligners = {
      left: () => Math.min(...nodes.map(node => node.position.x)),
      top: () => Math.min(...nodes.map(node => node.position.y)),
      center: () => (
        nodes.reduce((sum, node) => sum + node.position.x + (node.width ?? 200) / 2, 0) / nodes.length
      )
    };
    if (mode === 'left') {
      const minX = aligners.left();
      nodes.forEach(node => (node.position.x = snap(minX)));
    } else if (mode === 'top') {
      const minY = aligners.top();
      nodes.forEach(node => (node.position.y = snap(minY)));
    } else if (mode === 'center') {
      const center = aligners.center();
      nodes.forEach(node => (node.position.x = snap(center - (node.width ?? 200) / 2)));
    }
    commitState();
  };

  const setZoom = (value: number, anchor?: { clientX: number; clientY: number }): void => {
    const rect = elements.canvas.getBoundingClientRect();
    const wrapLeft = rect.left - state.viewport.x;
    const wrapTop = rect.top - state.viewport.y;
    const target = clampZoom(value);
    const previousZoom = state.zoom;
    if (anchor) {
      const anchorWorld: Point = {
        x: (anchor.clientX - rect.left) / previousZoom,
        y: (anchor.clientY - rect.top) / previousZoom
      };
      state.viewport.x = anchor.clientX - wrapLeft - anchorWorld.x * target;
      state.viewport.y = anchor.clientY - wrapTop - anchorWorld.y * target;
    }
    state.zoom = target;
    updateCanvasTransform();
    updateZoomUi();
  };

  const stepZoom = (direction: 1 | -1, anchor?: { clientX: number; clientY: number }): void => {
    const delta = direction * ZOOM_STEP;
    setZoom(state.zoom + delta, anchor);
  };

  const applyZoomInputValue = (): void => {
    const raw = elements.zoomInput.value.trim();
    if (!raw.length) {
      elements.zoomInput.value = String(Math.round(state.zoom * 100));
      return;
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      elements.zoomInput.value = String(Math.round(state.zoom * 100));
      return;
    }
    setZoom(value / 100);
    closeZoomMenu();
  };

  const fitSelection = (): void => {
    if (!state.selection.size) {
      setZoom(1);
      resetViewport();
      return;
    }
    const nodes = state.nodes.filter(node => state.selection.has(node.id));
    const minX = Math.min(...nodes.map(node => node.position.x));
    const maxX = Math.max(...nodes.map(node => node.position.x + (node.width ?? 200)));
    const minY = Math.min(...nodes.map(node => node.position.y));
    const maxY = Math.max(...nodes.map(node => node.position.y + (node.height ?? 120)));
    const boxWidth = maxX - minX + 64;
    const boxHeight = maxY - minY + 64;
    const view = getViewportSize();
    const scale = Math.min(view.width / boxWidth, view.height / boxHeight, 1);
    setZoom(scale);
    const centerX = minX + boxWidth / 2;
    const centerY = minY + boxHeight / 2;
    state.viewport.x = view.width / 2 - centerX * state.zoom;
    state.viewport.y = view.height / 2 - centerY * state.zoom;
    updateCanvasTransform();
  };

  const serializeAndDownload = (): void => {
    const blob = new Blob([elements.json.value], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nodevision-project-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getSerializedProjectJson = (): string => JSON.stringify(serializeProject());

  const findWorkflowById = (id: string | null): StoredWorkflow | undefined =>
    id ? state.workflows.find(workflow => workflow.id === id) : undefined;

  const persistWorkflowRecord = (workflow: StoredWorkflow): void => {
    const index = state.workflows.findIndex(item => item.id === workflow.id);
    if (index >= 0) {
      state.workflows[index] = workflow;
    } else {
      state.workflows.push(workflow);
    }
    persistWorkflowsAndRender();
  };

  const loadWorkflowEntry = (workflow: StoredWorkflow): void => {
    try {
      applyProjectJson(workflow.data, { markDirty: false });
      state.activeWorkflowId = workflow.id;
      state.workflowName = workflow.name;
      state.workflowDirty = false;
      updateWorkflowNameUi();
      renderWorkflowList();
      closeWorkflowMenu();
    } catch (error) {
      alert(t('errors.jsonLoadFailed', { reason: getErrorMessage(error) }));
    }
  };

  const buildNodeFromSerialized = (node: SerializedNode): RendererNode => {
    const template = templates.find(item => item.typeId === node.typeId);
    const templateTokens = (template as { searchTokens?: string[] } | undefined)?.searchTokens ?? [];
    return {
      id: node.id,
      typeId: node.typeId,
      nodeVersion: node.nodeVersion ?? '1.0.0',
      title: node.title ?? node.typeId,
      position: {
        x: snap(node.position?.x ?? 0),
        y: snap(node.position?.y ?? 0)
      },
      width: template?.width ?? 220,
      height: template?.height ?? 120,
      searchTokens: templateTokens,
      inputs: clonePorts(template?.inputs),
      outputs: clonePorts(template?.outputs),
      settings: cloneNodeSettings(node.settings ?? template?.defaultSettings)
    } as RendererNode;
  };

  const applyProjectJson = (json: string, options: { markDirty?: boolean } = {}): void => {
    const parsed = JSON.parse(json);
    if (!parsed.schemaVersion) {
      throw new Error(t('errors.schemaMissing'));
    }
    state.readonly = parsed.schemaVersion !== SCHEMA;
    cleanupAllMediaPreviews();
    state.nodes = (parsed.nodes ?? []).map(buildNodeFromSerialized);
    state.connections = (parsed.connections ?? []).map(cloneConnection);
    state.pendingConnection = null;
    state.selection.clear();
    updateReadonlyUi();
    renderNodes();
    renderConnections();
    updatePendingHint();
    commitState({ skipDirtyFlag: true });
    state.workflowDirty = options.markDirty ?? false;
    updateWorkflowNameUi();
  };

  const loadFromTextarea = (): void => {
    try {
      applyProjectJson(elements.json.value, { markDirty: true });
      setUnsavedWorkflow({ dirty: true });
    } catch (error) {
      alert(t('errors.jsonLoadFailed', { reason: getErrorMessage(error) }));
    }
  };

  const updateReadonlyUi = (): void => {
    document.body.classList.toggle('readonly', state.readonly);
    if (state.readonly && state.pendingConnection) {
      state.pendingConnection = null;
      updatePendingHint();
      refreshPendingPortUi();
    }
  };

  const handleKeydown = (event: KeyboardEvent): void => {
    if (workflowNameDialogResolver) {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelWorkflowNameDialog();
      } else if (event.key === 'Enter' && event.target === elements.workflowNameInput && !event.isComposing) {
        event.preventDefault();
        submitWorkflowNameDialog();
      }
      return;
    }
    if (state.workflowContextMenuOpen && event.key === 'Escape') {
      event.preventDefault();
      closeWorkflowContextMenu();
      return;
    }
    const modifier = event.metaKey || event.ctrlKey;
    if (modifier && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      copySelection();
    } else if (modifier && event.key.toLowerCase() === 'v') {
      event.preventDefault();
      pasteSelection();
    } else if (modifier && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      duplicateSelection();
    } else if (isZoomInShortcut(event)) {
      event.preventDefault();
      const anchor = getCanvasCenterAnchor();
      stepZoom(1, anchor);
    } else if (isZoomOutShortcut(event)) {
      event.preventDefault();
      const anchor = getCanvasCenterAnchor();
      stepZoom(-1, anchor);
    } else if (event.key === '1' && !event.shiftKey && !modifier) {
      setZoom(1);
    } else if ((event.key === '1' || event.key === '!') && event.shiftKey) {
      fitSelection();
    } else if (!modifier && !event.altKey && event.key === '.') {
      event.preventDefault();
      fitSelection();
    } else if (!modifier && !event.altKey && event.key.toLowerCase() === 'h') {
      event.preventDefault();
      setActiveTool('pan');
    } else if (!modifier && !event.altKey && event.key.toLowerCase() === 'v') {
      event.preventDefault();
      setActiveTool('select');
    } else if (event.key === 'Escape' && zoomMenuOpen) {
      event.preventDefault();
      closeZoomMenu();
    } else if (event.key === 'Escape' && state.workflowMenuOpen) {
      event.preventDefault();
      closeWorkflowMenu();
    } else if (event.key === 'Escape' && state.pendingConnection) {
      event.preventDefault();
      clearPendingConnection();
    }
  };

  elements.canvas.addEventListener('pointerdown', event => {
    if (maybeStartMarquee(event)) {
      return;
    }
    startPanSession(event);
  });

  const handleCanvasWheel = (event: WheelEvent): void => {
    if (!(event.ctrlKey || event.metaKey || event.altKey)) {
      return;
    }
    if (!isEventInsideCanvas(event)) {
      return;
    }
    event.preventDefault();
    const anchor = { clientX: event.clientX, clientY: event.clientY };
    const direction = event.deltaY < 0 ? 1 : -1;
    stepZoom(direction as 1 | -1, anchor);
  };

  window.addEventListener('wheel', handleCanvasWheel, { passive: false });

  elements.canvasControls.addEventListener('pointerdown', startCanvasControlsDrag);
  window.addEventListener('resize', handleCanvasControlsResize);

  elements.toolSelect.addEventListener('click', () => setActiveTool('select'));
  elements.toolPan.addEventListener('click', () => setActiveTool('pan'));
  elements.fitView.addEventListener('click', () => fitSelection());

  elements.zoomDisplay.addEventListener('click', () => toggleZoomMenu());
  elements.zoomIn.addEventListener('click', () => {
    stepZoom(1);
  });
  elements.zoomOut.addEventListener('click', () => {
    stepZoom(-1);
  });
  elements.zoomFitMenu.addEventListener('click', () => {
    fitSelection();
  });
  elements.zoomApply.addEventListener('click', () => applyZoomInputValue());
  elements.zoomInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      applyZoomInputValue();
    }
  });

  document.addEventListener('pointerdown', event => {
    if (!zoomMenuOpen) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }
    if (target === elements.zoomDisplay) {
      return;
    }
    if (target.closest('#zoom-menu')) {
      return;
    }
    closeZoomMenu();
  });

  elements.selectionOutline.addEventListener('pointerdown', event => {
    if (!state.selection.size) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    beginSelectionDrag(event);
  });

  elements.searchInput.addEventListener('input', event => {
    const target = event.target as HTMLInputElement;
    updateSuggestions(target.value);
  });
  elements.searchInput.addEventListener('keydown', event => {
    const results = updateSuggestions(elements.searchInput.value);
    if (event.key === 'Enter' && results.length) {
      addNodeFromTemplate(results[0]);
      elements.searchInput.select();
    }
  });

  document.querySelectorAll<HTMLButtonElement>('[data-align]').forEach(button => {
    button.addEventListener('click', event => {
      const current = event.currentTarget as HTMLElement;
      const mode = current.getAttribute('data-align') as 'left' | 'top' | 'center' | null;
      if (mode) {
        alignSelection(mode);
      }
    });
  });

  elements.workflowToggle.addEventListener('click', event => {
    event.preventDefault();
    toggleWorkflowMenu();
  });

  const workflowMenuButtons: Array<{ button: HTMLButtonElement; action: string }> = [
    { button: elements.workflowMenuRename, action: 'rename' },
    { button: elements.workflowMenuFileSave, action: 'fileSave' },
    { button: elements.workflowMenuFileLoad, action: 'fileLoad' },
    { button: elements.workflowMenuSaveAs, action: 'saveAs' },
    { button: elements.workflowMenuClear, action: 'clear' },
    { button: elements.workflowMenuBrowse, action: 'browse' }
  ];
  workflowMenuButtons.forEach(entry => {
    entry.button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      handleWorkflowMenuAction(entry.action);
    });
  });

  elements.workflowSearch.addEventListener('input', event => {
    const target = event.target as HTMLInputElement;
    state.workflowSearch = target.value;
    renderWorkflowList();
  });

  elements.workflowList.addEventListener('click', event => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('button[data-workflow-id]');
    if (!button) {
      return;
    }
    event.preventDefault();
    const workflow = findWorkflowById(button.dataset.workflowId ?? null);
    if (workflow) {
      loadWorkflowEntry(workflow);
    }
  });
  elements.workflowList.addEventListener('contextmenu', event => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('button[data-workflow-id]');
    if (!button) {
      return;
    }
    event.preventDefault();
    const workflowId = button.dataset.workflowId;
    if (!workflowId) {
      return;
    }
    openWorkflowContextMenu(workflowId, event.clientX, event.clientY);
  });

  elements.workflowCreate.addEventListener('click', () => {
    if (state.activeWorkflowId) {
      handleWorkflowSave();
    } else {
      void handleWorkflowSaveAs();
    }
  });

  elements.workflowNameConfirm.addEventListener('click', submitWorkflowNameDialog);
  elements.workflowNameCancel.addEventListener('click', cancelWorkflowNameDialog);
  elements.workflowNameDialog.addEventListener('click', event => {
    if (event.target === elements.workflowNameDialog) {
      cancelWorkflowNameDialog();
    }
  });
  elements.workflowNameInput.addEventListener('input', () => {
    elements.workflowNameInput.dataset.invalid = 'false';
  });
  elements.workflowNameInput.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      submitWorkflowNameDialog();
    }
  });
  elements.workflowContextDelete.addEventListener('click', () => {
    deleteWorkflowById(state.workflowContextTargetId);
  });

  document.addEventListener('pointerdown', event => {
    const target = event.target as HTMLElement | null;
    if (state.workflowMenuOpen) {
      if (!target || !target.closest('.workflow-dropdown')) {
        closeWorkflowMenu();
      }
    }
    if (state.workflowContextMenuOpen) {
      if (!target || !elements.workflowContextMenu.contains(target)) {
        closeWorkflowContextMenu();
      }
    }
  });

  elements.localeSelect.value = state.locale;
  elements.localeSelect.addEventListener('change', event => {
    const target = event.target as HTMLSelectElement;
    const next = target.value;
    if (next && TRANSLATIONS[next]) {
      setLocale(next);
    }
  });

  elements.undo.addEventListener('click', undo);
  elements.redo.addEventListener('click', redo);
  elements.runningToggle.addEventListener('change', event => {
    const target = event.target as HTMLInputElement;
    state.isRunning = target.checked;
    scheduleAutosave();
  });

  const enqueueDemoJob = async (): Promise<void> => {
    if (!nodevision?.enqueueDemoJob) {
      showToast(t('toast.demoJobMissing'), 'error');
      return;
    }
    const response = await nodevision.enqueueDemoJob({ name: t('demo.jobName') });
    if (response?.ok) {
      showToast(t('toast.demoJobAdded'));
    } else if (response?.code === 'QUEUE_FULL') {
      showToast(t('toast.queueFull', { code: response.code }), 'error');
    } else {
      const reason = response?.error ?? response?.message ?? 'unknown';
      showToast(t('toast.demoJobFailed', { reason }), 'error');
    }
    refreshQueue();
  };

  const cancelAllJobs = async (): Promise<void> => {
    if (!nodevision?.cancelAllJobs) return;
    await nodevision.cancelAllJobs();
    showToast(t('toast.cancelAll'));
    refreshQueue();
  };

  const refreshLocaleDependentViews = (): void => {
    applyTranslations();
    syncUnsavedWorkflowLabel();
    renderStatus();
    renderAbout();
    renderNodes();
    renderConnections();
    renderWorkflowList();
    updatePendingHint();
    updateSuggestions(elements.searchInput.value ?? '');
    updateJsonPreview();
    renderQueue();
    renderDiagnostics();
    updateAutosaveIdleMessage();
  };

  const persistLocale = (locale: string): void => {
    try {
      if (typeof localStorage === 'undefined') {
        return;
      }
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch (error) {
      console.warn('[NodeVision] persist locale failed', error);
    }
  };

  const setLocale = (locale: string): void => {
    if (!TRANSLATIONS[locale]) {
      return;
    }
    if (state.locale === locale) {
      persistLocale(locale);
      return;
    }
    state.locale = locale;
    persistLocale(locale);
    refreshLocaleDependentViews();
    if (elements.localeSelect) {
      elements.localeSelect.value = locale;
    }
  };

  const exportLogs = async (): Promise<void> => {
    if (!nodevision?.exportLogs) {
      showToast(t('toast.exportMissing'), 'error');
      return;
    }
    const password = elements.logPassword.value?.trim() || null;
    const response = await nodevision.exportLogs(password);
    if (!response) {
      showToast(t('toast.exportFailed', { reason: 'unknown' }), 'error');
      return;
    }
    if (response.ok) {
      if (response.diagnostics) {
        state.diagnostics = {
          ...state.diagnostics,
          ...response.diagnostics,
          lastExportSha: response.diagnostics.lastExportSha ?? state.diagnostics.lastExportSha
        };
        renderDiagnostics();
      }
      const exportPath = response.result?.outputPath ?? t('diagnostics.defaultPath');
      const sha = response.result?.sha256 ?? state.diagnostics.lastExportSha ?? null;
      const shaSuffix = sha ? t('toast.logsExportedSha', { sha }) : '';
      showToast(t('toast.logsExported', { path: exportPath, shaSuffix }));
    } else {
      const reason = response.message ?? 'unknown';
      showToast(t('toast.exportFailed', { reason }), 'error');
    }
  };

  elements.demoJob.addEventListener('click', enqueueDemoJob);
  elements.cancelAll.addEventListener('click', cancelAllJobs);
  elements.exportLogs.addEventListener('click', exportLogs);
  elements.crashConsent.addEventListener('change', async event => {
    if (!nodevision?.setCrashDumpConsent) return;
    const target = event.target as HTMLInputElement;
    const enabled = target.checked;
    const result = await nodevision.setCrashDumpConsent(enabled);
    state.diagnostics.collectCrashDumps = result.collectCrashDumps;
    renderDiagnostics();
    showToast(result.collectCrashDumps ? t('toast.crashOn') : t('toast.crashOff'));
  });
  elements.connectionsList.addEventListener('change', event => {
    const target = event.target as HTMLInputElement;
    if (!target || target.getAttribute('data-connection-check') === null) return;
    const connectionId = target.getAttribute('data-connection-check');
    if (!connectionId) return;
    if (target.checked) {
      state.highlightedConnections.add(connectionId);
    } else {
      state.highlightedConnections.delete(connectionId);
    }
    renderConnectionPaths();
    applyNodeHighlightClasses();
  });

  window.addEventListener('beforeunload', cleanupAllMediaPreviews);
  document.addEventListener('keydown', handleKeydown);

  setupSidebarPanels();
  renderStatus();
  renderAbout();
  initializeNodeRenderers();
  renderNodes();
  renderConnections();
  updatePendingHint();
  updateSuggestions('');
  pushHistory();
  updateJsonPreview();
  renderQueue();
  renderDiagnostics();
  refreshQueue();
  setInterval(refreshQueue, 4000);
})();
