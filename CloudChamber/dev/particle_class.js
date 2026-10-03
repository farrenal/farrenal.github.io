//---------- Class of particles -----------------------------------------------------------------------------------------------
// A particle moves in three dimensions. x and y are the directions we see on screen. z is the depth, along the line of
// sight (and along the magnetic field). Droplets only condense in the sensitive layer, 0 < z < layerThickness,
// so we only see the part of a track which lies inside this layer.
class Particle {

    // Automatically called when create new Particle(...)
    // z (optional): depth at which the particle starts, in canvas pixels. The middle of the sensitive layer if left out.
    // v_z (optional): velocity along the depth. Zero if left out, so the particle stays in the layer.
    constructor(species, x, y, v_x, v_y, z, v_z){
        // Position in canvas pixels. The velocity is given as a fraction of the speed of light (beta)
        // and stored in canvas pixels per tick of simulation time.
        this.x = x;
        this.y = y;
        this.z = (z === undefined) ? 0.5 * layerThickness : z;
        this.v_x = v_x * lightSpeed;
        this.v_y = v_y * lightSpeed;
        this.v_z = (v_z === undefined) ? 0 : v_z * lightSpeed;

        this.particleType = species; // This is a number, e.g. 0, 1, 2, ..., numSpecies
        this.particleCharge         = properties[species][0];
        this.particleMass           = properties[species][1];

        this.speedNorm = Math.sqrt(this.v_x*this.v_x + this.v_y*this.v_y + this.v_z*this.v_z);
        this.speedCutOff = stopBeta * lightSpeed;

        // FIXED PHYSICS SUBSTEP (in ticks)
        // Chosen once, from the properties of the particle only, so the trajectory is identical at every slider speed.
        // The slider only decides how many of these substeps are taken per rendered frame.
        const maxTurnRate = Math.abs(this.particleCharge) * magScale * dt / this.particleMass; // radians per tick
        this.substep = Math.min(maxSubstepTurn / maxTurnRate, maxSubstepDistance / this.speedNorm);
        this.timeDebt = 0;      // simulation time handed to this particle but not yet integrated

        // Energy loss per canvas pixel of path, see the energy loss section of header.js
        this.energyLoss = energyLossRate * this.particleCharge * this.particleCharge / this.particleMass;

        // Trail droplets: how many are created per pixel of path, how far they spread sideways (canvas pixels),
        // and how big the biggest ones are. All three follow from the ionisation and change as the particle slows down.
        // So do the amount of scattering and the number of delta rays.
        this.updateIonisation();
        this.depositCarry = 0;  // path length left over from the previous substep, keeps droplet density uniform
        this.widthWobble = 0;   // slowly wandering change of the trail width along the track

        // Becomes true once the track is complete, the chamber then forgets the particle (its droplets live on)
        this.isFinished = false;

        // Optional: a function which is called if the particle comes to rest inside the chamber (used for decays)
        this.whenStopped = null;
    }

    // Called once per rendered frame.
    // simTime: simulation time (ticks) that passed this frame, set by the speed slider
    advance(simTime) {
        // Take as many fixed substeps as fit in the simulation time available.
        // In slow motion this is often zero (the debt carries over), at top speed it is thousands.
        this.timeDebt += simTime;
        while (this.timeDebt >= this.substep && !this.isFinished){
            this.timeDebt -= this.substep;
            this.step();
        }
    }

    // The track is complete
    finish() {
        this.isFinished = true;
    }

    // The particle has come to rest
    stop() {
        if (this.whenStopped) this.whenStopped(this);
        this.finish();
    }

    // How well droplets condense at the current depth: 1 in the middle of the sensitive layer,
    // falling to 0 at its two faces, and 0 outside
    layerVisibility() {
        const distanceToFace = Math.min(this.z, layerThickness - this.z);
        if (distanceToFace <= 0) return 0;
        return Math.min(1, distanceToFace / (layerEdge * layerThickness));
    }

    // One fixed substep of physics, and the piece of trail that goes with it
    step() {
        // The track is complete if the particle has
        // 1. left the part of the chamber which we see
        // 2. left the sensitive layer through one of its faces, moving away from it
        // 3. stopped moving
        const outsideCanvas = (this.x >= bw || this.x <= 0 || this.y >= bh || this.y <= 0);
        const leftLayer = (this.z < 0 && this.v_z < 0) || (this.z > layerThickness && this.v_z > 0);
        const stoppedMoving = (this.speedNorm < this.speedCutOff);
        if (stoppedMoving) {
            this.stop();
            return;
        }
        if (outsideCanvas || leftLayer) {
            this.finish();
            return;
        }

        const h = this.substep;
        const old_x = this.x;
        const old_y = this.y;

        if (theCC.Bz != 0) {
            // Lorentz force F = q(v × B) with B along z, i.e. acceleration (k*v_y, -k*v_x, 0) with k in radians per tick.
            // The force does not act along z, so with a velocity along z the particle moves on a helix.
            // The momentum is gamma * m * v, so a fast particle is harder to bend: its radius is gamma * m * v / (q * B).
            // Integrated with the Boris scheme: a discrete F = ma step which conserves speed exactly,
            // so circles stay closed instead of slowly growing as they do with a plain Euler step.
            const k = this.particleCharge * theCC.Bz * dt / (this.particleMass * this.gamma);
            const t = 0.5 * k * h;
            const s = 2 * t / (1 + t*t);
            const half_v_x = this.v_x + this.v_y * t;
            const half_v_y = this.v_y - this.v_x * t;
            this.v_x += half_v_y * s;
            this.v_y -= half_v_x * s;
        }

        // Multiple scattering: turn the velocity by a small random angle (the speed does not change).
        // In three dimensions the velocity can turn in two independent directions e1 and e2, both perpendicular to it.
        if (this.scatter > 1e-5) {
            const typicalAngle = this.scatter * Math.sqrt(this.speedNorm * h);
            const angle1 = typicalAngle * randomGaussian();
            const angle2 = typicalAngle * randomGaussian();

            const speed = this.speedNorm;
            const unit_x = this.v_x / speed;
            const unit_y = this.v_y / speed;
            const unit_z = this.v_z / speed;
            // e1 lies in the plane of the screen
            const planar = Math.sqrt(unit_x*unit_x + unit_y*unit_y);
            const e1_x = (planar > 1e-6) ?  unit_y / planar : 1;
            const e1_y = (planar > 1e-6) ? -unit_x / planar : 0;
            // e2 = unit × e1
            const e2_x = -unit_z * e1_y;
            const e2_y =  unit_z * e1_x;
            const e2_z =  unit_x * e1_y - unit_y * e1_x;

            const new_x = unit_x + angle1 * e1_x + angle2 * e2_x;
            const new_y = unit_y + angle1 * e1_y + angle2 * e2_y;
            const new_z = unit_z                 + angle2 * e2_z;
            const rescale = speed / Math.sqrt(new_x*new_x + new_y*new_y + new_z*new_z);
            this.v_x = new_x * rescale;
            this.v_y = new_y * rescale;
            this.v_z = new_z * rescale;
        }

        this.x += this.v_x * h;
        this.y += this.v_y * h;
        this.z += this.v_z * h;
        const pathLength = this.speedNorm * h;

        // Droplets and delta rays only where the particle is inside the sensitive layer
        const visibility = this.layerVisibility();
        if (visibility > 0) {
            depositDroplets(this, old_x, old_y, this.x, this.y, pathLength, visibility);

            // Delta rays: the chance of one in this substep is (number per pixel) * (pixels travelled)
            if (this.deltaRaysPerPixel > 0 && Math.random() < this.deltaRaysPerPixel * pathLength) {
                this.emitDeltaRay();
            }
        }

        // Energy loss: beta^4 decreases in proportion to the path travelled (see header.js), the direction is unchanged
        if (this.energyLoss > 0) {
            const beta = this.speedNorm / lightSpeed;
            const gamma = this.gamma;
            const beta4 = beta*beta*beta*beta - 4 * this.energyLoss * pathLength / (gamma*gamma*gamma);
            if (beta4 <= stopBeta*stopBeta*stopBeta*stopBeta) {
                this.stop();
                return;
            }
            const newSpeed = lightSpeed * Math.sqrt(Math.sqrt(beta4));
            const slowing = newSpeed / this.speedNorm;
            this.v_x *= slowing;
            this.v_y *= slowing;
            this.v_z *= slowing;
            this.speedNorm = newSpeed;
            this.updateIonisation();
        }
    }

    // Work out the trail which the particle leaves at its current speed (see the ionisation section of header.js)
    updateIonisation() {
        const beta = this.speedNorm / lightSpeed;
        const ionisation = Math.min(ionisationCap, this.particleCharge * this.particleCharge / (beta * beta));
        const aboveKnee = 1 + ionisation / ionisationKnee;

        this.ionisation = ionisation;
        this.dropletsPerPixel = mipDropletsPerPixel * Math.pow(ionisation, 0.25) * Math.pow(aboveKnee, 0.75);
        this.trailSigma       = mipTrailSigma       * Math.pow(ionisation, 0.15) * Math.pow(aboveKnee, 0.35);
        // Droplets in the core of wide trails are bigger
        this.maxDropletSize = 1 + Math.round(0.55 * this.trailSigma / mipTrailSigma);

        // Multiple scattering, in radians per square root of a canvas pixel of path
        const gamma = 1 / Math.sqrt(1 - Math.min(beta * beta, 0.998));
        this.gamma = gamma;
        this.scatter = Math.min(scatterMax, scatterStrength * Math.abs(this.particleCharge) / (this.particleMass * gamma * beta * beta));

        // Delta rays per canvas pixel of path, and the fastest electron this particle can knock on
        const isElectron = (this.particleType == 0 || this.particleType == 1);
        this.deltaBetaMax = isElectron ? 0.7 * beta : Math.min(2 * beta, 0.98);
        if (this.deltaBetaMax > deltaBetaMin) {
            const slowestOverFastest = deltaBetaMin / this.deltaBetaMax;
            this.deltaRaysPerPixel = deltaRayRate * this.particleCharge * this.particleCharge / (beta * beta) * (1 - slowestOverFastest * slowestOverFastest);
        }
        else this.deltaRaysPerPixel = 0;
    }

    // Knock an electron out of the gas at the current position
    emitDeltaRay() {
        // Its kinetic energy T ~ beta^2 is distributed like 1/T^2 between the slowest visible and the fastest possible,
        // so most delta rays are slow and short, and a few are fast and long
        const inverseMin = 1 / (deltaBetaMin * deltaBetaMin);
        const inverseMax = 1 / (this.deltaBetaMax * this.deltaBetaMax);
        const beta = 1 / Math.sqrt(inverseMin - Math.random() * (inverseMin - inverseMax));

        // Its direction follows from the collision: the fastest are knocked straight ahead, slower ones leave
        // more and more sideways. The angle to the track is fixed by the collision, the direction around the track is random.
        const mass = this.particleMass;
        const parentBeta = this.speedNorm / lightSpeed;
        const unit_x = this.v_x / this.speedNorm;
        const unit_y = this.v_y / this.speedNorm;
        const unit_z = this.v_z / this.speedNorm;
        const cosAngle = Math.min(1, beta * (mass + m_e) / (2 * mass * parentBeta));
        const sinAngle = Math.sqrt(1 - cosAngle * cosAngle);
        const around = twoPI * Math.random();

        // Two directions perpendicular to the track (as for the scattering in step())
        const planar = Math.sqrt(unit_x*unit_x + unit_y*unit_y);
        const e1_x = (planar > 1e-6) ?  unit_y / planar : 1;
        const e1_y = (planar > 1e-6) ? -unit_x / planar : 0;
        const e2_x = -unit_z * e1_y;
        const e2_y =  unit_z * e1_x;
        const e2_z =  unit_x * e1_y - unit_y * e1_x;
        const sideways1 = sinAngle * Math.cos(around);
        const sideways2 = sinAngle * Math.sin(around);

        const dir_x = cosAngle * unit_x + sideways1 * e1_x + sideways2 * e2_x;
        const dir_y = cosAngle * unit_y + sideways1 * e1_y + sideways2 * e2_y;
        const dir_z = cosAngle * unit_z                    + sideways2 * e2_z;

        // Recoil: the particle gives up the energy and the momentum of the delta ray
        const deltaGamma = 1 / Math.sqrt(1 - beta * beta);
        const newGamma = this.gamma - (deltaGamma - 1) * m_e / mass;
        if (newGamma > 1) {
            const parentMomentum = this.gamma * mass * parentBeta;
            const deltaMomentum  = deltaGamma * m_e * beta;
            const momentum_x = parentMomentum * unit_x - deltaMomentum * dir_x;
            const momentum_y = parentMomentum * unit_y - deltaMomentum * dir_y;
            const momentum_z = parentMomentum * unit_z - deltaMomentum * dir_z;
            const momentum = Math.sqrt(momentum_x*momentum_x + momentum_y*momentum_y + momentum_z*momentum_z);
            const newSpeed = lightSpeed * Math.sqrt(1 - 1 / (newGamma * newGamma));
            this.v_x = newSpeed * momentum_x / momentum;
            this.v_y = newSpeed * momentum_y / momentum;
            this.v_z = newSpeed * momentum_z / momentum;
            this.speedNorm = newSpeed;
            this.updateIonisation();
        }

        theCC.generateParticle(0, this.x, this.y, beta * dir_x, beta * dir_y, this.z, beta * dir_z);
    }

    // A droplet condenses at (x, y). From now on it belongs to the chamber, not to the particle.
    addDroplet(x, y, size, brightness) {
        const life    = getRandom(dropletLifeMin, dropletLifeMax);
        const drift_x = dropletDrift * randomGaussian();
        const drift_y = dropletDrift * randomGaussian();
        theCC.trackDroplets.add(x, y, size, brightness, life, drift_x, drift_y, 0);
    }
}
