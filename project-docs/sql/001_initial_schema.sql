-- TFViewer: Phase 1 初期スキーマ
-- Supabase SQL Editorで、このファイルの内容をそのまま貼り付けて実行してください。

create extension if not exists pgcrypto;

-- =========================================================
-- profiles（ロール管理）
-- =========================================================
-- Supabase Authのユーザーに対して、アプリ側のロール
-- (administrator / operator / stageman) を紐付けるテーブル。
-- サインアップ画面は存在しないため、ユーザー作成は管理者が
-- Supabaseダッシュボード（Authentication > Users）から行う。

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'stageman'
    check (role in ('administrator', 'operator', 'stageman')),
  display_name text,
  created_at timestamptz not null default now()
);

-- auth.usersに新規ユーザーが作成されたら、
-- 自動的にprofilesへ行を作成する（初期ロールはstageman）。
-- ロールは後で管理者がSQLから更新する。
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ロール判定用ヘルパー関数。
-- security definerによりRLSを経由せず参照できる（再帰防止）。
create function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;


-- =========================================================
-- measurement_types（測定対象の種類）
-- =========================================================

create table public.measurement_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);

insert into public.measurement_types (name, description) values
  ('Head Frequency Response', 'マイクヘッド単体の周波数特性'),
  ('Capsule Only', 'カプセル単体の測定'),
  ('Body + Head', 'ボディ＋ヘッド一式の測定'),
  ('Wireless System', 'ワイヤレスシステム全体の測定'),
  ('Speaker Measurement', 'スピーカーの測定'),
  ('Room Measurement', '会場・部屋の測定');


-- =========================================================
-- microphone_heads
-- =========================================================

create table public.microphone_heads (
  id uuid primary key default gen_random_uuid(),
  management_number text not null unique,
  manufacturer text,
  model text,
  serial_number text,
  status text not null default 'active',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index microphone_heads_deleted_at_idx
  on public.microphone_heads (deleted_at);

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger microphone_heads_set_updated_at
  before update on public.microphone_heads
  for each row execute function public.set_updated_at();


-- =========================================================
-- measurements
-- =========================================================

create table public.measurements (
  id uuid primary key default gen_random_uuid(),
  microphone_head_id uuid not null
    references public.microphone_heads(id) on delete cascade,
  measurement_type_id uuid not null
    references public.measurement_types(id),
  measurement_name text not null,
  measured_at date not null,
  measured_by uuid references auth.users(id),
  trf_path text not null,
  original_file_name text not null,
  smoothing_fraction integer not null default 6,
  json_data jsonb not null,
  note text,
  created_at timestamptz not null default now()
);

create index measurements_microphone_head_id_idx
  on public.measurements (microphone_head_id);

create index measurements_measurement_type_id_idx
  on public.measurements (measurement_type_id);

create index measurements_measured_at_idx
  on public.measurements (measured_at);


-- =========================================================
-- RLS 有効化
-- =========================================================

alter table public.profiles enable row level security;
alter table public.measurement_types enable row level security;
alter table public.microphone_heads enable row level security;
alter table public.measurements enable row level security;

-- ---- profiles ----
-- 自分自身の行のみ参照可能。更新・削除はクライアントから不可
-- （ロール変更は管理者がSQL Editor / service_role経由で行う）。
create policy profiles_select_own
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

-- ---- measurement_types ----
-- 認証済み全ロールが参照可能。追加・変更はadministratorのみ。
create policy measurement_types_select
  on public.measurement_types for select
  to authenticated
  using (true);

create policy measurement_types_insert
  on public.measurement_types for insert
  to authenticated
  with check (public.current_user_role() = 'administrator');

create policy measurement_types_update
  on public.measurement_types for update
  to authenticated
  using (public.current_user_role() = 'administrator');

-- ---- microphone_heads ----
-- 参照: 認証済み全ロール（論理削除済みはadministratorのみ参照可）。
-- 追加・編集・論理削除(update): administratorのみ。
create policy microphone_heads_select
  on public.microphone_heads for select
  to authenticated
  using (
    deleted_at is null
    or public.current_user_role() = 'administrator'
  );

create policy microphone_heads_insert
  on public.microphone_heads for insert
  to authenticated
  with check (public.current_user_role() = 'administrator');

create policy microphone_heads_update
  on public.microphone_heads for update
  to authenticated
  using (public.current_user_role() = 'administrator');

-- ---- measurements ----
-- 参照: 認証済み全ロール。
-- 追加: administrator / operator。
-- 更新・削除: administratorのみ。
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
  using (public.current_user_role() = 'administrator');

create policy measurements_delete
  on public.measurements for delete
  to authenticated
  using (public.current_user_role() = 'administrator');
