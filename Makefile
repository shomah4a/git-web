#
# git-web タスクランナー
#
# 内部的には ./bin/pnpm を経由して pnpm スクリプトを呼び出す。
# pnpm 自体はリポジトリローカルの corepack 経由で動作する。
#

PNPM := ./bin/pnpm

.PHONY: help install test fmt fmt-check lint typecheck check serve clean

help:
	@echo "利用可能なターゲット:"
	@echo "  install   - 依存パッケージをインストール"
	@echo "  test      - 全パッケージのユニットテストを実行"
	@echo "  fmt       - 全ファイルにフォーマッタを適用"
	@echo "  fmt-check - フォーマット崩れを検査するのみ"
	@echo "  lint      - 全パッケージに lint を実行"
	@echo "  typecheck - 全パッケージで TypeScript の型チェック"
	@echo "  check     - lint + fmt-check + typecheck + test を一括実行"
	@echo "  serve     - 開発サーバーを起動 (ビルド後 ./bin/git-web を起動)"
	@echo "  clean     - ビルド成果物とローカルキャッシュを削除"

install:
	$(PNPM) install

test:
	$(PNPM) test

fmt:
	$(PNPM) format

fmt-check:
	$(PNPM) format:check

lint:
	$(PNPM) lint

typecheck:
	$(PNPM) typecheck

check:
	$(PNPM) check

serve:
	$(PNPM) build
	./bin/git-web

clean:
	rm -rf node_modules packages/*/node_modules packages/*/dist .pnpm-store .corepack
