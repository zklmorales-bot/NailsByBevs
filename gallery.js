/**
 * Nails by Bevs — gallery behaviour
 * 1. Pagination: shows 6 photos per page with subtle dot navigation
 *    (dots appear only when there are more than 6 photos). Page changes
 *    animate: photos fade out, then the new page slides in with a slight
 *    stagger; the grid height eases when pages have different counts.
 * 2. Lightbox: click a photo to view it full-size; close with the × button,
 *    a click on the dark background, or the Escape key. Arrow keys and the
 *    on-screen arrows move between photos.
 *
 * Works with the folder-driven gallery: update-gallery.mjs regenerates the
 * <figure> list, and this script picks up whatever is there at page load.
 */
(function () {
  'use strict';

  var PER_PAGE = 6;
  var OUT_DURATION = 180; // fade-out of the old page (ms)
  var IN_DURATION = 360;  // slide-in of the new page (ms)
  var STAGGER = 40;       // delay between each incoming photo (ms)

  var gallery = document.querySelector('.gallery');
  var dotsWrap = document.getElementById('gallery-dots');
  var lightbox = document.getElementById('lightbox');
  var lightboxImg = document.getElementById('lightbox-img');
  var lightboxCaption = document.getElementById('lightbox-caption');
  var lightboxClose = document.querySelector('.lightbox-close');
  var lightboxPrev = document.querySelector('.lightbox-nav.prev');
  var lightboxNext = document.querySelector('.lightbox-nav.next');

  if (!gallery) return;

  var reduceMotion = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var photos = Array.prototype.slice.call(gallery.querySelectorAll('.photo'));
  var pageCount = Math.ceil(photos.length / PER_PAGE);
  var currentPage = 0;
  var animating = false;
  var timers = [];

  function photosOnPage(page) {
    var start = page * PER_PAGE;
    return photos.filter(function (_photo, index) {
      return index >= start && index < start + PER_PAGE;
    });
  }

  function syncDots(page) {
    if (!dotsWrap) return;
    var dots = dotsWrap.querySelectorAll('.gallery-dot');
    Array.prototype.forEach.call(dots, function (dot, i) {
      dot.classList.toggle('active', i === page);
    });
  }

  function applyVisibility(page) {
    var visible = photosOnPage(page);
    photos.forEach(function (photo) { photo.hidden = true; });
    visible.forEach(function (photo, i) {
      photo.hidden = false;
      photo.style.setProperty('--photo-index', String(i));
    });
  }

  function clearTimers() {
    timers.forEach(window.clearTimeout);
    timers = [];
  }

  function markHiddenPagesRevealed() {
    photos.forEach(function (photo) {
      photo.classList.remove('reveal-pending', 'reveal-in');
    });
  }

  /* ---------- Pagination ---------- */

  function showPage(page, animate) {
    var target = Math.max(0, Math.min(page, pageCount - 1));
    if (target === currentPage) return;
    if (animating) return; // ignore clicks mid-transition
    var direction = target > currentPage ? 1 : -1;

    syncDots(target); // immediate dot feedback

    if (!animate || reduceMotion || pageCount <= 1) {
      currentPage = target;
      applyVisibility(target);
      markHiddenPagesRevealed();
      return;
    }

    animating = true;
    clearTimers();

    var outgoing = photosOnPage(currentPage);

    // Set slide direction first so both the fade-out and slide-in use it
    gallery.style.setProperty('--page-slide', direction * 26 + 'px');

    // Lock the grid height so it eases to the new page's height later
    gallery.style.height = gallery.offsetHeight + 'px';

    // Phase 1: fade the outgoing page out
    outgoing.forEach(function (photo) { photo.classList.add('photo-out'); });

    timers.push(window.setTimeout(function () {
      currentPage = target;

      // Swap pages: hide old, reveal new with slide-in + stagger
      outgoing.forEach(function (photo) { photo.classList.remove('photo-out'); });
      applyVisibility(target);
      markHiddenPagesRevealed();
      gallery.classList.add('is-animating');
      void gallery.offsetWidth; // restart the CSS animation reliably

      // Phase 2: ease the grid to the new page's height
      timers.push(window.setTimeout(function () {
        gallery.style.height = gallery.scrollHeight + 'px';
      }, 60));

      // Phase 3: clean up
      timers.push(window.setTimeout(function () {
        gallery.classList.remove('is-animating');
        gallery.style.height = '';
        animating = false;
      }, OUT_DURATION + IN_DURATION + STAGGER * (PER_PAGE - 1) + 80));
    }, OUT_DURATION));
  }

  function buildDots() {
    if (!dotsWrap) return;
    if (pageCount <= 1) {
      dotsWrap.hidden = true;
      dotsWrap.innerHTML = '';
      return;
    }
    dotsWrap.hidden = false;
    dotsWrap.innerHTML = '';
    for (var i = 0; i < pageCount; i += 1) {
      var dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'gallery-dot' + (i === currentPage ? ' active' : '');
      dot.setAttribute('aria-label', 'Show gallery page ' + (i + 1) + ' of ' + pageCount);
      dot.dataset.page = String(i);
      dotsWrap.appendChild(dot);
    }
  }

  if (dotsWrap) {
    dotsWrap.addEventListener('click', function (event) {
      var dot = event.target.closest('.gallery-dot');
      if (!dot) return;
      showPage(parseInt(dot.dataset.page, 10) || 0, true);
    });
  }

  buildDots();
  applyVisibility(0);

  /* ---------- Scroll reveal (retriggers) ---------- */

  // Photos rise+fade in each time they enter the viewport, and reset instantly
  // once they fully leave it, so the entrance replays on every visit. This stays
  // cheap because IntersectionObserver only fires at threshold crossings (it is
  // not a scroll-event handler), and resetting is a class swap with no layout
  // work. Stagger is the photo's row position, so delays never grow.
  if ('IntersectionObserver' in window && !reduceMotion) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var photo = entry.target;
        if (entry.intersectionRatio >= 0.12) {
          photo.style.setProperty('--reveal-order', String(photos.indexOf(photo) % PER_PAGE));
          photo.classList.remove('reveal-pending');
          photo.classList.add('reveal-in');
        } else if (entry.intersectionRatio === 0 && !photo.hidden) {
          // Fully out of view: reset instantly (reveal-pending has no transition)
          photo.classList.remove('reveal-in');
          photo.classList.add('reveal-pending');
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: [0, 0.12] });

    photos.forEach(function (photo) {
      photo.classList.add('reveal-pending');
      revealObserver.observe(photo);
    });
  }

  /* ---------- Swipe navigation (touch) ---------- */

  // Swipe left/right on the grid changes pages; vertical scrolling is never
  // blocked (touch-action:pan-y plus the vertical-dominance check below).
  var SWIPE_MIN = 40;       // px of horizontal travel before it counts as a swipe
  var SWIPE_MAX_RATIO = 0.6; // reject mostly-vertical gestures

  function attachSwipe(element, onLeft, onRight) {
    var startX = 0, startY = 0, active = false;

    element.addEventListener('touchstart', function (event) {
      if (event.touches.length !== 1) { active = false; return; }
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      active = true;
    }, { passive: true });

    element.addEventListener('touchmove', function (event) {
      if (!active || event.touches.length !== 1) return;
      var dx = event.touches[0].clientX - startX;
      var dy = event.touches[0].clientY - startY;
      // Once vertical scrolling wins, abandon the gesture entirely
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) active = false;
    }, { passive: true });

    element.addEventListener('touchend', function (event) {
      if (!active) return;
      active = false;
      var touch = event.changedTouches[0];
      var dx = touch.clientX - startX;
      var dy = touch.clientY - startY;
      if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * SWIPE_MAX_RATIO) return;
      if (dx < 0) onLeft(); else onRight();
    }, { passive: true });
  }

  attachSwipe(
    gallery,
    function () { showPage(currentPage + 1, true); },  // swipe left -> next page
    function () { showPage(currentPage - 1, true); }   // swipe right -> previous page
  );

  // Keyboard arrows also change gallery pages (when the lightbox is closed)
  document.addEventListener('keydown', function (event) {
    if (!lightbox || !lightbox.hidden) return;
    if (event.target && /INPUT|TEXTAREA|SELECT|BUTTON/.test(event.target.tagName)) return;
    if (event.key === 'ArrowRight') showPage(currentPage + 1, true);
    if (event.key === 'ArrowLeft') showPage(currentPage - 1, true);
  });

  /* ---------- Lightbox ---------- */

  var lightboxIndex = -1;

  function photoCaption(photo) {
    var caption = photo.querySelector('figcaption');
    return caption ? caption.textContent.trim() : '';
  }

  function renderLightbox(index) {
    var img = photos[index].querySelector('img');
    if (!img) return;
    lightboxImg.src = img.src;
    lightboxImg.alt = img.alt || '';
    if (lightboxCaption) lightboxCaption.textContent = photoCaption(photos[index]);
  }

  var lightboxHistoryDirty = false; // our pushed history entry is still on top
  var lightboxCloseTimer = null;
  var lightboxClosing = false;

  function finishClose() {
    if (!lightboxClosing) return;
    lightboxClosing = false;
    if (lightboxCloseTimer) { clearTimeout(lightboxCloseTimer); lightboxCloseTimer = null; }
    lightbox.classList.remove('is-closing');
    lightbox.hidden = true;
    lightboxImg.src = '';
    document.body.classList.remove('lightbox-open');
    lightboxIndex = -1;
    // Drop the history entry we added, unless the back button already did
    if (lightboxHistoryDirty) {
      lightboxHistoryDirty = false;
      history.back();
    }
  }

  function openLightbox(photo) {
    if (!lightbox || !lightboxImg) return;
    // Cancel a close animation that is still running
    if (lightboxClosing) {
      lightboxClosing = false;
      if (lightboxCloseTimer) { clearTimeout(lightboxCloseTimer); lightboxCloseTimer = null; }
      lightbox.classList.remove('is-closing');
    }
    var index = photos.indexOf(photo);
    if (index === -1) return;
    lightboxIndex = index;
    renderLightbox(index);
    if (lightboxPrev) lightboxPrev.style.visibility = photos.length > 1 ? 'visible' : 'hidden';
    if (lightboxNext) lightboxNext.style.visibility = photos.length > 1 ? 'visible' : 'hidden';
    lightbox.hidden = false;
    document.body.classList.add('lightbox-open');
    // Add a history entry so the phone's back button or swipe-back gesture
    // closes the viewer instead of leaving the page
    if (!lightboxHistoryDirty && (!history.state || !history.state.lightbox)) {
      history.pushState({ lightbox: true }, '', location.href);
      lightboxHistoryDirty = true;
    }
    lightboxClose.focus();
  }

  function closeLightbox(fromHistory) {
    if (!lightbox || lightbox.hidden || lightboxClosing) return;
    if (fromHistory) lightboxHistoryDirty = false; // the back press already consumed our entry
    if (reduceMotion) { lightboxClosing = true; finishClose(); return; }
    // Fade out first, then finish closing so the exit matches the entrance
    lightboxClosing = true;
    lightbox.classList.add('is-closing');
    var onEnd = function (event) {
      if (event.target !== lightbox) return; // ignore child animations (photo slides)
      lightbox.removeEventListener('animationend', onEnd);
      finishClose();
    };
    lightbox.addEventListener('animationend', onEnd);
    lightboxCloseTimer = setTimeout(function () {
      lightbox.removeEventListener('animationend', onEnd);
      finishClose();
    }, 240);
  }

  // Back button / swipe-back gesture closes the lightbox instead of leaving
  window.addEventListener('popstate', function () {
    lightboxHistoryDirty = false;
    closeLightbox(true);
  });
  // A refresh while the viewer was open can leave a stale flag in history;
  // clear it so the next back press navigates normally
  if (history.state && history.state.lightbox) {
    history.replaceState(null, '', location.href);
  }

  function stepLightbox(delta) {
    if (lightboxIndex === -1 || photos.length < 2) return;
    lightboxIndex = (lightboxIndex + delta + photos.length) % photos.length;
    renderLightbox(lightboxIndex);
    // Slide the new photo in from the direction it came from
    if (!reduceMotion && lightboxImg) {
      lightboxImg.classList.remove('slide-next', 'slide-prev');
      void lightboxImg.offsetWidth; // restart the animation reliably
      lightboxImg.classList.add(delta > 0 ? 'slide-next' : 'slide-prev');
    }
  }

  photos.forEach(function (photo) {
    photo.addEventListener('click', function () {
      openLightbox(photo);
    });
  });

  if (lightbox) {
    lightbox.addEventListener('click', function (event) {
      // Click on the dark backdrop closes; clicks inside the figure do not
      if (event.target === lightbox) closeLightbox();
    });
  }

  if (lightboxClose) lightboxClose.addEventListener('click', closeLightbox);
  if (lightboxPrev) lightboxPrev.addEventListener('click', function () { stepLightbox(-1); });
  if (lightboxNext) lightboxNext.addEventListener('click', function () { stepLightbox(1); });

  // Swipe between photos while the lightbox is open
  attachSwipe(
    lightbox,
    function () { stepLightbox(1); },  // swipe left -> next photo
    function () { stepLightbox(-1); }  // swipe right -> previous photo
  );

  document.addEventListener('keydown', function (event) {
    if (!lightbox || lightbox.hidden) return;
    if (event.key === 'Escape') closeLightbox();
    if (event.key === 'ArrowLeft') stepLightbox(-1);
    if (event.key === 'ArrowRight') stepLightbox(1);
  });
})();
