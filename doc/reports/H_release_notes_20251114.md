# NodeVision Editor v0.0.1 リリースノート（2025-11-14）

| セクション | ステータス | 詳細 |
| --- | --- | --- |
| HTTPトークン運用 (Doc §4/§11) | ✅ 完了 | `nvctl token issue/rotate/revoke` を全OSで再検証。`NV_HTTP=1` で `/api/inspect/concat` を起動し、旧トークン(15分経過)が `401 E4001`、新トークンが `200 OK` になることを確認。証跡: `out/http/token-lifecycle-20251114.log`。 |
| Export Logs (Doc §7) | ✅ 完了 | Renderer の Export Logs UI から `NodeVision-logs-20251114-1305.zip` を出力。トーストに SHA256 (`9f4c...`) を表示し、zip が AES-256 暗号化であることを `7z t -pXXXX` で検証。クラッシュダンプOFF/ON両ケースをスクリーンショット化。 |
| a11y KPI (Doc §10/§11) | ✅ 完了 | `pnpm test:a11y` (axe) で WCAG 2.1 AA 違反 0 件。`ui-template.a11y.test.ts` で en-US/ja-JP 双方の focus/role 属性を検証済み。レビュー内容は `doc/reports/G_a11y_i18n_status_20251113.md` および本ノートに追記。 |

## 追加メモ
- FFmpeg バンドル/外部利用のライセンス表記を About 画面に追加し、LGPL 文言とソース配布リンクを常時表示。
- Export Logs・HTTP Token・トークンビューのテキストを ja-JP ネイティブレビューで再校正。未訳はなく、`en-US` → `ja-JP` 両優先のフォールバックが機能。
- 次回リリースでは zh-CN ローカライズと `maxParallelJobs=2` P1 要件を [`doc/reports/H_p1_backlog_20251114.md`](H_p1_backlog_20251114.md) に沿って実装予定。
