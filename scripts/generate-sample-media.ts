import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

import { loadSettings } from '@nodevision/settings';
import { detectFFmpeg } from '@nodevision/system-check';

interface SampleSpec {
  name: string;
  width: number;
  height: number;
  duration: number;
}

const SAMPLES: SampleSpec[] = [
  { name: 'sample-720p.mp4', width: 1280, height: 720, duration: 10 },
  { name: 'sample-1080p.mp4', width: 1920, height: 1080, duration: 10 }
];

const runFfmpeg = (binary: string, args: string[]): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });
  });

async function main(): Promise<void> {
  const settings = await loadSettings();
  const detection = await detectFFmpeg({ ffmpegPath: settings.ffmpegPath ?? undefined });
  const ffmpegPath = detection.ffmpeg.path;
  const outputDir = path.resolve('scripts/sample-media');
  await fs.mkdir(outputDir, { recursive: true });

  for (const sample of SAMPLES) {
    const outputPath = path.join(outputDir, sample.name);
    console.log(`Generating ${sample.name} at ${outputPath}`);
    const args = [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `color=size=${sample.width}x${sample.height}:rate=30:color=0x1d3557`,
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=880:sample_rate=44100',
      '-t',
      String(sample.duration),
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      outputPath
    ];
    await runFfmpeg(ffmpegPath, args);
  }

  console.log('Sample media generation complete.');
}

main().catch(error => {
  console.error('Failed to generate sample media:', error);
  process.exit(1);
});
