//------- Sliders ------------------------------------------------------------------------------------------------------------------------
var temperatureSlider = document.getElementById('temperatureSlider');
var temperatureSliderText = document.getElementById('temperatureSliderText');
var fieldSlider = document.getElementById('fieldSlider');
var fieldSliderText = document.getElementById('fieldSliderText');
var speedSlider = document.getElementById('speedSlider');
var speedSliderText = document.getElementById('speedSliderText');

// Which of the four buttons underneath a slider is switched on: 0 to 3, or -1 if the slider is somewhere in between.
// While one is switched on, choosing another q moves the slider to the value which belongs to that q.
var temperaturePreset = startTemperaturePreset;
var fieldPreset = startFieldPreset;

temperatureSlider.oninput = function() {
    setTemperature(Number(this.value));
}
fieldSlider.oninput = function() {
    setField(Number(this.value));
}
speedSlider.oninput = function() {
    thePotts.setAnimationSpeed(sliderToSweepsPerSecond(Number(this.value)));
    updateSpeedReadout(thePotts);
}

// The speed slider is logarithmic: every step multiplies the speed by the same factor
function sliderToSweepsPerSecond(value) {
    const fraction = (value - Number(speedSlider.min)) / (Number(speedSlider.max) - Number(speedSlider.min));
    return minSweepsPerSecond * Math.pow(maxSweepsPerSecond / minSweepsPerSecond, fraction);
}

function setTemperature(temperature) {
    thePotts.setTemperature(temperature);
    temperatureSlider.value = temperature;
    temperaturePreset = presets[thePotts.q].T.indexOf(temperature);
    temperatureSliderText.innerHTML = "<i>T</i> = " + temperature.toFixed(2) + " <i>J</i>/<i>k</i><sub>B</sub>";
    markPreset('.btn.t', temperaturePreset);
}

function setField(field) {
    thePotts.setField(field);
    fieldSlider.value = field;
    fieldPreset = presets[thePotts.q].H.indexOf(field);
    fieldSliderText.innerHTML = "<i>H</i> = " + field.toFixed(1);
    markPreset('.btn.h', fieldPreset);
}

// Tell the user how fast the lattice evolves, next to the label of the panel
function updateSpeedReadout(model) {
    if (!model.isRunning) {
        speedSliderText.textContent = "paused";
        return;
    }
    // Until the speed has been measured, and after the slider has moved, show the speed which was asked for
    var speed = model.measuredSweepsPerSecond;
    if (!speed || Math.abs(speed - model.sweepsPerSecond) < 0.1 * model.sweepsPerSecond) speed = model.sweepsPerSecond;
    speedSliderText.textContent = Number(speed.toPrecision(2)) + " sweeps per second";
}

//------- Buttons ------------------------------------------------------------------------------------------------------------------------
// The buttons underneath the sliders
function temperaturePresetClicked(index) {
    setTemperature(presets[thePotts.q].T[index]);
}

function fieldPresetClicked(index) {
    setField(presets[thePotts.q].H[index]);
}

// Another number of states: the lattice starts again. A slider which sits on one of its four buttons
// moves to the value of that button for the new q, otherwise it stays where it is.
function qClicked(q) {
    const keepTemperaturePreset = temperaturePreset;
    const keepFieldPreset = fieldPreset;
    thePotts.setQ(q);
    setTemperature(keepTemperaturePreset >= 0 ? presets[q].T[keepTemperaturePreset] : thePotts.temperature);
    setField(keepFieldPreset >= 0 ? presets[q].H[keepFieldPreset] : thePotts.field);
    document.querySelectorAll('.btn.q').forEach((each) => each.classList.toggle('is-active', Number(each.dataset.q) == q));
    buildPopulations();
    updatePopulations(thePotts);
}

function sizeClicked(index) {
    thePotts.setSize(latticeSizes[index][0], latticeSizes[index][1]);
    document.querySelectorAll('.btn.l').forEach((each) => each.classList.toggle('is-active', Number(each.dataset.size) == index));
}

function restartClicked() {
    thePotts.randomise();
}

// The button of the chosen value stays marked
function markPreset(selector, index) {
    document.querySelectorAll(selector).forEach((each) => each.classList.toggle('is-active', Number(each.dataset.preset) == index));
}

// The button shows what a click on it will do: pause while the animation runs, play while it is paused.
// It stays marked while the animation is paused.
function updatePausePlayButton() {
    const button = document.getElementById('pausePlay');
    const icon = button.querySelector('i');
    icon.textContent = thePotts.isRunning ? 'pause' : 'play_arrow';
    button.classList.toggle('is-active', !thePotts.isRunning);
}

//------- Populations --------------------------------------------------------------------------------------------------------------------
// A bar which is shared between the states, each with the fraction of the sites which are in it
var populationBar = document.getElementById('populationBar');
var populationText = document.getElementById('populationText');

// One piece of the bar for each of the q states
function buildPopulations() {
    populationBar.innerHTML = "";
    for (var state = 0; state < thePotts.q; state++) {
        const piece = document.createElement('span');
        piece.className = "s" + state;
        populationBar.appendChild(piece);
    }
}

function updatePopulations(model) {
    const pieces = populationBar.children;
    if (pieces.length != model.q) return;       // the bar has not been built for this q yet
    for (var state = 0; state < model.q; state++) {
        const percent = 100 * model.counts[state] / model.sites;
        pieces[state].style.width = percent + "%";
        pieces[state].title = "s = " + state + ": " + percent.toFixed(1) + "% of the sites";
    }
    populationText.innerHTML = "<i>s</i> = 0 (along <i>H</i>): " + Math.round(100 * model.counts[fieldDirection] / model.sites) + "%";
}
