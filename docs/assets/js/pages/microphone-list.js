import { initAuthenticatedPage } from '../layout.js';
import { listMicrophoneHeads, STATUS_OPTIONS, statusLabel } from '../microphones.js';

export function microphoneList() {
  return {
    heads: [],
    filters: { managementNumber: '', manufacturer: '', model: '', status: '' },
    statusOptions: STATUS_OPTIONS,
    isAdmin: false,
    loading: false,
    errorMessage: '',
    statusLabel,
    async init() {
      const result = await initAuthenticatedPage();
      this.isAdmin = result?.profile?.role === 'administrator';
      await this.search();
    },
    async search() {
      this.loading = true;
      this.errorMessage = '';
      try {
        this.heads = await listMicrophoneHeads(this.filters);
      } catch (error) {
        console.error(error);
        this.errorMessage = '一覧の取得に失敗しました。';
      } finally {
        this.loading = false;
      }
    }
  };
}
