// Supabase/PostgreSQLから返る生のエラーメッセージを、わかりやすい日本語に変換する。
// 該当する変換ルールがない場合は元のメッセージ（TRF/CSVパーサーのエラーは
// 元から日本語）をそのまま返す。
export function translateError(error) {
  const message = error?.message ?? String(error);

  if (/row-level security/i.test(message)) {
    return 'この操作を行う権限がありません（Editor/Admin専用の操作です）。';
  }

  if (error instanceof TypeError || /failed to fetch/i.test(message)) {
    return '通信に失敗しました。ネットワーク接続を確認してもう一度お試しください。';
  }

  return message;
}
