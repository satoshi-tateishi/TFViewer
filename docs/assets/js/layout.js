import { requireAuth, logout, getCurrentProfile } from './auth.js';

const ROLE_LABELS = {
  administrator: '管理者',
  operator: 'オペレーター',
  stageman: 'ステージマン'
};

let latestSession = null;
let latestProfile = null;

// 認証必須ページの共通初期化。
// 未ログインなら index.html へリダイレクトし、
// ヘッダー内のログアウトボタンを（後から差し込まれても効くよう）委譲で処理する。
// 戻り値の profile.role で管理者向けUIの出し分けに使う。
export async function initAuthenticatedPage() {
  // nav.htmlはhtmxで非同期に読み込まれるため、profile取得より先に
  // 差し込み先が現れる場合・後から現れる場合の両方に対応する。
  document.body.addEventListener('htmx:afterSwap', (event) => {
    if (event.target.id === 'nav-placeholder') {
      renderNavUserInfo(latestSession, latestProfile);
    }
  });

  const session = await requireAuth();
  if (!session) return null;

  const profile = await getCurrentProfile();
  latestSession = session;
  latestProfile = profile;
  renderNavUserInfo(session, profile);

  document.addEventListener('click', async (event) => {
    if (event.target.id === 'logout-button') {
      await logout();
      window.location.href = './index.html';
    }
  });

  return { session, profile };
}

function renderNavUserInfo(session, profile) {
  const el = document.getElementById('nav-user-info');
  if (!el || !session || !profile) return;

  const name = profile.display_name || session.user.email;
  const roleLabel = ROLE_LABELS[profile.role] || profile.role;
  el.textContent = `${name}（${roleLabel}）`;
}
