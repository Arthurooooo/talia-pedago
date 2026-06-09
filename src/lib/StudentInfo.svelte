<script lang="ts">
  import Avatar from './Avatar.svelte';
  import type { BubbleUser, Evaluation, Attendance, Contract } from './types';
  import { fullName, ageFrom, relativeTime, discoverableFields, gradeAverage,
           mentionFor, gradeBucket, attendanceStats, isRealNote } from './types';
  import { refreshUser, userCachedAt, getEvaluations, getAttendance, getContracts } from './bubble';

  // `sprites` = exactement le(s) PNG affiché(s) dans la classe (corps + bras, ou James).
  // `token` sert au refresh par élève ; `onUpdate` permet à la salle de resynchroniser sa map.
  let { user, sprites = [], token, onClose, onUpdate }:
    {
      user: BubbleUser | null; sprites?: string[]; token: string;
      onClose: () => void; onUpdate?: (u: BubbleUser) => void;
    } = $props();

  let shown = $state<BubbleUser | null>(null);
  let fetchedAt = $state<number | null>(null);
  let refreshing = $state(false);
  let showRaw = $state(false);
  let evals = $state<Evaluation[]>([]);
  let attendance = $state<Attendance[]>([]);
  let contracts = $state<Contract[]>([]);
  let dataLoading = $state(false);

  // Resynchronise l'affichage quand on sélectionne un autre élève.
  $effect(() => {
    shown = user;
    fetchedAt = user ? userCachedAt(user.id) : null;
    showRaw = false;
  });

  // Charge notes / assiduité / contrat de l'élève affiché (en parallèle, via cache).
  $effect(() => {
    const u = shown;
    if (!u) { evals = []; attendance = []; contracts = []; return; }
    const id = u.id;
    dataLoading = true;
    Promise.all([getEvaluations(token, id), getAttendance(token, id), getContracts(token, id)])
      .then(([e, a, c]) => { if (shown?.id === id) { evals = e; attendance = a; contracts = c; } })
      .catch(() => { /* échec silencieux par section */ })
      .finally(() => { if (shown?.id === id) dataLoading = false; });
  });

  // L'API range l'assiduité parmi les "evaluation" (assignmentType = 'assiduité').
  // On la sort des Notes (académique = quiz/devoir) pour la mettre dans Assiduité.
  const isAssiduity = (e: Evaluation) => (e.type ?? '').toLowerCase() === 'assiduité';
  const academic = $derived(evals.filter((e) => !isAssiduity(e)));
  const assiduityEvals = $derived(evals.filter(isAssiduity));

  const avg = $derived(gradeAverage(academic));
  const mention = $derived(avg ? mentionFor(avg.over20) : null);
  // Vraies notes (isRealNote exclut les quiz jamais passés stockés en 0/x) VS non notées.
  // Les non notées sont scindées par statut Bubble : 'rendu' = copie remise, en attente de
  // correction ; 'à faire' (ou autre) = travail pas encore fait. L'ancien libellé "à rendre"
  // était trompeur : la plupart sont DÉJÀ rendues, juste pas encore corrigées.
  const graded = $derived(academic.filter(isRealNote));
  const ungraded = $derived(academic.filter((e) => e.grade == null));
  const toGrade = $derived(ungraded.filter((e) => (e.status ?? '').toLowerCase() === 'rendu'));
  const toDo = $derived(ungraded.filter((e) => (e.status ?? '').toLowerCase() !== 'rendu'));

  const att = $derived(attendanceStats(attendance));
  const assiduityGraded = $derived(assiduityEvals.filter(isRealNote));
  const assiduityAvg = $derived(gradeAverage(assiduityEvals));

  function typeLabel(t?: string): string {
    if (!t) return 'Évaluation';
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  function photoUrl(p?: string): string | null {
    if (!p) return null;
    return p.startsWith('//') ? 'https:' + p : p;
  }

  async function refresh() {
    if (!shown || refreshing) return;
    refreshing = true;
    try {
      const u = await refreshUser(token, shown.id);
      if (u) { shown = u; onUpdate?.(u); }
      fetchedAt = userCachedAt(shown.id);
    } finally { refreshing = false; }
  }

  const age = $derived(ageFrom(shown?.birthDate));
  const photo = $derived(photoUrl(shown?.profilePicture));
  const rawFields = $derived(showRaw ? discoverableFields(shown?.raw) : []);
</script>

{#if shown}
  {@const u = shown}
  <aside class="panel">
    <button class="close" onclick={onClose} title="Fermer">×</button>

    <div class="hero">
      {#if sprites.length}
        <div class="portrait">
          {#each sprites as src, i}<img src={src} alt="" class:base={i === 0} />{/each}
          {#if photo}<img class="photo" src={photo} alt="" onerror={(e) => (e.currentTarget as HTMLImageElement).style.display = 'none'} />{/if}
        </div>
      {:else}
        <Avatar name={fullName(u)} size={64} />
      {/if}
      <div class="ident">
        <div class="name">{fullName(u)}</div>
        {#if u.studentStatus}<span class="status">{u.studentStatus}</span>{/if}
        {#if !u.studentStatus && u.leadStatus}<span class="status lead">{u.leadStatus}</span>{/if}
      </div>
    </div>

    <div class="bar">
      <button class="refresh" onclick={refresh} disabled={refreshing} title="Rafraîchir les infos de cet élève">
        {refreshing ? '…' : '↻'} Actualiser
      </button>
      {#if fetchedAt}<span class="fresh">à jour {relativeTime(fetchedAt)}</span>{/if}
    </div>

    <dl class="fields">
      {#if age != null}<div><dt>Âge</dt><dd>{age} ans{#if u.birthDate} <span class="sub">({new Date(u.birthDate).toLocaleDateString('fr-FR')})</span>{/if}</dd></div>{/if}
      {#if u.email}<div><dt>Email</dt><dd><a href={`mailto:${u.email}`}>{u.email}</a></dd></div>{/if}
      {#if u.phoneNumber}<div><dt>Téléphone</dt><dd><a href={`tel:${u.phoneNumber}`}>{u.phoneNumber}</a></dd></div>{/if}
      {#if u.role}<div><dt>Rôle</dt><dd>{u.role}</dd></div>{/if}
      {#if u.createdDate}<div><dt>Inscrit le</dt><dd>{new Date(u.createdDate).toLocaleDateString('fr-FR')}</dd></div>{/if}
      <div><dt>ID</dt><dd class="mono">{u.id}</dd></div>
    </dl>

    <!-- Notes / évaluations -->
    <section class="block">
      <h3>📊 Notes {#if mention}<span class="mention {mention.tone}">{mention.emoji} {mention.label}</span>{/if}</h3>
      {#if dataLoading && !evals.length}
        <p class="muted">Chargement…</p>
      {:else if avg}
        <div class="score">
          <div class="score-num">{String(avg.over20).replace('.', ',')}<small>/20</small></div>
          <div class="score-bar"><div class="fill {mention?.tone}" style="width:{avg.pct}%"></div></div>
          <div class="score-sub">{avg.pct}% · {avg.n} note{avg.n > 1 ? 's' : ''}</div>
        </div>
        <ul class="grades">
          {#each graded.slice(0, 6) as e}
            {@const ratio = e.grade! / e.maxGrade!}
            <li class={gradeBucket(ratio)}>
              <div class="g-fill" style="width:{Math.round(ratio * 100)}%"></div>
              <span class="g-name">{typeLabel(e.type)}{#if e.trimester} · T{e.trimester}{/if}</span>
              <span class="g-val">{String(e.grade).replace('.', ',')}/{e.maxGrade}</span>
            </li>
          {/each}
        </ul>
        {#if graded.length > 6}<p class="muted">+ {graded.length - 6} autre{graded.length - 6 > 1 ? 's' : ''} note{graded.length - 6 > 1 ? 's' : ''}</p>{/if}
      {:else}
        <p class="muted">Pas encore de note. 🌱</p>
      {/if}
      {#if toDo.length || toGrade.length}
        <div class="todos">
          {#if toDo.length}<span class="todo">📝 {toDo.length} à faire</span>{/if}
          {#if toGrade.length}<span class="todo wait">🕓 {toGrade.length} en attente de correction</span>{/if}
        </div>
      {/if}
    </section>

    <!-- Assiduité (présence par séance + notes d'assiduité /20) -->
    {#if att.total || assiduityEvals.length}
      <section class="block">
        <h3>🎯 Assiduité {#if att.recorded}<span class="mention {att.tone}">{att.emoji} {Math.round(att.rate * 100)}%</span>{/if}</h3>
        {#if att.recorded}
          <div class="score-bar att"><div class="fill {att.tone}" style="width:{Math.round(att.rate * 100)}%"></div></div>
          <div class="chips">
            <span class="chip ok">✅ {att.present} présent{att.present > 1 ? 's' : ''}</span>
            {#if att.late}<span class="chip mid">⏱️ {att.late} retard{att.late > 1 ? 's' : ''}</span>{/if}
            {#if att.absent}<span class="chip bad">❌ {att.absent} absent{att.absent > 1 ? 's' : ''}</span>{/if}
          </div>
          {#if att.unrecorded}<p class="muted">+ {att.unrecorded} séance{att.unrecorded > 1 ? 's' : ''} non renseignée{att.unrecorded > 1 ? 's' : ''}</p>{/if}
        {:else if att.total}
          <p class="muted">{att.total} séance{att.total > 1 ? 's' : ''} suivie{att.total > 1 ? 's' : ''}, aucune renseignée.</p>
        {/if}

        {#if assiduityGraded.length}
          <div class="ass-notes">
            <div class="ass-h">Notes d'assiduité{#if assiduityAvg} <span class="mention {mentionFor(assiduityAvg.over20).tone}">{String(assiduityAvg.over20).replace('.', ',')}/20</span>{/if}</div>
            <div class="chips">
              {#each assiduityGraded as e (e.id)}
                {@const r = e.grade! / e.maxGrade!}
                <span class="chip {gradeBucket(r)}">{#if e.trimester}T{e.trimester} · {/if}{String(e.grade).replace('.', ',')}/{e.maxGrade}</span>
              {/each}
            </div>
          </div>
        {/if}
      </section>
    {/if}

    <!-- Contrat (alternance) -->
    {#if contracts.length}
      <section class="block">
        <h3>🤝 Contrat</h3>
        {#each contracts.slice(0, 2) as c}
          <div class="contract">
            <div class="c-top">{c.companyName || 'Entreprise'}{#if c.status} <span class="status sm">{c.status}</span>{/if}</div>
            {#if c.startDate}<div class="muted">{new Date(c.startDate).toLocaleDateString('fr-FR')}{#if c.endDate} → {new Date(c.endDate).toLocaleDateString('fr-FR')}{/if}</div>{/if}
          </div>
        {/each}
      </section>
    {/if}

    {#if u.raw}
      <details class="discover" bind:open={showRaw}>
        <summary>Tous les champs Bubble (découverte)</summary>
        <p class="hint">Pour repérer les vrais noms de champs (notes, âge…) à intégrer proprement.</p>
        <dl class="raw">
          {#each rawFields as [k, v]}<div><dt>{k}</dt><dd>{v}</dd></div>{/each}
        </dl>
      </details>
    {/if}
  </aside>
{/if}

<style>
  .panel {
    position: fixed;
    top: 52px; right: 0; bottom: 0;
    width: 320px;
    background: #fff8ec;
    border-left: 3px solid #5e4632;
    box-shadow: -6px 0 12px rgba(0,0,0,0.2);
    padding: 20px;
    overflow-y: auto;
    z-index: 900;
    animation: slide-in 0.2s ease-out;
    color: #3d2c1e;
  }
  @keyframes slide-in {
    from { transform: translateX(20px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  .close {
    position: absolute;
    top: 8px; right: 8px;
    width: 28px; height: 28px;
    border: 0; background: #5e4632; color: #f7e7c8;
    border-radius: 50%; cursor: pointer; font-size: 16px;
  }
  .close:hover { background: #3d2c1e; }
  .hero { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; }
  .ident { min-width: 0; }
  .portrait { position: relative; flex: none; height: 96px; display: flex; align-items: flex-end;
    background: #efe0c4; border: 2px solid #c9b48a; border-radius: 8px; padding: 6px 10px; }
  .portrait img { height: 90px; width: auto; image-rendering: pixelated; display: block; }
  .portrait img.base { position: relative; }
  .portrait img:not(.base):not(.photo) { position: absolute; left: 10px; bottom: 6px; }
  /* vraie photo de profil Bubble, en pastille sur le coin du portrait pixel */
  .portrait img.photo { position: absolute; top: -6px; right: -8px; width: 34px; height: 34px;
    border-radius: 50%; border: 2px solid #fff8ec; object-fit: cover; image-rendering: auto;
    box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
  .name { font: 700 16px system-ui, sans-serif; }
  .status {
    display: inline-block; margin-top: 4px; padding: 2px 8px;
    background: #3b82f6; color: white; border-radius: 999px; font-size: 11px; font-weight: 700;
  }
  .status.lead { background: #6b6f7d; }
  .bar { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
  .refresh {
    background: #5e4632; color: #f7e7c8; border: 0; padding: 5px 12px; border-radius: 6px;
    cursor: pointer; font: 700 11px system-ui; box-shadow: 0 2px 0 #3d2c1e;
  }
  .refresh:hover:not(:disabled) { background: #3d2c1e; }
  .refresh:disabled { opacity: 0.6; cursor: wait; }
  .fresh { font-size: 11px; color: #9b7b50; }
  .fields { margin: 0; }
  .fields > div { padding: 6px 0; border-top: 1px dashed #c9b48a; }
  dt { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #7e5530; }
  dd { margin: 2px 0 0 0; font-size: 13px; }
  dd a { color: #2262a8; }
  .sub { color: #9b7b50; font-size: 11px; }
  .mono { font-family: ui-monospace, Menlo, monospace; font-size: 11px; word-break: break-all; }
  .block { margin-top: 14px; border-top: 2px solid #c9b48a; padding-top: 8px; }
  .block h3 { margin: 0 0 6px; font: 700 12px system-ui; color: #5e4632; display: flex; align-items: center; gap: 8px; }
  .muted { color: #9b7b50; font-size: 11px; margin: 2px 0; }

  /* Pastille mention/score (gamifiée) */
  .mention { padding: 2px 9px; border-radius: 999px; font: 800 11px system-ui; color: #fff; }
  .mention.gold  { background: linear-gradient(90deg,#d99a16,#f0c040); color: #4a3410; }
  .mention.green { background: #5e9a52; }
  .mention.blue  { background: #3b82f6; }
  .mention.amber { background: #e08a2b; }
  .mention.red   { background: #c0584f; }

  /* Score "XP" */
  .score { display: grid; grid-template-columns: auto 1fr; grid-template-areas: 'num bar' 'num sub'; gap: 1px 10px; align-items: center; margin: 2px 0 8px; }
  .score-num { grid-area: num; font: 800 26px system-ui; color: #3d2c1e; line-height: 1; }
  .score-num small { font-size: 12px; color: #9b7b50; font-weight: 700; }
  .score-sub { grid-area: sub; font-size: 11px; color: #9b7b50; }
  .score-bar { grid-area: bar; height: 9px; background: #e3d4b6; border-radius: 999px; overflow: hidden; box-shadow: inset 0 1px 2px rgba(0,0,0,0.15); }
  .score-bar.att { margin: 2px 0 8px; }
  .fill { height: 100%; border-radius: 999px; transition: width 0.5s ease; }
  .fill.gold  { background: linear-gradient(90deg,#d99a16,#f0c040); }
  .fill.green { background: linear-gradient(90deg,#4f8a45,#79c267); }
  .fill.blue  { background: linear-gradient(90deg,#2f6fd6,#5ba0f6); }
  .fill.amber { background: linear-gradient(90deg,#c8761f,#f0a94e); }
  .fill.red   { background: linear-gradient(90deg,#a8463d,#d9756b); }

  /* Liste de notes : barre de remplissage derrière chaque ligne */
  .grades { list-style: none; margin: 0; padding: 0; }
  .grades li { position: relative; display: flex; justify-content: space-between; gap: 8px; align-items: center;
    padding: 5px 8px; margin-top: 4px; border-radius: 6px; background: #f3e7cd; overflow: hidden; font-size: 12px; }
  .g-fill { position: absolute; inset: 0; right: auto; opacity: 0.22; z-index: 0; }
  .grades li.ok  .g-fill { background: #5e9a52; }
  .grades li.mid .g-fill { background: #e08a2b; }
  .grades li.bad .g-fill { background: #c0584f; }
  .g-name { position: relative; z-index: 1; color: #5e4632; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .g-val { position: relative; z-index: 1; font-weight: 800; white-space: nowrap; }
  .grades li.ok  .g-val { color: #2f6b22; }
  .grades li.mid .g-val { color: #9a5a12; }
  .grades li.bad .g-val { color: #8a2a2a; }

  .todos { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .todo { background: #eef3fb; border: 1px dashed #9db8e0; color: #2f5a96;
    border-radius: 6px; padding: 5px 9px; font: 700 11px system-ui; }
  .todo.wait { background: #f6efe1; border-color: #d8c39a; color: #8a6a2a; }

  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { border-radius: 999px; padding: 2px 9px; font: 700 11px system-ui; border: 1px solid #c9b48a; background: #efe0c4; }
  .chip.ok  { background: #d8efcf; border-color: #9cc78c; color: #2f6b22; }
  .chip.mid { background: #fbeccd; border-color: #e3c184; color: #9a5a12; }
  .chip.bad { background: #f5d8d4; border-color: #dfa39c; color: #8a2a2a; }
  .ass-notes { margin-top: 9px; }
  .ass-h { font: 700 11px system-ui; color: #7e5530; margin-bottom: 5px; display: flex; align-items: center; gap: 7px; }
  .contract { padding: 4px 0; }
  .c-top { font-weight: 700; font-size: 13px; }
  .status.sm { font-size: 10px; padding: 1px 6px; background: #7e5530; }
  .discover { margin-top: 14px; border-top: 2px solid #c9b48a; padding-top: 8px; }
  .discover summary { cursor: pointer; font: 700 11px system-ui; color: #7e5530; }
  .discover .hint { font-size: 10px; color: #9b7b50; margin: 4px 0 8px; }
  .raw > div { padding: 4px 0; border-top: 1px dotted #d8c39a; }
  .raw dd { font-size: 11px; word-break: break-word; }
</style>
