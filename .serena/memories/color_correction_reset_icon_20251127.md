## 2025-11-27 カラーコレクション リセットアイコン差し替え
- 変更ファイル:
  - apps/desktop-electron/src/ui-template.ts: doc/icon/リセット.pngをデータURI化し、__NODEVISION_ICONS__ に reset を追加（14px表示スタイル付き）。
  - apps/desktop-electron/src/renderer/types.ts: __NODEVISION_ICONS__ 型に reset を追加。
  - apps/desktop-electron/src/renderer/nodes/color-correction.ts: リセットボタンをアイコン表示へ変更（__NODEVISION_ICONS__.reset利用、aria-label追加）。
- テスト: `pnpm --filter desktop-electron build` 成功。既知のVitest失敗は今回未実行。