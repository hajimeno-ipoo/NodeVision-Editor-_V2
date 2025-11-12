
# NodeVision Edit API 仕様：`inspect/concat` v1.0
更新日: 2025-11-12

## 0. 目的
`Concat` ノード実行前に、入力クリップ群が連結要件（解像度・fps・ピクセルフォーマット等）を満たすかを**軽量に検査**する。

---

## 1. トランスポート
MVPでは**ローカルAPI**のみ。HTTPは既定で無効。

- **Electron IPC**: `engine:inspectConcat`（invoke）  
  - req: `InspectConcatRequest` / res: `InspectConcatResponse`
- **Tauri**: `inspect_concat`（コマンド）
- **オプションHTTP（無効が既定）**: `POST /api/inspect/concat` (localhost限定)

---

## 2. リクエスト（型）
型名: `InspectConcatRequest`
```jsonc
{
  "clips": [
    { "path": "string" }
  ],
  "options": {
    "fpsTolerance": 0.01,
    "include": ["duration","vcodec","sar","fps_rational"]
  },
  "version": "1.0"
}
```
- `clips`（必須, 2..32）: 連結対象のファイル群。各要素は `path` を持つ。  
- `options.fpsTolerance`（任意, 既定 `0.01`）: fps一致判定の許容誤差。  
- `options.include`（任意）: 追加で返すメタの指定。`duration|bitrate|vcodec|sar|fps_rational|pix_fmt`。  
- `version`（任意, 既定 `"1.0"`）: リクエスト仕様バージョン。将来の拡張に備えて付与。

> **注意**: MVPでは `path` のみ。将来は `assetId` 等の参照も検討。

---

## 3. レスポンス（型）
型名: `InspectConcatResponse`
```jsonc
{
  "ok": true,
  "canConcat": true,
  "equality": { "resolution": true, "fps": true, "pix_fmt": true },
  "details": [
    {
      "path": "a.mp4",
      "w": 1920, "h": 1080,
      "fps": 30.0,
      "fps_rational": { "num": 30, "den": 1 },
      "pix_fmt": "yuv420p",
      "sar": { "num": 1, "den": 1 },
      "duration_ms": 10000,
      "vcodec": "h264"
    }
  ],
  "error": null,
  "version": "1.0"
}
```
- `ok`: API呼び出し自体の成否。  
- `canConcat`: 連結可能判定（`true` なら `Concat` に投入可）。  
- `equality`: 属性ごとの一致可否。`fps` は `fpsTolerance` を考慮。  
- `details`: 各クリップの検出結果。`include` に応じて項目が増減。  
- `error`: 失敗時のエラー（下記「エラー定義」参照）。  
- `version`: レスポンス仕様のバージョン。

---

## 4. 一致判定ルール
- **解像度**: `w` と `h` が全クリップで一致。  
- **fps**: `|fps_i - fps_j| <= fpsTolerance` をすべてのペアで満たす。既定 `0.01`。  
  - 例: `30.00` と `29.97` は **不一致**（`0.03 > 0.01`）。
- **pix_fmt**: 完全一致（例：`yuv420p`）。  
- **sar**（参考）: 結合自体は `sar` 不一致でも可能だが、MVP出力は `setsar=1` に正規化。

---

## 5. エラー定義
`error.code` は以下のいずれか。`message` はユーザー向け簡潔文。`meta` は開発者向け補助。

| Code | 説明 | HTTP（任意実装時） | 例の`meta` |
|---|---|---|---|
| `E1001 FfmpegNotFound` | ffmpeg未検出/下限未満 | 500 | `{ "min":"4.4", "actual":"4.2" }` |
| `E1002 PathInvalid` | パスが不正/存在しない | 404 | `{ "path":"./missing.mp4" }` |
| `E1003 PermissionDenied` | 読取不可 | 403 | `{ "path":"..." }` |
| `E1004 MediaProbeFailed` | メタ情報抽出に失敗 | 422 | `{ "stderr_head":"..."} ` |
| `E1005 UnsupportedContainer` | 非対応コンテナ | 415 | `{ "container":"mkv" }` |
| `E2002 TooFewClips` | クリップ数が2未満 | 400 | `{ "count":1 }` |
| `E2006 ClipLimitExceeded` | 上限32超 | 400 | `{ "count":45 }` |
| `E2001 ConcatMismatch` | 属性不一致（解像度/fps/pix_fmt） | 200 | `{ "mismatch": { "resolution":["1920x1080","1280x720"], "fps":["30","29.97"], "pix_fmt":["yuv420p","yuv422p"] } }` |

> **設計方針**: `ConcatMismatch` は**仕様上の不一致**であり、HTTP実装時も **200**（`ok:false`）で返す。検出不能/異常は 4xx/5xx とする。

---

## 6. 例

### 6.1 一致（OK）
**Request**
```json
{ "clips": [{ "path": "a.mp4" }, { "path": "b.mp4" }], "version": "1.0" }
```
**Response**
```json
{
  "ok": true,
  "canConcat": true,
  "equality": { "resolution": true, "fps": true, "pix_fmt": true },
  "details": [
    { "path": "a.mp4", "w": 1920, "h": 1080, "fps": 30.0, "pix_fmt": "yuv420p" },
    { "path": "b.mp4", "w": 1920, "h": 1080, "fps": 30.0, "pix_fmt": "yuv420p" }
  ],
  "error": null,
  "version": "1.0"
}
```

### 6.2 不一致（fps）
**Request**
```json
{ "clips": [{ "path": "a.mp4" }, { "path": "b_2997.mp4" }], "version": "1.0" }
```
**Response**
```json
{
  "ok": true,
  "canConcat": false,
  "equality": { "resolution": true, "fps": false, "pix_fmt": true },
  "details": [
    { "path": "a.mp4", "w": 1920, "h": 1080, "fps": 30.0, "pix_fmt": "yuv420p" },
    { "path": "b_2997.mp4", "w": 1920, "h": 1080, "fps": 29.97, "pix_fmt": "yuv420p" }
  ],
  "error": {
    "code": "E2001",
    "message": "解像度・fps・pix_fmt を一致させてください。",
    "meta": { "mismatch": { "fps": ["30.0","29.97"] } }
  },
  "version": "1.0"
}
```

### 6.3 入力エラー（存在しないファイル）
**Request**
```json
{ "clips": [{ "path": "./missing.mp4" }, { "path": "b.mp4" }], "version": "1.0" }
```
**Response**
```json
{
  "ok": false,
  "canConcat": false,
  "equality": null,
  "details": null,
  "error": { "code": "E1002", "message": "ファイルが見つかりません。", "meta": { "path": "./missing.mp4" } },
  "version": "1.0"
}
```

---

## 7. JSON Schema
- リクエスト: `inspect_concat.request.schema.json`
- レスポンス: `inspect_concat.response.schema.json`

---

## 8. セキュリティ/制約
- パスは**ローカルのみ**許可。HTTPを有効化する場合も `localhost` 限定。  
- シェルは使用しない。全入力はエスケープ/検証。許可拡張子のみ受理。  
- 処理時間上限の目安：**32クリップで ≤ 1 秒**（メタ抽出のみ）。タイムアウト時は `E1004`。

---

## 9. バージョン付けと互換
- `version` フィールドで将来互換を管理。未知のフィールドは**無視**。`1.x` では互換維持。

---
