<script lang="ts">
  import { onMount } from 'svelte';
  import RoomCard from './RoomCard.svelte';
  import type { BubbleClass, BubbleUser } from './types';
  import { fullName, classStatus } from './types';
  import { listActiveClasses, getClassPreview, getUsers } from './bubble';
  import { invalidate as invalidateCache } from './cache';

  let { token, onPick }: { token: string; onPick: (k: BubbleClass, teacher: BubbleUser | null) => void } = $props();

  let classes = $state<BubbleClass[]>([]);
  let teachers = $state(new Map<string, BubbleUser>());
  let memberCounts = $state(new Map<string, number>());
  let memberNames = $state(new Map<string, string[]>());
  let loading = $state(true);
  let error = $state<string | null>(null);
  let query = $state('');
  let view = $state<'active' | 'upcoming' | 'all'>('active');   // par défaut : seulement les classes en cours

  async function load() {
    loading = true;
    error = null;
    try {
      const cs = await listActiveClasses(token);
      classes = cs;
      // Le PROF = 1er de `teachers` (le "responsable pédago" = classManager, qu'on n'affiche pas).
      const teacherIds = cs.map((c) => c.teacherIds?.[0] ?? c.classManagerId).filter(Boolean) as string[];
      teachers = await getUsers(token, teacherIds);
    } catch (e: any) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  async function refresh() {
    // Invalide TOUT le cache (classes, membres, users, séances) et recharge.
    invalidateCache('');
    memberCounts = new Map();
    memberNames = new Map();
    teachers = new Map();
    await load();
  }

  onMount(load);

  // Pour chaque classe affichée, on récupère le compte d'élèves au fil de l'eau.
  // Stratégie : on charge lazy en arrière-plan, classe par classe, sans bloquer l'UI.
  $effect(() => {
    if (!classes.length) return;
    let cancelled = false;
    (async () => {
      for (const c of classes) {
        if (cancelled) return;
        if (memberCounts.has(c.id)) continue;
        try {
          const { count, names } = await getClassPreview(token, c.id);   // persisté → instantané au retour
          if (cancelled) return;
          memberCounts.set(c.id, count);
          memberNames.set(c.id, names);
          memberCounts = new Map(memberCounts);
          memberNames = new Map(memberNames);
        } catch (_) {
          memberCounts.set(c.id, 0);
          memberCounts = new Map(memberCounts);
        }
      }
    })();
    return () => { cancelled = true; };
  });

  // Compte par statut (pour les libellés des onglets).
  const counts = $derived.by(() => {
    const c = { active: 0, upcoming: 0, ended: 0 };
    for (const k of classes) c[classStatus(k)]++;
    return c;
  });

  const filtered = $derived(
    classes.filter((c) => {
      if (view !== 'all' && classStatus(c) !== view) return false;
      return !query.trim() || (c.name ?? '').toLowerCase().includes(query.toLowerCase());
    })
  );
</script>

<div class="school">
  <header class="topbar">
    <div class="logo">🏫 Talia Pédago</div>
    <input class="search" type="text" placeholder="Filtrer une classe…" bind:value={query} />
    <div class="seg" role="tablist">
      <button class:on={view === 'active'} onclick={() => (view = 'active')} title="Classes en cours">En cours ({counts.active})</button>
      <button class:on={view === 'upcoming'} onclick={() => (view = 'upcoming')} title="Classes pas encore démarrées">À venir ({counts.upcoming})</button>
      <button class:on={view === 'all'} onclick={() => (view = 'all')} title="Toutes les classes">Toutes</button>
    </div>
    <button class="refresh" onclick={refresh} title="Rafraîchir les données (vide le cache)" disabled={loading}>
      {loading ? '…' : '↻'}
    </button>
    <span class="count">{filtered.length} classe{filtered.length > 1 ? 's' : ''}</span>
  </header>

  {#if loading}
    <div class="hint">Chargement de l'école…</div>
  {:else if error}
    <div class="error">⚠️ {error}</div>
  {:else if !filtered.length}
    <div class="hint">
      {#if view === 'active'}Aucune classe en cours.{:else if view === 'upcoming'}Aucune classe à venir.{:else}Aucune classe.{/if}
      {#if query.trim()} (filtre « {query} »){/if}
    </div>
  {:else}
    <div class="map">
      {#each filtered as c (c.id)}
        {@const tid = c.teacherIds?.[0] ?? c.classManagerId ?? null}
        {@const t = tid ? teachers.get(tid) ?? null : null}
        <RoomCard
          klass={c}
          teacherName={t ? fullName(t) : ''}
          teacherSeed={tid ?? ''}
          studentCount={memberCounts.get(c.id) ?? 0}
          studentNames={memberNames.get(c.id) ?? []}
          onClick={() => onPick(c, t)}
        />
      {/each}
    </div>
  {/if}
</div>

<style>
  .school {
    min-height: 100vh;
    background:
      repeating-linear-gradient(0deg, #91c5b5 0 60px, #7eb09f 60px 62px),
      repeating-linear-gradient(90deg, #91c5b5 0 60px, #7eb09f 60px 62px);
    background-blend-mode: multiply;
    image-rendering: pixelated;
  }
  .topbar {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 12px 24px;
    background: #5e4632;
    border-bottom: 4px solid #3d2c1e;
    color: #f7e7c8;
  }
  .logo {
    font: 700 16px system-ui, sans-serif;
    letter-spacing: 0.02em;
  }
  .search {
    flex: 1;
    max-width: 360px;
    background: #f7e7c8;
    border: 0;
    border-radius: 6px;
    padding: 7px 12px;
    font-size: 13px;
    color: #3d2c1e;
    box-shadow: inset 0 1px 3px rgba(0,0,0,0.15);
  }
  .search:focus { outline: 2px solid #f5cf6a; }
  .count {
    background: #f7e7c8;
    color: #3d2c1e;
    padding: 3px 10px;
    border-radius: 999px;
    font: 700 11px system-ui, sans-serif;
  }
  .seg { display: flex; gap: 2px; background: #3d2c1e; border-radius: 7px; padding: 2px; }
  .seg button {
    border: 0; background: transparent; color: #e8d4b0; cursor: pointer;
    font: 700 11px system-ui, sans-serif; padding: 5px 10px; border-radius: 5px;
  }
  .seg button:hover { color: #fff8ec; }
  .seg button.on { background: #f5cf6a; color: #3d2c1e; }
  .refresh {
    background: #f7e7c8;
    color: #3d2c1e;
    border: 0;
    width: 30px; height: 30px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 700;
    box-shadow: 0 2px 0 #3d2c1e;
  }
  .refresh:hover:not(:disabled) { background: #fff8ec; }
  .refresh:disabled { opacity: 0.5; cursor: wait; box-shadow: 0 1px 0 #3d2c1e; }
  .map {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 28px;
    padding: 32px;
    max-width: 1400px;
    margin: 0 auto;
    justify-items: center;
    align-items: start;          /* pas d'étirement vertical → plus de marge bizarre en bas */
  }
  .hint, .error {
    text-align: center;
    padding: 40px;
    color: #f7e7c8;
    font: 700 14px system-ui, sans-serif;
  }
  .error { color: #ffb4b4; }
</style>
