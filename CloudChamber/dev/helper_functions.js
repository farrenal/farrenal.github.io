//--------------- Diffusion utils --------------------------------------------------------
// Create droplets along the straight piece of path which appears on screen as the line from (x0, y0) to (x1, y1).
//
//        .   .        .
//     . : .: :. :. . : .:  .       droplets condense in a cloud around the path which follows a bell curve:
//  ----->----->----->----->-----   dense on the path itself, thinning out gradually,
//     ' : ': :' :' ' : ':  '       so the trail has no sharp edge
//        '   '        '
//
// pathLength: the true length of this piece of path in three dimensions. If the particle also moves along the depth,
//             this is longer than the line on screen, and the droplets appear more crowded (as they should).
// visibility: between 0 and 1, the fraction of droplets which condense at the current depth in the sensitive layer.
//
// Droplets are created at a fixed rate per pixel of PATH LENGTH, and the leftover length is
// carried to the next call. The trail therefore looks the same however the path is cut into pieces,
// i.e. it does not depend on the substep or on the animation speed.
function depositDroplets(particle, x0, y0, x1, y1, pathLength, visibility){
    if (pathLength == 0) return;
    var dx = x1 - x0;
    var dy = y1 - y0;

    // Set by the ionisation of the particle at its current speed
    var rate = particle.dropletsPerPixel * dropletSpacing * visibility;
    var baseSigma = particle.trailSigma;
    var maxSize = particle.maxDropletSize;

    // The width wanders smoothly along the track: each step it is pulled back towards zero and kicked at random
    var pull = dropletSpacing / trailWobbleLength;
    var kick = trailWobble * Math.sqrt(2 * pull);

    var along = particle.depositCarry;
    for (; along < pathLength; along += dropletSpacing) {
        particle.widthWobble += -pull * particle.widthWobble + kick * randomGaussian();
        var sigma = baseSigma * Math.max(0.4, 1 + particle.widthWobble);

        // Whole number of droplets here, with the fractional part of the rate decided at random
        var count = Math.floor(rate);
        if (Math.random() < rate - count) count++;

        // Point on the path, as seen on screen
        var fraction = along / pathLength;
        var path_x = x0 + fraction * dx;
        var path_y = y0 + fraction * dy;

        for (var n = 0; n < count; n++) {
            // Offset from the path, in units of the trail width. The cloud is equally wide in every direction,
            // so that it looks right whichever way the path points (including straight towards us).
            var offset_x = randomGaussian();
            var offset_y = randomGaussian();
            var distance = Math.sqrt(offset_x*offset_x + offset_y*offset_y);

            // Biggest droplets in the core of the trail, the smallest at the fringe
            var size = 1 + Math.floor(Math.random() * maxSize * Math.exp(-0.7 * distance));
            var brightness = 0.5 + 0.5 * Math.random();

            particle.addDroplet(path_x + sigma * offset_x, path_y + sigma * offset_y, size, brightness);
        }
    }
    particle.depositCarry = along - pathLength;
}

//--------------- Radioactivity utils --------------------------------------------------------
// Speed (as a fraction of the speed of light) of a particle with this kinetic energy and rest energy (same units):
// gamma = 1 + kinetic energy / rest energy,  beta = sqrt(1 - 1/gamma^2)
function betaFromEnergy(kineticEnergy, restEnergy){
    var gamma = 1 + kineticEnergy / restEnergy;
    return Math.sqrt(1 - 1 / (gamma * gamma));
}

// Pick one of the values at random, each as often as its share says
function pickByShare(values, shares){
    var pick = Math.random() * shares.reduce((sum, share) => sum + share, 0);
    for (var n = 0; n < values.length; n++) {
        pick -= shares[n];
        if (pick < 0) return values[n];
    }
    return values[values.length - 1];
}

// How often an electron leaves a beta decay with kinetic energy T (MeV), if the decay has the given endpoint energy:
//      number ~ momentum * total energy * (endpoint - T)^2
// (the simplest form of the beta spectrum: no electrons at zero energy, none at the endpoint, most in between)
function betaSpectrum(T, endpoint){
    var momentum = Math.sqrt(T * T + 2 * T * electronRestEnergy);
    return momentum * (T + electronRestEnergy) * (endpoint - T) * (endpoint - T);
}

// Random kinetic energy (MeV) from that spectrum: pick an energy at random, and accept it with a chance
// in proportion to the height of the spectrum there, otherwise pick again
function randomBetaEnergy(endpoint){
    var highest = 0;
    for (var n = 1; n < 40; n++) highest = Math.max(highest, betaSpectrum(endpoint * n / 40, endpoint));
    while (true) {
        var T = endpoint * Math.random();
        if (Math.random() * 1.05 * highest < betaSpectrum(T, endpoint)) return T;
    }
}

// Random number from a bell curve with mean 0 and standard deviation 1 (Box-Muller)
function randomGaussian(){
    return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(twoPI * Math.random());
}

//------- Event listeners ----------------------------------------------------------------------------------------------------------------
document.addEventListener("mousemove", (e) => {cursor.x = e.clientX; cursor.y = e.clientY;});
const cursor = {x: bw/2, y: bh/2};

// Listen for magnetic field changes
var speedSlider = document.getElementById('speedSlider');
var speedSliderText = document.getElementById('speedSliderText');
var speedUp = speedSlider.value;

speedSlider.oninput = function() {
    speedUp = this.value;
    theCC.setAnimationSpeed(Number(speedUp));
}

// A large number in words, to two digits: 140000000 becomes "140 million"
function numberInWords(number) {
    const names = [[1e9, " billion"], [1e6, " million"], [1e3, " thousand"]];
    for (const [size, name] of names) {
        if (number >= size) return Number((number / size).toPrecision(2)) + name;
    }
    return String(Number(number.toPrecision(2)));
}

// Tell the user what the speed slider means, next to the label of its panel and in the tooltip of the slider.
// Particles: one tick of simulation time stands for secondsPerTick of real time, and ticksPerSecond of them are
// shown per second. Mist: droplets are slowed down by 1 / dropletClockRate (see CloudChamber.setAnimationSpeed).
function updateSpeedReadout(chamber) {
    if (!speedSliderText) return;
    const particlesSlower = 1 / (chamber.ticksPerSecond * secondsPerTick);
    const mistSlower = 1 / chamber.dropletClockRate;

    if (Number(speedSlider.value) >= Number(speedSlider.max)) {
        // Even here a particle is millions of times slower than a real one, but its track forms within
        // one frame of the animation, and a real track would not look any different
        speedSliderText.textContent = "real time";
        speedSlider.title = "The mist moves at its real speed. Tracks form within one frame, as fast as the eye can tell. "
                          + "(The particles are in fact still slowed down " + numberInWords(particlesSlower) + " times.)";
    }
    else {
        speedSliderText.textContent = "particles " + numberInWords(particlesSlower) + " × slower";
        speedSlider.title = "Particles are slowed down " + numberInWords(particlesSlower) + " times, so that you can watch a track being drawn. "
                          + "The mist is slowed down " + numberInWords(mistSlower) + " times.";
    }
}

function particleClicked(particleName) {
    clickedParticle = particleName;
    var species = nameToSpecies[particleName];
    theCC.generateRandomParticle(species);
}

// The event buttons create an ordinary gamma ray or muon, but with its outcome fixed instead of left to chance
function eventClicked(eventName) {
    if (eventName == 'pair') {
        theCC.generateGamma(true);
    }
    if (eventName == 'muonDecay') {
        const species = (Math.random() < 0.5) ? nameToSpecies['mu-'] : nameToSpecies['mu+'];
        theCC.generateRandomParticle(species, true);
    }
}

// Switch a source on, or off if it is the active one. Only one source is active at a time.
function toggleSource(sourceName) {
    theCC.setSource((theCC.activeSource == sourceName) ? null : sourceName);
    updateSourceButtons();
}

// The button of the active source stays marked
function updateSourceButtons() {
    document.querySelectorAll('.btn.s').forEach((button) => {
        button.classList.toggle('is-active', button.dataset.source == theCC.activeSource);
    });
}

// Colour a button for a moment to show that the click was received.
// flashClass (optional): which colour, see the .is-flash classes in CC_styles.css. Green if left out.
function flashButton(button, flashClass) {
    if (flashClass === undefined) flashClass = 'is-flash';
    button.classList.add(flashClass);
    window.setTimeout(() => button.classList.remove(flashClass), 250);
}

function fieldClicked(fieldStatus) {
    theCC.updateMagField(fieldStatus);
}

const randomButton = document.getElementById('randomButton');

// The Random button stays coloured while random particles are switched on,
// in a different colour while they wait for a paused animation to resume
function updateRandomButton() {
    randomButton.classList.toggle('is-active', Boolean(randomButtonTimeoutID));
    randomButton.classList.toggle('is-paused', randomButtonTimeoutID === "paused");
}

function toggleRandom() {
    // If an interval is already running, clear it
    if (randomButtonTimeoutID && randomButtonTimeoutID !== "paused") {
        clearTimeout(randomButtonTimeoutID);
        randomButtonTimeoutID = null;
        updateRandomButton();
        return;
    };
    // Otherwise start generating random particles
    randomLoop();
    updateRandomButton();
}

// Particles per second of all kinds together
function totalNaturalRate() {
    return naturalRates.reduce((sum, rate) => sum + rate, 0) + gammaRate;
}

function randomLoop() {
    // Particles arrive independently of each other, so the wait until the next one is random:
    // usually shorter than the average wait, now and then much longer.
    // In slow motion the arrivals are slowed down as much as the droplets are, otherwise slowly drawn tracks would pile up.
    var arrivalsPerSecond = totalNaturalRate() * theCC.dropletClockRate;
    var randomWaitTime = -Math.log(1 - Math.random()) / arrivalsPerSecond * 1000;   // milliseconds

    randomButtonTimeoutID = setTimeout(() => {
        theCC.generateNaturalParticle();
        // Restart loop
        randomLoop();
    }, randomWaitTime);
}

// The button shows what a click on it will do: pause while the animation runs, play while it is paused.
// It stays marked while the animation is paused.
function updatePausePlayButton() {
    const button = document.getElementById('pausePlay');
    const icon = button.querySelector('i');
    icon.textContent = theCC.isRunning ? 'pause' : 'play_arrow';
    button.classList.toggle('is-active', !theCC.isRunning);
}

document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        // If the tab is hidden, pause the cloud chamber 
        theCC.stop();
        // Pause the random generation
        if (randomButtonTimeoutID && randomButtonTimeoutID !== null) {
            clearTimeout(randomButtonTimeoutID);
            randomButtonTimeoutID = "paused";
        }
    } else {
        // If the tab is visible,
        theCC.start();
        // Restart random generation
        if (randomButtonTimeoutID === "paused") {
            randomButtonTimeoutID = null;
            toggleRandom(); // Restart random generation
        }
    }
})

// window.addEventListener('load', function() {
//     updatePausePlayButton();
// });

//------- Useful utils --------------------------------------------------------------------------------------------------------------------
function makeArr(startValue, stopValue, cardinality) {
  var arr = [];
  var step = (stopValue - startValue) / (cardinality - 1);
  for (var i = 0; i < cardinality; i++) {
    arr.push(startValue + (step * i));
  }
  return arr;
}

function getRandom(min, max) {
  return Math.random() * (max - min)  + min;
}

function drawBoard(context){
    const aspect_ratio = bw / bh;
    const grid_width = 4*scale;     // number of columns
    const grid_height = grid_width / aspect_ratio;    // number of rows
    context.beginPath();
    for (var x = 0; x <= bw; x += (bw - 2* p)/grid_width) {
        context.moveTo(p + x + 0.5 ,     p);
        context.lineTo(p + x + 0.5,     bh - p);
    }
    for (var x = 0; x <= bh; x += (bh - 2* p)/grid_height) {
        context.moveTo(p,       p + x + 0.5);
        context.lineTo(bw - p,  p + x + 0.5);
    }
    context.closePath();
    context.strokeStyle = "#ff0000ff";
    context.lineWidth = 3;
    context.stroke();
}

function getOrthDir(vel){
    var angle = Math.atan2(vel.y, vel.x);
    var cos_a = Math.cos(angle);
    var sin_a = Math.sin(angle);

    var dir_left  = {x: + sin_a, y: - cos_a}; 
    var dir_right = {x: - sin_a, y: + cos_a}; 
    
    var orthDir = {left: dir_left, right: dir_right};
    return orthDir;
}
// ----------------------- CSS functions ----------------------------------------------------
var clickedParticle = 'e-';
var clickedField = 'off';

// A particle button is coloured for a moment (red for a negative particle, blue for a positive one), and all
// particle buttons are switched off for a short while (longer in slow motion), so that particles cannot be
// sent in faster than they can be seen
function changeParticleColour(button) {
    const isNegative = (properties[nameToSpecies[clickedParticle]][0] < 0);
    flashButton(button, isNegative ? 'is-flash-negative' : 'is-flash-positive');
    const buttons = document.querySelectorAll('.btn.p');
    buttons.forEach((each) => { each.disabled = true; });
    var waitTime = 150 * 10/Math.sqrt(speedUp);
    window.setTimeout(() => buttons.forEach((each) => { each.disabled = false; }), waitTime);
}

// The button of the chosen magnetic field stays marked
function changeFieldColour(button) {
    document.querySelectorAll('.btn.f').forEach((each) => each.classList.toggle('is-active', each === button));
}

function keepGrainyDiffusion(context){
    context.imageSmoothingEnabled = false;
    context.webkitImageSmoothingEnabled = false;
    context.mozImageSmoothingEnabled = false;
    context.msImageSmoothingEnabled = false;
    context.oImageSmoothingEnabled = false;
}
