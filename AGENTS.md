# AGENTS.md — NodeVision Editor _V2 Field Guide

> このリポのナレッジと儀式をひとまとめにしたハンドブック。新しいタスクに入る前に必ずここを確認してね。mcpを必ず使用し自己能力だけで実装を進めない事を約束する

## TL;DR
- ComfyUI風ノードUIでローカル画像/動画編集MVPを仕上げる（モデル/クラウド/音声は範囲外）。
- すべての実装前に **doc/schedule/NodeVision_Implementation_Schedule_v1.0.7.md** と **doc/check list/NodeVision_Implementation_Checklist_v1.0.7.md** を読み直し、該当マイルストーン/ACを紐付ける。
- Serenaワークフロー: プラン → 実装 → 単体テスト → 修正を1ループとし、進捗はチェックリストとSerenaメモの両方に反映。

## ゴール / 非ゴール
- **ゴール**
  - ノードエディタ（キャンバス、8pxグリッド、Undo/Redo、Autosave）とFFmpeg実行エンジンをElectronデスクトップで提供。
  - `inspect/concat` IPC/APIやトークン制御などDoc v1.0.7のACを満たし、W6までに署名/公証・a11y KPIをクリア。
- **非ゴール**
  - Stable Diffusion / LoRA やクラウド連携、P1範囲（maxParallelJobs=2/zh-CN）までは今回のMVPでは **実装しない**。

## 参照ドキュメント（Source of Truth）
| 種別 | パス/概要 |
| --- | --- |
| 要件定義 | `doc/NodeVision_Edit_要件定義書_v1.0.7.md` — 目的、リソース制限、HTTP/セキュリティ、受け入れ基準 |
| スケジュール | `doc/schedule/NodeVision_Implementation_Schedule_v1.0.7.md` — W1〜W6のExit Criteria |
| チェックリスト | `doc/check list/NodeVision_Implementation_Checklist_v1.0.7.md` — A〜HのAC/証跡テンプレ |
| API | `doc/inspect_concat_API_v1/*` — `InspectConcatRequest/Response` schema & エラーコード |
| スキーマ | `doc/NodeVision-skeleton-v1.0.4_secure/NodeGraph.schema.json` — プロジェクト保存構造 |
| ワークフロー | `doc/workflow/*.svg` — ジョブ状態遷移、Inspect/Runシーケンス、ユーザーアクティビティ |

## ディレクトリ速見
- `apps/desktop-electron`: Electronメインプロセス（`pnpm --filter desktop-electron dev` で起動、`start`は本番ビルド→electron）。
- `packages/nvctl`: CLIトークン&設定ツール。Keychain/DPAPI/Secret Service連携コードはここで管理。
- `packages/settings`, `packages/system-check`, `packages/tokens`: 設定UI/ヘルスチェック/トークンストレージ関連。HTTP・FFmpeg検出ロジックはここを触る。
- `doc/`: 要件と図面。更新時はバージョン/日付を必ず上げて履歴に追記。

## ワークフロー & 儀式
1. **Context7チェック**: コーディング前に `/oraios/serena` ドキュメントを取得し最新手順を確認する。（rulesに従う）
2. **ドキュメント確認**: 必ずスケジュール＆チェックリストを読み、対象AC(ID)をメモ。必要ならDocへ追記。
3. **Serenaプランニング**: update_planでタスク分割（>=3ステップ）。
4. **実装**: 変更はASCIIベース。`apps`/`packages`配下はTypeScript strict。ElectronメインはCommonJS。
5. **単体テスト**: `pnpm test`（Vitest/coverage）。UIロジックは`pnpm test:watch`で回しつつ必要に応じ`pnpm lint`。
6. **チェックリスト更新**: 対応したA〜H項目に証跡（ログ/スクショ/commit）を残し、Serenaメモも書く。
7. **レビュー mindset**: コードレビューではリスク/リグレッションを優先。Conventional Commits（例: `feat:`, `fix:`, `chore:`）。

## コマンドチートシート
| 目的 | コマンド |
| --- | --- |
| 依存関係 | `pnpm install` |
| Lint | `pnpm lint` |
| フォーマット | `pnpm format` |
| 単体テスト | `pnpm test`（CIはcoverage前提） |
| Electron Dev | `pnpm --filter desktop-electron dev` |
| Electron Prod Run | `pnpm start:desktop` |
| Serenaインデックス | `uvx --from git+https://github.com/oraios/serena serena project index` |

## ドメイン制約（実装時の必須チェック）
- **リソース**: `tempRoot` 合計1GBでLRU、単一ジョブ中間500MBで `E3001 ResourceExceeded`。progressは `outputTime/totalTime`。
- **HTTP/IPC**: 既定OFF。検証は `NV_HTTP=1` + `NV_HTTP_TOKEN` 必須。`X-NodeVision-Token` 未設定/不一致→401/403、rotate後15分で旧トークン失効。
- **Rate Limit**: `/api/inspect/concat` 同時2本、3本目は即429。JSON 128KB上限、FFmpeg probe ≤1sで `E1004` 管理。
- **パス安全性**: `clips[].path` は正規化＆実体がローカルドライブのみ。シンボリックリンク/UNCは拒否（AC-PATHSAFE-001）。
- **UI/UX**: 8pxグリッド/4pxスナップ、ショートカット（Cmd/Ctrl D,C,V,1,Shift+1）、Autosave(2s idle/10s実行中)。
- **プレビュー/色**: プレビューsRGB+bilinear、書き出しbicubic固定。SAR=1正規化、VFR→CFR。
- **Queue/Logging**: `Queued→Running→CoolingDown/Failed/Completed`。滞留3分で自動キャンセル。ジョブログは20件ローテ、Export LogsはAES-256+SHAトースト。
- **a11y/i18n**: ノード/ポート/接続にrole/aria-label、`pnpm test:a11y`でaxe違反≤5＆`wcagLevel=AA`。言語はen-US/ja-JP必須、未訳は既定フォールバック。
- **配布**: FFmpeg LGPL準拠構成、About表示。Windowsコード署名、macOS notarizationドキュメントをDoc/reportsへ。

## テスト & 品質保証
- `pnpm test` でVitest + coverage。`pnpm lint` をCI前に実行。
- `inspect_concat` contract: `doc/inspect_concat_API_v1/inspect_concat.request/response.schema.json` を使ったJSON schemaテストをCIへ組込み。
- ローカルでHTTP/IPC挙動を確かめる時は `NV_HTTP=1 NV_HTTP_TOKEN=... pnpm start:desktop`。429/401/timeoutシナリオを再現。
- Export Logs機能はAES-256暗号化zip & SHA256トーストをE2Eで確認し、証跡Zip＋ハッシュをチェックリストテンプレに記載。

## コミュニケーション & 作法
- ユーザーへの返答は **日本語のギャル口調**。でも内容は正確に。
- 変更要約時はファイルパス+行番号を明示。質問があれば早めに確認。
- 外部参照や新情報が必要な場合は `web.run` で最新ソースを取り、出典を添える。

## Serena / Context7 連携
- プロジェクトは既にSerena登録済み（`.serena/project.yml`）。必要に応じて `serena project index` を再実行。
- 新しい知見や意思決定は `.serena/memories/*.md` へ追記して共有。命名は `topic_YYYYMMDD.md` を推奨。

## 定義された完了条件
- 対象ACがチェックリストで`[x]`になり、証跡（テスト結果/Zip/スクショ/ログリンク）が残っている。
- 関連ドキュメント（要件書/スケジュール/図面）が更新済みで、変更履歴を追記。
- `pnpm test` と必要なlint/a11y/contractテストがグリーン。
- Serenaメモリに作業ログを残し、必要なら進捗メモを新規作成。

Happy hacking ✨
