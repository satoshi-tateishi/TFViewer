# マイクヘッド周波数特性管理システム

## 要件定義・基本設計書 Ver.1.0

## 1. システム概要

### 目的

演劇・ミュージカル等で使用するワイヤレスマイクヘッドの周波数特性を管理する。

Smaartで測定したTransfer Function(.trf)をアップロードし、

-   個体差
-   経年変化
-   修理前後の比較

をWebブラウザで閲覧できるようにする。

* * *

## 2. システム構成

```
GitHub Pages
│
├── HTML
├── CSS
├── JavaScript
├── HTMX
├── Alpine.js
└── Plotly.js

        ↓

Supabase
│
├── Authentication
├── Database
└── Storage
```

サーバーは不要。

* * *

## 3. 技術スタック

### Frontend

-   HTML5
-   CSS3
-   Tailwind CSS
-   HTMX
-   Alpine.js
-   Plotly.js

* * *

### Backend

なし

TRF解析もブラウザで実行する。

* * *

### Database

Supabase(PostgreSQL)

* * *

### Storage

Supabase Storage

保存対象

```
.trf
```

* * *

## 4. 認証

Supabase Authentication

ログイン画面のみ。

ユーザー登録画面は存在しない。

管理者が事前登録する。

* * *

権限

```
Administrator

Operator

Stageman
```

* * *

## 5. 画面一覧

### ログイン

```
メールアドレス

パスワード

ログイン
```

* * *

### ダッシュボード

```
登録マイク数

登録測定数

最近の測定

アップロード

比較開始
```

* * *

### マイク一覧

一覧表示

```
管理番号

メーカー

型番

状態

最終測定日

測定回数
```

検索可能

* * *

### マイク詳細

```
管理番号

メーカー

型番

シリアル

状態

備考
```

下部

```
測定履歴
```

* * *

### 測定アップロード

```
対象マイク

測定日

備考

TRFファイル
```

ドラッグ&ドロップ対応

* * *

アップロード後

ブラウザ内で

```
TRF解析

↓

1/6oct smoothing

↓

プレビュー

↓

登録
```

* * *

### 比較画面

左

```
測定一覧

☑ Head001

☑ Head002

☐ Head003
```

右

Plotlyグラフ

* * *

## 6. データベース

### microphone_heads

```
id

management_number

manufacturer

model

serial_number

status

note

created_at

updated_at
```

* * *

### measurements

```
id

microphone_head_id

measurement_name

measured_at

measured_by

trf_path

smoothing_fraction

json_data

note

created_at
```

* * *

json_data

```
{
 frequency:[],
 magnitude_raw:[],
 magnitude_smoothed:[]
}
```

* * *

## 7. Storage

```
trf/

2026/

08/

xxxxxxxx.trf
```

UUID名で保存。

元ファイル名もDBへ保存。

* * *

## 8. TRF解析

ブラウザで実施。

処理

```
TRF選択

↓

JACKREF確認

↓

測定名取得

↓

Frequency取得

↓

Magnitude取得

↓

Invalid除外

↓

1/6oct smoothing

↓

JSON生成
```

* * *

## 9. グラフ

Plotly.js

横軸

```
Log Scale

20Hz〜20kHz
```

縦軸

```
-18〜18dB
```

設定変更可能。

* * *

表示

```
線のみ

ポイントなし

ズーム対応

パン対応

PNG保存

凡例クリックで表示切替
```

* * *

## 10. 比較画面

左

```
チェックボックス一覧
```

右

```
Plotly
```

チェック変更時

即時再描画。

* * *

## 11. マイク管理

管理者のみ

```
追加

編集

削除(論理削除)
```

* * *

## 12. 測定履歴

```
2026/08/03

2026/07/15

2026/05/10
```

クリックすると比較対象へ追加。

* * *

## 13. 検索

管理番号

メーカー

型番

状態

測定者

期間

* * *

## 14. UI

レスポンシブ対応

PC優先。

スマホは閲覧程度。

* * *

## 15. セキュリティ

-   Supabase Auth
-   Row Level Security (RLS)
-   HTTPS
-   UUIDファイル名
-   ファイルサイズ制限
-   `.trf`拡張子だけ許可
-   JACKREFシグネチャ確認
-   入力値バリデーション

* * *

## 16. 今後追加予定

-   FFT設定保存
-   Coherence表示
-   Phase表示
-   Impulse Response表示
-   Difference(差分)グラフ
-   リファレンス測定固定
-   CSVエクスポート
-   PDFレポート
-   マイクヘッドQRコード
-   修理履歴
-   使用公演履歴
-   校正履歴
-   メーカー別統計

* * *

# この構成で一つだけ変更したい点

データベース設計を少しだけ発展させたいです。

現在は

```
Microphone
    ↓
Measurement
```

ですが、実際の現場運用では「マイクヘッド」と「測定」は1対多でも、**測定対象の種類**を持たせると将来性が大きく向上します。

例えば、

```
Measurement Type
├─ Head Frequency Response
├─ Capsule Only
├─ Body + Head
├─ Wireless System
├─ Speaker Measurement
├─ Room Measurement
```

のようにしておけば、このアプリは将来的に「マイクヘッド管理」に留まらず、スピーカーやシステム測定の管理にも自然に拡張できます。

そのため、初期版から次の構造にしておくことをおすすめします。

```
Microphone Head
        │
        ├──── Measurement
        │          │
        │          ├─ Measurement Type
        │          ├─ JSON Data
        │          └─ TRF File
        │
        └──── History
```

この変更は初期実装の手間はほとんど増えませんが、将来「音響測定データ管理プラットフォーム」へ発展させる際の柔軟性が大きく向上します。