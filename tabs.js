// Fetch all div's which are parts of the navigation table
const tabs = document.getElementsByClassName("tabContent");
const tabButtons = document.getElementsByClassName(`tabButton`);
const toggleButton = document.getElementsByClassName(`toggleButton`);
const debugText = document.getElementById("debugText");

// Make a list of the labels for these div's, e.g. Research, Visualisations, ...
var tabLabels = [];
for (var i = 0; i < tabs.length; i++){
  tabLabels.push(tabs[i].className.slice(11));
}

// Hides all tabs every time the navbar is clicked and every time the page is loaded
function closeAllTabs(){
  for (var i = 0; i < tabs.length; i++){
    tabs[i].style.display = "none";
  }
}

function updateButtons(){
  for (var i = 0; i < tabLabels.length; i++){
    tabButtons[i].className = `tabButton ${tabLabels[i]}`;
  }
}

function tabClicked(tabClass) {
  if (!openAll){
    closeAllTabs();
  };
  updateButtons();
  openTab(tabClass);
  // openedTabClass = tabClass;
}

function openTab(tabClass) {
  // Make opened tab visible
  const openedTab = document.getElementsByClassName(`tabContent ${tabClass}`);
  openedTab[0].style.display = "block";
  // $(openedTab[0]).slideDown();
  
  // Change style of opened tab button
  const openedTabButton = document.getElementsByClassName(`tabButton ${tabClass}`);
  openedTabButton[0].className = `tabButton ${tabClass} active`;

  // Scroll to top of tab content, i.e. headanchor
  // document.getElementById(`${tabClass}`).scrollIntoView({behavior: 'smooth'});
  window.location.href = `#${tabClass}`;
}

function toggleOpenAll(){
  if (!openAll){
    openAll = true;
    for (var i = 0; i < tabs.length; i++){
        tabs[i].style.display = "block";
    };
    toggleButton[0].className = `toggleButton active`;
  }
  else{
    openAll = false;
    for (var i = 0; i < tabs.length; i++){
        tabs[i].style.display = "none";
    };
    toggleButton[0].className = `toggleButton`;
    tabClicked(openedTabClass);
  }
}

// Initialise open tab with Research
var openedTabClass = "Research";
tabClicked(openedTabClass);

// Start with single tab view
var openAll = false;