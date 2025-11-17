import type { RendererNode } from '../types';
import type { NodeRendererContext } from './types';

export interface InfoOptions {
  tipKey?: string;
  extraHtml?: string;
}

export const buildNodeInfoSection = (
  _node: RendererNode,
  _context: NodeRendererContext,
  _options: InfoOptions = {}
): string => '';
