import { requireAuth, logout } from './auth.js';

// 認証必須ページの共通初期化。
// 未ログインなら index.html へリダイレクトし、
// ヘッダー内のログアウトボタンを（後から差し込まれても効くよう）委譲で処理する。
export async function initAuthenticatedPage() {
  const session = await requireAuth();

  document.addEventListener('click', async (event) => {
    if (event.target.id === 'logout-button') {
      await logout();
      window.location.href = './index.html';
    }
  });

  return session;
}
