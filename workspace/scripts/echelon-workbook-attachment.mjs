import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

const WORKBOOK_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel.sheet.macroenabled.12',
  'application/vnd.ms-excel',
]);

export const MAX_WORKBOOK_BYTES = 25 * 1024 * 1024;

export function isWorkbookAttachment(att) {
  const name = String(att?.filename || att?.name || '').trim().toLowerCase();
  const mime = String(att?.mime_type || att?.mimeType || '').trim().toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xlsm') || name.endsWith('.xls')) return true;
  if (WORKBOOK_MIME_TYPES.has(mime)) return true;

  try {
    const path = new URL(String(att?.url || '')).pathname.toLowerCase();
    return path.endsWith('.xlsx') || path.endsWith('.xlsm') || path.endsWith('.xls');
  } catch (_) {
    return false;
  }
}

function sanitizeBasename(name) {
  const raw = String(name || 'workbook.xlsx').trim() || 'workbook.xlsx';
  const tail = raw.split(/[/\\]/).pop() || 'workbook.xlsx';
  const cleaned = tail.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '');
  return (cleaned || 'workbook.xlsx').slice(0, 120);
}

export async function downloadWorkbookAttachment({
  att,
  workspaceRoot,
  jobId,
  serial,
  fetchImpl = fetch,
  maxBytes = MAX_WORKBOOK_BYTES,
}) {
  const url = String(att?.url || '').trim();
  if (!url || !isWorkbookAttachment(att)) return { ok: false, reason: 'unsupported' };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetchImpl(url, { method: 'GET', signal: controller.signal });
    if (!response.ok) return { ok: false, reason: `download-http-${response.status}` };

    const contentLength = Number.parseInt(response.headers.get('content-length') || '', 10);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      return { ok: false, reason: 'too-large' };
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maxBytes) return { ok: false, reason: 'too-large' };
    const isZipWorkbook = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
    const isLegacyWorkbook = bytes.length >= 8 && bytes.subarray(0, 8).equals(
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
    );
    if (!isZipWorkbook && !isLegacyWorkbook) {
      return { ok: false, reason: 'invalid-workbook' };
    }

    const uploadDir = join(workspaceRoot, 'tmp', 'echelon-uploads');
    await mkdir(uploadDir, { recursive: true });
    const basename = sanitizeBasename(att?.filename || att?.name);
    const filename = `${jobId}-${serial}-${basename}`;
    const abs = join(uploadDir, filename);
    await writeFile(abs, bytes);

    return {
      ok: true,
      abs,
      rel: `tmp/echelon-uploads/${filename}`,
      bytes: bytes.length,
    };
  } catch (error) {
    return {
      ok: false,
      reason: error?.name === 'AbortError' ? 'timeout' : 'download-failed',
    };
  } finally {
    clearTimeout(timeout);
  }
}
