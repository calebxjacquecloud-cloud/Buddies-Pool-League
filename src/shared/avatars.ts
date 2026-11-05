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

type Character = [style: keyof typeof HAIR, hair: keyof typeof HAIR_COLORS, skin: keyof typeof SKIN_TONES, shirt: keyof typeof SHIRT_COLORS];
/** A pool ball: number 1-9 (1-8 solid, 9 striped). */
type Ball = ['ball', number];
type Preset = Character | Ball;

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
  // Pool balls 1-9 (indexes 24-32).
  ['ball', 1],
  ['ball', 2],
  ['ball', 3],
  ['ball', 4],
  ['ball', 5],
  ['ball', 6],
  ['ball', 7],
  ['ball', 8],
  ['ball', 9],
];

/** Index of the first pool ball; the people characters come before it. */
export const FIRST_BALL = 24;

/** Standard pool ball colors (9 uses the 1-ball yellow with a white stripe). */
const BALL_COLORS: Record<number, string> = {
  1: '#f5c400',
  2: '#1f4fd1',
  3: '#d62828',
  4: '#6a2c91',
  5: '#f77f00',
  6: '#1b8a3a',
  7: '#8a1c1c',
  8: '#121212',
  9: '#f5c400',
};

/** 3x5 pixel digits for the number on the ball. */
const DIGITS: Record<number, string[]> = {
  1: ['.#.', '##.', '.#.', '.#.', '###'],
  2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['##.', '..#', '.#.', '..#', '##.'],
  4: ['#.#', '#.#', '###', '..#', '..#'],
  5: ['###', '#..', '##.', '..#', '##.'],
  6: ['.##', '#..', '###', '#.#', '###'],
  7: ['###', '..#', '.#.', '.#.', '.#.'],
  8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '##.'],
};

function ballPixels(n: number): (string | null)[][] {
  const size = 16;
  const c = (size - 1) / 2;
  const color = BALL_COLORS[n];
  const grid: (string | null)[][] = [];
  for (let y = 0; y < size; y++) {
    const row: (string | null)[] = [];
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c);
      if (d > 7.3) row.push(null);
      else if (d <= 3.9) row.push('#ffffff'); // number circle
      else if (n === 9 && (y < 4 || y > 11)) row.push('#f4f4f4'); // stripe ball: white caps
      else row.push(color);
    }
    grid.push(row);
  }
  // Shine in the top-left.
  for (const [x, y] of [[3, 4], [4, 3], [4, 4]]) if (!(n === 9 && y < 4)) grid[y][x] = '#ffffff';
  DIGITS[n].forEach((line, dy) => line.split('').forEach((ch, dx) => ch === '#' && (grid[5 + dy][6 + dx] = '#111111')));
  return grid;
}

const OUTLINE = '#15131c';
const EYE = '#15131c';
const MOUTH = '#c2504d';
const PANTS = '#2d3142';
const SHOES = '#3b2a20';

/** A character as a grid of colors (null = transparent), with a 1px outline. */
export function presetPixels(index: number): (string | null)[][] {
  const preset = PRESETS[((index % PRESETS.length) + PRESETS.length) % PRESETS.length];
  // Balls get a lighter edge so the black 8 ball stands out on dark screens.
  if (preset[0] === 'ball') return outlined(ballPixels((preset as Ball)[1]), '#5b6170');
  const [style, hair, skin, shirt] = preset as Character;
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
  return outlined(grid);
}

/** Pads by one pixel and draws an outline around the shape. */
function outlined(grid: (string | null)[][], edge = OUTLINE): (string | null)[][] {
  const w = grid[0].length + 2;
  const h = grid.length + 2;
  const out: (string | null)[][] = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => grid[y - 1]?.[x - 1] ?? null));
  const filled = out.map((r) => r.map((c) => c !== null));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (filled[y][x]) continue;
      if (filled[y - 1]?.[x] || filled[y + 1]?.[x] || filled[y][x - 1] || filled[y][x + 1]) out[y][x] = edge;
    }
  }
  return out;
}

/** Default character for players who haven't picked one (stable per player; never a pool ball). */
export function defaultPreset(playerId: string): number {
  let h = 0;
  for (const ch of playerId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % FIRST_BALL;
}

/** Label for the picker. */
export function presetLabel(index: number): string {
  const p = PRESETS[index];
  return p[0] === 'ball' ? `${p[1]} ball` : `Character ${index + 1}`;
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
