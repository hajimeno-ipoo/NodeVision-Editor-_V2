## 2025-12-06 LUTライブラリ: 登録時にアプリ保管へコピー
- 変更: LUT登録時に `nodevision.loadFileByPath` でファイルを読み、`storeMediaFile` でアプリの uploads ディレクトリへ保存。ライブラリエントリの `path` は保存先パスを保持、`originalPath` をオプションで保存。
- 削除: LUTリストのコンテキストメニュー（右クリック）から削除すると `deleteMediaFile` で保存先ファイルも削除し、ライブラリを更新。
- UI: 既存の右クリックメニュー仕様を流用し、コンテキストメニューを `lut-context-menu` で追加。
- 追加API: preload に deleteMediaFile を追加、main IPC に `nodevision:media:delete` を実装し、uploads 配下のみ安全に削除。
- 主な変更ファイル: renderer/app.ts, renderer/types.ts, renderer/dom.ts, renderer/state.ts, renderer/lut-library.ts, ui-template.ts, preload.ts, main.ts。
- テスト: 既存 `apps/desktop-electron/src/renderer/lut-library.test.ts` はパス (登録/削除ヘルパー)。