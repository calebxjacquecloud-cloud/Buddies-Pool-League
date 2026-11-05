import { useRef, useState } from 'react';
import { backend, type ApiError } from '../data';
import { squareThumbnail } from '../lib/image';
import { PRESETS, parseAvatar, presetLabel } from '../shared/avatars';
import { Avatar, PixelCharacter } from './Avatar';
import { Modal } from './ui';

/**
 * Lets a player pick a pixel character or upload a photo. Their choice sticks
 * to their name every week and can be changed any time.
 */
export function AvatarPicker({
  open,
  onClose,
  player,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  player: { id: string; display_name: string; avatar?: string | null };
  onSaved?: (avatar: string | null) => void;
}) {
  const [tab, setTab] = useState<'character' | 'photo'>('character');
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const current = parseAvatar(player.avatar, player.id);

  const save = async (input: { preset?: number; image?: string }) => {
    setBusy(true);
    setError(null);
    try {
      const res = await backend.setAvatar({ playerId: player.id, ...input });
      onSaved?.(res.avatar);
      setPreview(null);
      onClose();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Your picture" wide>
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Avatar player={{ id: player.id, avatar: preview ?? player.avatar }} className="h-20 w-20" />
          <div>
            <div className="text-xl font-black">{player.display_name}</div>
            <div className="text-sm text-muted">Shows next to your name on the TV. Change it any time.</div>
          </div>
        </div>

        <div className="flex gap-1 rounded-2xl bg-surface-2 p-1 border border-line" role="tablist">
          {(['character', 'photo'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              className={`flex-1 rounded-xl min-h-11 font-bold ${tab === t ? 'bg-surface-3 text-ink' : 'text-muted'}`}
              onClick={() => setTab(t)}
            >
              {t === 'character' ? 'Pick a character' : 'Upload a photo'}
            </button>
          ))}
        </div>

        {error && (
          <p className="rounded-xl bg-danger/15 text-danger font-semibold p-3" role="alert">
            {error}
          </p>
        )}

        {tab === 'character' ? (
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {PRESETS.map((_, i) => {
              const selected = current.kind === 'preset' && current.index === i && !!player.avatar;
              return (
                <button
                  key={i}
                  className={`aspect-square rounded-2xl border-2 grid place-items-center bg-surface-2 active:scale-95 transition disabled:opacity-50 ${
                    selected ? 'border-felt ring-2 ring-felt/50' : 'border-line'
                  }`}
                  disabled={busy}
                  onClick={() => save({ preset: i })}
                  aria-label={presetLabel(i)}
                >
                  <PixelCharacter index={i} className="h-[80%] w-[80%]" />
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                setError(null);
                try {
                  setPreview(await squareThumbnail(file));
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
            />
            {preview ? (
              <div className="flex flex-col items-center gap-3">
                <img src={preview} alt="Your new picture" className="h-40 w-40 rounded-full object-cover ring-2 ring-felt" />
                <div className="flex gap-2 w-full">
                  <button className="btn-secondary flex-1" onClick={() => fileRef.current?.click()} disabled={busy}>
                    Choose another
                  </button>
                  <button className="btn-primary flex-1" onClick={() => save({ image: preview })} disabled={busy}>
                    {busy ? 'Saving…' : 'Use this photo'}
                  </button>
                </div>
              </div>
            ) : (
              <button className="btn-primary btn-lg w-full" onClick={() => fileRef.current?.click()}>
                Choose or take a photo
              </button>
            )}
            <p className="text-xs text-muted">Your photo is cropped to a small square. Keep it bar-friendly: the host can remove any picture.</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
