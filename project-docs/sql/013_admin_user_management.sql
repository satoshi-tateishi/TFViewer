-- TFViewer: Admin専用のユーザー管理画面（一覧・権限変更・無効化）を追加する。
--
-- ユーザーの削除（auth.usersからの削除）はサービスロールキーが必要になるため、
-- 引き続きSupabaseダッシュボードから手動で行う方針とし、このアプリでは
-- 「無効化」フラグの切り替えのみをサポートする（削除の代替として使う）。
--
-- 自分自身の行はprofiles_update_adminポリシーの対象外（id <> auth.uid()）とし、
-- Admin自身の権限降格・無効化をRLSレベルで禁止する。これにより、操作者自身は
-- 常にAdminのまま残るため、「最後の1人のAdmin」がこのUI経由で0人になることは
-- 構造的に発生しない（自分以外を何人降格・無効化しても、自分は必ず残るため）。

-- 1. 無効化フラグを追加
alter table public.profiles add column disabled boolean not null default false;

-- 2. ロール判定関数を更新。無効化されたユーザーはroleに関わらずNULL（無権限）を返す。
--    既存のAdmin/Editor限定ポリシー（measurements_insert/update/delete、
--    trf_insert/update/delete等）はすべてこの関数の戻り値で判定しているため、
--    この変更だけで無効化ユーザーの書き込み権限を一括で剥奪できる。
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when disabled then null else role end
  from public.profiles where id = auth.uid();
$$;

-- 3. 参照系ポリシー（元は認証済みなら全ロール許可）にも無効化チェックを追加する。
--    書き込み系は current_user_role() の戻り値で判定しているため2.の変更で
--    自動的に塞がれるが、参照系（using (true) 系）は個別に直す必要がある。
drop policy if exists measurements_select on public.measurements;
create policy measurements_select
  on public.measurements for select
  to authenticated
  using (public.current_user_role() is not null);

drop policy if exists trf_select on storage.objects;
create policy trf_select
  on storage.objects for select
  to authenticated
  using (bucket_id = 'trf' and public.current_user_role() is not null);

-- 4. Adminは全ユーザーの行を参照可能にする。
--    PostgreSQLのRLSでは、UPDATE/DELETEの対象行は「その行がSELECTポリシーでも
--    可視であること」が前提になる（USING句が許可していても、SELECTで見えない
--    行は更新対象として拾われない）。既存のprofiles_select_own（自分の行のみ）
--    だけの状態でAdminが他人の行を更新しようとすると、対象行が常に0件になって
--    しまうため、Admin用のSELECTポリシーを追加する（既存ポリシーとはOR結合）。
create policy profiles_select_admin
  on public.profiles for select
  to authenticated
  using (public.current_user_role() = 'Admin');

-- 5. profilesの更新ポリシー。Adminのみ、かつ自分自身の行は対象外。
create policy profiles_update_admin
  on public.profiles for update
  to authenticated
  using (public.current_user_role() = 'Admin' and id <> auth.uid())
  with check (public.current_user_role() = 'Admin' and id <> auth.uid());

-- 6. ユーザー一覧取得用RPC。
--    profilesにはemailを持たないため、auth.usersと結合する必要があるが、
--    auth.usersはクライアントから直接参照できない（PostgRESTに公開されていない）。
--    security definerで関数所有者権限（RLSバイパス）で結合し、
--    関数内で呼び出し元がAdminであることを明示的に確認する。
create or replace function public.admin_list_users()
returns table (
  id uuid,
  email text,
  role text,
  disabled boolean,
  display_name text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- RETURNS TABLEのroleと列名が衝突して曖昧参照エラーになるため、
  -- ここでは必ずテーブル別名で明示的に修飾する。
  if (select p.role from public.profiles p where p.id = auth.uid()) is distinct from 'Admin' then
    raise exception 'not authorized';
  end if;

  return query
    select p.id, u.email::text, p.role, p.disabled, p.display_name, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    order by p.created_at asc;
end;
$$;

grant execute on function public.admin_list_users() to authenticated;
