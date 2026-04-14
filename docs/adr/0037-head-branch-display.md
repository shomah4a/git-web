# 0037. HEAD 表示にブランチ名を追加する

## ステータス

承認済み (2026-04-14)

## コンテキスト

ヘッダーの HEAD 表示は `git rev-parse --short HEAD` の結果（ショートハッシュ）のみを表示していた。HEAD がブランチを指している場合、ブランチ名も併せて表示したほうがどのブランチで作業しているかが一目でわかる。

表示方法として以下を検討した。

1. **`head` フィールドを構造化型に変更する**: `{ commitHash: string; branch: string | null }` とし、フロントで表示形式を制御する
2. **バックエンドで表示文字列を組み立てて `head: string` のまま返す**: フロントの変更は最小限だが、表示ロジックがバックエンドに漏れる

## 決定

方式 1 を採用する。`head` を構造化型に変更し、フロントで表示形式を決定する。

### ブランチ名の取得

`git symbolic-ref --short HEAD` を使用する。detached HEAD の場合はこのコマンドが非ゼロで終了するため、失敗時は `branch: null` とする。

### 型定義

ドメインモデル (`RepoInfo`)・DTO (`RepoInfoDto`) の両方で `head` を以下の構造に変更する。

```typescript
{
  commitHash: string
  branch: string | null
}
```

### 表示形式

- ブランチがある場合: `main (abc1234)` のようにブランチ名とハッシュを表示する
- detached HEAD の場合: `abc1234` のようにハッシュのみ表示する

## 影響

- `RepoInfoDto` の wire format が変わるため、API のレスポンス形状が変わる（破壊的変更）
- フロントの型ガード `isRepoInfoDto` の修正が必要
