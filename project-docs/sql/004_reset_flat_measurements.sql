-- TFViewer: マイクヘッド管理・測定タイプを廃止し、
-- アップロードファイル名をキーにした単一のフラットな測定一覧へ作り直す。
--
-- 過去の測定履歴は保持しない方針のため、
-- 同じファイル名で再アップロードされたら既存行を上書きする。
-- 平滑化は表示時にクライアント側でグローバル設定を適用するため、
-- json_data には magnitude_raw のみを保持する（smoothed値は保存しない）。

drop view if exists public.microphone_head_summaries;
drop table if exists public.measurements cascade;
drop table if exists public.measurement_types cascade;
drop table if exists public.microphone_heads cascade;

create table public.measurements (
  id uuid primary key default gen_random_uuid(),
  file_name text not null unique,
  measurement_name text not null,
  trf_path text not null,
  json_data jsonb not null,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger measurements_set_updated_at
  before update on public.measurements
  for each row execute function public.set_updated_at();

alter table public.measurements enable row level security;

create policy measurements_select
  on public.measurements for select
  to authenticated
  using (true);

create policy measurements_insert
  on public.measurements for insert
  to authenticated
  with check (public.current_user_role() in ('administrator', 'operator'));

create policy measurements_update
  on public.measurements for update
  to authenticated
  using (public.current_user_role() in ('administrator', 'operator'));

create policy measurements_delete
  on public.measurements for delete
  to authenticated
  using (public.current_user_role() = 'administrator');
