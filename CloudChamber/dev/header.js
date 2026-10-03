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

// The picture itself has fewer pixels than that: imageScale image pixels per canvas pixel.
// This costs less to draw, and a droplet smaller than an image pixel looks like a soft speck of mist.
const imageScale = 0.6;
const imageWidth  = Math.round(bw * imageScale);
const imageHeight = Math.round(bh * imageScale);
canvas.width  = imageWidth;
canvas.height = imageHeight;

// Camera and lighting (see image_class.js)
const exposure = 1.3;               // how quickly light turns into brightness: brightness = 1 - exp(-exposure * light)
const exposureTableMax = 8;         // light above this amount is treated as this amount (it is fully white anyway)
const glowStrength = 0.35;          // fraction of the light which is spread out into a soft glow around its source
const glowCell = 4;                 // the glow is worked out on a grid of cells of this many image pixels, so it is a few cells wide
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
const dropletTwinkle = 0.3;         // fraction of a droplet's brightness which flickers from frame to frame
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
//      Gamma electrons:    electrons knocked out of the gas and the walls by gamma rays from the surroundings.
//                          They start anywhere in the chamber, in any direction on screen, and are fairly slow.
//                          This rate is the least certain one, it depends on what the chamber and the room are made of.
// Rates are per second, in the same order as the properties: e-, e+, mu-, mu+, alpha, proton
const naturalRates = [0.6, 0.4, 1.6, 2.0, 0.035, 0.05];
const gammaElectronRate = 1.5;
const gammaElectronBetaMin = 0.3;   // range of speeds of gamma electrons
const gammaElectronBetaMax = 0.7;

// Events (the "Activate event" buttons)
// Pair production: a gamma ray, which we cannot see, turns into an electron and a positron in the middle of the gas
const pairBetaMin = 0.75;           // range of speeds of the two particles
const pairBetaMax = 0.95;
const pairAngleMin = 0.05;          // range of the angle between each particle and the direction of the gamma ray (radians)
const pairAngleMax = 0.2;
// Muon decay: a slow muon stops inside the chamber. It then decays into an electron (and two neutrinos, which we cannot see)
const decayMuonRangeMin = 0.3;      // how far the muon travels in the chamber before it stops, as a fraction of the chamber width
const decayMuonRangeMax = 0.5;
const decayElectronBeta = 0.98;     // the electron is very fast: it takes up to half of the rest energy of the muon
// Alpha source: a speck of radioactive material (such as americium-241) in the middle of the chamber.
// All of its alphas have the same energy, so their tracks all have the same length.
const alphaSourceRate = 3;          // alphas per second
const alphaSourceBeta = 0.054;      // 5.5 MeV
const alphaSourceRadius = 1.6 * scale;  // size of the speck, canvas pixels (1 mm)
const alphaSourceLight = 0.5;       // how bright the speck itself appears

// Dictionaries
var nameToSpecies = {"e-":0, "e+":1, "mu-":2, "mu+":3, "a+":4, "p+":5};
var speciesToName = {0:"e-", 1:"e+", 2:"mu-", 3:"mu+", 4:"a+", 5:"p+"};

// Initialise buttons
var clickedParticle = 'e-';
var clickedField = 'off';
var realisticPhysics = true;
let randomButtonTimeoutID;
let useProgressive = true;