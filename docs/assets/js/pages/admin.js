import { initAuthenticatedPage } from '../layout.js';
import { listUsers, updateUserRole, setUserDisabled } from '../admin-users.js';
import { translateError } from '../error-messages.js';

export function adminUsers() {
  return {
    loading: true,
    errorMessage: '',
    users: [],
    currentUserId: null,
    savingIds: {},
    async init() {
      const result = await initAuthenticatedPage();
      if (!result) return;

      // nav.htmlの「設定」リンクは非Adminには表示しないが、
      // URL直打ちで来られる可能性があるため画面側でも同様にガードする。
      if (result.profile.role !== 'Admin') {
        window.location.href = './measurements.html';
        return;
      }
      this.currentUserId = result.session.user.id;

      try {
        this.users = await listUsers();
      } catch (error) {
        console.error(error);
        this.errorMessage = 'ユーザー一覧の取得に失敗しました。';
      } finally {
        this.loading = false;
      }
    },
    async changeRole(user, role) {
      if (role === user.role) return;
      const previous = user.role;
      this.savingIds[user.id] = true;
      try {
        await updateUserRole(user.id, role);
        user.role = role;
      } catch (error) {
        console.error(error);
        alert(translateError(error));
      } finally {
        delete this.savingIds[user.id];
      }
    },
    async toggleDisabled(user) {
      const next = !user.disabled;
      this.savingIds[user.id] = true;
      try {
        await setUserDisabled(user.id, next);
        user.disabled = next;
      } catch (error) {
        console.error(error);
        alert(translateError(error));
      } finally {
        delete this.savingIds[user.id];
      }
    }
  };
}
