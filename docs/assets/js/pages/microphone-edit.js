import { initAuthenticatedPage } from '../layout.js';
import { getMicrophoneHead, createMicrophoneHead, updateMicrophoneHead, STATUS_OPTIONS } from '../microphones.js';

export function microphoneEdit() {
  return {
    id: null,
    isNew: true,
    allowed: false,
    loading: true,
    saving: false,
    errorMessage: '',
    statusOptions: STATUS_OPTIONS,
    form: {
      management_number: '',
      manufacturer: '',
      model: '',
      serial_number: '',
      status: 'active',
      note: ''
    },
    async init() {
      const result = await initAuthenticatedPage();
      this.allowed = result?.profile?.role === 'administrator';

      this.id = new URLSearchParams(window.location.search).get('id');
      this.isNew = !this.id;

      if (this.allowed && this.id) {
        try {
          const head = await getMicrophoneHead(this.id);
          this.form = {
            management_number: head.management_number,
            manufacturer: head.manufacturer ?? '',
            model: head.model ?? '',
            serial_number: head.serial_number ?? '',
            status: head.status,
            note: head.note ?? ''
          };
        } catch (error) {
          console.error(error);
          this.errorMessage = 'マイク情報の取得に失敗しました。';
        }
      }

      this.loading = false;
    },
    async save() {
      this.saving = true;
      this.errorMessage = '';
      try {
        const saved = this.isNew
          ? await createMicrophoneHead(this.form)
          : await updateMicrophoneHead(this.id, this.form);
        window.location.href = `./microphone-detail.html?id=${saved.id}`;
      } catch (error) {
        console.error(error);
        this.errorMessage = '保存に失敗しました。管理番号が重複していないか確認してください。';
      } finally {
        this.saving = false;
      }
    }
  };
}
