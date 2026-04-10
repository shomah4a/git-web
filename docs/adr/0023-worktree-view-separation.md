# ADR 0023: worktree 画面の分離と専用 API

## ステータス

提案

## コンテキスト

ADR 0022 で導入した TreeView は、worktree 表示とリビジョンツリー表示を同一画面で扱っている。
しかし両者は関心事が異なる:

- **worktree**: 作業ディレクトリの現在の状態を把握する画面。ファイルの変更状態 (A/M/D/?) が主関心。将来的に git add 等の操作を発行する起点になりうる
- **リビジョンツリー**: 特定コミットやブランチのスナップショットを閲覧する画面。リビジョン選択が主関心

画面を分離し、worktree 専用の API・DTO・ビューを新設する。

> ADR 0022 の「`/` で rev パラメータによりリビジョンと worktree を切り替える」設計を変更する。

## 決定

### ルーティング

| パス    | 画面                                      | 主要クエリ                    |
| ------- | ----------------------------------------- | ----------------------------- |
| `/`     | WorktreeView (worktree 状態表示)          | `path`                        |
| `/tree` | RevisionTreeView (旧 TreeView をリネーム) | `rev`, `path`                 |
| `/diff` | DiffView (既存の差分表示)                 | `from`, `to` (既存仕様を維持) |

### API

`GET /api/worktree?path=<path>` エンドポイントを新設する。

- `path` 省略時はリポジトリルート
- `git ls-files --stage` + `git status --porcelain=v1 -z` + `fs.stat` でエントリ情報を取得する
- 既存の `GET /api/tree` はリビジョンツリー用としてそのまま残す

### WorktreeEntryDto

worktree 専用の DTO を `@git-web/common` に新設する。

```typescript
type WorktreeEntryStatusDto = 'added' | 'modified' | 'deleted' | 'untracked' | null
type WorktreeEntryTypeDto = 'blob' | 'tree'

type WorktreeEntryDto = {
  readonly status: WorktreeEntryStatusDto
  readonly name: string
  readonly path: string
  readonly type: WorktreeEntryTypeDto
  readonly mode: string | null // git file mode (例: '100644')。ディレクトリは null
  readonly size: number | null // バイト数。ディレクトリ・deleted は null
}
```

既存の `TreeEntryDto` (リビジョンツリー用) は変更しない。

### カラム構成

WorktreeView のテーブルカラム:

| Status | Name | Mode | Size |
| ------ | ---- | ---- | ---- |

- Status は先頭カラムに独立表示 (A/M/D/?)
- Mode は git の file mode 文字列 (100644, 100755, 120000 等)
- Size はバイト数 (ディレクトリ・deleted は '-' 表示)

### レイヤ構成

ADR 0011 に従い、worktree 用のレイヤを新設する:

- `domain/worktree-entry.ts`: WorktreeEntry ドメインモデル
- `domain/ports/git-worktree-client.ts`: GitWorktreeClient interface
- `service/worktree-service.ts`: ユースケース層
- `controller/worktree-controller.ts`: HTTP ハンドラ + DTO 変換

### メタデータ取得方法

| 情報             | 取得元                              |
| ---------------- | ----------------------------------- |
| status (A/M/D/?) | `git status --porcelain=v1 -z`      |
| mode             | `git ls-files --stage`              |
| size             | `fs.stat` (deleted ファイルは null) |

各 git コマンドには `-- <path>/` 引数を渡して対象を絞り、大規模リポジトリでの出力量を削減する。

### ディレクトリの status 集約

ディレクトリ配下に変更ファイル (status !== null) が 1 つでもあれば、そのディレクトリの status を `'modified'` とする。statusMap のキーをディレクトリプレフィックスで走査して判定するため、追加の git コマンドは不要。

### 将来の拡張 (今回スコープ外)

- 最終コミット情報 (commitId, date, author): 非同期遅延ロードで別フェーズ実装
- git add / git restore 等の操作発行
- リビジョンツリー側のメタデータ追加

## 帰結

- worktree とリビジョンツリーが独立した関心事として管理される
- worktree 画面に将来の操作機能を追加しやすくなる
- `/api/worktree` と `/api/tree` が並行して存在するが、担当する関心事が明確に異なる
- ADR 0022 のルーティング表が更新される (worktree は `/` 直下に独立)
