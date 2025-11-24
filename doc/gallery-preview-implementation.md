# Gallery Preview ノード実装計画

## 概要

複数のクロップされた画像を保持し、ユーザーが履歴から選択して表示できる「Gallery Preview」ノードを実装します。

## 背景・課題

### 現在の問題点

Batch Cropノードでは、各スロット（ソース1、2、3）に対して**1つのクロップ設定**しか保存できません。そのため、以下のワークフローが実現できません：

1. 読み込みノードに画像A、Bを読み込む
2. 画像Aをクロップして保存
3. 画像Bをクロップして保存
4. 読み込みノードで画像Aに戻す → 画像Aのクロップが表示される（期待）
5. 読み込みノードで画像Bに戻す → 画像Bのクロップが表示される（期待）

**現在の動作:** ステップ4、5で最後に設定したクロップのみが適用される

### ユーザーの要望

> 読み込みノードの履歴切り替えでプレビューの表示を切り替えられなければ、専用のプレビューノードを作成し、プレビューノード側でクロップした画像を切り替えできないか検討したい。

## 解決策

### 選択した方針: Gallery Previewノードの作成

新しい「Gallery Preview」ノードを作成し、以下の機能を提供します：

1. **画像の蓄積** - 入力から受け取った画像を内部リストに保存
2. **履歴表示** - 保存された画像をサムネイルまたはリストで表示
3. **選択表示** - ユーザーが選択した画像を大きく表示
4. **履歴管理** - クリアボタンで履歴をリセット

### 他の選択肢を却下した理由

#### オプション1: Batch Cropノードで画像ごとの設定を保存
- ❌ 実装が複雑（画像の識別、設定の保存・復元）
- ❌ メモリ使用量が増加
- ❌ プレビュー生成のタイミング制御が難しい

#### オプション3: Batch Cropノードを複数配置
- ❌ ワークフローが煩雑
- ❌ スケーラビリティが低い

## 実装仕様

### 1. ノード定義

**ファイル:** `packages/editor/src/templates.ts`

```typescript
{
  id: 'gallery-preview',
  typeId: 'gallerypreview',
  label: 'Gallery Preview',
  category: 'output',
  inputs: [
    {
      id: 'source',
      label: 'Source',
      dataType: 'media',
      accepts: ['media', 'image', 'video']
    }
  ],
  outputs: [
    {
      id: 'selected',
      label: 'Selected',
      dataType: 'media'
    }
  ],
  settings: {}
}
```

### 2. データ構造

**ノードのデータ構造:**

```typescript
interface GalleryPreviewData {
  // 保存された画像のリスト
  gallery: GalleryItem[];
  // 現在選択されているインデックス
  selectedIndex: number;
  // ギャラリーの最大保存数
  maxItems: number;
}

interface GalleryItem {
  // 画像の一意識別子（パス + タイムスタンプ + サイズなど）
  signature: string;
  // プレビュー情報
  preview: NodeMediaPreview;
  // 追加日時
  addedAt: number;
  // サムネイル用のラベル
  label: string;
}
```

### 3. UIコンポーネント

**ファイル:** `apps/desktop-electron/src/renderer/nodes/gallery-preview.ts`

```typescript
export const createGalleryPreviewNodeRenderer = (context: NodeRendererContext): NodeRendererModule => ({
  id: 'gallery-preview-renderer',
  typeIds: ['gallerypreview'],
  render: node => ({
    afterPortsHtml: [
      buildGalleryView(node, context),
      buildNodeInfoSection(node, context, { tipKey: 'nodes.galleryPreview.tip' })
    ].join(''),
    afterRender: element => {
      const panel = element.querySelector<HTMLElement>('.gallery-preview-panel');
      if (panel) {
        bindGalleryControls(panel, node, context);
      }
    }
  })
});
```

**UIレイアウト:**

```
┌─────────────────────────────────┐
│ Gallery Preview                 │
├─────────────────────────────────┤
│  ┌───┐ ┌───┐ ┌───┐            │
│  │ 1 │ │ 2 │ │ 3 │  ... [Clear]│  ← サムネイルリスト
│  └───┘ └───┘ └───┘            │
├─────────────────────────────────┤
│                                 │
│      選択された画像を表示         │  ← メインプレビュー
│                                 │
│  ┌─────────────────────────┐   │
│  │                         │   │
│  │    [画像プレビュー]       │   │
│  │                         │   │
│  └─────────────────────────┘   │
│                                 │
│  Image 2 of 5                  │  ← ステータス表示
│  [< Prev]  [Next >]            │  ← ナビゲーション
└─────────────────────────────────┘
```

### 4. 主要機能の実装

#### 4.1 画像の受信と蓄積

```typescript
const onPreviewUpdate = (node: RendererNode, newPreview: NodeMediaPreview): void => {
  const data = ensureGalleryData(node);
  const signature = buildGalleryItemSignature(newPreview);
  
  // 既存の画像かチェック
  const existingIndex = data.gallery.findIndex(item => item.signature === signature);
  
  if (existingIndex === -1) {
    // 新しい画像を追加
    const item: GalleryItem = {
      signature,
      preview: newPreview,
      addedAt: Date.now(),
      label: `Image ${data.gallery.length + 1}`
    };
    
    data.gallery.push(item);
    
    // 最大数を超えたら古いものを削除
    if (data.gallery.length > data.maxItems) {
      data.gallery.shift();
    }
    
    // 新しい画像を自動選択
    data.selectedIndex = data.gallery.length - 1;
  } else {
    // 既存の画像を更新
    data.gallery[existingIndex].preview = newPreview;
    data.selectedIndex = existingIndex;
  }
  
  updateGalleryView(node);
  updateOutputPreview(node);
};
```

#### 4.2 画像の識別（シグネチャ）

```typescript
const buildGalleryItemSignature = (preview: NodeMediaPreview): string => {
  // パス、サイズ、クロップ設定などから一意のシグネチャを生成
  const parts = [
    preview.filePath || preview.url,
    preview.width,
    preview.height,
    preview.cropRegion ? JSON.stringify(preview.cropRegion) : '',
    preview.cropRotationDeg || 0,
    preview.cropZoom || 1
  ];
  
  return parts.join('::');
};
```

#### 4.3 選択された画像の出力

```typescript
const updateOutputPreview = (node: RendererNode): void => {
  const data = ensureGalleryData(node);
  
  if (data.selectedIndex >= 0 && data.selectedIndex < data.gallery.length) {
    const selectedItem = data.gallery[data.selectedIndex];
    state.mediaPreviews.set(node.id, selectedItem.preview);
  } else {
    state.mediaPreviews.delete(node.id);
  }
  
  renderNodes();
};
```

### 5. イベント処理

```typescript
const bindGalleryControls = (panel: HTMLElement, node: RendererNode, context: NodeRendererContext): void => {
  // サムネイルクリック
  panel.querySelectorAll<HTMLElement>('.gallery-thumbnail').forEach((thumb, index) => {
    thumb.addEventListener('click', () => {
      selectGalleryItem(node, index);
    });
  });
  
  // 前へボタン
  panel.querySelector('[data-gallery-prev]')?.addEventListener('click', () => {
    const data = ensureGalleryData(node);
    if (data.selectedIndex > 0) {
      selectGalleryItem(node, data.selectedIndex - 1);
    }
  });
  
  // 次へボタン
  panel.querySelector('[data-gallery-next]')?.addEventListener('click', () => {
    const data = ensureGalleryData(node);
    if (data.selectedIndex < data.gallery.length - 1) {
      selectGalleryItem(node, data.selectedIndex + 1);
    }
  });
  
  // クリアボタン
  panel.querySelector('[data-gallery-clear]')?.addEventListener('click', () => {
    clearGallery(node);
  });
};
```

### 6. スタイリング

**ファイル:** `apps/desktop-electron/src/ui-template.ts`

```css
.gallery-preview-panel {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.5rem;
}

.gallery-thumbnail-list {
  display: flex;
  gap: 0.25rem;
  overflow-x: auto;
  padding: 0.25rem;
}

.gallery-thumbnail {
  width: 60px;
  height: 60px;
  border: 2px solid #444;
  border-radius: 4px;
  cursor: pointer;
  object-fit: cover;
  transition: border-color 0.2s;
}

.gallery-thumbnail:hover {
  border-color: #666;
}

.gallery-thumbnail.selected {
  border-color: #0af;
  box-shadow: 0 0 8px rgba(0, 170, 255, 0.5);
}

.gallery-main-preview {
  width: 100%;
  max-height: 300px;
  object-fit: contain;
  background: #1a1a1a;
  border-radius: 4px;
}

.gallery-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.gallery-nav {
  display: flex;
  gap: 0.5rem;
}

.gallery-status {
  font-size: 0.875rem;
  color: #999;
}
```

## 実装手順

### Phase 1: 基本実装

1. ✅ ノード定義を `templates.ts` に追加
2. ✅ `gallery-preview.ts` ファイルを作成
3. ✅ 基本的なUIレンダリング実装
4. ✅ データ構造とヘルパー関数実装
5. ✅ `index.ts` にレンダラーを登録

### Phase 2: 機能実装

1. ✅ 画像の受信と蓄積ロジック
2. ✅ シグネチャ生成ロジック
3. ✅ サムネイル表示とクリック処理
4. ✅ ナビゲーション（前へ/次へ）
5. ✅ クリアボタン実装

### Phase 3: プレビュー連携

1. ✅ 入力プレビューの監視
2. ✅ 選択された画像の出力
3. ✅ プレビュー更新時の自動追加
4. ✅ 下流ノードへの伝播

### Phase 4: UI/UX改善

1. ✅ スタイリングの調整
2. ✅ キーボードショートカット（矢印キー）
3. ✅ アニメーション追加
4. ✅ エラーハンドリング

### Phase 5: 多言語対応

1. ✅ `i18n.ts` に翻訳キーを追加
2. ✅ UI要素に翻訳を適用

## 将来的な拡張案

### 読み込みノードとの自動連動

```typescript
// 読み込みノードの currentIndex を監視
const syncWithLoadNode = (galleryNode: RendererNode): void => {
  const connection = state.connections.find(
    conn => conn.toNodeId === galleryNode.id && conn.toPortId === 'source'
  );
  
  if (connection) {
    const sourceNode = state.nodes.find(n => n.id === connection.fromNodeId);
    if (sourceNode && sourceNode.typeId === 'load') {
      const loadIndex = (sourceNode as any).data?.currentIndex ?? 0;
      
      // ギャラリーのインデックスと同期
      const data = ensureGalleryData(galleryNode);
      if (loadIndex >= 0 && loadIndex < data.gallery.length) {
        selectGalleryItem(galleryNode, loadIndex);
      }
    }
  }
};
```

### その他の拡張

- ギャラリーアイテムのドラッグ＆ドロップによる並び替え
- アイテムごとのメモ/タグ機能
- エクスポート機能（選択した画像を一括保存）
- グリッドビュー/リストビューの切り替え
- ズーム機能
- 比較モード（2つの画像を並べて表示）

## テスト計画

### 単体テスト

1. ✅ シグネチャ生成の一意性確認
2. ✅ 最大アイテム数の制限動作
3. ✅ 選択インデックスの境界チェック
4. ✅ プレビュー更新の伝播

### 統合テスト

1. ✅ 読み込みノード → Batch Crop → Gallery Preview
2. ✅ 複数の画像をクロップして蓄積
3. ✅ サムネイルクリックで切り替え
4. ✅ Gallery Preview → 次のノードへの出力

### E2Eテスト

1. ✅ ユーザーの要望通りのワークフロー
   - 読み込みノードに複数画像を読み込み
   - 各画像をクロップ
   - Gallery Previewで履歴を確認
   - 任意の画像を選択して次のノードで処理

## まとめ

Gallery Previewノードの実装により、以下が実現できます：

✅ **複数のクロップ画像を保持**
✅ **ユーザーが自由に切り替え可能**
✅ **既存のBatch Cropノードを変更せずに実装**
✅ **将来的な拡張性が高い**

この設計により、ユーザーの要望である「読み込みノードの履歴切り替えに対応したプレビュー表示」が実現できます。
