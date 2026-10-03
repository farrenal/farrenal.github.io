// Get text box to display debugging info
var debugText1 = document.getElementById('debugText');
var debugText2 = document.getElementById('debuggText');
var debugText3 = document.getElementById('debugggText');

// Get main canvas element
var canvas = document.getElementById('particlesCanvas');

// Size of the chamber. The simulation measures every length in "canvas pixels":
// the chamber is bw canvas pixels wide and bh canvas pixels high, whatever the size of the screen.
var distortionRatio = canvas.clientWidth/canvas.clientHeight;
scale = 5;
const bw = canvas.width * scale;
const bh = Math.round(bw / distortionRatio);
const p = 10;

// The picture itself has a different number of pixels: imageScale image pixels per canvas pixel.
// More pixels give a sharper picture on a screen which can show them. There are two ways of drawing the picture:
//
//   - On the graphics card (WebGL, see image_gl_class.js). All pixels are worked out at the same time, so the picture
//     simply gets one pixel for every pixel of the screen, however far the user zooms in.
//     Used on every device which supports it.
//   - On the processor (see image_class.js). Every pixel is worked out one after the other for every frame,
//     so the cost of a frame grows quickly with imageScale (about 3 ms at 0.6 and 8 ms at 1.0 on a desktop
//     computer, out of the 16.7 ms which a frame may take). imageScale is one of 0.6, 0.8 and 1.0, and if frames
//     turn out to take too long on this device it is lowered and is not allowed to go back up (see CloudChamber.animate).
//     This is the fallback. It can also be forced by adding ?renderer=cpu to the address of the page.
//
// In both cases imageScale is chosen when the page loads, and again whenever the user zooms in or out or resizes
// the window. The look of the droplets does not depend on imageScale.
const referenceImageScale = 0.6;    // the resolution for which the look of the droplets and of the glow was tuned
const minImageScale = 0.6;          // never coarser than this
const maxImageScale = 1.0;          // on the processor: never finer than this (1500 x 900 pixels)
const maxImageScaleGL = 2.7;        // on the graphics card: never finer than this (4050 x 2430 pixels)
// On the graphics card: should the picture always have the finest scale which the device allows (true), or only as
// many pixels as the screen can show at the current zoom (false)? With true nothing changes when the user zooms in,
// so there is no moment at which the picture suddenly becomes sharper, but every frame draws the largest picture
// (about 10 million pixels, 100 MB of memory on the graphics card) even when it is shown small.
const alwaysFinestImage = true;
const imageScaleStep = 0.2;         // on the processor: the steps between the scales which are used
var frameBudget = 10;               // on the processor: the work for one frame should take less than this many milliseconds on average...
const frameBudgetFrames = 120;      // ...over this many frames
const warmUpFrames = 90;            // frames which are not counted after the image has been set up (they include one-off work)
const busyGraphicsCard = 16;        // on the graphics card: if the work for one frame takes more than this many milliseconds on
                                    // average, the picture is made smaller (see CloudChamber.animate)...
const slowGraphicsCard = 25;        // ...and if it takes more than this with the smallest picture, there is no real
                                    // graphics card, and the page changes to the processor

// Can the graphics card of this device collect light in a picture (numbers which add up and can exceed 1)?
// This is tried out on a canvas which is thrown away, because a canvas can only ever be drawn in one way.
// Some devices have no usable graphics card and imitate one on the processor, which is much slower than
// our own way of drawing on the processor: failIfMajorPerformanceCaveat makes the browser say no in that case.
// Returns "yes", or the reason why not.
function graphicsCardCanDrawThePicture() {
    try {
        const test = document.createElement('canvas').getContext('webgl2', {failIfMajorPerformanceCaveat: true});
        if (!test) {
            // Find out which of the two it is
            if (document.createElement('canvas').getContext('webgl2')) {
                return "no: the browser says its graphics would be slow (hardware acceleration is switched off or the graphics card is not trusted)";
            }
            return "no: this browser has no WebGL 2";
        }
        if (!test.getExtension('EXT_color_buffer_float') && !test.getExtension('EXT_color_buffer_half_float')) {
            return "no: the graphics card cannot draw into pictures with numbers above 1";
        }
        const texture = test.createTexture();
        test.bindTexture(test.TEXTURE_2D, texture);
        test.texStorage2D(test.TEXTURE_2D, 1, test.RGBA16F, 4, 4);
        test.bindFramebuffer(test.FRAMEBUFFER, test.createFramebuffer());
        test.framebufferTexture2D(test.FRAMEBUFFER, test.COLOR_ATTACHMENT0, test.TEXTURE_2D, texture, 0);
        if (test.checkFramebufferStatus(test.FRAMEBUFFER) != test.FRAMEBUFFER_COMPLETE) {
            return "no: the graphics card refused a picture with numbers above 1";
        }
        return "yes";
    }
    catch (error) {
        return "no: trying it out failed (" + error.message + ")";
    }
}

// Decide how the picture is drawn, and get hold of the canvas in that way.
// webGLStatus says what was decided and why: type it into the console of the browser to find out.
var webGLStatus;
if (/[?&]renderer=cpu/.test(window.location.search)) {
    webGLStatus = "no: the address of the page ends in renderer=cpu (added by hand, or by the page itself after the graphics card turned out to be too slow)";
}
else webGLStatus = graphicsCardCanDrawThePicture();
var useWebGL = (webGLStatus == "yes");
var gl = null;              // the graphics card, if it is used
var context2d = null;       // the ordinary way of drawing on a canvas, if it is not
if (useWebGL) {
    // The picture is see-through where there is no mist, so that the solid objects underneath it show
    gl = canvas.getContext('webgl2', {alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
                                      failIfMajorPerformanceCaveat: true});
    if (!gl) {
        useWebGL = false;
        webGLStatus = "no: the graphics card worked on a test canvas but not on the real one";
    }
}
if (!useWebGL) context2d = canvas.getContext('2d');

// The finest scale which may be used on this device
var imageScaleLimit = maxImageScale;    // (on the processor this is lowered if the device turns out to be too slow)
if (useWebGL) imageScaleLimit = Math.min(maxImageScaleGL, gl.getParameter(gl.MAX_TEXTURE_SIZE) / bw);

var imageScale, imageWidth, imageHeight;
function setImageScale(newScale) {
    imageScale  = Math.min(imageScaleLimit, Math.max(minImageScale, newScale));
    imageWidth  = Math.round(bw * imageScale);
    imageHeight = Math.round(bh * imageScale);
    canvas.width  = imageWidth;
    canvas.height = imageHeight;
}

// The scale to use on this screen at this moment
function chooseImageScale() {
    // The scale which would give exactly one image pixel per screen pixel: screen pixels across the chamber
    // (which grow when the user zooms in), divided by canvas pixels across the chamber
    const pinchZoom = (window.visualViewport && window.visualViewport.scale) || 1;
    const matchingImageScale = canvas.clientWidth * (window.devicePixelRatio || 1) * pinchZoom / bw;

    // On the graphics card: the finest scale if that is asked for, otherwise exactly the matching scale
    // (rounded a little, so that a tiny change of the window changes nothing)
    if (useWebGL && alwaysFinestImage) return imageScaleLimit;
    if (useWebGL) return Math.min(imageScaleLimit, Math.max(minImageScale, Math.round(matchingImageScale * 20) / 20));

    // On the processor: the finest of the scales 0.6, 0.8, 1.0 which is not (noticeably) finer than that.
    // Anything in between costs more than the step below it for a gain which cannot be seen.
    var chosen = minImageScale;
    while (chosen + imageScaleStep <= Math.min(imageScaleLimit, matchingImageScale + 0.05) + 1e-9) chosen += imageScaleStep;
    return chosen;
}
setImageScale(chooseImageScale());

// Solid objects in the chamber (the radioactive sources) are drawn on a second canvas, underneath the picture
// of the mist (see source_images.js). It is drawn rarely, so it can afford at least one pixel per canvas pixel,
// and more if the picture of the mist is finer than that, so that the objects are as sharp as the mist.
var objectsCanvas = document.getElementById('objectsCanvas');
var objectsContext = objectsCanvas.getContext('2d');
function sizeObjectsCanvas() {
    const objectsScale = Math.max(1, imageScale);
    objectsCanvas.width  = Math.round(bw * objectsScale);
    objectsCanvas.height = Math.round(bh * objectsScale);
    // Everything is still drawn in canvas pixels, and stretched onto the pixels of this canvas
    objectsContext.setTransform(objectsScale, 0, 0, objectsScale, 0, 0);
}
sizeObjectsCanvas();

// Camera and lighting (see image_class.js)
const exposure = 1.3;               // how quickly light turns into brightness: brightness = 1 - exp(-exposure * light)
const exposureTableMax = 8;         // light above this amount is treated as this amount (it is fully white anyway)
const glowStrength = 0.25;          // fraction of the light which is spread out into a soft glow around its source
// Size of the round spot which a droplet makes in the picture (at resolutions above referenceImageScale, where there
// are enough pixels to draw one). The radius of the spot is this many times 1.67 canvas pixels. A smaller spot is
// brighter in its centre, since it holds the same light: crisper droplets. A larger one gives softer, mistier droplets.
// On the processor, below about 1 the spot becomes too small for the pixels to draw it evenly.
// (This is for the picture drawn by the processor. The graphics card draws crisp droplets instead, see below.)
const dropletSpotRadius = 1.15;
// On the graphics card there are enough pixels to draw a droplet as what it is: a tiny, evenly bright disc with
// a sharp edge, which stays sharp when the user zooms in. Its radius is in canvas pixels (0.6 is 0.08 mm in the
// 20 cm wide chamber, about the size of the dots in the old animations made with Python).
// A droplet always scatters the same light, so a smaller disc is a brighter one.
const crispDropletRadius = 0.6;
// How soft the edge of that disc is: 0 is a perfectly sharp edge, 1 is a spot which fades all the way from its centre.
// The brightness falls from full to nothing between (1 - softness) and (1 + softness) times the radius.
const crispDropletSoftness = 0.5;
const glowCell = 4;                 // the glow is worked out on a grid of cells of this many image pixels (at referenceImageScale), so it is a few cells wide
const lampFalloff = 0.3;            // the lamp is on the left: droplets at the right edge receive this much less light
const mistColour = 0xfff4ea;        // colour of the droplets as blue, green, red (two hex digits each): white, slightly cool

// Sensitive layer: droplets only condense in a thin layer of the chamber, which we look at face on.
// Particles cross it at an angle, so most tracks begin and end in the middle of the picture.
const layerThickness = 0.075 * bw;  // canvas pixels (1.5 cm for the 20 cm wide chamber)
const layerEdge = 0.2;              // fraction of the thickness over which tracks fade in and out at each face
// How steeply random particles cross the layer: the sine of the angle between their direction and the layer
// is picked at random between -dipSpread and +dipSpread. With 1 all directions are equally likely and most tracks
// are short stubs, with 0 every particle stays in the layer for its whole track.
const dipSpread = 0.35;

// Moving gas: the gas drifts in slow swirls and carries every droplet along (see flow_class.js)
const flowSpeed = 1.8 * scale;      // typical speed of the gas, canvas pixels per second (1.2 mm per second)
const flowWaves = 4;                // number of waves which make up the swirls
const flowWavelengthMin = 0.4;      // size of the swirls, as a fraction of the chamber width
const flowWavelengthMax = 1.2;
const flowChangeRate = 0.15;        // how quickly the swirls change (radians per second)
const flowCell = 15 * scale;        // distance between the grid points on which the flow is worked out (canvas pixels)

// Droplet style
// Everything seen in the chamber is made of individual droplets, each with its own life (see droplet_class.js).
// A droplet appears, is carried along by the gas, and fades away as it sinks out of the sensitive layer.
// Times are in seconds on the droplet clock.
const dropletTwinkle = 0.15;        // fraction of a droplet's brightness which flickers from frame to frame
const dropletGrowTime = 0.08;       // time a droplet takes to appear
const dropletLifeMin = 1.0;         // shortest life of a droplet on a track
const dropletLifeMax = 2.6;         // longest
const dropletDrift   = 7  * scale/5;    // each droplet also drifts randomly on its own (canvas pixels per second)

// Droplet clock in slow motion:
//      0   droplets always age in real time, so a slowly drawn track is only ever a short comet tail
//      1   droplets are slowed down exactly as much as the particles, so in slow motion tracks practically never dissolve
// In between, droplets are slowed down less than the particles.
const dropletSlowMotion = 0.5;

// Background mist: droplets condense by themselves all over the chamber, all the time. Each one is faint,
// but there are thousands of them, so the chamber is filled with a fine mist which drifts with the gas.
const backgroundCount = 12000;      // typical number of mist droplets in the chamber at any moment
const backgroundLifeMin = 1.5;      // seconds
const backgroundLifeMax = 5.0;
const backgroundDrift   = 3  * scale/5;     // each droplet also drifts randomly on its own (canvas pixels per second)
// Most mist droplets are faint and a few are bright: brightness = faintest + (brightest - faintest) * random^contrast
const backgroundFaintest = 0.1;
const backgroundBrightest = 1.0;
const backgroundContrast = 4;       // the higher, the rarer the bright ones
// The mist is not even: it is thicker in some patches than in others, and the patches shift slowly (see flow_class.js)
const mistPatchiness = 0.85;        // 0 is perfectly even mist, 1 means the thinnest patches are empty
const mistPatchSizeMin = 0.3;       // size of the patches, as a fraction of the chamber width
const mistPatchSizeMax = 0.9;
const mistChangeRate = 0.1;         // how quickly the patches shift (radians per second)

// Trail shape
const trailWobble = 0.3;                // the trail width wanders by about this fraction along the track
const trailWobbleLength = 40 * scale/5; // canvas pixels of path over which the width changes noticeably

// Ionisation: how heavily a particle ionises the gas decides how many droplets it leaves and how wide its trail is.
// It depends only on the charge and the speed of the particle (the leading part of the Bethe formula),
//      ionisation = charge^2 / beta^2,       beta = speed / speed of light,
// so it equals 1 for a fast particle of unit charge, and grows as the particle slows down.
// A 5 MeV alpha (charge 2, beta 0.05) ionises about 1500 times more heavily than a fast muon. Drawing 1500 times
// more droplets is neither possible nor useful, so the trail responds to ionisation in a compressed way:
//      droplets per pixel = mipDropletsPerPixel * ionisation^0.25 * (1 + ionisation/ionisationKnee)^0.75
//      trail width        = mipTrailSigma       * ionisation^0.15 * (1 + ionisation/ionisationKnee)^0.35
// Below the knee the trail grows slowly with ionisation, above it (alphas) the number of droplets grows in proportion.
const mipDropletsPerPixel = 0.6;    // droplets per canvas pixel of path for ionisation = 1 (sparse enough to look beaded)
// A track can be made of fewer, brighter droplets or of more, fainter ones, with the same amount of light in total.
// trackFineness multiplies the number of droplets on a track and divides the brightness of each by the same factor:
// 1 gives a grainy track made of distinct specks, higher values give a smoother thread of mist (and cost more to draw).
// Droplets are cheap for the graphics card, and cost the processor more, so the processor version uses fewer.
const trackFineness = useWebGL ? 7 : 3;
const mipTrailSigma = 0.75 * scale/5;   // spread of droplets across the trail for ionisation = 1 (canvas pixels)
const ionisationKnee = 1100;
const ionisationCap = 4000;         // largest ionisation, reached by particles which have almost stopped

// Energy loss: the energy which a particle spends on ionising the gas is taken from its motion, for every species:
//      loss of kinetic energy per unit of path  ~  ionisation  =  charge^2 / beta^2.
// With kinetic energy (gamma - 1) * mass this means that beta^4 decreases steadily along the path,
//      d(beta^4) / d(path)  =  - 4 * energyLossRate * charge^2 / (mass * gamma^3),
// until the particle stops. A slow, heavily charged particle stops quickly and a fast or heavy one hardly slows down at all.
// The single constant energyLossRate (defined below the masses) is fixed by one real measurement:
const alphaRangeRef = 0.2;          // an alpha stops after this fraction of the chamber width...
const alphaBetaRef = 0.052;         // ...if it starts with this beta (5 MeV, about 4 cm in air, so the chamber is 20 cm wide)
// Everything else then follows, and comes out close to the real ranges in air: a proton with beta 0.1 goes 55 cm,
// an electron with beta 0.5 goes 20 cm, an electron with beta 0.2 only half a centimetre, and muons never stop.

// Multiple scattering: a particle is deflected a little by every gas atom it passes, so its direction wanders at random.
// Over a short piece of path the direction turns by a random angle whose typical size is
//      scatter * sqrt(path length),       scatter = scatterStrength * |charge| / (mass * gamma * beta^2),
// (the leading part of the Highland formula, the angle goes like charge / (momentum * beta)).
// Light, slow particles scatter the most: electrons wander visibly, while muons, protons and alphas stay straight.
// For the 20 cm wide chamber filled with air, the real value of scatterStrength is about 1e-2. At that strength an
// electron turns by most of a radian during a single turn of its spiral, so its track is a tangle and not a spiral.
// The value below is a fifth of the real one: spirals are ragged and their turns cross, but they are still spirals.
const scatterStrength = 2e-3;       // radians per square root of a canvas pixel, for charge = mass = gamma * beta^2 = 1
const scatterMax = 0.05;            // largest scatter, reached by electrons which have almost stopped

// Delta rays: now and then a particle knocks an electron out of a gas atom hard enough for it to leave its own short track.
// The number of delta rays per pixel of path is
//      deltaRayRate * charge^2 / beta^2 * (1 - deltaBetaMin^2 / fastest^2),
// where fastest is the highest beta a knocked-on electron can have: twice the beta of a heavy particle,
// or 0.7 times the beta of an electron (which can give up at most half of its energy).
// Alphas are too slow to make visible delta rays. Fast muons make few, but energetic ones.
// The particle pays for each delta ray: it loses the energy and the momentum which the electron carries away,
// so an electron visibly changes direction where it knocks on another electron, and a heavy particle carries on undisturbed.
const deltaRayRate = 1.2e-4;        // per canvas pixel of path (the real value for the 20 cm wide chamber filled with air)
const deltaBetaMin = 0.2;           // slower knocked-on electrons (below 10 keV) stop too soon to be seen

// Physical constants
// Simulation time is measured in "ticks". Velocities are in canvas pixels per tick,
// and a particle turns by (q * Bz * dt / m) radians per tick in a magnetic field.
const twoPI = 2*Math.PI;
const dt = 0.005;
const lightSpeed = 35 * scale;      // canvas pixels per tick, so beta = speed / lightSpeed
const stopBeta = 0.015;             // a particle which has slowed down to this beta has stopped
const magScale = 32 * scale;        // an electron turns by magScale * dt / gamma radians per tick

// Real units: the chamber is 20 cm wide (see the energy loss section), and light covers lightSpeed canvas pixels per tick,
// which fixes how much real time one tick stands for (78 picoseconds)
const chamberWidthMetres = 0.2;
const realLightSpeed = 299792458;   // metres per second
const secondsPerTick = (lightSpeed / bw) * chamberWidthMetres / realLightSpeed;

// Simulation clock: the speed slider sets how many ticks of simulation time pass per second of real time.
// It never changes the physics, only how fast we watch it.
const minTicksPerSecond = 2;      // slider at 1:   slow motion, watch the spirals being drawn
const maxTicksPerSecond = 4000;   // slider at 100: tracks appear nearly instantaneously
const maxFrameTime = 0.05;        // seconds, ignore longer gaps between frames (e.g. after a stall)

// Fixed physics substep: chosen once per particle so that no substep moves further than
// maxSubstepDistance (canvas pixels) or turns by more than maxSubstepTurn (radians).
const maxSubstepDistance = 0.8 * scale;
const maxSubstepTurn = 0.02;

// Trail: droplets are attempted once every dropletSpacing canvas pixels of path length
const dropletSpacing = 1;

const m_e   = 1;    
const m_mu  = 200*m_e;
const m_p   = 9*m_mu;
const m_a   = 4*m_p ;

// See the energy loss section above: chosen so that the reference alpha stops after the reference range
const energyLossRate = m_a * Math.pow(alphaBetaRef, 4) / (4 * 2*2 * alphaRangeRef * bw);    // per canvas pixel

// Properties are:   charge,   mass,   slowest beta,  fastest beta
const properties = [[ -1,      m_e,    0.35,          0.85 ],       // e-
                    [ +1,      m_e,    0.35,          0.85 ],       // e+
                    [ -1,      m_mu,   0.75,          0.99 ],       // mu-
                    [ +1,      m_mu,   0.75,          0.99 ],       // mu+
                    [ +2,      m_a,    0.042,         0.066],       // alpha
                    [ +1,      m_p,    0.08,          0.4  ]];      // proton
// charge:      electric charge, controls the bending if magnetic field is on, Bz != 0, and the ionisation
// mass:        controls the bending as well, and how quickly the particle is slowed down by its energy loss
// beta:        range of speeds (as a fraction of the speed of light) with which a random particle of this species is created.
//              Cosmic muons are fast, alphas from radioactive decay are slow (3 to 8 MeV), protons are in between.

// Natural rates: how many particles per second cross a chamber of this size (20 cm x 12 cm, sensitive layer 1.5 cm)
// at sea level. This is what the Random button produces. The particles arrive at random moments.
//      Cosmic muons:       about 1 per square cm per minute, so 4 per second through 240 square cm,
//                          somewhat more positive than negative ones.
//      Cosmic electrons:   the soft part of the cosmic rays, about a quarter of the total.
//      Cosmic protons:     1 to 2 percent of the total.
//      Alphas:             from radon in the air (20 to 100 decays per second per cubic metre indoors).
//      Gamma rays:         gamma rays from the surroundings leave no track themselves. We only count the ones which
//                          do something in the chamber: nearly always they knock an electron out of the gas or the
//                          walls, which starts anywhere in the chamber, in any direction on screen, and is fairly slow.
//                          This rate is the least certain one, it depends on what the chamber and the room are made of.
// Rates are per second, in the same order as the properties: e-, e+, mu-, mu+, alpha, proton
const naturalRates = [0.6, 0.4, 1.6, 2.0, 0.035, 0.05];
const gammaRate = 1.5;
const gammaElectronBetaMin = 0.3;   // range of speeds of the electrons knocked out by gamma rays
const gammaElectronBetaMax = 0.7;

// Outcomes: what happens to a particle is decided at random when it is created.
// The "Activate event" buttons create the same particles, but with the outcome fixed.
// Both chances are far higher here than in nature, so that these events turn up now and then:
//      - only about 1 in 100000 cosmic muons is slow enough to stop in 1.5 cm of gas;
//      - only gamma rays above 1.02 MeV can make a pair at all, and even those rarely do.
const muonDecayChance = 0.03;       // chance that a muon is a slow one, which stops inside the chamber and decays
const gammaPairChance = 0.03;       // chance that a gamma ray makes an electron-positron pair instead of knocking out an electron

// Events
// Pair production: a gamma ray, which we cannot see, turns into an electron and a positron in the middle of the gas
const pairBetaMin = 0.75;           // range of speeds of the two particles
const pairBetaMax = 0.95;
const pairAngleMin = 0.05;          // range of the angle between each particle and the direction of the gamma ray (radians)
const pairAngleMax = 0.2;
// Muon decay: a slow muon stops inside the chamber. It then decays into an electron (and two neutrinos, which we cannot see).
// A fast muon also decays in the end, but long after it has left the chamber.
const decayMuonRangeMin = 0.3;      // how far the muon travels in the chamber before it stops, as a fraction of the chamber width
const decayMuonRangeMax = 0.5;
const decayElectronBeta = 0.98;     // the electron is very fast: it takes up to half of the rest energy of the muon

// Radioactive sources (the "Activate source" buttons). A source is a solid object in the middle of the chamber
// (their pictures are in source_images.js). Only one source is active at a time.
// Energies are kinetic energies in MeV, as found in tables of radioactive decays. Sizes are fractions of the chamber width.
// Every source except the round button is put into the chamber in a new, random direction each time it is
// switched on: that direction is its angle (radians, 0 is to the right).
//
// The button and the rod lie on the floor of the chamber, just below the sensitive layer.
// Their alphas start at the surface of the object and travel upwards into the layer.
const sourceFloorDepth = 0.15 * layerThickness;     // depth at which particles leave an object on the floor
const electronRestEnergy = 0.511;   // MeV
const alphaRestEnergy = 3727;       // MeV
const sources = {
    // Americium-241: every alpha has the same energy, so every track has the same length (unless it leaves the layer)
    "Am-241": {
        rate: 3,                                    // particles per second
        alphaEnergies: [5.49],
        alphaShares:   [1],
        shape: "button",                            // a metal button as found in a smoke detector...
        radius: 0.0125,                             // ...5 mm across...
        foilRadius: 0.005                           // ...with the americium in a foil 2 mm across in its centre
    },
    // Thorium-232 with all of its decay products (a thoriated welding rod, a gas mantle): six different alphas,
    // from 2.5 cm to 12 cm long here. One of the products is a gas, thoron (radon-220), which escapes from the rod.
    // A thoron atom emits an alpha somewhere in the gas and becomes polonium-216, which emits a second alpha
    // from the same spot a fraction of a second later: two tracks in the shape of a V.
    "Th-232": {
        rate: 3,
        alphaEnergies: [4.01, 5.42, 5.69, 6.05, 8.78],    // Th-232, Th-228, Ra-224, Bi-212, Po-212
        alphaShares:   [1,    1,    1,    0.36, 0.64],
        thoronRate: 0.6,                            // V's per second
        thoronSpread: 0.12,                         // how far the gas spreads from the rod
        thoronEnergies: [6.29, 6.78],               // Rn-220, then Po-216
        thoronDelay: 0.21,                          // average wait for the second alpha, seconds (half-life 0.145 s)
        shape: "rod",                               // a thoriated welding rod: alphas leave it anywhere along its length
        length: 0.25,                               // 5 cm
        thickness: 0.012,                           // 2.4 mm
        angle: 0                                    // direction in which its red tip points
    },
    // Strontium-90 (and its decay product yttrium-90): electrons. In a beta decay the energy is shared at random
    // with a neutrino, so the electrons have every energy from zero up to the endpoint energy of the decay.
    "Sr-90": {
        rate: 4,
        betaSpecies: 0,                             // e-
        betaEndpoints: [0.546, 2.28],               // Sr-90, Y-90 (equally often)
        shape: "needle",                            // a steel needle with the strontium on its point, which is in the middle
        length: 0.22,                               // of the chamber, half way through the sensitive layer. 4.4 cm long...
        thickness: 0.005,                           // ...1 mm thick...
        handle: "cork",                             // ...and stuck in a cork
        handleLength: 0.07,
        handleThickness: 0.035,
        angle: 0                                    // direction from the point towards the handle
    },
    // Sodium-22: the same, with positrons
    "Na-22": {
        rate: 4,
        betaSpecies: 1,                             // e+
        betaEndpoints: [0.546],
        shape: "needle",                            // the same needle, in a blue plastic handle
        length: 0.22,
        thickness: 0.005,
        handle: "plastic",
        handleLength: 0.07,
        handleThickness: 0.035,
        angle: 0
    },
    // Caesium-137: gamma rays, which leave no track. Now and then one of them knocks an electron out of the gas
    // (Compton scattering), anywhere in the chamber, and that electron is what we see.
    "Cs-137": {
        rate: 4,                                    // visible electrons per second
        gammaEnergy: 0.662,
        gammaReach: 0.5,                            // how far from the source electrons are still made
        shape: "capsule",                           // sealed in a small capsule of stainless steel...
        length: 0.06,                               // ...12 mm long...
        thickness: 0.03,                            // ...and 6 mm thick
        angle: 0                                    // direction in which it lies
    }
};

// Dictionaries
var nameToSpecies = {"e-":0, "e+":1, "mu-":2, "mu+":3, "a+":4, "p+":5};
var speciesToName = {0:"e-", 1:"e+", 2:"mu-", 3:"mu+", 4:"a+", 5:"p+"};

// Initialise buttons
var clickedParticle = 'e-';
var clickedField = 'off';
var realisticPhysics = true;
let randomButtonTimeoutID;
let useProgressive = true;