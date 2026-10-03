// The lattice of the q-state Potts model, and its evolution with the Metropolis-Hastings algorithm
class PottsModel {
    constructor() {
        this.q = startQ;
        this.temperature = presets[startQ].T[startTemperaturePreset];
        this.field = presets[startQ].H[startFieldPreset];
        this.sweepsPerSecond = minSweepsPerSecond;

        // Colours as the four bytes of a pixel (red, green, blue, opacity), packed into one number
        this.palette = new Uint32Array(stateColours.length);
        const bytes = new Uint8Array(this.palette.buffer);
        stateColours.forEach((colour, state) => {
            bytes[4*state]     = parseInt(colour.slice(1, 3), 16);
            bytes[4*state + 1] = parseInt(colour.slice(3, 5), 16);
            bytes[4*state + 2] = parseInt(colour.slice(5, 7), 16);
            bytes[4*state + 3] = 255;
        });

        this.acceptance = new Float64Array((2*neighbourCount + 1) * 3);
        this.updateAcceptance();

        this.isRunning = true;
        this.lastTime = null;       // time of the previous frame
        this.stepCarry = 0;         // fraction of a step which is left over from the previous frame
        this.measuredSteps = 0;     // steps and seconds since the speed was last measured
        this.measuredTime = 0;
        this.measuredSweepsPerSecond = 0;

        this.setSize(latticeSizes[startLatticeSize][0], latticeSizes[startLatticeSize][1]);
        window.requestAnimationFrame((now) => this.animate(now));
    }

    //--------------- Setting up --------------------------------------------------------
    // A new lattice of this size, in a random configuration
    setSize(width, height) {
        this.width = width;
        this.height = height;
        this.sites = width * height;
        this.state = new Uint8Array(this.sites);    // the state of every site, row after row
        this.counts = new Int32Array(stateColours.length);    // number of sites in each state

        canvas.width = width;
        canvas.height = height;
        this.image = context2d.createImageData(width, height);
        this.pixels = new Uint32Array(this.image.data.buffer);

        this.randomise();
    }

    // Every site gets a random state: the lattice at infinite temperature
    randomise() {
        this.counts.fill(0);
        for (var site = 0; site < this.sites; site++) {
            const state = Math.floor(Math.random() * this.q);
            this.state[site] = state;
            this.counts[state]++;
        }
        this.stepCarry = 0;
        this.draw();
    }

    // A different number of states needs a new lattice
    setQ(q) {
        this.q = q;
        this.randomise();
    }

    // The temperature and the field can change while the lattice evolves
    setTemperature(temperature) {
        this.temperature = temperature;
        this.updateAcceptance();
    }

    setField(field) {
        this.field = field;
        this.updateAcceptance();
    }

    // The change in energy of a proposal (divided by 2J) is
    //      dNeighbours + field / 2J * dField,
    // where dNeighbours is a whole number between -8 and 8, and dField is -1, 0 or 1.
    // So there are only 51 possible changes, and the chance of accepting each of them is worked out once here
    // instead of at every step.
    updateAcceptance() {
        const fieldPerBond = this.field / (2 * J);
        for (var dNeighbours = -neighbourCount; dNeighbours <= neighbourCount; dNeighbours++) {
            for (var dField = -1; dField <= 1; dField++) {
                const dE = dNeighbours + fieldPerBond * dField;
                const chance = (dE <= 0) ? 1 : Math.exp(-dE / this.temperature);
                this.acceptance[(dNeighbours + neighbourCount) * 3 + dField + 1] = chance;
            }
        }
    }

    //--------------- Metropolis-Hastings algorithm --------------------------------------------------------
    // Propose a change of one random site, this many times
    step(count) {
        const state = this.state;
        const counts = this.counts;
        const acceptance = this.acceptance;
        const width = this.width;
        const height = this.height;
        const sites = this.sites;
        const q = this.q;

        for (var n = 0; n < count; n++) {
            // Pick a random site and a random state for it
            const site = Math.floor(Math.random() * sites);
            const next = Math.floor(Math.random() * q);
            const current = state[site];
            if (next == current) continue;      // nothing would change

            // Where the neighbours are in the list of sites. Sites on an edge have neighbours on the opposite edge.
            const column = site % width;
            const row = (site - column) / width;
            const left  = (column == 0)          ? width - 1 : -1;
            const right = (column == width - 1)  ? 1 - width : 1;
            const up    = (row == 0)             ? sites - width : -width;
            const down  = (row == height - 1)    ? width - sites : width;

            // Neighbours in the current state, minus neighbours in the proposed state
            var dNeighbours = 0;
            var neighbour;
            neighbour = state[site + left];         if (neighbour == current) dNeighbours++; else if (neighbour == next) dNeighbours--;
            neighbour = state[site + right];        if (neighbour == current) dNeighbours++; else if (neighbour == next) dNeighbours--;
            neighbour = state[site + up];           if (neighbour == current) dNeighbours++; else if (neighbour == next) dNeighbours--;
            neighbour = state[site + down];         if (neighbour == current) dNeighbours++; else if (neighbour == next) dNeighbours--;
            neighbour = state[site + up + left];    if (neighbour == current) dNeighbours++; else if (neighbour == next) dNeighbours--;
            neighbour = state[site + up + right];   if (neighbour == current) dNeighbours++; else if (neighbour == next) dNeighbours--;
            neighbour = state[site + down + left];  if (neighbour == current) dNeighbours++; else if (neighbour == next) dNeighbours--;
            neighbour = state[site + down + right]; if (neighbour == current) dNeighbours++; else if (neighbour == next) dNeighbours--;

            // Only the state along the field feels it
            const dField = (current == fieldDirection ? 1 : 0) - (next == fieldDirection ? 1 : 0);

            // Accept the proposal at once if it does not cost energy, and otherwise with the chance exp(-dE / T)
            const chance = acceptance[(dNeighbours + neighbourCount) * 3 + dField + 1];
            if (chance >= 1 || Math.random() < chance) {
                state[site] = next;
                counts[current]--;
                counts[next]++;
            }
        }
    }

    //--------------- Animation --------------------------------------------------------
    // Colour every pixel of the canvas by the state of its site
    draw() {
        const state = this.state;
        const pixels = this.pixels;
        const palette = this.palette;
        for (var site = 0; site < this.sites; site++) pixels[site] = palette[state[site]];
        context2d.putImageData(this.image, 0, 0);
        if (typeof updatePopulations == 'function') updatePopulations(this);
    }

    animate(now) {
        window.requestAnimationFrame((next) => this.animate(next));
        if (this.lastTime === null) this.lastTime = now;
        const frameTime = Math.min(maxFrameTime, (now - this.lastTime) / 1000);
        this.lastTime = now;
        if (!this.isRunning) return;

        // Steps which are due for this frame, in chunks, until they are done or the time for one frame is used up
        var due = this.sweepsPerSecond * this.sites * frameTime + this.stepCarry;
        const started = performance.now();
        var done = 0;
        while (due >= 1) {
            const chunk = Math.min(stepChunk, Math.floor(due));
            this.step(chunk);
            done += chunk;
            due -= chunk;
            if (performance.now() - started > frameBudget) { due = 0; break; }
        }
        this.stepCarry = due;
        this.draw();

        // The speed which is really reached, for the readout next to the slider
        this.measuredSteps += done;
        this.measuredTime += frameTime;
        if (this.measuredTime >= speedReadoutInterval) {
            this.measuredSweepsPerSecond = this.measuredSteps / this.sites / this.measuredTime;
            this.measuredSteps = 0;
            this.measuredTime = 0;
            if (typeof updateSpeedReadout == 'function') updateSpeedReadout(this);
        }
    }

    setAnimationSpeed(sweepsPerSecond) {
        this.sweepsPerSecond = sweepsPerSecond;
    }

    toggleAnimation() {
        this.isRunning = !this.isRunning;
        this.measuredSteps = 0;
        this.measuredTime = 0;
        updatePausePlayButton();
        updateSpeedReadout(this);
    }
}
