## 2025-11-22 現状把握まとめ
- 目的: Electron版 NodeVision Editor MVP。ComfyUI風ノード編集でローカル画像/動画トリム等、AI推論やクラウド同期なし。FFmpegキュー1本・2s/10s autosave・NV_HTTP無効がデフォ。
- 技術: pnpmモノレポ、TS統一、Electron (apps/desktop-electron) + shared packages、Vitest/ts-node、スタイルは renderer の ui-template.ts。i18n en/ja。
- 直近の運用メモ: 11/22 Electron起動トライで E electron env var問題を解消（ELECTRON_RUN_AS_NODEを空にして dev起動、スクショはtmpに保存）。Trimモーダルを見るにはワークフロー＋メディア読込が必要。
- ユーザーデータ: 11/22に userData の workflows を `tmp/workflows-backup.json` へバックアップ済み。元は `~/Library/Application Support/Electron/nodevision-workflows.json`。消さないこと。
- インデックス: 11/22-23に Serena index を更新（97 TS files）。欠落 worktree 警告は既知でスキップ。シンボル検索高速化済み。
- 次にやるなら: 実アプリでワークフロー読み込み→トリム動作確認、または tests/ lint を走らせて環境健全性を確認。