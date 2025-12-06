## 2025-12-06 LUTライブラリ パネル追加
- 追加: サイドバーにLUTライブラリ用パネル（panel-luts）とアイコンを追加し、LUT名とファイルを登録/削除できるようにした。
- 永続化: localStorageキー `nodevision.lut.library.v1` で {id,name,path,filename,addedAt} を保存。初期化時に読み込み。
- UI: `lut-name-input`, `lut-choose-file`, `lut-list` など新DOMをcaptureDomElementsに追加。i18nキー `lut.panel.*` とトースト `toast.lut*` を追加。
- ロジック: `renderer/lut-library.ts` にロード/セーブ/削除ヘルパーを新設し、app.tsのsetupLutLibraryPanelで利用。
- テスト: `apps/desktop-electron/src/renderer/lut-library.test.ts` を追加し、Vitestでヘルパーの読み書きと削除を検証済み (`pnpm vitest run apps/desktop-electron/src/renderer/lut-library.test.ts`).