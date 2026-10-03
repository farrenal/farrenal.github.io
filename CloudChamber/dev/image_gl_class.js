//---------- Class of the image of the chamber, drawn by the graphics card ------------------------------------------------------
// This does the same job as ChamberImage (image_class.js), in the same three steps:
//
//  1. clear()      start from darkness.
//  2. addLight()   every droplet adds a little light at its position.
//  3. develop()    turn the light into the picture: a soft glow, and the exposure of a camera.
//
// One thing looks different on purpose: a droplet is drawn as a tiny disc with a fairly sharp edge, where ChamberImage can
// only afford a soft speck. The amount of light per droplet is the same, so tracks are as bright as in ChamberImage.
//
// The difference is who does the work. In ChamberImage the processor works out every pixel of every frame, one after
// the other, which limits the picture to about a million pixels. Here the graphics card does it (through WebGL),
// for all pixels at the same time, so the picture can have as many pixels as the screen can show, at any zoom.
//
// The graphics card runs small programs called shaders, written in their own language (GLSL):
//   - a "vertex shader" runs once for every droplet and says where on the picture it is and how big its spot is;
//   - a "fragment shader" runs once for every pixel which is covered and says how much light that pixel receives.
// The light of all droplets is first collected in a picture which we do not see (lightTexture), in which amounts
// of light simply add up and can exceed 1. A second pair of shaders then turns that into what we see.

// Shaders for step 2: one droplet is one round spot of light
const dropletVertexShader = `#version 300 es
    in vec3 droplet;                // x and y in canvas pixels, and the amount of light it scatters
    uniform vec2 chamberSize;       // bw, bh
    uniform float pointSize;        // side of the square which is drawn for a droplet, in image pixels
    uniform float lampFalloff;
    out float light;
    void main() {
        // The graphics card wants positions between -1 and 1, with y pointing up
        gl_Position = vec4(droplet.x / chamberSize.x * 2.0 - 1.0, 1.0 - droplet.y / chamberSize.y * 2.0, 0.0, 1.0);
        gl_PointSize = pointSize;
        // The lamp is on the left: droplets further to the right receive less light
        light = droplet.z * (1.0 - lampFalloff * droplet.x / chamberSize.x);
    }`;
const dropletFragmentShader = `#version 300 es
    precision highp float;
    in float light;
    uniform float pointSize;
    uniform float spotInner;        // up to this distance from its centre the disc has its full brightness (image pixels)
    uniform float spotOuter;        // from this distance on there is no light
    uniform float spotCentre;       // full brightness of the disc, for a droplet which scatters 1 unit of light
    out vec4 result;
    void main() {
        // Distance of this pixel from the centre of the droplet, in image pixels.
        // The droplet is a disc which is evenly bright in the middle, and whose brightness falls in a straight
        // line from full to nothing across its edge.
        float distance = length((gl_PointCoord - 0.5) * pointSize);
        float brightness = clamp((spotOuter - distance) / (spotOuter - spotInner), 0.0, 1.0);
        if (brightness <= 0.0) discard;
        result = vec4(light * spotCentre * brightness, 0.0, 0.0, 1.0);
    }`;

// Shaders for step 3: every pixel of the picture is worked out from the light collected around it
const developVertexShader = `#version 300 es
    out vec2 position;              // between 0 and 1 across the picture
    void main() {
        // One triangle which is large enough to cover the whole picture
        vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
        position = corner;
        gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
    }`;
const developFragmentShader = `#version 300 es
    precision highp float;
    in vec2 position;
    uniform sampler2D lightTexture;
    uniform float glowLevel;        // how blurred the copy of the light is which makes the glow
    uniform float glowStrength;
    uniform float exposure;
    uniform vec3 mistColour;
    out vec4 result;
    void main() {
        float direct = textureLod(lightTexture, position, 0.0).r;
        // Glow: the graphics card keeps smaller and smaller copies of the light, each an average over more pixels.
        // Reading a small copy gives the light around this pixel, spread out.
        float glow = 0.5 * (textureLod(lightTexture, position, glowLevel).r + textureLod(lightTexture, position, glowLevel + 1.0).r);
        // Exposure: a little light gives a proportional brightness, a lot of light saturates to white
        float opacity = 1.0 - exp(-exposure * (direct + glowStrength * glow));
        result = vec4(mistColour * opacity, opacity);
    }`;

class ChamberImageGL {

    constructor(gl) {
        this.gl = gl;
        this.width  = imageWidth;
        this.height = imageHeight;

        // Collecting light needs a picture whose numbers can exceed 1. Drawing into such a picture is an optional
        // ability of a graphics card, which has to be switched on (header.js has checked that this device has it).
        if (!gl.getExtension('EXT_color_buffer_float')) gl.getExtension('EXT_color_buffer_half_float');

        // Droplets waiting to be drawn this frame: x, y and light for each (grows when full)
        this.droplets = new Float32Array(3 * 16384);
        this.count = 0;

        // A droplet covers the same area of the chamber at every resolution (as in ChamberImage):
        // how far its light reaches, in image pixels, at the resolution for which the look was tuned...
        const spread = imageScale / referenceImageScale;
        // ...the radius of its disc in image pixels, which must not be much smaller than a pixel to be drawn at all...
        const radius = Math.max(0.7, crispDropletRadius * imageScale);
        // ...where the edge of the disc begins and ends. The edge is as soft as crispDropletSoftness says, and
        // always at least one pixel wide, because a pixel which the disc covers partly gets part of the light...
        this.spotInner = Math.max(0, radius * (1 - crispDropletSoftness) - 0.5);
        this.spotOuter = radius * (1 + crispDropletSoftness) + 0.5;
        // ...and the full brightness of the disc, so that it holds the right amount of light in total: spread^2 for
        // a droplet which scatters 1 unit. (The light in a disc whose brightness falls in a straight line between
        // inner and outer is brightness * pi * (inner^2 + inner * outer + outer^2) / 3.)
        const discArea = Math.PI * (this.spotInner * this.spotInner + this.spotInner * this.spotOuter + this.spotOuter * this.spotOuter) / 3;
        this.spotCentre = spread * spread / discArea;
        // The graphics card draws a square for every droplet, which has to contain the disc and its edge
        const largestPoint = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1];
        this.pointSize = Math.min(largestPoint, Math.ceil(2 * this.spotOuter) + 1);
        // The glow comes from a copy of the light which is averaged over about as many pixels as in ChamberImage.
        // Each level of copy is half as large as the one before, so the level is a logarithm.
        this.glowLevel = Math.log2(glowCell * spread) + 1;

        this.dropletProgram = this.buildProgram(dropletVertexShader, dropletFragmentShader);
        this.developProgram = this.buildProgram(developVertexShader, developFragmentShader);

        // Memory on the graphics card for the droplets, and the description of how they are laid out in it
        this.dropletBuffer = gl.createBuffer();
        this.dropletBufferSize = 0;     // numbers which fit in the memory on the graphics card
        this.dropletLayout = gl.createVertexArray();
        gl.bindVertexArray(this.dropletLayout);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.dropletBuffer);
        const dropletAttribute = gl.getAttribLocation(this.dropletProgram, "droplet");
        gl.enableVertexAttribArray(dropletAttribute);
        gl.vertexAttribPointer(dropletAttribute, 3, gl.FLOAT, false, 0, 0);
        // (the triangle of step 3 needs no data, but WebGL wants a layout all the same)
        this.emptyLayout = gl.createVertexArray();
        gl.bindVertexArray(null);

        // The picture in which the light is collected: as large as the canvas, with numbers which can exceed 1,
        // and with the chain of smaller copies which is used for the glow
        this.lightTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.lightTexture);
        const copies = Math.floor(Math.log2(Math.max(this.width, this.height))) + 1;
        gl.texStorage2D(gl.TEXTURE_2D, copies, gl.RGBA16F, this.width, this.height);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        // Tell the graphics card that it can draw into that picture
        this.lightTarget = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.lightTarget);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.lightTexture, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // Colour of the mist as three numbers between 0 and 1 (mistColour holds blue, green, red as two hex digits each)
        this.mistColour = [(mistColour & 255) / 255, ((mistColour >> 8) & 255) / 255, ((mistColour >> 16) & 255) / 255];
    }

    // Hand a pair of shaders to the graphics card
    buildProgram(vertexSource, fragmentSource) {
        const gl = this.gl;
        const program = gl.createProgram();
        for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]]) {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
                throw new Error("Shader did not compile: " + gl.getShaderInfoLog(shader));
            }
            gl.attachShader(program, shader);
            gl.deleteShader(shader);    // (it is kept for as long as the program needs it)
        }
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
            throw new Error("Shaders did not link: " + gl.getProgramInfoLog(program));
        }
        return program;
    }

    clear() {
        this.count = 0;
    }

    // A droplet at (x, y), in canvas pixels, scatters this amount of light towards the camera.
    // It is only noted down here, all droplets are drawn together in develop().
    addLight(x, y, amount) {
        if (this.count + 3 > this.droplets.length) {
            const bigger = new Float32Array(this.droplets.length * 2);
            bigger.set(this.droplets);
            this.droplets = bigger;
        }
        this.droplets[this.count]     = x;
        this.droplets[this.count + 1] = y;
        this.droplets[this.count + 2] = amount;
        this.count += 3;
    }

    // Draw all droplets, turn the collected light into the picture and show it
    develop() {
        const gl = this.gl;

        // Send the droplets to the graphics card
        gl.bindBuffer(gl.ARRAY_BUFFER, this.dropletBuffer);
        if (this.dropletBufferSize < this.droplets.length) {
            gl.bufferData(gl.ARRAY_BUFFER, this.droplets.byteLength, gl.DYNAMIC_DRAW);
            this.dropletBufferSize = this.droplets.length;
        }
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.droplets, 0, this.count);

        // Step 2: draw every droplet as a round spot into the picture of the light, starting from darkness.
        // Where spots overlap their light adds up (this is what the blending says).
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.lightTarget);
        gl.viewport(0, 0, this.width, this.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.useProgram(this.dropletProgram);
        gl.uniform2f(gl.getUniformLocation(this.dropletProgram, "chamberSize"), bw, bh);
        gl.uniform1f(gl.getUniformLocation(this.dropletProgram, "pointSize"), this.pointSize);
        gl.uniform1f(gl.getUniformLocation(this.dropletProgram, "lampFalloff"), lampFalloff);
        gl.uniform1f(gl.getUniformLocation(this.dropletProgram, "spotInner"), this.spotInner);
        gl.uniform1f(gl.getUniformLocation(this.dropletProgram, "spotOuter"), this.spotOuter);
        gl.uniform1f(gl.getUniformLocation(this.dropletProgram, "spotCentre"), this.spotCentre);
        gl.bindVertexArray(this.dropletLayout);
        gl.drawArrays(gl.POINTS, 0, this.count / 3);

        // Make the smaller copies of the light, for the glow
        gl.bindTexture(gl.TEXTURE_2D, this.lightTexture);
        gl.generateMipmap(gl.TEXTURE_2D);

        // Step 3: work out every pixel of the picture which we see
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.disable(gl.BLEND);
        gl.useProgram(this.developProgram);
        gl.uniform1i(gl.getUniformLocation(this.developProgram, "lightTexture"), 0);
        gl.uniform1f(gl.getUniformLocation(this.developProgram, "glowLevel"), this.glowLevel);
        gl.uniform1f(gl.getUniformLocation(this.developProgram, "glowStrength"), glowStrength);
        gl.uniform1f(gl.getUniformLocation(this.developProgram, "exposure"), exposure);
        gl.uniform3fv(gl.getUniformLocation(this.developProgram, "mistColour"), this.mistColour);
        gl.bindVertexArray(this.emptyLayout);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);
    }

    // Give the memory on the graphics card back (before a new image with a different size replaces this one)
    dispose() {
        const gl = this.gl;
        gl.deleteTexture(this.lightTexture);
        gl.deleteFramebuffer(this.lightTarget);
        gl.deleteBuffer(this.dropletBuffer);
        gl.deleteVertexArray(this.dropletLayout);
        gl.deleteVertexArray(this.emptyLayout);
        gl.deleteProgram(this.dropletProgram);
        gl.deleteProgram(this.developProgram);
    }
}

// The image of the chamber, drawn in whichever way this device supports (decided in header.js)
function createChamberImage() {
    return useWebGL ? new ChamberImageGL(gl) : new ChamberImage(context2d);
}
