// What happens in the thumbnail: particles and events arrive at random moments, like the Random button of the gallery.
// In nature nearly everything is a muon or an electron, and an alpha turns up twice a minute. Here every kind
// is about equally likely, so that someone who scrolls past sees a bit of everything.
const thumbnailRate = 1.2;          // arrivals per second
const thumbnailField = 'off';       // magnetic field: 'off', 'in' or 'out'
// The kinds of arrival, each with its share (how often it is picked compared to the others)
const thumbnailArrivals = [
    {share: 1, make: (chamber) => chamber.generateRandomParticle(nameToSpecies['e-'])},
    {share: 1, make: (chamber) => chamber.generateRandomParticle(nameToSpecies['e+'])},
    {share: 1, make: (chamber) => chamber.generateRandomParticle(nameToSpecies['mu-'], false)},
    {share: 1, make: (chamber) => chamber.generateRandomParticle(nameToSpecies['mu+'], false)},
    {share: 1, make: (chamber) => chamber.generateRandomParticle(nameToSpecies['a+'])},
    {share: 1, make: (chamber) => chamber.generateRandomParticle(nameToSpecies['p+'])},
    // A gamma ray knocks an electron out of the gas
    {share: 1, make: (chamber) => chamber.generateGamma(false)},
    // A gamma ray turns into an electron and a positron
    {share: 1, make: (chamber) => chamber.generateGamma(true)},
    // A slow muon stops and decays into an electron
    {share: 1, make: (chamber) => chamber.generateRandomParticle(nameToSpecies[(Math.random() < 0.5) ? 'mu-' : 'mu+'], true)}
];

// Start the cloud chamber
var theCC = new CloudChamber();
theCC.updateMagField(thumbnailField);

// Visitors who asked their device for less motion get a still picture: a few tracks, frozen (see the end of this file)
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const stillArrivals = 3;            // number of tracks in the still picture, the first of which is an alpha
const stillAfter = 0.5;             // seconds for which the chamber runs before it is frozen
var thumbnailFrozen = false;

// Arrivals are independent of each other, so the wait until the next one is random.
// A browser may stop drawing a page which cannot be seen while its timers carry on: nothing arrives unless
// the chamber has drawn a frame since the last arrival, otherwise particles would pile up unseen.
var frameAtLastArrival = null;
function thumbnailLoop() {
    const wait = -Math.log(1 - Math.random()) / thumbnailRate * 1000;   // milliseconds
    setTimeout(() => {
        if (theCC.isRunning && theCC.lastFrameTime !== frameAtLastArrival) {
            frameAtLastArrival = theCC.lastFrameTime;
            pickByShare(thumbnailArrivals, thumbnailArrivals.map((arrival) => arrival.share)).make(theCC);
        }
        thumbnailLoop();
    }, wait);
}
if (!reduceMotion) thumbnailLoop();

// The chamber only runs while the thumbnail can be seen: not while it is scrolled out of view, in a closed tab
// of the homepage, or in a hidden tab of the browser
var thumbnailOnScreen = true;
function runOnlyWhileSeen() {
    if (thumbnailFrozen) { theCC.stop(); return; }
    if (thumbnailOnScreen && !document.hidden) theCC.start();
    else theCC.stop();
}
new IntersectionObserver((entries) => {
    thumbnailOnScreen = entries[entries.length - 1].isIntersecting;
    runOnlyWhileSeen();
}).observe(canvas);
document.addEventListener('visibilitychange', runOnlyWhileSeen);

// The still picture: send in a few particles at once, let the chamber run for a moment (counting only the time
// for which it really draws), and stop it for good
if (reduceMotion) {
    theCC.generateRandomParticle(nameToSpecies['a+']);
    for (var n = 1; n < stillArrivals; n++) pickByShare(thumbnailArrivals, thumbnailArrivals.map((arrival) => arrival.share)).make(theCC);
    var stillRunTime = 0;
    var stillLastFrame = null;
    const stillTimer = setInterval(() => {
        if (theCC.isRunning && theCC.lastFrameTime !== stillLastFrame) stillRunTime += 0.05;
        stillLastFrame = theCC.lastFrameTime;
        if (stillRunTime >= stillAfter) {
            thumbnailFrozen = true;
            theCC.stop();
            clearInterval(stillTimer);
        }
    }, 50);
}
