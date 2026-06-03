# Talia Pédago

Outil interne (non commercial) qui affiche chaque classe Bubble de Talia comme une
salle de classe isométrique façon **Teacher Story**, reproduite à partir des fichiers
du jeu. Svelte 5 + Vite.

## Lancer en local

```bash
pnpm install
pnpm dev
```

À l'ouverture, coller un **token de la Data API Bubble** (eleve.talia.fr). Le token
est stocké uniquement dans le `localStorage` du navigateur — il n'est jamais commité
ni envoyé ailleurs que vers l'API Bubble.

## Déploiement (GitHub Pages)

Le workflow `.github/workflows/deploy.yml` build et publie sur GitHub Pages à chaque
push sur `main`. Côté dépôt : **Settings → Pages → Source = GitHub Actions**.

L'appli est servie sous `https://<user>.github.io/<repo>/` (base Vite relative `./`).
Le site public n'est qu'une coquille : aucune donnée n'est visible sans un token Bubble valide.

## Outils (dev)

`tools/` contient les scripts d'extraction/validation (PNG depuis le SWF via JPEXS,
manifeste de géométrie, rendu hors-ligne). Ils nécessitent les fichiers du jeu dans
`TeacherStory/` et le décompileur dans `tools/ffdec/` — **tous deux exclus du dépôt**.

## Crédits / licence des assets

Sprites et décors : **Teacher Story © Motion Twin**, sous licence **CC BY-NC-SA**.
Reproduits ici à partir des fichiers du jeu, à des fins **non commerciales**, avec
attribution. Le code applicatif est propre à ce projet.
