# Contributing

Thank you for your interest in designmark.

- **Issues are welcome** for bug reports and feature requests ([new issue](../../issues/new/choose)).
- **Pull requests are welcome.** Every pull request is reviewed by a maintainer before it is merged, and the CI
  (lint, type check and tests on Windows, macOS and Linux with Node.js 20 and 22) must pass.
  For larger changes — a new command, a new option, or a change in behaviour — please open an issue first so we can agree on the direction.
- The DESIGN.md files and pattern packs are **not** part of this repository. They are published on
  [designmark.jp](https://designmark.jp/) (pattern packs also in [awesome-japanese-lp-design-md](https://github.com/xecin-inc/awesome-japanese-lp-design-md)).
  Takedown requests for designmark.jp: https://designmark.jp/takedown/ (not in issues).

## Development

```bash
npm ci
npm run lint        # Biome
npm run typecheck
npm test            # node:test with a local fixture server; never calls designmark.jp
npm run build
```

Please keep these properties of the tool:

- Only two runtime dependencies (`@modelcontextprotocol/sdk` and `zod`).
- No telemetry. The only host it talks to is designmark.jp (or `DESIGNMARK_API` in tests).
- The fetch limits stay as they are (at most 3 designs per `add`, at least 1 second apart; 30 per 10 minutes in the MCP server).
  They follow the designmark.jp terms of use (Article 2, paragraph 3).
- Messages are available in Japanese and English.

By contributing, you agree that your contribution is licensed under the MIT License.

## 日本語

- **不具合の報告と機能の要望は Issue で受け付けます。**
- **プルリクエストも受け付けます。** 取り込む前に必ずメンテナーがレビューし、CI（Windows・macOS・Linux × Node.js 20・22 での lint・型・テスト）の合格を条件にします。
  新しいコマンドやオプション、動きの変更などの大きな変更は、先に Issue で相談してください。
- DESIGN.md と型パックは、このリポジトリには含みません（designmark.jp と型パック集で配っています）。掲載の削除依頼は Issue ではなく https://designmark.jp/takedown/ からお送りください。
- 実行時の依存を 2 つに保つ・利用状況を送らない・取得の回数の制限を外さない（designmark.jp の利用規約 第 2 条第 3 項）・日本語と英語の表示、を守ってください。
- 貢献したものは MIT ライセンスで提供されることに同意したものとします。
