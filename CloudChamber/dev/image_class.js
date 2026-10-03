//---------- Class of the image of the chamber ---------------------------------------------------------------------------------
// What we see of the chamber is light scattered by droplets, recorded by a camera.
// Each frame is built in three steps:
//
//  1. clear()      start from darkness.
//  2. addLight()   every droplet adds a little light at its position. The amounts simply add up,
//                  so where droplets crowd together the light can become many times that of a single droplet.
//  3. develop()    turn the light into the picture, the way a camera does:
//                  - glow: a small part of the light is spread over the surroundings, so dense tracks have a soft halo;
//                  - exposure: brightness = 1 - exp(-exposure * light). A little light gives a proportional brightness,
//                    a lot of light saturates to white instead of growing without limit.
//
// The image has fewer pixels than the simulation has "canvas pixels" (see imageScale in header.js). A droplet usually
// falls between image pixels, and its light is shared between the four nearest ones. This keeps motion smooth and
// makes droplets look like soft specks of mist and not like sharp squares.
class ChamberImage {

    constructor(context) {
        this.context = context;
        this.width  = imageWidth;
        this.height = imageHeight;

        // Light collected by every image pixel
        this.light = new Float32Array(this.width * this.height);

        // Glow: the light is also collected on a coarse grid (cells of glowCell x glowCell image pixels), which is blurred
        this.glowWidth  = Math.ceil(this.width  / glowCell) + 1;
        this.glowHeight = Math.ceil(this.height / glowCell) + 1;
        this.glow     = new Float32Array(this.glowWidth * this.glowHeight);
        this.glowTemp = new Float32Array(this.glowWidth * this.glowHeight);
        this.glowRow  = new Float32Array(this.glowWidth);
        // For every image column: which glow cell lies to its left, and how far it is towards the next one (0 to 1)
        this.glowColumn = new Int32Array(this.width);
        this.glowWeight = new Float32Array(this.width);
        for (let x = 0; x < this.width; x++) {
            const position = Math.max(0, (x + 0.5) / glowCell - 0.5);
            this.glowColumn[x] = Math.floor(position);
            this.glowWeight[x] = position - Math.floor(position);
        }

        // Lamp: the chamber is lit from the left, so droplets further to the right receive less light
        this.lamp = new Float32Array(this.width);
        for (let x = 0; x < this.width; x++) {
            this.lamp[x] = 1 - lampFalloff * x / (this.width - 1);
        }

        // The picture which is sent to the canvas.
        // pixels32 holds one number per pixel which contains red, green, blue and opacity.
        this.imageData = context.createImageData(this.width, this.height);
        this.pixels32 = new Uint32Array(this.imageData.data.buffer);

        // Exposure: table which turns an amount of light into a pixel (the colour of mist, with the right opacity).
        // Looking up a table is much faster than calling Math.exp for every pixel of every frame.
        this.tableSize = 2048;
        this.tableScale = (this.tableSize - 1) / exposureTableMax;      // table index per unit of light
        this.pixelTable = new Uint32Array(this.tableSize);
        for (let n = 0; n < this.tableSize; n++) {
            const light = n / this.tableScale;
            const opacity = Math.round(255 * (1 - Math.exp(-exposure * light)));
            this.pixelTable[n] = (opacity * 0x1000000 + mistColour) >>> 0;
        }
    }

    clear() {
        this.light.fill(0);
        this.glow.fill(0);
    }

    // A droplet at (x, y), in canvas pixels, scatters this amount of light towards the camera
    addLight(x, y, amount) {
        // Position in image pixels, relative to the centre of the top left pixel
        const image_x = x * imageScale - 0.5;
        const image_y = y * imageScale - 0.5;
        const column = Math.floor(image_x);
        const row    = Math.floor(image_y);
        if (column < 0 || row < 0 || column >= this.width - 1 || row >= this.height - 1) return;

        amount *= this.lamp[column];

        // Share the light between the four nearest pixels, more to the closer ones
        const weight_x = image_x - column;
        const weight_y = image_y - row;
        const index = row * this.width + column;
        const light = this.light;
        light[index]                  += amount * (1 - weight_x) * (1 - weight_y);
        light[index + 1]              += amount * weight_x       * (1 - weight_y);
        light[index + this.width]     += amount * (1 - weight_x) * weight_y;
        light[index + this.width + 1] += amount * weight_x       * weight_y;

        // Coarse grid for the glow
        this.glow[Math.floor(row / glowCell) * this.glowWidth + Math.floor(column / glowCell)] += amount;
    }

    // Spread the coarse grid of light out: every cell becomes an average of itself and its neighbours.
    // Done along the rows and then along the columns, twice.
    blurGlow() {
        const width = this.glowWidth;
        const height = this.glowHeight;
        for (let pass = 0; pass < 2; pass++) {
            const from = this.glow;
            const temp = this.glowTemp;
            for (let y = 0; y < height; y++) {
                const first = y * width;
                for (let x = 0; x < width; x++) {
                    const left  = from[first + (x > 0 ? x - 1 : x)];
                    const right = from[first + (x < width - 1 ? x + 1 : x)];
                    temp[first + x] = 0.25 * left + 0.5 * from[first + x] + 0.25 * right;
                }
            }
            for (let y = 0; y < height; y++) {
                const above = (y > 0 ? y - 1 : y) * width;
                const here  = y * width;
                const below = (y < height - 1 ? y + 1 : y) * width;
                for (let x = 0; x < width; x++) {
                    from[here + x] = 0.25 * temp[above + x] + 0.5 * temp[here + x] + 0.25 * temp[below + x];
                }
            }
        }
    }

    // Turn the collected light into the picture and show it
    develop() {
        this.blurGlow();

        const width = this.width;
        const light = this.light;
        const pixels32 = this.pixels32;
        const pixelTable = this.pixelTable;
        const tableScale = this.tableScale;
        const lastEntry = this.tableSize - 1;
        const glow = this.glow;
        const glowRow = this.glowRow;
        const glowColumn = this.glowColumn;
        const glowWeight = this.glowWeight;
        // A glow cell holds the light of glowCell x glowCell pixels, so divide to get light per pixel
        const glowFactor = glowStrength / (glowCell * glowCell);

        for (let y = 0; y < this.height; y++) {
            // Glow along this row of the image: a mix of the two nearest rows of the coarse grid
            const position = Math.max(0, (y + 0.5) / glowCell - 0.5);
            const upper = Math.floor(position) * this.glowWidth;
            const lower = upper + this.glowWidth;
            const weight = position - Math.floor(position);
            for (let x = 0; x < this.glowWidth; x++) {
                glowRow[x] = glowFactor * ((1 - weight) * glow[upper + x] + weight * glow[lower + x]);
            }

            const first = y * width;
            for (let x = 0; x < width; x++) {
                const cell = glowColumn[x];
                const mix = glowWeight[x];
                const total = light[first + x] + (1 - mix) * glowRow[cell] + mix * glowRow[cell + 1];

                let entry = Math.floor(total * tableScale);
                if (entry > lastEntry) entry = lastEntry;
                pixels32[first + x] = pixelTable[entry];
            }
        }
        this.context.putImageData(this.imageData, 0, 0);
    }
}
