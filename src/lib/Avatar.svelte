<script lang="ts">
  import { avatarSVG, teacherSVG } from './avatar';
  // `name` = libellé affiché ; `seed` = graine d'apparence (ID stable) si fournie,
  // pour qu'un même individu garde le même avatar même si son nom se résout en retard.
  let { name, size = 40, teacher = false, seed = undefined }:
    { name: string; size?: number; teacher?: boolean; seed?: string } = $props();
  const key = $derived(seed && seed.trim() ? seed : name);
  const svg = $derived(teacher ? teacherSVG(key, size) : avatarSVG(key, size));
</script>

<span class="avatar">{@html svg}</span>

<style>
  .avatar {
    display: inline-block;
    line-height: 0;
    filter: drop-shadow(0 2px 1px rgba(0, 0, 0, 0.18));
  }
  .avatar :global(svg) { display: block; }
</style>
