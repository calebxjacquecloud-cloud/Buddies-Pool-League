/** Player name normalization and "did you mean" matching. */

export function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}

/** Key used for exact-duplicate detection: case/spacing/punctuation-insensitive. */
export function nameKey(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** Existing players whose names look like `name` (typos, nicknames, initials). */
export function similarNames<T extends { display_name: string }>(name: string, players: T[]): T[] {
  const key = nameKey(name);
  if (key.length < 2) return [];
  const first = nameKey(name.split(' ')[0] ?? '');
  return players.filter((p) => {
    const other = nameKey(p.display_name);
    if (!other) return false;
    if (other === key) return true;
    if (key.length >= 3 && (other.startsWith(key) || key.startsWith(other))) return true;
    const otherFirst = nameKey(p.display_name.split(' ')[0] ?? '');
    if (first.length >= 3 && first === otherFirst) return true;
    const allowed = Math.max(a(key), a(other));
    return levenshtein(key, other) <= allowed;
  });
  function a(s: string) {
    return s.length <= 4 ? 1 : 2;
  }
}

/** Case-insensitive search for the registration picker. */
export function searchPlayers<T extends { display_name: string }>(query: string, players: T[]): T[] {
  const q = nameKey(query);
  if (!q) return players;
  return players
    .filter((p) => nameKey(p.display_name).includes(q) || p.display_name.toLowerCase().split(' ').some((w) => w.startsWith(query.toLowerCase().trim())))
    .sort((x, y) => {
      const ax = nameKey(x.display_name).startsWith(q) ? 0 : 1;
      const ay = nameKey(y.display_name).startsWith(q) ? 0 : 1;
      return ax - ay || x.display_name.localeCompare(y.display_name);
    });
}
