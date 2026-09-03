/**
 * Serves objects written by the local storage driver (STORAGE_DRIVER=local).
 *
 * Only registered when the local driver is active — under Supabase the public
 * bucket URLs serve files and this route does not exist. The API and worker
 * share the storage volume, so anything the worker writes is readable here.
 */

import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import type { FastifyInstance } from 'fastify';
import { localFilePath } from '@autmn/storage';

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.mp3': 'audio/mpeg',
};

export async function localFileRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { bucket: string; '*': string } }>(
    '/files/:bucket/*',
    async (request, reply) => {
      const { bucket } = request.params;
      const path = request.params['*'];

      let file: string;
      try {
        // localFilePath refuses anything that escapes the storage root.
        file = localFilePath(bucket, path);
      } catch {
        return reply.code(400).send({ error: 'Invalid storage path' });
      }

      try {
        const info = await stat(file);
        if (!info.isFile()) {
          return reply.code(404).send({ error: 'Not found' });
        }
        const ext = file.slice(file.lastIndexOf('.')).toLowerCase();
        reply.header('Content-Type', CONTENT_TYPES[ext] ?? 'application/octet-stream');
        reply.header('Content-Length', info.size);
        reply.header('Cache-Control', 'public, max-age=3600');
        return reply.send(createReadStream(file));
      } catch {
        return reply.code(404).send({ error: 'Not found' });
      }
    },
  );
}
