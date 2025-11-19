import { test, expect, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = path.resolve(__dirname, '..', '..');
const previewScript = path.join(repoRoot, 'tmp', 'render-preview.js');
const previewHtml = path.join(repoRoot, 'tmp', 'nodevision-preview.html');
const sampleImage = path.join(repoRoot, 'doc', 'ハロウィン.png');
const previewUrl = pathToFileURL(previewHtml).href;

const RATIO_PRESETS = [
  { value: 'square', expected: 1 },
  { value: '4:3', expected: 4 / 3 },
  { value: '16:9', expected: 16 / 9 },
  { value: '9:16', expected: 9 / 16 }
] as const;

const HANDLES: Array<{
  id: 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';
  edges: Array<'left' | 'right' | 'top' | 'bottom'>;
}> = [
  { id: 'n', edges: ['top'] },
  { id: 's', edges: ['bottom'] },
  { id: 'e', edges: ['right'] },
  { id: 'w', edges: ['left'] },
  { id: 'nw', edges: ['left', 'top'] },
  { id: 'ne', edges: ['right', 'top'] },
  { id: 'sw', edges: ['left', 'bottom'] },
  { id: 'se', edges: ['right', 'bottom'] }
];

const TOLERANCE = 0.005;

test.beforeAll(() => {
  execSync('node tmp/render-preview.js', { cwd: repoRoot, stdio: 'inherit' });
});

test('画像トリムのアスペクト比はステージ端でも固定される', async ({ page }) => {
  await page.goto(previewUrl);
  await uploadSampleImage(page);
  await openTrimModal(page);

  const results: Array<{ ratio: string; handle: string; measured: number }> = [];

  for (const preset of RATIO_PRESETS) {
    for (const handle of HANDLES) {
      await resetCropBox(page);
      await page.locator('[data-trim-aspect]').selectOption(preset.value);
      await dragHandleToEdges(page, handle.id, handle.edges);
      const measurement = await measureCropBox(page);
      results.push({ ratio: preset.value, handle: handle.id, measured: measurement.ratio });
      expect(Math.abs(measurement.ratio - preset.expected)).toBeLessThanOrEqual(TOLERANCE);
    }
  }

  test.info().annotations.push({
    type: 'ratios',
    description: JSON.stringify(results)
  });
});

async function uploadSampleImage(page: Page): Promise<void> {
  const uploadButton = page.getByRole('button', { name: 'アップロードするファイルを選択' });
  const fileChooserPromise = page.waitForEvent('filechooser');
  await uploadButton.click();
  const chooser = await fileChooserPromise;
  await chooser.setFiles(sampleImage);
  await page.getByText('ハロウィン.png').first().waitFor();
}

async function openTrimModal(page: Page): Promise<void> {
  await page.getByRole('button', { name: '画像トリム' }).click();
  await page.locator('[data-trim-stage]').waitFor();
}

async function resetCropBox(page: Page): Promise<void> {
  const resetButton = page.locator('[data-trim-reset]');
  await resetButton.scrollIntoViewIfNeeded();
  try {
    await resetButton.click({ force: true });
  } catch {
    await page.evaluate(() => {
      const button = document.querySelector<HTMLButtonElement>('[data-trim-reset]');
      button?.click();
    });
  }
}

async function dragHandleToEdges(
  page: Page,
  handleId: string,
  edges: Array<'left' | 'right' | 'top' | 'bottom'>
): Promise<void> {
  const stageBox = await page.locator('[data-trim-stage]').boundingBox();
  if (!stageBox) {
    throw new Error('Trim stage bounding box not found');
  }
  const handleLocator = page.locator(`[data-trim-handle="${handleId}"]`);
  const handleBox = await handleLocator.boundingBox();
  if (!handleBox) {
    throw new Error(`Handle ${handleId} bounding box missing`);
  }
  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;
  const PADDING = 2;
  let targetX = startX;
  let targetY = startY;
  if (edges.includes('left')) {
    targetX = stageBox.x + PADDING;
  } else if (edges.includes('right')) {
    targetX = stageBox.x + stageBox.width - PADDING;
  }
  if (edges.includes('top')) {
    targetY = stageBox.y + PADDING;
  } else if (edges.includes('bottom')) {
    targetY = stageBox.y + stageBox.height - PADDING;
  }
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(targetX, targetY, { steps: 10 });
  await page.mouse.up();
}

async function measureCropBox(page: Page): Promise<{
  width: number;
  height: number;
  ratio: number;
}> {
  const box = await page.locator('[data-trim-box]').boundingBox();
  if (!box) {
    throw new Error('Crop box bounding box missing');
  }
  return {
    width: Number(box.width.toFixed(2)),
    height: Number(box.height.toFixed(2)),
    ratio: Number((box.width / box.height).toFixed(3))
  };
}
