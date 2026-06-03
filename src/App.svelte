<script lang="ts">
  import { onMount } from 'svelte';
  import TokenSetup from './lib/TokenSetup.svelte';
  import SchoolMap from './lib/SchoolMap.svelte';
  import ClassRoom from './lib/ClassRoom.svelte';
  import type { BubbleClass, BubbleUser } from './lib/types';
  import { clearAll as clearCache } from './lib/cache';

  let token = $state<string | null>(null);
  let selected = $state<{ klass: BubbleClass; teacher: BubbleUser | null } | null>(null);

  onMount(() => {
    const t = localStorage.getItem('talia-pedago.token');
    if (t) token = t;
  });

  function saveToken(t: string) {
    localStorage.setItem('talia-pedago.token', t);
    token = t;
  }

  function logout() {
    localStorage.removeItem('talia-pedago.token');
    clearCache();
    token = null;
    selected = null;
  }
</script>

<div class="mobile-guard">
  <div>
    <h1>🏫</h1>
    <p>Talia Pédago est conçu pour un écran de bureau.<br />Ouvre-le depuis ton ordi.</p>
  </div>
</div>

<main>
  {#if !token}
    <TokenSetup onSave={saveToken} />
  {:else if selected}
    <ClassRoom
      klass={selected.klass}
      teacher={selected.teacher}
      {token}
      onBack={() => (selected = null)}
    />
  {:else}
    <SchoolMap
      {token}
      onPick={(k, t) => (selected = { klass: k, teacher: t })}
    />
    <button class="logout" onclick={logout} title="Changer de token">🔑</button>
  {/if}
</main>

<style>
  main { display: contents; }
  .mobile-guard {
    display: none;
    position: fixed;
    inset: 0;
    background: #5e4632;
    color: #f7e7c8;
    z-index: 1000;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 30px;
  }
  .mobile-guard h1 { font-size: 64px; margin: 0 0 12px; }
  .mobile-guard p { font: 600 14px system-ui, sans-serif; line-height: 1.5; }
  @media (max-width: 720px) {
    .mobile-guard { display: flex; }
  }
  .logout {
    position: fixed;
    bottom: 14px;
    right: 14px;
    width: 40px; height: 40px;
    background: #5e4632;
    color: #f7e7c8;
    border: 0;
    border-radius: 50%;
    cursor: pointer;
    font-size: 16px;
    box-shadow: 0 3px 0 #3d2c1e, 0 6px 14px rgba(0,0,0,0.2);
    z-index: 20;
  }
  .logout:hover { background: #6a503b; }
</style>
