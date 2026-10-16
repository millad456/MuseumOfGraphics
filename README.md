# Museum of Graphics

A playable history of computer graphics, from one glowing dot to path tracing,
in 18 rooms. Everything you see and hear is computed live in the browser: there
are no images, videos or audio files.

**Open it:** serve the folder with any static web server and open `index.html`
(ES modules don't load from `file://`).

```sh
python3 tools/serve.py        # http://localhost:8765
```

No build step. Three.js r169 is vendored in `lib/`.

## The rooms

| # | Room | What it shows |
|---|------|---------------|
| 00 | Opening | One phosphor dot becomes the finished, path-traced gallery, then the whole history rewinds back into the dot |
| 01 | The Character | A video terminal: a grid of boxes, a character ROM, memory you can poke |
| 02 | The Beam | A vector display: a beam steered like a pen, phosphor decay, an oscilloscope you can listen to |
| 03 | The Pixel | A cutaway TV painting a raster, palettes, colour by numbers, dithering |
| 04 | Tricks of the Trade | Palette cycling, tiles, sprites and hitboxes, and the memory each one saved |
| 05 | Depth from Layers | Parallax with and without, CPU and memory meters on an arcade cabinet |
| 06 | The Illusion of a World | Raycasting, step by step: the scan, height = 1 ÷ distance, texture columns, sprites |
| 07 | Moving Every Point | Through the PC screen, the maze rises into 3D, then becomes a grid: matrices as moving arrows |
| 08 – 16 | The gallery | One persistent 3D room evolves stage by stage (points, wireframe, painter's algorithm, depth buffer, flat, Gouraud, Phong, textures, mipmaps, anti-aliasing, shadow maps, HDR and bloom, path tracing), with side rooms for the fast inverse square root, ray marching and an optics bench |
| 17 | From One Dot | The history replays forwards |

Each new idea arrives as a wave that sweeps through the gallery and redraws it
behind the wavefront, so the room evolves while you watch. Every room has a short
self-running tour; touching anything hands control to you, and the tray holds the
controls to play with each effect.

## How it is built

```
src/
  app/        App (room lifecycle, transitions, secrets, sharing), Chrome (DOM UI), Input, Room base
  core/       Scope (per-visit cleanup), Tour, Tweens, State (localStorage), dom builder, maths
  audio/      AudioEngine: procedural music styles per era and every sound effect
  gfx/        CRT screens, path tracer, bitmap/stroke fonts, camera framing, three.js helpers
  hall/       The 3D museum hall and its machines (terminal, vector scope, TV, arcade, PC)
  world/      The evolving gallery: stages, shaders, the sweep compositor, the frame dissector
  rooms/      One file (or folder) per room
```

* **Rooms** are created once and visited any number of times, in any order.
  Everything a visit creates is registered with its `Scope`, and disposing the
  scope restores the room, so jumping around, rewinding and re-entering are safe.
* **Tours** are lists of steps that each fully establish their own state, so a
  visitor can step forwards and backwards freely.
* **The gallery** (`src/world`) is the same scene description the path tracer
  renders, so every raster stage can sweep into the next all the way to path
  tracing without the picture jumping.
* **The DOM** is built only with `h()` (text nodes, never `innerHTML`).
* **State** (secrets found, your cursor glyph, best scores) lives in
  `localStorage` under one validated key.

## Development

```sh
npm install                   # esbuild, used only for the syntax/import check
npm run check                 # bundle once to catch errors
node tools/shot.mjs out raycast '[["wait",2000],["click",720,450],["wait",4000],["shot","raycast"]]'
```

`tools/shot.mjs` (needs `playwright`) drives headless Chromium (software WebGL) and reports console
errors; it loads the page with `?fast`, which lets animations take large time
steps. `?q=low` forces the low-quality path.

## Credits

Code, shaders, pictures, music and sound are original. Historical games, machines
and papers are referenced by description only. Built with
[Three.js](https://threejs.org) (MIT).
