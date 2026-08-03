-- TFViewer: measurementsの削除をAdminのみからAdmin/Editorへ広げる。
--
-- 背景: アップロードしたファイルの削除は、アップロードできるロール
-- （Admin/Editor）に揃えて許可してほしいという要望に対応。
-- storage.objects側のtrf_deleteポリシーは006で既にAdmin/Editorへ広げてあるため、
-- 今回measurements_deleteを揃えることで、Editorが単独で測定の削除
-- （DB行削除＋Storageファイル削除）を完結できるようになる。

drop policy if exists measurements_delete on public.measurements;

create policy measurements_delete
  on public.measurements for delete
  to authenticated
  using (public.current_user_role() in ('Admin', 'Editor'));
