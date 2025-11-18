## 2025-11-17 Serena indexing status
- 02:49 JST に `uvx --from git+https://github.com/oraios/serena serena project index` を実行し、最新のシンボルキャッシュ `.serena/cache/typescript/document_symbols_cache_v23-06-25.pkl` を生成。
- 実行ログに task-1763094873295-668606 ワークツリー警告は出るが、本体インデックスは正常完了。
- 2025-11-18 01:28 JST にも同じ `uvx --from git+https://github.com/oraios/serena serena project index` を再実行。警告は task-1763094873295-668606 のワークツリー欠如のみで、TypeScript 91 ファイルのシンボルキャッシュ再生成が成功。