# Cropper.js 初期化エラー修正履歴

## 概要
Electron レンダラープロセスで `new Cropper()` を実行した際に発生していた "Cannot call a class as a function" エラーの修正履歴です。

## 問題の原因
Electron の `contextIsolation` が有効な環境において、`preload.ts` で `contextBridge` を介して `Cropper` クラスをレンダラープロセスに公開していました。
これにより、レンダラープロセス側では `Cropper` がネイティブクラスではなく Proxy オブジェクトとして認識され、`new` 演算子によるインスタンス化（内部的な `instanceof` チェック）に失敗していました。

## 修正内容

### 1. `cropperjs` の直接注入 (`ui-template.ts`)
`nodeRequire` や `contextBridge` を経由せず、`cropperjs` のスクリプトとスタイルシートを生成される HTML に直接 `<script>` タグと `<style>` タグとして埋め込むように変更しました。
これにより、レンダラープロセスのグローバルスコープ（`window.Cropper`）にネイティブなクラスとして読み込まれます。

### 2. `preload.ts` の修正
`contextBridge` 経由での `Cropper` の公開を削除しました。これにより、グローバルスコープの `Cropper` が Proxy オブジェクトで上書きされることを防ぎました。

### 3. `app.ts` の修正
`resolveCropper` 関数を簡素化し、`window.Cropper` を直接参照するように変更しました。複雑なモジュール解決ロジックは不要となりました。

## 変更ファイル一覧
- `apps/desktop-electron/src/ui-template.ts`: スクリプトとスタイルの注入処理を追加
- `apps/desktop-electron/src/preload.ts`: `Cropper` の公開処理を削除
- `apps/desktop-electron/src/renderer/app.ts`: `resolveCropper` の簡素化
