# TFViewer 実装TODO（GitHub Pages公開まで）

`docs/SPECIFICATION.md` に基づく実装タスクをPhase分割したもの。
サーバーレス構成（GitHub Pages + Supabase）を前提とする。

仕様書末尾の提案（`Measurement Type` を導入したDB拡張）を採用し、
初期実装から `microphone_heads` / `measurement_types` / `measurements` の3テーブル構成とする。

* * *

## Phase 0: 準備

- [ ] GitHubリポジトリの公開設定確認（Pages公開にはPublic、またはPro以上のPrivate+Pages要件を確認）
- [ ] Supabaseプロジェクトを新規作成
- [ ] Supabase の URL / anon key を控える
- [ ] `.env` 等に秘密情報を置かない方針を確認（フロントのみ構成のためanon keyはクライアント露出前提、RLSで守る）
- [ ] ディレクトリ構成を決定（例: `/docs` をGitHub Pages公開ルートにする、または `/` ルート公開にする）

* * *

## Phase 1: Supabase設計（DB / Storage / Auth）

### テーブル設計

- [ ] `microphone_heads` テーブル作成
    - `id, management_number, manufacturer, model, serial_number, status, note, created_at, updated_at, deleted_at`（論理削除用に`deleted_at`を追加）
- [ ] `measurement_types` テーブル新設
    - `id, name, description, created_at`
    - 初期データ投入: Head Frequency Response / Capsule Only / Body + Head / Wireless System / Speaker Measurement / Room Measurement
- [ ] `measurements` テーブル作成
    - `id, microphone_head_id(FK), measurement_type_id(FK), measurement_name, measured_at, measured_by, trf_path, original_file_name, smoothing_fraction, json_data(jsonb), note, created_at`
- [ ] 権限用ロールの扱いを決定（Supabase AuthのユーザーメタデータでAdministrator/Operator/Stagemanを保持）

### Storage

- [ ] `trf` バケットを作成（Private）
- [ ] 保存パス規則を実装前提として明文化: `trf/YYYY/MM/{uuid}.trf`
- [ ] アップロード可能拡張子を `.trf` のみに制限する設定
- [ ] ファイルサイズ上限を設定

### Auth / RLS

- [ ] Supabase Authでユーザーを事前登録（管理者が手動登録、サインアップ画面は作らない）
- [ ] Administrator / Operator / Stageman のロールをuser_metadataまたは専用テーブルで管理
- [ ] `microphone_heads` / `measurement_types` / `measurements` にRLSを有効化
- [ ] 参照は認証済み全ロール許可、作成・更新はAdministrator/Operatorのみ、削除（論理削除）はAdministratorのみ、のポリシーを作成
- [ ] Storageバケットにも認証済みユーザーのみアクセス可能なポリシーを設定

* * *

## Phase 2: フロントエンド基盤構築

- [x] `index.html` をエントリポイントとして作成
- [x] Tailwind CSS導入（CDN or ビルド、要件に応じて選択）→ CDN(Play CDN)を採用
- [x] HTMX導入 → 共通ナビの読み込みに使用
- [x] Alpine.js導入
- [x] Plotly.js導入
- [x] Supabase JS SDK導入 → jsDelivr ESM経由
- [x] 共通レイアウト（ヘッダー、ナビゲーション、認証ガード）の骨組み作成
- [x] ページ構成を決定 → 複数HTMLファイル（マルチページ）+ HTMXで共通ナビ読み込み

* * *

## Phase 3: 認証機能

- [x] ログイン画面（メールアドレス・パスワード・ログインボタン）を実装 → `docs/index.html`
- [x] Supabase Authでのログイン処理実装 → `docs/assets/js/auth.js`
- [x] 未ログイン時のリダイレクト処理（各画面で認証ガード） → `requireAuth()` / `layout.js`
- [x] ログアウト機能実装 → ナビの「ログアウト」ボタン
- [ ] ロール（Administrator/Operator/Stageman）に応じたUI出し分けの仕組みを実装

* * *

## Phase 4: マイクヘッド管理機能

- [x] マイク一覧画面（管理番号・メーカー・型番・状態・最終測定日・測定回数を表示） → `docs/microphones.html`（モバイル専用カードUI）
- [x] 一覧の検索機能（管理番号・メーカー・型番・状態） → 測定者・期間はPhase 8/13で比較・履歴検索として別途対応予定
- [x] マイク詳細画面（管理番号・メーカー・型番・シリアル・状態・備考 + 測定履歴一覧） → `docs/microphone-detail.html`
- [x] マイク管理（追加・編集）画面（Administratorのみ） → `docs/microphone-edit.html`
- [x] マイク論理削除機能（Administratorのみ、`deleted_at`更新） → 詳細画面の「削除」ボタン

* * *

## Phase 5: TRF解析エンジン（ブラウザ内処理）

`sample/GAS.js` のTRFパース・平滑化ロジックをブラウザJS(ES Modules)に移植する。

- [x] TRFファイルをArrayBuffer/Uint8Arrayとして読み込む処理 → `docs/assets/js/trf-parser.js`
- [x] JACKREF!シグネチャ検証処理
- [x] 測定名取得処理（オフセット40, 44byte）
- [x] Frequency/Magnitude/Real/Imaginary/Coherenceのオフセット計算・DataView読み出し処理
- [x] Invalid Magnitude（1234.5678）除外処理
- [x] 周波数昇順チェック・不正データ検出処理
- [x] 1/N oct 平滑化処理の移植 → 1/1, 1/3, 1/6, 1/12, 1/24octから選択可能（`SMOOTHING_FRACTION_OPTIONS`）
- [x] `{frequency:[], magnitude_raw:[], magnitude_smoothed:[]}` 形式のJSON生成処理 → `buildMeasurementJson()`
- [x] 解析エラー時のユーザー向けメッセージ設計 → 例外メッセージをそのまま表示（`docs/trf-test.html`で確認可能）

* * *

## Phase 6: 測定アップロード機能

- [ ] アップロード画面UI（対象マイク・測定タイプ・測定日・備考・TRFファイル）
- [ ] ドラッグ&ドロップ対応
- [ ] アップロード後の解析→smoothing→プレビューのフロー実装（Phase 5のロジックを利用）
- [ ] プレビュー画面でPlotlyグラフ表示（登録前確認）
- [ ] 登録処理: TRFファイルをStorageへUUID名でアップロード
- [ ] 登録処理: `measurements` へメタデータ・元ファイル名・json_dataを保存
- [ ] アップロード失敗時のロールバック/エラーハンドリング（Storage登録済みでDB登録失敗した場合の考慮）

* * *

## Phase 7: 単体グラフ表示

- [ ] Plotly.jsでの周波数特性グラフコンポーネント作成
- [ ] 横軸: Logスケール・20Hz〜20kHz（設定変更可能）
- [ ] 縦軸: -18〜18dB（設定変更可能）
- [ ] 線のみ表示（ポイントなし）
- [ ] ズーム・パン対応
- [ ] PNG保存機能
- [ ] 凡例クリックによる表示切替

* * *

## Phase 8: 比較画面

- [ ] 左ペイン: 測定一覧チェックボックス表示
- [ ] 右ペイン: Plotlyグラフ（Phase 7のコンポーネント再利用）
- [ ] チェック変更時の即時再描画（Alpine.jsのreactivityで実装）
- [ ] マイク詳細の測定履歴クリックで比較対象へ追加する導線を実装

* * *

## Phase 9: ダッシュボード

- [ ] 登録マイク数・登録測定数の集計表示
- [ ] 最近の測定一覧表示
- [ ] アップロード・比較開始へのショートカット導線

* * *

## Phase 10: セキュリティ強化

- [ ] HTTPS配信の確認（GitHub Pagesは標準でHTTPS）
- [ ] UUIDファイル名の徹底確認
- [ ] ファイルサイズ制限のクライアント側チェック追加（Storage側制限と二重化）
- [ ] `.trf`拡張子以外を弾くクライアント側バリデーション
- [ ] JACKREFシグネチャ確認をアップロード時の必須チェックとして組み込み
- [ ] 各フォーム入力値バリデーション（必須項目・文字数・型）
- [ ] RLSポリシーの動作確認（各ロールで許可/拒否が意図通りか）

* * *

## Phase 11: レスポンシブ・UI仕上げ

- [ ] PC優先レイアウトの調整
- [ ] スマホでの閲覧確認（一覧・詳細・グラフの最低限の閲覧性確保）
- [ ] 主要ブラウザでの表示確認

* * *

## Phase 12: GitHub Pages公開設定

- [ ] GitHub Pages公開ブランチ/ディレクトリを決定（例: `main`ブランチの`/docs`または`gh-pages`ブランチ）
- [ ] リポジトリ設定 > Pages で公開ソースを設定
- [ ] Supabase側の認証コールバックURL・許可オリジンにGitHub PagesのURLを登録
- [ ] カスタムドメインを使う場合はCNAME設定（必要な場合のみ）
- [ ] 公開後の動作確認（ログイン〜アップロード〜比較まで一通り）

* * *

## Phase 13: テスト・QA

- [ ] 実際の`.trf`ファイルを用いたインポート結果の検証（`sample/GAS.js`の結果と突き合わせ）
- [ ] 不正ファイル（非TRF、破損ファイル）投入時のエラーハンドリング確認
- [ ] ロールごとのアクセス制御確認（Administrator/Operator/Stageman）
- [ ] 検索機能の網羅的な動作確認
- [ ] 比較画面での複数測定同時表示のパフォーマンス確認

* * *

## Phase 14: 公開後バックログ（今後追加予定・仕様書16章より）

- [ ] FFT設定保存
- [ ] Coherence表示
- [ ] Phase表示
- [ ] Impulse Response表示
- [ ] Difference(差分)グラフ
- [ ] リファレンス測定固定
- [ ] CSVエクスポート
- [ ] PDFレポート
- [ ] マイクヘッドQRコード
- [ ] 修理履歴
- [ ] 使用公演履歴
- [ ] 校正履歴
- [ ] メーカー別統計
