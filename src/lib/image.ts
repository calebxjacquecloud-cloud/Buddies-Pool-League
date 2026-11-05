/**
 * Crops a photo to a centered square and shrinks it to `size` pixels, returning
 * a small JPEG data URL (typically 8-20 KB). Runs on the phone before upload.
 */
export async function squareThumbnail(file: File, size = 192, quality = 0.82): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose a photo.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("That photo couldn't be opened. Try a different one."));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("This phone can't resize photos. Pick a character instead.");
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}
