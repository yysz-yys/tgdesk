import type { StickerDoc } from "../../types";

/**
 * The tinted background Web K paints under the premium lock badge on a sticker
 * effect (tweb `helpers/computeLockColor.ts`, after tdesktop's
 * `StickerSetBox::ComputeLockColor`): average the sticker's bottom-centre square
 * (the 20px circle's footprint) weighted by alpha, then dim it with the grey
 * 30% plate. The reference screenshot shows the resulting warm/gold cast on the
 * Duck pack's effect stickers.
 *
 * The kernel's loopback image server answers with `Access-Control-Allow-Origin:
 * *`, so the still frame can be read from a canvas; a tainted/failed read or a
 * missing still just leaves the badge on its plain `#0003` plate.
 */

const cache = new Map<string, string | null>();
const pending = new Map<string, Promise<string | undefined>>();

function colorFromImage(image: HTMLImageElement): string | undefined {
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (!width || !height) return undefined;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return undefined;
  context.drawImage(image, 0, 0);
  // tweb samples a 20px square at the sticker canvas's bottom centre; 20/80 of
  // the rendered box, independent of the still's pixel size.
  const side = Math.max(1, Math.round(Math.min(width, height) * 0.25));
  const sx = Math.round((width - side) / 2);
  const sy = height - side;
  let data: Uint8ClampedArray;
  try {
    data = context.getImageData(sx, sy, side, side).data;
  } catch {
    return undefined;
  }
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let sa = 0;
  for (let i = 0; i < data.length; i += 4) {
    sr += data[i];
    sg += data[i + 1];
    sb += data[i + 2];
    sa += data[i + 3];
  }
  if (sa === 0) return undefined;
  const fill = `rgb(${Math.round((sr * 255) / sa)}, ${Math.round(
    (sg * 255) / sa,
  )}, ${Math.round((sb * 255) / sa)})`;

  const out = document.createElement("canvas");
  out.width = 40;
  out.height = 40;
  const outContext = out.getContext("2d");
  if (!outContext) return undefined;
  outContext.fillStyle = fill;
  outContext.fillRect(0, 0, out.width, out.height);
  // tweb's dimming plate over the sampled colour.
  outContext.fillStyle = "rgba(112, 117, 121, 0.3)";
  outContext.fillRect(0, 0, out.width, out.height);
  return out.toDataURL("image/jpeg");
}

/** Cached lock-badge tint for one effect sticker (undefined when unavailable). */
export function stickerLockColor(
  doc: StickerDoc,
): Promise<string | undefined> {
  const cached = cache.get(doc.id);
  if (cached !== undefined) {
    return Promise.resolve(cached ?? undefined);
  }
  const inFlight = pending.get(doc.id);
  if (inFlight) {
    return inFlight;
  }
  const still =
    doc.kind === "static" ? (doc.photoUrl ?? doc.thumbUrl) : doc.thumbUrl;
  if (!still) {
    cache.set(doc.id, null);
    return Promise.resolve(undefined);
  }
  const promise = new Promise<string | undefined>((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      let color: string | undefined;
      try {
        color = colorFromImage(image);
      } catch {
        color = undefined;
      }
      cache.set(doc.id, color ?? null);
      resolve(color);
    };
    image.onerror = () => {
      cache.set(doc.id, null);
      resolve(undefined);
    };
    image.src = still;
  }).finally(() => {
    pending.delete(doc.id);
  });
  pending.set(doc.id, promise);
  return promise;
}
