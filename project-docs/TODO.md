# TFViewer 実装TODO（GitHub Pages公開まで）

`project-docs/SPECIFICATION.md` に基づく実装タスクをPhase分割したもの。
サーバーレス構成（GitHub Pages + Supabase）を前提とする。

## 2026-08-03 設計変更

実装途中で方針を以下のように変更した（詳細は `project-docs/sql/004_reset_flat_measurements.sql` 参照）。

- マイクヘッド管理（登録番号・メーカー・型番などの資産管理）は廃止。
- `microphone_heads` / `measurement_types` テーブルを廃止し、`measurements` 単一テーブルのフラット構成にする。
- 測定の識別・上書き判定は **アップロードした元ファイル名** で行う。同名ファイルの再アップロードは既存データを上書きし、過去データ・履歴は保持しない（現在の特性のみ管理する）。
- インポート画面は対象マイク・測定タイプ・測定日・備考・平滑化の入力をすべて廃止し、TRFファイルのドラッグ&ドロップのみで自動取込する。
- 平滑化（1/N oct）はインポート時ではなく表示時にクライアント側で計算する。マイク間で設定がばらつかないよう、平滑化はアプリ全体でグローバルな1つの設定（`localStorage`）として持つ。
- マイク一覧・マイク詳細・比較画面は「測定一覧」画面（チェックボックス一覧 + 重ね書きグラフ）に統合した。

以下のPhase構成はこの変更を反映して改訂済み。

* * *

## Phase 0: 準備

- [ ] GitHubリポジトリの公開設定確認（Pages公開にはPublic、またはPro以上のPrivate+Pages要件を確認）
- [ ] Supabaseプロジェクトを新規作成
- [ ] Supabase の URL / anon key を控える
- [ ] `.env` 等に秘密情報を置かない方針を確認（フロントのみ構成のためanon keyはクライアント露出前提、RLSで守る）
- [ ] ディレクトリ構成を決定（例: `/docs` をGitHub Pages公開ルートにする、または `/` ルート公開にする）

* * *

## Phase 1: Supabase設計（DB / Storage / Auth）

### テーブル設計（2026-08-03 改訂）

- [x] `profiles` テーブル（ロール管理: administrator/operator/stageman、`auth.users`作成時に自動生成）→ `001_initial_schema.sql`
- [x] `measurements` テーブル（フラット構成）→ `004_reset_flat_measurements.sql`
    - `id, file_name(unique), measurement_name, trf_path, json_data(jsonb: frequency/magnitude_rawのみ), uploaded_by, created_at, updated_at`
- [x] ~~`microphone_heads` / `measurement_types`~~ → 廃止（`004_reset_flat_measurements.sql`で削除）

### Storage

- [x] `trf` バケットを作成（非公開）→ `002_storage.sql`
- [x] 保存パス規則: `trf/YYYY/MM/{uuid}.trf`
- [x] アップロード可能拡張子を `.trf` のみに制限（Storage RLSで拡張子チェック）
- [x] ファイルサイズ上限を設定（10MB）

### Auth / RLS

- [x] Supabase Authでユーザーを事前登録（管理者が手動登録、サインアップ画面は作らない）
- [x] Administrator / Operator / Stageman のロールを`profiles`テーブルで管理
- [x] `measurements` にRLSを有効化
- [x] 参照は認証済み全ロール許可、作成・更新はAdministrator/Operatorのみ、削除はAdministratorのみ
- [x] Storageバケットにも認証済みユーザーのみアクセス可能なポリシーを設定

* * *

## Phase 2: フロントエンド基盤構築

- [x] `index.html` をエントリポイントとして作成
- [x] Tailwind CSS導入（CDN）
- [x] HTMX導入 → 共通ナビの読み込みに使用
- [x] Alpine.js導入
- [x] Plotly.js導入
- [x] Supabase JS SDK導入 → jsDelivr ESM経由
- [x] 共通レイアウト（ヘッダー、ナビゲーション、認証ガード）の骨組み作成
- [x] ページ構成を決定 → 複数HTMLファイル（マルチページ）+ HTMXで共通ナビ読み込み
- [x] 各ページのAlpineロジックは`docs/assets/js/pages/*.js`に分離し、HTML側はブートストラップのみに保つ方針を採用
- [x] UIはモバイル専用（PC対応は考慮しない）方針を採用

* * *

## Phase 3: 認証機能

- [x] ログイン画面（メールアドレス・パスワード・ログインボタン）を実装 → `docs/index.html`
- [x] Supabase Authでのログイン処理実装 → `docs/assets/js/auth.js`
- [x] 未ログイン時のリダイレクト処理（各画面で認証ガード） → `requireAuth()` / `layout.js`
- [x] ログアウト機能実装 → ナビの「ログアウト」ボタン
- [ ] ロール（Administrator/Operator/Stageman）に応じたUI出し分けの仕組みを実装 → 測定一覧の削除ボタンでは対応済み。他画面は都度対応

* * *

## Phase 4: TRF解析エンジン（ブラウザ内処理）

`sample/GAS.js` のTRFパース・平滑化ロジックをブラウザJS(ES Modules)に移植する。

- [x] TRFファイルをArrayBuffer/Uint8Arrayとして読み込む処理 → `docs/assets/js/trf-parser.js`
- [x] JACKREF!シグネチャ検証処理
- [x] 測定名取得処理（オフセット40, 44byte）
- [x] Frequency/Magnitude/Real/Imaginary/Coherenceのオフセット計算・DataView読み出し処理
- [x] Invalid Magnitude（1234.5678）除外処理
- [x] 周波数昇順チェック・不正データ検出処理
- [x] 1/N oct 平滑化処理の移植 → 1/1, 1/3, 1/6, 1/12, 1/24octから選択可能（`SMOOTHING_FRACTION_OPTIONS`）
- [x] 保存用JSON生成処理 → `buildRawMeasurementJson()`（raw値のみ。平滑化値は表示時に都度計算）
- [x] 解析エラー時のユーザー向けメッセージ設計 → 例外メッセージをそのまま表示（`docs/trf-test.html`で確認可能）

* * *

## Phase 5: アップロード機能（ドラッグ&ドロップ自動取込）

- [x] アップロード画面UI → `docs/upload.html`（TRFファイルのDnD/タップ選択のみ。フォーム入力なし）
- [x] ドラッグ&ドロップ対応（複数ファイル同時対応）
- [x] ドロップと同時に解析→Storageアップロード→DB登録まで自動実行
- [x] ファイル名重複時は既存データを上書き（古いTRFファイルはStorageから削除し、過去データは残さない）
- [x] 取込結果一覧表示（新規/上書き/エラー）
- [x] 失敗時のロールバック（DB更新失敗時はアップロード済みファイルを削除。上書き時は新データ保存成功後に旧ファイルを削除）

* * *

## Phase 6: 測定一覧・比較画面

マイク一覧・マイク詳細・単体グラフ・比較画面を1画面に統合。

- [x] 測定一覧のチェックボックス表示（デフォルト全選択）→ `docs/measurements.html`
- [x] Plotly.jsでの周波数特性グラフ（横軸Log 20Hz〜20kHz、縦軸-18〜18dB、線のみ、ズーム/パン/PNG保存/凡例クリック切替はPlotly標準機能）
- [x] チェック変更時の即時再描画
- [x] 平滑化のグローバル設定UI（デフォルト1/6oct、`localStorage`に保存）
- [x] Administratorのみ測定の削除が可能（DB行 + Storageファイルを削除）
- [ ] 軸範囲（周波数/dBレンジ）のユーザー設定変更UI

* * *

## Phase 7: ダッシュボード

- [ ] 登録測定数の集計表示
- [ ] 最近更新された測定一覧表示
- [ ] アップロード・一覧へのショートカット導線

* * *

## Phase 8: セキュリティ強化

- [ ] HTTPS配信の確認（GitHub Pagesは標準でHTTPS）
- [ ] UUIDファイル名の徹底確認
- [ ] ファイルサイズ制限のクライアント側チェック追加（Storage側制限と二重化）
- [ ] `.trf`拡張子以外を弾くクライアント側バリデーション
- [ ] JACKREFシグネチャ確認をアップロード時の必須チェックとして組み込み（実装済みのtrf-parser.jsで対応済み、再確認のみ）
- [ ] RLSポリシーの動作確認（各ロールで許可/拒否が意図通りか）

* * *

## Phase 9: UI仕上げ（モバイル最適化）

- [ ] 主要モバイルブラウザ（iOS Safari / Android Chrome）での表示確認
- [ ] タップ操作・DnDのユーザビリティ確認
- [ ] 測定件数が多い場合の一覧・グラフのパフォーマンス確認

* * *

## Phase 10: GitHub Pages公開設定

- [ ] GitHub Pages公開ブランチ/ディレクトリを決定（`main`ブランチの`/docs`を採用済み）
- [ ] リポジトリ設定 > Pages で公開ソースを設定
- [ ] Supabase側の認証コールバックURL・許可オリジンにGitHub PagesのURLを登録
- [ ] 公開後の動作確認（ログイン〜アップロード〜一覧・比較まで一通り）

* * *

## Phase 11: テスト・QA

- [ ] 実際の`.trf`ファイルを用いたインポート結果の検証（`sample/GAS.js`の結果と突き合わせ）
- [ ] 不正ファイル（非TRF、破損ファイル）投入時のエラーハンドリング確認
- [ ] 同名ファイル再アップロード時の上書き・旧ファイル削除の確認
- [ ] ロールごとのアクセス制御確認（Administrator/Operator/Stageman）
- [ ] 測定一覧での複数選択・グローバル平滑化切替のパフォーマンス確認

* * *

## Phase 12: 公開後バックログ（今後追加予定・仕様書16章より）

過去データを保持しない方針としたため、履歴系の項目（修理履歴・使用公演履歴・校正履歴等）は
再度「履歴を残す」設計に戻すことが前提になる。着手時に改めて要否を確認する。

- [ ] FFT設定保存
- [ ] Coherence表示
- [ ] Phase表示
- [ ] Impulse Response表示
- [ ] Difference(差分)グラフ
- [ ] リファレンス測定固定
- [ ] CSVエクスポート
- [ ] PDFレポート
- [ ] マイクヘッドQRコード
- [ ] 修理履歴（要: 履歴保持の再設計）
- [ ] 使用公演履歴（要: 履歴保持の再設計）
- [ ] 校正履歴（要: 履歴保持の再設計）
- [ ] メーカー別統計
