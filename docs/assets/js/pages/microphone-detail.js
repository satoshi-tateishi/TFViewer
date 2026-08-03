import { initAuthenticatedPage } from '../layout.js';
import { getMicrophoneHead, listMeasurementsForHead, softDeleteMicrophoneHead, statusLabel } from '../microphones.js';

export function microphoneDetail() {
  return {
    head: null,
    measurements: [],
    isAdmin: false,
    loading: true,
    errorMessage: '',
    statusLabel,
    async init() {
      const result = await initAuthenticatedPage();
      this.isAdmin = result?.profile?.role === 'administrator';

      const id = new URLSearchParams(window.location.search).get('id');
      if (!id) {
        this.errorMessage = 'マイクが指定されていません。';
        this.loading = false;
        return;
      }

      try {
        this.head = await getMicrophoneHead(id);
        this.measurements = await listMeasurementsForHead(id);
      } catch (error) {
        console.error(error);
        this.errorMessage = 'マイク情報の取得に失敗しました。';
      } finally {
        this.loading = false;
      }
    },
    async remove() {
      if (!confirm(`${this.head.management_number} を削除しますか？（論理削除のため復元可能です）`)) {
        return;
      }
      try {
        await softDeleteMicrophoneHead(this.head.id);
        window.location.href = './microphones.html';
      } catch (error) {
        console.error(error);
        alert('削除に失敗しました。');
      }
    }
  };
}
