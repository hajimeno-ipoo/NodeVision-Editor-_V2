import { describe, expect, it } from 'vitest';

import { DEFAULT_NODE_TEMPLATES } from './templates';

const REQUIRED_MEDIA_NODES = ['overlay', 'text', 'crop', 'speed', 'changeFps', 'mediaPreview'];

describe('DEFAULT_NODE_TEMPLATES', () => {
  it('exposes all media/preview nodes with typeId + nodeVersion', () => {
    REQUIRED_MEDIA_NODES.forEach(typeId => {
      const template = DEFAULT_NODE_TEMPLATES.find(entry => entry.typeId === typeId);
      expect(template, `${typeId} template`).toBeTruthy();
      expect(template?.nodeVersion).toMatch(/^[0-9]+\.[0-9]+\.[0-9]+$/);
      expect(template?.title.length).toBeGreaterThan(0);
    });
  });

  it('provides default settings for the trim template', () => {
    const trimTemplate = DEFAULT_NODE_TEMPLATES.find(entry => entry.typeId === 'trim');
    expect(trimTemplate).toBeTruthy();
    expect(trimTemplate?.defaultSettings).toEqual({
      kind: 'trim',
      region: { x: 0, y: 0, width: 1, height: 1 },
      regionSpace: 'stage',
      rotationDeg: 0,
      zoom: 1,
      flipHorizontal: false,
      flipVertical: false,
      aspectMode: 'free'
    });
  });
});
