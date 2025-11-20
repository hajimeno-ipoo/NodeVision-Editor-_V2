import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { MediaChain } from './builder';
import { buildFFmpegPlan } from './builder';

describe('buildFFmpegPlan (cropping trim)', () => {
  it('builds load→trim(crop)→resize→export with expression-based crop', () => {
    const chain: MediaChain = {
      nodes: [
        {
          id: 'load',
          typeId: 'loadVideo',
          nodeVersion: '1.0.0',
          path: '/tmp/source.mp4',
          durationMs: 10_000,
          fps: 30
        },
        {
          id: 'trim',
          typeId: 'trim',
          nodeVersion: '1.0.0',
          region: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 }
        },
        {
          id: 'resize',
          typeId: 'resize',
          nodeVersion: '1.0.0',
          width: 1280,
          height: 720,
          mode: 'contain'
        },
        { id: 'export', typeId: 'export', nodeVersion: '1.0.0', container: 'mp4' }
      ]
    };

    const plan = buildFFmpegPlan(chain);

    expect(plan.stages[0].stage).toBe('input');
    const cropStage = plan.stages.find(stage => stage.typeId === 'crop');
    expect(cropStage?.params).toMatchObject({
      x: 'iw*0.1',
      y: 'ih*0.1',
      width: 'iw*0.8',
      height: 'ih*0.8'
    });
    const resizeStage = plan.stages.find(stage => stage.typeId === 'resize');
    expect(resizeStage?.params).toMatchObject({ width: 1280, height: 720, mode: 'contain' });

    const outputStage = plan.stages[plan.stages.length - 1];
    expect(outputStage.stage).toBe('output');
    expect(plan.metadata.estimatedDurationMs).toBe(10_000);
    expect(plan.metadata.strictCut).toBe(false);
  });

  it('prefers explicit crop node and applies other filters', () => {
    const chain: MediaChain = {
      nodes: [
        { id: 'load', typeId: 'loadVideo', nodeVersion: '1.0.0', path: 'demo.mov', durationMs: 8000, fps: 24 },
        { id: 'trim', typeId: 'trim', nodeVersion: '1.0.0', region: { x: 0, y: 0, width: 0.5, height: 0.5 } },
        { id: 'crop', typeId: 'crop', nodeVersion: '1.0.0', width: 800, height: 600, x: 10, y: 20 },
        { id: 'overlay', typeId: 'overlay', nodeVersion: '1.0.0', sourcePath: './logo.png', opacity: 0.6, x: 32, y: 24 },
        { id: 'text', typeId: 'text', nodeVersion: '1.0.0', text: 'S:Hello', color: '#00ffcc', fontSize: 64, x: '10', y: '20' },
        { id: 'speed', typeId: 'speed', nodeVersion: '1.0.0', ratio: 0.5 },
        { id: 'change-fps', typeId: 'changeFps', nodeVersion: '1.0.0', fps: 24, vsync: 'vfr' },
        { id: 'export', typeId: 'export', nodeVersion: '1.0.0' }
      ]
    };

    const plan = buildFFmpegPlan(chain);
    const cropStage = plan.stages.find(stage => stage.typeId === 'crop');
    expect(cropStage?.params).toMatchObject({ width: 800, height: 600, x: 10, y: 20 });
    const changeFpsStage = plan.stages.find(stage => stage.typeId === 'changeFps');
    expect(changeFpsStage).toBeTruthy();
    expect(plan.preview.maxFps).toBe(24);
  });

  it('returns expressions for absolute trim values', () => {
    const chain: MediaChain = {
      nodes: [
        { id: 'load', typeId: 'loadImage', nodeVersion: '1.0.0', path: path.resolve('image.png') },
        { id: 'trim', typeId: 'trim', nodeVersion: '1.0.0', region: { x: 100, y: 120, width: 640, height: 480 } },
        { id: 'export', typeId: 'export', nodeVersion: '1.0.0' }
      ]
    };
    const plan = buildFFmpegPlan(chain);
    const cropStage = plan.stages.find(stage => stage.typeId === 'crop');
    expect(cropStage?.params).toMatchObject({ width: 640, height: 480, x: 100, y: 120 });
  });

  it('passes through when no trim or crop nodes exist', () => {
    const chain: MediaChain = {
      nodes: [
        { id: 'load', typeId: 'loadImage', nodeVersion: '1.0.0', path: path.resolve('image.png') },
        { id: 'export', typeId: 'export', nodeVersion: '1.0.0' }
      ]
    };
    const plan = buildFFmpegPlan(chain);
    expect(plan.stages.some(stage => stage.typeId === 'crop')).toBe(false);
  });
});
