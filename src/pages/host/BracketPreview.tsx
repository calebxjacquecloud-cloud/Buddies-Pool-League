import { useState } from 'react';
import { nextPowerOfTwo, seedOrder } from '../../engine';

/**
 * Round 1 exactly as it will appear on the bracket, top to bottom. Tap one
 * player, then another, to swap their spots. Byes stay where the bracket
 * puts them (against the top seeds).
 */
export function BracketPreview({
  playerIds,
  name,
  onReorder,
  disabled,
}: {
  /** Player ids in seed order (index 0 = seed 1). */
  playerIds: string[];
  name: (id: string) => string;
  onReorder: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const size = nextPowerOfTwo(playerIds.length);
  const order = seedOrder(size);
  const matches = Array.from({ length: size / 2 }, (_, i) => [order[2 * i], order[2 * i + 1]]);

  const tap = (id: string) => {
    if (disabled) return;
    if (!picked) return setPicked(id);
    if (picked === id) return setPicked(null);
    const ids = [...playerIds];
    const a = ids.indexOf(picked);
    const b = ids.indexOf(id);
    [ids[a], ids[b]] = [ids[b], ids[a]];
    setPicked(null);
    onReorder(ids);
  };

  const slot = (seed: number) => {
    const id = playerIds[seed - 1];
    if (!id) {
      return <div className="flex-1 min-h-12 rounded-xl border border-dashed border-line px-3 flex items-center text-faint">Bye</div>;
    }
    const on = picked === id;
    return (
      <button
        type="button"
        onClick={() => tap(id)}
        disabled={disabled}
        aria-pressed={on}
        className={`flex-1 min-h-12 rounded-xl border px-3 text-left font-bold transition ${
          on ? 'border-gold bg-gold/20 text-gold ring-2 ring-gold/50' : picked ? 'border-sky/60 bg-surface-2' : 'border-line bg-surface-2'
        }`}
      >
        {name(id)}
      </button>
    );
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        {picked ? (
          <span className="text-gold font-semibold">Now tap who {name(picked)} should swap places with.</span>
        ) : (
          'This is Round 1 exactly as it will appear on the bracket. Tap two names to swap them.'
        )}
      </p>
      <ol className="space-y-2">
        {matches.map(([a, b], i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="w-7 shrink-0 text-right text-xs font-black text-faint">{i + 1}</span>
            {slot(a)}
            <span className="text-xs font-black text-faint">vs</span>
            {slot(b)}
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted">
        Round 2 pairs match 1 with 2, 3 with 4, and so on.
      </p>
    </div>
  );
}
