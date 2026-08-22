# TFViewer 仕様書（実装状態）

音響チームがマイクヘッドの周波数特性測定結果を共有・比較するためのWebアプリ。
本書は現在実装済みの内容のみを記録する（構想段階の内容は含まない）。

* * *

## 1. 目的

演劇・ミュージカル等で使用するワイヤレスマイクヘッドは、水没（潜水演出など）を繰り返すことで
周波数特性が日々劣化する。Smaart（TRF）またはOpenSoundMeter（CSV）で測定した周波数特性を
アップロードし、チームメンバーがブラウザで一覧・比較できるようにする。

過去の測定履歴を残すことよりも、**最新の特性をすぐ確認できること**を優先する
（詳細は「6. アップロード・上書き仕様」参照）。

* * *

## 2. システム構成

```
GitHub Pages（docs/ ディレクトリを公開）
│
├── HTML（マルチページ）
├── Tailwind CSS（ローカルビルド。docs/assets/css/styles.cssはビルド生成物）
├── HTMX（共通ナビの読み込みのみに使用。バージョン固定+SRI）
├── Alpine.js（画面ロジック。バージョン固定+SRI）
├── SortableJS（PC/Mac向けドラッグ並び替え。バージョン固定+SRI）
├── Plotly.js（グラフ描画。バージョン固定+SRI）
└── Supabase JS SDK（docs/assets/vendor/に自己ホスト。CDN非依存）

        ↓ 全てブラウザから直接アクセス

Supabase
├── Authentication（メール/パスワード。サインアップ画面なし）
├── Database（PostgreSQL、Row Level Securityで保護）
└── Storage（TRF/CSV原本ファイル）
```

サーバーサイドの実装は存在しない。TRF/CSV解析・平滑化もすべてブラウザ内で行う。
UIは**モバイル専用**（PCレイアウトは考慮しない。ただし測定一覧はデスクトップ幅にも対応）。

デプロイはビルドを介さず`docs/`をそのままGitHub Pagesが配信するため、Tailwindの
ビルド生成物（`styles.css`）とSupabase SDKの自己ホストバンドル（`vendor/supabase-js.esm.js`）は
リポジトリにコミットする。更新手順は`CLAUDE.md`を参照。

* * *

## 3. 技術スタック

- HTML5 / CSS3 / Tailwind CSS（Tailwind CLIでローカルビルドし`docs/assets/css/styles.css`として配信。CDN版Play CDNは廃止）
- HTMX（共通ナビ`partials/nav.html`の非同期読み込みにのみ使用。バージョン固定+SRIハッシュ付き）
- Alpine.js（各ページのインタラクション。バージョン固定+SRIハッシュ付き）
- Plotly.js（バージョン固定: `plotly-2.35.2.min.js`、SRIハッシュ付き）
- SortableJS（バージョン固定、SRIハッシュ付き）
- Supabase JS SDK（esbuildで単一ファイルにバンドルし`docs/assets/vendor/supabase-js.esm.js`として自己ホスト。
  ESMの`import`文はCDN経由だとSRIを付与できないため、サードパーティCDNへの依存自体を断つ方針とした）

* * *

## 4. 認証・ロール

Supabase Authenticationによるメールアドレス／パスワード認証のみ。サインアップ画面は存在せず、
ユーザーはSupabaseダッシュボードから管理者が事前登録する。ロール変更も同様にダッシュボード
（`profiles`テーブルを直接編集）で行い、アプリ内にユーザー管理UIはない。

### ロール

```
Admin
Editor
Viewer
```

### 権限

| 操作                     | Admin | Editor | Viewer |
|--------------------------|:-----:|:------:|:------:|
| 測定一覧の閲覧           | ○     | ○      | ○      |
| 測定のアップロード       | ○     | ○      | ×      |
| 測定の並び替え           | ○     | ○      | ×      |
| 測定の削除               | ○     | ○      | ×      |

現状、AdminとEditorの権限に機能的な差はない（削除も含め全操作が両ロールに許可されている）。
ロールを分けているのは将来的な拡張（ユーザー管理など、現時点では未実装）のためで、実装上は
「書き込み可能（Admin/Editor）」と「閲覧のみ（Viewer）」の2区分として動作する。

Viewerには操作不可のボタン・導線（アップロード枠、並び替え▲▼、削除ボタン、ナビの
「アップロード」リンク）を非表示にはせず、グレーアウトして見せる。実行しようとした場合の
RLSエラーやネットワークエラーは、日本語のわかりやすいメッセージに変換して表示する
（`docs/assets/js/error-messages.js`）。

* * *

## 5. 画面一覧

### ログイン（`index.html`）

メールアドレス・パスワードの入力とログインボタンのみ。

### 測定一覧（`measurements.html`）

- 平滑化（1/1, 1/3, 1/6, 1/12, 1/24 oct）とコヒーレンス閾値（0〜1）をアプリ全体の
  グローバル設定として選択（`localStorage`に保存、全測定に共通適用）
- 比較グラフ（Plotly、後述）
- 測定のチェックボックス一覧（デフォルト全選択）。チェックのON/OFFで即座にグラフへ反映
- A〜Gフィルターは、選択した文字とファイル名の先頭1文字が一致する測定を一覧・グラフの対象にする
- A〜Gの選択中は、`{name}_M`と`{name}_B`をname単位でまとめた表をチェックボックス直下に表示し、
  M/Bそれぞれの125〜4000 Hz帯域平均を表示する
- A〜G全グループの帯域平均表を、選択状態にかかわらず1枚のJPGとして一括ダウンロードできる
- 各行に更新日時、▲▼並び替えボタン、編集ボタン、削除ボタンを表示
- Admin/Editorは編集ダイアログからファイル名とmeasurement nameを変更可能。Viewerには編集ボタンを表示せず、
  DBのRLSでも更新を許可しない

### アップロード（`upload.html`）

- TRF/CSVファイルのドラッグ&ドロップ、またはタップでのファイル選択（複数ファイル同時対応）
- フォーム入力（対象マイク・測定日・備考等）は一切なく、ファイルを渡すだけで自動取込
- 取込結果を1件ずつ一覧表示（新規／上書き／エラー）。上書き時は「上書き前: 測定名（更新日時）」を表示
- 権限がない場合はドロップゾーンをグレーアウトし、案内メッセージを表示

### TRF解析テスト（`trf-test.html`）

TRFファイル単体の解析結果（測定名・点数・波形）を確認するための開発/QA用画面。

* * *

## 6. アップロード・上書き仕様

- 測定の同一性判定は**アップロードされたファイル名**で行う（`measurements.file_name`にunique制約）
- 同名ファイルが既に存在する場合、確認なしに自動的に上書きする（過去データ・履歴は保持しない）
- 上書き前の測定名・更新日時は取込結果に表示され、何が置き換わったか事後確認できる
- 複数ファイルを同時に取り込んだ場合、1ファイルずつ独立して処理される。拡張子不正・サイズ超過・
  解析エラーが発生したファイルはそのファイルだけがエラー表示となり、他のファイルの取込は継続される
- 対応拡張子は`.trf`・`.csv`のみ。フォルダがドロップされた場合もこの拡張子チェックで弾かれる
  （ブラウザはフォルダを0バイトの疑似Fileとして渡すため、中身が展開されて誤取込されることはない）
- ファイルサイズ上限は10MB（クライアント側・Storage側の両方でチェック）
- 上書き時の内部処理は「新ファイルをStorageへアップロード→DB行を新ファイルに更新→旧ファイルを
  Storageから削除」の順に行う。DB更新が失敗した場合のみ新規アップロード分をロールバックする
  （DB更新が成功した後の旧ファイル削除の失敗では、新ファイルを消さない）

* * *

## 7. データベース（Supabase / PostgreSQL）

### profiles

```
id (auth.usersのidと同一)
role text ('Admin' | 'Editor' | 'Viewer', デフォルト'Viewer')
display_name text
created_at
```

`auth.users`への新規ユーザー作成時にトリガーで自動生成される（初期ロールはViewer）。
RLS: 自分自身の行のみSELECT可能。INSERT/UPDATE/DELETEはクライアントから不可
（ロール変更はSupabaseダッシュボード／SQL Editorから直接行う）。

### measurements

```
id uuid
file_name text (unique)
measurement_name text
trf_path text
json_data jsonb
uploaded_by uuid (auth.usersを参照)
sort_order integer
created_at
updated_at
```

`microphone_heads`・`measurement_types`のような個体管理テーブルは持たない（過去に存在したが
`004_reset_flat_measurements.sql`で廃止し、単一のフラット構成に変更済み）。

`json_data`の構造:

```json
{
  "frequency": [number, ...],
  "magnitude_raw": [number, ...],
  "coherence": [number, ...]
}
```

`coherence`は、取り込んだファイルの全データ点でコヒーレンス値が取得できた場合のみ保存される。
1点でも欠損・不正値があるファイルでは`coherence`キー自体を保存せず、そのファイルはコヒーレンス
フィルタの対象外（常に閾値以上として扱う）になる。平滑化後の値（`magnitude_smoothed`）は保存せず、
表示のたびにクライアント側でグローバル設定に基づき計算する。

### RLS（現在の最終状態）

| テーブル/バケット      | SELECT     | INSERT       | UPDATE       | DELETE       |
|------------------------|:----------:|:------------:|:------------:|:------------:|
| `profiles`             | 自分の行のみ | -            | -            | -            |
| `measurements`         | 認証済み全員 | Admin/Editor | Admin/Editor | Admin/Editor |
| `storage.objects`(trf) | 認証済み全員 | Admin/Editor | (ポリシーなし) | Admin/Editor |

ロール判定は`security definer`関数`current_user_role()`（`profiles`を`auth.uid()`で参照）で行い、
RLSの再帰を避けている。

* * *

## 8. Storage

- バケット名: `trf`（非公開）
- 保存パス: `trf/{YYYY}/{MM}/{uuid}.{trf|csv}`（元ファイル名は`measurements.file_name`にのみ保存）
- ファイルサイズ上限: 10MB
- 許可拡張子: `.trf`・`.csv`（Storage RLSのポリシーでオブジェクト名を正規表現チェック）

* * *

## 9. TRF/CSV解析（ブラウザ内処理）

### TRF（Smaart形式）

- 識別子`JACKREF!`（先頭8byte）を検証
- 測定名: オフセット40, 44byte
- Frequency（Float32 LE）/ Magnitude・Real・Imaginary・Coherence（Float64 LE）を
  オフセット612byte以降から読み出し（1点36byte）
- Invalid Magnitude（`1234.5678`）・周波数0以下の点は除外
- 周波数が昇順でない場合は未対応形式としてエラー

### CSV（OpenSoundMeter形式）

- ヘッダーなし。列は`Frequency, Magnitude(dB), Phase(deg), Coherence`の順
- 無効値（DC成分等）は`*`で表現され、数値変換できない行はスキップ

いずれの形式も、有効なデータ点が1つもない場合はエラーとして取込を中止する。

* * *

## 10. 平滑化

- 表示側（クライアント）でグローバル設定に基づき都度計算する（保存はraw値のみ）
- 選択肢: 1/1, 1/3, 1/6, 1/12, 1/24 oct（デフォルト1/6 oct）
- 中心周波数 f に対し `[f * 2^(-1/2N), f * 2^(1/2N)]` の範囲のMagnitudeを算術平均

* * *

## 11. コヒーレンス表示

- グローバルな閾値設定（0〜1、デフォルト0.5、`localStorage`に保存）
- 閾値未満の区間は波形を消さず、opacityを下げて（0.25）視覚的に示す
- 平滑化設定を変えても波形の形自体は変わらないよう、スムージングは常に全データに対して行い、
  閾値フィルタは平滑化後のセグメント分割にのみ適用する
- コヒーレンスを持たない測定（欠損データ）は常に閾値以上として扱う

* * *

## 12. 比較グラフ（Plotly.js）

- 横軸: Logスケール、40Hz〜20kHz、オクターブバンド中心周波数（31.5/63/125/250/500/1k/2k/4k/8k/16k）に
  グリッド線とラベル
- 縦軸: -15dB〜5dB（主グリッド5dB刻み、補助グリッド1dB刻み）、0dBラインを太線で強調
- チェックONの測定のみ描画。チェック変更時に即座に再描画
- 各測定のトレース色は、**現在チェックしている項目の中での順番**で8色のパレット
  （`TRACE_COLORS`）から割り当てる。一覧全体の並び順に固定すると測定数が多い場合に
  色が巡回して衝突するため、実際に比較表示する数本の間で必ず色が異なることを優先している。
  そのためチェックのON/OFFにより同じ測定の色が変わることがある（未チェックの項目は
  グレーの丸で表示）
- ズーム・パン・ダブルクリックリセットは無効化（`dragmode:false`、`doubleClick:false`）。
  ホバー時は各測定の値を1つだけ表示する（塗り分け用トレースはhover無効、透明な全データ
  トレースを別途1本ずつ重ねてホバーを担当）

* * *

## 13. 並び替え

- 一覧の並び順（`sort_order`）はDBに保存され、全員で共通
- ▲▼ボタンでのみ並び替え可能（ドラッグ&ドロップは、iOS Safariでのタッチ操作が実現できな
  かったため採用していない）
- 同時に複数人が並び替え・アップロードした場合、`sort_order`の採番が競合し得るが、
  少人数チームでの利用を前提として許容している

* * *

## 14. セキュリティ

- Supabase Auth + Row Level Security（RLSの詳細は「7. データベース」参照）
- HTTPS配信（GitHub Pages標準）
- Storageオブジェクト名はUUID採番（元ファイル名はDBのみに保存）
- ファイルサイズ制限・拡張子制限（クライアント側・Storage RLS側の二重チェック）
- TRFファイルはJACKREFシグネチャを検証したうえで解析
- anon keyはクライアントに埋め込まれる前提で運用し、RLSで保護する
  （service_role相当の鍵はクライアントコードに含めない）
- 外部CDNから読み込む`<script>`タグ（HTMX/Alpine.js/Plotly/SortableJS）はバージョンを固定し、
  Subresource Integrity（SRI、`integrity`+`crossorigin`属性）を付与する。CDN側の改ざん・侵害があっても
  ハッシュ不一致でスクリプトが実行されない
- Supabase JS SDKはESM `import`文で読み込むためSRIを付与できず、CDN経由のままだと
  セッション窃取につながるサプライチェーンリスクが残る。そのためesbuildで単一ファイルに
  バンドルし`docs/assets/vendor/`に自己ホストすることで、サードパーティCDNへの実行時依存を断っている
