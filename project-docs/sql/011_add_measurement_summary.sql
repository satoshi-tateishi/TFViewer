-- TFViewer: 測定一覧の帯域平均フィルターと初期表示の通信量削減のため、
-- フル解像度のjson_dataとは別に、対数周波数軸上で1/6 oct間隔に
-- 間引いた要約データ（summary_json）を追加する。
--
-- 一覧取得（listMeasurements）はsummary_jsonのみを読み込み、
-- フル解像度のjson_dataはチェックを入れてグラフ表示する測定だけを
-- 個別取得する（アプリ側で対応）。
--
-- 既存行はこの時点でsummary_jsonがnullのため、アプリ側の
-- バックフィル処理で埋めたあとに012でNOT NULL制約を追加する。

alter table public.measurements add column summary_json jsonb;
