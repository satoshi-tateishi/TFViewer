-- TFViewer: Phase 1 Storage設定
-- 001_initial_schema.sql の実行後、続けてSQL Editorで実行してください。

-- =========================================================
-- trfバケット作成（非公開）
-- =========================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'trf',
  'trf',
  false,
  10485760, -- 10MB
  null      -- MIMEタイプはブラウザ側判定が不安定なため、拡張子はポリシー側でチェック
)
on conflict (id) do nothing;


-- =========================================================
-- storage.objects の RLS ポリシー（trfバケットのみ対象）
-- =========================================================

-- 参照: 認証済み全ロール
create policy trf_select
  on storage.objects for select
  to authenticated
  using (bucket_id = 'trf');

-- アップロード: administrator / operator のみ、かつ拡張子は.trfのみ
create policy trf_insert
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'trf'
    and public.current_user_role() in ('administrator', 'operator')
    and name ~* '\.trf$'
  );

-- 更新・削除: administratorのみ
create policy trf_update
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'trf'
    and public.current_user_role() = 'administrator'
  );

create policy trf_delete
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'trf'
    and public.current_user_role() = 'administrator'
  );
