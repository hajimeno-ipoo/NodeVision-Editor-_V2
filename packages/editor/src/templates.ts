import type { NodeTemplate } from './types';

const DEFAULT_TRIM_SETTINGS: NodeTemplate['defaultSettings'] = {
  kind: 'trim',
  region: { x: 0, y: 0, width: 1, height: 1 },
  regionSpace: 'image',
  rotationDeg: 0,
  zoom: 1,
  flipHorizontal: false,
  flipVertical: false,
  aspectMode: 'free'
};

export const DEFAULT_NODE_TEMPLATES: NodeTemplate[] = [
  {
    typeId: 'loadImage',
    nodeVersion: '1.0.0',
    title: 'Load Image',
    category: 'Input',
    description: 'Open a local image file',
    keywords: ['load', 'open', 'input', 'image', 'photo'],
    width: 280,
    height: 128,
    outputs: [
      { id: 'media', label: 'Media', direction: 'output', dataType: 'video', required: true }
    ]
  },
  {
    typeId: 'loadVideo',
    nodeVersion: '1.0.0',
    title: 'Load Video',
    category: 'Input',
    description: 'Open a local video file',
    keywords: ['load', 'open', 'input', 'video'],
    width: 280,
    height: 128,
    outputs: [
      { id: 'media', label: 'Media', direction: 'output', dataType: 'video', required: true }
    ]
  },
  {
    typeId: 'mediaPreview',
    nodeVersion: '1.0.0',
    title: 'Media Preview',
    category: 'Viewer',
    description: 'Display a connected image or video inside the canvas',
    keywords: ['preview', 'monitor', 'viewer', 'display'],
    width: 320,
    height: 260,
    inputs: [
      { id: 'source', label: 'Source', direction: 'input', dataType: 'video', required: true }
    ]
  },
  {
    typeId: 'trim',
    nodeVersion: '1.0.0',
    title: 'Trim (Crop)',
    category: 'Edit',
    description: 'Crop the visible area of images or videos',
    keywords: ['trim', 'crop', 'cut', 'edit'],
    width: 360,
    height: 520,
    inputs: [
      { id: 'source', label: 'Source', direction: 'input', dataType: 'video', required: true }
    ],
    outputs: [
      { id: 'result', label: 'Result', direction: 'output', dataType: 'video', required: true }
    ],
    defaultSettings: DEFAULT_TRIM_SETTINGS
  },
  {
    typeId: 'batchcrop',
    nodeVersion: '1.0.0',
    title: 'Batch Crop',
    category: 'Edit',
    description: 'Apply crop to multiple images',
    keywords: ['batch', 'crop', 'trim', 'edit', 'multiple'],
    width: 360,
    height: 640,
    inputs: [
      { id: 'input-1', label: 'Source 1', direction: 'input', dataType: 'video', required: true },
      { id: 'input-2', label: 'Source 2', direction: 'input', dataType: 'video', required: false },
      { id: 'input-3', label: 'Source 3', direction: 'input', dataType: 'video', required: false }
    ],
    outputs: [
      { id: 'output-1', label: 'Result 1', direction: 'output', dataType: 'video', required: true },
      { id: 'output-2', label: 'Result 2', direction: 'output', dataType: 'video', required: false },
      { id: 'output-3', label: 'Result 3', direction: 'output', dataType: 'video', required: false },
      { id: 'output-monitor', label: 'Monitor', direction: 'output', dataType: 'video', required: false }
    ],
    defaultSettings: DEFAULT_TRIM_SETTINGS
  },
  {
    typeId: 'resize',
    nodeVersion: '1.0.0',
    title: 'Resize',
    category: 'Transform',
    description: 'Resize media with aspect ratio controls',
    keywords: ['resize', 'scale', 'transform'],
    width: 240,
    height: 150,
    inputs: [
      { id: 'source', label: 'Source', direction: 'input', dataType: 'video', required: true }
    ],
    outputs: [
      { id: 'resized', label: 'Resized', direction: 'output', dataType: 'video', required: true }
    ]
  },
  {
    typeId: 'overlay',
    nodeVersion: '1.0.0',
    title: 'Overlay',
    category: 'Compositing',
    description: 'Blend two sources with position controls',
    keywords: ['overlay', 'blend', 'composite'],
    width: 260,
    height: 170,
    inputs: [
      { id: 'base', label: 'Base', direction: 'input', dataType: 'video', required: true },
      { id: 'layer', label: 'Layer', direction: 'input', dataType: 'video', required: true }
    ],
    outputs: [
      { id: 'composite', label: 'Composite', direction: 'output', dataType: 'video', required: true }
    ]
  },
  {
    typeId: 'text',
    nodeVersion: '1.0.0',
    title: 'Text Overlay',
    category: 'Compositing',
    description: 'Render titles or captions with font and color controls',
    keywords: ['text', 'title', 'caption'],
    width: 240,
    height: 150,
    inputs: [
      { id: 'background', label: 'Background', direction: 'input', dataType: 'video', required: true }
    ],
    outputs: [
      { id: 'titled', label: 'Titled', direction: 'output', dataType: 'video', required: true }
    ]
  },
  {
    typeId: 'speed',
    nodeVersion: '1.0.0',
    title: 'Speed',
    category: 'Timing',
    description: 'Ramp playback speed for slow/fast motion',
    keywords: ['speed', 'slow', 'fast'],
    width: 220,
    height: 140,
    inputs: [
      { id: 'source', label: 'Source', direction: 'input', dataType: 'video', required: true }
    ],
    outputs: [
      { id: 'retimed', label: 'Retimed', direction: 'output', dataType: 'video', required: true }
    ]
  },
  {
    typeId: 'changeFps',
    nodeVersion: '1.0.0',
    title: 'Change FPS',
    category: 'Timing',
    description: 'Convert variable frame rate clips to constant FPS',
    keywords: ['fps', 'frame rate', 'cfr'],
    width: 220,
    height: 140,
    inputs: [
      { id: 'source', label: 'Source', direction: 'input', dataType: 'video', required: true }
    ],
    outputs: [
      { id: 'normalized', label: 'Normalized', direction: 'output', dataType: 'video', required: true }
    ]
  },
  {
    typeId: 'colorCorrection',
    nodeVersion: '1.0.0',
    title: 'Color Correction',
    category: 'Color',
    description: 'Adjust brightness, contrast, saturation, and gamma',
    keywords: ['color', 'correction', 'grade', 'brightness', 'contrast'],
    width: 389,
    height: 737,
    inputs: [
      { id: 'source', label: 'Source', direction: 'input', dataType: 'video', required: true }
    ],
    outputs: [
      { id: 'result', label: 'Result', direction: 'output', dataType: 'video', required: true }
    ],
    defaultSettings: {
      kind: 'colorCorrection',
      brightness: 0,
      contrast: 1,
      saturation: 1,
      gamma: 1,
      exposure: 0,
      shadows: 0,
      highlights: 0,
      temperature: 0,
      tint: 0
    }
  },
  {
    typeId: 'primaryGrading',
    nodeVersion: '1.0.0',
    title: 'Primary Grading',
    category: 'Color',
    description: 'Professional primary color correction with wheels and curves',
    keywords: ['color', 'grade', 'primary', 'wheels', 'lift', 'gamma', 'gain'],
    width: 400,
    height: 600,
    inputs: [
      { id: 'source', label: 'Source', direction: 'input', dataType: 'video', required: true }
    ],
    outputs: [
      { id: 'result', label: 'Result', direction: 'output', dataType: 'video', required: true }
    ],
    defaultSettings: {
      kind: 'primaryGrading',
      exposure: 0,
      contrast: 1,
      saturation: 1,
      temperature: 0,
      tint: 0,
      lift: { hue: 0, saturation: 0, luminance: 0 },
      gamma: { hue: 0, saturation: 0, luminance: 0 },
      gain: { hue: 0, saturation: 0, luminance: 0 }
    }
  },
  {
    typeId: 'curves',
    nodeVersion: '1.0.0',
    title: 'Curves',
    category: 'Color',
    description: 'Adjust tonal range and color balance using curves',
    keywords: ['color', 'curves', 'rgb', 'luma'],
    width: 474,
    height: 520,
    inputs: [
      { id: 'source', label: 'Source', direction: 'input', dataType: 'video', required: true }
    ],
    outputs: [
      { id: 'result', label: 'Result', direction: 'output', dataType: 'video', required: true }
    ],
    defaultSettings: {
      kind: 'curves',
      master: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      red: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      green: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      blue: [{ x: 0, y: 0 }, { x: 1, y: 1 }]
    }
  },
  {
    typeId: 'lutLoader',
    nodeVersion: '1.0.0',
    title: 'LUT Loader',
    category: 'Color',
    description: 'Apply 3D LUTs (.cube) to the footage',
    keywords: ['color', 'lut', 'cube', 'look'],
    width: 390,
    height: 483,
    inputs: [
      { id: 'source', label: 'Source', direction: 'input', dataType: 'video', required: true }
    ],
    outputs: [
      { id: 'result', label: 'Result', direction: 'output', dataType: 'video', required: true }
    ],
    defaultSettings: {
      kind: 'lutLoader',
      intensity: 1.0
    }
  },
  {
    typeId: 'secondaryGrading',
    nodeVersion: '1.0.0',
    title: 'Secondary Grading',
    category: 'Color',
    description: 'Isolate and adjust specific colors (HSL Qualifier)',
    keywords: ['color', 'secondary', 'qualifier', 'hsl', 'mask'],
    width: 400,
    height: 550,
    inputs: [
      { id: 'source', label: 'Source', direction: 'input', dataType: 'video', required: true }
    ],
    outputs: [
      { id: 'result', label: 'Result', direction: 'output', dataType: 'video', required: true },
      { id: 'mask', label: 'Alpha Mask', direction: 'output', dataType: 'video', required: false }
    ],
    defaultSettings: {
      kind: 'secondaryGrading',
      hueCenter: 0,
      hueWidth: 20,
      hueSoftness: 10,
      satCenter: 0.5,
      satWidth: 0.5,
      satSoftness: 0.1,
      lumCenter: 0.5,
      lumWidth: 0.5,
      lumSoftness: 0.1,
      invert: false,
      saturation: 1.0,
      hueShift: 0,
      brightness: 0,
      showMask: false
    }
  },
  {
    typeId: 'scopeViewer',
    nodeVersion: '1.0.0',
    title: 'Scope Viewer',
    category: 'Viewer',
    description: 'View RGB Histogram, Waveform, and Vectorscope',
    keywords: ['scope', 'histogram', 'waveform', 'vectorscope', 'analysis'],
    width: 350,
    height: 350,
    inputs: [
      { id: 'source', label: 'Source', direction: 'input', dataType: 'video', required: true }
    ],
    defaultSettings: {
      kind: 'scopeViewer',
      scopeType: 'histogram' // 'histogram' | 'waveform' | 'vectorscope'
    }
  },
  {
    typeId: 'export',
    nodeVersion: '1.0.0',
    title: 'Export Media',
    category: 'Output',
    description: 'Finalize and export the edited result',
    keywords: ['export', 'save', 'output'],
    width: 400,
    height: 620,
    inputs: [
      { id: 'program', label: 'Export', direction: 'input', dataType: 'video', required: true }
    ]
  }
];
