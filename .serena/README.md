# NodeVision Editor _V2 - Serena Project

このプロジェクトは**Serena MCP**によってアクティブ化されています。

## プロジェクト概要

NodeVision Editor _V2は、Electron、TypeScript、FFmpegを使用した高度なビデオ編集アプリケーションです。

## プロジェクト構造

- **apps/desktop-electron/**: Electronデスクトップアプリケーション
  - `src/main.ts`: メインプロセス（Electron）
  - `src/renderer/app.ts`: レンダラープロセス（UI）
  - `src/ui-template.ts`: UIテンプレート生成

- **packages/**: 共有パッケージ
  - `@nodevision/editor`: エディターコア
  - `@nodevision/engine`: FFmpeg処理エンジン
  - `@nodevision/settings`: 設定管理
  - `@nodevision/system-check`: システムチェック
  - `@nodevision/tokens`: トークン管理

## 技術スタック

- **フロントエンド**: TypeScript, Electron
- **バックエンド**: Node.js, FFmpeg
- **パッケージマネージャー**: pnpm (monorepo)
- **ビルドツール**: TypeScript Compiler

## 主要な機能

1. ノードベースのビジュアルエディター
2. FFmpegによるビデオ処理
3. ジョブキュー管理
4. 診断ログエクスポート
5. ワークフロー管理

## 開発コマンド

```bash
# 開発サーバーを起動
pnpm dev

# ビルド
pnpm build

# テスト
pnpm test

# リント
pnpm lint
```

## Serena使用時のヒント

- プロジェクトのルートディレクトリ: `/Users/apple/Desktop/AI アプリ/NodeVision Editor _V2`
- 主要なソースコードは `apps/` と `packages/` ディレクトリにあります
- モノレポ構造のため、パッケージ間の依存関係に注意してください
