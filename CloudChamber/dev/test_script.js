var sumValue = document.getElementById("sumValue");

// Rescale canvas in case distorted
// COULD IMPLEMENT WINDOW.RESIZE()
var canvas = document.getElementById(`particlesCanvas`);
var distortionRatio = canvas.clientWidth/canvas.clientHeight;
scale = 5;
canvas.width *= scale;
canvas.height = canvas.width / distortionRatio;

// main box width, box height and box padding
const bw = canvas.width;
const bh = canvas.height;
const p = 10;
const rectWidth = 1;        // diffusion fillRect widths

//--------- Control magnetic field, speed of particles
const Bz    = 0;       // magnetic field in z direction, assuming screen is the xy plane
const speedUp = 5;

const m_e   = 0.5;    // in MeV
const m_mu  = 100;
const m_p   = 940;
const m_a   = 4*m_p ;

// Properties are:  trailWidth,  diffusion,  charge, mass,
const properties = [[5,         0.2,         -1,      m_e],      // e-
                    [5,          0.2,         +1,      m_e],      // e+
                    [5,          0.1,         -1,      m_mu],     // mu-
                    [5,          0.1,         +1,      m_mu],     // mu+
                    [10,         0.4,       +1,      m_a],      // alpha
                    [5,          0,         +1,      m_p]];     // proton
// trailWidth:  sets the width of the trail (will use fillRects(squaresRelToParticlePos))
// diffusion:   coefficient of diffusion, the further away from the original particle the less diffusion is drawn
// charge:      electric charge, controls the bending if magnetic field is on, Bz != 0
// mass:        mass in MeV, controls the bending as well

var nameToSpecies = {"e-":0, "e+":1, "mu-":2, "mu+":3, "a+":4, "p+":5};
var speciesToName = {0:"e-", 1:"e+", 2:"mu-", 3:"mu+", 4:"a+", 5:"p+"};

var testCC = new CloudChamber(canvas);