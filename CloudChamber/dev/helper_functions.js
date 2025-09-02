
//---------- Class of particles -----------------------------------------------------------------------------------------------
class Particle {
    
    // Automatically called when create new Particle(...)
    constructor(species, x, y, v_x, v_y){
        // Store data as attributes of the particle so can be accessed outside
        this.x = x;
        this.y = y;
        this.v_x = v_x;
        this.v_y = v_y;
        this.particleDirection = [this.v_x, this.v_y];
        this.particleType = species; // This is a number, e.g. 0, 1, 2, ..., numSpecies
        this.particleTrailWidth     = properties[species][0];
        this.particleDiffusionCoeff = properties[species][1]; 
        this.particleCharge         = properties[species][2];
        this.particleMass           = properties[species][3];
        
        // Once the particle reaches the edge of the box, we will remove it from its species' array
        this.reachedEdge = false;   
        
        // Create off-screen canvas to animate particle
        this.particleCanvas = document.createElement('canvas');
        this.particleCanvas.width = bw;
        this.particleCanvas.height = bh;
        this.particleContext = this.particleCanvas.getContext('2d'); 
    }
    
    // This is the function which gets animated!
    update() {
        // Record previous position of particle
        this.last_seen = {x: this.x, y: this.y}; 
        // Update to next position of particle
        this.x += this.v_x;
        this.y += this.v_y;
        // Check if hit the edge of the canvas, if so notify globally
        if (this.x >= bw || this.x <= 0 || this.y >= bh || this.y <= 0) this.reachedEdge = true;
    }
        
    draw() {
        // Draw with a random diffusion gradient, which depends on the diffusion coefficient
        this.particleContext.strokeStyle = getNewDiffusionGradient(this.particleContext, this.v_x, this.v_y, this.particleDiffusionCoeff, true);
        this.particleContext.beginPath();
        this.particleContext.moveTo(this.last_seen.x, this.last_seen.y);
        this.particleContext.lineTo(this.x, this.y);
        this.particleContext.stroke();

        // Draw diffusion trails with a random gradient, which depends on the diffusion coefficient
        propagateDiffusion(this.particleContext, this.last_seen.x, this.last_seen.y, this.particleDirection, this.particleTrailWidth, this.particleDiffusionCoeff);
    }
    
    drawOnMain(ctx) {
        ctx.drawImage(this.particleCanvas, 0, 0);
    }
}

//---------- Class of system of particles --------------------------------------------------------------------------------------------
class CloudChamber {
    // Automatically called when a CloudChamber is created
    constructor(canvas) {
        
        this.canvas = canvas;
        this.context = canvas.getContext('2d');
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
        let r = Math.floor(getRandom(1,4));
        
        // Add buffer from edge
        let buffer = 7/8 ;

        if (r == 1){ // incoming from NE
            x = getRandom(bw/2, buffer*bw);
            y = getRandom((1 - buffer)*bh, bh/2);
            v_x = getRandom(-2.0,0.1);
            v_y = getRandom(-0.1,2.0);
        };
        if (r == 2){ // incoming from SE
            x = getRandom(bw/2, buffer*bw);
            y = getRandom(bh/2, buffer*bh);
            v_x = getRandom(-2.0,0.1);
            v_y = getRandom(-2.0,0.1);
        };
        if (r == 3){ // incoming from SW
            x = getRandom((1 - buffer)*bw, bw/2);
            y = getRandom(bh/2, buffer*bh);
            v_x = getRandom(-0.1,2.0);
            v_y = getRandom(-2,0.1);
        };
        if (r == 4){ // incoming from NW
            x = getRandom((1 - buffer)*bw, bw/2);
            y = getRandom((1 - buffer)*bh, bh/2);
            v_x = getRandom(-0.1,2.0);
            v_y = getRandom(-0.1,2.0);
        };

        this.generateParticle(species, x, y, speedUp*v_x, speedUp*v_y);
    }

    // updateParticleCount() {
    //     this.particleCountArray = [];
    //     for (var species = 0; species < numSpecies; species++){
    //         this.particleCountArray.push(particlesArray[species].length);
    //     }
    //     this.particleCount = Math.sum(this.particleCountArray)
    // }

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
                if (!particle.reachedEdge){
                    particle.draw();
                };
            };
            
            // Remove all particles outside of the canvas
            this.particlesArray[species] =  this.particlesArray[species].filter((particle) =>  particle.reachedEdge == false);
        };
        // ifEmptyCancel(animationID);
        
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
}


//--------------- Diffusion utils --------------------------------------------------------
function getNewDiffusionGradient(context, v_x, v_y, dC, particleTF){
    
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
    
    var gradient_stretch = bw;
    var diffusion_positions = makeArr(0, 1, gradient_stretch);

    for (var i = 0; i < gradient_stretch; i ++){
        var pos = diffusion_positions[i];
        if (Math.random() < Math.E**(-2*dC)){
            diffusionGradient.addColorStop(pos, "red");
        }  
        else {
            diffusionGradient.addColorStop(pos, "rgba(0, 0, 0, 0)");
        };
    };
    return diffusionGradient;
}

function propagateDiffusion(context, old_x, old_y, dir, tW, dC){
    
    // Get orthogonal directions for diffusion (rotate by +- pi/2)
    var v_x = dir[0];
    var v_y = dir[1];

    var dx = v_x;
    var dy = v_y;
    var dRect = Math.sqrt(dx**2 + dy**2)
    var angle = Math.atan(dy/dx);

    context.beginPath();
    context.translate(old_x, old_y);
    context.rotate(angle); // now the x axis is along the trajectory and y<0 is to the left, y>0 is to the right
    for (var trail = 0; trail < tW; trail++){
        context.fillStyle = getNewDiffusionGradient(context, v_x, v_y, dC*(1+trail), false);
        context.fillRect(0,0 + trail, Math.sign(dx)*dRect, 1); // below particle trajectory on screen
        context.fillStyle = getNewDiffusionGradient(context, v_x, v_y, dC*(1+trail), false);
        context.fillRect(0,0 - trail, Math.sign(dx)*dRect, 1); // above particle trajectory on screen
    };
    context.rotate(-angle);
    context.translate(-old_x, -old_y);
};


//------- Event listeners ----------------------------------------------------------------------------------------------------------------
function particleClicked(particleName) {
    var species = nameToSpecies[particleName];
    testCC.generateRandomParticle(species);
    // updateParticleCount();
}

addEventListener("mousemove", (e) => {
    cursor.x = e.clientX;
    cursor.y = e.clientY;
}
);

addEventListener("touchmove", (e) => {
    e.preventDefault();
    cursor.x = e.touches[0].clientX;
    cursor.y = e.touches[0].clientY;
},
{ passive: false },
);

const cursor = {
    x: bw / 2,
    y: bh / 2,
};

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
};

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

