import { execSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { test, expect, type Page } from '@playwright/test';

const repoRoot = path.resolve(__dirname, '..', '..');
const previewHtml = path.join(repoRoot, 'tmp', 'nodevision-preview.html');
const sampleImage = path.join(repoRoot, 'doc', 'ハロウィン.png');
const previewUrl = pathToFileURL(previewHtml).href;
const RATIO_TOLERANCE = 0.02;

test.beforeAll(() => {
  execSync('node tmp/render-preview.js', { cwd: repoRoot, stdio: 'inherit' });
});

test('アスペクト比プリセットを適用すると画像比率が維持される', async ({ page }) => {
  const presets: Array<{ value: string; expected?: number }> = [
    { value: 'original' },
    { value: 'square', expected: 1 },
    { value: '2:1', expected: 2 / 1 },
    { value: '3:1', expected: 3 / 1 },
    { value: '3:2', expected: 3 / 2 },
    { value: '4:3', expected: 4 / 3 },
    { value: '5:4', expected: 5 / 4 },
    { value: '16:9', expected: 16 / 9 },
    { value: '16:10', expected: 16 / 10 },
    { value: '9:16', expected: 9 / 16 },
    { value: '1.618:1', expected: 1.61803398875 }
  ];
  await page.goto(previewUrl);
  await uploadSampleImage(page);
  await openTrimModal(page);

  for (const preset of presets) {
    await resetCropBox(page);
    await page.locator('[data-trim-aspect]').selectOption(preset.value);
    const expectedRatio = preset.expected ?? (await getNaturalImageRatio(page));
    await dragHandle(page, 'se', -140, -100);
    await dragCropBox(page, -160, -40);

    await dragHandle(page, 's', 0, 260);
    const afterSouthRatio = await getImageRatio(page);
    expect(Math.abs(afterSouthRatio - expectedRatio)).toBeLessThanOrEqual(RATIO_TOLERANCE);

    await dragHandle(page, 'e', 260, 0);
    const afterEastRatio = await getImageRatio(page);
    expect(Math.abs(afterEastRatio - expectedRatio)).toBeLessThanOrEqual(RATIO_TOLERANCE);
  }
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

async function dragCropBox(page: Page, deltaX: number, deltaY: number): Promise<void> {
  const box = await page.locator('[data-trim-box]').boundingBox();
  if (!box) {
    throw new Error('Crop box bounding box missing');
  }
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 12 });
  await page.mouse.up();
}

async function dragHandle(page: Page, handleId: string, deltaX: number, deltaY: number): Promise<void> {
  const handleLocator = page.locator(`[data-trim-handle="${handleId}"]`);
  const handleBox = await handleLocator.boundingBox();
  if (!handleBox) {
    throw new Error(`Handle ${handleId} bounding box missing`);
  }
  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 10 });
  await page.mouse.up();
}

async function getImageRatio(page: Page): Promise<number> {
  const ratio = await page.evaluate(() => {
    const cropBox = document.querySelector('[data-trim-box]');
    if (!cropBox) {
      return NaN;
    }
    const boxRect = cropBox.getBoundingClientRect();
    return boxRect.width / boxRect.height;
  });
  if (!Number.isFinite(ratio)) {
    throw new Error('Image ratio unavailable');
  }
  return ratio;
}

async function getNaturalImageRatio(page: Page): Promise<number> {
  const ratio = await page.evaluate(() => {
    const img = document.querySelector<HTMLImageElement>('[data-trim-stage] img');
    if (!img) {
      return NaN;
    }
    const naturalWidth = img.naturalWidth || img.width || 1;
    const naturalHeight = img.naturalHeight || img.height || 1;
    return naturalWidth / naturalHeight;
  });
  if (!Number.isFinite(ratio)) {
    throw new Error('Natural ratio unavailable');
  }
  return ratio;
}
