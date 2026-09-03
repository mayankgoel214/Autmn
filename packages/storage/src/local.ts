import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, join, normalize, sep } from "path";

/**
 * Local-disk storage driver.
 *
 * Selected explicitly with STORAGE_DRIVER=local — never by fallback. It exists
 * so the whole stack can run from a clean clone (docker compose up) without a
 * hosted Supabase project. Files land under STORAGE_LOCAL_DIR/<bucket>/<path>
 * and are served by the API's /files route from the same shared volume, so the
 * public URL is `${STORAGE_PUBLIC_BASE}/<bucket>/<path>`.
 *
 * Deliberately not implemented here: signed URLs and the nightly cleanup
 * traversal, which remain Supabase-only and fail loudly if invoked under the
 * local driver.
 */

export function storageDriver(): "supabase" | "local" {
  const driver = process.env["STORAGE_DRIVER"] ?? "supabase";
  if (driver !== "supabase" && driver !== "local") {
    throw new Error(
      `STORAGE_DRIVER must be "supabase" or "local", got "${driver}"`
    );
  }
  return driver;
}

export function localStorageDir(): string {
  return process.env["STORAGE_LOCAL_DIR"] ?? join(process.cwd(), "storage-data");
}

export function localPublicBase(): string {
  // Trailing slash trimmed so URL assembly is uniform.
  const base = process.env["STORAGE_PUBLIC_BASE"] ?? "http://localhost:3000/files";
  return base.replace(/\/+$/, "");
}

/** Resolve bucket+path inside the storage dir, refusing path traversal. */
export function localFilePath(bucket: string, path: string): string {
  const root = localStorageDir();
  const full = normalize(join(root, bucket, path));
  if (!full.startsWith(normalize(root) + sep)) {
    throw new Error(`Storage path escapes the storage root: ${bucket}/${path}`);
  }
  return full;
}

export async function localUpload(
  bucket: string,
  path: string,
  buffer: Buffer
): Promise<string> {
  const file = localFilePath(bucket, path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, buffer);
  return localPublicUrl(bucket, path);
}

export async function localDownload(bucket: string, path: string): Promise<Buffer> {
  return readFile(localFilePath(bucket, path));
}

export function localPublicUrl(bucket: string, path: string): string {
  return `${localPublicBase()}/${bucket}/${path}`;
}

/**
 * True when a URL points at our own storage — either the Supabase project or
 * the local driver's public base. The worker uses this to decide whether an
 * output URL needs re-uploading (fal.ai temp URLs, data URLs) or is already
 * durably ours.
 */
export function isOwnStorageUrl(url: string): boolean {
  if (storageDriver() === "local") {
    return url.startsWith(`${localPublicBase()}/`);
  }
  const supabaseUrl = process.env["SUPABASE_URL"];
  return supabaseUrl
    ? url.startsWith(supabaseUrl)
    : url.includes(".supabase.co/");
}
