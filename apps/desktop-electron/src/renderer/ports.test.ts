import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';

import { syncPendingPortHighlight } from './ports';

const buildDom = () => {
  const dom = new JSDOM(`
    <div id="root">
      <button class="port port-output" data-node-id="n1" data-port-id="media" data-direction="output" aria-pressed="false"></button>
      <button class="port port-output" data-node-id="n2" data-port-id="media" data-direction="output" aria-pressed="false"></button>
      <button class="port port-input" data-node-id="n3" data-port-id="source" data-direction="input" aria-pressed="false"></button>
    </div>
  `);
  return { dom, root: dom.window.document.getElementById('root')! };
};

describe('syncPendingPortHighlight', () => {
  it('marks only the matching output port as pending', () => {
    const { root } = buildDom();
    syncPendingPortHighlight(root, { fromNodeId: 'n1', fromPortId: 'media' });

    const first = root.querySelector('[data-node-id="n1"]') as HTMLElement;
    const second = root.querySelector('[data-node-id="n2"]') as HTMLElement;
    const input = root.querySelector('[data-node-id="n3"]') as HTMLElement;

    expect(first.classList.contains('port-pending')).toBe(true);
    expect(first.getAttribute('aria-pressed')).toBe('true');
    expect(second.classList.contains('port-pending')).toBe(false);
    expect(second.getAttribute('aria-pressed')).toBe('false');
    expect(input.classList.contains('port-pending')).toBe(false);
    expect(input.getAttribute('aria-pressed')).toBe('false');
  });

  it('clears pending styles when pending state is null', () => {
    const { root } = buildDom();
    syncPendingPortHighlight(root, { fromNodeId: 'n1', fromPortId: 'media' });
    syncPendingPortHighlight(root, null);

    root.querySelectorAll<HTMLElement>('.port').forEach(button => {
      expect(button.classList.contains('port-pending')).toBe(false);
      expect(button.getAttribute('aria-pressed')).toBe('false');
    });
  });
});

