<script lang="ts">
  import Avatar from './Avatar.svelte';
  import type { BubbleClass, BubbleUser } from './types';
  import { fullName } from './types';

  let {
    klass,
    teacherName,
    teacherSeed = '',
    studentCount,
    studentNames,
    onClick,
  }: {
    klass: BubbleClass;
    teacherName: string;
    teacherSeed?: string;   // ID stable du prof → avatar constant d'une classe à l'autre
    studentCount: number;
    studentNames: string[];
    onClick: () => void;
  } = $props();

  const previewStudents = $derived(studentNames.slice(0, 6));
</script>

<button class="room" onclick={onClick}>
  <div class="nameplate">
    <span class="nameplate-text">{klass.name ?? 'Classe sans nom'}</span>
  </div>
  <div class="room-inner">
    <div class="teacher-area">
      <div class="chalkboard"></div>
      <div class="teacher">
        <Avatar name={teacherName || 'Prof'} seed={teacherSeed || teacherName || 'Prof'} size={28} teacher />
        <span class="teacher-name">{teacherName || '— pas de prof —'}</span>
      </div>
    </div>
    <div class="desks">
      {#each previewStudents as s, i (i + s)}
        <div class="desk">
          <Avatar name={s} size={18} />
        </div>
      {/each}
      {#if studentCount > previewStudents.length}
        <div class="desk more">+{studentCount - previewStudents.length}</div>
      {/if}
    </div>
  </div>
  <div class="footer">
    <span class="count">👥 {studentCount}</span>
    {#if klass.schoolDay}<span class="day">📅 {klass.schoolDay}</span>{/if}
  </div>
</button>

<style>
  .room {
    --floor: #e8d4b0;
    --floor-dark: #d6bd92;
    --wall: #f5ead3;
    --wall-dark: #c9b48a;
    --nameplate: #5e4632;

    display: flex;
    flex-direction: column;
    border: 0;
    padding: 0;
    cursor: pointer;
    text-align: left;
    background: var(--wall);
    border-radius: 6px;
    overflow: hidden;
    box-shadow:
      0 0 0 2px var(--wall-dark),
      0 4px 0 0 var(--wall-dark),
      0 6px 12px rgba(0,0,0,0.15);
    transition: transform 0.1s ease;
    image-rendering: pixelated;
    width: 260px;
    color: inherit;
  }
  .room:hover { transform: translateY(-2px); }
  .room:active { transform: translateY(1px); }

  .nameplate {
    background: var(--nameplate);
    color: #f7e7c8;
    padding: 5px 10px;
    border-bottom: 2px solid #3d2c1e;
    height: 44px;               /* hauteur fixe → toutes les cartes alignées, même sur 2 lignes */
    box-sizing: border-box;
    display: flex;
    align-items: center;
  }
  .nameplate-text {
    font: 700 10px "Press Start 2P", system-ui, sans-serif;
    letter-spacing: 0.03em;
    line-height: 1.35;
    display: -webkit-box;
    -webkit-line-clamp: 2;      /* coupe proprement à 2 lignes au lieu de pousser la carte */
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .room-inner {
    background:
      repeating-linear-gradient(0deg, var(--floor) 0 14px, var(--floor-dark) 14px 16px),
      repeating-linear-gradient(90deg, var(--floor) 0 14px, var(--floor-dark) 14px 16px);
    background-blend-mode: multiply;
    padding: 8px 10px 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 130px;
  }

  .teacher-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  .chalkboard {
    width: 80%;
    height: 14px;
    background: #2c5a3d;
    border: 2px solid #5e3a1c;
    border-radius: 2px;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.1);
  }
  .teacher {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .teacher-name {
    font-size: 9px;
    font-weight: 600;
    color: #5e4632;
    background: rgba(255,255,255,0.6);
    padding: 1px 5px;
    border-radius: 2px;
    max-width: 100%;
    text-align: center;
    line-height: 1.2;
    word-break: break-word;
    display: -webkit-box;
    -webkit-line-clamp: 2;       /* nom complet sur 2 lignes au lieu d'être tronqué */
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .desks {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    margin-top: auto;
  }
  .desk {
    background: #c08a5a;
    border: 1px solid #7e5530;
    border-radius: 2px;
    min-height: 36px;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding-top: 2px;
    box-shadow: inset 0 -2px 0 rgba(0,0,0,0.15);
    overflow: hidden;
  }
  .desk.more {
    background: #f5ead3;
    color: #5e4632;
    font: 700 10px system-ui, sans-serif;
    border: 1px dashed #7e5530;
    align-items: center;
    padding-top: 0;
  }

  .footer {
    display: flex;
    justify-content: space-between;
    padding: 4px 10px;
    background: var(--wall-dark);
    color: #3d2c1e;
    font: 600 11px system-ui, sans-serif;
  }

  /* Petite vie : les persos se balancent doucement, désynchronisés */
  @keyframes bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
  .teacher :global(.avatar), .desk :global(.avatar) {
    animation: bob 2.6s ease-in-out infinite;
    will-change: transform;
  }
  .teacher :global(.avatar) { animation-duration: 3.3s; }
  .desk:nth-child(1) :global(.avatar) { animation-delay: -0.2s; animation-duration: 2.7s; }
  .desk:nth-child(2) :global(.avatar) { animation-delay: -0.9s; animation-duration: 3.0s; }
  .desk:nth-child(3) :global(.avatar) { animation-delay: -1.5s; animation-duration: 2.4s; }
  .desk:nth-child(4) :global(.avatar) { animation-delay: -0.5s; animation-duration: 3.1s; }
  .desk:nth-child(5) :global(.avatar) { animation-delay: -1.9s; animation-duration: 2.8s; }
  .desk:nth-child(6) :global(.avatar) { animation-delay: -1.1s; animation-duration: 2.5s; }
  .room:hover .desk :global(.avatar) { animation-duration: 1.4s; }   /* s'agitent au survol */
  @media (prefers-reduced-motion: reduce) {
    .teacher :global(.avatar), .desk :global(.avatar) { animation: none; }
  }
</style>
