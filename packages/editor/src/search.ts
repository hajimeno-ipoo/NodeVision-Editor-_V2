import type { EditorNode, NodeTemplate, Vec2 } from './types';

const defaultId = (template: NodeTemplate, index: number): string => `${template.typeId}-${Date.now()}-${index}`;

const clonePorts = (ports?: NodeTemplate['inputs']): NonNullable<NodeTemplate['inputs']> =>
  ports?.map(port => ({ ...port })) ?? [];

const cloneSettings = (settings?: NodeTemplate['defaultSettings']) =>
  settings ? JSON.parse(JSON.stringify(settings)) : undefined;

export class NodeSearchIndex {
  constructor(private readonly templates: NodeTemplate[], private readonly idFactory: typeof defaultId = defaultId) {}

  search(query: string): NodeTemplate[] {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return this.templates;
    }

    return this.templates
      .filter(template => {
        const tokens = [template.title.toLowerCase(), ...template.keywords.map(keyword => keyword.toLowerCase())];
        return tokens.some(token => token.includes(normalized));
      })
      .slice(0, 10);
  }

  instantiate(template: NodeTemplate, position: Vec2, index = 0): EditorNode {
    return {
      id: this.idFactory(template, index),
      typeId: template.typeId,
      nodeVersion: template.nodeVersion,
      title: template.title,
      position,
      width: template.width ?? 220,
      height: template.height ?? 120,
      inputs: clonePorts(template.inputs),
      outputs: clonePorts(template.outputs),
      searchTokens: template.keywords,
      settings: cloneSettings(template.defaultSettings)
    };
  }
}

export class SearchSession {
  private activeIndex = 0;
  private lastResults: NodeTemplate[] = [];

  constructor(private readonly index: NodeSearchIndex) {}

  update(query: string): NodeTemplate[] {
    this.lastResults = this.index.search(query);
    this.activeIndex = 0;
    return this.lastResults;
  }

  move(delta: 1 | -1): { activeIndex: number; template: NodeTemplate | null } {
    if (this.lastResults.length === 0) {
      return { activeIndex: 0, template: null };
    }
    this.activeIndex = (this.activeIndex + delta + this.lastResults.length) % this.lastResults.length;
    return { activeIndex: this.activeIndex, template: this.lastResults[this.activeIndex] };
  }

  confirm(position: Vec2): EditorNode | null {
    const template = this.lastResults[this.activeIndex];
    if (!template) {
      return null;
    }
    return this.index.instantiate(template, position, this.activeIndex);
  }
}
