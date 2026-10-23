import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

/** QR code rendered locally (no external service). */
export function QR({ url, className = 'w-40 h-40' }: { url: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(url, { margin: 1, width: 512, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
      .then((d) => alive && setSrc(d))
      .catch(() => alive && setSrc(null));
    return () => {
      alive = false;
    };
  }, [url]);
  return src ? <img src={src} alt={`QR code for ${url}`} className={`${className} rounded-xl bg-white p-1`} /> : <div className={`${className} rounded-xl bg-white/10`} />;
}
