const particleOptions = document.getElementById('particleOptions');
const fieldOptions = document.getElementById('fieldOptions');
const sumValue = document.getElementById('sumValue');

particleType = 'q';
fieldType = 'off';
gifImage.src = `CloudChamber gifs/nothing.png`
gifImageA.src = `CloudChamber gifs/nothing.png`
gifImageB.src = `CloudChamber gifs/nothing.png`
gifImageC.src = `CloudChamber gifs/nothing.png`
gifImageD.src = `CloudChamber gifs/nothing.png`

function fClicked(fieldStatus) {
  fieldType = fieldStatus;
}

function pClicked(particleName) {
  particleType = particleName;
  updateGif(particleType, fieldType);
}

function changepColor(button) {
    // Reset color for all buttons
    const buttons = document.querySelectorAll('.box.p');
    buttons.forEach(btn => {
        btn.style.backgroundColor = '';
        $(btn).toggleClass('disable');
    });
    // Set color for the clicked button
    if (particleType == 'e-' || particleType == 'mu-'){
        button.style.backgroundColor = '#ffaaaa';
    }
    else {
        button.style.backgroundColor = '#aaaaff';
    }
    window.setTimeout(resetColor,1500);
}

function resetColor() {
    // Reset color for all buttons
    const buttons = document.querySelectorAll('.box.p');
    buttons.forEach(btn => {
        btn.style.backgroundColor = '';
        $(btn).toggleClass('disable');
    });
}

function changefColor(button) {
  // Reset color for all buttons
  const buttons = document.querySelectorAll('.box.f');
  buttons.forEach(btn => {
    btn.style.backgroundColor = '';
  });
  // Set color for the clicked button
  button.style.backgroundColor = '#aaaaaa';
}

function changebgColor(button) {
  // Reset color for all buttons
  const buttons = document.querySelectorAll('.box.bg');
  buttons.forEach(btn => {
    btn.style.backgroundColor = '';
  });
  // Set color for the clicked button
  button.style.backgroundColor = '#555555';
}

// Update Gif
function updateGif() {
  updateTotalSum(particleType, fieldType);
}

// Calculate Gif
function updateGif(p,f) {
  r = Math.floor(Math.random() * 19);
  sumValue.innerText = p+f+r;
  gifImage.src = `CloudChamber gifs/`+p+f+`/`+p+f+r+`.png`;
  fadeimage("img.responsive-image.overlayed.static");
}

function fadeimage(img){
      $(img).each(function(index){
          $(this).hide();
          // randint(500,2000)
          $(this).delay(500).fadeIn(10).fadeOut(1500);
      });
}
function fadeimage_cycle(img){
      $(img).each(function(index){
          r = Math.random()*1000 + 1000;
          $(this).delay(10).fadeIn(10).fadeOut(r);
      });
}

// Cycling image function
let currentIndex = 0;
let intervalId = null;

function cycleImages() {

    const buttons = document.querySelectorAll('.box.bg');
    
    // If an interval is already running, clear it
    if (intervalId !== null) {
        clearInterval(intervalId);
        buttons.forEach(btn => {
          btn.style.backgroundColor = '';
        });
        intervalId = null;
        gifImageA.src = `CloudChamber gifs/nothing.png`;
        gifImageB.src = `CloudChamber gifs/nothing.png`;
        gifImageC.src = `CloudChamber gifs/nothing.png`;
        gifImageD.src = `CloudChamber gifs/nothing.png`;
        return;
    };
    a = 0;
    buttons.forEach(btn => {
        btn.style.backgroundColor = '#ffd700';
    });
    // Start the interval
    intervalId = setInterval(() => {
        
        a += 1;
        gifImages = [gifImageA, gifImageB, gifImageC, gifImageD];
        
        rand_mag_field = Math.floor(Math.random()*3);
        rand_mag_field = 1;
        //f = ['off','in','out'];
        f = fieldType
        p = 'test';
        rand = Math.random()*7.5;
        r = Math.floor(Math.random()*19);
        if (rand <= 0.5){p='p+'};
        if (rand > 0.5 && rand <= 2){p='e-'};
        if (rand > 2 && rand <= 3.5){p='e+'};
        if (rand > 3.5 && rand <= 5){p='mu-'};
        if (rand > 5 && rand <= 6.5){p='mu+'};
        if (rand > 6.5 && rand <= 7.5){p='a+'};
        
        sumValue.innerText = p+f+r;
        gifImages[a % 4].src = `CloudChamber gifs/`+p+f+`/`+p+f+r+`.png`;
        fadeimage_cycle("img.responsive-image.overlayed.cycling");
    }, 500);
}