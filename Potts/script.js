const slider1 = document.getElementById('slider1');

const Tarray = ['L','B','A','H'];

const slider2 = document.getElementById('slider2');

const Harray = ['N','W','M','S'];

const sumValue = document.getElementById('sumValue');

Qnumber='q3';

function boxClicked(boxName) {
  Qnumber = boxName;
  updateTotalSum(Qnumber, slider1.value, slider2.value);
  updateSum();
}

function changeColor(button) {
  // Reset color for all buttons
  const buttons = document.querySelectorAll('.box');
  buttons.forEach(btn => {
    btn.style.backgroundColor = '';
  });
  // Set color for the clicked button
  button.style.backgroundColor = '#7a7a7a';
}

// Update slider Q value and calculate sum
function updateSum() {
  const value1 = parseInt(slider1.value);
  const value2 = parseInt(slider2.value);
  Toutput = Tarray[parseInt(value1)];
  Houtput = Harray[parseInt(value2)];
  updateTotalSum(Qnumber, Toutput, Houtput);
}

// Calculate and display the total sum
function updateTotalSum(Qnumber, value1, value2) {
  sumValue.innerText = Qnumber+`_T`+value1+`_H`+value2+`.gif`;
  gifImage.src = `Potts gifs/`+Qnumber+`_T`+value1+`_H`+value2+`-min.gif`;
}

slider1.addEventListener('input', updateSum);
slider2.addEventListener('input', updateSum);

$('body').waitForImages({
    waitForAll: true,
    finished: function() {
       // All images have loaded.
    }  
});