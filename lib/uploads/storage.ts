import { createWriteStream } from 'node:fs';
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import type {
  StoredUploadResult,
  UploadInitInput,
  UploadRouteConfig,
  UploadSession,
  UploadSessionSummary,
  UploadStorageProvider,
} from '@/types/upload';
import { createStoredFileName, getDateSegment } from '@/lib/uploads/utils';

export class LocalDiskUploadStorage implements UploadStorageProvider {
  constructor(private readonly config: UploadRouteConfig) {}

  async initializeUpload(input: UploadInitInput): Promise<UploadSession> {
    const uploadedAt = new Date();
    const storedName = createStoredFileName(input.fileName, input.uploadId, uploadedAt);
    const chunkDirectory = path.join(this.config.tempDirectory, input.uploadId);

    await mkdir(this.config.tempDirectory, { recursive: true });
    await mkdir(this.config.sessionDirectory, { recursive: true });
    await mkdir(chunkDirectory, { recursive: true });

    const session: UploadSession = {
      id: input.uploadId,
      originalName: input.fileName,
      storedName,
      size: input.size,
      type: input.type,
      uploadedAt: uploadedAt.toISOString(),
      chunkDirectory,
      receivedBytes: 0,
      totalChunks: Math.max(1, Math.ceil(input.size / input.chunkSizeBytes)),
      uploadedChunkIndexes: [],
      chunkSizeBytes: input.chunkSizeBytes,
    };

    await this.writeSession(session);
    return session;
  }

  async appendChunk(
    uploadId: string,
    chunkStream: ReadableStream<Uint8Array>,
    chunkSize: number,
    chunkIndex: number,
  ): Promise<UploadSession> {
    const session = await this.readSession(uploadId);

    if (chunkIndex < 0 || chunkIndex >= session.totalChunks) {
      throw new Error(`Chunk index ${chunkIndex} is out of bounds for this upload.`);
    }

    if (session.uploadedChunkIndexes.includes(chunkIndex)) {
      return session;
    }

    const readable = Readable.fromWeb(chunkStream as unknown as WebReadableStream);
    const chunkPath = this.getChunkPath(session.chunkDirectory, chunkIndex);
    const writable = createWriteStream(chunkPath, { flags: 'w', mode: 0o600 });
    await pipeline(readable, writable);

    const fileStats = await stat(chunkPath);
    if (chunkSize > 0 && fileStats.size !== chunkSize) {
      throw new Error('Incomplete chunk write detected.');
    }

    const uploadedChunkIndexes = [...session.uploadedChunkIndexes, chunkIndex].sort((a, b) => a - b);
    const receivedBytes = await this.calculateReceivedBytes(session.chunkDirectory, uploadedChunkIndexes);

    if (receivedBytes > session.size) {
      throw new Error('Uploaded data exceeds declared file size.');
    }

    const updatedSession: UploadSession = {
      ...session,
      receivedBytes,
      uploadedChunkIndexes,
    };

    await this.writeSession(updatedSession);
    return updatedSession;
  }

  async listActiveUploads(): Promise<UploadSessionSummary[]> {
    try {
      const files = await readdir(this.config.sessionDirectory);
      const sessions: UploadSessionSummary[] = [];

      for (const fileName of files) {
        if (!fileName.endsWith('.json')) {
          continue;
        }

        const uploadId = fileName.replace(/\.json$/, '');

        try {
          const session = await this.readSession(uploadId);
          sessions.push(this.toSessionSummary(session));
        } catch (error) {
          const message = error instanceof Error ? error.message : '';
          if (message !== 'Upload session expired.') {
            throw error;
          }
        }
      }

      return sessions.sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        return [];
      }

      throw error;
    }
  }

  async completeUpload(uploadId: string): Promise<StoredUploadResult> {
    const session = await this.readSession(uploadId);

    if (
      session.receivedBytes !== session.size ||
      session.uploadedChunkIndexes.length !== session.totalChunks
    ) {
      throw new Error('Upload is incomplete and cannot be finalized yet.');
    }

    const uploadedAt = new Date(session.uploadedAt);
    const dateSegment = getDateSegment(uploadedAt);
    const targetDirectory = path.join(this.config.uploadRootDir, dateSegment);
    const absolutePath = path.join(targetDirectory, session.storedName);
    const relativePath = path.posix.join('/uploads', dateSegment, session.storedName);

    await mkdir(targetDirectory, { recursive: true });

    const output = createWriteStream(absolutePath, { flags: 'w', mode: 0o644 });
    for (let chunkIndex = 0; chunkIndex < session.totalChunks; chunkIndex += 1) {
      const chunkPath = this.getChunkPath(session.chunkDirectory, chunkIndex);
      const chunkReadable = Readable.fromWeb((await this.readChunkAsWebStream(chunkPath)) as unknown as WebReadableStream);
      await pipeline(chunkReadable, output, { end: false });
    }
    output.end();

    await this.deleteSession(uploadId);
    await rm(session.chunkDirectory, { recursive: true, force: true });

    return {
      id: session.id,
      originalName: session.originalName,
      storedName: session.storedName,
      size: session.size,
      type: session.type,
      path: relativePath,
      uploadedAt: session.uploadedAt,
    };
  }

  async abortUpload(uploadId: string): Promise<void> {
    const sessionFilePath = this.getSessionFilePath(uploadId);

    try {
      const session = await this.readSession(uploadId);
      await rm(session.chunkDirectory, { recursive: true, force: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        throw error;
      }
    }

    await rm(sessionFilePath, { force: true });
  }

  private getSessionFilePath(uploadId: string): string {
    return path.join(this.config.sessionDirectory, `${uploadId}.json`);
  }

  private getChunkPath(chunkDirectory: string, chunkIndex: number): string {
    return path.join(chunkDirectory, `${String(chunkIndex).padStart(8, '0')}.chunk`);
  }

  private async readSession(uploadId: string): Promise<UploadSession> {
    const raw = await readFile(this.getSessionFilePath(uploadId), 'utf8');
    const session = JSON.parse(raw) as UploadSession;

    if (this.isSessionExpired(session)) {
      await this.abortUpload(uploadId);
      throw new Error('Upload session expired.');
    }

    return session;
  }

  private async writeSession(session: UploadSession): Promise<void> {
    const sessionFilePath = this.getSessionFilePath(session.id);
    const tempFilePath = `${sessionFilePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempFilePath, JSON.stringify(session, null, 2), { encoding: 'utf8', mode: 0o600 });
    await rename(tempFilePath, sessionFilePath);
  }

  private async deleteSession(uploadId: string): Promise<void> {
    await rm(this.getSessionFilePath(uploadId), { force: true });
  }

  private async calculateReceivedBytes(
    chunkDirectory: string,
    uploadedChunkIndexes: number[],
  ): Promise<number> {
    let total = 0;

    for (const chunkIndex of uploadedChunkIndexes) {
      const chunkPath = this.getChunkPath(chunkDirectory, chunkIndex);
      const chunkStats = await stat(chunkPath);
      total += chunkStats.size;
    }

    return total;
  }

  private toSessionSummary(session: UploadSession): UploadSessionSummary {
    return {
      uploadId: session.id,
      originalName: session.originalName,
      size: session.size,
      type: session.type,
      uploadedAt: session.uploadedAt,
      receivedBytes: session.receivedBytes,
      totalChunks: session.totalChunks,
      uploadedChunkIndexes: session.uploadedChunkIndexes,
      chunkSizeBytes: session.chunkSizeBytes,
    };
  }

  private async readChunkAsWebStream(chunkPath: string): Promise<ReadableStream> {
    const chunkBuffer = await readFile(chunkPath);
    return new ReadableStream({
      start(controller) {
        controller.enqueue(chunkBuffer);
        controller.close();
      },
    });
  }

  private isSessionExpired(session: UploadSession): boolean {
    const uploadedAtEpoch = new Date(session.uploadedAt).getTime();
    if (!Number.isFinite(uploadedAtEpoch)) {
      return true;
    }

    const expiresAt = uploadedAtEpoch + this.config.sessionTtlSeconds * 1000;
    return Date.now() > expiresAt;
  }
}
