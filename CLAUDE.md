# Botai museum exhibit — handoff context

Project for the North Kazakhstan Regional History Museum (skomo.ucoz.kz): a museum screen that tells the story of one artifact as a 90-second 3D film plus an interactive website. Author: Argyn (IT student, Kozybayev University, Petropavlovsk). He writes in Russian; answer him in Russian, short and direct.

Main exhibit: **flint knife** of the Botai culture (Eneolithic, IV millennium BC, Botai settlement on the Imanburlyk river, North Kazakhstan region). The knife in the film is a reconstruction, not a scan of a museum object. Never invent facts (catalogue numbers, find dates, excavators) that are not confirmed.

## Where things are (Windows, user's PC)

| Path | What |
|---|---|
| `C:\Users\warma\OneDrive\Documents\venom\museium.blend` | Film scene (full quality, Eevee). Do not simplify this one. |
| `C:\Users\warma\OneDrive\Documents\venom\museium_web.blend` | Web copy: low-poly, baked, source of `botai.glb`. |
| `C:\Users\warma\Downloads\botai\web\botai.glb` | Exported scene for the site, Low quality (≈7 MB, Draco, WebP). |
| `C:\Users\warma\OneDrive\Documents\venom\museium_web_mid.blend` | Medium web copy: Mid Megascans, 2K textures, characters 26–30k, house cluster 20k, terrain 70k; source of `botai_mid.glb` (≈20 MB, ≈480k triangles). |
| `C:\Users\warma\Downloads\botai\web\botai-exhibit\` | **This Next.js project.** |
| `C:\Users\warma\Downloads\botai\` | Source GLBs (Tripo), DEM cache, OSM river, heightmaps, `hdri\`, `megascans\` (unpacked Low assets), `flint_knife_lowpoly.glb`. |
| `C:\Users\warma\Downloads\*.glb / *.zip` | Megascans downloads (Low and Mid), `botaiHouse.glb` / `.blend` (house cluster). |

Blender 5.2 LTS, driven through the Blender MCP addon (mcp-for-blender). Blender 5.x specifics: layered actions (`action.layers[].strips[].channelbags[].fcurves`, no `action.fcurves`), glTF objects import with quaternion rotation, no FFMPEG in `image_settings.file_format` (render PNG sequences), Sky Texture type `MULTIPLE_SCATTERING`.

## The film (both .blend files)

24 fps, frames 1–2160 (90 s), 1920×1080. Nine cameras switched by timeline markers:

| # | Frames | Camera | Shot |
|---|---|---|---|
| 1 | 1–240 | CAM_01_Steppe | Aerial over the steppe to the settlement |
| 2 | 241–480 | CAM_02_Street | Walk between houses, horse |
| 3 | 481–720 | CAM_03_Master | Master kneeling at the hearth, knapping flint |
| 4 | 721–960 | CAM_04_Hands | Close-up: hammerstone and knife |
| 5 | 961–1200 | CAM_05_Fire | Through the fire: master inspects the finished knife |
| 6 | 1201–1392 | CAM_06_Ground | Knife left on the ground, fade out |
| 7 | 1393–1680 | CAM_07_Dig | Excavation (1987 in the story), archaeologist brushing |
| 8 | 1681–1920 | CAM_08_Find | Close-up: knife on the pit floor |
| 9 | 1921–2160 | CAM_09_Museum | Knife in a museum case, title |

Fades are keyed on `scene.view_settings.exposure`: (1,−6) (30,0) (1330,0) (1392,−8) (1393,−8) (1425,0) (1890,0) (1920,−8) (1921,−8) (1950,0) (2130,0) (2160,−8).

Epoch switch: ancient objects (settlement, hearth, props, master, horse, vessel) are visible 1–1392; excavation set and archaeologist 1393–1920; museum room is a closed box at Blender z = −300. In the web copy visibility is stored as custom properties `vis_start` / `vis_end` (exported as glTF extras → three.js `userData`).

Scene facts:
- Terrain from real DEM (AWS Terrarium tiles) around Botai, centre lat 53.19986, lon 67.65611, site elevation ≈238 m; river Imanburlyk from OSM ≈160 m south. Plaza with the hearth at Blender (1, 10); pit centre (1.55, 10.9), 5×5 m, 1.1 m deep.
- Settlement: 8 instances of collection `Botai_House_src` (7 connected pit-houses each, the user's own model), ×1.5 scale, fitted to the slope. Research basis: 15 ha site, ≥250 dwellings over its life, adjoining pit-houses 30–70 m², 60–80 cm deep, log roof with turf and smoke hole.
- Sun: Blender direction to the sun (−0.686, −0.686, 0.242), elevation 14°, south-west; evening light.
- Characters are Tripo models with Mixamo-named rigs (`mixamorig:*`). Hunter acts as the master; poses are keyed by code (kneeling, knapping cycle, inspecting the knife). Knife and hammerstone are bone-parented to the hands. Horse is a Tripo rig (front legs are children of `Head_0`; animate `Head_1`, keep stub `tripo::1_Left_Limb_0`).
- Assets: Megascans (Fab, free) Low versions for the web: wild grass, dirt ground, soil mud, firewood, burnt firewood, canyon campfire (recoloured grey), granite and small rocks, bones, deer leg (shown as "meat", no deer at Botai), trench walls for the pit. Bonfire from Sketchfab is CC-BY (3dAssetsForGames) — credit it if used.

## Web export (museium_web.blend → botai.glb)

Exporter settings: GLB, all objects, cameras on, lights off, extras on, Y-up, animations SCENE mode, frame step 2, force sampling, Draco on, images WEBP, skins on, morph off. Track-To cameras are baked to location/quaternion keys before export. Animation times = frame / 24.

Budget in the GLB: ≈190k triangles drawn (near terrain 28.8k, far 2.6k, house cluster 9k ×8, hunter 14k, archaeologist 12k, horse 12k, vessel 2.5k). Ground colour is vertex colour × tiling dirt texture. Grass, fire, smoke, sky and fades are not in the GLB; the site builds them.

## This project (Next.js 16 + three 0.187)

```
npm install   # postinstall copies the Draco decoder to public/draco
npm run dev   # http://localhost:3000
npm run build && npm run start   # for the museum screen
```

- `lib/shots.ts` — shot list, fades (`blackAt`), time format.
- `lib/engine.ts` — `Exhibit`: loads the GLB (GLTFLoader + DRACOLoader from `/draco/`), one AnimationMixer for all clips driven by `mixer.setTime(t)` (tracks switched from STEP to linear), camera per shot from `SHOTS`, `vis_start/vis_end` visibility, Preetham `Sky` + PMREM environment from the sky (intensity 0.32), hemisphere 0.25, sun 3.0 with shadow box following the camera, fire point light with flicker, ember sprites, 22k instanced grass tufts with wind (placed by three-mesh-bvh raycasts, kept out of the pit), museum spot lights and RoomEnvironment at frames ≥1920. Blender → three coordinates: (x, y, z) → (x, z, −y). `window.__exhibit` is exposed for debugging.
- `lib/operator.ts` — `OperatorRig`, the operator camera, separate from film cameras: LMB pan/tilt on the spot, RMB orbit, MMB truck/pedestal, wheel dolly along the lens, WASD along the lens, Q/E down/up, Shift ×4, eased velocity. Takes over from the current film camera without a jump.
- `components/Player.tsx` — UI: top bar (Film / Operator, О предмете, fullscreen), 16:9 frame letterboxed via container queries, shot captions (bottom right), museum title, operator bar (lens slider 14–135 mm, back to film camera), loading and error states, the nine-shot contact strip as the timeline, kiosk loop (restarts 6 s after the end), `?shot=N` in the URL.
- Graphics quality: `QUALITY` presets in `lib/engine.ts` (low: botai.glb, pixel ratio 1, shadow 1024, 9k grass, no AA; medium: botai_mid.glb, pixel ratio up to 2, shadow 4096, 30k grass, AA). Switch in the top bar, stored in localStorage `botai-quality` and `?q=`; switching remounts the canvas and resumes at the same time.
- Excavation lighting (frames 1392–1920): soft spot from above the pit plus a warm low bounce and environment 0.5, because the 14° sun leaves the pit floor in full shadow.
- `components/Legend.tsx` — control legend bottom-left as keycaps and mouse icons; content switches with the mode; H hides it.
- Keys: Space play/pause, ←/→ shots, C film/operator, I info sheet, H legend, F fullscreen, Esc closes the sheet.

## Style: Hallmark, theme Darkroom (amber)

The site follows the Hallmark design skill (github.com/Nutlope/hallmark), theme Darkroom: warm print-black ground, fibre-white ink, Sofia Sans Extra Condensed capitals (200 for display, 400 for titles and controls), one amber accent used only for the primary control, the current shot and lit mouse buttons, radius 0, 1px rules, no shadows. Body face is Sofia Sans instead of Barlow because Barlow has no Cyrillic. Fonts are self-hosted via `@fontsource` (no internet on the museum screen). The stamp comment is the first line of `app/globals.css`.

Rules to keep (Hallmark Floor): every colour and font through `:root` tokens; never `transition: all`, never animate width/height/top/left; `overflow-x: clip` on html and body; `:focus-visible` on every control; `prefers-reduced-motion` fallback (the film starts paused); no eyebrows or tracked-capital labels; no middle-dot meta strings; no invented metrics or quotes; about 80 words per screen. Hallmark's own lint script (sloplint) was not run in the cloud session; check it locally if wanted: `node <hallmark>/skills/hallmark/scripts/sloplint.mjs app/globals.css --render`.

## Known issues and next steps

- Performance on weak school laptops is unverified. If below 30 fps, cut grass count in `buildGrass` first, then shadow map size, then pixel ratio. The film clock caps frame delta at 0.1 s, so on a slow GPU the film plays slower instead of skipping.
- Character animation is hand-keyed (arms and head only, no walking). Better: Mixamo FBX animations (Without Skin) applied to the `mixamorig:` rigs, then re-export the GLB.
- Shot 4 macro: fingers do not wrap the stone exactly. Shot 5: knife is small in frame.
- No flame or smoke simulation in the film .blend (emissive cones and a volume); the web has embers only.
- Not done yet: Kazakh / English UI, touch controls for a touch screen, audio.
- Do not hide `Botai_Terrain_Near` in the viewport of the .blend files (the user wants to see it).
- Do not save new copies of files for each edit; overwrite one file per document.
