import type { NodeTemplate } from './types';

const DEFAULT_TRIM_SETTINGS: NodeTemplate['defaultSettings'] = {
  kind: 'trim',
  startMs: null,
  endMs: null,
  strictCut: false,
  region: null
};

export const DEFAULT_NODE_TEMPLATES: NodeTemplate[] = [
  {
    typeId: 'loadImage',
    nodeVersion: '1.0.0',
    title: 'Load Image',
    category: 'Input',
    description: 'Open a local image file',
    keywords: ['load', 'open', 'input', 'image', 'photo'],
    width: 240,
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
    width: 240,
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
    title: 'Trim',
    category: 'Edit',
    description: 'Cut media between in/out points',
    keywords: ['trim', 'cut', 'edit'],
    inputs: [
      { id: 'source', label: 'Source', direction: 'input', dataType: 'video', required: true }
    ],
    outputs: [
      { id: 'result', label: 'Result', direction: 'output', dataType: 'video', required: true }
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
    typeId: 'crop',
    nodeVersion: '1.0.0',
    title: 'Crop',
    category: 'Transform',
    description: 'Trim the visible area to a custom frame',
    keywords: ['crop', 'frame', 'bounds'],
    width: 220,
    height: 140,
    inputs: [
      { id: 'source', label: 'Source', direction: 'input', dataType: 'video', required: true }
    ],
    outputs: [
      { id: 'cropped', label: 'Cropped', direction: 'output', dataType: 'video', required: true }
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
    typeId: 'export',
    nodeVersion: '1.0.0',
    title: 'Export Media',
    category: 'Output',
    description: 'Finalize and export the edited result',
    keywords: ['export', 'save', 'output'],
    width: 240,
    height: 150,
    inputs: [
      { id: 'program', label: 'Program', direction: 'input', dataType: 'video', required: true }
    ],
    outputs: [
      { id: 'delivery', label: 'Exported', direction: 'output', dataType: 'video', required: false }
    ]
  }
];
