## 2025-11-13 Editor UI 実装
- apps/desktop-electron に preload.ts を追加し、8pxグリッド/4pxスナップのキャンバス、検索→Enterでノード生成、Tabフォーカスサイクル、整列ボタン、ショートカット (Ctrl/Cmd+D/C/V, 1, Shift+1) を実装。
- EditorState + AutosaveController を利用してIdle=2s/Running=10sオートセーブ、Undo/Redo(100件)、読み取り専用バナー、schemaVersion表示、JSON保存/読み込み、ローカルストレージ自動復元を実装。
- Electron main から data URL で #app を描画し、preload でDOM構築。NV foundation情報は window.__NODEVISION_BOOT__ として渡し、UIステータスに表示。tsc build も通過。