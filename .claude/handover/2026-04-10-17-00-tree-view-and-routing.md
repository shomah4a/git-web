# ディレクトリツリー表示 + Vue Router 導入 + diff 画面タブ UI

## セッション概要

### 実装内容

- **ADR 0022** を新設し、ルーティング・ツリー表示・タブ UI の設計を定めた
- **GET /api/tree** エンドポイント新設
  - rev 指定時: `git ls-tree -z` でコミットのツリーを取得
  - worktree 時: `git ls-files --cached --others --exclude-standard` + `git status --porcelain=v1 -z` で tracked + untracked (.gitignore 除外) を列挙し、ファイル状態を付与
- **SPA fallback**: `static.ts` に拡張子なしパスの index.html フォールバック追加
- **Vue Router 導入**: vue-router@5.0.4、history mode
  - `/` → TreeView、`/diff` → DiffView
  - DiffView の URL 管理を `window.history.pushState` から `router.replace` に移行
- **TreeView.vue**: RevisionCombobox でリビジョン選択 (デフォルト worktree)、パンくずナビゲーション、ディレクトリクリックでドリルダウン、ファイル状態 (A/M/D/?) の色分け表示
- **DiffView タブ UI**: 各ファイルカードに diff/code タブ。code タブは to 側全文を Shiki ハイライト付きで遅延表示

### ブランチ

`feature/tree-view-and-routing` (6 コミット、main 未 merge)

### 実装安全性評価結果

CRITICAL / HIGH: なし。MEDIUM 2 件、LOW 2 件 (リリース阻害要因なし)。

## TODO

- [ ] main への merge (ユーザー判断)
- [ ] MEDIUM-1: `/` がツリー画面に変わったことの案内 (起動メッセージ等)
- [ ] MEDIUM-2: loadCode に generation カウンタ導入の検討 (現時点で実害なし)
- [ ] LOW-1: ファイルエントリクリック時の動作 (将来のファイル表示機能)
- [ ] ADR 0022 に .gitignore 反映・ステータス表示の決定事項を追記
