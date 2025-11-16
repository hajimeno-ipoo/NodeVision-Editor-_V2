export interface PendingPortRef {
  fromNodeId: string;
  fromPortId: string;
}

/**
 * 同期的にポートの「接続待ち」UIを更新するヘルパー。
 * DOM を再構築せずに aria-pressed と .port-pending クラスを切り替える。
 */
export const syncPendingPortHighlight = (
  root: ParentNode | null,
  pending: PendingPortRef | null
): void => {
  if (!root) return;
  const buttons = root.querySelectorAll<HTMLElement>('.port[data-direction="output"]');
  buttons.forEach(button => {
    const nodeId = button.getAttribute('data-node-id');
    const portId = button.getAttribute('data-port-id');
    const isMatch = Boolean(pending && nodeId === pending.fromNodeId && portId === pending.fromPortId);
    button.classList.toggle('port-pending', isMatch);
    button.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
  });
};

