// Supabase/PostgreSQLから返る生のエラーメッセージを、わかりやすい日本語に変換する。
// 該当する変換ルールがない場合は元のメッセージ（TRF/CSVパーサーのエラーは
// 元から日本語）をそのまま返す。
export function translateError(error) {
  const message = error?.message ?? String(error);

  if (/row-level security/i.test(message)) {
    return 'この操作を行う権限がありません（Editor/Admin専用の操作です）。';
  }

  if (/not authorized/i.test(message)) {
    return 'この操作を行う権限がありません。';
  }

  if (/duplicate key value violates unique constraint/i.test(message)) {
    return '同じファイル名の測定が同時に更新されました。画面を更新してもう一度お試しください。';
  }

  if (/exceeded the maximum allowed size|payload too large/i.test(message)) {
    return 'ファイルサイズが上限（10MB）を超えています。';
  }

  if (error instanceof TypeError || /failed to fetch/i.test(message)) {
    return '通信に失敗しました。ネットワーク接続を確認してもう一度お試しください。';
  }

  return message;
}
