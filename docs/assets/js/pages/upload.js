import { initAuthenticatedPage } from '../layout.js';
import { importMeasurementFile } from '../measurements.js';

// Storage側のfile_size_limit（002_storage.sql）と合わせる。
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export function uploadForm() {
  return {
    session: null,
    isDragging: false,
    processing: false,
    results: [],
    async init() {
      const result = await initAuthenticatedPage();
      this.session = result?.session ?? null;
    },
    onDrop(event) {
      this.isDragging = false;
      this.importFiles(Array.from(event.dataTransfer?.files ?? []));
    },
    onFileSelected(event) {
      this.importFiles(Array.from(event.target.files ?? []));
      event.target.value = '';
    },
    async importFiles(files) {
      if (files.length === 0) return;
      this.processing = true;

      for (const file of files) {
        if (!file.name.toLowerCase().endsWith('.trf')) {
          this.results.unshift({ fileName: file.name, ok: false, status: 'エラー', message: '.trfファイルではありません。' });
          continue;
        }

        if (file.size > MAX_FILE_SIZE_BYTES) {
          this.results.unshift({ fileName: file.name, ok: false, status: 'エラー', message: 'ファイルサイズが10MBを超えています。' });
          continue;
        }

        try {
          const result = await importMeasurementFile(file, this.session.user.id);
          this.results.unshift({
            fileName: result.fileName,
            measurementName: result.measurementName,
            pointCount: result.pointCount,
            ok: true,
            status: result.overwritten ? '上書き' : '新規'
          });
        } catch (error) {
          console.error(error);
          this.results.unshift({ fileName: file.name, ok: false, status: 'エラー', message: error.message });
        }
      }

      this.processing = false;
    }
  };
}
