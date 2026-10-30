import { QR } from '../../components/QR';
import { Modal, useToast } from '../../components/ui';

/**
 * "Show on the TV": websites can't start AirPlay themselves (Apple only allows
 * that from Control Center), so this walks staff through mirroring and offers
 * the permanent /tv link for a smart TV browser or a casting laptop.
 */
export function TvHelpModal({ open, onClose, onStart }: { open: boolean; onClose: () => void; onStart: () => void }) {
  const toast = useToast();
  const tvUrl = `${location.origin}/tv`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tvUrl);
      toast({ tone: 'ok', text: 'TV link copied' });
    } catch {
      toast({ tone: 'error', text: 'Could not copy. Long-press the link instead.' });
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="📺 Show the bracket on the TV" wide>
      <div className="grid gap-5 md:grid-cols-2">
        <section className="rounded-2xl bg-surface-2 border border-line p-4 space-y-3">
          <h3 className="text-lg font-black">Mirror this iPad (AirPlay)</h3>
          <ol className="list-decimal pl-5 space-y-1.5 text-muted">
            <li>
              Swipe down from the <b className="text-ink">top-right corner</b> to open Control Center.
            </li>
            <li>
              Tap <b className="text-ink">Screen Mirroring</b> (two overlapping rectangles).
            </li>
            <li>Pick the bar's TV (Apple TV or AirPlay TV).</li>
            <li>Tap the button below.</li>
          </ol>
          <button className="btn-gold btn-lg w-full" onClick={onStart}>
            📺 Start TV Mode
          </button>
          <p className="text-xs text-muted">To stop: tap the screen, then Exit TV. End mirroring from Control Center.</p>
        </section>
        <section className="rounded-2xl bg-surface-2 border border-line p-4 space-y-3">
          <h3 className="text-lg font-black">Or open it on the TV itself</h3>
          <p className="text-muted">
            In the smart TV's web browser (or a laptop plugged into the TV), open this link and <b className="text-ink">bookmark it once</b>. It always shows the current
            tournament, every week, and keeps the iPad free.
          </p>
          <button className="w-full rounded-xl bg-bg border border-line px-4 py-3 text-left font-mono text-lg break-all" onClick={copy}>
            {tvUrl}
          </button>
          <div className="flex items-center gap-4">
            <QR url={tvUrl} className="w-28 h-28 shrink-0" />
            <p className="text-sm text-muted">Scan with a phone or laptop you'll cast or plug into the TV. Chromecast/Google TV: open the link in Chrome, then ⋮ → Cast.</p>
          </div>
        </section>
      </div>
    </Modal>
  );
}
