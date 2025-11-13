## 2025-11-13 editor-core 実装メモ
- packages/editor-core を新規作成し、ノードテンプレート/履歴Manager/スキーママイグレーション/オートセーブコントローラ/EditorState API を実装。
- D-01〜D-05に必要な 8pxグリッド・4pxスナップ・整列/ショートカット用複製・schemaVersion管理・Undo/Redo(100件)・読み取り専用フラグをEditorStateでカバー。
- Vitestで autosave/history/editor-state の単体テストを作成し、マイグレーション(1.0.5→1.0.7)、read-onlyブロック、スナップ/整列/コピー&ペースト挙動を検証予定。