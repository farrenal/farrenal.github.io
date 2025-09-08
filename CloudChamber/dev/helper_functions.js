//---------- Class of particles -----------------------------------------------------------------------------------------------
class Particle {
    
    // Automatically called when create new Particle(...)
    constructor(species, x, y, v_x, v_y){
        // Store data as attributes of the particle so can be accessed outside
        this.x = x;
        this.y = y;
        this.v_x = v_x*speedUp;
        this.v_y = v_y*speedUp;

        this.particleType = species; // This is a number, e.g. 0, 1, 2, ..., numSpecies
        this.particleTrailWidth     = properties[species][0];
        this.particleDiffusionCoeff = properties[species][1]; 
        this.particleCharge         = properties[species][2];
        this.particleMass           = properties[species][3];
        
        // Particle will be slowed down at an realistic rate, controlled by desiredRadius and compensationFactor 
        this.frictionInverse    = (species == 0) ? 0.995 + 0.0009*Math.random() : 1; // Only for Bz != 0
        this.desiredRadius      = 80 * (1.0 + Math.log(speedUp));
        this.compensationFactor = 1;    // Doesn't work because of discrete jumps, .... need to draw arcs I suppose!
        
        // Check if the particle has
        // 1. reached deep inside the box
        // 2. reached the edge of the box
        // 3. stopped moving
        // If the magnetic field is on,  2. and 3. will cause the particle to be removed from the particlesArray 
        // If the magnetic field is off, 1. and 2. will cause the particle to be removed from the particlesArray
        this.buffer = 0.8 - 0.1 * Math.random();
        this.speedCutOff = 0.1;
        this.removeNow = false;
        this.canRemove = false;

        // Start moving, inside canvas, inside buffer zone
        this.stoppedMoving = false;
        this.outsideCanvas = false;
        this.inBufferZone = true;

        // Before removing from array, fade out trail to look like real diffusion
        this.isFading = false;
        this.isFaded = false;
        this.fadeAlpha = 1.0;
        this.fadeRate = 0.02; // Need to modify with speed of animation
        
        // Create off-screen canvas to animate particle
        this.particleCanvas = document.createElement('canvas');
        this.particleCanvas.width = bw;
        this.particleCanvas.height = bh;
        this.particleContext = this.particleCanvas.getContext('2d'); 
        keepGrainyDiffusion(this.particleContext);
        
        // this.drawBufferZone() // For debugging
    }
    
    // This is the function which gets animated!
    update() {
        // Check if currently fading
        if (this.isFading){
            // If so, decrease alpha before next drawing
            this.fadeAlpha -= this.fadeRate;
            if (this.fadeAlpha <= 0) {
                this.fadeAlpha = 0;
                this.isFaded = true;
            }
        }
        else{
            // CONDITION 1.
            // Check if the particle lies outside the canvas completely
            if (this.x >= bw || this.x <= 0 || this.y >= bh || this.y <= 0) 
            {
                this.outsideCanvas = true;
            }

            // CONDITION 2.
            // Check if the particle lies in the buffer zone
            // It will necessarily lie in this zone when incoming, so we don't want to remove it prematurely
            // Only the second time it hits the zone do we want to remove it
            // debugText.innerText = `Can remove (${this.canRemove}) because \n${this.x >= bw*this.buffer}\n${this.x <= bw*(1-this.buffer)}\n${this.y >= bh*this.buffer}\n${this.y <= bh*(1-this.buffer)}`;
            if (this.x >= bw*this.buffer || this.x <= bw*(1-this.buffer) || this.y >= bh*this.buffer || this.y <= bh*(1-this.buffer)) 
            {
                this.inBufferZone = this.canRemove ? true : false;
            }
            // The particle has passed the buffer boundary, and will fade out the next time it hits it
            else if (!this.canRemove) {
                // this.particleContext.fillStyle = "green";
                // this.particleContext.fillRect(bw*(1-this.buffer),bh*(1-this.buffer),bw*(2*this.buffer-1),bh*(2*this.buffer-1));
                this.canRemove = true;
            };

            // CONDITION 3.
            // Check if particle has basically stopped moving
            this.speedNorm = Math.sqrt(this.v_x**2 + this.v_y**2);
            if (this.speedNorm < this.speedCutOff) this.stoppedMoving = true; 

            // APPLY CONDITIONS
            // Remove particle from array if relevant conditions are satisfied
            var removeCheckIfMag  = theCC.Bz !=0 && (this.outsideCanvas || this.stoppedMoving);
            var removeCheckNoMag  = theCC.Bz ==0 && (this.outsideCanvas || this.inBufferZone);
            if (removeCheckIfMag || removeCheckNoMag) {
                this.removeNow = true;
                this.isFading = true;
                return;
            }

            // Curl trajectory if there is a magnetic field
            if (theCC.Bz != 0) {
                var cf = this.compensationFactor;

                const cyclotronFreq = this.particleCharge * theCC.Bz /this.particleMass;
                const compensationFreq = this.speedNorm / this.desiredRadius;
                const effectiveFreq = cyclotronFreq * cf + compensationFreq * (1 - cf);
                
                // Rotate velocity vector (simplified 2D magnetic field)
                const new_v_x = this.v_x * Math.cos(effectiveFreq) - this.v_y * Math.sin(effectiveFreq);
                const new_v_y = this.v_x * Math.sin(effectiveFreq) + this.v_y * Math.cos(effectiveFreq);
                
                this.v_x = new_v_x*this.frictionInverse;
                this.v_y = new_v_y*this.frictionInverse;
                
                // Need to add good looking friction, dependent on the radius of curvature.
            }
            
            // Record most recent position and direction of particle
            this.lastPos = {x: this.x,      y: this.y}; 
            this.lastDir = {x: this.v_x,    y: this.v_y};
            
            // Update position of particle
            this.x += this.v_x;
            this.y += this.v_y;
        };
    }
        
    draw() {
        // Draw with a random diffusion gradient, which depends on the diffusion coefficient
        this.particleContext.strokeStyle = getNewDiffusionGradient(this.particleContext, this.lastDir, this.particleDiffusionCoeff, true);
        this.particleContext.beginPath();
        this.particleContext.moveTo(this.lastPos.x, this.lastPos.y);
        this.particleContext.lineTo(this.x, this.y);
        this.particleContext.stroke();

        // Draw diffusion trails with a random gradient, which depends on the diffusion coefficient
        propagateDiffusion(this.particleContext, this.lastPos, this.lastDir, this.particleTrailWidth, this.particleDiffusionCoeff);
    }
    
    drawOnMain(ctx) {
        if (this.isFading){
            ctx.save();     // Screenshot main canvas before reducing alpha
            ctx.globalAlpha = this.fadeAlpha;
            ctx.drawImage(this.particleCanvas, 0, 0);
            ctx.restore();  // Restore it
        }
        else{
            ctx.drawImage(this.particleCanvas, 0, 0);
        };
    }

    drawBufferZone(){
        const aspect_ratio = bw / bh;
        const grid_width = 4*scale;     // number of columns
        const grid_height = grid_width / aspect_ratio;    // number of rows
        var ctx = this.particleContext;
        ctx.beginPath();
        ctx.moveTo(bw*(1-this.buffer), bh*(1-this.buffer));
        ctx.lineTo(bw*this.buffer, bh*(1-this.buffer));
        ctx.lineTo(bw*this.buffer, bh*this.buffer);
        ctx.lineTo(bw*(1-this.buffer), bh*this.buffer);
        ctx.closePath();
        ctx.strokeStyle = "#ffececff";
        ctx.lineWidth = 3;
        ctx.stroke();
    }
}

//---------- Class of system of particles --------------------------------------------------------------------------------------------
class CloudChamber {
    // Automatically called when a CloudChamber is created
    constructor(canvas) {
        
        this.canvas = canvas;
        this.context = canvas.getContext('2d');
        keepGrainyDiffusion(this.context);
        this.isRunning = false;
        // drawBoard(this.context);  // coordinate system
        
        // Define particle species and their properties
        this.electronArray = [];     //  0 e-
        this.positronArray = [];     //  1 e+
        this.muonArray     = [];     //  2 mu-
        this.antimuonArray = [];     //  3 mu+
        this.alphaArray    = [];     //  4 a+
        this.protonArray   = [];     //  5 p+
        
        // particlesArray stores the different species
        this.particlesArray = [this.electronArray, this.positronArray, this.muonArray, this.antimuonArray, this.alphaArray, this.protonArray];
        this.numSpecies = this.particlesArray.length;
        
        this.Bz = 0;
        this.start();
    }

    //---------- Generating new particles -----------------------------------------------------------------------------------------------
    generateParticle(species, initial_x, initial_y, initial_v_x, initial_v_y) {
        this.particlesArray[species].push(new Particle(species, initial_x, initial_y, initial_v_x, initial_v_y)); 
        // updateParticleCount();
    }

    generateRandomParticle(species) {
        // Create placeholders for initial properties
        var x   = 0;
        var y   = 0;
        var v_x = 0;
        var v_y = 0;

        // Pick random direction
        let r = Math.floor(getRandom(1,5));
        // It must be moving at a decent speed
        const min_v = 0.5;
        const max_v = 5.0;

        // Add a shift because particle is unlikely to diffuse gas particles right at the edge
        const shift = 20 + (bh/4)*Math.random();
        // Because the box is wider than it is high, it's more likely a particle enters vertically through the top or bottom
        const ratio = bh/bw;
        var horizontal = Math.random() < ratio ? false : true;

        // Incoming from NE
        if (r == 1){ 
            // start from E edge
            if (horizontal){x = bw - shift;y = getRandom(0, bh/2);}
            // start from N edge
            else{x = getRandom(bw/2, bw - shift);y = shift;};
            v_x = getRandom(-max_v, -min_v);
            v_y = getRandom(min_v, max_v);
        };
        // Incoming from SE
        if (r == 2){ 
            // start from E edge
            if (horizontal){x = bw - shift;y = getRandom(bh/2, bh - shift);}
            // start from S edge
            else{x = getRandom(bw/2, bw - shift);y = bh - shift;};
            v_x = getRandom(-max_v, -min_v);
            v_y = getRandom(-max_v, -min_v);
        };
        // Incoming from SW
        if (r == 3){ 
            // start from W edge
            if (horizontal){x = shift;y = getRandom(bh/2, bh - shift);}
            // start from S edge
            else{x = getRandom(shift, bw/2);y = bh - shift;};
            v_x = getRandom(min_v, max_v);
            v_y = getRandom(-max_v, -min_v);
        };
        // Incoming from NW
        if (r == 4){ 
            // start from W edge
            if (horizontal){x = shift;y = getRandom(0, bh/2);}
            // start from N edge
            else{x = getRandom(shift, bw/2);y = shift;};
            v_x = getRandom(min_v, max_v);
            v_y = getRandom(min_v, max_v);
        };
        this.generateParticle(species, x, y, v_x, v_y);
    }

    // updateParticleCount() {
    //     this.particleCountArray = [];
    //     for (var species = 0; species < numSpecies; species++){
    //         this.particleCountArray.push(particlesArray[species].length);
    //     }
    //     this.particleCount = Math.sum(this.particleCountArray)
    // }

    updateMagField(fieldStatus){
        if (fieldStatus == 'in')   this.Bz = 0.01;
        if (fieldStatus == 'out')  this.Bz = -0.01;
        if (fieldStatus == 'off')  this.Bz = 0;
    }

    // Animation functionality
    animate() {
        if (!this.isRunning) return;

        this.context.clearRect(0,0,bw,bh);
        
        for (let species = 0; species < this.numSpecies; species ++){
            // Draw and then evolve all specimens in each species, i.e. all particles
            for (let i =  this.particlesArray[species].length - 1; i >= 0; i--){
                
                // Draw current position and diffusion on main canvas
                const particle = this.particlesArray[species][i];
                particle.drawOnMain(this.context);
                
                // Update particle's position
                particle.update();
                // If it hasn't reached the edge of the canvas, draw it on off-screen canvas
                if (!particle.removeNow){
                    particle.draw();
                }
            };
            // Remove all faded particles from the canvas
            this.particlesArray[species] =  this.particlesArray[species].filter((particle) =>  particle.isFaded == false);
        };
        this.animationID = requestAnimationFrame(() => this.animate());
    }

    start() {
        if (!this.isRunning) {
            this.isRunning = true;
            this.animationID = requestAnimationFrame(() => this.animate());
        }
    }
    
    stop() {
        this.isRunning = false;
        if (this.animationID) {
            cancelAnimationFrame(this.animationID);
            this.animationID = null;
        }
    }

    toggleAnimation() {
        if (this.isRunning) {
            this.stop();
            // Also pause random generation when animation pauses
            if (randomButtonTimeoutID && randomButtonTimeoutID !== "paused") {
                clearTimeout(randomButtonTimeoutID);
                randomButtonTimeoutID = "paused";
                randomButton.style.backgroundColor = '#ffaa00'; // Different color for paused
            }
        } else {
            this.start();
            // Resume random generation if it was paused
            if (randomButtonTimeoutID === "paused") {
                randomButtonTimeoutID = null;
                toggleRandom(); // Restart random generation
            }
        }
        updatePausePlayButton();
    }

    clearAnimation() {
        // Stop random generation first
        if (randomButtonTimeoutID && randomButtonTimeoutID !== null) {
            clearTimeout(randomButtonTimeoutID);
            randomButtonTimeoutID = null;
            randomButton.style.backgroundColor = '';
        }
        
        // Clear all particles
        for (var species = 0; species < this.numSpecies; species++) {
            this.particlesArray[species].forEach((particle) => {
                particle.isFading = true; 
                particle.fadeAlpha = 0;
                particle.isFaded = true;
            });
        }
        
        // Ensure animation continues to clear faded particles
        if (!this.isRunning) {
            this.start();
        }
        updatePausePlayButton();
    }
}

//--------------- Diffusion utils --------------------------------------------------------
function getNewDiffusionGradient(context, lastDir, dC, particleTF){
    
    var v_x = lastDir.x;
    var v_y = lastDir.y;

    var diffusionGradient = context.createLinearGradient(0, 0, bw, bh);
    
    var cutoff = 0.3;
    var slope = v_y/(v_x+0.001);
    var slopeInv = v_x/(v_y+0.001); 
    
    if (particleTF){
        if (Math.abs(slope) < cutoff){
            diffusionGradient = context.createLinearGradient(0, 0, bw, 0);
        }
        else if (Math.abs(slopeInv) < cutoff){
            diffusionGradient = context.createLinearGradient(0, 0, 0, bh);
        }
        else{
            if (slope < 0) {
                diffusionGradient = context.createLinearGradient(0, bh, bw, 0);
            };
            if (slope > 0) {
                diffusionGradient = context.createLinearGradient(0, 0, bw, bh);
            };
        };
    }
    else{diffusionGradient = context.createLinearGradient(bw, 0, 0, bh)};
    
    var gradientStretch = Math.floor(bw);
    var diffusionPositions = makeArr(0, 1, gradientStretch);

    for (var i = 0; i < gradientStretch; i ++){
        var pos = diffusionPositions[i];
        if (Math.random() < Math.E**(-2*dC)){
            diffusionGradient.addColorStop(pos, "white");
        }  
        else {
            diffusionGradient.addColorStop(pos, "rgba(0, 0, 0, 0)");
        };
    };
    return diffusionGradient;
}

function propagateDiffusion(context, lastPos, lastDir, tW, dC){
    
    var old_x = lastPos.x;
    var old_y = lastPos.y;
    var dx = lastDir.x;
    var dy = lastDir.y;

    var dRect = Math.sqrt(dx**2 + dy**2)
    var angle = Math.atan(dy/dx);

    context.beginPath();
    context.translate(old_x, old_y);
    context.rotate(angle); // now the x axis is along the trajectory and y<0 is to the left, y>0 is to the right
    for (var trail = 0; trail < tW; trail++){
        context.fillStyle = getNewDiffusionGradient(context, lastDir, dC*(1+trail), false);
        context.fillRect(0,0 + trail, Math.sign(dx)*dRect, 1); // below particle trajectory on screen
        context.fillStyle = getNewDiffusionGradient(context, lastDir, dC*(1+trail), false);
        context.fillRect(0,0 - trail, Math.sign(dx)*dRect, 1); // above particle trajectory on screen
    };
    context.rotate(-angle);
    context.translate(-old_x, -old_y);
};

//------- Event listeners ----------------------------------------------------------------------------------------------------------------
document.addEventListener("mousemove", (e) => {cursor.x = e.clientX; cursor.y = e.clientY;});
const cursor = {x: bw/2, y: bh/2};

// Listen for magnetic field changes
var speedSlider = document.getElementById('speedSlider');
var speedSliderText = document.getElementById('speedSliderText');
var speedUp = speedSlider.value;

// debugText.innerText = `${speedUp}`;
// speedSliderText.innerText = speedUp;
speedSlider.oninput = function() {
    var oldSpeedUp = speedUp;
    speedUp = this.value;
    var relativeChange = speedUp/oldSpeedUp;
    for (var species = 0; species < theCC.numSpecies; species++){
        theCC.particlesArray[species].forEach((particle) => {particle.v_x *= relativeChange;particle.v_y *= relativeChange;});
    };
    // speedSliderText.innerText = speedUp;
}

function particleClicked(particleName) {
    clickedParticle = particleName;
    var species = nameToSpecies[particleName];
    theCC.generateRandomParticle(species);
}

function fieldClicked(fieldStatus) {
    theCC.updateMagField(fieldStatus);
}

const randomButton = document.getElementById('randomButton');

function toggleRandom() {
     console.log("randomButton element:", randomButton);
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

function randomLoop() {
        
    var randomWaitTime = (speedUp == 1.0)? 1000 + 500*Math.random() : 200 + (500/(speedUp**0.3))*Math.random();

    randomButtonTimeoutID = setTimeout(() => {
        // Current particle count affects timing
        const currentParticleCount = theCC.particlesArray.reduce((sum, arr) => sum + arr.length, 0);
        // If there are too many particles, skip
        if (currentParticleCount < 30) {
            var rand = Math.random() * 7.7;
            var randomlyChosen = 'e-';
            if (rand <= 0.2)                randomlyChosen='p+';
            if (rand > 0.2 && rand <= 2)    randomlyChosen='e-';
            if (rand > 2 && rand <= 3.8)    randomlyChosen='e+';
            if (rand > 3.8 && rand <= 5.6)  randomlyChosen='mu-';
            if (rand > 5.6 && rand <= 7.4)  randomlyChosen='mu+';
            if (rand > 7.4 && rand <= 7.7)  randomlyChosen='a+';
            
            var randomlyChosenSpecies = nameToSpecies[randomlyChosen];
            theCC.generateRandomParticle(randomlyChosenSpecies);
        }
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
    button.toggleClass('disable');
}

function keepGrainyDiffusion(context){
    context.imageSmoothingEnabled = false;
    context.webkitImageSmoothingEnabled = false;
    context.mozImageSmoothingEnabled = false;
    context.msImageSmoothingEnabled = false;
    context.oImageSmoothingEnabled = false;
}