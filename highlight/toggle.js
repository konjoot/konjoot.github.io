window.onload = function() {
  var toggableElems = document.getElementsByClassName("toggable");
  for (i = 0; i < toggableElems.length; i++){
    var elem = toggableElems[i];
    elem.onclick = toggle;
  }
  console.log(elems);
};

function toggle() {
  var classString = this.className;
  // pending
};