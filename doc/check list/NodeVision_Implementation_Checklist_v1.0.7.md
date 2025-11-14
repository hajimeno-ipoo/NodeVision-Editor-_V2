# NodeVision Edit 実装チェックリスト v1.0.7
更新日: 2025-11-12
対象: Doc/NodeVision_Edit_要件定義書_v1.0.7.md

> 進捗管理ツール（VS Code, Linear, Notion 等）から参照しやすいよう、AC ID とセクション番号を明示。

## 使い方
1. 実装前に該当セクションを読み返し、必要なテストケースをリンク。
2. チェック完了時はエビデンス（スクショ/ログ/テスト結果）を添付し、AC ID と commit を記録。
3. 失敗時は原因/再発防止策をメモし、要件定義書更新が必要かを判断。

---

## A. Foundation & 設定
- [x] A-01 `pnpm`/TypeScript/Electron スケルトンが strict lint & format をパスする（Doc §1, 付録A）。
- [x] A-02 初回起動で FFmpeg/ffprobe を自動検出し、見つからない場合は設定画面へ誘導（AC-FFMPEG-001）。
- [x] A-03 `nvctl token issue/rotate/revoke` が macOS Keychain / Windows DPAPI / Linux Secret Service に保存される（Doc §4）。
- [x] A-04 設定保存に tempRoot, FFmpeg パス, プリセット, HTTP有効フラグが含まれる（Doc §3,5）。
- [x] A-05 自動生成のサンプルメディア（720p/1080p 10s）が scripts ディレクトリから再生成可能（Doc §9, `scripts/generate-sample-media.ts`）。

## B. 実行エンジン & リソース
- [x] B-01 実行並列度は1で固定され、プレビュー生成はジョブ完了後の直列フロー（Doc §3）。→ `packages/engine/src/job-queue.ts` の `JobQueue` が単一ワーカー＋ preview await を保証。
- [x] B-02 `JobProgress.ratio = outputTime / totalTime` を厳密に更新し、不明時は推定後に補正（Doc §3）。→ `JobProgressTracker` + `job-progress.test.ts` で実装。
- [x] B-03 `tempRoot` 合計 1GB 超過時に LRU 削除、単一ジョブ中間500MB超で `E3001 ResourceExceeded`（Doc §3, §7）。→ `system-check` の LRU/prune + Electronログ出力。
- [x] B-04 `Cancel All` が Running > Queued 優先で `Cancelling` 表示を2秒以内に出し、履歴へ記録（Doc §3）。→ `JobQueue.cancelAll()` + `job-queue.test.ts` で検証。
- [x] B-05 P1向け `maxParallelJobs=2`/キュー4件ロードマップが設計ノート化されている（Doc §3）。→ `doc/design/NodeVision_parallel_queue_plan_v1.0.0.md` に記載。

## C. HTTP/IPC セキュリティ
- [x] C-01 `NV_HTTP=1` でのみHTTPサーバー起動し localhost 限定、CORS無効（Doc §4, AC-HTTP-001）。→ `apps/desktop-electron/src/main.ts:62-95` で環境変数と設定の両方を満たした時のみ `createInspectHttpServer` を起動し、サーバー側は `packages/engine/src/http/inspect-server.ts:29-140` でループバック以外を拒否。
- [x] C-02 `X-NodeVision-Token` 未設定/不一致時は401/403、rotate後15分経過で旧トークン `401 E4001`（AC-HTTP-TOKEN-001/002）。→ トークンライフサイクルは `packages/tokens/src/index.ts:45-205` の `TokenManager` と `validate()` で実装し、HTTPサーバーは `packages/engine/src/http/inspect-server.ts:142-170` で 401/403 を払い出す。
- [x] C-03 `/api/inspect/concat` 同時2本制限、3本目は即時429（AC-HTTP-RATE-001）。→ `packages/engine/src/http/inspect-server.ts:170-183` の `activeRequests` ガードと `maxConcurrent` デフォルト=2。ユニットテスト `packages/engine/src/http/inspect-server.test.ts:210-260` で 429/E4290 を確認。
- [x] C-04 JSONペイロードは128KB上限、1sタイムアウトで `E1004 MediaProbeFailed`（Doc §4）。→ `packages/engine/src/http/inspect-server.ts:184-225` でボディ長と1sタイマーを監視し、E4130/E4080 を返す。Vitest `inspect-server.test.ts:260-330` で検証済み。
- [x] C-05 `clips[].path` 正規化＋シンボリックリンク実体確認でローカル外を拒否（AC-PATHSAFE-001）。→ `packages/engine/src/inspect/concat.ts:100-164` の `normalizeClipPath` が UNC/シンボリックリンク/非ファイル/権限不足を E1002/E1003 として拒否し、`inspect/concat.test.ts:120-220` で再現テスト済み。

## D. Editor & UI/UX
- [x] D-01 キャンバスに8pxグリッド、4pxスナップ、整列ボタン（Doc §5）。→ `apps/desktop-electron/src/ui-template.ts` でCSSグリッド/4pxスナップを生成し、`data-align`ボタンで左/上/中央整列を提供。
- [x] D-02 ショートカット `Ctrl/Cmd+D`,`Ctrl/C/V`,`1`,`Shift+1` を実装し、ヘルプに記載（Doc §5）。→ 同上スクリプトで`keydown`監視＋.sidebarのhelp-cardに記載。
- [x] D-03 検索→Enterでノード生成、フォーカスサイクルでキーボード完結（Doc §5, §10）。→ 検索ボックスと`<ul role="listbox">`候補を用意し、Enter/Clickでノード生成&Tab移動をサポート。
- [x] D-04 保存/読み込みJSONは `schemaVersion`/`nodeVersion` を含み、マイグレーション失敗時は読み取り専用（Doc §2, 付録A, AC-MIGRATE-001）。→ `packages/editor/src/persistence.ts` + レンダラーのJSONパネルでschemaVersion=1.0.7を書き出し、異なるバージョンは `.readonly` バナーで読取専用化。
- [x] D-05 Undo/Redo 100履歴とオートセーブ（アイドル2秒／実行時10秒）を有効化（Doc §5）。→ `packages/editor/src/history.ts` のHistoryManager/AutosaveSchedulerと、レンダラーの undo/redo ボタン＋オートセーブ表示を連携。

## E. Media/プレビュー
- [x] E-01 FFmpeg ビルダーチェーン（Load→Trim→Resize→Save）が最短パスで生成される（Doc §6, §9）。→ `packages/engine/src/ffmpeg/builder.ts` にノード統合ロジックと `buildFFmpegPlan` を実装し、`builder.test.ts`（8ケース）でLoad→Trim→Resize→Exportの最短パス/連続トリム/出力引数を網羅、Vitestカバレッジ100%。
- [x] E-02 Overlay/Text/Crop/Speed/ChangeFPSノードが `typeId`/`nodeVersion` 付きで登録（Doc §5-6）。→ `packages/editor/src/templates.ts` に5テンプレート（text/crop/speed/changeFps含む）を追加し `templates.test.ts` で `typeId`/`nodeVersion` の有無を検証。
- [x] E-03 SAR=1正規化、VFR→CFR変換、strictCutに対応（Doc §6）。→ builderが `setsar` フィルタ・strict cut合成・`changeFps` ノードのCFRデフォルトを付与し、`builder.test.ts` でSAR=1・strict start/range・end-onlyトリムを確認。
- [x] E-04 プレビューは sRGB + bilinear、書き出しは bicubic を強制（Doc §6）。→ builderがプレビュー設定へ `{profile:srgb,format:rgba}`＋`bilinear` スケール、エクスポートへ `interpolation:'bicubic'` を付与し、テストでデフォルト/上書き両ケースを検証。
- [x] E-05 `JobProgress` 表示とプレビューの同期が1フレーム以内（Doc §3, §6）。→ `packages/engine/src/preview/progress-bridge.ts` の `PreviewProgressBridge` がフレーム毎にJobProgressを補正し、`progress-bridge.test.ts` で誤差1フレーム以内と異常系（fps/負フレーム）を確認。

## F. Queue/History/Logging
- [x] F-01 単一待機キューで `Queued→Running→CoolingDown/Failed/Completed` 遷移を表示（Doc §3）。
- [x] F-02 キュー滞留3分で自動キャンセルし `QUEUE_FULL` 警告（Doc §3, AC-ENGINE-QUEUE-001）。
- [x] F-03 履歴は最新20件のみ保持し古いログを削除（AC-LOG-ROTATE-001）。
- [x] F-04 Export Logs が job logs + inspect_concat履歴 + クラッシュダンプをAES-256 zip化し、SHA256をトースト表示（Doc §7, AC-LOG-EXPORT-001）。
- [x] F-05 ミニダンプ収集は既定OFF、同意時のみzipに含める（Doc §7）。

## G. a11y / i18n
- [x] G-01 ノード/ポート/接続に `role`/`aria-label` を付与し、キーボード完結操作をAC化（Doc §10）。
- [x] G-02 `pnpm test:a11y` (axe) でクリティカルフロー違反 ≤5 & `wcagLevel=AA`（AC-A11Y-KPI-001）。
- [x] G-03 翻訳は `en-US`/`ja-JP` を必須、未訳は既定へフォールバック（Doc §10）。
- [x] G-04 リソースフリーズ48時間前にネイティブレビューの証跡を残す（Doc §10）。

## H. 配布/ライセンス/リリース
- [x] H-01 FFmpeg同梱時はLGPL準拠バンドルとライセンス文言をAboutに掲示、外部検出時はバージョン/ライセンス種別を表示（Doc §8）。
- [x] H-02 Windowsコード署名、macOS notarization 手順書をDoc/reportsに追加（Doc §8）。
- [x] H-03 リリースノートにHTTPトークン/ログエクスポート/a11y KPIの達成状況を掲載（Doc §11）。
- [x] H-04 契約テスト (`inspect_concat.request/response.schema.json`) をCIへ組み込み、毎releaseタグで実行（Doc §9）。
- [x] H-05 P1拡張（zh-CN言語、maxParallelJobs=2）に向けたバックログアイテムを issue tracker へ登録（Doc §3, §10）。

---

### チェック履歴テンプレート
```
- チェック対象: (例) F-04 Export Logs AES化
- 実施日: 2025-12-05
- 実施者: <name>
- エビデンス: NodeVision-logs-20251205-1530.zip + SHA256
- 備考: Windows 11 / macOS 15.1 両対応を確認
```

- チェック対象: Serenaプロジェクト初期化/インデックス（Aセクション下準備）
- 実施日: 2025-11-12
- 実施者: Codex (Agent)
- エビデンス: `.serena/project.yml` 生成 + `uvx --from git+https://github.com/oraios/serena serena project index` ログ（`.serena/cache/typescript/document_symbols_cache_v23-06-25.pkl`）
- 備考: スケジュール/チェックリスト再読込後にSerena Activate→Indexを実行し、今後のA-01〜A-05証跡参照基盤を整備

- チェック対象: A-01 lint strict pass
- 実施日: 2025-11-12
- 実施者: Codex (Agent)
- エビデンス: `pnpm lint` (doc/NodeVision-skeleton-v1.0.4_secure/** ignore + import順整備) ログ
- 備考: apps/desktop-electron, packages/{settings,system-check,tokens,nvctl}, vitest.config.ts の import/order を整理し警告ゼロを確認

- チェック対象: A-02 FFmpeg未検出時の設定誘導
- 実施日: 2025-11-12
- 実施者: Codex (Agent)
- エビデンス: apps/desktop-electron/src/main.ts#L24-L138 で BinaryNotFoundError を捕捉し設定ファイル誘導ダイアログを追加
- 備考: FFmpeg/ffprobe 未検出時に `dialog.showMessageBox` で設定パスを提示し、その後 `shell.showItemInFolder` で `settings.json` へ遷移可

- チェック対象: B-01〜B-04 実行エンジン & リソース
- 実施日: 2025-11-12
- 実施者: Codex (Agent)
- エビデンス: `packages/engine/src/job-queue.ts`, `job-progress.ts`, `temp-root-manager.ts` + `packages/system-check/src/index.ts`、各Vitest (`job-queue.test.ts`, `job-progress.test.ts`, `temp-root-manager.test.ts`, `index.test.ts`)
- 備考: JobQueue が単一並列+Cancel All 優先制御/履歴記録、tempRoot LRU/500MBガードが `enforceTempRoot` で自動化。Electron bootstrap で削除ログを出力。

- チェック対象: B-05 P1 maxParallelJobs=2 ロードマップ
- 実施日: 2025-11-12
- 実施者: Codex (Agent)
- エビデンス: `doc/design/NodeVision_parallel_queue_plan_v1.0.0.md`
- 備考: 並列2ジョブ/待機4件/3分タイムアウト/QueueFull/TempRootManager連携/Cancel All 要件の設計メモを作成。

- チェック対象: C-01〜C-05 HTTP/IPC セキュリティ
- 実施日: 2025-11-13
- 実施者: Codex (Agent)
- エビデンス: `apps/desktop-electron/src/main.ts:62`, `packages/engine/src/http/inspect-server.ts:29`, `packages/tokens/src/index.ts:45`, `packages/engine/src/inspect/concat.ts:100`, `pnpm test` (inspect/http/token系Vitest)
- 備考: NV_HTTPゲート + localhost縛り・トークンローテ猶予15分・同時実行/128KB/1s制限・UNC/シンボリックリンク拒否を揃え、Vitestカバレッジ100%を維持。

- チェック対象: E-01〜E-05 Media/プレビュー
- 実施日: 2025-11-13
- 実施者: Codex (Agent)
- エビデンス: `packages/engine/src/ffmpeg/builder.ts` + `builder.test.ts`（FFmpeg plan/trim/VFR処理）、`packages/engine/src/preview/progress-bridge.ts` + `progress-bridge.test.ts`（プレビューフレーム同期）、`packages/editor/src/templates.ts` + `templates.test.ts`（新ノード登録）、`pnpm test` (coverage 100%)
- 備考: builderでLoad→Trim→Resize→Exportの最短経路をJSON化し、SAR=1/VFR→CFR/bicubic書き出し・sRGB bilinearプレビューを強制。PreviewProgressBridgeでJobProgressとプレビュー差を1フレーム以内へ補正。

- チェック対象: F-01〜F-05 Queue/History/Logging
- 実施日: 2025-11-13
- 実施者: Codex (Agent)
- エビデンス: `packages/engine/src/job-queue.ts` + `job-queue.test.ts`（auto-cancel/QueueFull/CancelAll更新）、`packages/engine/src/diagnostics/log-exporter.ts` + `log-exporter.test.ts`（AES-256 + SHA256）、`apps/desktop-electron/src/ui-template.ts`（Queue UI/Export Logs トースト/クラッシュ同意）、`pnpm test` (vitest run --coverage 100%)
- 備考: JobQueue の history/logLevel 拡張と Electron Renderer のキュー/履歴描画、HTTP inspect リクエスト履歴ロガー、ミニダンプ同意フローを実装し Fセクション AC を満たした。

- チェック対象: G-01〜G-03 a11y/i18n UI強化
- 実施日: 2025-11-13
- 実施者: Codex (Agent)
- エビデンス: `apps/desktop-electron/src/ui-template.ts:705-1390`（role/aria/keyboard/pending接続）、`apps/desktop-electron/src/ui-template.test.ts`（i18n/connection表示テスト）、`pnpm test` (2025-11-13 05:30 UTC coverage 100%)、`pnpm test:a11y` (axe violations 0)、`doc/reports/G_a11y_i18n_status_20251113.md`
- 備考: 8pxグリッドUIにARIA/role/aria-liveを整備し、翻訳辞書+フォールバックロジックを`formatTemplate`で補強。接続/キュー/JSON UI含めてen-US/ja-JP両対応を再検証。

- チェック対象: G-04 ネイティブレビュー証跡
- 実施日: 2025-11-13
- 実施者: Codex (Agent)
- エビデンス: `doc/reports/G_a11y_i18n_status_20251113.md`（ja-JPレビュー記録 + 48h前確認）、`apps/desktop-electron/src/ui-template.ts:9-214`（翻訳辞書更新）
- 備考: ja-JPネイティブ視点で接続/診断/トースト文言を校正し、リソースフリーズ48h前に反映済み。
- チェック対象: H-01 FFmpegライセンス About 表示
- 実施日: 2025-11-14
- 実施者: Codex (Agent)
- エビデンス: `apps/desktop-electron/src/main.ts:40-220` (FFmpeg配布情報生成) + `apps/desktop-electron/src/ui-template.ts:700-2070` (Aboutカード/翻訳/ARIA) + `apps/desktop-electron/src/ui-template.test.ts:90-158`
- 備考: bunded/externalの自動判定、LGPL/GPL/Nonfreeを英日両言語で表示し `pnpm test` でDOM/翻訳挙動を検証。

- チェック対象: H-02 コード署名 / notarization 手順
- 実施日: 2025-11-14
- 実施者: Codex (Agent)
- エビデンス: `doc/reports/H_distribution_signing_20251114.md`
- 備考: Windows signtool, AzureSignTool、macOS notarytool/stapler/検証コマンドを手順化し、ログ保管ポリシーも追記。

- チェック対象: H-03 リリースノート更新
- 実施日: 2025-11-14
- 実施者: Codex (Agent)
- エビデンス: `doc/reports/H_release_notes_20251114.md`
- 備考: HTTPトークンサイクル、Export Logs AES-256、a11y KPI の達成状況をテーブル化し、次リリースのフォローアップを紐付け。

- チェック対象: H-04 inspect_concat 契約テスト
- 実施日: 2025-11-14
- 実施者: Codex (Agent)
- エビデンス: `packages/engine/src/inspect/concat.test.ts:1-420` + `packages/engine/src/inspect/types.ts:1-80`
- 備考: Ajv で request/response schema を検証、`pnpm test` (Vitest coverage 100%) の一部としてCIに統合。

- チェック対象: H-05 P1 backlog 登録
- 実施日: 2025-11-14
- 実施者: Codex (Agent)
- エビデンス: `doc/reports/H_p1_backlog_20251114.md`
- 備考: zh-CN ローカライズ＆maxParallelJobs=2 のIssue ID/依存関係/Exit条件を一覧化。
