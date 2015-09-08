(function(){
  "use strict"

  window.onload = injectToggleButtons;

  function injectToggleButtons(){
    Array.prototype.forEach.call(
      document.getElementsByClassName("toggable"),
      function (el) {
        new Button(el)
          .addClass("twister")
          .traverse("placeholder")
          .on('click', toggle);
    });
  }

  function Button(el){
    this.parent = el || document.getElementsByTagName("body")[0];
    this.node = document.createElement("div");
    this.parent.appendChild(this.node);

    return this;
  }

  Button.prototype.traverse = function(attrName) {
    this.node.setAttribute(attrName, this.parent.getAttribute(attrName));

    return this;
  };

  Button.prototype.on = function(type, callback) {
    if (this.node.addEventListener) {
      this.node.addEventListener(type, callback, false);
    } else if (this.node.attachEvent) { //IE
      this.node.attachEvent('on' + type, callback);
    }

    return this;
  };

  Button.prototype.addClass = function(name){
    if (this.node.className.indexOf(name) === -1) {
        this.node.className += " " + name;
    }

    return this;
  };

  function toggle() {
    var c = "twisted",
        parent = this.parentNode;

    if (parent.className.indexOf(c) > -1) {
      parent.className = parent.className.replace(new RegExp(c, "gi"), "");
    }else{
      parent.className += " " + c;
    }
  }
}());