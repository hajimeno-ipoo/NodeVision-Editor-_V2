## 2025-11-13 Fセクション棚卸
- JobQueue は単一ワーカー & 直列実行のみで maxParallel / queue 長や 3分タイムアウト/QUEUE_FULL エラーが未実装。
- History は InMemoryHistoryStore(20件) だけでログレベルや inspect_concat リクエスト履歴は未定義。
- ログエクスポート/AES暗号化/クラッシュダンプ同意フロー/UIトーストは apps/desktop-electron に存在せず、設定スキーマにも診断項目不足。
- Renderer には Queue/History 可視化・Export Logs UI が無く、Electron main からも JobQueue/ログをブリッジしていない。