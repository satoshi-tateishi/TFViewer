-- TFViewer: ロール名を administrator/operator/stageman から
-- Admin/Editor/Viewer へリネームする。
-- 権限の対応関係は変えず、名称のみ変更する
-- （administrator→Admin, operator→Editor, stageman→Viewer）。
--
-- 順序: 1) CHECK制約を一旦外す → 2) 既存データ更新 →
-- 3) 新CHECK制約・デフォルト値を張る → 4) storage.objectsポリシー →
-- 5) measurementsポリシー、の順に行う。
-- （旧制約が有効なうちにデータを新値へ更新すると弾かれるため、先に外す）

-- 1. CHECK制約を一旦外す
alter table public.profiles drop constraint if exists profiles_role_check;

-- 2. 既存データの値を更新
update public.profiles set role = 'Admin' where role = 'administrator';
update public.profiles set role = 'Editor' where role = 'operator';
update public.profiles set role = 'Viewer' where role = 'stageman';

-- 3. 新CHECK制約とデフォルト値を張る
alter table public.profiles alter column role set default 'Viewer';
alter table public.profiles add constraint profiles_role_check
  check (role in ('Admin', 'Editor', 'Viewer'));

-- 4. storage.objects ポリシー（trfバケット）
drop policy if exists trf_insert on storage.objects;
create policy trf_insert
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'trf'
    and public.current_user_role() in ('Admin', 'Editor')
    and name ~* '\.(trf|csv)$'
  );

drop policy if exists trf_update on storage.objects;
create policy trf_update
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'trf'
    and public.current_user_role() = 'Admin'
  );

drop policy if exists trf_delete on storage.objects;
create policy trf_delete
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'trf'
    and public.current_user_role() in ('Admin', 'Editor')
  );

-- 5. measurements ポリシー
drop policy if exists measurements_insert on public.measurements;
create policy measurements_insert
  on public.measurements for insert
  to authenticated
  with check (public.current_user_role() in ('Admin', 'Editor'));

drop policy if exists measurements_update on public.measurements;
create policy measurements_update
  on public.measurements for update
  to authenticated
  using (public.current_user_role() in ('Admin', 'Editor'));

drop policy if exists measurements_delete on public.measurements;
create policy measurements_delete
  on public.measurements for delete
  to authenticated
  using (public.current_user_role() = 'Admin');
