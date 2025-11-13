import fs from 'node:fs/promises';
import path from 'node:path';

import {
  ensureTempRoot,
  enforceTempRoot,
  TempRootStatus
} from '@nodevision/system-check';

export interface TempRootManagerOptions {
  tempRoot: string;
  maxTotalBytes?: number;
  maxSingleJobBytes?: number;
}

interface TempRootManagerDependencies {
  enforce?: typeof enforceTempRoot;
  ensure?: typeof ensureTempRoot;
}

export class TempRootManager {
  private readonly activeJobs = new Map<string, string>();
  private readonly enforceFn: typeof enforceTempRoot;
  private readonly ensureFn: typeof ensureTempRoot;

  constructor(private readonly options: TempRootManagerOptions, deps: TempRootManagerDependencies = {}) {
    this.enforceFn = deps.enforce ?? enforceTempRoot;
    this.ensureFn = deps.ensure ?? ensureTempRoot;
  }

  async init(): Promise<void> {
    await this.ensureFn(this.options.tempRoot);
  }

  getJobPath(jobId: string): string {
    return path.join(this.options.tempRoot, jobId);
  }

  async reserve(jobId: string): Promise<string> {
    const jobPath = this.getJobPath(jobId);
    await fs.mkdir(jobPath, { recursive: true });
    this.activeJobs.set(jobId, jobPath);
    await this.enforceLimits();
    return jobPath;
  }

  async release(jobId: string): Promise<void> {
    this.activeJobs.delete(jobId);
    await this.enforceLimits();
  }

  async enforceLimits(): Promise<TempRootStatus> {
    return this.enforceFn(this.options.tempRoot, {
      maxTotalBytes: this.options.maxTotalBytes,
      maxSingleJobBytes: this.options.maxSingleJobBytes,
      protectedEntries: [...this.activeJobs.values()]
    });
  }

  listActiveJobs(): string[] {
    return [...this.activeJobs.keys()];
  }
}
