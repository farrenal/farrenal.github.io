//---------- Class of system of particles --------------------------------------------------------------------------------------------
class CloudChamber {
    // Automatically called when a CloudChamber is created
    constructor(canvas) {
        
        this.canvas = canvas;
        this.context = canvas.getContext('2d');
        // keepGrainyDiffusion(this.context);
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

        // Image of the whole chamber, which collects the light of every droplet each frame (see image_class.js)
        this.image = new ChamberImage(this.context);

        // Slow swirls of the gas, which carry the droplets along (see flow_class.js)
        this.flow = new FlowField();

        // Droplets left behind by particles, and the mist of droplets which condense by themselves all over the chamber
        this.trackDroplets = new DropletPool();
        this.backgroundDroplets = new DropletPool();
        this.mistPatches = new MistPatches();
        // New mist droplets per second, so that there are about backgroundCount of them at any moment
        this.backgroundRate = backgroundCount / (0.5 * (backgroundLifeMin + backgroundLifeMax));
        this.backgroundDebt = 0;
        // Start with a chamber which has been running for a while
        for (let n = 0; n < backgroundCount; n++) this.addBackgroundDroplet(true);

        // Radioactive source of alphas in the middle of the chamber, switched on and off by a button
        this.alphaSourceOn = false;

        // Simulation clock: each frame, simulation time advances by (real time since last frame) * ticksPerSecond.
        // Droplet clock: each frame, droplets age by (real time since last frame) * dropletClockRate.
        this.lastFrameTime = null;
        this.setAnimationSpeed(Number(speedSlider.value));
        this.start();
    }

    //---------- Generating new particles -----------------------------------------------------------------------------------------------
    // Velocities are given as fractions of the speed of light.
    // initial_z, initial_v_z (optional): depth and velocity along the depth, see particle_class.js
    // Returns the new particle.
    generateParticle(species, initial_x, initial_y, initial_v_x, initial_v_y, initial_z, initial_v_z) {
        const particle = new Particle(species, initial_x, initial_y, initial_v_x, initial_v_y, initial_z, initial_v_z);
        this.particlesArray[species].push(particle);
        return particle;
    }

    generateRandomParticle(species) {
        // Create placeholders for initial properties
        var x   = 0;
        var y   = 0;
        var v_x = 0;
        var v_y = 0;

        // Pick random direction
        let r = Math.floor(getRandom(1,5));
        // Range of the components of its direction (its speed is decided below)
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
        // Keep the direction on screen, and pick a speed which is typical for this species
        const beta = getRandom(properties[species][2], properties[species][3]);

        // The particle crosses the sensitive layer at an angle (the dip): part of its velocity is along the depth
        const sinDip = getRandom(-dipSpread, dipSpread);
        const cosDip = Math.sqrt(1 - sinDip*sinDip);
        const norm = Math.sqrt(v_x*v_x + v_y*v_y);
        v_x *= beta * cosDip / norm;
        v_y *= beta * cosDip / norm;
        const v_z = beta * sinDip;

        // Alphas come from radioactive atoms in the gas itself, so they start anywhere in the layer.
        // Everything else comes from outside and enters through the face which it is moving away from.
        var z;
        if (species == 4)   z = layerThickness * Math.random();
        else                z = (v_z > 0) ? 0 : layerThickness;

        this.generateParticle(species, x, y, v_x, v_y, z, v_z);
    }

    // updateParticleCount() {
    //     this.particleCountArray = [];
    //     for (var species = 0; species < numSpecies; species++){
    //         this.particleCountArray.push(particlesArray[species].length);
    //     }
    //     this.particleCount = Math.sum(this.particleCountArray)
    // }

    // An electron is knocked out of the gas by a gamma ray: it starts anywhere in the chamber, in any direction on screen
    generateGammaElectron() {
        const x = bw * Math.random();
        const y = bh * Math.random();
        const z = layerThickness * Math.random();

        const beta = getRandom(gammaElectronBetaMin, gammaElectronBetaMax);
        const direction = twoPI * Math.random();
        const sinDip = getRandom(-dipSpread, dipSpread);
        const cosDip = Math.sqrt(1 - sinDip*sinDip);

        this.generateParticle(0, x, y, beta * cosDip * Math.cos(direction), beta * cosDip * Math.sin(direction), z, beta * sinDip);
    }

    // One particle as nature would send it: which kind is decided at random, in proportion to the natural rates
    generateNaturalParticle() {
        let pick = Math.random() * totalNaturalRate();
        for (let species = 0; species < this.numSpecies; species++) {
            pick -= naturalRates[species];
            if (pick < 0) {
                this.generateRandomParticle(species);
                return;
            }
        }
        this.generateGammaElectron();
    }

    //---------- Events ---------------------------------------------------------------------------------------------------------------
    // Pair production: an electron and a positron appear at the same point, moving in nearly the same direction.
    // In a magnetic field they curl away from each other.
    generatePair() {
        // Somewhere in the middle part of the chamber, half way through the sensitive layer
        const x = bw * getRandom(0.25, 0.75);
        const y = bh * getRandom(0.25, 0.75);
        const z = 0.5 * layerThickness;

        // Direction of the gamma ray, nearly in the plane of the layer so that both tracks stay visible
        const direction = twoPI * Math.random();
        const sinDip = getRandom(-0.08, 0.08);
        const cosDip = Math.sqrt(1 - sinDip*sinDip);

        // The electron leaves to one side of this direction and the positron to the other
        const side = (Math.random() < 0.5) ? -1 : +1;
        for (let species = 0; species <= 1; species++) {
            const beta = getRandom(pairBetaMin, pairBetaMax);
            const angle = direction + (species == 0 ? side : -side) * getRandom(pairAngleMin, pairAngleMax);
            this.generateParticle(species, x, y, beta * cosDip * Math.cos(angle), beta * cosDip * Math.sin(angle), z, beta * sinDip);
        }
    }

    // Muon decay: a slow muon enters through the upper face of the layer, slows down and stops in the middle of the layer.
    // Its track gets thicker as it slows. Where it stops, a fast electron (or positron, for a positive muon) flies off.
    generateMuonDecay() {
        const species = (Math.random() < 0.5) ? 2 : 3;

        // Where it stops, and the direction on screen in which it travels
        const stop_x = bw * getRandom(0.3, 0.7);
        const stop_y = bh * getRandom(0.3, 0.7);
        const direction = twoPI * Math.random();
        const dir_x = Math.cos(direction);
        const dir_y = Math.sin(direction);

        // How far it travels: a random range, but it must start inside the picture.
        // Looking backwards from the stopping point, the edge of the picture is this far away:
        const toEdge_x = (dir_x > 0) ? stop_x / dir_x : (stop_x - bw) / dir_x;
        const toEdge_y = (dir_y > 0) ? stop_y / dir_y : (stop_y - bh) / dir_y;
        const range = Math.min(bw * getRandom(decayMuonRangeMin, decayMuonRangeMax), 0.9 * Math.min(toEdge_x, toEdge_y));

        // It descends through half of the layer while it covers its range
        const sinDip = -0.5 * layerThickness / range;
        const cosDip = Math.sqrt(1 - sinDip*sinDip);

        // The speed which gives this range follows from the energy loss (see header.js): beta^4 = 4 * (loss per pixel) * range
        const lossPerPixel = energyLossRate / properties[species][1];
        const beta = Math.pow(4 * lossPerPixel * range, 0.25);

        const muon = this.generateParticle(species, stop_x - range * cosDip * dir_x, stop_y - range * cosDip * dir_y,
                                           beta * cosDip * dir_x, beta * cosDip * dir_y, layerThickness, beta * sinDip);

        // When it has stopped, it decays
        muon.whenStopped = (stopped) => {
            const electronSpecies = (species == 2) ? 0 : 1;
            const angle = twoPI * Math.random();
            const electronSinDip = getRandom(-0.1, 0.1);
            const electronCosDip = Math.sqrt(1 - electronSinDip*electronSinDip);
            this.generateParticle(electronSpecies, stopped.x, stopped.y,
                                  decayElectronBeta * electronCosDip * Math.cos(angle), decayElectronBeta * electronCosDip * Math.sin(angle),
                                  stopped.z, decayElectronBeta * electronSinDip);
        };
    }

    // The alpha source sends out one alpha, in a random direction, starting at its surface
    emitFromAlphaSource() {
        const direction = twoPI * Math.random();
        const sinDip = getRandom(-dipSpread, dipSpread);
        const cosDip = Math.sqrt(1 - sinDip*sinDip);
        const dir_x = cosDip * Math.cos(direction);
        const dir_y = cosDip * Math.sin(direction);
        this.generateParticle(4, 0.5 * bw + alphaSourceRadius * dir_x, 0.5 * bh + alphaSourceRadius * dir_y,
                              alphaSourceBeta * dir_x, alphaSourceBeta * dir_y, 0.5 * layerThickness, alphaSourceBeta * sinDip);
    }

    // The source itself is a solid speck which the lamp lights up: a small, evenly lit disc
    drawAlphaSource() {
        const step = 1 / imageScale;    // one image pixel, in canvas pixels
        for (let dy = -alphaSourceRadius; dy <= alphaSourceRadius; dy += step) {
            for (let dx = -alphaSourceRadius; dx <= alphaSourceRadius; dx += step) {
                if (dx*dx + dy*dy <= alphaSourceRadius*alphaSourceRadius) {
                    this.image.addLight(0.5 * bw + dx, 0.5 * bh + dy, alphaSourceLight);
                }
            }
        }
    }

    // A mist droplet condenses somewhere in the chamber without the help of a particle
    addBackgroundDroplet(alreadyAged) {
        // Pick a place at random, but more often where the mist is thick:
        // a place is accepted with a chance equal to the thickness of the mist there, otherwise we pick again
        var x, y;
        do {
            x = bw * Math.random();
            y = bh * Math.random();
        } while (Math.random() > this.mistPatches.thicknessAt(x, y));

        const life = getRandom(backgroundLifeMin, backgroundLifeMax);
        const age  = alreadyAged ? life * Math.random() : 0;
        const brightness = backgroundFaintest + (backgroundBrightest - backgroundFaintest) * Math.pow(Math.random(), backgroundContrast);
        const drift_x = backgroundDrift * randomGaussian();
        const drift_y = backgroundDrift * randomGaussian();
        this.backgroundDroplets.add(x, y, 1, brightness, life, drift_x, drift_y, age);
    }

    updateMagField(fieldStatus){
        if (fieldStatus == 'in')   this.Bz = + 1.0 * magScale;
        if (fieldStatus == 'out')  this.Bz = - 1.0 * magScale;
        if (fieldStatus == 'off')  this.Bz = 0;
    }

    // Animation functionality
    animate(currentTime) {
        if (!this.isRunning) return;

        // Real time since the last frame (seconds) and the simulation time it corresponds to (ticks).
        // This works at any display refresh rate, and the slider only enters through ticksPerSecond.
        const realTime = (this.lastFrameTime === null) ? 0 : Math.min((currentTime - this.lastFrameTime) / 1000, maxFrameTime);
        this.lastFrameTime = currentTime;
        const simTime = realTime * this.ticksPerSecond;
        const clockStep = realTime * this.dropletClockRate;

        // Start the image from darkness, and let the swirls of the gas change a little
        this.image.clear();
        this.flow.update(clockStep);
        this.mistPatches.update(clockStep);

        // Alpha source: the chance of an alpha during this frame is (alphas per second) * (seconds on the droplet clock)
        if (this.alphaSourceOn) {
            if (Math.random() < alphaSourceRate * clockStep) this.emitFromAlphaSource();
            this.drawAlphaSource();
        }

        // Fly each particle of each species, which creates new droplets along its path
        for (let species = 0; species < this.numSpecies; species ++){
            const particles = this.particlesArray[species];
            for (let i = particles.length - 1; i >= 0; i--){
                // Physics (fixed substeps) for the simulation time that passed this frame
                particles[i].advance(simTime);
            };
            // Forget all particles of this species whose track is complete
            this.particlesArray[species] = particles.filter((particle) => !particle.isFinished);
        };

        // New mist droplets, at a steady rate on the droplet clock
        this.backgroundDebt += this.backgroundRate * clockStep;
        while (this.backgroundDebt >= 1) {
            this.backgroundDebt -= 1;
            this.addBackgroundDroplet(false);
        }

        // Age every droplet, move it with the gas and collect its light, then show the image
        this.backgroundDroplets.render(this.image, this.flow, clockStep);
        this.trackDroplets.render(this.image, this.flow, clockStep);
        this.image.develop();

        // Keep loop going
        this.animationID = requestAnimationFrame((time) => this.animate(time));
    }

    setAnimationSpeed(speedValue) {
        // speedValue from 1-100, mapped logarithmically onto simulation ticks per second of real time
        // At speedValue =   1: minTicksPerSecond (slow motion)
        // At speedValue = 100: maxTicksPerSecond (nearly instantaneous tracks)
        const fraction = (speedValue - 1) / 99;
        this.ticksPerSecond = minTicksPerSecond * Math.pow(maxTicksPerSecond / minTicksPerSecond, fraction);

        // Droplets age in real time at top speed. In slow motion they are slowed down too, but less than the particles
        // (see dropletSlowMotion), so that a track being drawn slowly stays visible for a good part of its length.
        this.dropletClockRate = Math.pow(this.ticksPerSecond / maxTicksPerSecond, dropletSlowMotion);
    }

    start() {
        if (!this.isRunning) {
            this.isRunning = true;
            this.lastFrameTime = null;  // so that time spent paused is not simulated
            this.animationID = requestAnimationFrame((time) => this.animate(time));
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
        
        // Switch the alpha source off
        this.alphaSourceOn = false;
        updateAlphaSourceButton();

        // Clear all particles and the droplets of their tracks
        for (var species = 0; species < this.numSpecies; species++) {
            this.particlesArray[species].forEach((particle) => particle.finish());
        }
        this.trackDroplets.clear();

        // Ensure animation continues to clear faded particles
        if (!this.isRunning) {
            this.start();
        }
        updatePausePlayButton();
    }
}