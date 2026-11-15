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
      presets: document.querySelectorAll(".preset-btn"),
      goal: document.getElementById("setGoal"),
      autoBreak: document.getElementById("setAutoBreak"),
      autoPomo: document.getElementById("setAutoPomo"),
      sound: document.getElementById("setSound"),
      chime: document.getElementById("setChime"),
      volume: document.getElementById("setVolume"),
      notif: document.getElementById("setNotif"),
      reminder: document.getElementById("setReminder"),
      reminderTime: document.getElementById("setReminderTime"),
      ambient: document.getElementById("setAmbient"),
      ambientVol: document.getElementById("setAmbientVol"),
      theme: document.getElementById("setTheme"),
      focusMode: document.getElementById("setFocusMode"),
      swatches: document.querySelectorAll(".swatch"),
      exportBtn: document.getElementById("exportBtn"),
      importFile: document.getElementById("importFile"),
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
    dom.chime.value = FF.store.CHIMES.includes(s.chime) ? s.chime : "bell";
    dom.volume.value = s.volume;
    dom.notif.checked = s.notifications;
    dom.reminder.checked = !!(s.reminder && s.reminder.enabled);
    dom.reminderTime.value = (s.reminder && s.reminder.time) || "09:00";
    dom.presets.forEach((btn) => {
      const preset = FF.store.PRESETS[btn.dataset.preset];
      const on =
        preset &&
        preset.focus === s.durations.focus &&
        preset.short === s.durations.short &&
        preset.long === s.durations.long;
      btn.classList.toggle("active", on);
    });
    dom.ambient.value = s.ambient;
    dom.ambientVol.value = s.ambientVolume;
    dom.theme.checked = s.theme === "dark";
    dom.focusMode.checked = s.focusMode;
    dom.swatches.forEach((btn) => {
      const on = btn.dataset.palette === s.palette;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-checked", String(on));
    });
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
      if (dom.sound.checked) FF.audio.playChime(s().volume, s().chime);
      FF.store.save();
    });
    dom.volume.addEventListener("input", () => {
      s().volume = Number(dom.volume.value);
      FF.store.save();
    });
    dom.volume.addEventListener("change", () => FF.audio.playChime(s().volume, s().chime));
    dom.chime.addEventListener("change", () => {
      s().chime = FF.store.CHIMES.includes(dom.chime.value) ? dom.chime.value : "bell";
      if (s().sound) FF.audio.playChime(s().volume, s().chime);
      FF.store.save();
    });

    dom.presets.forEach((btn) => {
      btn.addEventListener("click", () => applyPreset(btn.dataset.preset));
    });

    dom.notif.addEventListener("change", () => {
      s().notifications = dom.notif.checked;
      if (dom.notif.checked && FF.app) FF.app.requestNotifications();
      FF.store.save();
    });

    dom.reminder.addEventListener("change", () => {
      if (!s().reminder) s().reminder = { enabled: false, time: "09:00" };
      s().reminder.enabled = dom.reminder.checked;
      if (dom.reminder.checked && FF.app) FF.app.requestNotifications();
      FF.store.save();
      if (FF.app) FF.app.checkReminder();
    });
    dom.reminderTime.addEventListener("change", () => {
      if (!s().reminder) s().reminder = { enabled: false, time: "09:00" };
      s().reminder.time = dom.reminderTime.value || "09:00";
      FF.store.save();
      if (FF.app) FF.app.checkReminder();
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
    dom.swatches.forEach((btn) => {
      btn.addEventListener("click", () => {
        s().palette = btn.dataset.palette;
        FF.app.applyTheme();
        FF.store.commit();
      });
    });
    dom.exportBtn.addEventListener("click", downloadBackup);
    dom.importFile.addEventListener("change", importBackup);
    dom.focusMode.addEventListener("change", () => {
      FF.app.setFocusMode(dom.focusMode.checked);
    });

    dom.resetAll.addEventListener("click", () => {
      if (!confirm("Tüm görevler, geçmiş ve ayarlar silinsin mi?")) return;
      FF.store.resetAll();
      location.reload();
    });
  }

  function applyPreset(name) {
    const preset = FF.store.PRESETS[name];
    if (!preset) return;
    const settings = FF.store.state.settings;
    settings.durations.focus = preset.focus;
    settings.durations.short = preset.short;
    settings.durations.long = preset.long;
    const timer = FF.store.state.timer;
    if (!timer.running) timer.remaining = FF.store.modeSeconds(timer.mode);
    FF.store.commit();
  }

  function downloadBackup() {
    const payload = FF.store.exportData();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `focus-flow-${FF.store.todayKey()}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1500);
  }

  function importBackup() {
    const file = dom.importFile.files && dom.importFile.files[0];
    dom.importFile.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let data = null;
      try {
        data = JSON.parse(String(reader.result));
      } catch {
        data = null;
      }
      if (!data) {
        FF.app.toast("Dosya okunamadı.");
        return;
      }
      if (!confirm("Mevcut veriler bu yedekle değiştirilsin mi?")) return;
      const result = FF.store.importData(data);
      FF.app.toast(result.ok ? "Yedek yüklendi." : result.error);
    };
    reader.readAsText(file);
  }

  function init() {
    cache();
    populate();
    bind();
    FF.bus.on("change", populate);
  }

  FF.settings = { init, populate };
})();
