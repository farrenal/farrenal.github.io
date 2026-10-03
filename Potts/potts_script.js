// Start the Potts model, and set the sliders and buttons to what it starts with
var thePotts = new PottsModel();
thePotts.setAnimationSpeed(sliderToSweepsPerSecond(Number(speedSlider.value)));
qClicked(startQ);
sizeClicked(startLatticeSize);
updatePausePlayButton();
updateSpeedReadout(thePotts);
