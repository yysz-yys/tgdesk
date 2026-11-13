/**
 * Copies an image served by the loopback media server to the clipboard as PNG.
 * The WebView only exposes image clipboard writes for PNG, so other formats are
 * re-encoded through a canvas first. Returns whether anything was written.
 */
export async function copyImageToClipboard(url: string): Promise<boolean> {
  try {
    if (!url || typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
      return false;
    }
    const response = await fetch(url);
    if (!response.ok) {
      return false;
    }
    const blob = await response.blob();
    let png = blob;
    if (blob.type !== "image/png") {
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
      const converted = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (converted) {
        png = converted;
      }
    }
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    return true;
  } catch {
    return false;
  }
}
