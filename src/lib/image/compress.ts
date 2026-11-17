/**
 * Client-side image compression (CLAUDE.md rule 6, BACKLOG M3-01).
 * Decoding into a canvas and re-encoding drops ALL metadata, including EXIF/GPS, because the
 * canvas only holds pixels. Output: JPEG, long edge ≤ maxEdge, size ≤ maxBytes (best effort).
 */

export interface CompressOptions {
  maxEdge: number;
  maxBytes: number;
  square?: boolean; // centre-crop (avatars)
}

export const PHOTO_OPTIONS: CompressOptions = { maxEdge: 1080, maxBytes: 150_000 };
export const AVATAR_OPTIONS: CompressOptions = { maxEdge: 256, maxBytes: 100_000, square: true };

export function fitWithin(w: number, h: number, maxEdge: number): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

export async function compressImage(file: Blob, opts: CompressOptions): Promise<Blob> {
  // createImageBitmap honours EXIF orientation with imageOrientation: "from-image".
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  let sx = 0;
  let sy = 0;
  let sw = bitmap.width;
  let sh = bitmap.height;
  if (opts.square) {
    const side = Math.min(sw, sh);
    sx = (sw - side) / 2;
    sy = (sh - side) / 2;
    sw = sh = side;
  }
  let { width, height } = fitWithin(sw, sh, opts.maxEdge);
  let quality = 0.82;
  let blob: Blob | null = null;
  for (let i = 0; i < 8; i++) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height);
    blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (!blob) throw new Error("Could not encode image");
    if (blob.size <= opts.maxBytes) break;
    if (quality > 0.5) quality -= 0.1;
    else {
      width = Math.round(width * 0.85);
      height = Math.round(height * 0.85);
    }
  }
  bitmap.close();
  return blob!;
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}
