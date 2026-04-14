# 0036. WSL 環境でのブラウザ自動起動

## ステータス

承認済み (2026-04-14)

## コンテキスト

`bin/git-web` はサーバー起動後にブラウザを自動で開く機能を持つ。OS 判定に `process.platform` を使い、`darwin` では `open`、`win32` では `cmd /c start`、それ以外（Linux）では `xdg-open` を呼び出している。

WSL (Windows Subsystem for Linux) 環境では `process.platform` が `'linux'` を返すため `xdg-open` が選択されるが、WSL 上にはデスクトップ環境がなく `xdg-open` ではブラウザが開かない。Windows 側のブラウザを起動するには WSL から Windows のコマンドを呼び出す必要がある。

WSL 環境を検出してブラウザを開く手段として以下の2つを検討した。

1. **`wslview` (wslu パッケージ)**: Windows 側のデフォルトブラウザを開くラッパーコマンド。ただし Ubuntu 24.04 on WSL2 ではプリインストールされておらず、外部依存が増える。
2. **`cmd.exe /c start`**: WSL から直接 Windows のコマンドを呼ぶ方法。WSL の interop 機能が有効であれば追加インストール不要。URL が `http://127.0.0.1:<port>` 形式の単純なものであるため、エスケープの問題も生じない。

## 決定

WSL 環境を `/proc/version` の内容で判定し、WSL と判定された場合は `cmd.exe /c start` でブラウザを起動する。

### WSL 判定

`/proc/version` を `readFileSync` で読み取り、`/microsoft|wsl/i` にマッチすれば WSL と判定する。読み取りに失敗した場合は非 WSL として扱い、従来の `xdg-open` にフォールバックする。

この判定は `openBrowser` の Linux 分岐（`else` ブランチ）内でのみ実行されるため、macOS・Windows の分岐には影響しない。

### `wslview` を採用しなかった理由

Ubuntu 24.04 on WSL2 でプリインストールされていないことが確認されたため、外部依存の追加を避けた。

## 影響

- 変更対象は `bin/git-web` の `openBrowser` 関数のみ
- `node:fs` の import に `readFileSync` を追加
- 非 WSL の Linux 環境では従来通り `xdg-open` が使用される
