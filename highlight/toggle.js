'use strict'

window.onload = function() {
  var toggableElems = document.getElementsByClassName("toggable");
  for (var i = 0; i < toggableElems.length; i++){
    var elem = toggableElems[i];
    elem.onclick = toggle;
  }
};

function toggle() {
  var classes = this.className.split(" ");
  console.log(classes);
  var indexOfTwisted = classes.indexOf("twisted")
  if (indexOfTwisted > -1){
    classes.splice(indexOfTwisted, 1);
    this.className = classes.join(" ");
  }else{
    classes.push("twisted");
    this.className = classes.join(" ");
  }
};