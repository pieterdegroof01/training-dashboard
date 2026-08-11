(function () {
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var arcs = document.querySelectorAll('.progress-ring__arc');
  arcs.forEach(function (arc) {
    var r = parseFloat(arc.getAttribute('r'));
    var circumference = 2 * Math.PI * r;
    var value = parseFloat(arc.dataset.value || '0');
    var finalOffset = circumference * (1 - value / 100);
    arc.style.strokeDasharray = circumference;
    if (reduceMotion) {
      arc.style.strokeDashoffset = finalOffset;
      return;
    }
    arc.style.strokeDashoffset = circumference;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        arc.style.transition = 'stroke-dashoffset 0.35s ease-out';
        arc.style.strokeDashoffset = finalOffset;
      });
    });
  });
})();
