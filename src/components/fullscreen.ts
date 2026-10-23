/** Fullscreen API with the webkit fallback older iPadOS Safari needs. */
type FsDoc = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void };

export function enterFullscreen(el: HTMLElement = document.documentElement) {
  const e = el as FsEl;
  try {
    if (e.requestFullscreen) void e.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    else e.webkitRequestFullscreen?.();
  } catch {
    // Not supported (e.g. iPhone Safari): the page still fills the screen.
  }
  try {
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    void orientation.lock?.('landscape').catch(() => {});
  } catch {
    // ignore
  }
}

export function exitFullscreen() {
  const d = document as FsDoc;
  try {
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (d.webkitFullscreenElement) d.webkitExitFullscreen?.();
  } catch {
    // ignore
  }
}

export function isFullscreen() {
  const d = document as FsDoc;
  return !!(document.fullscreenElement || d.webkitFullscreenElement);
}

export function fullscreenSupported() {
  const e = document.documentElement as FsEl;
  return !!(e.requestFullscreen || e.webkitRequestFullscreen);
}
