# NodeVision Editor — Parallel Queue Plan v1.0.0
更新日: 2025-11-12
対象AC: B-05, AC-ENGINE-QUEUE-001, Doc §3

## 1. 現状サマリ (MVP)
- `@nodevision/engine` の `JobQueue` は `maxParallelJobs=1` 固定でジョブを直列実行し、完了後に `generatePreview` を待って次に進む。
- Cancel All は Running→Queued の優先度で AbortSignal を伝播し、履歴20件へ残す (B-04 対応済み)。
- `TempRootManager` が `@nodevision/system-check.enforceTempRoot` を active job ディレクトリ込みで呼び出し、1GB/LRU と 500MB/ジョブ ガードを担保 (B-03)。

## 2. P1要件 (B-05 / AC-ENGINE-QUEUE-001)
1. `maxParallelJobs=2` までスケールし、UIは常に `Queued → Running → CoolingDown/Failed/Completed` を同期表示。
2. 同時実行 >2 件目は自動的に待機キューへ積み、**待機上限4件**に達したら `QUEUE_FULL` エラーを返しトースト警告。
3. 待機 >3分で自動キャンセルし、`Cancelled (timeout)` を履歴に残す。
4. Cancel All は Running ジョブを開始順で `cancelling` にし、Queued をまとめて `canceled`。複数 Running が存在する場合も 2秒以内に各ジョブへステータス更新を送る。
5. tempRoot/リソース制約は並列度2でも維持 (500MB/ジョブ, 合計1GB)。

## 3. 提案アーキテクチャ
### 3.1 JobQueue 拡張
- `JobQueueOptions` に `maxParallelJobs` (default 1) と `maxQueueLength` (default Infinity) を追加。Worker slot 管理を行い、`this.current` を `Set<InternalJob>` 化。
- キュー長 > `maxQueueLength` なら `QUEUE_FULL` を throw し、呼び出し元 UI で警告。
- Cancel All: `current` set をコピーし、即 `status='cancelling'` + `AbortController.abort()`。Queued は既存同様にループでキャンセル。
- 自動キャンセル: `Queued` へ timestamp 付与し、`setInterval` (または `process.nextTick` バッチ) で 60s ごとにスキャン。3分超で `status='canceled'`, 履歴追記。

### 3.2 TempRootManager 連携
- `TempRootManager.reserve(jobId)` を `JobQueue` と結合し、ジョブ開始時に workspace を確保。`protectedEntries` へ active job ディレクトリを渡しながら `enforceTempRoot`。
- 並列実行時でも active job ごとに 500MB を越えた瞬間 `ResourceLimitError` が該当ジョブへ伝播し、他ジョブへは影響しないよう JobQueue が個別 failure を扱う。

### 3.3 UI/IPC 影響
- IPC/API (`engine.inspect/concat` 後に投入される `RunJob` コール) は `QUEUE_FULL` を 200 + body `{ code: 'QUEUE_FULL' }` で返し、UI はモーダル/トーストに同メッセージとリトライ誘導を表示。
- Queueコンポーネントは Running 列を最大2件までレイアウト（既存 ComfyUI 風リストの1列→2列化）。
- Cancel All フィードバック: Running 各行を `Cancelling…` バッジへ更新し、Queued 行は `Canceled` ラベルに即時更新。

## 4. 実装ステップ提議
1. `JobQueue` リファクタ：`current`→`activeJobs` set, workerハンドラを非同期ループ化。ユニットテストで並列2件・QueueFull・3分タイムアウトを再現。
2. `TempRootManager` を JobQueue 組み込み (constructor依存注入) し、E3001時は該当ジョブのみ `failed` へ遷移。
3. Electron IPCブリッジに `QueueState` ブロードキャストを追加し、Rendererがステータス描画を更新可能にする。
4. UI側: Queueカード2列/待機上限4件UI/CancelAllメッセージング。
5. E2E: 5本連続投入で `Queued`→`QUEUE_FULL`→3分タイムアウトを確認。ResourceExceeded を並列時に意図的に引き起こし、他ジョブ継続を検証。

## 5. テスト / 証跡指針
- ユニット: JobQueue (並列/QueueFull/Timeout)、TempRootManager (protectedEntries)、system-check (既存) をカバレッジ100%で維持。
- Integration: Electron main 側で `NV_ENGINE_DEBUG=1` 時に Queue 状態ログを吐き、テストスクリプトで assert。
- Perf/A11y: 並列化による CPU スパイクを `ConsoleProfile` でログ化。UI変更は axe レポート更新。

## 6. リスクとフォローアップ
- tempRoot LRU が頻繁に走ると I/O 負荷が上がるため、JobQueue 側で `TempRootManager.reserve` をジョブ開始直前に限定。必要に応じて prune結果を Telemetry へ記録。
- 3分タイムアウトの UX → 設定画面に「Queue Auto-cancel minutes」を future flag として隠し項目で準備。
- P1 後の `maxParallelJobs` 拡張 (>=3) を見据え、Worker pool を柔軟に保つ。

> 本メモは B-05 の「P1ロードマップ設計ノート」として `doc/design` に格納し、今後のACトレーサビリティの参照元とする。
