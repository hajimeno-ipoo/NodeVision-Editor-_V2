import type { NodeTemplate } from './types';

export const DEFAULT_NODE_TEMPLATES: NodeTemplate[] = [
  {
    typeId: 'loadMedia',
    nodeVersion: '1.0.0',
    title: 'Load Media',
    category: 'Input',
    description: 'Open a local image or video file',
    keywords: ['load', 'open', 'input', 'video', 'image'],
    width: 240,
    height: 128
  },
  {
    typeId: 'trim',
    nodeVersion: '1.0.0',
    title: 'Trim',
    category: 'Edit',
    description: 'Cut media between in/out points',
    keywords: ['trim', 'cut', 'edit']
  },
  {
    typeId: 'resize',
    nodeVersion: '1.0.0',
    title: 'Resize',
    category: 'Transform',
    description: 'Resize media with aspect ratio controls',
    keywords: ['resize', 'scale', 'transform'],
    width: 240,
    height: 150
  },
  {
    typeId: 'overlay',
    nodeVersion: '1.0.0',
    title: 'Overlay',
    category: 'Compositing',
    description: 'Blend two sources with position controls',
    keywords: ['overlay', 'blend', 'composite'],
    width: 260,
    height: 170
  },
  {
    typeId: 'export',
    nodeVersion: '1.0.0',
    title: 'Export Media',
    category: 'Output',
    description: 'Finalize and export the edited result',
    keywords: ['export', 'save', 'output'],
    width: 240,
    height: 150
  }
];
