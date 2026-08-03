import { initAuthenticatedPage } from '../layout.js';
import { importMeasurementFile } from '../measurements.js';
import { formatUpdatedAt } from '../format.js';
import { translateError } from '../error-messages.js';

// Storage側のfile_size_limit（002_storage.sql）と合わせる。
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export function uploadForm() {
  return {
    session: null,
    canUpload: false,
    isDragging: false,
    processing: false,
    results: [],
    async init() {
      const result = await initAuthenticatedPage();
      this.session = result?.session ?? null;
      this.canUpload = ['Admin', 'Editor'].includes(result?.profile?.role);
    },
    onDrop(event) {
      if (!this.canUpload) return;
      this.isDragging = false;
      this.importFiles(Array.from(event.dataTransfer?.files ?? []));
    },
    onFileSelected(event) {
      if (!this.canUpload) return;
      this.importFiles(Array.from(event.target.files ?? []));
      event.target.value = '';
    },
    async importFiles(files) {
      if (files.length === 0) return;
      this.processing = true;

      for (const file of files) {
        const lowerName = file.name.toLowerCase();
        if (!lowerName.endsWith('.trf') && !lowerName.endsWith('.csv')) {
          this.results.unshift({ fileName: file.name, ok: false, status: 'エラー', message: '.trfまたは.csvファイルではありません。' });
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
            status: result.overwritten ? '上書き' : '新規',
            previousMeasurementName: result.previousMeasurementName,
            previousUpdatedAt: result.previousUpdatedAt
              ? formatUpdatedAt(result.previousUpdatedAt)
              : null
          });
        } catch (error) {
          console.error(error);
          this.results.unshift({ fileName: file.name, ok: false, status: 'エラー', message: translateError(error) });
        }
      }

      this.processing = false;
    }
  };
}
