import { memo, useState } from 'react';
import { parseAvatar, presetPixels } from '../shared/avatars';

/** Pixel character drawn as crisp SVG squares (no image files). */
export const PixelCharacter = memo(function PixelCharacter({ index, className = 'h-12 w-12' }: { index: number; className?: string }) {
  const grid = presetPixels(index);
  const h = grid.length;
  const w = grid[0].length;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} shapeRendering="crispEdges" aria-hidden>
      {grid.flatMap((row, y) => row.map((c, x) => (c ? <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={c} /> : null)))}
    </svg>
  );
});

/** A player's picture: their photo, chosen character, or default character. */
export function Avatar({
  player,
  className = 'h-12 w-12',
  ring = true,
}: {
  player: { id: string; avatar?: string | null };
  className?: string;
  ring?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const value = parseAvatar(broken ? null : player.avatar, player.id);
  const frame = `${className} shrink-0 overflow-hidden rounded-full ${ring ? 'ring-2 ring-line' : ''}`;
  if (value.kind === 'photo') {
    return <img src={value.src} alt="" className={`${frame} object-cover bg-surface-3`} onError={() => setBroken(true)} draggable={false} />;
  }
  return (
    <span className={`${frame} grid place-items-center bg-surface-3`}>
      <PixelCharacter index={value.index} className="h-[88%] w-[88%] translate-y-[6%]" />
    </span>
  );
}
