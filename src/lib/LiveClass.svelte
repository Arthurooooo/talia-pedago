<script lang="ts">
  import type { BubbleUser, ScheduledClass, ClassSlot } from './types';
  import { computeLive, commonPrefix, fmtTime, humanCountdown, statusTone, fullName } from './types';
  import { scheduledClassesForClass, getUsers } from './bubble';

  // Bandeau "cours en cours / prochain cours / planning du jour" pour la classe affichée.
  // Détection par HORAIRE (le statut Bubble est posé après coup, jamais 'En cours').
  // Les spécialités parallèles (même créneau) sont regroupées.
  let { token, classId, teacherFallback = null }:
    { token: string; classId: string; teacherFallback?: BubbleUser | null } = $props();

  let list = $state<ScheduledClass[]>([]);
  let teachers = $state(new Map<string, BubbleUser>());
  let now = $state(Date.now());
  let expanded = $state(false);
  let loaded = $state(false);

  // Début de journée locale, stable sur la journée → clé de cache stable (pas de refetch à chaque tick).
  function startOfTodayISO(): string {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString();
  }

  async function load() {
    try {
      list = await scheduledClassesForClass(token, classId, startOfTodayISO());
    } catch { /* silencieux : pas de planning n'est pas une erreur bloquante */ }
    finally { loaded = true; }
  }

  $effect(() => {
    load();
    const tick = setInterval(() => (now = Date.now()), 30_000);          // recalcule en cours / compte à rebours
    const refetch = setInterval(load, 5 * 60_000);                        // resynchronise avec Bubble (TTL 5 min)
    return () => { clearInterval(tick); clearInterval(refetch); };
  });

  const live = $derived(computeLive(list, now));

  // Résout les noms des profs des séances du jour (best-effort, via cache users).
  $effect(() => {
    const ids = [...new Set(live.today.flatMap((s) => s.sessions.map((x) => x.teacherId)).filter(Boolean) as string[])]
      .filter((id) => !teachers.has(id));
    if (!ids.length) return;
    getUsers(token, ids).then((m) => { if (m.size) teachers = new Map([...teachers, ...m]); }).catch(() => {});
  });

  function teacherName(s: ScheduledClass): string {
    const u = s.teacherId ? teachers.get(s.teacherId) : null;
    if (u) return fullName(u);
    if (teacherFallback) return fullName(teacherFallback);
    return '';
  }
  function kind(s: ScheduledClass): string {
    if (s.isOneToOne) return 'Individuel';
    if (s.isPracticalWork) return 'TP';
    return 'Cours';
  }
  function clean(name?: string): string {
    return (name || 'Séance').trim().replace(/\s{2,}/g, ' ');
  }
  // Intitulé du créneau : la séance unique, ou "N spécialités en parallèle".
  function slotTitle(slot: ClassSlot): string {
    return slot.sessions.length === 1
      ? clean(slot.sessions[0].name)
      : `${slot.sessions.length} spécialités en parallèle`;
  }
  // Intitulés courts des spés d'un créneau : on retire la racine commune jusqu'au
  // dernier " - " (on garde donc le bloc : "… - Bloc 1.2 : X" → "Bloc 1.2 : X").
  function shortNames(slot: ClassSlot): string[] {
    const names = slot.sessions.map((s) => clean(s.name));
    const pre = commonPrefix(names);
    let cut = 0;
    if (pre.length > 6) {
      const sep = pre.lastIndexOf(' - ');
      cut = sep >= 0 ? sep + 3 : pre.replace(/[\s:–-]*$/, '').length;
    }
    return names.map((n) => (cut ? n.slice(cut).replace(/^[\s:–-]*/, '') : n) || n);
  }
</script>

{#if loaded && live.today.length}
  {@const banner = live.ongoing ?? live.next}
  <div class="live">
    {#if live.ongoing}
      {@const s = live.ongoing}
      <div class="strip on">
        <span class="dot" aria-hidden="true"></span>
        <div class="main">
          <div class="row1">
            <strong class="tag">EN DIRECT</strong>
            <span class="title" title={slotTitle(s)}>{slotTitle(s)}</span>
            {#if s.sessions.length === 1}<span class="badge">{kind(s.sessions[0])}</span>{:else}<span class="badge">{s.sessions.length} spés</span>{/if}
            {#if s.participants}<span class="badge soft">{s.participants} part.</span>{/if}
          </div>
          <div class="row2">
            <span>{fmtTime(s.startTime)}–{fmtTime(s.endTime)}</span>
            {#if s.sessions.length === 1 && teacherName(s.sessions[0])}<span>· {teacherName(s.sessions[0])}</span>{/if}
            <span class="rem">· se termine dans {humanCountdown(new Date(s.endTime ?? 0).getTime() - now)}</span>
          </div>
        </div>
        {#if s.sessions.length === 1 && s.sessions[0].url}<a class="join" href={s.sessions[0].url} target="_blank" rel="noopener">Salle ↗</a>{/if}
      </div>
    {:else if live.next}
      {@const s = live.next}
      <div class="strip next">
        <span class="clock" aria-hidden="true">🕑</span>
        <div class="main">
          <div class="row1">
            <strong class="tag soft">PROCHAIN</strong>
            <span class="title" title={slotTitle(s)}>{slotTitle(s)}</span>
            {#if s.sessions.length === 1}<span class="badge">{kind(s.sessions[0])}</span>{:else}<span class="badge">{s.sessions.length} spés</span>{/if}
          </div>
          <div class="row2">
            <span>à {fmtTime(s.startTime)}</span>
            {#if s.sessions.length === 1 && teacherName(s.sessions[0])}<span>· {teacherName(s.sessions[0])}</span>{/if}
            <span class="rem">· dans {humanCountdown(new Date(s.startTime ?? 0).getTime() - now)}</span>
          </div>
        </div>
      </div>
    {:else}
      <div class="strip done">
        <span class="clock" aria-hidden="true">✓</span>
        <span class="main done-txt">Cours terminés pour aujourd'hui</span>
      </div>
    {/if}

    <button class="toggle" onclick={() => (expanded = !expanded)} aria-expanded={expanded}>
      Planning du jour ({live.today.length} créneau{live.today.length > 1 ? 'x' : ''}) {expanded ? '▾' : '▸'}
    </button>

    {#if expanded}
      <ul class="day">
        {#each live.today as slot (slot.key)}
          {@const isOn = banner === slot && !!live.ongoing}
          {@const labels = shortNames(slot)}
          <li class:ongoing={isOn}>
            <div class="slot-head">
              <span class="t">{fmtTime(slot.startTime)}</span>
              <span class="n" title={slotTitle(slot)}>{slotTitle(slot)}</span>
              {#if isOn}<span class="st live-st">● en cours</span>
              {:else if slot.sessions.length === 1}<span class="st {statusTone(slot.sessions[0].status)}">{slot.sessions[0].status ?? '—'}</span>{/if}
            </div>
            {#if slot.sessions.length > 1}
              <ul class="specs">
                {#each slot.sessions as sp, i (sp.id)}
                  <li>
                    <span class="sp-n" title={clean(sp.name)}>{labels[i]}</span>
                    {#if teacherName(sp)}<span class="sp-tch">{teacherName(sp)}</span>{/if}
                    {#if sp.participantsCount}<span class="sp-p">{sp.participantsCount}👤</span>{/if}
                    <span class="st {statusTone(sp.status)}">{sp.status ?? '—'}</span>
                    {#if sp.url}<a class="sp-join" href={sp.url} target="_blank" rel="noopener">↗</a>{/if}
                  </li>
                {/each}
              </ul>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}

<style>
  .live { padding: 6px 14px 0; background: #efe0c4; border-bottom: 2px solid #c9b48a; }
  .strip { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-radius: 8px; }
  .strip.on { background: linear-gradient(90deg, #5b1d1d, #7a2a2a); color: #ffe9e0; box-shadow: 0 2px 0 #3d1313; }
  .strip.next { background: #fff8ec; color: #3d2c1e; border: 1px solid #c9b48a; }
  .strip.done { background: #e3d4b6; color: #7e5530; }
  .main { flex: 1; min-width: 0; }
  .row1 { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .row2 { display: flex; flex-wrap: wrap; gap: 6px; font-size: 11px; opacity: 0.92; margin-top: 1px; }
  .title { font-weight: 700; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .tag { font: 800 10px system-ui; letter-spacing: 0.08em; background: #ff5252; color: #fff;
         padding: 2px 7px; border-radius: 4px; flex: none; }
  .tag.soft { background: #5e9a52; }
  .badge { font: 700 10px system-ui; padding: 1px 7px; border-radius: 999px; background: rgba(0,0,0,0.18); flex: none; }
  .strip.next .badge { background: #e3d4b6; color: #5e4632; }
  .badge.soft { opacity: 0.85; }
  .rem { font-weight: 700; }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: #ff5252; flex: none;
         box-shadow: 0 0 0 0 rgba(255,82,82,0.7); animation: pulse 1.4s infinite; }
  @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(255,82,82,0.7); } 70% { box-shadow: 0 0 0 8px rgba(255,82,82,0); } 100% { box-shadow: 0 0 0 0 rgba(255,82,82,0); } }
  .clock { font-size: 16px; flex: none; }
  .done-txt { font: 600 12px system-ui; }
  .join { flex: none; background: #ffd9cf; color: #5b1d1d; text-decoration: none; font: 800 11px system-ui;
          padding: 5px 11px; border-radius: 6px; }
  .join:hover { background: #fff; }
  .toggle { background: none; border: 0; color: #7e5530; font: 700 11px system-ui; cursor: pointer;
            padding: 5px 2px 7px; }
  .toggle:hover { color: #3d2c1e; }
  .day { list-style: none; margin: 0 0 8px; padding: 0; border-top: 1px dashed #c9b48a; }
  .day > li { padding: 4px 4px; border-bottom: 1px dotted #d8c39a; }
  .day > li.ongoing { background: #fff3ef; border-radius: 5px; }
  .slot-head { display: flex; align-items: center; gap: 9px; font-size: 12px; }
  .t { font-weight: 700; color: #5e4632; flex: none; width: 42px; }
  .n { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #3d2c1e; }
  .specs { list-style: none; margin: 3px 0 1px 51px; padding: 0; }
  .specs li { display: flex; align-items: center; gap: 7px; padding: 2px 0; font-size: 11px; }
  .sp-n { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #5e4632; }
  .sp-tch { color: #7e5530; flex: none; }
  .sp-p { color: #9b7b50; flex: none; }
  .sp-join { flex: none; text-decoration: none; color: #2262a8; font-weight: 800; }
  .st { font: 700 10px system-ui; padding: 1px 7px; border-radius: 999px; flex: none; }
  .st.ok { background: #d8efcf; color: #2f6b22; }
  .st.bad { background: #f3d4d4; color: #8a2a2a; }
  .st.soft { background: #e8dcc2; color: #7e5530; }
  .st.live-st { background: #ff5252; color: #fff; }
</style>
