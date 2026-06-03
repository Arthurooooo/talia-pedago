# Génération des assets de la salle (Teacher Story)

Reproduction fidèle de la salle de classe « Histoire » de Teacher Story (Motion Twin,
CC BY-NC-SA — usage interne non commercial). Tout est déterministe : les images viennent
du jeu, le placement vient du code du jeu (`TeacherStory/client/src/Manager.hx`).

## Pipeline

1. **Extraction des symboles** (PNG ×4 + SVG pour les ancrages) depuis `_gfx.swf` via JPEXS :
   ```sh
   IDS="1770,1672,1750,1645,608,1651,752,951,1146,99,755,1740,83,694,731,1139,352,357,26,1133,23,1637,382,550,1577,650,638,658,645,567,560,349"
   java -jar tools/ffdec/ffdec.jar -zoom 4 -ignorebackground -format sprite:png \
     -selectid "$IDS" -export sprite /tmp/swfexport/png4 TeacherStory/client/swf/_gfx.swf
   java -jar tools/ffdec/ffdec.jar -format sprite:svg \
     -selectid "$IDS" -export sprite /tmp/swfexport/svg TeacherStory/client/swf/_gfx.swf
   ```

2. **`build_manifest.py`** — lit la géométrie native (taille + ancrage = 1er `<g transform>`
   du SVG) et copie les PNG dans `src/lib/assets/ts/room/`, écrit `src/lib/roomManifest.json`.

3. **`build_students.py`** — assemble un pool d'élèves ASSIS depuis l'atlas `characters.png`
   (slices définis dans Manager.hx ~ligne 394). Pose assise = corps sans bras (`bodyN.png`)
   + bras croisés (`armsN.png`, arms_short frame 8). Cheveux alignés (`hair_left = part_left`).

4. **`render_room.py`** — rendu hors-ligne (PIL) qui REPRODUIT le placement de ClassRoom.svelte,
   pour valider sans navigateur. `FRAME="L,T,R,B"` et `INTERIOR=1` / `NSTUD=n` en variables d'env.

Le placement (projection iso, modes addChild/addFurnMc +29, tri de profondeur par
bucket DP_BG/DP_ITEMS + zpriority) est documenté dans `src/lib/ClassRoom.svelte`.
