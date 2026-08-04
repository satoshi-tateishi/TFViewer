-- TFViewer: 011でsummary_jsonを追加後、既存行のバックフィルが
-- 完了してから実行する。以後の書き込みは常にsummary_jsonを
-- 伴うことをスキーマ上でも保証する。

alter table public.measurements alter column summary_json set not null;
