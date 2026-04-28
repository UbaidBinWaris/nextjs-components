import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { UploadFileMetadata, UploadMetadataStore } from '@/types/upload';

export class JsonUploadMetadataStore implements UploadMetadataStore {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async append(entries: UploadFileMetadata[]): Promise<void> {
    if (entries.length === 0) {
      return;
    }

    const nextOperation = this.writeQueue.then(async () => {
      await mkdir(path.dirname(this.filePath), { recursive: true });

      let currentEntries: UploadFileMetadata[] = [];

      try {
        const raw = await readFile(this.filePath, 'utf8');
        const parsed = JSON.parse(raw) as unknown;
        currentEntries = Array.isArray(parsed) ? (parsed as UploadFileMetadata[]) : [];
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'ENOENT') {
          throw error;
        }
      }

      const tempFilePath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
      const nextEntries = [...currentEntries, ...entries];
      await writeFile(tempFilePath, JSON.stringify(nextEntries, null, 2), 'utf8');
      await rename(tempFilePath, this.filePath);
    });

    this.writeQueue = nextOperation.then(
      () => undefined,
      () => undefined,
    );

    return nextOperation;
  }

  async list(): Promise<UploadFileMetadata[]> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as UploadFileMetadata[]) : [];
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        return [];
      }

      throw error;
    }
  }
}
