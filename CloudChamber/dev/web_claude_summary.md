# Cloud Chamber Simulation — Project Summary

*Compiled from five working sessions, 8–18 September 2025.*

## 1. Project overview

An interactive, browser-based diffusion cloud chamber written in JavaScript on an HTML canvas. Users choose which species of charged particle appear in the chamber (electrons, positrons, muons, alpha particles, protons), each with its own mass, charge, trail width and diffusion coefficient. Particles leave diffusing vapour trails, curve in an optional magnetic field (`Bz`), and fade out once they leave the chamber or stop moving.

The architecture at the start of the project: a `CloudChamber` class running an `animate()` loop via `requestAnimationFrame`, and a `Particle` class that draws its trail onto its own off-screen canvas (`particleCanvas`), which is then composited onto the main canvas with `drawOnMain()`.

## 2. Goals

1. **Run smoothly on limited hardware**, especially phones.
2. **Physically faithful magnetic curvature**: trajectories governed by the Lorentz force (F = qv × B, solved as F = ma), with a cyclotron radius r = mv/(qB) that is correct for every species.
3. **Cyclotron radius independent of animation speed**: changing the speed slider must not change the shape of the spirals.
4. **A speed slider that behaves like slow-motion viewing**, so users can watch magnetic spirals form in real time while the physics stays the same.
5. **Smooth, progressively diffusing trails at ~60 fps** at every slider position, including when physics only updates once a second.
6. **(Exploratory)** Model the real mechanism of a cloud chamber — ionisation seeding condensation in supersaturated vapour — rather than only drawing tracks.

## 3. Chronology of work

### Session 1 — Performance review (8 Sep)
Asked for every possible way to make the animation run well on low-compute devices. The review covered:

- **Rendering:** the one-canvas-per-particle design (each `particleCanvas` is full chamber size), the canvas `scale = 5` factor inflating canvas dimensions, batching draw calls, minimising `save()/restore()` state changes, caching gradients.
- **Computation:** caching or precomputing trig/sqrt and cyclotron constants, replacing `**2` with multiplication, culling off-screen particles early, object pooling.
- **Algorithms:** the nested loops in `propagateDiffusion` were flagged as expensive; alternatives include pre-rendered diffusion sprites or narrower trails on mobile.
- **Adaptivity:** frame-rate monitoring with automatic quality reduction, mobile detection, user-selectable quality modes, and Web Workers or WebGL if complexity grows.

The highest-impact candidates identified were reducing canvas scale, culling, caching gradients, and adaptive quality.

### Session 2 — Sharp corners on curved trails (9 Sep)
**Problem:** with `compensationFactor ≠ 1` (i.e. mixing an artificial "desired radius" with real cyclotron motion), fast particles produced curved trails with visible corners, because each update jumps a large distance.

**Arc drawing.** You proposed finding the centre of curvature and drawing a circular arc between successive positions. This was implemented as `findArcCentre()`:
- take the chord between `lastPos` and `currentPos` and its midpoint;
- compute the distance from midpoint to centre with d = √(r² − (c/2)²);
- choose which side of the chord via the sign of `q · Bz`;
- if the chord is longer than the diameter, inflate the radius to `halfChord × 1.1` to avoid `NaN` from a negative square root.

**Root cause of spiralling.** Other things discussed: friction (`frictionInverse`) bleeding energy and shrinking radii over time, and the compensation factor blending artificial and physical frequencies. You then identified the deeper flaw yourself: the velocity update used the *exact* analytic cyclotron solution but fed it the *previous* velocities instead of initial conditions. The decision was to replace this with a discrete time step evolving velocity by F = ma with the Lorentz force.

**Integration issues.** Moving to numerical integration clashed with the rest of the codebase because `speedUp` scaled things inconsistently, units were arbitrary (`Bz = 1.0`, `m_e = 0.5`), and `dt` appeared in the velocity update but not in the position update.

### Session 3 — Speed-independent cyclotron radius (9 Sep)
**The "cauliflower" effect** (unstable, lobed trajectories) returned after the magnetic update was rewritten. Contributing causes: `dt = 0.01 * speedUp` used for forces while positions were updated without `dt`; radius computed at the wrong point in the update; and speed drift.

I first proposed a fix based on rotating the velocity vector by a fixed angle. **You rejected it** because it assumes the exact cycloid rather than solving F = ma in discrete steps, which kept the project's core requirement intact: numerical Lorentz-force integration with a small fixed `dt`.

**Key insight:** initial velocities were multiplied by `speedUp` in the constructor, so a faster slider meant faster particles and, by r = mv/(qB), *larger* spirals. That is why the radius depended on animation speed. The fix explored was separating physics velocities (unscaled, used for forces) from visual movement.

**Rethinking the speed slider.** You asked whether `update()` itself could be called less often, which led to the approach adopted for the rest of the project: **control animation speed through physics update frequency**.
- `animate()` still runs every frame, but `update()` runs only when `currentTime − lastUpdateTime ≥ updateInterval`.
- Proposed calibration: slider 100 → 60 updates/s, 50 → ~6/s, 1 → 1/s (logarithmic).
- `speedUp` was therefore to be **removed from position updates**, otherwise slow speeds would be slowed twice.

**Fade rate.** We worked through what `fadeRate` should do (linear, square-root and inverse scaling were compared). With the slider framed as slow-motion viewing, the conclusion was **no `speedUp` dependence at all**: a fixed fade per physics step, so slowing the playback stretches the same physical process over more real time, like high-speed footage.

**Realistic speeds.** A cosmic-ray electron at ~0.9c crosses a 35 cm laptop screen in about 1.3 ns, roughly 16.7 million times shorter than one 60 fps frame. Truly realistic speeds are therefore invisible. Four options were set out:
1. Visually reasonable base speeds plus frame-rate slow-motion, with correct force laws, mass ratios and radius relationships ("realistic physics with observable time scaling").
2. Realistic speeds plus interpolated drawing.
3. Time dilation of `dt` with the slider.
4. Separate energy selector and viewing-speed slider.

I recommended Option 1. You then asked about **Option 1 combined with interpolated drawing** at the slow end, since particles were moving ~50 px per update. The approach sketched: a visual position that eases toward the physics position every frame (`catchUpRate ≈ 0.15`), with trails drawn from the visual motion and arcs subdivided into small segments.

### Session 4 — Exploring a gas-based simulation (17 Sep)
You asked whether, starting from scratch, it would be feasible to simulate a box of gas that condenses where a charged particle passes, instead of drawing tracks directly.

- **Physics:** supersaturated alcohol or water vapour is metastable; ion pairs left by the charged particle act as nucleation sites, and droplets form along the ionisation path.
- **Feasibility:** thousands of individual molecules with collisions and phase transitions are likely too heavy for real-time browser JavaScript.
- **Two prototypes were produced:**
  - *Hybrid patch model:* a grid of gas "patches", each with supersaturation, temperature and nucleation potential; charged particles raise nucleation probability; droplets grow and evaporate. Expected to hold 60 fps.
  - *Full molecular model:* individual molecules with Brownian motion, temperature-dependent velocity, density-dependent condensation, Lorentz-force curvature and an FPS monitor. Expected to struggle above ~1000 molecules.
- The hybrid model was judged the practical route.

### Session 5 — Progressive trail rendering (18 Sep)
**Starting point (your summary):** physics and animation had been separated to make the speed slider work, but at slow settings each physics step drew its whole trail segment (`physDistance`, the per-update movement) at once.

The approaches tried, and why each fell short:

1. **Spatial chunking of `physDistance`** inside the update step. You pointed out that at `updateInterval = 1000 ms` all chunks are still drawn in the same frame, so the trail still appears all at once. *Lesson: the problem is temporal, not spatial; the segments must be spread across frames.*
2. **A per-particle render queue** of segments revealed over subsequent frames. You pointed out that segments were drawn into `particleCanvas`, which is then dumped onto the main canvas in one go by `drawOnMain()`, so nothing was actually hidden. *Lesson: the compositing step defeated the queue.* Revision: draw ready segments straight onto the main context, keeping `particleCanvas` for alpha-blended fading.
3. **Timing bug.** When asked to verify the logic, I found that segment delays were compared against `performance.now() / 16`, the time since page load, so on any page that had been open a while every segment was immediately "due". Fix: stamp each segment with an absolute `appearAtFrame` relative to the physics update that created it.
4. Further questions followed on class responsibility (whether `renderProgressively` belonged in `Particle` or `CloudChamber`) and on how segment size should scale with `updateInterval`.
5. **Final state of the session:** new segments from each physics update are *appended* to the existing queue rather than replacing it, so unfinished trail work survives when the user moves the slider mid-animation or when updates arrive faster than the queue drains.

## 4. Key lessons

- **Analytic shortcuts conflict with the goal.** Rotating velocity by the exact cyclotron solution (especially using previous rather than initial velocities) produced spirals and cauliflower artefacts. Discrete F = ma integration with a small fixed `dt` is the agreed foundation.
- **`speedUp` must not leak into physics.** Scaling initial velocities, `dt`, position steps or fade rates by the slider changes cyclotron radii and particle lifetimes. The slider should change only *how often* physics runs.
- **"Slow motion" is the right mental model.** Same physics per step, more real time between steps; this settled the fade-rate question.
- **Realism belongs in the relationships, not the absolute speeds.** Real particle speeds are about seven orders of magnitude too fast to see, so the simulation's realism lies in force laws, mass/charge ratios and r = mv/(qB).
- **Smooth trails are a timing problem.** Dividing a jump into smaller pieces does nothing unless those pieces are revealed over successive frames.
- **The off-screen-canvas architecture shapes everything.** Because `drawOnMain()` composites a whole `particleCanvas` at once, progressive rendering has to bypass it or be built around it. The per-particle full-size canvases are also the main performance concern.
- **Arc drawing needs a geometric guard.** When a chord exceeds the circle's diameter, the radius must be enlarged to avoid `NaN`.
- **Verify by tracing frames.** Several proposed fixes only failed once traced step by step at extreme settings (e.g. 1000 ms intervals); this is a reliable way to check future changes.

## 5. Open directions

**Trail rendering and animation**
- Confirm the append-to-queue renderer behaves correctly across the full slider range and during live slider changes, and that queues cannot grow without bound when physics outpaces rendering.
- Adapt arc drawing to the queue: a `drawArcSegment(context, start, end)` that draws sub-arcs of the true circular path rather than straight chunks, so curved trails are progressive as well as smooth.
- Decide where rendering responsibility lives (`Particle` vs `CloudChamber`) and how fading interacts with trails drawn directly on the main canvas, since the main canvas is cleared every frame and direct draws must be redrawn or persisted.
- Settle the segment-size rule (fixed pixels vs scaled to `updateInterval`) so one physics step always fills roughly its interval at 60 fps.

**Physics**
- Finish removing `speedUp` from constructor velocities, position updates and fade rates, and check that spiral radii are identical at every slider value for every species.
- Retire or isolate `compensationFactor` and the artificial `desiredRadius` now that real Lorentz-force motion is the target.
- Consider a higher-order or energy-preserving integrator (e.g. Boris pusher, Verlet or RK4), since plain Euler slowly inflates speed in a pure magnetic field.
- Revisit friction / energy loss so that inward spirals reflect physical energy loss through ionisation rather than an arbitrary damping constant.
- Calibrate units (canvas size in real cm, per-species speeds and masses) so ratios between species are physically meaningful.

**User experience**
- Finalise the slider mapping (logarithmic, 1–60 updates/s).
- Possibly add an energy or particle-type selector separate from viewing speed (Option 4).

**Performance**
- Act on the Session 1 review, starting with the per-particle full-size canvases and `scale = 5`, `propagateDiffusion` cost, gradient caching and culling.
- Add frame-rate monitoring with adaptive quality, then test on real phones.

**Longer-term exploration**
- Develop the hybrid gas-patch model further: connect ionisation density per species (alphas ionise heavily, muons lightly) to droplet formation, and decide whether it replaces or complements the current track-drawing renderer.
