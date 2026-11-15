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
  let lastBeatSave = 0;
  let completing = false;

  const tabId = (() => {
    const key = "focusflow.tab";
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = "tab" + Date.now() + Math.floor(Math.random() * 1000);
      sessionStorage.setItem(key, id);
    }
    return id;
  })();

  let channel = null;
  try {
    channel = new BroadcastChannel("focusflow-timer");
  } catch {
    channel = null;
  }

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
      etaLine: document.getElementById("etaLine"),
      goalLine: document.getElementById("goalLine"),
      saveFree: document.getElementById("saveFreeBtn"),
      freeBtn: document.getElementById("freeModeBtn"),
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
    const free = timer.mode === "free";
    const total = free ? 3600 : FF.store.modeSeconds(timer.mode);
    const time = fmt(free ? timer.elapsed || 0 : timer.remaining);

    dom.time.textContent = time;
    dom.phase.textContent = free ? "Serbest" : PHASE[timer.mode];
    dom.startPause.textContent = running() ? "Duraklat" : !free && timer.remaining < total ? "Devam Et" : "Başlat";
    if (dom.saveFree) dom.saveFree.hidden = !free;
    if (dom.freeBtn) dom.freeBtn.classList.toggle("active", free);
    dom.body.dataset.mode = timer.mode;
    document.title = `${time} · ${free ? "Serbest" : PHASE[timer.mode]} — Focus Flow`;

    const ratio = free ? Math.min((timer.elapsed || 0) / 3600, 1) : total > 0 ? timer.remaining / total : 0;
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
    renderEta();
    renderGoal();
    renderFocusLengths();
    syncBreath();
  }

  function renderFocusLengths() {
    const focus = FF.store.state.settings.durations.focus;
    document.querySelectorAll("[data-focus]").forEach((btn) => {
      btn.classList.toggle("active", Number(btn.dataset.focus) === focus);
    });
  }

  function setFocusLength(minutes) {
    if (t().running) {
      if (FF.app) FF.app.toast("Süre için önce sayacı durdur.");
      return;
    }
    if (![25, 45, 50, 60].includes(minutes)) return;
    FF.store.state.settings.durations.focus = minutes;
    if (t().mode === "focus") t().remaining = minutes * 60;
    FF.store.commit();
  }

  function renderGoal() {
    const today = FF.store.todayKey();
    const count = FF.store.state.history.filter((item) => item.date === today && item.mode !== "free").length;
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

  function planSeconds() {
    const s = FF.store.state;
    const today = FF.store.todayKey();
    const order = s.plan && s.plan.date === today ? s.plan.order : [];
    const open = order
      .map((id) => s.tasks.find((task) => task.id === id))
      .filter((task) => task && !task.completed && !task.archived && task.donePomodoros < task.targetPomodoros);
    const pomos = open.reduce((sum, task) => sum + (task.targetPomodoros - task.donePomodoros), 0);
    if (pomos <= 0) return 0;

    const durations = s.settings.durations;
    const interval = s.settings.longBreakInterval || 4;
    const timer = s.timer;
    const focusFull = durations.focus * 60;
    const active = open.find((task) => task.id === s.activeTaskId);
    const partial = timer.mode === "focus" && active && timer.remaining < focusFull;
    let cycle = timer.mode === "long" ? 0 : timer.cycle;
    let seconds = timer.mode !== "focus" ? timer.remaining : 0;

    for (let i = 0; i < pomos; i++) {
      seconds += i === 0 && partial ? timer.remaining : focusFull;
      cycle += 1;
      if (i < pomos - 1) {
        seconds += (cycle % interval === 0 ? durations.long : durations.short) * 60;
        if (cycle % interval === 0) cycle = 0;
      }
    }
    return seconds;
  }

  function renderEta() {
    const seconds = planSeconds();
    if (!seconds) {
      dom.etaLine.hidden = true;
      return;
    }
    const end = new Date(Date.now() + seconds * 1000);
    const hh = String(end.getHours()).padStart(2, "0");
    const mm = String(end.getMinutes()).padStart(2, "0");
    dom.etaLine.hidden = false;
    dom.etaLine.textContent = `Plan ${hh}:${mm}'ta biter`;
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

  function ownerIsStale() {
    try {
      const raw = JSON.parse(localStorage.getItem("focusflow.v1"));
      const beat = raw && raw.timer && raw.timer.beat;
      return !raw || !raw.timer || raw.timer.owner === tabId || !beat || Date.now() - beat > 5000;
    } catch {
      return true;
    }
  }

  function publish() {
    if (channel) channel.postMessage({ type: "state", from: tabId });
  }

  function applyRemote() {
    let incoming = null;
    try {
      incoming = JSON.parse(localStorage.getItem("focusflow.v1"));
    } catch {
      return;
    }
    if (!incoming || !incoming.timer || incoming.timer.owner === tabId) return;
    const timer = FF.store.state.timer;
    ["running", "endTime", "remaining", "mode", "cycle", "owner", "sessionId", "beat", "tip"].forEach((key) => {
      timer[key] = incoming.timer[key];
    });
    if (Array.isArray(incoming.history) && incoming.history.length !== FF.store.state.history.length) {
      FF.store.state.history = incoming.history;
      if (Array.isArray(incoming.tasks)) FF.store.state.tasks = incoming.tasks;
      FF.bus.emit("change");
    }
    ensureInterval();
    render();
  }

  function tick() {
    const timer = t();
    if (timer.owner !== tabId) {
      followClock();
      return;
    }
    timer.remaining = Math.max(0, Math.round((timer.endTime - Date.now()) / 1000));
    timer.beat = Date.now();
    paint();
    if (Date.now() - lastBeatSave > 2000) {
      lastBeatSave = Date.now();
      FF.store.save();
    }
    if (timer.remaining <= 0) complete();
  }

  function tickFree() {
    const timer = t();
    if (timer.owner !== tabId) return;
    timer.elapsed = Math.max(0, Math.round((Date.now() - timer.freeOrigin) / 1000));
    timer.beat = Date.now();
    paint();
  }

  function beginFree() {
    const timer = t();
    if (timer.running) pause();
    timer.mode = "free";
    timer.elapsed = 0;
    timer.freeOrigin = null;
    timer.remaining = 0;
    timer.pauses = 0;
    timer.sessionId = null;
    render();
    FF.store.save();
  }

  function saveFree() {
    const timer = t();
    if (timer.mode !== "free") return;
    if (timer.running && timer.freeOrigin) timer.elapsed = Math.max(0, Math.round((Date.now() - timer.freeOrigin) / 1000));
    timer.running = false;
    timer.endTime = null;
    clearInterval(intervalId);
    intervalId = null;
    releaseWake();
    const minutes = Math.round((timer.elapsed || 0) / 60);
    if (minutes < 1) {
      if (FF.app) FF.app.toast("Kaydetmek için en az 1 dakika.");
      return;
    }
    const s = FF.store.state;
    s.history.push({
      ts: Date.now(),
      date: FF.store.todayKey(),
      mode: "free",
      minutes,
      taskId: s.activeTaskId,
      note: "",
      sessionId: "free" + Date.now(),
      pauses: timer.pauses || 0,
      rating: null,
      free: true,
    });
    if (FF.store.clearRestToday) FF.store.clearRestToday();
    timer.elapsed = 0;
    timer.pauses = 0;
    timer.freeOrigin = null;
    FF.store.commit();
    if (FF.app) FF.app.toast(`${minutes} dakikalık serbest çalışma kaydedildi.`);
  }

  function followClock() {
    const timer = t();
    if (!timer.running || !timer.endTime) return;
    timer.remaining = Math.max(0, Math.round((timer.endTime - Date.now()) / 1000));
    paint();
    if (timer.remaining <= 0 && ownerIsStale()) {
      timer.owner = tabId;
      complete();
    }
  }

  function ensureInterval() {
    clearInterval(intervalId);
    intervalId = null;
    const timer = t();
    if (timer.needsComplete) {
      timer.needsComplete = false;
      if (!timer.owner || timer.owner === tabId || ownerIsStale()) {
        timer.owner = tabId;
        complete();
      }
      return;
    }
    if (timer.mode === "free" && timer.running && timer.freeOrigin) {
      if (!timer.owner || timer.owner === tabId || ownerIsStale()) timer.owner = tabId;
      intervalId = setInterval(tickFree, 250);
      return;
    }
    if (timer.running && timer.endTime && timer.endTime > Date.now()) {
      if (!timer.owner || timer.owner === tabId || ownerIsStale()) timer.owner = tabId;
      intervalId = setInterval(timer.owner === tabId ? tick : followClock, 250);
      if (timer.owner === tabId) acquireWake();
    }
  }

  /* Sadece sayaç yüzeyini günceller (her saniye tam render maliyetli olmasın). */
  function paint() {
    const timer = t();
    const free = timer.mode === "free";
    const total = free ? 3600 : FF.store.modeSeconds(timer.mode);
    const shown = free ? timer.elapsed || 0 : timer.remaining;
    const ratio = free ? Math.min(shown / 3600, 1) : total > 0 ? shown / total : 0;
    const time = fmt(shown);
    dom.time.textContent = time;
    dom.bar.style.strokeDashoffset = String(CIRC * (1 - ratio));
    document.title = `${time} · ${PHASE[timer.mode]} — Focus Flow`;
    renderEta();
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

  function foreignRunning() {
    try {
      const raw = JSON.parse(localStorage.getItem("focusflow.v1"));
      const timer = raw && raw.timer;
      if (!timer || !timer.running || !(timer.endTime > Date.now())) return false;
      if (!timer.owner || timer.owner === tabId) return false;
      return Date.now() - (timer.beat || 0) <= 5000;
    } catch {
      return false;
    }
  }

  function start() {
    const timer = t();
    if (foreignRunning()) {
      applyRemote();
      if (FF.app) FF.app.toast("Sayaç başka bir sekmede çalışıyor.");
      return;
    }
    if (timer.running) return;
    if (timer.mode !== "free" && timer.remaining <= 0) return;
    FF.audio.unlock();
    if (FF.app) FF.app.requestNotifications();
    timer.owner = tabId;
    if (timer.mode === "free") {
      timer.running = true;
      timer.freeOrigin = Date.now() - (timer.elapsed || 0) * 1000;
      timer.endTime = null;
      timer.beat = Date.now();
      clearInterval(intervalId);
      intervalId = setInterval(tickFree, 250);
      acquireWake();
      render();
      FF.store.save();
      publish();
      return;
    }
    if (timer.mode === "focus" && timer.remaining >= FF.store.modeSeconds("focus")) timer.pauses = 0;
    timer.sessionId = "s" + Date.now();
    timer.running = true;
    timer.beat = Date.now();
    timer.endTime = Date.now() + timer.remaining * 1000;
    clearInterval(intervalId);
    intervalId = setInterval(tick, 250);
    acquireWake();
    render();
    FF.store.save();
    publish();
  }

  function pause() {
    const timer = t();
    if (timer.running && timer.endTime) {
      timer.remaining = Math.max(0, Math.round((timer.endTime - Date.now()) / 1000));
    }
    if (timer.running && (timer.mode === "focus" || timer.mode === "free")) timer.pauses = (timer.pauses || 0) + 1;
    timer.owner = tabId;
    timer.running = false;
    timer.endTime = null;
    clearInterval(intervalId);
    intervalId = null;
    releaseWake();
    render();
    FF.store.save();
    publish();
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
    if (timer.mode === "free") {
      timer.elapsed = 0;
      timer.freeOrigin = null;
      timer.remaining = 0;
    } else {
      timer.remaining = FF.store.modeSeconds(timer.mode);
    }
    timer.sessionId = null;
    render();
    FF.store.save();
    publish();
  }

  function setMode(mode) {
    const timer = t();
    timer.running = false;
    timer.endTime = null;
    clearInterval(intervalId);
    intervalId = null;
    timer.mode = mode;
    timer.tip = pickTip(mode);
    timer.elapsed = 0;
    timer.freeOrigin = null;
    timer.remaining = FF.store.modeSeconds(mode);
    releaseWake();
    timer.sessionId = null;
    render();
    FF.store.save();
    publish();
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
    if (completing) return;
    if (timer.sessionId && FF.store.state.history.some((item) => item.sessionId === timer.sessionId)) {
      timer.running = false;
      timer.endTime = null;
      timer.needsComplete = false;
      clearInterval(intervalId);
      intervalId = null;
      releaseWake();
      render();
      return;
    }
    completing = true;
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
    publish();
    completing = false;
    if (shouldAuto) start();
  }

  function logManual() {
    recordSession();
    bumpActiveTask();
    if (FF.store.state.history.length > FF.store.HISTORY_CAP) {
      FF.store.state.history = FF.store.state.history.slice(-FF.store.HISTORY_CAP);
    }
    FF.store.commit();
    if (FF.app && FF.app.toast) FF.app.toast("Pomodoro eklendi.");
    if (FF.app && FF.app.celebrateGoalIfNeeded) FF.app.celebrateGoalIfNeeded();
  }

  function undoLast() {
    const s = FF.store.state;
    if (!s.history.length) return { ok: false, error: "Geri alınacak oturum yok." };
    let index = 0;
    s.history.forEach((item, i) => {
      if ((item.ts || 0) >= (s.history[index].ts || 0)) index = i;
    });
    const last = s.history.splice(index, 1)[0];
    const task = s.tasks.find((item) => item.id === last.taskId);
    if (task && task.donePomodoros > 0) task.donePomodoros -= 1;
    FF.store.commit();
    return { ok: true };
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
      sessionId: s.timer.sessionId || null,
      pauses: s.timer.pauses || 0,
      rating: null,
      free: false,
    });
    s.timer.pauses = 0;
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
    ensureInterval();
    FF.bus.on("change", render);
    document.querySelectorAll("[data-focus]").forEach((btn) => {
      btn.addEventListener("click", () => setFocusLength(Number(btn.dataset.focus)));
    });
    if (dom.freeBtn) dom.freeBtn.addEventListener("click", beginFree);
    if (dom.saveFree) dom.saveFree.addEventListener("click", saveFree);
    if (channel) {
      channel.onmessage = (event) => {
        if (!event.data || event.data.from === tabId) return;
        applyRemote();
      };
    }
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && running() && t().owner === tabId) acquireWake();
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
    logManual,
    undoLast,
    TIPS,
  };
})();
