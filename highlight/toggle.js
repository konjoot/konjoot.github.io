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
          .onClick(toggle);
    });
  }

  function Button(el){
    var self = this;

    self.parent = isExists(el) ? el : document.getElementsByTagName("body")[0];
    self.node = document.createElement("div");
    self.node = self.parent.appendChild(self.node);

    return self;
  }

  Button.prototype.traverse = function(attrName) {
    this.node.setAttribute(attrName, this.parent.getAttribute(attrName));
    return this;
  };

  Button.prototype.onClick = function(callback) {
    this.node.onclick = callback;
    return this;
  };

  Button.prototype.addClass = function(name){
    this.node.className += " " + name;
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

  function isExists(el){
    return typeof el !== "undefined" && el !== null
  }
}());