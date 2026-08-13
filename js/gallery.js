(function () {
  var root = document.querySelector("[data-gallery]");
  if (!root || !window.KOZHEVNYA_GALLERIES) return;

  var key = root.getAttribute("data-gallery");
  var data = window.KOZHEVNYA_GALLERIES[key];
  if (!data || !data.images || !data.images.length) return;

  var images = data.images;
  var grid = document.getElementById("gallery-grid");
  var lightbox = document.getElementById("gallery-lightbox");
  var stage = document.getElementById("gallery-lightbox-stage");
  var counter = document.getElementById("gallery-lightbox-counter");
  var index = 0;
  var animating = false;
  var touchStartX = 0;
  var touchStartY = 0;

  function fragmentFromHtml(html) {
    var template = document.createElement("template");
    template.innerHTML = html.trim();
    return template.content.firstElementChild;
  }

  function renderGrid() {
    var frag = document.createDocumentFragment();
    images.forEach(function (src, i) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "gallery-grid__item";
      button.setAttribute("data-index", String(i));
      button.setAttribute("aria-label", "Открыть фото " + (i + 1));
      var img = document.createElement("img");
      img.src = src;
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      button.appendChild(img);
      frag.appendChild(button);
    });
    grid.appendChild(frag);
  }

  function preload(i) {
    if (i < 0 || i >= images.length) return;
    var img = new Image();
    img.src = images[i];
  }

  function setCounter() {
    counter.textContent = index + 1 + " / " + images.length;
  }

  function makePhoto(src, extraClass) {
    return fragmentFromHtml(
      '<div class="gallery-lightbox__photo ' +
        extraClass +
        '"><img alt=""></div>'
    );
  }

  function showPhoto(nextIndex, direction) {
    if (animating) return;
    var total = images.length;
    nextIndex = ((nextIndex % total) + total) % total;
    if (nextIndex === index && stage.querySelector(".is-active")) return;

    var current = stage.querySelector(".gallery-lightbox__photo.is-active");
    var incoming = makePhoto(
      images[nextIndex],
      "is-active" + (direction ? " is-enter-" + direction : "")
    );
    incoming.querySelector("img").src = images[nextIndex];
    stage.appendChild(incoming);

    if (current && direction) {
      animating = true;
      current.classList.remove("is-active");
      current.classList.add("is-leave-" + direction);
      window.setTimeout(function () {
        if (current.parentNode) current.parentNode.removeChild(current);
        incoming.classList.remove("is-enter-next", "is-enter-prev");
        animating = false;
      }, 380);
    } else if (current) {
      current.parentNode.removeChild(current);
    }

    index = nextIndex;
    setCounter();
    preload(index + 1);
    preload(index - 1);
  }

  function openLightbox(startIndex) {
    index = startIndex;
    stage.innerHTML = "";
    showPhoto(startIndex, null);
    lightbox.hidden = false;
    lightbox.classList.add("is-open");
    lightbox.setAttribute("aria-hidden", "false");
    document.body.classList.add("gallery-lightbox-open");
    document.getElementById("gallery-lightbox-close").focus();
  }

  function closeLightbox() {
    lightbox.classList.remove("is-open");
    lightbox.setAttribute("aria-hidden", "true");
    document.body.classList.remove("gallery-lightbox-open");
    window.setTimeout(function () {
      if (!lightbox.classList.contains("is-open")) {
        lightbox.hidden = true;
        stage.innerHTML = "";
      }
    }, 320);
  }

  grid.addEventListener("click", function (event) {
    var item = event.target.closest(".gallery-grid__item");
    if (!item) return;
    openLightbox(Number(item.getAttribute("data-index")));
  });

  document.getElementById("gallery-lightbox-close").addEventListener("click", closeLightbox);
  document.getElementById("gallery-lightbox-prev").addEventListener("click", function () {
    showPhoto(index - 1, "prev");
  });
  document.getElementById("gallery-lightbox-next").addEventListener("click", function () {
    showPhoto(index + 1, "next");
  });

  lightbox.addEventListener("click", function (event) {
    if (event.target === lightbox) closeLightbox();
  });

  document.addEventListener("keydown", function (event) {
    if (!lightbox.classList.contains("is-open")) return;
    if (event.key === "Escape") closeLightbox();
    if (event.key === "ArrowRight") showPhoto(index + 1, "next");
    if (event.key === "ArrowLeft") showPhoto(index - 1, "prev");
  });

  stage.addEventListener(
    "touchstart",
    function (event) {
      if (!event.changedTouches[0]) return;
      touchStartX = event.changedTouches[0].clientX;
      touchStartY = event.changedTouches[0].clientY;
    },
    { passive: true }
  );

  stage.addEventListener(
    "touchend",
    function (event) {
      if (!event.changedTouches[0]) return;
      var dx = event.changedTouches[0].clientX - touchStartX;
      var dy = event.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
      if (dx < 0) showPhoto(index + 1, "next");
      else showPhoto(index - 1, "prev");
    },
    { passive: true }
  );

  renderGrid();
})();
