// Get main canvas element
var canvas = document.getElementById('latticeCanvas');
var context2d = canvas.getContext('2d');

// The lattice. Every site is one pixel of the canvas, and the browser stretches the canvas over the frame
// without blurring it (see potts_styles.css). All sizes have the shape of the frame, 5 wide for 3 high.
// The first one is the lattice of the old animations made with Python.
const latticeSizes = [[150, 90], [300, 180], [600, 360]];
const startLatticeSize = 0;         // which of them the page starts with

// Colour of a site in each of the states s = 0, 1, 2, 3, 4 (the same colours as in the report)
const stateColours = ['#440154', '#fde725', '#21918c', '#31688e', '#7ad151'];

// Physics, exactly as in the Python code which made the old animations (see section 2.1 of the report).
//
// The energy of the lattice is
//      - 2J * (number of pairs of neighbours in the same state)  -  H * (number of sites in the state along the field).
// One step of the Metropolis-Hastings algorithm picks a site at random and proposes a new state for it, also at random.
// The energy would change by
//      dE = 2J * (neighbours in the current state - neighbours in the proposed state)
//           + H * ((1 if the current state is along the field) - (1 if the proposed state is along the field)).
// The proposal is accepted if dE <= 0, and otherwise with the chance exp(-dE / T).
// Before that, dE is divided by 2J, so one pair of neighbours is worth 1 and the temperature is in units of J/kB.
const J = 10;                       // coupling constant, in the units in which H is given
const fieldDirection = 0;           // the state which is along the magnetic field
// A site has 8 neighbours: left, right, above, below and the four diagonal ones (which make the domains rounder,
// see footnote 4 of the report). The lattice wraps around: the right edge is next to the left edge, and the top to the bottom.
const neighbourCount = 8;

// Values of q which can be chosen, and for each of them the temperatures and fields of the old gallery
// (the table at the end of the report). They are the buttons underneath the two sliders.
//      T: low, below critical, above critical, high        (in units of J/kB)
//      H: none, weak, medium, strong
const presets = {
    2: {T: [0.5, 2.0, 2.5, 5.0], H: [0, 1, 5, 10]},
    3: {T: [0.5, 1.5, 2.0, 4.0], H: [0, 3, 8, 15]},
    4: {T: [0.5, 1.5, 2.0, 3.5], H: [0, 5, 10, 25]},
    5: {T: [0.5, 1.5, 2.0, 3.0], H: [0, 5, 15, 35]}
};
// What the page starts with: q = 3 just above its critical temperature in a weak field, like the old gallery
const startQ = 3;
const startTemperaturePreset = 2;
const startFieldPreset = 1;

// Simulation clock. Time is measured in "sweeps": one sweep is one proposal for every site of the lattice
// (width * height steps of the algorithm), so a lattice of any size evolves equally fast on screen.
// The speed slider sets how many sweeps pass per second. It never changes the physics, only how fast we watch it.
// The old animations did 4000 steps per frame at 30 frames per second on 150 x 90 sites: 8.9 sweeps per second.
const minSweepsPerSecond = 0.5;     // slider at 1
const maxSweepsPerSecond = 200;     // slider at 100
const maxFrameTime = 0.05;          // seconds, ignore longer gaps between frames (e.g. after a stall)
// The steps for one frame must not take longer than this many milliseconds. On a slow device with a large lattice
// and a high speed they would: the rest of the steps is then dropped, and the lattice simply evolves more slowly.
const frameBudget = 10;
const stepChunk = 20000;            // the clock is looked at once every this many steps
const speedReadoutInterval = 0.5;   // seconds between two measurements of the speed which is really reached
