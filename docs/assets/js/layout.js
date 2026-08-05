import { requireAuth, logout, getCurrentProfile } from './auth.js';

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
  if (profile?.disabled) {
    await logout();
    window.location.href = './index.html?reason=disabled';
    return null;
  }
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
  el.textContent = `${name}（${profile.role}）`;

  const uploadLink = document.getElementById('nav-upload-link');
  if (uploadLink) {
    const canUpload = ['Admin', 'Editor'].includes(profile.role);
    uploadLink.classList.toggle('opacity-30', !canUpload);
    uploadLink.classList.toggle('pointer-events-none', !canUpload);
  }

  const adminLink = document.getElementById('nav-admin-link');
  if (adminLink) {
    adminLink.classList.toggle('hidden', profile.role !== 'Admin');
  }
}
