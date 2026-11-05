/**
 * Original pixel-art player characters, drawn from small templates so they take
 * no storage. A player's avatar is stored as one of:
 *   "px:<n>"        a character preset below (never reorder; only append)
 *   "https://..."   an uploaded photo (Supabase Storage)
 *   "data:image/..." an uploaded photo in demo mode only
 * Players with no avatar get a default character picked from their id.
 */

/** Rows are 14 characters wide. '.' = empty. */
const BASE = [
  '..............',
  '..............',
  '....SSSSSS....',
  '...SSSSSSSS...',
  '...SSSSSSSS...',
  '...SESSSSES...',
  '...SESSSSES...',
  '...SSSMMSSS...',
  '....SSSSSS....',
  '....TTTTTT....',
  '...STTTTTTS...',
  '...STTTTTTS...',
  '....TTTTTT....',
  '....PPPPPP....',
  '....PP..PP....',
  '...KKK..KKK...',
];

/** Hair (H) or hat (C) drawn over the base. '.' leaves the base showing. */
const HAIR: Record<string, string[]> = {
  short: ['..............', '....HHHHHH....', '...HHHHHHHH...', '..HHHHHHHHHH..', '..HH......HH..', '..H........H..'],
  spiky: ['...H..H..H....', '...HHHHHHHH...', '..HHHHHHHHHH..', '..HHHHHHHHHH..', '..HH.HH...HH..', '..H........H..'],
  long: [
    '..............', '....HHHHHH....', '...HHHHHHHH...', '..HHHHHHHHHH..', '..HH......HH..', '..HH......HH..',
    '..HH......HH..', '..HH......HH..', '..HH......HH..', '..HH......HH..',
  ],
  bun: ['.....HHHH.....', '....HHHHHH....', '...HHHHHHHH...', '..HHHHHHHHHH..', '..HH......HH..', '..H........H..'],
  curly: [
    '...HHHHHHHH...', '..HHHHHHHHHH..', '.HHHHHHHHHHHH.', '.HHHHHHHHHHHH.', '.HHH......HHH.', '.HH........HH.',
    '..H........H..',
  ],
  ponytail: [
    '..............', '....HHHHHH....', '...HHHHHHHH...', '..HHHHHHHHHHH.', '..HH......HHH.', '..H.......HHH.',
    '...........HH.', '...........HH.', '............H.',
  ],
  cap: ['....CCCCCC....', '...CCCCCCCC...', '...CCCCCCCC...', '..CCCCCCCCCCCC', '..HH......HH..'],
  tophat: ['....CCCCCC....', '....CCCCCC....', '....HHHHHH....', '..CCCCCCCCCC..', '..HH......HH..'],
  buzz: ['..............', '..............', '...HHHHHHHH...', '..H........H..'],
};

export const HAIR_COLORS = {
  black: '#211c26',
  brown: '#6b3e26',
  blonde: '#f2c94c',
  ginger: '#e0612d',
  white: '#e8e8f0',
  pink: '#ff5fa2',
  blue: '#4a7dff',
  purple: '#9a5be0',
  green: '#3fae5a',
} as const;

export const SKIN_TONES = {
  light: '#ffdcb5',
  fair: '#f1c27d',
  tan: '#c98b55',
  brown: '#8d5524',
  deep: '#5c3a21',
  lavender: '#b9a2e6',
  mint: '#9fd8a8',
} as const;

export const SHIRT_COLORS = {
  red: '#e5484d',
  blue: '#3e63dd',
  green: '#30a46c',
  yellow: '#f5d90a',
  purple: '#8e4ec6',
  black: '#2f2f38',
  white: '#f2f2f2',
  orange: '#f76b15',
  teal: '#12a594',
} as const;

type Preset = [style: keyof typeof HAIR, hair: keyof typeof HAIR_COLORS, skin: keyof typeof SKIN_TONES, shirt: keyof typeof SHIRT_COLORS];

/** Character presets. Never reorder or remove; only append (players store the index). */
export const PRESETS: Preset[] = [
  ['short', 'ginger', 'light', 'red'],
  ['spiky', 'ginger', 'fair', 'black'],
  ['curly', 'black', 'deep', 'green'],
  ['long', 'brown', 'lavender', 'orange'],
  ['long', 'white', 'light', 'black'],
  ['long', 'blonde', 'tan', 'yellow'],
  ['short', 'black', 'fair', 'black'],
  ['buzz', 'black', 'light', 'blue'],
  ['tophat', 'brown', 'tan', 'orange'],
  ['bun', 'blonde', 'mint', 'green'],
  ['curly', 'brown', 'brown', 'purple'],
  ['ponytail', 'white', 'light', 'purple'],
  ['spiky', 'pink', 'fair', 'teal'],
  ['short', 'black', 'tan', 'white'],
  ['spiky', 'blonde', 'light', 'red'],
  ['cap', 'black', 'brown', 'blue'],
  ['bun', 'purple', 'deep', 'yellow'],
  ['ponytail', 'blue', 'fair', 'red'],
  ['cap', 'ginger', 'light', 'green'],
  ['long', 'green', 'tan', 'white'],
  ['buzz', 'brown', 'deep', 'orange'],
  ['curly', 'pink', 'lavender', 'teal'],
  ['short', 'white', 'brown', 'red'],
  ['tophat', 'black', 'light', 'purple'],
];

const OUTLINE = '#15131c';
const EYE = '#15131c';
const MOUTH = '#c2504d';
const PANTS = '#2d3142';
const SHOES = '#3b2a20';

/** A character as a grid of colors (null = transparent), with a 1px outline. */
export function presetPixels(index: number): (string | null)[][] {
  const [style, hair, skin, shirt] = PRESETS[((index % PRESETS.length) + PRESETS.length) % PRESETS.length];
  const color: Record<string, string> = {
    S: SKIN_TONES[skin],
    E: EYE,
    M: MOUTH,
    T: SHIRT_COLORS[shirt],
    P: PANTS,
    K: SHOES,
    H: HAIR_COLORS[hair],
    // Hats use the shirt color so they match the outfit.
    C: SHIRT_COLORS[shirt],
  };
  const grid = BASE.map((row) => row.split('').map((ch) => (ch === '.' ? null : color[ch])));
  HAIR[style].forEach((row, y) => row.split('').forEach((ch, x) => ch !== '.' && (grid[y][x] = color[ch])));
  // Pad by one and add an outline around the silhouette.
  const w = grid[0].length + 2;
  const h = grid.length + 2;
  const out: (string | null)[][] = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => grid[y - 1]?.[x - 1] ?? null));
  const filled = out.map((r) => r.map((c) => c !== null));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (filled[y][x]) continue;
      if (filled[y - 1]?.[x] || filled[y + 1]?.[x] || filled[y][x - 1] || filled[y][x + 1]) out[y][x] = OUTLINE;
    }
  }
  return out;
}

/** Default character for players who haven't picked one (stable per player). */
export function defaultPreset(playerId: string): number {
  let h = 0;
  for (const ch of playerId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % PRESETS.length;
}

export type AvatarValue = { kind: 'preset'; index: number } | { kind: 'photo'; src: string };

export function parseAvatar(avatar: string | null | undefined, playerId: string): AvatarValue {
  if (avatar && /^px:\d{1,3}$/.test(avatar)) {
    const index = Number(avatar.slice(3));
    if (index < PRESETS.length) return { kind: 'preset', index };
  }
  if (avatar && (avatar.startsWith('https://') || avatar.startsWith('data:image/'))) return { kind: 'photo', src: avatar };
  return { kind: 'preset', index: defaultPreset(playerId) };
}

/** Checks a value a client wants to save. Returns an error message or null. */
export function avatarProblem(avatar: string | null): string | null {
  if (avatar === null) return null;
  if (/^px:\d{1,3}$/.test(avatar)) return Number(avatar.slice(3)) < PRESETS.length ? null : 'Unknown character';
  if (avatar.startsWith('https://')) return avatar.length <= 500 ? null : 'Picture link is too long';
  if (/^data:image\/(jpeg|png|webp);base64,/.test(avatar)) return avatar.length <= 400_000 ? null : 'Picture is too large';
  return 'Not a valid picture';
}
