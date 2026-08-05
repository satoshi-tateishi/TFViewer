# CLAUDE.md

## 言語

ユーザーとのやり取りは日本語で対応すること。

## 公開環境

このプロジェクトはGitHub Pagesで公開されている。コードを修正した後は、以下のいずれかの方法で必ず動作検証すること。

- ローカルでサーバーを立てて動作確認する
- 変更をpushし、公開されたページ（GitHub Pages）で動作確認する

## テストアカウント

動作確認用のログイン情報はリポジトリ直下の`test-account.json`（gitignore済み、非公開）を参照。
ロールごとの権限差分を確認する際は、Editor/Viewerなど複数ロールのアカウントでログインして比較すること。

## Tailwind CSS

`docs/assets/css/styles.css`はTailwind CLIのビルド生成物であり、直接編集しない。
Tailwindのクラスを追加・変更したら、以下を実行してから commit すること
（GitHub Pagesはビルドを行わず、コミットされた静的ファイルをそのまま配信するため）。

```
npm install   # 初回のみ
npm run build:css
```

編集対象は`docs/assets/css/tailwind.src.css`（カスタムCSS）と`tailwind.config.js`（content対象パス）。

## Supabase JS SDK

`docs/assets/vendor/supabase-js.esm.js`は`@supabase/supabase-js`をesbuildで単一ファイルにバンドルした自己ホスト版（CDN依存を避けるため）。
バージョンを上げる場合は以下を実行する。

```
npm install --save-dev @supabase/supabase-js@<version>
npm run build:vendor
```
