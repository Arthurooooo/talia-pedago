// Cache à 3 étages :
//   1. mémoire (Map) — instant entre navigations
//   2. localStorage — survit aux reloads, taille limitée donc on persiste
//      seulement les "petites" requêtes (listes, pas chaque user individuel)
//   3. in-flight dedup — si 2 appels concurrent demandent la même donnée,
//      on partage la même promesse au lieu de double-fetch

const PREFIX = 'talia-pedago.cache.';

interface Entry<T> { value: T; expiresAt: number; fetchedAt: number }

const mem = new Map<string, Entry<any>>();
const inFlight = new Map<string, Promise<any>>();

interface CacheOpts {
  ttl: number;          // ms
  persist?: boolean;    // copie aussi dans localStorage
}

export async function cached<T>(
  key: string,
  opts: CacheOpts,
  fetcher: () => Promise<T>
): Promise<T> {
  const now = Date.now();

  // Mémoire
  const m = mem.get(key);
  if (m && m.expiresAt > now) return m.value as T;

  // localStorage
  if (opts.persist) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw) {
        const stored = JSON.parse(raw) as Entry<T>;
        if (stored.expiresAt > now) {
          mem.set(key, stored);
          return stored.value;
        }
        // Périmé : on nettoie
        localStorage.removeItem(PREFIX + key);
      }
    } catch { /* localStorage quota / parse fail : on ignore */ }
  }

  // In-flight
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

  // Fetch
  const p = (async () => {
    const value = await fetcher();
    const entry: Entry<T> = { value, expiresAt: now + opts.ttl, fetchedAt: Date.now() };
    mem.set(key, entry);
    if (opts.persist) {
      try { localStorage.setItem(PREFIX + key, JSON.stringify(entry)); }
      catch { /* quota dépassé : on garde en mémoire seulement */ }
    }
    return value;
  })().finally(() => inFlight.delete(key));

  inFlight.set(key, p);
  return p;
}

// Horodatage du dernier fetch d'une clé (pour afficher "à jour il y a X"). null si absent.
export function cachedAt(key: string): number | null {
  const m = mem.get(key);
  if (m) return m.fetchedAt ?? null;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw) return (JSON.parse(raw) as Entry<any>).fetchedAt ?? null;
  } catch {}
  return null;
}

export function invalidate(keyPrefix: string) {
  for (const k of Array.from(mem.keys())) {
    if (k.startsWith(keyPrefix)) mem.delete(k);
  }
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith(PREFIX + keyPrefix)) localStorage.removeItem(k);
    }
  } catch {}
}

export function clearAll() {
  mem.clear();
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith(PREFIX)) localStorage.removeItem(k);
    }
  } catch {}
}
