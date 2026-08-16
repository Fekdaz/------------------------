(function () {
  var MAP_TARGETS = [
    { mapId: "nearby-map", curtainId: "nearby-tablet-curtain-stage" },
    { mapId: "nearby-map-expanded", curtainId: "nearby-tablet-curtain-expanded" },
  ];

  var config = window.KOZHEVNYA_CONFIG || {};
  var coords = Array.isArray(config.locationCoords) ? config.locationCoords : [55.71232, 37.905896];
  var address =
    config.locationAddress ||
    "109383, г. Москва, 1-й Красковский проезд, 38А, стр. 40, м. «Лухмановская»";
  var apiKey = config.yandexMapsApiKey;
  var apiScriptPromise = null;
  var instances = [];

  function waitForAnimation(element, animationName) {
    return new Promise(function (resolve) {
      if (!element) {
        resolve();
        return;
      }

      var finished = false;

      function done() {
        if (finished) return;
        finished = true;
        element.removeEventListener("animationend", onEnd);
        resolve();
      }

      function onEnd(event) {
        if (event.target !== element || event.animationName !== animationName) return;
        done();
      }

      element.addEventListener("animationend", onEnd);
      window.setTimeout(done, 700);
    });
  }

  function loadMapsApi() {
    if (apiScriptPromise) return apiScriptPromise;

    apiScriptPromise = new Promise(function (resolve, reject) {
      if (window.ymaps && typeof window.ymaps.ready === "function") {
        window.ymaps.ready(resolve);
        return;
      }

      var script = document.createElement("script");
      script.async = true;
      script.src =
        "https://api-maps.yandex.ru/2.1/?apikey=" +
        encodeURIComponent(String(apiKey)) +
        "&lang=ru_RU";
      script.onload = function () {
        if (!window.ymaps || typeof window.ymaps.ready !== "function") {
          reject(new Error("Yandex Maps API unavailable"));
          return;
        }
        window.ymaps.ready(resolve);
      };
      script.onerror = function () {
        reject(new Error("Yandex Maps API failed to load"));
      };
      document.head.appendChild(script);
    });

    return apiScriptPromise;
  }

  function onceMapActionEnd(map, callback) {
    var handler = function () {
      map.events.remove("actionend", handler);
      callback();
    };

    map.events.add("actionend", handler);
  }

  function createMapInstance(target) {
    var mapNode = document.getElementById(target.mapId);
    if (!mapNode) return null;

    var curtain = document.getElementById(target.curtainId);
    var state = {
      started: false,
      mapInstance: null,
      mapIframe: null,
      mapReady: false,
      initialRevealDone: false,
      resizeFrame: null,
      powerOffPromise: null,
      powerOnPromise: null,
    };

    function revealMapOnce() {
      if (state.initialRevealDone) return Promise.resolve();
      state.initialRevealDone = true;
      return powerOn();
    }

    function powerOff() {
      if (state.powerOffPromise) return state.powerOffPromise;

      if (
        curtain &&
        curtain.classList.contains("is-black") &&
        !curtain.classList.contains("is-powering-off") &&
        !curtain.classList.contains("is-powering-on")
      ) {
        return Promise.resolve();
      }

      state.powerOffPromise = new Promise(function (resolve) {
        if (!curtain) {
          state.powerOffPromise = null;
          resolve();
          return;
        }

        curtain.classList.remove("is-powering-on");
        curtain.classList.add("is-powering-off");

        waitForAnimation(curtain, "nearby-screen-power-off").then(function () {
          curtain.classList.remove("is-powering-off");
          curtain.classList.add("is-black");
          state.powerOffPromise = null;
          resolve();
        });
      });

      return state.powerOffPromise;
    }

    function powerOn() {
      if (state.powerOnPromise) return state.powerOnPromise;

      state.powerOnPromise = new Promise(function (resolve) {
        if (!curtain) {
          state.powerOnPromise = null;
          resolve();
          return;
        }

        if (
          !curtain.classList.contains("is-black") &&
          !curtain.classList.contains("is-powering-off") &&
          !curtain.classList.contains("is-powering-on")
        ) {
          state.powerOnPromise = null;
          resolve();
          return;
        }

        curtain.classList.remove("is-powering-off");
        curtain.classList.add("is-black", "is-powering-on");

        waitForAnimation(curtain, "nearby-screen-power-on").then(function () {
          curtain.classList.remove("is-powering-on", "is-black");
          state.powerOnPromise = null;
          resolve();
        });
      });

      return state.powerOnPromise;
    }

    function fitMapToViewport() {
      if (state.resizeFrame) {
        window.cancelAnimationFrame(state.resizeFrame);
      }

      state.resizeFrame = window.requestAnimationFrame(function () {
        state.resizeFrame = null;

        if (
          state.mapInstance &&
          state.mapInstance.container &&
          typeof state.mapInstance.container.fitToViewport === "function"
        ) {
          state.mapInstance.container.fitToViewport();
        }
      });
    }

    function markMapReady() {
      if (state.mapReady) return;
      state.mapReady = true;
      revealMapOnce();
    }

    function renderIframeMap() {
      var lon = coords[1];
      var lat = coords[0];
      var iframe = document.createElement("iframe");
      iframe.className = "nearby__map-iframe";
      iframe.title = "Карта - Кожевня";
      iframe.allowFullscreen = true;
      iframe.referrerPolicy = "no-referrer-when-downgrade";
      iframe.src =
        "https://yandex.ru/map-widget/v1/?ll=" +
        encodeURIComponent(String(lon) + "," + String(lat)) +
        "&z=16&l=map&pt=" +
        encodeURIComponent(String(lon) + "," + String(lat) + ",pm2rdm");
      mapNode.appendChild(iframe);
      state.mapIframe = iframe;

      iframe.addEventListener(
        "load",
        function () {
          markMapReady();
        },
        { once: true }
      );
    }

    function renderInteractiveMap() {
      loadMapsApi()
        .then(function () {
          var map = new window.ymaps.Map(
            mapNode,
            {
              center: coords,
              zoom: 16,
              controls: ["zoomControl", "geolocationControl"],
            },
            {
              suppressMapOpenBlock: true,
              yandexMapDisablePoiInteractivity: true,
            }
          );

          state.mapInstance = map;
          map.behaviors.enable(["drag", "scrollZoom", "multiTouch", "dblClickZoom"]);

          var placemark = new window.ymaps.Placemark(
            coords,
            {
              balloonContentHeader: "Кожевня",
              balloonContentBody: address,
              hintContent: "Кожевня",
            },
            {
              preset: "islands#brownDotIcon",
            }
          );

          map.geoObjects.add(placemark);
          placemark.balloon.open();

          onceMapActionEnd(map, markMapReady);
          window.setTimeout(markMapReady, 900);
        })
        .catch(function () {
          renderIframeMap();
        });
    }

    function startMap() {
      if (state.started) return;
      state.started = true;

      if (apiKey) {
        renderInteractiveMap();
        return;
      }

      renderIframeMap();
    }

    return {
      start: startMap,
      resize: fitMapToViewport,
      powerOff: powerOff,
      powerOn: powerOn,
      isReady: function () {
        return state.mapReady;
      },
    };
  }

  MAP_TARGETS.forEach(function (target) {
    var instance = createMapInstance(target);
    if (instance) instances.push(instance);
  });

  if (!instances.length) return;

  function forEachInstance(methodName) {
    return function () {
      var args = arguments;
      var results = instances.map(function (instance) {
        if (typeof instance[methodName] !== "function") return Promise.resolve();
        return instance[methodName].apply(instance, args);
      });
      return Promise.all(results);
    };
  }

  window.KOZHEVNYA_NEARBY_MAP = {
    resize: function () {
      instances.forEach(function (instance) {
        instance.resize();
      });
    },
    powerOff: forEachInstance("powerOff"),
    powerOn: forEachInstance("powerOn"),
    isReady: function () {
      return instances.every(function (instance) {
        return instance.isReady();
      });
    },
  };

  window.addEventListener("nearby-tablet-resize", function () {
    window.KOZHEVNYA_NEARBY_MAP.resize();
  });

  instances.forEach(function (instance) {
    instance.start();
  });
})();
