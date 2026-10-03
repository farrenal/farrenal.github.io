//---------- Class of system of particles --------------------------------------------------------------------------------------------
class CloudChamber {
    // Automatically called when a CloudChamber is created
    constructor(canvas) {
        
        this.canvas = canvas;
        this.isRunning = false;
        
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

        // Image of the whole chamber, which collects the light of every droplet each frame.
        // It is drawn by the graphics card if this device supports that (see image_gl_class.js),
        // and by the processor if not (see image_class.js).
        this.image = createChamberImage();

        // Time spent on the work of the last frames, to notice if this device cannot keep up (see the end of animate)
        this.workTime = 0;
        this.workFrames = -warmUpFrames;

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

        // Radioactive source in the middle of the chamber: the name of the active one (see sources in header.js), or null
        this.activeSource = null;
        // Things which are due to happen a little later, as {wait: seconds on the droplet clock, action: function}
        this.pending = [];

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

    // A particle of this species enters the chamber from a random side.
    // willDecay (optional, muons only): true for a slow muon which stops inside the chamber and decays, false for
    // an ordinary fast one. If left out, this is decided at random (see muonDecayChance in header.js).
    generateRandomParticle(species, willDecay) {
        if (species == 2 || species == 3) {
            if (willDecay === undefined) willDecay = (Math.random() < muonDecayChance);
            if (willDecay) {
                this.generateStoppingMuon(species);
                return;
            }
        }

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

    // A gamma ray from the surroundings does something in the chamber. The gamma ray itself leaves no track.
    // makesPair (optional): true if it turns into an electron and a positron, false if it knocks an electron out of the gas.
    // If left out, this is decided at random (see gammaPairChance in header.js).
    generateGamma(makesPair) {
        if (makesPair === undefined) makesPair = (Math.random() < gammaPairChance);
        if (makesPair) {
            this.generatePair();
            return;
        }

        // The electron starts anywhere in the chamber, in any direction on screen
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
        this.generateGamma();
    }

    //---------- Events ---------------------------------------------------------------------------------------------------------------
    // These are not called by the buttons directly. They are possible outcomes of generateGamma() and of
    // generateRandomParticle() for a muon, and the event buttons ask those two for this outcome.

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
    // species: 2 for a negative muon, 3 for a positive one
    generateStoppingMuon(species) {
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

    //---------- Radioactive sources --------------------------------------------------------------------------------------------------
    // Switch to this source (a name from sources in header.js), or to no source at all with null
    setSource(sourceName) {
        this.activeSource = sourceName;
        // A source which has a direction is put into the chamber in a new, random direction every time it is switched on
        if (sourceName !== null && sources[sourceName].angle !== undefined) {
            sources[sourceName].angle = twoPI * Math.random();
        }
        drawSourceImage(sourceName);
    }

    // Send out a particle in a random direction (with the usual limited angle to the layer).
    // upwardOnly (optional): true for a particle which leaves an object on the floor, and so can only travel upwards
    emitInRandomDirection(species, x, y, z, beta, startDistance, upwardOnly) {
        const direction = twoPI * Math.random();
        const sinDip = getRandom(upwardOnly ? 0 : -dipSpread, dipSpread);
        const cosDip = Math.sqrt(1 - sinDip*sinDip);
        const dir_x = cosDip * Math.cos(direction);
        const dir_y = cosDip * Math.sin(direction);
        this.generateParticle(species, x + startDistance * dir_x, y + startDistance * dir_y, beta * dir_x, beta * dir_y, z, beta * sinDip);
    }

    // A random point on the rod of this source, as seen on screen: anywhere along its length and across its thickness
    randomPointOnRod(source) {
        const along  = source.length    * bw * getRandom(-0.5, 0.5);
        const across = source.thickness * bw * getRandom(-0.5, 0.5);
        const cos_a = Math.cos(source.angle);
        const sin_a = Math.sin(source.angle);
        return {x: 0.5 * bw + along * cos_a - across * sin_a,
                y: 0.5 * bh + along * sin_a + across * cos_a};
    }

    // The active source sends out one particle, starting at its surface
    emitFromSource() {
        const source = sources[this.activeSource];
        const x = 0.5 * bw;
        const y = 0.5 * bh;
        const z = 0.5 * layerThickness;

        // Alpha source: one of its alpha energies, each as often as its share says
        if (source.alphaEnergies) {
            const energy = pickByShare(source.alphaEnergies, source.alphaShares);
            const beta = betaFromEnergy(energy, alphaRestEnergy);

            if (source.shape == "button") {
                // From the edge of the foil in the centre of the button, upwards
                this.emitInRandomDirection(4, x, y, sourceFloorDepth, beta, source.foilRadius * bw, true);
            }
            if (source.shape == "rod") {
                // From anywhere on the rod, upwards
                const point = this.randomPointOnRod(source);
                this.emitInRandomDirection(4, point.x, point.y, sourceFloorDepth, beta, 0, true);
            }
        }

        // Beta source: an electron or positron with a random energy below the endpoint of one of its decays.
        // It leaves the point of the needle, which is in the middle of the chamber and half way through the layer.
        if (source.betaEndpoints) {
            const endpoint = source.betaEndpoints[Math.floor(Math.random() * source.betaEndpoints.length)];
            const energy = randomBetaEnergy(endpoint);
            this.emitInRandomDirection(source.betaSpecies, x, y, z, betaFromEnergy(energy, electronRestEnergy), source.thickness * bw);
        }

        // Gamma source: an electron knocked out of the gas by a gamma ray
        if (source.gammaEnergy) this.generateComptonElectron(source);
    }

    // Compton scattering: a gamma ray from the source hits an electron of the gas somewhere in the chamber.
    // The gamma ray is deflected by some angle and carries on unseen, the electron recoils and leaves a track.
    generateComptonElectron(source) {
        // Where: gamma rays thin out with distance, but further out there is more gas at that distance.
        // In a thin layer the two cancel, so every distance from the source is equally likely.
        var x, y, away_x, away_y;
        do {
            const distance = getRandom(0.5 * source.length * bw, source.gammaReach * bw);
            const direction = twoPI * Math.random();
            away_x = Math.cos(direction);       // direction of the gamma ray
            away_y = Math.sin(direction);
            x = 0.5 * bw + distance * away_x;
            y = 0.5 * bh + distance * away_y;
        } while (x < 0 || x > bw || y < 0 || y > bh);
        const z = layerThickness * Math.random();

        // How hard the electron is hit depends on the angle by which the gamma ray is deflected.
        // Conservation of energy and momentum gives the energy of the electron and the angle at which it leaves.
        const gammaOverRest = source.gammaEnergy / electronRestEnergy;
        var beta, electronAngle;
        do {
            const cosDeflection = getRandom(-1, 1);
            const transfer = gammaOverRest * (1 - cosDeflection);
            const energy = source.gammaEnergy * transfer / (1 + transfer);
            const tanHalf = Math.sqrt((1 - cosDeflection) / (1 + cosDeflection + 1e-9));
            electronAngle = Math.atan(1 / ((1 + gammaOverRest) * tanHalf + 1e-9));     // between the electron and the gamma ray
            beta = betaFromEnergy(energy, electronRestEnergy);
        } while (beta < deltaBetaMin);      // too slow to leave a visible track: try again

        // The electron leaves at that angle from the gamma ray, in a random direction around it
        const around = twoPI * Math.random();
        const forward = Math.cos(electronAngle);
        const sideways = Math.sin(electronAngle) * Math.cos(around);    // on screen, perpendicular to the gamma ray
        const depth    = Math.sin(electronAngle) * Math.sin(around);    // along the depth
        this.generateParticle(0, x, y,
                              beta * (forward * away_x - sideways * away_y), beta * (forward * away_y + sideways * away_x),
                              z, beta * depth);
    }

    // Thoron: two alphas from the same spot in the gas near the source, the second a moment after the first
    generateThoronPair(source) {
        // The gas escapes from somewhere on the rod and spreads out from there
        const escape = this.randomPointOnRod(source);
        var x, y;
        do {
            x = escape.x + source.thoronSpread * bw * randomGaussian();
            y = escape.y + source.thoronSpread * bw * randomGaussian();
        } while (x < 0 || x > bw || y < 0 || y > bh);
        const z = layerThickness * Math.random();

        this.emitInRandomDirection(4, x, y, z, betaFromEnergy(source.thoronEnergies[0], alphaRestEnergy), 0);
        // Radioactive decay: the wait is random, usually shorter than the average and now and then much longer
        const wait = -Math.log(1 - Math.random()) * source.thoronDelay;
        this.pending.push({wait: wait, action: () => {
            this.emitInRandomDirection(4, x, y, z, betaFromEnergy(source.thoronEnergies[1], alphaRestEnergy), 0);
        }});
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
        const workStarted = performance.now();

        // Start the image from darkness, and let the swirls of the gas change a little
        this.image.clear();
        this.flow.update(clockStep);
        this.mistPatches.update(clockStep);

        // Active source: the chance of a particle during this frame is (particles per second) * (seconds on the droplet clock)
        if (this.activeSource !== null) {
            const source = sources[this.activeSource];
            if (Math.random() < source.rate * clockStep) this.emitFromSource();
            if (source.thoronRate && Math.random() < source.thoronRate * clockStep) this.generateThoronPair(source);
        }

        // Things which were due to happen later: count down, and do the ones whose time has come
        for (const item of this.pending) {
            item.wait -= clockStep;
            if (item.wait <= 0) item.action();
        }
        this.pending = this.pending.filter((item) => item.wait > 0);

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

        // Only if the picture is drawn by the processor: if the work for a frame takes too long on average,
        // this device cannot keep up at this resolution. Carry on with a coarser picture (which looks the same,
        // only softer). The resolution is never raised again.
        // (The first frames after the image has been set up include work which is only done once, such as
        // preparing the shaders, so they are not counted: workFrames starts below zero.)
        this.workFrames++;
        if (this.workFrames > 0) this.workTime += performance.now() - workStarted;
        if (this.workFrames >= frameBudgetFrames) {
            const averageWork = this.workTime / this.workFrames;
            if (!useWebGL && averageWork > frameBudget && imageScale > minImageScale) {
                imageScaleLimit = imageScale - imageScaleStep;
                this.updateImageScale();
            }
            // If the picture is drawn by the graphics card and frames take too long, the picture is too large for
            // this graphics card: carry on with a picture which has 30 percent fewer pixels across, and do not go back up.
            if (useWebGL && averageWork > busyGraphicsCard && imageScale > minImageScale + 1e-6) {
                imageScaleLimit = Math.max(minImageScale, 0.7 * imageScale);
                this.updateImageScale();
            }
            // If the picture is already as small as it gets and frames are still far too slow, the "graphics card"
            // is being imitated on the processor. A canvas cannot change the way it is drawn, so load the page
            // again and let the processor draw the picture itself.
            else if (useWebGL && averageWork > slowGraphicsCard) {
                const address = new URL(window.location.href);
                address.searchParams.set('renderer', 'cpu');
                window.location.replace(address.href);
            }
            this.workTime = 0;
            this.workFrames = 0;
        }

        // Keep loop going
        this.animationID = requestAnimationFrame((time) => this.animate(time));
    }

    // Make sure that the picture has the resolution which suits the screen at this moment (see header.js).
    // Called when the user zooms or resizes the window, and when this device turns out to be too slow.
    updateImageScale() {
        const newScale = chooseImageScale();
        if (Math.abs(newScale - imageScale) < 1e-6) return;
        this.rebuildImage(newScale);
        this.workTime = 0;
        this.workFrames = -warmUpFrames;
        // While the animation is paused nothing would redraw the picture, so draw one frame which lasts no time
        if (!this.isRunning) {
            this.image.clear();
            this.backgroundDroplets.render(this.image, this.flow, 0);
            this.trackDroplets.render(this.image, this.flow, 0);
            this.image.develop();
        }
    }

    // Replace the image by a new one with this resolution (or with the same resolution, if left out)
    rebuildImage(newScale) {
        if (this.image.dispose) this.image.dispose();
        setImageScale((newScale === undefined) ? imageScale : newScale);
        this.image = createChamberImage();
        // The solid objects are redrawn at the new resolution as well
        sizeObjectsCanvas();
        drawSourceImage(this.activeSource);
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

        // Tell the user what this setting means
        updateSpeedReadout(this);
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
                updateRandomButton();
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
            updateRandomButton();
        }
        
        // Switch the source off, and forget what was still due to happen
        this.setSource(null);
        this.pending = [];
        updateSourceButtons();

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