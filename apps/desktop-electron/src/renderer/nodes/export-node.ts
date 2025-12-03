import type { RendererNode } from '../types';
import type { NodeRendererContext, NodeRendererModule, NodeRendererView } from './types';
import { buildNodeInfoSection } from './shared';
import { ensureTrimSettings } from './trim-shared';
import { clampLutRes } from './lut-utils';
// Node modules via preload-exposed nodeRequire
const path: typeof import('path') | undefined = (window as any).nodeRequire?.('path');
const os: typeof import('os') | undefined = (window as any).nodeRequire?.('os');
const fsPromises: typeof import('fs').promises | undefined = (window as any).nodeRequire?.('fs')?.promises;

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
    <div class="node-launcher" style="min-height: 900px; padding-bottom: 32px;">
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

        <label class="control-label" style="margin: 0; padding-left: 8px;" data-export-zip-row>
          <span class="control-label-text" style="display: block; margin-bottom: 6px;">ZIP でまとめる（バッチ時のみ）</span>
          <label style="display: flex; align-items: center; gap: 8px; padding: 6px 8px; border: 1px solid rgba(0,0,0,0.08); border-radius: 10px; background: rgba(0,0,0,0.03);">
            <input type="checkbox" data-export-zip data-node-id="${escapeHtml(node.id)}" />
            <span style="font-size: 12px; opacity: 0.8;">スロット全部を書き出して ZIP にまとめるよ</span>
          </label>
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
          <div class="export-info" style="margin-top: 12px; padding: 12px 12px 0 16px; border-top: 1px solid rgba(0,0,0,0.1);">
            <small style="display: block; margin-bottom: 6px; opacity: 0.7;">${escapeHtml(t('nodes.export.savedTo'))}</small>
            <div class="export-path" style="font-size: 11px; word-break: break-all; opacity: 0.85;">${escapeHtml(settings.outputPath)}</div>
          </div>
        ` : ''}
      </div>
      ${buildNodeInfoSection(node, context, { tipKey: 'nodes.export.tip' })}
    </div>
  `;
};

const bindExportEvents = (
  node: RendererNode,
  context: NodeRendererContext,
  container: HTMLElement
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
  const formatSelect = container.querySelector<HTMLSelectElement>(
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
  const qualitySelect = container.querySelector<HTMLSelectElement>(
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
  const navButtons = container.querySelectorAll<HTMLButtonElement>(
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

  const zipRow = container.querySelector<HTMLElement>(`[data-export-zip-row]`);
  const zipCheckbox = container.querySelector<HTMLInputElement>(`[data-export-zip][data-node-id="${node.id}"]`);

  const findProgramConnection = () =>
    context.state.connections.find(c => c.toNodeId === node.id && c.toPortId === 'program');

  const isBatchSource = () => {
    const conn = findProgramConnection();
    if (!conn) return false;
    const upstream = state.nodes.find(n => n.id === conn.fromNodeId);
    return upstream?.typeId === 'batchcrop';
  };

  const updateZipVisibility = () => {
    if (!zipRow) return;
    zipRow.style.display = isBatchSource() ? 'block' : 'none';
    if (!isBatchSource() && zipCheckbox) {
      zipCheckbox.checked = false;
    }
  };

  updateZipVisibility();

  const parsePathParts = (filePath: string) => {
    const parts = filePath.split(/[/\\]/);
    const fileName = parts.pop() || '';
    const sep = filePath.includes('\\') ? '\\' : '/';
    const dir = parts.join(sep) || (sep === '\\' ? '.\\' : './');
    const dot = fileName.lastIndexOf('.');
    const base = dot > 0 ? fileName.slice(0, dot) : fileName;
    const ext = dot > 0 ? fileName.slice(dot) : '';
    return { dir, base, ext, sep };
  };

  const collectUpstreamNodes = (startNodeId: string): any[] => {
    const nodes: any[] = [];
    let currentId = startNodeId;
    let depth = 0;
    const MAX_DEPTH = 50;

    while (currentId && depth < MAX_DEPTH) {
      const currentNode = context.state.nodes.find(n => n.id === currentId);
      if (!currentNode) break;

      const nodeSettings = currentNode.settings || {};
      const mediaNode: any = {
        id: currentNode.id,
        typeId: currentNode.typeId,
        nodeVersion: '1.0.0',
        ...nodeSettings
      };

      if (currentNode.typeId === 'loadVideo' || currentNode.typeId === 'loadImage') {
        mediaNode.path = (nodeSettings as any).filePath;
      } else if (currentNode.typeId === 'trim') {
        if ((nodeSettings as any).region) {
          mediaNode.region = (nodeSettings as any).region;
        } else if ((nodeSettings as any).cropRegion) {
          mediaNode.region = (nodeSettings as any).cropRegion;
        }
      }

      if (currentNode.typeId !== 'mediaPreview') {
        nodes.unshift(mediaNode);
      }

      const inputPorts = ['program', 'source', 'input', 'input-1', 'input-2', 'input-3', 'base', 'background'];
      const conn = context.state.connections.find(c => c.toNodeId === currentId && inputPorts.includes(c.toPortId));
      if (!conn) break;
      currentId = conn.fromNodeId;
      depth++;
    }
    return nodes;
  };

  const exportBtn = container.querySelector<HTMLButtonElement>(
    `[data-export-btn][data-node-id="${node.id}"]`
  );
  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      console.log('[Export] Export button clicked');
      const targetNode = state.nodes.find(n => n.id === node.id);
      if (!targetNode) {
        console.error('[Export] Target node not found');
        return;
      }

      const { t } = context;
      const settings: ExportSettings = (targetNode.settings as ExportSettings) || {};
      const format: ExportSettings['format'] = (settings.format as ExportSettings['format']) || 'mp4';
      const quality = settings.quality || 'high';
      const wantsZip = !!zipCheckbox?.checked;

      const programConnection = findProgramConnection();
      if (!programConnection) {
        console.error('[Export] No input connected');
        alert('No input connected');
        return;
      }
      console.log('[Export] Input connected, proceeding to dialog');

      const sourceNode = state.nodes.find(n => n.id === programConnection.fromNodeId);
      const isBatch = sourceNode?.typeId === 'batchcrop';

      const extensions = format === 'png' || format === 'jpg'
        ? [format]
        : [format === 'mov' ? 'mov' : 'mp4'];

      // If ZIP希望なら拡張子をzipに合わせる
      const dialogExtensions = wantsZip && isBatch ? ['zip'] : extensions;
      const dialogName = wantsZip && isBatch ? 'ZIP' : format.toUpperCase();

      try {
        console.log('[Export] Opening save dialog...');
        const result = await window.nodevision.showSaveDialog({
          title: t('nodes.export.save'),
          filters: [{ name: dialogName, extensions: dialogExtensions }]
        });
        if (result.canceled || !result.filePath) return;

        targetNode.settings = { ...settings, outputPath: result.filePath } as any;

        // エクスポート処理開始のトースト（バッチ/通常どちらも）
        context.showToast(t('toast.exportLutGenerating'));

        if (!isBatch) {
          const upstreamNodes = collectUpstreamNodes(programConnection.fromNodeId);
          const exportMediaNode = { id: node.id, typeId: 'export', nodeVersion: '1.0.0', container: format };
          const chain = [...upstreamNodes, exportMediaNode];
          const jobResult = await window.nodevision.enqueueExportJob({
            sourcePath: '',
            outputPath: result.filePath,
            format,
            quality,
            nodes: chain,
            lutResolutionExport: clampLutRes(state.lutResolutionExport ?? 65)
          });
          if (!jobResult.ok) {
            console.error('[Export] Job enqueue failed:', jobResult.message);
            alert(`Export failed: ${jobResult.message}`);
          } else {
            console.log('[Export] Job enqueued successfully');
            context.showToast(t('toast.exportLutQueued'));
          }
          return;
        }

        // === Batch Export Path ===
        const batchNode = sourceNode;
        const connectedSlots = [1, 2, 3].filter(slot =>
          state.connections.some(c => c.toNodeId === batchNode.id && c.toPortId === `input-${slot}`)
        );
        if (connectedSlots.length === 0) {
          alert('バッチ入力がありません');
          return;
        }

        const { dir, base, ext: chosenExt, sep } = parsePathParts(result.filePath);
        const mediaExt = chosenExt && chosenExt !== '.zip' ? chosenExt : `.${format === 'mov' ? 'mov' : format === 'png' ? 'png' : format === 'jpg' ? 'jpg' : 'mp4'}`;
        const zipPath = wantsZip ? (chosenExt === '.zip' ? result.filePath : `${result.filePath}.zip`) : null;

        // ZIPの場合は一時ディレクトリに出力し、あとでZIPにまとめる
        let tempDirForZip: string | null = null;
        if (wantsZip && os && path && fsPromises) {
          tempDirForZip = path.join(os.tmpdir(), `nodevision-batch-${Date.now()}`);
          await fsPromises.mkdir(tempDirForZip, { recursive: true });
        }

        const builtChains: { slot: number; outputPath: string; nodes: any[] }[] = [];

        for (const slot of connectedSlots) {
          const inputConn = state.connections.find(c => c.toNodeId === batchNode.id && c.toPortId === `input-${slot}`);
          if (!inputConn) continue;
          const upstreamNodes = collectUpstreamNodes(inputConn.fromNodeId).filter(n => n.typeId !== 'batchcrop');

          const trimSettings = ensureTrimSettings(batchNode, slot);
          const slotPreview = state.mediaPreviews.get(batchNode.id)?.outputs?.[`output-${slot}`];

          // region を取得（優先順位: preview.cropRegion -> batchSettings.region -> デフォルト）
          const isFullRegion = (r: any) =>
            r &&
            typeof r.width === 'number' &&
            typeof r.height === 'number' &&
            r.x === 0 &&
            r.y === 0 &&
            r.width >= 0.999 &&
            r.height >= 0.999;

          const pickRegion = () => {
            if (slotPreview?.cropRegion && !isFullRegion(slotPreview.cropRegion)) return slotPreview.cropRegion;
            if (trimSettings.region && typeof trimSettings.region.width === 'number' && typeof trimSettings.region.height === 'number' && !isFullRegion(trimSettings.region)) {
              return trimSettings.region;
            }
            if (slotPreview?.cropRegion) return slotPreview.cropRegion;
            if (trimSettings.region) return trimSettings.region;
            return { x: 0, y: 0, width: 1, height: 1 };
          };

          // 画像座標(0-1)に正規化する
          const normalizeRegion = (region: any, preview: any) => {
            if (!preview || !preview.width || !preview.height || !region) return region ?? { x: 0, y: 0, width: 1, height: 1 };
            const { width, height } = preview;
            const toNorm = (v: number | undefined, base: number) => {
              if (typeof v !== 'number') return 0;
              if (v <= 1 && v >= 0) return v; // 既に正規化済み
              return v / base;
            };
            return {
              x: toNorm(region.x, width),
              y: toNorm(region.y, height),
              width: toNorm(region.width, width),
              height: toNorm(region.height, height)
            };
          };

          const region = normalizeRegion(pickRegion(), slotPreview);
          const regionSpace: 'image' = slotPreview?.cropSpace === 'stage' ? 'image' : 'image';

          const trimNode = {
            id: `${batchNode.id}-slot${slot}-trim`,
            typeId: 'trim',
            nodeVersion: '1.0.0',
            region,
            regionSpace,
            rotationDeg: trimSettings.rotationDeg,
            zoom: trimSettings.zoom,
            flipHorizontal: trimSettings.flipHorizontal,
            flipVertical: trimSettings.flipVertical,
            aspectMode: trimSettings.aspectMode
          };

          const exportMediaNode = { id: node.id, typeId: 'export', nodeVersion: '1.0.0', container: format };
          const chain = [...upstreamNodes, trimNode, exportMediaNode];
          const outputDir = tempDirForZip ?? dir;
          const outputPath = `${outputDir}${outputDir.endsWith(sep) ? '' : sep}${base}_slot${slot}${mediaExt}`;
          builtChains.push({ slot, outputPath, nodes: chain });
        }

        const writtenPaths: string[] = [];
          for (const entry of builtChains) {
            const jobResult = await window.nodevision.enqueueExportJob({
              sourcePath: '',
              outputPath: entry.outputPath,
              format,
            quality,
            nodes: entry.nodes,
            slot: entry.slot,
            lutResolutionExport: clampLutRes(state.lutResolutionExport ?? 65)
          } as any);
            if (!jobResult.ok) {
              console.error('[Export] Job enqueue failed:', jobResult.message);
              alert(`Export failed (slot ${entry.slot}): ${jobResult.message}`);
              return;
            }
            writtenPaths.push(entry.outputPath);
            context.showToast(t('toast.exportLutQueued'));
          }

        if (zipPath && writtenPaths.length > 0) {
          const zipResult = await window.nodevision.enqueueZipJob({
            files: writtenPaths,
            outputPath: zipPath,
            cleanupPaths: writtenPaths
          });
          if (!zipResult?.ok) {
            alert(`ZIPジョブ登録に失敗しました: ${zipResult?.message ?? 'unknown error'}`);
            return;
          }
        }

        console.log('[Export] Batch job(s) enqueued successfully');
      } catch (error) {
        console.error('[Export] Failed to export:', error);
      }
    });
  }
};

export const createExportNodeRenderer = (context: NodeRendererContext): NodeRendererModule => ({
  id: 'export',
  typeIds: ['export'],
  render: (node: RendererNode): NodeRendererView => ({
    afterPortsHtml: buildExportLauncher(node, context),
    afterRender: (el: HTMLElement) => {
      bindExportEvents(node, context, el);
    }
  })
});
