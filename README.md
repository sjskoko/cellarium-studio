# Cellarium — Small rules. Living worlds.

A browser-local cellular-automata playground. **Usability is the primary design criterion:** choose a preset, change one rule, pause time, and explore the result.

[Open the playground](https://sjskoko.github.io/cellarium-studio/) · [Six films & downloads](https://sjskoko.github.io/cellarium-studio/story/) · [Creator plan](https://sjskoko.github.io/cellarium-studio/story/content-plan.html) · [Interactive Lab](https://sjskoko.github.io/lab/)

## Worlds and rules

- **Binary:** editable birth/survival counts, with Life, gliders, HighLife and Seeds presets. 8 Moore neighbors in 2D; 26 in 3D. The 3D default is Bays B6/S5,6,7.
- **Elements:** empty, water, fire, air and earth. Editable ordered transitions count target-state neighbors; the first matching rule wins. Updates are synchronous.
- **Continuous — Lenia:** one state in [0,1], a normalized radial neighborhood kernel and a growth function. Edit radius R, growth center μ, growth width σ and step Δt, plus kernel shape, ring weights and the growth expression. Water/fire/coral are visual themes. The reference Orbium and Rotorbium organisms come from Bert Chan's MIT-licensed Lenia notebook.
- Every kind supports both a 2D lattice and a real 3D cubic lattice. Drag to orbit in 3D; depth and slice controls expose interior states.
- Draw cells while paused, save a PNG, save/open reproducible JSON experiments, and record a silent 15-second vertical video.

The browser has no runtime dependencies or uploaded-data endpoints. A worker computes the world; the same pure model and drawing code produce the films.

## Time has two meanings

`T` is elapsed playback time, with 12 fixed generations per second at 1×. A monotonic real-time clock determines the target generation; rendering frames does not determine the numerical dynamics. A slow device may lag while computing every generation.

Pause to type a T value, move the timeline, or step one generation. Resume rebases the wall clock at the selected state. Hidden tabs pause. Checkpoints plus deterministic recomputation restore history; this is not inverse-time physics. Time jumps are supported up to 1,000,000 generations and can be cancelled.

Lenia's numerical `Δt` is separate from playback time: model time is generation × Δt, while playback T is generation / 12. Changing rules or painting starts a new origin. 2D starts from reference organisms or a seeded field. 3D uses an exploratory seeded volume; survival of a 2D organism in 3D is not assumed.

## Continuous model

```text
n = K * A
A_next = clamp(A + dt × G(n), 0, 1)
G(n) = 2 × max(0, 1 − (n−μ)² / (9σ²))⁴ − 1
```

This implements the polynomial Lenia rule used by the original notebook, using direct spatial convolution. The radial kernel has support r < R. With B ring weights, q is the fractional part of B×r/R; the polynomial core is `(4q(1−q))⁴`, multiplied by the corresponding ring weight and normalized to sum to one. The exponential core is also available. The neighborhood is a disk in 2D and a ball in 3D.

Orbium defaults: R=13, μ=.15, σ=.014, Δt=.1, β=[1]. Rotorbium uses μ=.156 and σ=.0224. The 3D exploratory preset uses R=3, μ=.26 and σ=.045. These are finite-grid, fixed-step simulations of Lenia, not exact continuous space or time.

Wrapped boundaries are periodic; fixed boundaries have zero exterior state. Clipping is part of Lenia's rule and its count is shown. Non-finite custom results stop computation. Custom formulas use a bounded arithmetic parser, never `eval` or executable JavaScript. Extinction or saturation is a possible experimental outcome.

## Run and verify

Node.js 20+ is sufficient for the application and tests. No dependency installation is needed.

```sh
npm test
npm start
```

Open `http://127.0.0.1:4173`. Use HTTP hosting so the module worker can load.

Tests cover the blinker and glider, 3D neighborhood counts, simultaneous elemental transitions, Lenia kernel normalization and impulse response in 2D/3D, uniform growth, zero exterior boundaries, sustained moving Orbium, exact history reconstruction, save/restore, real-time clock rebasing, formula validation, and numerical limits.

## Films

Six 15-second H.264 MP4s, each 1080×1920 at 30 fps, are in `dist/story/`, with covers, captions and a suggested two-posts-per-week sequence. No Instagram posts or schedules are created by this repository.

Optional production tool:

```sh
# Install @napi-rs/canvas in your chosen production environment and FFmpeg on PATH.
node scripts/render-reels.cjs
```

`CELLARIUM_CANVAS_MODULE` may point to an existing installed canvas module. `CELLARIUM_FONT` may point to a local TrueType font. `render-manifest.json` records film presets and frame count.

Browser recording is 720×1280. MP4 is selected only if supported; otherwise WebM is labeled honestly and may require conversion for Instagram. Actual recording cadence depends on the device. The produced films use an offline fixed-frame renderer.

## Deployment

Set GitHub Pages source to **GitHub Actions**. `.github/workflows/pages.yml` tests the model, generates the six MP4 films and covers, and publishes `dist/` on pushes to `main`. All app assets use relative URLs suitable for a project subpath.

## References

- [Golly: Life-like birth/survival rules](https://golly.sourceforge.io/Help/Algorithms/QuickLife.html)
- [Carter Bays: candidates for three-dimensional Life](https://wpmedia.wolfram.com/sites/13/2018/02/01-3-1.pdf)
- [Cyclic cellular automata](https://arxiv.org/abs/2108.06404), inspiration for the elemental transition model
- [Bert Chan: Lenia — Biology of Artificial Life](https://arxiv.org/abs/1812.05433)
- [Lenia and Expanded Universe](https://arxiv.org/abs/2005.03742)
- [Original Lenia notebook and reference organisms](https://github.com/Chakazul/Lenia/blob/master/Jupyter/Lenia.ipynb); the seed data is distributed with its [MIT license](dist/LENIA-LICENSE.txt).

3D visualization uses depth-sorted small voxel marks, not a physically based volume renderer. Mobile grid sizes are bounded (2D up to 160², 3D up to 28³); large time jumps can take time. No analytics are collected by the app.

The repository stores reproducible source and recipes. GitHub Actions generates media during deployment; download films from the published story page. The local creator pack includes ready-made media. Renderer dependency: @napi-rs/canvas 0.1.100 and FFmpeg.
