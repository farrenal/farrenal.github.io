// What happens in the thumbnail: q = 5 in a weak field, at a temperature which wanders at random between low and high.
// At low temperature neighbours lock each other into domains, which grow, and the field slowly favours the state
// along it. At high temperature the thermal fluctuations break the domains up and all five states show.
const thumbnailQ = 5;
const thumbnailField = presets[thumbnailQ].H[1];    // the weak field of the gallery
const thumbnailSweepsPerSecond = 9;                 // the speed at which the gallery starts
const thumbnailSitePixels = 4;                      // size of a site on the screen

// The temperature wanders smoothly but unpredictably between these two (in units of J/kB), on a logarithmic scale.
// It follows the sum of a few slow waves with unrelated periods and random starting points, which never repeats.
// The sum is then sharpened, so that the temperature lingers near the two ends and crosses over quickly between them.
const temperatureLow = presets[thumbnailQ].T[0];       // "low" in the gallery
const temperatureHigh = presets[thumbnailQ].T[3];      // "high" in the gallery
const temperaturePeriods = [23, 14.1, 8.7];         // seconds
const temperatureSharpness = 2.5;                   // 0 is a gentle drift around the middle, higher is closer to a switch
const temperaturePhases = temperaturePeriods.map(() => 2 * Math.PI * Math.random());

function wanderingTemperature(seconds) {
    var sum = 0;
    temperaturePeriods.forEach((period, n) => { sum += Math.sin(2 * Math.PI * seconds / period + temperaturePhases[n]); });
    // Between 0 (low) and 1 (high)
    const level = 0.5 + 0.5 * Math.tanh(temperatureSharpness * sum / Math.sqrt(temperaturePeriods.length / 2));
    return temperatureLow * Math.pow(temperatureHigh / temperatureLow, level);
}

// Visitors who asked their device for less motion get a still picture: the lattice after it has evolved
// for a while at the low temperature, frozen
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const stillSweeps = 40;

// Start the Potts model
var thePotts = new PottsModel();
thePotts.isRunning = false;         // until the thumbnail has a size and can be seen (see below)
thePotts.setQ(thumbnailQ);
thePotts.setField(thumbnailField);
thePotts.setAnimationSpeed(thumbnailSweepsPerSecond);

// The lattice has as many sites as fit into the thumbnail. Its size is not known while the tab of the homepage
// which holds it is closed, and it can change later on.
var latticeReady = false;
function fitLattice() {
    if (window.innerWidth == 0 || window.innerHeight == 0) return;
    const width  = Math.max(8, Math.round(window.innerWidth  / thumbnailSitePixels));
    const height = Math.max(8, Math.round(window.innerHeight / thumbnailSitePixels));
    if (!latticeReady || width != thePotts.width || height != thePotts.height) thePotts.setSize(width, height);
    latticeReady = true;
    if (reduceMotion) {
        thePotts.setTemperature(temperatureLow);
        thePotts.step(stillSweeps * thePotts.sites);
        thePotts.draw();
    }
    runOnlyWhileSeen();
}
var resizeTimeoutID = null;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeoutID);
    resizeTimeoutID = setTimeout(fitLattice, 300);
});

// The lattice only evolves while the thumbnail can be seen: not while it is scrolled out of view, in a closed tab
// of the homepage, or in a hidden tab of the browser. The clock of the temperature stands still as well.
var thumbnailOnScreen = true;
function runOnlyWhileSeen() {
    thePotts.isRunning = !reduceMotion && latticeReady && thumbnailOnScreen && !document.hidden;
}
new IntersectionObserver((entries) => {
    thumbnailOnScreen = entries[entries.length - 1].isIntersecting;
    runOnlyWhileSeen();
}).observe(canvas);
document.addEventListener('visibilitychange', runOnlyWhileSeen);

var temperatureClock = 0;           // seconds for which the lattice has been evolving
var lastTemperatureTime = null;
function updateTemperature(now) {
    window.requestAnimationFrame(updateTemperature);
    if (lastTemperatureTime !== null && thePotts.isRunning) temperatureClock += Math.min(maxFrameTime, (now - lastTemperatureTime) / 1000);
    lastTemperatureTime = now;
    thePotts.setTemperature(wanderingTemperature(temperatureClock));
}
if (!reduceMotion) window.requestAnimationFrame(updateTemperature);

fitLattice();
