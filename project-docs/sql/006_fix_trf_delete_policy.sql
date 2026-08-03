-- TFViewer: Storageのtrf_deleteポリシーを administrator のみから
-- administrator / operator へ広げる。
--
-- 背景: 同名ファイル上書き時、置き換えられた古いTRFファイルを
-- Storageから削除する処理（importMeasurementFile）は
-- administrator/operatorどちらのアップロードでも実行されるが、
-- 旧ポリシーはadministratorのみdeleteを許可していたため、
-- operatorによる上書き時に古いファイルがStorageに孤立して残っていた。
--
-- measurements_update・trf_insertと同じロール（administrator/operator）に揃える。
-- 個々の測定を完全に削除する操作（measurements_delete）は
-- 引き続きadministratorのみに制限されたまま変わらない。

drop policy if exists trf_delete on storage.objects;

create policy trf_delete
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'trf'
    and public.current_user_role() in ('administrator', 'operator')
  );
