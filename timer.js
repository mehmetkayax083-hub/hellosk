/* Focus Flow — sayaç çekirdeği ve zamanlayıcı ekranı. */
(function () {
  "use strict";

  const FF = (window.FF = window.FF || {});
  const CIRC = 2 * Math.PI * 120;

  const PHASE = { focus: "Odaklanma", short: "Kısa Mola", long: "Uzun Mola" };

  const BREATH = [
    { cls: "inhale", label: "Nefes al" },
    { cls: "hold-in", label: "Tut" },
    { cls: "exhale", label: "Ver" },
    { cls: "hold-out", label: "Tut" },
  ];

  const TIPS = [
    "Bir bardak su iç.",
    "Omuzlarını geriye aç ve esnet.",
    "Pencereden uzağa, 20 saniye bak.",
    "Kısa bir tur at.",
    "Bileklerini ve ellerini gevşet.",
    "Ayağa kalk, bir kez gerin.",
  ];

  let intervalId = null;
  let breathTimer = null;
  let breathStep = 0;
  let wakeLock = null;
  let dom = {};

  function cache() {
    dom = {
      body: document.body,
      time: document.getElementById("time"),
      phase: document.getElementById("phase"),
      bar: document.getElementById("dialBar"),
      dots: document.getElementById("cycleDots"),
      startPause: document.getElementById("startPauseBtn"),
      modeBtns: document.querySelectorAll(".mode-btn"),
      activeTask: document.getElementById("activeTask"),
      activeTaskText: document.getElementById("activeTaskText"),
      activeTaskCount: document.getElementById("activeTaskCount"),
      planLine: document.getElementById("planLine"),
      goalLine: document.getElementById("goalLine"),
      breath: document.getElementById("breath"),
      breathBox: document.getElementById("breathBox"),
      breathLabel: document.getElementById("breathLabel"),
      breathTip: document.getElementById("breathTip"),
    };
  }

  const t = () => FF.store.state.timer;
  const running = () => t().running;

  function fmt(total) {
    const m = String(Math.floor(total / 60)).padStart(2, "0");
    const s = String(total % 60).padStart(2, "0");
    return `${m}:${s}`;
  }

  function render() {
    const timer = t();
    const total = FF.store.modeSeconds(timer.mode);
    const time = fmt(timer.remaining);

    dom.time.textContent = time;
    dom.phase.textContent = PHASE[timer.mode];
    dom.startPause.textContent = running() ? "Duraklat" : timer.remaining < total ? "Devam Et" : "Başlat";
    dom.body.dataset.mode = timer.mode;
    document.title = `${time} · ${PHASE[timer.mode]} — Focus Flow`;

    const ratio = total > 0 ? timer.remaining / total : 0;
    dom.bar.style.strokeDasharray = String(CIRC);
    dom.bar.style.strokeDashoffset = String(CIRC * (1 - ratio));

    dom.modeBtns.forEach((b) => {
      const active = b.dataset.mode === timer.mode;
      b.classList.toggle("active", active);
      b.setAttribute("aria-selected", String(active));
    });

    renderDots();
    renderActiveTask();
    renderPlan();
    renderGoal();
    syncBreath();
  }

  function renderGoal() {
    const today = FF.store.todayKey();
    const count = FF.store.state.history.filter((item) => item.date === today).length;
    const goal = FF.store.state.settings.dailyGoal;
    dom.goalLine.textContent = `Bugün ${count}/${goal}`;
    dom.goalLine.classList.toggle("met", count >= goal);
  }

  function renderDots() {
    const interval = FF.store.state.settings.longBreakInterval;
    const done = t().cycle % interval;
    const filled = done === 0 && t().cycle > 0 ? interval : done;
    let html = "";
    for (let i = 0; i < interval; i++) {
      html += `<span class="dot${i < filled ? " done" : ""}"></span>`;
    }
    dom.dots.innerHTML = html;
  }

  function renderActiveTask() {
    const s = FF.store.state;
    const task = s.tasks.find((x) => x.id === s.activeTaskId && !x.completed && !x.archived);
    if (!task) {
      dom.activeTask.hidden = true;
      return;
    }
    dom.activeTask.hidden = false;
    dom.activeTaskText.textContent = task.text;
    dom.activeTaskCount.textContent = `${task.donePomodoros}/${task.targetPomodoros}`;
  }

  function renderPlan() {
    const s = FF.store.state;
    const today = FF.store.todayKey();
    const order = s.plan && s.plan.date === today ? s.plan.order : [];
    const open = order
      .map((id) => s.tasks.find((task) => task.id === id))
      .filter((task) => task && !task.completed && !task.archived);
    if (!open.length) {
      dom.planLine.hidden = true;
      return;
    }
    const index = open.findIndex((task) => task.id === s.activeTaskId);
    dom.planLine.hidden = false;
    dom.planLine.textContent =
      index >= 0 ? `Bugünün planı · ${index + 1}/${open.length}` : `Bugünün planı · ${open.length} görev`;
  }

  function applyBreath() {
    const step = BREATH[breathStep];
    dom.breathBox.className = "breath-box " + step.cls;
    dom.breathLabel.textContent = step.label;
    dom.breathTip.textContent = t().tip || "";
  }

  function pickTip(mode) {
    if (mode === "focus") return "";
    return TIPS[Math.floor(Math.random() * TIPS.length)];
  }

  function acquireWake() {
    if (!("wakeLock" in navigator)) return;
    navigator.wakeLock
      .request("screen")
      .then((lock) => {
        wakeLock = lock;
        lock.addEventListener("release", () => {
          if (wakeLock === lock) wakeLock = null;
        });
      })
      .catch(() => {
        wakeLock = null;
      });
  }

  function releaseWake() {
    const lock = wakeLock;
    wakeLock = null;
    if (lock) lock.release().catch(() => {});
  }

  function syncBreath() {
    const on = t().mode !== "focus";
    dom.breath.hidden = !on;
    if (on && !breathTimer) {
      breathStep = 0;
      applyBreath();
      breathTimer = setInterval(() => {
        breathStep = (breathStep + 1) % BREATH.length;
        applyBreath();
      }, 4000);
    }
    if (!on && breathTimer) {
      clearInterval(breathTimer);
      breathTimer = null;
    }
  }

  function tick() {
    const timer = t();
    timer.remaining = Math.max(0, Math.round((timer.endTime - Date.now()) / 1000));
    paint();
    if (timer.remaining <= 0) complete();
  }

  /* Sadece sayaç yüzeyini günceller (her saniye tam render maliyetli olmasın). */
  function paint() {
    const timer = t();
    const total = FF.store.modeSeconds(timer.mode);
    const ratio = total > 0 ? timer.remaining / total : 0;
    const time = fmt(timer.remaining);
    dom.time.textContent = time;
    dom.bar.style.strokeDashoffset = String(CIRC * (1 - ratio));
    document.title = `${time} · ${PHASE[timer.mode]} — Focus Flow`;
  }

  function halt() {
    clearInterval(intervalId);
    intervalId = null;
    const timer = t();
    if (timer) {
      timer.running = false;
      timer.endTime = null;
    }
    releaseWake();
  }

  function start() {
    const timer = t();
    if (timer.running || timer.remaining <= 0) return;
    FF.audio.unlock();
    if (FF.app) FF.app.requestNotifications();
    timer.running = true;
    timer.endTime = Date.now() + timer.remaining * 1000;
    clearInterval(intervalId);
    intervalId = setInterval(tick, 250);
    acquireWake();
    render();
    FF.store.save();
  }

  function pause() {
    const timer = t();
    if (timer.running && timer.endTime) {
      timer.remaining = Math.max(0, Math.round((timer.endTime - Date.now()) / 1000));
    }
    timer.running = false;
    timer.endTime = null;
    clearInterval(intervalId);
    intervalId = null;
    releaseWake();
    render();
    FF.store.save();
  }

  function toggle() {
    running() ? pause() : start();
  }

  function reset() {
    const timer = t();
    timer.running = false;
    timer.endTime = null;
    clearInterval(intervalId);
    intervalId = null;
    releaseWake();
    timer.remaining = FF.store.modeSeconds(timer.mode);
    render();
    FF.store.save();
  }

  function setMode(mode) {
    const timer = t();
    timer.running = false;
    timer.endTime = null;
    clearInterval(intervalId);
    intervalId = null;
    timer.mode = mode;
    timer.tip = pickTip(mode);
    timer.remaining = FF.store.modeSeconds(mode);
    releaseWake();
    render();
    FF.store.save();
  }

  function nextModeAfter(mode) {
    const interval = FF.store.state.settings.longBreakInterval;
    if (mode === "focus") {
      return t().cycle % interval === 0 ? "long" : "short";
    }
    return "focus";
  }

  function complete() {
    const timer = t();
    const finished = timer.mode;
    clearInterval(intervalId);
    intervalId = null;
    timer.running = false;
    timer.endTime = null;

    if (finished === "focus") {
      timer.cycle += 1;
      recordSession();
      bumpActiveTask();
    }

    const settings = FF.store.state.settings;
    if (settings.sound) FF.audio.playChime(settings.volume, settings.chime);
    if (FF.app) {
      FF.app.notify(finished);
      FF.app.toast(
        finished === "focus" ? "Oturum tamamlandı! Mola zamanı." : "Mola bitti. Hazırsan devam!"
      );
      FF.app.celebrate();
    }

    const next = nextModeAfter(finished);
    if (finished === "long") timer.cycle = 0;

    timer.mode = next;
    timer.tip = pickTip(next);
    timer.remaining = FF.store.modeSeconds(next);
    releaseWake();

    const shouldAuto =
      (next === "focus" && settings.autoStartPomodoros) ||
      (next !== "focus" && settings.autoStartBreaks);

    render();
    FF.store.commit();

    if (finished === "focus" && FF.app && FF.app.afterFocusComplete) FF.app.afterFocusComplete();
    if (shouldAuto) start();
  }

  function recordSession() {
    const s = FF.store.state;
    s.history.push({
      ts: Date.now(),
      date: FF.store.todayKey(),
      mode: "focus",
      minutes: s.settings.durations.focus,
      taskId: s.activeTaskId,
      note: "",
    });
    if (FF.store.clearRestToday) FF.store.clearRestToday();
    if (s.history.length > FF.store.HISTORY_CAP) s.history = s.history.slice(-FF.store.HISTORY_CAP);
  }

  function bumpActiveTask() {
    const s = FF.store.state;
    const task = s.tasks.find((x) => x.id === s.activeTaskId && !x.completed && !x.archived);
    if (!task) return;
    task.donePomodoros += 1;
    if (task.donePomodoros >= task.targetPomodoros) advancePlan(task.id);
  }

  function advancePlan(finishedId) {
    const s = FF.store.state;
    const today = FF.store.todayKey();
    if (!s.plan || s.plan.date !== today || !s.plan.order.includes(finishedId)) return;
    const open = (id) => {
      const task = s.tasks.find((item) => item.id === id);
      return task && !task.completed && task.donePomodoros < task.targetPomodoros;
    };
    const index = s.plan.order.indexOf(finishedId);
    const next = s.plan.order.slice(index + 1).concat(s.plan.order.slice(0, index)).find(open);
    if (next) s.activeTaskId = next;
  }

  function init() {
    cache();
    render();
    FF.bus.on("change", render);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && running()) acquireWake();
    });
  }

  FF.timer = {
    init,
    render,
    start,
    pause,
    halt,
    toggle,
    reset,
    setMode,
    skip() {
      const mode = t().mode;
      if (mode !== "focus") {
        setMode("focus");
        return;
      }
      const interval = FF.store.state.settings.longBreakInterval || 4;
      setMode((t().cycle + 1) % interval === 0 ? "long" : "short");
    },
    hasWakeLock: () => !!wakeLock,
    TIPS,
  };
})();
