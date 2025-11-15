import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { MediaChain } from './builder';
import { buildFFmpegPlan } from './builder';

describe('buildFFmpegPlan', () => {
  it('throws when load or export nodes are missing', () => {
    expect(() => buildFFmpegPlan({ nodes: [] })).toThrow('loadImage or loadVideo');
    expect(() => buildFFmpegPlan({} as unknown as MediaChain)).toThrow('media chain');

    const chain: MediaChain = {
      nodes: [
        { id: 'load', typeId: 'loadVideo', nodeVersion: '1.0.0', path: 'input.mp4' }
      ]
    };

    expect(() => buildFFmpegPlan(chain)).toThrow('export');
  });

  it('builds a shortest-path chain for load→trim→resize→export', () => {
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
          startMs: 1200,
          endMs: 4200
        },
        {
          id: 'resize',
          typeId: 'resize',
          nodeVersion: '1.0.0',
          width: 1920,
          height: 1080,
          mode: 'contain'
        },
        { id: 'export', typeId: 'export', nodeVersion: '1.0.0', container: 'mp4' }
      ]
    };

    const plan = buildFFmpegPlan(chain);
    const inputStage = plan.stages[0];
    expect(inputStage.stage).toBe('input');
    expect((inputStage as any).args).toEqual(['-ss', '1.200', '-t', '3.000']);

    const resizeStage = plan.stages.find(stage => stage.typeId === 'resize');
    expect(resizeStage).toBeTruthy();
    expect(resizeStage?.stage).toBe('filter');
    expect(resizeStage?.params).toMatchObject({ interpolation: 'bicubic', width: 1920, height: 1080 });

    const outputStage = plan.stages[plan.stages.length - 1];
    expect(outputStage?.stage).toBe('output');
    expect((outputStage as any).pixelFormat).toBe('yuv420p');

    expect(plan.preview.filters).toEqual([
      { type: 'colorspace', params: { profile: 'srgb', format: 'rgba' } },
      { type: 'scale', params: { width: 1920, height: 1080, interpolation: 'bilinear' } },
      { type: 'setsar', params: { value: 1 } }
    ]);
    expect(plan.preview.maxFps).toBe(30);
    expect(plan.metadata.strictCut).toBe(false);
    expect(plan.metadata.sarNormalized).toBe(true);
    expect(plan.metadata.vsync).toBe('cfr');
    expect(plan.metadata.estimatedDurationMs).toBe(3000);
  });

  it('adds overlay/text/crop/speed/fps nodes and keeps preview in sync', () => {
    const chain: MediaChain = {
      nodes: [
        {
          id: 'load',
          typeId: 'loadVideo',
          nodeVersion: '1.0.0',
          path: './fixture.mov',
          durationMs: 8000
        },
        {
          id: 'trim-strict',
          typeId: 'trim',
          nodeVersion: '1.0.0',
          startMs: 500,
          endMs: 1500,
          strictCut: true
        },
        {
          id: 'crop',
          typeId: 'crop',
          nodeVersion: '1.0.0',
          width: 800,
          height: 600,
          x: 10,
          y: 16
        },
        {
          id: 'overlay',
          typeId: 'overlay',
          nodeVersion: '1.0.0',
          sourcePath: './logo.png',
          opacity: 0.6,
          x: 32,
          y: 24
        },
        {
          id: 'title',
          typeId: 'text',
          nodeVersion: '1.0.0',
          text: 'S:Hello',
          color: '#00ffcc',
          fontSize: 64,
          x: '100',
          y: '200'
        },
        {
          id: 'speed',
          typeId: 'speed',
          nodeVersion: '1.0.0',
          ratio: 2
        },
        {
          id: 'fps',
          typeId: 'changeFps',
          nodeVersion: '1.0.0',
          fps: 48
        },
        { id: 'export', typeId: 'export', nodeVersion: '1.0.0', container: 'mp4' }
      ]
    };

    const plan = buildFFmpegPlan(chain);
    const overlayStage = plan.stages.find(stage => stage.typeId === 'overlay');
    expect(overlayStage).toBeTruthy();
    expect(overlayStage?.params).toMatchObject({
      sourcePath: path.resolve('./logo.png'),
      opacity: 0.6,
      x: 32,
      y: 24
    });

    const textStage = plan.stages.find(stage => stage.typeId === 'text');
    expect(textStage?.params).toMatchObject({ color: '#00ffcc', fontSize: 64, x: '100', y: '200' });
    expect(textStage?.params).toHaveProperty('escapedText', 'S\\:Hello');

    const trimStage = plan.stages.find(stage => stage.typeId === 'trim');
    expect(trimStage).toBeTruthy();
    expect((plan.stages[0] as any).args).toEqual([]);

    const speedStage = plan.stages.find(stage => stage.typeId === 'speed');
    expect(speedStage?.params).toMatchObject({ ratio: 2, setpts: 'PTS/2' });

    const preview = plan.preview;
    expect(preview.width).toBe(1280);
    expect(preview.height).toBe(720);
    expect(preview.maxFps).toBe(48);

    const exportStage = plan.stages[plan.stages.length - 1];
    expect(exportStage.stage).toBe('output');
    expect(exportStage.args).toEqual([]);

    expect(plan.metadata.strictCut).toBe(true);
    expect(plan.metadata.vsync).toBe('cfr');
    expect(plan.metadata.estimatedDurationMs).toBe(500);
  });

  it('applies preview overrides, clamps opacity, and skips invalid speeds', () => {
    const chain: MediaChain = {
      nodes: [
        { id: 'load', typeId: 'loadVideo', nodeVersion: '1.0.0', path: 'clip.mov' },
        {
          id: 'trim-negative',
          typeId: 'trim',
          nodeVersion: '1.0.0',
          startMs: -200
        },
        {
          id: 'overlay-win',
          typeId: 'overlay',
          nodeVersion: '1.0.0',
          sourcePath: 'C\\\\assets\\logo.png',
          opacity: 2,
          x: 4,
          y: 8
        },
        {
          id: 'overlay-low',
          typeId: 'overlay',
          nodeVersion: '1.0.0',
          sourcePath: './stamp.png',
          opacity: -0.5
        },
        {
          id: 'overlay-default',
          typeId: 'overlay',
          nodeVersion: '1.0.0',
          sourcePath: './badge.png'
        },
        {
          id: 'text-escape',
          typeId: 'text',
          nodeVersion: '1.0.0',
          text: 'Label:1\\2'
        },
        { id: 'speed-invalid', typeId: 'speed', nodeVersion: '1.0.0', ratio: 0 },
        { id: 'export', typeId: 'export', nodeVersion: '1.0.0' }
      ]
    };

    const plan = buildFFmpegPlan(chain, { preview: { width: 640, height: 360, maxFps: 24 } });
    const inputStage = plan.stages[0] as any;
    expect(inputStage.args).toEqual([]);

    const overlayStages = plan.stages.filter(stage => stage.typeId === 'overlay');
    expect(overlayStages).toHaveLength(3);
    expect(overlayStages[0]?.params).toMatchObject({ opacity: 1 });
    expect(overlayStages[1]?.params).toMatchObject({ opacity: 0 });
    expect(overlayStages[2]?.params).toMatchObject({ opacity: 1 });

    const expectedEscaped = 'C\\\\assets\\logo.png'.replace(/[\\:]/g, match => `\\${match}`);
    expect(overlayStages[0]?.params).toHaveProperty('escapedSource', expectedEscaped);

    const escapedText = plan.stages.find(stage => stage.typeId === 'text')?.params.escapedText;
    const expectedText = 'Label:1\\2'.replace(/[:\\]/g, match => `\\${match}`);
    expect(escapedText).toBe(expectedText);

    expect(plan.preview).toMatchObject({ width: 640, height: 360, maxFps: 24 });
    expect(plan.stages.some(stage => stage.typeId === 'speed')).toBe(false);
    expect(plan.metadata.estimatedDurationMs).toBeNull();
  });

  it('handles chains without trim nodes and keeps durations intact', () => {
    const chain: MediaChain = {
      nodes: [
        {
          id: 'load',
          typeId: 'loadVideo',
          nodeVersion: '1.0.0',
          path: 'clip.mp4',
          durationMs: 5000,
          fps: 60
        },
        {
          id: 'crop-default',
          typeId: 'crop',
          nodeVersion: '1.0.0',
          width: 400,
          height: 300
        },
        {
          id: 'resize',
          typeId: 'resize',
          nodeVersion: '1.0.0',
          width: 1024,
          height: 576
        },
        { id: 'export', typeId: 'export', nodeVersion: '1.0.0' }
      ]
    };

    const plan = buildFFmpegPlan(chain);
    expect(plan.stages[0]).toMatchObject({ stage: 'input', args: [] });
    expect(plan.stages.some(stage => stage.typeId === 'trim')).toBe(false);
    expect(plan.metadata.estimatedDurationMs).toBe(5000);
    expect(plan.preview).toMatchObject({ width: 1024, height: 576, maxFps: 60 });
    const scaleFilter = plan.preview.filters.find(filter => filter.type === 'scale');
    expect(scaleFilter?.params).toMatchObject({ interpolation: 'bilinear' });
    const cropStage = plan.stages.find(stage => stage.typeId === 'crop');
    expect(cropStage?.params).toMatchObject({ x: 0, y: 0 });
  });

  it('falls back to default preview fps when metadata is missing', () => {
    const chain: MediaChain = {
      nodes: [
        { id: 'load', typeId: 'loadVideo', nodeVersion: '1.0.0', path: 'clip.mov' },
        { id: 'export', typeId: 'export', nodeVersion: '1.0.0' }
      ]
    };

    const plan = buildFFmpegPlan(chain);
    expect(plan.preview.maxFps).toBe(30);
    expect(plan.metadata.estimatedDurationMs).toBeNull();
  });

  it('builds strict trim stages when only start is provided', () => {
    const chain: MediaChain = {
      nodes: [
        {
          id: 'load',
          typeId: 'loadVideo',
          nodeVersion: '1.0.0',
          path: 'clip.mov',
          durationMs: 5000
        },
        {
          id: 'strict-start',
          typeId: 'trim',
          nodeVersion: '1.0.0',
          startMs: 400,
          strictCut: true
        },
        { id: 'export', typeId: 'export', nodeVersion: '1.0.0' }
      ]
    };

    const plan = buildFFmpegPlan(chain);
    const strictTrim = plan.stages.find(stage => stage.typeId === 'trim');
    expect(strictTrim?.nodeVersion).toBe('strict-start');
    expect(strictTrim?.params).toMatchObject({ startMs: 400, endMs: null });
    expect(plan.metadata.strictCut).toBe(true);
    expect(plan.metadata.estimatedDurationMs).toBe(4600);
  });

  it('prefers the latest trim node and constrains by end time', () => {
    const chain: MediaChain = {
      nodes: [
        {
          id: 'load',
          typeId: 'loadVideo',
          nodeVersion: '1.0.0',
          path: 'clip.mov',
          durationMs: 6000
        },
        {
          id: 'first-trim',
          typeId: 'trim',
          nodeVersion: '1.0.0',
          startMs: 1000,
          strictCut: true
        },
        {
          id: 'second-trim',
          typeId: 'trim',
          nodeVersion: '1.0.1',
          endMs: 2000
        },
        { id: 'export', typeId: 'export', nodeVersion: '1.0.0' }
      ]
    };

    const plan = buildFFmpegPlan(chain);
    const trimStage = plan.stages.find(stage => stage.typeId === 'trim');
    expect(trimStage?.nodeVersion).toBe('strict-range');
    expect(trimStage?.params).toMatchObject({ startMs: null, endMs: 2000 });
    expect(plan.metadata.estimatedDurationMs).toBe(2000);
  });

  it('accepts loadImage nodes when building plans', () => {
    const chain: MediaChain = {
      nodes: [
        { id: 'img', typeId: 'loadImage', nodeVersion: '1.0.0', path: 'still.png' },
        { id: 'export', typeId: 'export', nodeVersion: '1.0.0' }
      ]
    };

    const plan = buildFFmpegPlan(chain);
    expect(plan.stages[0]).toMatchObject({ stage: 'input', typeId: 'loadImage' });
  });

  it('maintains compatibility with legacy loadMedia nodes', () => {
    const chain: MediaChain = {
      nodes: [
        { id: 'legacy', typeId: 'loadMedia', nodeVersion: '1.0.0', path: 'legacy.mov' },
        { id: 'export', typeId: 'export', nodeVersion: '1.0.0' }
      ]
    };

    const plan = buildFFmpegPlan(chain);
    expect(plan.stages[0]).toMatchObject({ stage: 'input', typeId: 'loadMedia' });
  });
});
