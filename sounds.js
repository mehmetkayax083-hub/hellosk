/* Focus Flow — odak sesleri. Yalnızca tarayıcıda üretilen gerçek sesler. */
(function () {
  "use strict";

  const FF = (window.FF = window.FF || {});
  let dom = {};

  function cache() {
    dom = {
      grid: document.getElementById("soundGrid"),
      volume: document.getElementById("soundVol"),
    };
  }

  function render() {
    const current = FF.store.state.settings.ambient;
    dom.volume.value = FF.store.state.settings.ambientVolume;
    dom.grid.innerHTML = FF.audio.AMBIENTS.map((sound) => {
      const on = current === sound.id;
      return (
        `<button type="button" class="sound-card${on ? " on" : ""}" data-sound="${sound.id}" aria-pressed="${on}">` +
        `<span class="sound-name">${sound.label}</span>` +
        `<span class="sound-state">${on ? "Çalıyor" : "Çal"}</span>` +
        `</button>`
      );
    }).join("");
  }

  function choose(id) {
    const settings = FF.store.state.settings;
    FF.audio.unlock();
    if (settings.ambient === id) {
      settings.ambient = "none";
      FF.audio.stopAmbient();
    } else {
      settings.ambient = id;
      FF.audio.startAmbient(id, settings.ambientVolume);
    }
    FF.store.commit();
  }

  function init() {
    cache();
    dom.volume.addEventListener("input", () => {
      FF.store.state.settings.ambientVolume = Number(dom.volume.value);
      FF.audio.setAmbientVolume(FF.store.state.settings.ambientVolume);
      FF.store.save();
    });
    dom.grid.addEventListener("click", (event) => {
      const card = event.target.closest("[data-sound]");
      if (!card) return;
      choose(card.dataset.sound);
    });
    render();
    FF.bus.on("change", render);
  }

  FF.sounds = { init, render };
})();
