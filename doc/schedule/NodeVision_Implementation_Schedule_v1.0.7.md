# NodeVision Edit 実装スケジュール v1.0.7
更新日: 2025-11-12
出典: Doc/NodeVision_Edit_要件定義書_v1.0.7.md

> 想定開始日を 2025-11-13（木）とし、6週間でMVPを仕上げるロードマップ。

## 前提・制約
- 並列実行はMVPで同時1ジョブ（セクション3）。P1ロードマップはスケジュール末尾で準備。
- HTTP/IPC は既定OFF・トークン必須（セクション4）。HTTP作業は`NV_HTTP=1`環境限定で検証。
- tempRoot合計1GB／ジョブ500MBでガード（セクション3）。各マイルストーンで容量テストを組み込む。
- a11y・i18n要件（セクション10）と受け入れ基準（セクション11）を Exit Criteria に織り込み。

## 全体タイムライン（W=週）
| W | 期間 | マイルストーン | 主要アウトプット | Exit Criteria |
|---|------|----------------|------------------|---------------|
| W1 | 11/13-11/19 | M0 Foundation | pnpm/Electron基盤、設定保存、ヘルスチェック、サンプルメディア | FFmpeg検出/HTTPトークン自動生成、tempRoot監視（E3001発火テスト） |
| W2 | 11/20-11/26 | Editor Core + Autosave | キャンバス/ノード配置、型付きポート、保存/読み込み、Undo/Redo/オートセーブ | AC-CAN-001, AC-CONN-001, AC-CONN-002, AC-ROUND-001, AC-UNDO-001 パス |
| W3 | 11/27-12/03 | Inspect + IPC/HTTP Security | engine.inspectConcat, HTTPエンドポイント、contract test、トークン/レート制限 | AC-HTTP-TOKEN-001/002, AC-HTTP-RATE-001, AC-INSPECT-001達成 |
| W4 | 12/04-12/10 | Media ノード群 + プレビュー | Trim/Resize/Overlay/Crop/Speed、色管理、プレビュー（bilinear/bicubic切替） | AC-TRIM-001〜AC-PREVIEW-001網羅、sRGB準拠計測 |
| W5 | 12/11-12/17 | Queue/History/Logging | 単一キューとキャンセルUX、履歴20件、ログエクスポートAES-256 | AC-CANCEL-001, AC-LOG-ROTATE-001, AC-LOG-EXPORT-001満たす |
| W6 | 12/18-12/24 | Polish + Release | LRU,設定UI磨き, Export Logs UI, a11y/i18n, ライセンス/署名手順 | WCAG 2.1 AAチェック5件以下、署名/公証チェックリスト完成 |

## マイルストーン詳細

### W1: M0 Foundation
- **タスク**
  - pnpm/Electronスケルトン整備、strict ESLint/Prettierを有効化。
  - `nvctl`トークンCLIの雛形作成と Keychain/DPAPI 連携。
  - FFmpeg/ffprobe検出、NV_HTTP_TOKEN生成、設定保存（tempRoot等）。
  - 自動生成テストメディア（720p/1080p 10s）とゴールデンメディア準備スクリプト。
- **テスト**: `pnpm test:unit` + 手動でFFmpeg/トークンE2E、tempRoot容量擬似超過でE3001確認。
- **リスク**: macOS notarization準備の先行コスト→W6に詳細化。

### W2: Editor Core + Autosave
- **タスク**
  - キャンバスパン/ズーム、検索からノード追加、8pxグリッド/4pxスナップ。
  - 型付きポートと接続チェック、整列ボタン、ショートカット登録。
  - ComfyUIスタイルのノードカードとドラッグ接続UI（SVGベジェ配線、接続リスト同期）。
  - JSON保存/読み込み＋`schemaVersion`管理、マイグレーション試行と読み取り専用モード。
  - Undo/Redo 100履歴、アイドル2s/実行時10sオートセーブ。
- **テスト**: schema migration contract、Autosave idleタイマー、a11yフォーカス循環 smoke。
- **リスク**: スナップ/整列実装のUX調整→Figmaハンドオフ必要。

### W3: Inspect + IPC/HTTP Security
- **タスク**
  - `engine.inspectConcat` IPC + HTTP `/api/inspect/concat` 実装、JSON 128KB上限。
  - トークン発行/rotate/revokeライフサイクル、15分猶予テスト。
  - 同時2本レートリミット、3本目429、1s timeout処理。
  - Contract test自動化とCI組み込み。
- **テスト**: CLIトークンrotate E2E、負荷試験で429確認、axeでHTTP設定画面a11y。
- **リスク**: レート制限＋キャンセル連携が複雑→Queue実装と連携ポイントを設計書化。

### W4: Media ノード群 + プレビュー
- **タスク**
  - FFmpeg builderパイプライン（Load→Trim→Resize→Save）最短経路最適化。
  - Overlay/Text/Crop/Speed/ChangeFPSノード、SAR正規化、VFR→CFR変換。
  - プレビュー：image2pipe JPEG、最新フレームのみ描画、sRGB/bilinear。
  - 進捗表示 `JobProgress.ratio` 補正ロジック。
- **テスト**: SAR/VFRゴールデン比較、プレビュー遅延測定、bicubic書き出し品質比較。
- **リスク**: 大型メディアで500MB閾値超過→tempRoot LRU調整必要。

### W5: Queue/History/Logging
- **タスク**
  - 単一キュー＋Cancel All優先度制御、`Cancelling`遷移2秒以内表示。
  - 履歴20件ローテーション、ログレベルinfo/warn/error/debug維持。
  - Export Logs UI & CLI、AES-256暗号化・パス管理、SHA256トースト表示。
  - ミニダンプ同意フロー（既定OFF）と連携。
- **テスト**: Queue満杯/自動キャンセル3分試験、ログzip復号テスト、トーストUI a11y。
- **リスク**: AES実装のクロスプラットフォーム差異→OpenSSLバイナリ依存を事前検証。

### W6: Polish + Release
- **タスク**
  - tempRoot LRU実装、500MB中間書き出しガード、CoolingDown表示。
  - 設定UI polishing（検証ボタン、既定プリセット）、Export Logs UXチューニング。
  - a11y/i18n KPI: axeスキャン違反≤5、`en-US/ja-JP` 翻訳フリーズ48h前レビュー。
  - FFmpegライセンス表記、署名/公証手順書、リリースノート和英対応。
- **テスト**: `pnpm test:a11y`, `pnpm test:e2e`, 署名/公証dry-run、NV_LOG_EXPORT_PASSWORD動作確認。
- **リスク**: 翻訳リソース不足→W2終盤でローカライズ外注をブッキング。

## バッファとP1準備
- 各週末に0.5日のバッファを設定し、未完タスクを翌週前半に吸収。
- P1並列化（maxParallelJobs=2／キュー4件）の設計メモをW5完了時に固める。
- P1向け追加言語（zh-CN）とクラッシュダンプ自動収集は別トラックで検討。

## 依存関係とコミュニケーション
- **開発 > QA ハンドオフ**: 各W末にQAへデモ＋テストケース同期。HTTP/セキュリティ部分はW3前にレビュー会。
- **ドキュメント**: v1.0.7ベースで実装ノートとACトレーサビリティをDoc/reports配下に追加。リリース時に評価レポートへ反映。
- **リスクレビュー**: 毎週火曜スタンドアップでリスクテーブルを更新し、E2Eブロッカーを即共有。
