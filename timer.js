/* Focus Flow — sayaç çekirdeği ve zamanlayıcı ekranı. */
(function () {
  "use strict";

  const FF = (window.FF = window.FF || {});
  const CIRC = 2 * Math.PI * 120;

  const PHASE = { focus: "Odaklanma", short: "Kısa Mola", long: "Uzun Mola" };

  let intervalId = null;
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
    const task = s.tasks.find((x) => x.id === s.activeTaskId && !x.completed);
    if (!task) {
      dom.activeTask.hidden = true;
      return;
    }
    dom.activeTask.hidden = false;
    dom.activeTaskText.textContent = task.text;
    dom.activeTaskCount.textContent = `${task.donePomodoros}/${task.targetPomodoros}`;
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

  function start() {
    const timer = t();
    if (timer.running || timer.remaining <= 0) return;
    FF.audio.unlock();
    if (FF.app) FF.app.requestNotifications();
    timer.running = true;
    timer.endTime = Date.now() + timer.remaining * 1000;
    clearInterval(intervalId);
    intervalId = setInterval(tick, 250);
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
    timer.remaining = FF.store.modeSeconds(mode);
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
    if (settings.sound) FF.audio.playChime(settings.volume);
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
    timer.remaining = FF.store.modeSeconds(next);

    const shouldAuto =
      (next === "focus" && settings.autoStartPomodoros) ||
      (next !== "focus" && settings.autoStartBreaks);

    render();
    FF.store.commit();

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
    });
    if (s.history.length > 1000) s.history = s.history.slice(-1000);
  }

  function bumpActiveTask() {
    const s = FF.store.state;
    const task = s.tasks.find((x) => x.id === s.activeTaskId && !x.completed);
    if (task) task.donePomodoros += 1;
  }

  function init() {
    cache();
    render();
    FF.bus.on("change", render);
  }

  FF.timer = { init, render, start, pause, toggle, reset, setMode, skip: () => setMode(nextModeAfter(t().mode)) };
})();
