import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export const MAX_ATTACHED_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TIMEOUT_MS = 30_000;

function imageExtension(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpg';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function trustedImageUrl(raw, edgeUrl) {
  try {
    const url = new URL(raw);
    const origin = new URL(edgeUrl);
    if (url.protocol !== 'https:' || origin.protocol !== 'https:' || url.origin !== origin.origin ||
      url.username || url.password || !/^\/storage\/v1\/object\/(public|sign)\/agent-attachments\/.+/.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}

export async function downloadImageAttachment({ att, workspaceRoot, edgeUrl, fetchImpl = fetch,
  maxBytes = MAX_ATTACHED_IMAGE_BYTES }) {
  const url = trustedImageUrl(String(att?.url || ''), edgeUrl);
  if (!url) return { ok: false, reason: 'untrusted-image-url' };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
  let reader;
  try {
    const response = await fetchImpl(url, { method: 'GET', redirect: 'manual', signal: controller.signal });
    if (!response.ok) {
      await response.body?.cancel();
      return { ok: false, reason: `download-http-${response.status}` };
    }
    const length = Number(response.headers.get('content-length'));
    if (Number.isFinite(length) && length > maxBytes) {
      await response.body?.cancel();
      return { ok: false, reason: 'too-large' };
    }
    if (!response.body) return { ok: false, reason: 'empty-image' };
    reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return { ok: false, reason: 'too-large' };
      }
      chunks.push(Buffer.from(value));
    }
    const bytes = Buffer.concat(chunks, size);
    const extension = imageExtension(bytes);
    if (!extension) return { ok: false, reason: 'unsupported-or-invalid-image' };
    const uploadDir = join(workspaceRoot, 'tmp', 'echelon-uploads');
    await mkdir(uploadDir, { recursive: true });
    const filename = `image-${randomUUID()}.${extension}`;
    const abs = join(uploadDir, filename);
    await writeFile(abs, bytes, { flag: 'wx', mode: 0o600 });
    return { ok: true, abs, rel: `tmp/echelon-uploads/${filename}`, bytes: size };
  } catch (error) {
    return { ok: false, reason: error?.name === 'AbortError' ? 'timeout' : 'download-or-save-failed' };
  } finally {
    reader?.releaseLock();
    clearTimeout(timeout);
  }
}

export async function prepareImageAttachment(options) {
  const saved = await downloadImageAttachment(options);
  const name = String(options.att?.filename || options.att?.name || 'image').split(/[/\\]/).pop()
    .replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 120);
  const text = saved.ok
    ? `[Attached image: ${name}]\nThe original image file is saved in your workspace at ${saved.rel}. Absolute server path: ${saved.abs}\nUse this path with brand-connect-campaigns --image-file when attaching this photo to a confirmed editable request. Saving this attachment does not upload it to the campaign portal or authorize publishing/sending. Do not ask for a different attachment button or another upload when this file is available.`
    : `[Attached image: ${name}]\nUnable to save the image as a workspace file: ${saved.reason}. Campaign uploads require JPG/PNG/WebP up to 5 MB. Do not invent a file path or claim an upload succeeded. Explain this specific failure; changing the user's attachment button is not a fix.`;
  return { saved, content: [
    { type: 'image_url', image_url: { url: String(options.att.url) } },
    { type: 'text', text },
  ] };
}
