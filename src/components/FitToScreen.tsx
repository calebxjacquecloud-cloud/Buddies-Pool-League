import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** Scales its content down (or up, to `maxScale`) so it fits the box with no scrolling. */
export function FitToScreen({ children, maxScale = 1.6, className = '' }: { children: ReactNode; maxScale?: number; className?: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, w: 0, h: 0 });

  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const measure = () => {
      const w = i.scrollWidth;
      const h = i.scrollHeight;
      if (!w || !h) return;
      const scale = Math.min(o.clientWidth / w, o.clientHeight / h, maxScale);
      setFit({ scale, w, h });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(o);
    ro.observe(i);
    return () => ro.disconnect();
  }, [maxScale]);

  return (
    <div ref={outer} className={`relative overflow-hidden ${className}`}>
      <div
        ref={inner}
        className="absolute left-1/2 top-1/2 origin-center"
        style={{ transform: `translate(-50%, -50%) scale(${fit.scale})`, width: 'max-content' }}
      >
        {children}
      </div>
    </div>
  );
}
