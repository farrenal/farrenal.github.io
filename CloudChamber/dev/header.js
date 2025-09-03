// Get text box to display debugging info
var debugText = document.getElementById('debugText');

// Get main canvas element
var canvas = document.getElementById('particlesCanvas');

// Rescale canvas in case distorted
var distortionRatio = canvas.clientWidth/canvas.clientHeight;
scale = 5;
canvas.width *= scale;
canvas.height = canvas.width / distortionRatio;

// Main canvas box width, box height and box padding
const bw = canvas.width;
const bh = canvas.height;
const p = 10;
const rectWidth = 1;        // diffusion fillRect widths

const m_e   = 0.5;    // in MeV
const m_mu  = 100;
const m_p   = 940;
const m_a   = 4*m_p ;

// Properties are:  trailWidth,  diffusion,  charge, mass,
const properties = [[ 3,         0.3,         -1,      m_e ],      // e-
                    [ 3,         0.3,         +1,      m_e ],      // e+
                    [ 3,         0.3,         -1,      m_mu],     // mu-
                    [ 3,         0.3,         +1,      m_mu],     // mu+
                    [10,         0.1,         +2,      m_a ],      // alpha
                    [ 5,         0.3,         +1,      m_p ]];     // proton
// trailWidth:  sets the width of the trail (will use fillRects(squaresRelToParticlePos))
// diffusion:   coefficient of diffusion, the further away from the original particle the less diffusion is drawn
// charge:      electric charge, controls the bending if magnetic field is on, Bz != 0
// mass:        mass in MeV, controls the bending as well

var nameToSpecies = {"e-":0, "e+":1, "mu-":2, "mu+":3, "a+":4, "p+":5};
var speciesToName = {0:"e-", 1:"e+", 2:"mu-", 3:"mu+", 4:"a+", 5:"p+"};

// Initialise buttons
var clickedParticle = 'e-';
var clickedField = 'off';
let randomButtonTimeoutID;
