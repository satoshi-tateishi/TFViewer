-- TFViewer: Phase 4 マイク一覧用ビュー
-- マイク一覧画面の「最終測定日」「測定回数」をまとめて取得するためのビュー。
-- security_invoker = true により、
-- microphone_heads / measurements 側のRLSがそのまま適用される。

create view public.microphone_head_summaries
with (security_invoker = true) as
select
  h.id,
  h.management_number,
  h.manufacturer,
  h.model,
  h.serial_number,
  h.status,
  h.note,
  h.created_at,
  h.updated_at,
  h.deleted_at,
  count(m.id) as measurement_count,
  max(m.measured_at) as last_measured_at
from public.microphone_heads h
left join public.measurements m on m.microphone_head_id = h.id
group by h.id;

grant select on public.microphone_head_summaries to authenticated;
