var numParticlesSlider = document.getElementById("numParticlesSlider");
var numParticlesText = document.getElementById("numParticlesText");
var numParticles = numParticlesSlider.value
numParticlesText.innerText = numParticles

var trailWidthSlider = document.getElementById("trailWidthSlider");
var trailWidthText = document.getElementById("trailWidthText");
var trailWidth = trailWidthSlider.value;
trailWidthText.innerText = trailWidth;

var canvas = document.getElementById("datCanvas");
var sumValue = document.getElementById("sumValue");
var SliderTest = document.getElementById("SliderTest");

var distortion_ratio = canvas.clientWidth/canvas.clientHeight
// sumValue.innerText += "\n" + canvas.width + " " + canvas.height + " " + canvas.width/canvas.height;
// sumValue.innerText += "\n" + canvas.clientWidth + " " + canvas.clientHeight + " " + distortion_ratio;

scale = 5
canvas.width *= scale;
canvas.height = canvas.width / distortion_ratio;

var bw = canvas.width;
var bh = canvas.height;
var p = 10;

// sumValue.innerText += "\n" + bw + " " + bh + " " + bw/bh;

const aspect_ratio = bw / bh;
const grid_width = 4*scale;     // number of columns
const grid_height = grid_width / aspect_ratio;    // number of rows

// canvas.setAttribute('width',bw)
var context = canvas.getContext("2d");


// Create coordinate grid
function drawBoard(){
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
    context.fillStyle = "(0,0,0 / 1%)";
    context.fillRect(0,0,bw,bh)
    context.stroke();
}


// Create diffusion gradient (currently obsolete)
diffusion_coefficient = 0.2; // the higher, the more white clouds
function makeArr(startValue, stopValue, cardinality) {
  var arr = [];
  var step = (stopValue - startValue) / (cardinality - 1);
  for (var i = 0; i < cardinality; i++) {
    arr.push(startValue + (step * i));
  }
  return arr;
}
const diffusion_gradient = context.createLinearGradient(0, 0, bw, 0);
gradient_stretch = bw;
diffusion_positions = makeArr(0, 1, gradient_stretch);
for (var i = 0; i < gradient_stretch; i ++){
    pos = diffusion_positions[i];
    if (Math.random() < diffusion_coefficient){
        diffusion_gradient.addColorStop(pos, "white");
    }  
    else {
        diffusion_gradient.addColorStop(pos, "black");
    };
};

const cursor = {
    x: bw / 2,
    y: bh / 2,
};

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

function generateParticles(amount) {
  for (let i = 0; i < amount; i++) {
    particlesArray[i] = new Particle(
      bw / 2,
      bh / 2,
      0.02,
    );
  }
}

function Particle(x, y, rotateSpeed) {
    // Initialised then fixed
    this.x = x;
    this.y = y;
    this.particleTrailWidth = trailWidth;
    this.theta = Math.random() * Math.PI * 2;
    this.radius = Math.random() * 1500;
    
    // This is the function which gets animated!
    this.rotate = () => {
        const ls = {
            x: this.x,
            y: this.y,
        };
        this.rotateSpeed = cursor.x/bw/10;
        // sumValue.innerText = "Cursor position: (" + cursor.x +", "+cursor.y+")";
        start_or_no = (this.x == bw/2 && this.y == bh/2) ? true : false;
        this.theta += this.rotateSpeed;
        this.x = bw/2 + Math.cos(this.theta) * this.radius;
        this.y = bh/2 + Math.sin(this.theta) * this.radius;

        const strokeColor = (Math.random() < diffusion_coefficient) ? "white": "rgb(0 0 0 / 0%)";
        this.strokeColor = strokeColor;
        context.beginPath();
        context.lineWidth = trailWidth;
        context.strokeStyle = strokeColor;
        if (!start_or_no) {
            context.moveTo(ls.x, ls.y);
            context.lineTo(this.x, this.y);
            context.stroke();
        }
    };
}

let animationId = null;

function anim() {
    animationId = requestAnimationFrame(anim);

    context.fillStyle = "rgb(0 0 0 / 2%)";
    context.fillRect(0, 0, bw, bh);
    
    particlesArray.forEach((particle) => particle.rotate());
}

function startAnimation() {
    // Cancel any existing animation
    if (animationId !== null) {
        cancelAnimationFrame(animationId);
    }
    anim();
}

let particlesArray = [];
generateParticles(numParticles);
startAnimation();

context.globalAlpha = 0.5;
numParticlesSlider.oninput = function() {
    particlesArray = [];
    numParticlesText.innerText = this.value;
    generateParticles(this.value);
    startAnimation();
    // SliderTest.innerText = particlesArray.length;
}
trailWidthSlider.oninput = function() {
    trailWidthText.innerText = this.value;
    trailWidth = this.value;
    // SliderTest.innerText = particlesArray.length;
}