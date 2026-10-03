# Cloud Chamber Simulation: changes from the 2025 version to the 2026 version

*Compiled in October 2026. The starting point is the snapshot in `decent_2025/` (the state reached with web-based Claude in September 2025, described in `web_claude_summary.md`). The end point is the code in this directory.*

## 1. Summary

The 2025 version drew each track as white dots on its own full-size canvas, advanced the physics once per "update interval" set by the speed slider, and faded each finished track as one image. The 2026 version is a small physical model of a diffusion cloud chamber:

- Time runs on a **simulation clock**, so the speed slider changes only how fast we watch, never what happens.
- Particles move in **three dimensions** through a thin sensitive layer, and obey one consistent set of physical laws: Lorentz force with relativistic momentum, ionisation energy loss, multiple scattering and delta-ray production.
- Everything visible is made of **individual droplets** that condense, drift with a moving gas, and evaporate on their own.
- The picture is built by **collecting the light** of all droplets and developing it like a camera exposure.
- The **Random** mode sends particles at natural sea-level rates, and the user can trigger **events**: pair production, muon decay and a radioactive alpha source.

All open problems listed in `web_claude_summary.md` under "Trail rendering and animation" and "Physics" are resolved. The render queue, the arc-drawing code, the `compensationFactor` idea and the per-particle canvases no longer exist.

## 2. Files

| File | Role | Status |
|---|---|---|
| `header.js` | Canvas set-up and every tunable constant, with the physics explained in comments | rewritten |
| `particle_class.js` | `Particle`: 3D motion, energy loss, scattering, delta rays, ionisation | rewritten |
| `droplet_class.js` | `DropletPool`: storage, ageing, motion and drawing of droplets | new |
| `flow_class.js` | `FlowField` (swirls of the gas) and `MistPatches` (uneven mist) | new |
| `image_class.js` | `ChamberImage`: light collection, glow, exposure | new |
| `cloudchamber_class.js` | `CloudChamber`: clocks, frame loop, particle generation, events | heavily changed |
| `helper_functions.js` | `depositDroplets`, button handlers, Random loop | heavily changed |
| `index.html`, `CC_styles.css` | Page and control panel | control panel rearranged, background gif removed |
| `source_images.js` | Pictures of the solid sources, drawn on a canvas underneath the mist | new |
| `_test_harness.html` | Test page, not part of the site (see section 9) | new |

Snapshots: `decent_2025/` is the 2025 code. `before_depth/` is the 2026 code just before depth, mist rendering and the moving gas were added (flat motion, sharp pixel droplets, clean spirals).

## 3. Timing and the speed slider

**2025.** The slider set an `updateInterval` between 16 ms and 1000 ms. Each physics update moved the particle by a full step, and a render queue revealed that step over the following frames. The fastest setting was one step per frame, so tracks could never be near-instantaneous, and the timing assumed a 60 Hz display.

**2026.**

- **Simulation clock.** Each frame, simulation time advances by (real time since the last frame) $\times$ `ticksPerSecond`. The slider maps logarithmically onto 2 to 4000 ticks per second. At the top setting a track appears within a frame or two, which is the "realistic" instantaneous look.
- **Fixed substeps.** Each particle chooses one substep at birth, small enough that it never moves more than 4 canvas pixels or turns more than 0.02 rad. The slider only decides how many substeps run per frame (often zero in slow motion, thousands at top speed). The trajectory is therefore identical at every slider setting. This resolves the central problem of the 2025 work: spiral shape is independent of animation speed.
- **Droplet clock.** Droplets age on a second clock. At top speed it runs in real time. In slow motion it is slowed by the factor (`ticksPerSecond` / `maxTicksPerSecond`)$^{0.5}$, so droplets are slowed less than particles and a slowly drawn track stays visible for a good part of its length (`dropletSlowMotion`).
- **Readout.** One tick stands for 78 ps of real time (from the 20 cm chamber and the speed of light in the simulation), so the slider runs from about 3 million times slower than reality at the top to 6 billion times slower at the bottom. The playback panel shows this as "particles 140 million × slower", or "real time" at the top, where a track forms within one frame. The slider's tooltip adds how much the mist is slowed.
- The frame loop uses the time stamp of `requestAnimationFrame`, so it works at any refresh rate.

## 4. Physics

Lengths are in "canvas pixels" (the chamber is 1500 wide), time in ticks, and speeds as $\beta = v/c$ with `lightSpeed` = 175 canvas pixels per tick. One calibration fixes the physical scale: a 5 MeV alpha stops after 4 cm, which makes the chamber 20 cm wide.

### 4.1 Magnetic field

- **Boris integrator.** The Euler update of 2025 inflated the speed by about 2 % per step, which the artificial friction hid. The Boris scheme is still a discrete $F = ma$ step but conserves speed exactly (measured drift $\sim 10^{-15}$ after 5000 substeps).
- **Relativistic momentum.** The radius is $r = \gamma m v / (qB)$.
- **Position and velocity use the same time step** (in 2025 velocity used `dt` and position did not).
- The field was raised by a factor of 4 so that electrons complete several turns before they stop, now that their energy loss is physical.

### 4.2 Ionisation, trail density and width

Ionisation follows the leading part of the Bethe formula,

$$ I = \frac{z^2}{\beta^2}, $$

recomputed whenever the speed changes. Because $I$ spans a factor of more than 1000 between a fast muon and an alpha, the trail responds in a compressed way:

$$ \text{droplets per pixel} = n_0\, I^{0.25} \left(1 + I/I_k\right)^{0.75}, \qquad \sigma = \sigma_0\, I^{0.15} \left(1 + I/I_k\right)^{0.35}, $$

with $n_0 = 0.6$, $\sigma_0 = 0.75$ canvas pixels and $I_k = 1100$. This compression is a deliberate visual choice, not physics. Fast muons leave thin, beaded tracks, slow protons thick ones, and every track thickens as its particle slows. The per-species trail width and diffusion columns of the 2025 properties table are gone.

### 4.3 Energy loss

The energy spent on ionisation is taken from the motion, for every species:

$$ \frac{dE}{dx} = -K\,\frac{z^2}{\beta^2} \quad\Longrightarrow\quad \frac{d(\beta^4)}{dx} = -\frac{4 K z^2}{m\,\gamma^3}. $$

The single constant $K$ is fixed by the alpha calibration above. This replaces the per-axis friction factors of 2025 (which distorted circles) and the temporary special rules for alpha and delta-ray ranges. Resulting ranges are within about a factor of two of real ranges in air (the logarithmic term of the Bethe formula is omitted). Alphas and slow protons stop inside the chamber with a thick end (the Bragg peak), and electron spirals tighten for a physical reason.

A physical electron spiral ends in a short hook with an open centre, because $r \propto \beta$ while the remaining range goes as $\beta^4$.

### 4.4 Multiple scattering

Each substep turns the velocity by a random angle of typical size `scatter` $\times \sqrt{\text{path}}$, with

$$ \text{scatter} = s_0\,\frac{|z|}{m\,\gamma\,\beta^2}, $$

the leading part of the Highland formula. Only electrons scatter visibly. The value $s_0 = 2\times10^{-3}$ is **one fifth of the real value for air** ($\approx 10^{-2}$), chosen so that loops are ragged but recognisable. This is the main remaining departure from real physics.

### 4.5 Delta rays

Particles knock out electrons at the real rate for air ($1.2\times10^{-4}$ per canvas pixel for $I = 1$), with a $1/T^2$ energy spectrum above 10 keV. The angle follows two-body kinematics, and the parent loses the corresponding energy and momentum, so an electron visibly forks where it emits one. Alphas are too slow to produce visible delta rays.

### 4.6 Depth

Particles have a depth $z$ and a velocity along it. Droplets condense only in a sensitive layer 1.5 cm thick, fading in and out over 20 % of the thickness at each face. Consequences:

- Tracks begin and end in mid-picture, and the artificial "buffer zone" rule of 2025 is removed.
- The field does not act along $z$, so electrons move on helices and leave the layer after an arc or one to two loops.
- Scattering, delta-ray directions and recoil are all three-dimensional.

The crossing angle is restricted: the sine of the angle to the layer is uniform in $\pm 0.35$ (`dipSpread`). With fully natural directions most tracks, and nearly all muon tracks, would be stubs under 2 cm. **This is the one open design question** (see section 10).

### 4.7 Species

Each species now spawns with its own range of $\beta$:

| Species | $\beta$ at spawn |
|---|---|
| $e^\pm$ | 0.35 to 0.85 |
| $\mu^\pm$ | 0.75 to 0.99 |
| $\alpha$ | 0.042 to 0.066 |
| $p$ | 0.08 to 0.4 |

## 5. Droplets

- **Deposition per unit path length.** `depositDroplets` creates droplets at a fixed rate per canvas pixel of three-dimensional path, carrying the remainder between substeps. In 2025 the droplet density depended on how the path was cut into segments, and therefore on the slider.
- **Shape of the trail.** Droplets are placed in a bell-shaped cloud around the path (no hard edge, unlike the fixed rows of 2025). The width wanders by about 30 % along the track, and droplets in the core are larger.
- **Independent lives.** Droplets belong to the chamber, not to a particle. Each has its own lifetime (1 to 2.6 s on the droplet clock), appears over 0.08 s, stays bright for most of its life and then fades. A track dissolves droplet by droplet, instead of fading as one image.
- **Storage.** Droplets are 8 numbers each in one flat `Float32Array` per pool, with evaporated droplets compacted away during the drawing pass. There is one pool for tracks and one for the background mist.

## 6. The moving gas and the mist

- **Flow field.** `FlowField` builds a smooth, slowly changing velocity field from four waves of a stream function, so the flow has no sources or sinks. Typical speed is 1.2 mm per second. Every droplet is carried along, so tracks drift and bend as ribbons while they dissolve. Each droplet also has a small random drift of its own that grows with age.
- **Background mist.** The background gif is gone. About 12,000 faint droplets, with a few bright ones, condense all over the chamber and drift with the same flow. The mist is thicker in slowly shifting patches (`MistPatches`).

## 7. Rendering

**2025.** One full-size canvas per particle, composited every frame, with every droplet ever drawn refilled as a tiny arc each frame for the flicker. The cost grew without limit on long spirals.

**2026.** One image (`ChamberImage`), built in three steps each frame:

1. Start from darkness.
2. Every droplet adds light, shared between the four nearest pixels and scaled by its size and by a lamp that is brighter on the left.
3. Develop: about a third of the light is spread into a soft glow on a coarse grid, then brightness $= 1 - e^{-\text{exposure}\,\times\,\text{light}}$, so dense tracks saturate to white.

The image is 900 by 540 pixels (`imageScale` = 0.6), independent of the simulation's 1500 by 900 canvas-pixel coordinates. A whole frame costs about 3.5 ms in headless Chrome on a desktop, with roughly 12,000 mist droplets and several thousand track droplets. Developing the image is about 2.3 ms of that and does not depend on the number of droplets.

## 8. Random mode, events and the control panel

- **Natural rates.** Random mode sends particles at sea-level rates for a 20 cm by 12 cm chamber, with random (exponentially distributed) waits: muons 3.6 per second, cosmic electrons and positrons 1.0, background gamma rays which interact in the chamber 1.5 (the least certain number), protons 0.05, alphas 0.035. A gamma ray nearly always knocks out an electron, which starts anywhere in the chamber. In slow motion the arrivals are slowed with the droplet clock.
- **Outcomes decided at creation.** Every muon is created with a random yes or no for "is slow, stops in the chamber and decays" (`muonDecayChance`), and every gamma ray with a random choice between knocking out an electron and making a pair (`gammaPairChance`). Both chances are set to 3 %, far above their natural values, so that these events turn up now and then in Random mode and when sending in muons by hand. The event buttons create the same muon or gamma ray with the outcome fixed.
- **Events.**
  - *Pair production*, $\gamma \to e^+e^-$: an electron and a positron from one point, curling opposite ways in the field.
  - *Muon decay*, $\mu \to e\,\nu\bar\nu$: a slow muon whose speed is computed from the energy loss law so that it stops in mid-chamber, followed by a fast electron from the stopping point. This uses a new `whenStopped` hook on `Particle`.
- **Radioactive sources** (toggles, one active at a time), in the centre of the chamber. Each is drawn as the real object, on a second canvas underneath the mist (`source_images.js`): americium as a smoke detector button with a gold foil, thorium as a thoriated welding rod with a red tip, strontium and sodium as needle sources in a cork and a blue plastic handle, caesium as a sealed steel capsule. All but the button take a new random direction each time they are switched on, and are shaded according to where the lamp is. The button and the rod lie on the floor and send their alphas upwards into the sensitive layer, from the foil and from anywhere along the rod. The needles send electrons from their point.
  - *Am-241* ($\alpha$): alphas of a single energy, 5.49 MeV.
  - *Th-232* ($\alpha$): alphas of five energies from the decay chain, plus thoron "V" tracks, two alphas from one point in the gas a fraction of a second apart.
  - *Sr-90* ($\beta^-$) and *Na-22* ($\beta^+$): electrons or positrons drawn from a continuous beta spectrum.
  - *Cs-137* ($\gamma$): Compton electrons appearing anywhere in the chamber, with energy and angle from Compton kinematics.
- **Control panel.** Two columns of three panels under the chamber, each a small label and one row of equally wide buttons, with no boxes around them. Left: magnetic field, playback (speed, pause, clear), natural background (the "Random particles" toggle). Right: "Send in particle", "Activate event", "Activate source". Buttons are white until pressed: toggles which are on are gold, the selected field is grey, a paused animation is orange, and one-shot buttons flash for a moment (red for a negative particle, blue for a positive one, green for an event). The clear button also switches the source off.

## 9. Testing

`_test_harness.html` loads the real scripts with a hand-driven frame clock, so scenes are reproducible in headless Chrome. It reports two numerical checks (speed conservation, and circle radius against $\gamma m v/(qB)$) and takes URL parameters: `speed`, `frames`, `field`, `random=N`, `natural=S`, `event=pair|decay`, `source=Am-241` (or another source name), `timing=1`. It should not be deployed.

Everything in this document was verified with that page and with screenshots of `index.html`. Nothing was tested on a phone.

## 10. Known departures from reality, and open questions

- **Directions** are restricted to shallow crossing angles so that tracks, and muons in particular, are long enough to see.
- **Scattering** is one fifth of its real strength.
- **Trail response** to ionisation is compressed (section 4.2).
- **Ranges** run up to twice the real values, because the logarithmic term of the Bethe formula is omitted.
- **Delta rays and gamma electrons** do not come with the photon or the nucleus that caused them, and the muon in a decay event decays the moment it stops.
- **Not yet done:** rare large-angle scattering kinks, depletion of the vapour by earlier tracks, device-pixel-ratio handling, and tests on phones.

## 11. A visual artefact seen along the way (obsolete)

Logged because the cause was never pinned down.

- **When:** in the intermediate version where droplets were already scattered with a bell curve but were still drawn as tiny canvas arcs onto a per-particle canvas.
- **Symptom:** a short segment of an alpha track showed two or three clean, continuous lines parallel to the track instead of grainy droplets. It appeared only at high animation speeds, in roughly one alpha track in ten.
- **Suspected cause:** at high speed, several thousand sub-pixel arcs were filled within one frame and all were refilled every frame for the flicker. A rasterisation problem in the browser's canvas is the leading suspect, since the droplet positions themselves were random.
- **Status:** that drawing code no longer exists. Droplets now add light directly to a pixel buffer (`ChamberImage.addLight`), with no canvas paths involved. If such lines ever reappear, the cause must be in the droplet positions (`depositDroplets`), not in the drawing.
