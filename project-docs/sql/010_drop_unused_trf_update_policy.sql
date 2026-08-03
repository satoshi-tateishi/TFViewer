-- TFViewer: storage.objectsのtrf_updateポリシーを削除する。
--
-- 背景: ファイル上書きは「新規アップロード（insert）＋旧ファイル削除（delete）」で
-- 実現しており、Storageオブジェクトへのupdateを呼ぶ処理はアプリ内に存在しない。
-- trf_updateポリシー（Admin限定）は実質使われていない状態だったため、
-- コード整理として削除する。
--
-- 今後Storageオブジェクトの直接更新が必要になった場合は、
-- 改めて用途に合わせたポリシーを作成すること。

drop policy if exists trf_update on storage.objects;
