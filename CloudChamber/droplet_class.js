//---------- Class of droplets ------------------------------------------------------------------------------------------------
// Every droplet in the chamber lives its own life: it condenses, is carried along by the moving gas, and evaporates.
// Droplets do not know which particle created them (if any), so a track dissolves droplet by droplet.
//
// Each droplet is stored as dropletStride numbers in one flat array:
//      x, y            position (canvas pixels)
//      drift x, y      its own random velocity relative to the gas (canvas pixels per second)
//      brightness      between 0 and 1
//      life            seconds until it has evaporated
//      size            how big it is (1 is the smallest), bigger droplets scatter more light
//      age             seconds since it condensed
// All of these seconds are measured on the droplet clock of the chamber (see CloudChamber.animate).
const dropletStride = 8;

class DropletPool {

    constructor() {
        this.data = new Float32Array(4096 * dropletStride);     // grows when full
        this.count = 0;
    }

    // A droplet condenses at (x, y)
    add(x, y, size, brightness, life, drift_x, drift_y, age) {
        if ((this.count + 1) * dropletStride > this.data.length) {
            const bigger = new Float32Array(this.data.length * 2);
            bigger.set(this.data);
            this.data = bigger;
        }
        const d = this.data;
        const i = this.count * dropletStride;
        d[i]     = x;
        d[i + 1] = y;
        d[i + 2] = drift_x;
        d[i + 3] = drift_y;
        d[i + 4] = brightness;
        d[i + 5] = life;
        d[i + 6] = size;
        d[i + 7] = age;
        this.count++;
    }

    clear() {
        this.count = 0;
    }

    // Age every droplet by clockStep seconds, forget the ones which have evaporated,
    // move the rest with the gas (flow) and add their light to the image of the chamber.
    render(image, flow, clockStep) {
        const d = this.data;
        const end = this.count * dropletStride;
        const steady = 1 - dropletTwinkle;
        let keep = 0;   // where the next surviving droplet is stored, so that evaporated droplets leave no gaps

        for (let i = 0; i < end; i += dropletStride) {
            const age = d[i + 7] + clockStep;
            const life = d[i + 5];
            if (age >= life) continue;  // evaporated
            const lived = age / life;

            // It moves with the gas around it. On top of that it has its own random drift, which starts
            // at zero and grows with age, so a fresh track is sharp and an old one is smeared out.
            flow.velocityAt(d[i], d[i + 1]);
            const x = d[i]     + (flow.velocity_x + d[i + 2] * lived) * clockStep;
            const y = d[i + 1] + (flow.velocity_y + d[i + 3] * lived) * clockStep;

            // Keep this droplet
            if (keep != i) {
                for (let n = 2; n < 7; n++) d[keep + n] = d[i + n];
            }
            d[keep]     = x;
            d[keep + 1] = y;
            d[keep + 7] = age;
            keep += dropletStride;

            // It appears quickly, stays bright for most of its life and then fades, flickering throughout
            let brightness = d[i + 4] * (1 - lived * lived);
            if (age < dropletGrowTime) brightness *= age / dropletGrowTime;
            brightness *= steady + dropletTwinkle * Math.random();

            // The light it scatters grows with its size
            const size = d[i + 6];
            image.addLight(x, y, brightness * size * Math.sqrt(size));
        }
        this.count = keep / dropletStride;
    }
}
