# WSL 環境でのブラウザ自動起動対応

## セッション概要

- `bin/git-web` の `openBrowser` 関数に WSL 判定を追加し、WSL 環境では `cmd.exe /c start` で Windows 側のブラウザを開くようにした
- ADR 0036 を作成
- ブランチ: `feature/wsl-browser-open`、コミット: `625b7a9`

## TODO

- WSL 環境での実動作確認（手動テスト）
- main へのマージ
