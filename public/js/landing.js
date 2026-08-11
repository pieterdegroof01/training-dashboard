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

(function () {
  var mq = window.matchMedia('(max-width: 899px)');
  var desktopFig = document.querySelector('.science-diagram--desktop');
  var mobileFig = document.querySelector('.science-diagram--mobile');
  if (!desktopFig || !mobileFig) return;
  function syncDiagramVisibility(e) {
    var isMobile = e.matches;
    desktopFig.setAttribute('aria-hidden', isMobile ? 'true' : 'false');
    mobileFig.setAttribute('aria-hidden', isMobile ? 'false' : 'true');
  }
  syncDiagramVisibility(mq);
  mq.addEventListener('change', syncDiagramVisibility);
})();

(function () {
  var buttons = document.querySelectorAll('.faq-question');
  buttons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var isOpen = btn.getAttribute('aria-expanded') === 'true';
      buttons.forEach(function (other) {
        var otherAnswer = document.getElementById(other.getAttribute('aria-controls'));
        other.setAttribute('aria-expanded', 'false');
        if (otherAnswer) otherAnswer.hidden = true;
      });
      if (!isOpen) {
        var answer = document.getElementById(btn.getAttribute('aria-controls'));
        btn.setAttribute('aria-expanded', 'true');
        if (answer) answer.hidden = false;
      }
    });
  });
})();

(function () {
  var hamburger = document.querySelector('.hamburger');
  var overlay = document.getElementById('mobile-overlay');
  if (!hamburger || !overlay) return;
  var panel = overlay.querySelector('.mobile-overlay-panel');

  function focusableEls() {
    return Array.prototype.slice.call(panel.querySelectorAll('a[href]'));
  }

  function onKeydown(e) {
    if (e.key === 'Escape') {
      closeMenu();
      return;
    }
    if (e.key === 'Tab') {
      var els = focusableEls();
      if (!els.length) return;
      var first = els[0];
      var last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function onOverlayClick(e) {
    if (e.target === overlay) closeMenu();
  }

  function openMenu() {
    overlay.hidden = false;
    hamburger.setAttribute('aria-expanded', 'true');
    document.body.classList.add('mobile-menu-open');
    document.addEventListener('keydown', onKeydown);
    overlay.addEventListener('click', onOverlayClick);
    var els = focusableEls();
    if (els.length) els[0].focus();
  }

  function closeMenu() {
    overlay.hidden = true;
    hamburger.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('mobile-menu-open');
    document.removeEventListener('keydown', onKeydown);
    overlay.removeEventListener('click', onOverlayClick);
    hamburger.focus();
  }

  hamburger.addEventListener('click', function () {
    if (overlay.hidden) {
      openMenu();
    } else {
      closeMenu();
    }
  });

  focusableEls().forEach(function (link) {
    link.addEventListener('click', closeMenu);
  });
})();
