//---------- Pictures of the radioactive sources --------------------------------------------------------------------------------
// A source is a solid object in the chamber. It is drawn once, when the source is switched on, onto its own canvas
// which lies underneath the picture of the mist. The mist and the tracks are therefore seen drifting over it.
//
// All positions and sizes here are in canvas pixels. The lamp is on the left of the chamber, so objects are brighter
// on the side which faces left, whichever way they have been put into the chamber.

// Draw the object which belongs to this source (see sources in header.js), or nothing but an empty floor for null
function drawSourceImage(sourceName) {
    objectsContext.clearRect(0, 0, bw, bh);
    if (sourceName === null) return;

    const source = sources[sourceName];
    if (source.shape == "button")  drawButtonSource(objectsContext, source);
    if (source.shape == "rod")     drawRodSource(objectsContext, source);
    if (source.shape == "needle")  drawNeedleSource(objectsContext, source);
    if (source.shape == "capsule") drawCapsuleSource(objectsContext, source);
}

//---------- Round buttons --------------------------------------------------------------------------------------------------------
// Fill a circle with a colour which changes from left to right
function fillShadedCircle(context, x, y, radius, leftColour, rightColour) {
    const shade = context.createLinearGradient(x - radius, y, x + radius, y);
    shade.addColorStop(0, leftColour);
    shade.addColorStop(1, rightColour);
    context.fillStyle = shade;
    context.beginPath();
    context.arc(x, y, radius, 0, twoPI);
    context.fill();
}

// Americium-241 as it is found in a smoke detector: a small metal button, with the americium in a
// gold-coloured foil in its centre
function drawButtonSource(context, source) {
    const x = 0.5 * bw;
    const y = 0.5 * bh;
    const radius = source.radius * bw;
    const foilRadius = source.foilRadius * bw;

    // Rim of the metal holder, lit from the left
    fillShadedCircle(context, x, y, radius, "#c3c8d0", "#3d4045");
    // Inside the rim the metal slopes down towards the centre, so here the side facing the lamp is the right one
    fillShadedCircle(context, x, y, 0.8 * radius, "#34373b", "#8d9299");
    // Flat face
    fillShadedCircle(context, x, y, 0.64 * radius, "#9da3ab", "#5a5d63");

    // Foil: dull gold, with a highlight towards the lamp
    const gold = context.createRadialGradient(x - 0.35 * foilRadius, y - 0.25 * foilRadius, 0, x, y, foilRadius);
    gold.addColorStop(0,   "#f0d87a");
    gold.addColorStop(0.5, "#c2a045");
    gold.addColorStop(1,   "#7d611c");
    context.fillStyle = gold;
    context.beginPath();
    context.arc(x, y, foilRadius, 0, twoPI);
    context.fill();

    // Thin dark edges, which separate the parts
    context.strokeStyle = "rgba(0, 0, 0, 0.55)";
    context.lineWidth = 0.06 * radius;
    for (const edge of [radius, 0.8 * radius, 0.64 * radius, foilRadius]) {
        context.beginPath();
        context.arc(x, y, edge, 0, twoPI);
        context.stroke();
    }
}

//---------- Round bars -----------------------------------------------------------------------------------------------------------
// Rods, needles, handles and capsules are all round bars. They are drawn in a frame in which the bar lies along
// the x axis, and the frame is turned by the angle of the source. Three colours describe a material:
// the colour of its edges (in shadow), of its bright line (facing the lamp), and in half shadow.
const barColours = {
    tungsten: ["#2c2e31", "#c9cdd4", "#7e8288"],
    redPaint: ["#3d110e", "#e2574c", "#a8302a"],
    steel:    ["#303336", "#dfe3e8", "#8f949b"],
    darkSteel:["#1f2123", "#8d9196", "#55585d"],
    cork:     ["#3f2c1a", "#d6b384", "#9b7848"],
    plastic:  ["#101a30", "#6c8ad0", "#30498a"]
};

// Turn the frame so that the x axis points along the source, with (0, 0) in the middle of the chamber.
// Returns where the lamp is, seen from the turned frame: along is the part along the x axis, across the part along the y axis.
function turnToSource(context, source) {
    context.translate(0.5 * bw, 0.5 * bh);
    context.rotate(source.angle);
    return {along: -Math.cos(source.angle), across: Math.sin(source.angle)};
}

// Draw the piece of a round bar which runs from x0 to x1, with this thickness.
// A round bar is darkest at its two edges and has a bright line where it faces the lamp. The bright line is in the
// middle if the lamp shines along the bar, and moves towards the edge which faces the lamp if the lamp shines across it.
function fillBar(context, x0, x1, thickness, colours, lamp) {
    const brightLine = 0.5 + 0.22 * lamp.across;    // 0 is one edge, 1 is the other
    // Half way between the bright line and the edge further from it, the material is in half shadow
    const halfShadow = (brightLine < 0.5) ? 0.5 * (brightLine + 1) : 0.5 * brightLine;

    const shade = context.createLinearGradient(0, -0.5 * thickness, 0, 0.5 * thickness);
    shade.addColorStop(0, colours[0]);
    shade.addColorStop(brightLine, colours[1]);
    shade.addColorStop(halfShadow, colours[2]);
    shade.addColorStop(1, colours[0]);
    context.fillStyle = shade;
    context.fillRect(x0, -0.5 * thickness, x1 - x0, thickness);
}

// The end of an object which is further from the lamp receives less light. Darken everything between x0 and x1:
// not at all at an end which points straight at the lamp, the most at an end which points straight away from it.
function dimAwayFromLamp(context, x0, x1, thickness, lamp) {
    const dimming = context.createLinearGradient(x0, 0, x1, 0);
    dimming.addColorStop(0, "rgba(0, 0, 0, " + (0.2 + 0.2 * lamp.along) + ")");
    dimming.addColorStop(1, "rgba(0, 0, 0, " + (0.2 - 0.2 * lamp.along) + ")");
    context.fillStyle = dimming;
    // (a hair wider than the object, so that no bright rim is left at its edges)
    context.fillRect(x0, -0.5 * thickness - 1, x1 - x0, thickness + 2);
}

// Thorium-232 as it is used in cloud chamber demonstrations: a welding rod made of tungsten with 2 percent thorium,
// which is sold with a red tip to tell it apart from other rods. The rod lies with its middle in the middle of the chamber.
function drawRodSource(context, source) {
    const length = source.length * bw;
    const thickness = source.thickness * bw;
    const tipLength = 0.09 * length;

    context.save();
    const lamp = turnToSource(context, source);
    fillBar(context, -0.5 * length, 0.5 * length, thickness, barColours.tungsten, lamp);
    fillBar(context, 0.5 * length - tipLength, 0.5 * length, thickness, barColours.redPaint, lamp);
    dimAwayFromLamp(context, -0.5 * length, 0.5 * length, thickness, lamp);
    context.restore();
}

// Strontium-90 and sodium-22 as needle sources: a steel needle stuck in a handle, with the radioactive material
// on its point. The point is in the middle of the chamber, and the needle runs from there along the x axis to its handle.
function drawNeedleSource(context, source) {
    const length = source.length * bw;
    const thickness = source.thickness * bw;
    const handleLength = source.handleLength * bw;
    const handleThickness = source.handleThickness * bw;
    const pointLength = 5 * thickness;

    context.save();
    const lamp = turnToSource(context, source);

    // Everything is drawn inside the outline of the needle and its handle:
    // a sharp point at (0, 0), the shaft, and then the wider handle
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(pointLength, -0.5 * thickness);
    context.lineTo(length, -0.5 * thickness);
    context.lineTo(length, -0.5 * handleThickness);
    context.lineTo(length + handleLength, -0.5 * handleThickness);
    context.lineTo(length + handleLength, 0.5 * handleThickness);
    context.lineTo(length, 0.5 * handleThickness);
    context.lineTo(length, 0.5 * thickness);
    context.lineTo(pointLength, 0.5 * thickness);
    context.closePath();
    context.clip();

    fillBar(context, 0, length, thickness, barColours.steel, lamp);
    // The radioactive material is a dull coating on the point
    fillBar(context, 0, 1.6 * pointLength, thickness, barColours.darkSteel, lamp);
    fillBar(context, length, length + handleLength, handleThickness, barColours[source.handle], lamp);
    dimAwayFromLamp(context, 0, length + handleLength, handleThickness, lamp);
    context.restore();
}

// Caesium-137 as a sealed source: the material is welded into a small capsule of stainless steel,
// which stops everything except the gamma rays. The capsule lies in the middle of the chamber.
function drawCapsuleSource(context, source) {
    const length = source.length * bw;
    const thickness = source.thickness * bw;
    const capLength = 0.16 * length;

    context.save();
    const lamp = turnToSource(context, source);

    // A bar with rounded ends: everything is drawn inside this outline
    const rounding = 0.3 * thickness;
    context.beginPath();
    context.moveTo(-0.5 * length + rounding, -0.5 * thickness);
    context.lineTo(0.5 * length - rounding, -0.5 * thickness);
    context.quadraticCurveTo(0.5 * length, -0.5 * thickness, 0.5 * length, -0.5 * thickness + rounding);
    context.lineTo(0.5 * length, 0.5 * thickness - rounding);
    context.quadraticCurveTo(0.5 * length, 0.5 * thickness, 0.5 * length - rounding, 0.5 * thickness);
    context.lineTo(-0.5 * length + rounding, 0.5 * thickness);
    context.quadraticCurveTo(-0.5 * length, 0.5 * thickness, -0.5 * length, 0.5 * thickness - rounding);
    context.lineTo(-0.5 * length, -0.5 * thickness + rounding);
    context.quadraticCurveTo(-0.5 * length, -0.5 * thickness, -0.5 * length + rounding, -0.5 * thickness);
    context.closePath();
    context.clip();

    fillBar(context, -0.5 * length, 0.5 * length, thickness, barColours.steel, lamp);
    // The two end caps are welded on: a slightly darker steel, with a dark seam where they meet the body
    fillBar(context, -0.5 * length, -0.5 * length + capLength, thickness, barColours.darkSteel, lamp);
    fillBar(context, 0.5 * length - capLength, 0.5 * length, thickness, barColours.darkSteel, lamp);
    context.fillStyle = "rgba(0, 0, 0, 0.6)";
    const seam = 0.03 * length;
    context.fillRect(-0.5 * length + capLength - 0.5 * seam, -0.5 * thickness, seam, thickness);
    context.fillRect( 0.5 * length - capLength - 0.5 * seam, -0.5 * thickness, seam, thickness);

    dimAwayFromLamp(context, -0.5 * length, 0.5 * length, thickness, lamp);
    context.restore();
}
