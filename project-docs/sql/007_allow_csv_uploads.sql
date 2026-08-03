-- TFViewer: OpenSoundMeter等が出力するCSV形式のインポートに対応するため、
-- trfバケットへのアップロードで許可する拡張子に.csvを追加する。
--
-- 背景: trf_insertポリシーがオブジェクト名を '\.trf$' でチェックしており、
-- .csvファイルのアップロードがRLSで拒否されていた。バケット名・列名(trf_path)は
-- 既存互換のためそのまま維持し、許可拡張子のみ広げる。

drop policy if exists trf_insert on storage.objects;

create policy trf_insert
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'trf'
    and public.current_user_role() in ('administrator', 'operator')
    and name ~* '\.(trf|csv)$'
  );
