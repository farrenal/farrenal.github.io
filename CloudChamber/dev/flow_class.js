//---------- Class of the moving gas -------------------------------------------------------------------------------------------
// The gas in the chamber is never still: it moves in slow, wide swirls which change gradually.
// Every droplet is carried along by the gas, so a track drifts and bends as one ribbon while it dissolves.
//
// The swirls are built from a few waves of a "stream function" psi(x, y),
//      psi = amplitude * sin(k_x * x + phase_x) * sin(k_y * y + phase_y),
// and the velocity of the gas is  (d psi / dy,  - d psi / dx).  A velocity made this way has no sources or sinks:
// gas which flows into a region flows out of it again, as it must for a gas which is not being compressed.
//
// The velocity is worked out once per frame on a coarse grid, and droplets read it off between the grid points.
class FlowField {

    constructor() {
        // Grid points, flowCell canvas pixels apart, covering the chamber
        this.columns = Math.ceil(bw / flowCell) + 1;
        this.rows    = Math.ceil(bh / flowCell) + 1;
        this.gridVelocity_x = new Float32Array(this.columns * this.rows);
        this.gridVelocity_y = new Float32Array(this.columns * this.rows);

        // Waves with random wavelengths, each drifting at its own slow pace
        this.waves = [];
        for (let n = 0; n < flowWaves; n++) {
            const k_x = twoPI / (bw * getRandom(flowWavelengthMin, flowWavelengthMax));
            const k_y = twoPI / (bw * getRandom(flowWavelengthMin, flowWavelengthMax));
            this.waves.push({
                k_x: k_x,
                k_y: k_y,
                // Chosen so that all waves together give a typical gas speed of flowSpeed
                amplitude: 2 * flowSpeed / (Math.sqrt(flowWaves) * Math.sqrt(k_x*k_x + k_y*k_y)),
                phase_x: twoPI * Math.random(),
                phase_y: twoPI * Math.random(),
                phaseRate_x: flowChangeRate * getRandom(-1, 1),     // radians per second
                phaseRate_y: flowChangeRate * getRandom(-1, 1)
            });
        }

        // Work space for update()
        this.sin_x = new Float32Array(this.columns);
        this.cos_x = new Float32Array(this.columns);

        // Result of velocityAt()
        this.velocity_x = 0;
        this.velocity_y = 0;

        this.update(0);
    }

    // Let the swirls change for clockStep seconds, and work out the velocity of the gas at every grid point
    update(clockStep) {
        this.gridVelocity_x.fill(0);
        this.gridVelocity_y.fill(0);

        for (const wave of this.waves) {
            wave.phase_x += wave.phaseRate_x * clockStep;
            wave.phase_y += wave.phaseRate_y * clockStep;

            for (let column = 0; column < this.columns; column++) {
                const angle = wave.k_x * column * flowCell + wave.phase_x;
                this.sin_x[column] = Math.sin(angle);
                this.cos_x[column] = Math.cos(angle);
            }
            for (let row = 0; row < this.rows; row++) {
                const angle = wave.k_y * row * flowCell + wave.phase_y;
                const sin_y = Math.sin(angle);
                const cos_y = Math.cos(angle);
                const first = row * this.columns;
                for (let column = 0; column < this.columns; column++) {
                    this.gridVelocity_x[first + column] += wave.amplitude * wave.k_y * this.sin_x[column] * cos_y;
                    this.gridVelocity_y[first + column] -= wave.amplitude * wave.k_x * this.cos_x[column] * sin_y;
                }
            }
        }
    }

    // Velocity of the gas at (x, y) in canvas pixels per second, left in this.velocity_x and this.velocity_y.
    // It is a weighted average of the four grid points around (x, y).
    velocityAt(x, y) {
        let grid_x = x / flowCell;
        let grid_y = y / flowCell;
        // Stay on the grid
        if (grid_x < 0) grid_x = 0; else if (grid_x > this.columns - 1.001) grid_x = this.columns - 1.001;
        if (grid_y < 0) grid_y = 0; else if (grid_y > this.rows - 1.001)    grid_y = this.rows - 1.001;

        const column = Math.floor(grid_x);
        const row    = Math.floor(grid_y);
        const weight_x = grid_x - column;
        const weight_y = grid_y - row;

        const topLeft     = row * this.columns + column;
        const bottomLeft  = topLeft + this.columns;
        const w00 = (1 - weight_x) * (1 - weight_y);
        const w10 = weight_x * (1 - weight_y);
        const w01 = (1 - weight_x) * weight_y;
        const w11 = weight_x * weight_y;

        const u = this.gridVelocity_x;
        const v = this.gridVelocity_y;
        this.velocity_x = w00 * u[topLeft] + w10 * u[topLeft + 1] + w01 * u[bottomLeft] + w11 * u[bottomLeft + 1];
        this.velocity_y = w00 * v[topLeft] + w10 * v[topLeft + 1] + w01 * v[bottomLeft] + w11 * v[bottomLeft + 1];
    }
}

//---------- Class of the patches in the mist ----------------------------------------------------------------------------------
// The vapour is not equally dense everywhere, so the background mist is thicker in some places than in others.
// The thickness is a smooth pattern made of a few waves, like the swirls of the gas above, which shifts slowly.
class MistPatches {

    constructor() {
        this.waves = [];
        for (let n = 0; n < 3; n++) {
            this.waves.push({
                k_x: twoPI / (bw * getRandom(mistPatchSizeMin, mistPatchSizeMax)),
                k_y: twoPI / (bw * getRandom(mistPatchSizeMin, mistPatchSizeMax)),
                phase_x: twoPI * Math.random(),
                phase_y: twoPI * Math.random(),
                phaseRate_x: mistChangeRate * getRandom(-1, 1),     // radians per second
                phaseRate_y: mistChangeRate * getRandom(-1, 1)
            });
        }
    }

    // Let the patches shift for clockStep seconds
    update(clockStep) {
        for (const wave of this.waves) {
            wave.phase_x += wave.phaseRate_x * clockStep;
            wave.phase_y += wave.phaseRate_y * clockStep;
        }
    }

    // How thick the mist is at (x, y): between 1 - mistPatchiness (thinnest) and 1 (thickest), relative to the thickest patch
    thicknessAt(x, y) {
        let pattern = 0;    // between -1 and 1
        for (const wave of this.waves) {
            pattern += Math.sin(wave.k_x * x + wave.phase_x) * Math.sin(wave.k_y * y + wave.phase_y);
        }
        pattern /= this.waves.length;
        return 1 - 0.5 * mistPatchiness * (1 - pattern);
    }
}
