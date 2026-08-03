-- TFViewer: 測定一覧の並び順を全員共通でDBに保存する。

alter table public.measurements add column sort_order integer;

update public.measurements m
set sort_order = sub.rn
from (
  select id, row_number() over (order by file_name) - 1 as rn
  from public.measurements
) sub
where m.id = sub.id;

alter table public.measurements alter column sort_order set not null;
alter table public.measurements alter column sort_order set default 0;
