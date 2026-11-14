/* Focus Flow — ayarlar ekranı ve tercih yönetimi. */
(function () {
  "use strict";

  const FF = (window.FF = window.FF || {});
  let dom = {};

  function cache() {
    dom = {
      focus: document.getElementById("setFocus"),
      short: document.getElementById("setShort"),
      long: document.getElementById("setLong"),
      interval: document.getElementById("setInterval"),
      goal: document.getElementById("setGoal"),
      autoBreak: document.getElementById("setAutoBreak"),
      autoPomo: document.getElementById("setAutoPomo"),
      sound: document.getElementById("setSound"),
      volume: document.getElementById("setVolume"),
      notif: document.getElementById("setNotif"),
      ambient: document.getElementById("setAmbient"),
      ambientVol: document.getElementById("setAmbientVol"),
      theme: document.getElementById("setTheme"),
      focusMode: document.getElementById("setFocusMode"),
      resetAll: document.getElementById("resetAllBtn"),
    };
  }

  function populate() {
    const s = FF.store.state.settings;
    dom.focus.value = s.durations.focus;
    dom.short.value = s.durations.short;
    dom.long.value = s.durations.long;
    dom.interval.value = s.longBreakInterval;
    dom.goal.value = s.dailyGoal;
    dom.autoBreak.checked = s.autoStartBreaks;
    dom.autoPomo.checked = s.autoStartPomodoros;
    dom.sound.checked = s.sound;
    dom.volume.value = s.volume;
    dom.notif.checked = s.notifications;
    dom.ambient.value = s.ambient;
    dom.ambientVol.value = s.ambientVolume;
    dom.theme.checked = s.theme === "dark";
    dom.focusMode.checked = s.focusMode;
  }

  function clampInt(value, min, max, fallback) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(Math.max(n, min), max);
  }

  function syncRemaining() {
    const t = FF.store.state.timer;
    if (!t.running) t.remaining = FF.store.modeSeconds(t.mode);
  }

  function bind() {
    const s = () => FF.store.state.settings;

    const onDuration = () => {
      s().durations.focus = clampInt(dom.focus.value, 1, 120, 25);
      s().durations.short = clampInt(dom.short.value, 1, 60, 5);
      s().durations.long = clampInt(dom.long.value, 1, 60, 15);
      s().longBreakInterval = clampInt(dom.interval.value, 2, 8, 4);
      syncRemaining();
      FF.store.commit();
    };
    [dom.focus, dom.short, dom.long, dom.interval].forEach((el) =>
      el.addEventListener("change", onDuration)
    );

    dom.goal.addEventListener("change", () => {
      s().dailyGoal = clampInt(dom.goal.value, 1, 30, 8);
      FF.store.commit();
    });

    dom.autoBreak.addEventListener("change", () => {
      s().autoStartBreaks = dom.autoBreak.checked;
      FF.store.save();
    });
    dom.autoPomo.addEventListener("change", () => {
      s().autoStartPomodoros = dom.autoPomo.checked;
      FF.store.save();
    });

    dom.sound.addEventListener("change", () => {
      s().sound = dom.sound.checked;
      if (dom.sound.checked) FF.audio.playChime(s().volume);
      FF.store.save();
    });
    dom.volume.addEventListener("input", () => {
      s().volume = Number(dom.volume.value);
      FF.store.save();
    });
    dom.volume.addEventListener("change", () => FF.audio.playChime(s().volume));

    dom.notif.addEventListener("change", () => {
      s().notifications = dom.notif.checked;
      if (dom.notif.checked && FF.app) FF.app.requestNotifications();
      FF.store.save();
    });

    dom.ambient.addEventListener("change", () => {
      s().ambient = dom.ambient.value;
      FF.audio.unlock();
      FF.audio.startAmbient(s().ambient, s().ambientVolume);
      FF.store.save();
    });
    dom.ambientVol.addEventListener("input", () => {
      s().ambientVolume = Number(dom.ambientVol.value);
      FF.audio.setAmbientVolume(s().ambientVolume);
      FF.store.save();
    });

    dom.theme.addEventListener("change", () => {
      s().theme = dom.theme.checked ? "dark" : "light";
      FF.app.applyTheme();
      FF.store.save();
    });
    dom.focusMode.addEventListener("change", () => {
      FF.app.setFocusMode(dom.focusMode.checked);
    });

    dom.resetAll.addEventListener("click", () => {
      if (!confirm("Tüm görevler, geçmiş ve ayarlar silinsin mi?")) return;
      FF.store.resetAll();
      location.reload();
    });
  }

  function init() {
    cache();
    populate();
    bind();
    FF.bus.on("change", populate);
  }

  FF.settings = { init, populate };
})();
