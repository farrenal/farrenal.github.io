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

function particleClicked(particleName) {
    clickedParticle = particleName;
    var species = nameToSpecies[particleName];
    theCC.generateRandomParticle(species);
}

function eventClicked(eventName) {
    if (eventName == 'pair')        theCC.generatePair();
    if (eventName == 'muonDecay')   theCC.generateMuonDecay();
}

function toggleAlphaSource() {
    theCC.alphaSourceOn = !theCC.alphaSourceOn;
    updateAlphaSourceButton();
}

// Toggle buttons stay coloured while they are switched on
function updateAlphaSourceButton() {
    const button = document.getElementById('alphaSourceButton');
    if (button) button.style.backgroundColor = theCC.alphaSourceOn ? '#ffd700' : '';
}

// Colour a button for a moment to show that the click was received
function flashButton(button) {
    button.style.backgroundColor = '#aaffaa';
    window.setTimeout(() => { button.style.backgroundColor = ''; }, 250);
}

function fieldClicked(fieldStatus) {
    theCC.updateMagField(fieldStatus);
}

const randomButton = document.getElementById('randomButton');

function toggleRandom() {
    // If an interval is already running, clear it
    if (randomButtonTimeoutID && randomButtonTimeoutID !== "paused") {
        clearTimeout(randomButtonTimeoutID);
        randomButton.style.backgroundColor = '';
        randomButtonTimeoutID = null;
        return;
    };
    // Otherwise start generating random particles, colourfully!
    randomButton.style.backgroundColor = '#ffd700';

    // Generate!
    randomLoop();
}

// Particles per second of all kinds together
function totalNaturalRate() {
    return naturalRates.reduce((sum, rate) => sum + rate, 0) + gammaElectronRate;
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

function updatePausePlayButton() {
    const button = document.getElementById('pausePlay');
    const icon = button.querySelector('i');
    
    if (theCC.isRunning) {
        icon.textContent = 'play_circle_filled';
        button.style.backgroundColor = '';
    } else {
        icon.textContent = 'pause_circle_filled';
        button.style.backgroundColor = '#ffaa00';
    }
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

function resetColour(particleOrField) {
    // Reset colour for all buttons of type .p or .f
    const buttons = document.querySelectorAll(`.box.${particleOrField}`);
    buttons.forEach(btn => {
        btn.style.backgroundColor = '';
        if (particleOrField == 'p') $(btn).toggleClass('disable');
    });
}

function changeParticleColour(button) {
    // Reset colour for all particle (p) buttons
    resetColour('p');
    // Set colour for the clicked button
    if (clickedParticle == 'e-' || clickedParticle == 'mu-'){
        button.style.backgroundColor = '#ffaaaa';
    }
    else {
        button.style.backgroundColor = '#aaaaff';
    };
    var waitTime = 150 * 10/Math.sqrt(speedUp);
    window.setTimeout(resetColour, waitTime, 'p');
}

function changeFieldColour(button) {
    // Reset colour for all field (f) buttons
    resetColour('f');
    // Set colour for the clicked button
    button.style.backgroundColor = '#aaaaaa';
}

function keepGrainyDiffusion(context){
    context.imageSmoothingEnabled = false;
    context.webkitImageSmoothingEnabled = false;
    context.mozImageSmoothingEnabled = false;
    context.msImageSmoothingEnabled = false;
    context.oImageSmoothingEnabled = false;
}
