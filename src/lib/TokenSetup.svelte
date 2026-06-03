<script lang="ts">
  let { onSave }: { onSave: (token: string) => void } = $props();
  let value = $state('');
</script>

<div class="login">
  <div class="card">
    <div class="logo">🏫</div>
    <h1>Talia Pédago</h1>
    <p>Visualise les classes, les profs, les élèves d'un coup d'œil.</p>
    <input
      type="password"
      placeholder="Colle ton token Bubble Data API"
      bind:value
      onkeydown={(e) => { if (e.key === 'Enter' && value.trim()) onSave(value.trim()); }}
    />
    <button disabled={!value.trim()} onclick={() => onSave(value.trim())}>Entrer dans l'école</button>
    <p class="hint">Le token est stocké en local dans ton navigateur (localStorage). Bubble → Settings → API → Generate token.</p>
  </div>
</div>

<style>
  .login {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background:
      repeating-linear-gradient(0deg, #91c5b5 0 60px, #7eb09f 60px 62px),
      repeating-linear-gradient(90deg, #91c5b5 0 60px, #7eb09f 60px 62px);
    background-blend-mode: multiply;
    image-rendering: pixelated;
  }
  .card {
    width: 380px;
    background: #f7e7c8;
    border: 4px solid #5e4632;
    border-radius: 8px;
    padding: 32px 28px;
    text-align: center;
    box-shadow: 0 8px 0 #3d2c1e, 0 10px 24px rgba(0,0,0,0.3);
    color: #3d2c1e;
  }
  .logo { font-size: 48px; line-height: 1; margin-bottom: 8px; }
  h1 { margin: 0 0 4px 0; font: 700 20px system-ui, sans-serif; }
  p { margin: 0 0 16px 0; font-size: 13px; opacity: 0.8; }
  input {
    width: 100%;
    padding: 10px 12px;
    border: 2px solid #7e5530;
    border-radius: 4px;
    font-size: 13px;
    background: #fff8ec;
    color: #3d2c1e;
    box-sizing: border-box;
  }
  input:focus { outline: 2px solid #f5cf6a; }
  button {
    width: 100%;
    margin-top: 12px;
    padding: 10px 12px;
    background: #5e4632;
    color: #f7e7c8;
    border: 0;
    border-radius: 4px;
    font: 700 13px system-ui, sans-serif;
    cursor: pointer;
    box-shadow: 0 3px 0 #3d2c1e;
  }
  button:hover:not(:disabled) { background: #6a503b; }
  button:disabled { opacity: 0.5; cursor: not-allowed; box-shadow: 0 1px 0 #3d2c1e; }
  .hint { font-size: 11px; margin-top: 14px; opacity: 0.7; }
</style>
