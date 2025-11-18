## Step1 UX要件整理 (2025-11-18)
- 対象ファイル: `apps/desktop-electron/src/renderer/{app.ts,nodes/trim.ts, nodes/trim-shared.ts}`, `apps/desktop-electron/src/ui-template.ts`, i18n。
- 現状: TrimノードUIは画像/動画ボタン＋ステータス表示のみ。`openTrimModal` で image は矩形モーダル (ドラッグ/リサイズ/Reset/Cancel/Save) まで実装済み、video は placeholder テキストのみ。
- 画像モーダルのdraftRegion更新→`scheduleTrimPreviewUpdate`連動を確認。Media Previewは `deriveTrimPreview` が image crop結果PNGを生成 (動画 startMs/endMs は未利用)。
- ユーザー要望: 各ボタンを押すと別ウィンドウ/モーダルで編集→ノードとMedia Previewへ即反映。動画は黒ボックス/スライダー撤去済みなので、モーダル内にタイムライン+Start/End入力+サムネストリップを配置する方針。
- リサーチ: Bynder等の動画トリムUIは2ハンドル+時間入力を併用し、Apple Motion/DaVinci もプレビューと同期。timeline設計はスクラブしやすい太めバー＋ショートカットが推奨。画像トリムは半透明オーバーレイ＋コーナーハンドル＋即時プレビューがベストプラクティス。
- 方針: 動画モーダルstateに draftStart/draftEnd/draftStrict/draftThumbs を追加、`renderTrimModalView` から専用DOM, timeline canvas, transport controlsを描画。`scheduleTrimPreviewUpdate` を動画でも呼び、Media Previewへ代表サムネイルと進行状況テキストを出す設計にする。
- テスト: 実装前ステップなので未実行 (N/A)。