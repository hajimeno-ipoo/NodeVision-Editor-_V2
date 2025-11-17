type PreviewSizeInput = {
  nodeWidth: number;
  nodeHeight: number;
  chromePadding: number;
  reservedHeight: number;
  widthLimit: number;
  minHeight: number;
  minWidth: number;
  aspectRatio: number;
  originalWidth?: number | null;
  originalHeight?: number | null;
  minimumNodePortion?: number;
};

type PreviewSize = {
  width: number;
  height: number;
};

const SAFE_RATIO_FALLBACK = 0.01;
const MAX_RATIO = 4;
const MIN_RATIO = 0.25;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

export const calculatePreviewSize = (input: PreviewSizeInput): PreviewSize => {
  const {
    nodeWidth,
    nodeHeight,
    chromePadding,
    reservedHeight,
    widthLimit,
    minHeight,
    minWidth,
    aspectRatio,
    originalWidth,
    originalHeight,
    minimumNodePortion = 0.6
  } = input;

  const safeRatio = clamp(Math.abs(aspectRatio) || SAFE_RATIO_FALLBACK, MIN_RATIO, MAX_RATIO);
  const availableWidth = Math.max(0, Math.min(widthLimit, nodeWidth));
  const baseHeight = nodeHeight * minimumNodePortion;
  const availableHeight = Math.max(baseHeight, nodeHeight - chromePadding - reservedHeight);

  if (availableWidth === 0 || availableHeight === 0) {
    return { width: 0, height: 0 };
  }

  const originalWidthLimit = originalWidth && originalWidth > 0 ? originalWidth : Number.POSITIVE_INFINITY;
  const originalHeightLimit = originalHeight && originalHeight > 0 ? originalHeight : Number.POSITIVE_INFINITY;

  const maxWidth = Math.min(availableWidth, originalWidthLimit);
  const maxHeight = Math.min(availableHeight, originalHeightLimit);

  const minHeightClamp = Math.min(maxHeight, Math.max(minHeight, 0));
  const minWidthClamp = Math.min(maxWidth, Math.max(minWidth, 0));

  const applyWidthLimits = (widthValue: number): number => clamp(widthValue, minWidthClamp || 0, maxWidth);
  const applyHeightLimits = (heightValue: number): number => clamp(heightValue, minHeightClamp || 0, maxHeight);

  let width = maxWidth;
  let height = width / safeRatio;

  if (height > maxHeight) {
    height = maxHeight;
    width = height * safeRatio;
  }

  if (height < minHeightClamp) {
    height = minHeightClamp;
    width = height * safeRatio;
    if (width > maxWidth) {
      width = maxWidth;
      height = width / safeRatio;
    }
  }

  width = applyWidthLimits(width);
  height = applyHeightLimits(width / safeRatio);

  if (height > maxHeight) {
    height = maxHeight;
    width = height * safeRatio;
    width = applyWidthLimits(width);
  }

  return {
    width: Math.max(0, width),
    height: Math.max(0, height)
  };
};
