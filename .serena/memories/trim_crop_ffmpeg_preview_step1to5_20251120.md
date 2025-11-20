実施: 動画/画像クロップ保存時にFFmpegで実ファイルを生成し、メディアプレビューノードへ反映。
- main.ts: 新IPC `nodevision:preview:crop` 追加。ffmpegでcropフィルタ（zoom/flip/rotateも前段で適用）を掛け、画像はPNG1枚、動画はmp4(h264, faststart)をtempRoot/cropped-previewsへ出力。
- preload/renderer types: NodevisionApi.generateCroppedPreview追加。NodeMediaPreviewにfilePathとcropメタを保持。
- load.ts: Fileからfile.pathをfilePathに保存。
- app.ts: トリム保存を非同期化。filePathがある場合IPCでクロップ済み実ファイルを生成し、mediaPreviewsに差し替え（kind/videoの場合も実動画URL）。fallbackは従来のプレビュースケジュール。
- media-preview.ts: 受け取ったcropメタでCSSトランスフォームを適用するロジックを残しつつ、video/imgに直接styleを付与。フレーム容器にis-croppedクラス。
- 不要になったcanvas変換ヘルパを削除。
- Tests: `pnpm test` 全236テスト成功、カバレッジ100%。
ビルド: `pnpm --filter desktop-electron build` 成功。
注意: sourcePathが無い場合はIPC呼ばずCSS fallback。