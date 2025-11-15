## 2025-11-16 Load node split
- 既存のLoad Mediaノードを画像専用(`loadImage`)と動画専用(`loadVideo`)に分割。旧`loadMedia`は互換のため内部的に画像扱い。テンプレート／i18n／検索インデックスを更新し、ノード検索候補に両方表示されるようにした。
- レンダラではロード系ノードをまとめて扱うヘルパーを追加し、ファイル入力のaccept属性や許可種別をノードタイプごとに切り替え。画像ノードに動画を指定した場合などはトースト警告を表示し既存プレビューを保持する。
- FFmpegビルダーは`loadImage`/`loadVideo`/`loadMedia`をサポートするよう型とロジックを更新し、テストも追加して後方互換と分岐カバレッジを確保。
- Vitest + coverage 100%維持、`pnpm --filter desktop-electron build`でレンダラbundle再生成済み。