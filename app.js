/* Focus Flow — uygulama kabuğu: gezinme, kısayollar, bildirim ve başlatma. */
(function () {
  "use strict";

  const FF = (window.FF = window.FF || {});
  let dom = {};
  let toastTimer = null;
  let ambientPrimed = false;
  let deferredPrompt = null;
  let noteIndex = -1;

  function cache() {
    dom = {
      body: document.body,
      navButtons: document.querySelectorAll("[data-nav]"),
      panels: document.querySelectorAll("[data-view-panel]"),
      modeBtns: document.querySelectorAll(".mode-btn"),
      startPause: document.getElementById("startPauseBtn"),
      reset: document.getElementById("resetBtn"),
      skip: document.getElementById("skipBtn"),
      motivation: document.getElementById("motivation"),
      toast: document.getElementById("toast"),
      toastText: document.getElementById("toastText"),
      dial: document.querySelector(".dial"),
      focusExit: document.getElementById("focusExit"),
      noteSheet: document.getElementById("noteSheet"),
      noteInput: document.getElementById("noteInput"),
      noteSkip: document.getElementById("noteSkip"),
      goalOverlay: document.getElementById("goalOverlay"),
      goalMessage: document.getElementById("goalMessage"),
      goalClose: document.getElementById("goalClose"),
      installBtn: document.getElementById("installBtn"),
      themeColor: document.getElementById("themeColor"),
    };
  }

  function navigate(view) {
    dom.body.dataset.view = view;
    dom.navButtons.forEach((b) => {
      const active = b.dataset.nav === view;
      b.classList.toggle("active", active);
      if (active) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
    dom.panels.forEach((p) => {
      p.hidden = p.dataset.viewPanel !== view;
    });
    if (view === "stats") FF.stats.render();
    if (view === "tasks") FF.tasks.render();
  }

  function applyTheme() {
    const settings = FF.store.state.settings;
    const theme = settings.theme === "light" ? "light" : "dark";
    const palette = FF.store.PALETTES.includes(settings.palette) ? settings.palette : "violet";
    dom.body.dataset.theme = theme;
    dom.body.dataset.palette = palette;
    if (dom.themeColor) dom.themeColor.setAttribute("content", theme === "light" ? "#eef0fa" : "#0b0c1a");
  }

  function openNote() {
    noteIndex = FF.store.state.history.length - 1;
    dom.noteInput.value = "";
    dom.noteSheet.hidden = false;
  }

  function closeNote() {
    dom.noteSheet.hidden = true;
    noteIndex = -1;
  }

  function saveNote() {
    const text = dom.noteInput.value.trim().slice(0, 140);
    const session = FF.store.state.history[noteIndex];
    closeNote();
    if (session && text) {
      session.note = text;
      FF.store.commit();
    }
  }

  function showGoal(count) {
    const streak = FF.stats.currentStreak();
    dom.goalMessage.textContent = `${count} pomodoro tamamlandı. Serin ${streak} gün. Yarın da bir oturum seriyi sürdürür.`;
    dom.goalOverlay.hidden = false;
  }

  function closeGoal() {
    dom.goalOverlay.hidden = true;
  }

  function afterFocusComplete() {
    openNote();
    const state = FF.store.state;
    const today = FF.store.todayKey();
    const count = state.history.filter((item) => item.date === today).length;
    if (count >= state.settings.dailyGoal && state.goalCelebratedOn !== today) {
      state.goalCelebratedOn = today;
      FF.store.commit();
      showGoal(count);
    }
  }

  function setFocusMode(on) {
    FF.store.state.settings.focusMode = on;
    dom.body.classList.toggle("focus-mode", on);
    dom.focusExit.hidden = !on;
    if (on) navigate("timer");
    FF.store.commit();
  }

  function primeAmbient() {
    if (ambientPrimed) return;
    ambientPrimed = true;
    const s = FF.store.state.settings;
    if (s.ambient && s.ambient !== "none") {
      FF.audio.unlock();
      FF.audio.startAmbient(s.ambient, s.ambientVolume);
    }
  }

  function requestNotifications() {
    const s = FF.store.state.settings;
    if (!s.notifications) return;
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }

  function notify(finishedMode) {
    const s = FF.store.state.settings;
    if (!s.notifications) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const body =
      finishedMode === "focus"
        ? "Odaklanma tamamlandı. Mola zamanı!"
        : "Mola bitti. Çalışmaya hazır mısın?";
    try {
      new Notification("Focus Flow", { body });
    } catch {
      /* bildirim engellenmiş olabilir */
    }
  }

  function toast(message) {
    dom.toastText.textContent = message;
    dom.toast.hidden = false;
    dom.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      dom.toast.classList.remove("show");
      setTimeout(() => (dom.toast.hidden = true), 300);
    }, 3500);
  }

  function celebrate() {
    dom.dial.classList.remove("celebrate");
    void dom.dial.offsetWidth; // reflow ile animasyonu yeniden tetikle
    dom.dial.classList.add("celebrate");
  }

  function setMotivation() {
    const quotes = FF.store.MOTIVATIONS;
    const dayIndex = Math.floor(Date.now() / 86400000) % quotes.length;
    dom.motivation.textContent = quotes[dayIndex];
  }

  function bind() {
    dom.navButtons.forEach((b) => b.addEventListener("click", () => navigate(b.dataset.nav)));
    dom.modeBtns.forEach((b) => b.addEventListener("click", () => FF.timer.setMode(b.dataset.mode)));

    dom.startPause.addEventListener("click", () => {
      primeAmbient();
      FF.timer.toggle();
    });
    dom.reset.addEventListener("click", () => FF.timer.reset());
    dom.skip.addEventListener("click", () => FF.timer.skip());
    dom.focusExit.addEventListener("click", () => setFocusMode(false));
    dom.noteSheet.addEventListener("submit", (event) => {
      event.preventDefault();
      saveNote();
    });
    dom.noteSkip.addEventListener("click", closeNote);
    dom.goalClose.addEventListener("click", closeGoal);
    dom.goalOverlay.addEventListener("click", (event) => {
      if (event.target === dom.goalOverlay) closeGoal();
    });
    dom.installBtn.addEventListener("click", async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice.catch(() => {});
      deferredPrompt = null;
      dom.installBtn.hidden = true;
    });

    window.addEventListener("pointerdown", primeAmbient, { once: false });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (!dom.goalOverlay.hidden) {
          closeGoal();
          return;
        }
        if (!dom.noteSheet.hidden) {
          closeNote();
          return;
        }
      }
      const el = document.activeElement;
      const typing =
        el && (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable);
      if (typing) return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          primeAmbient();
          FF.timer.toggle();
          break;
        case "r":
        case "R":
          FF.timer.reset();
          break;
        case "1":
          FF.timer.setMode("focus");
          break;
        case "2":
          FF.timer.setMode("short");
          break;
        case "3":
          FF.timer.setMode("long");
          break;
        case "f":
        case "F":
          setFocusMode(!FF.store.state.settings.focusMode);
          break;
        case "t":
        case "T": {
          const st = FF.store.state.settings;
          st.theme = st.theme === "dark" ? "light" : "dark";
          applyTheme();
          FF.store.commit();
          break;
        }
      }
    });
  }

  function init() {
    FF.store.load();
    cache();

    FF.app = {
      navigate,
      applyTheme,
      setFocusMode,
      requestNotifications,
      notify,
      toast,
      celebrate,
      afterFocusComplete,
    };

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredPrompt = event;
      dom.installBtn.hidden = false;
    });

    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }

    applyTheme();
    dom.body.classList.toggle("focus-mode", FF.store.state.settings.focusMode);
    dom.focusExit.hidden = !FF.store.state.settings.focusMode;
    setMotivation();

    FF.timer.init();
    FF.tasks.init();
    FF.stats.init();
    FF.settings.init();

    bind();
    navigate("timer");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
