/// <reference lib="dom" />

import { captureDomElements } from './dom';
import {
  cloneConnection,
  clonePorts,
  createInitialState,
  deepClone
} from './state';
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
  NodevisionApi
} from './types';

(() => {
  const rendererWindow = window as RendererBootstrapWindow;
  const nodevision = (window as unknown as { nodevision?: NodevisionApi }).nodevision;
  const SNAP = 4;
  const SCHEMA = '1.0.7';
  const LOCALE_STORAGE_KEY = 'nodevision.locale';
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

  let activeConnectionDrag: {
        portEl: HTMLElement;
        pointerId: number;
        origin: Point;
        started: boolean;
      } | null = null;
      let dropTargetPort: HTMLElement | null = null;

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
      applyTranslations();

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

  const renderConnections = (): void => {
    if (!state.connections.length) {
      elements.connectionsList.innerHTML = '<li class="connections-empty">' + t('connections.empty') + '</li>';
      renderConnectionPaths();
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
        const html = [
          '<li>',
          '<span>', escapeHtml(summary), '</span>',
          '<button type="button" class="pill-button pill-danger" data-connection-id="',
          escapeHtml(connection.id),
          '">', t('connections.remove'), '</button>',
          '</li>'
        ];
        return html.join('');
      })
      .join('');
    renderConnectionPaths();
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

  const updateSelectionUi = (): void => {
    elements.nodeLayer.querySelectorAll<HTMLElement>('.node').forEach(nodeEl => {
      const id = nodeEl.dataset.id ?? '';
      nodeEl.classList.toggle('selected', state.selection.has(id));
    });
    document.querySelectorAll<HTMLButtonElement>('[data-align]').forEach(button => {
      button.disabled = state.selection.size === 0 || state.readonly;
    });
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
    const textHtml = `
        <span class="port-text">
          <span class="port-label">${escapeHtml(portLabel)}</span>
          <span class="port-type">${escapeHtml(port.dataType ?? '')}</span>
        </span>
    `;
    const dot = '<span class="port-dot" aria-hidden="true"></span>';
    const inner = direction === 'input' ? `${dot}${textHtml}` : `${textHtml}${dot}`;
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
    if (!ports || !ports.length) {
      const emptyKey = direction === 'input' ? 'ports.emptyInputs' : 'ports.emptyOutputs';
      const emptyLabel = escapeHtml(t(emptyKey));
      return `
        <div class="ports ${direction}" role="group" aria-label="${label}">
          <p class="port-placeholder">${emptyLabel}</p>
        </div>
      `;
    }
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
      pushPath(getPortAnchorPoint(fromEl), getPortAnchorPoint(toEl));
    });
    if (state.draggingConnection) {
      const fromEl = findPortElement(state.draggingConnection.fromNodeId, state.draggingConnection.fromPortId, 'output');
      const startPoint = getPortAnchorPoint(fromEl);
      const endPoint = state.draggingConnection.cursor ?? startPoint;
      pushPath(startPoint, endPoint, ' connection-preview');
    }
    elements.connectionLayer.innerHTML = segments.join('');
  };

  const renderNodes = (): void => {
    const host = elements.nodeLayer;
    setDropTarget(null);
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
      el.tabIndex = 0;
      el.setAttribute('role', 'group');
      el.setAttribute('aria-label', t('nodes.ariaLabel', { title: localizedTitle }));
      el.style.transform = 'translate(' + node.position.x + 'px, ' + node.position.y + 'px)';
      const inputsGroup = buildPortGroup(node, node.inputs, 'input');
      const outputsGroup = buildPortGroup(node, node.outputs, 'output');
      const descriptionHtml = description
        ? '<p class="node-description">' + escapeHtml(description) + '</p>'
        : '';
      const htmlParts = [
        '<header class="node-header">',
        '<div>',
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
      el.innerHTML = htmlParts.join('');
      if (state.selection.has(node.id)) {
        el.classList.add('selected');
      }
      attachNodeEvents(el, node);
      attachPortEvents(el);
      host.appendChild(el);
    });
    renderConnectionPaths();
  };

  const attachNodeEvents = (el: HTMLElement, node: RendererNode): void => {
    const onPointerDown = (event: PointerEvent): void => {
      if (state.readonly) return;
      if (event.button !== 0) return;
      event.preventDefault();
      const rect = elements.canvas.getBoundingClientRect();
      const start = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const offset = {
        x: start.x - node.position.x,
        y: start.y - node.position.y
      };
      const move = (moveEvent: PointerEvent): void => {
        const current = { x: moveEvent.clientX - rect.left, y: moveEvent.clientY - rect.top };
        node.position.x = snap(current.x - offset.x);
        node.position.y = snap(current.y - offset.y);
        el.style.transform = `translate(${node.position.x}px, ${node.position.y}px)`;
        renderConnectionPaths();
      };
      const up = (): void => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        commitState();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('click', (event: MouseEvent) => {
      if (state.readonly) return;
      const additive = event.shiftKey;
      if (!additive) {
        state.selection.clear();
      }
      if (state.selection.has(node.id) && additive) {
        state.selection.delete(node.id);
      } else {
        state.selection.add(node.id);
      }
      updateSelectionUi();
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
        event.preventDefault();
        event.stopPropagation();
        handlePortActivation(portEl);
      });
      portEl.addEventListener('pointerdown', (event: PointerEvent) => {
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
    renderNodes();
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
    if (removed) {
      commitState();
    } else {
      renderNodes();
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
      renderNodes();
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

  const commitState = (): void => {
    renderNodes();
    renderConnections();
    updateSelectionUi();
    updateJsonPreview();
    pushHistory();
    scheduleAutosave();
  };

  const serializeProject = () => ({
    schemaVersion: SCHEMA,
    nodes: state.nodes.map(node => ({
      id: node.id,
      typeId: node.typeId,
      nodeVersion: node.nodeVersion,
      title: node.title,
      position: node.position
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
      outputs: clonePorts(template.outputs)
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

  const setZoom = (value: number): void => {
    state.zoom = Math.min(2, Math.max(0.25, value));
    elements.canvas.style.transform = `scale(${state.zoom})`;
  };

  const fitSelection = (): void => {
    if (!state.selection.size) {
      setZoom(1);
      return;
    }
    const nodes = state.nodes.filter(node => state.selection.has(node.id));
    const minX = Math.min(...nodes.map(node => node.position.x));
    const maxX = Math.max(...nodes.map(node => node.position.x + (node.width ?? 200)));
    const minY = Math.min(...nodes.map(node => node.position.y));
    const maxY = Math.max(...nodes.map(node => node.position.y + (node.height ?? 120)));
    const boxWidth = maxX - minX + 64;
    const boxHeight = maxY - minY + 64;
    const viewWidth = elements.canvas.clientWidth || 900;
    const viewHeight = elements.canvas.clientHeight || 600;
    const scale = Math.min(viewWidth / boxWidth, viewHeight / boxHeight, 1);
    setZoom(scale);
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
      outputs: clonePorts(template?.outputs)
    } as RendererNode;
  };

  const loadFromTextarea = (): void => {
    try {
      const parsed = JSON.parse(elements.json.value);
      if (!parsed.schemaVersion) {
        throw new Error(t('errors.schemaMissing'));
      }
      state.readonly = parsed.schemaVersion !== SCHEMA;
      state.nodes = (parsed.nodes ?? []).map(buildNodeFromSerialized);
      state.connections = (parsed.connections ?? []).map(cloneConnection);
      state.pendingConnection = null;
      state.selection.clear();
      updateReadonlyUi();
      renderNodes();
      renderConnections();
      updatePendingHint();
      commitState();
    } catch (error) {
      alert(t('errors.jsonLoadFailed', { reason: getErrorMessage(error) }));
    }
  };

  const updateReadonlyUi = (): void => {
    document.body.classList.toggle('readonly', state.readonly);
    if (state.readonly && state.pendingConnection) {
      state.pendingConnection = null;
      updatePendingHint();
      renderNodes();
    }
  };

  const handleKeydown = (event: KeyboardEvent): void => {
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
    } else if (event.key === '1' && !event.shiftKey && !modifier) {
      setZoom(1);
    } else if (event.key === '1' && event.shiftKey) {
      fitSelection();
    } else if (event.key === 'Escape' && state.pendingConnection) {
      event.preventDefault();
      clearPendingConnection();
    }
  };

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

  elements.localeSelect.value = state.locale;
  elements.localeSelect.addEventListener('change', event => {
    const target = event.target as HTMLSelectElement;
    const next = target.value;
    if (next && TRANSLATIONS[next]) {
      setLocale(next);
    }
  });

  elements.export.addEventListener('click', serializeAndDownload);
  elements.load.addEventListener('click', loadFromTextarea);
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
    renderStatus();
    renderAbout();
    renderNodes();
    renderConnections();
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
  elements.connectionsList.addEventListener('click', event => {
    const target = event.target as HTMLElement;
    if (target.tagName !== 'BUTTON') return;
    const connectionId = target.getAttribute('data-connection-id');
    if (!connectionId) return;
    state.connections = state.connections.filter(connection => connection.id !== connectionId);
    commitState();
  });

  document.addEventListener('keydown', handleKeydown);

  renderStatus();
  renderAbout();
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
