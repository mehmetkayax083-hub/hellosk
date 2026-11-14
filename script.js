const STORAGE_KEY = "pomodoro.state.v1";
const ROUNDS_BEFORE_LONG = 4;
const CIRCUMFERENCE = 2 * Math.PI * 110;

const DEFAULT_SETTINGS = {
  focus: 25,
  short: 5,
  long: 15,
  sound: true,
  autoStart: false,
};

const MODE_LABELS = {
  focus: "Odaklanma zamanı",
  short: "Kısa mola zamanı",
  long: "Uzun mola zamanı",
};

const el = {
  body: document.body,
  timer: document.getElementById("timer"),
  status: document.getElementById("status"),
  startPause: document.getElementById("startPauseBtn"),
  reset: document.getElementById("resetBtn"),
  modeButtons: document.querySelectorAll(".mode-btn"),
  progressBar: document.getElementById("progressBar"),
  rounds: document.getElementById("rounds"),
  themeBtn: document.getElementById("themeBtn"),
  settingsBtn: document.getElementById("settingsBtn"),
  summaryCount: document.getElementById("summaryCount"),
  summaryMinutes: document.getElementById("summaryMinutes"),
  taskForm: document.getElementById("taskForm"),
  taskInput: document.getElementById("taskInput"),
  taskList: document.getElementById("taskList"),
  modal: document.getElementById("settingsModal"),
  closeSettings: document.getElementById("closeSettingsBtn"),
  saveSettings: document.getElementById("saveSettingsBtn"),
  focusMin: document.getElementById("focusMin"),
  shortMin: document.getElementById("shortMin"),
  longMin: document.getElementById("longMin"),
  soundToggle: document.getElementById("soundToggle"),
  autoStartToggle: document.getElementById("autoStartToggle"),
};

let settings = { ...DEFAULT_SETTINGS };
let currentMode = "focus";
let remainingSeconds = DEFAULT_SETTINGS.focus * 60;
let completedFocus = 0;
let theme = "light";
let tasks = [];
let stats = { date: todayKey(), count: 0, minutes: 0 };

let endTime = null;
let intervalId = null;
let audioCtx = null;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function modeDuration(mode) {
  return settings[mode] * 60;
}

function isRunning() {
  return intervalId !== null;
}

function loadState() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    saved = null;
  }
  if (!saved) return;

  settings = { ...DEFAULT_SETTINGS, ...(saved.settings || {}) };
  currentMode = MODE_LABELS[saved.currentMode] ? saved.currentMode : "focus";
  completedFocus = saved.completedFocus || 0;
  theme = saved.theme === "dark" ? "dark" : "light";
  tasks = Array.isArray(saved.tasks) ? saved.tasks : [];

  if (saved.stats && saved.stats.date === todayKey()) {
    stats = saved.stats;
  }

  const savedRemaining = Number(saved.remainingSeconds);
  remainingSeconds =
    Number.isFinite(savedRemaining) && savedRemaining > 0
      ? Math.min(savedRemaining, modeDuration(currentMode))
      : modeDuration(currentMode);
}

function saveState() {
  const state = {
    settings,
    currentMode,
    remainingSeconds,
    completedFocus,
    theme,
    tasks,
    stats,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage may be unavailable; ignore */
  }
}

function formatTime(totalSeconds) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function renderProgress() {
  const total = modeDuration(currentMode);
  const ratio = total > 0 ? remainingSeconds / total : 0;
  el.progressBar.style.strokeDasharray = String(CIRCUMFERENCE);
  el.progressBar.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - ratio));
}

function renderRounds() {
  el.rounds.innerHTML = "";
  for (let i = 0; i < ROUNDS_BEFORE_LONG; i++) {
    const dot = document.createElement("span");
    dot.className = "dot" + (i < completedFocus % ROUNDS_BEFORE_LONG ? " done" : "");
    if (completedFocus > 0 && completedFocus % ROUNDS_BEFORE_LONG === 0) {
      dot.classList.add("done");
    }
    el.rounds.appendChild(dot);
  }
}

function render() {
  const time = formatTime(remainingSeconds);
  el.timer.textContent = time;
  el.status.textContent = MODE_LABELS[currentMode];
  el.startPause.textContent = isRunning() ? "Duraklat" : "Başlat";
  document.title = `${time} · ${MODE_LABELS[currentMode]}`;

  el.modeButtons.forEach((btn) => {
    const active = btn.dataset.mode === currentMode;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
  });

  renderProgress();
  renderRounds();
}

function tick() {
  remainingSeconds = Math.max(0, Math.round((endTime - Date.now()) / 1000));
  render();
  if (remainingSeconds === 0) {
    finish();
  }
}

function start() {
  if (isRunning() || remainingSeconds <= 0) return;
  unlockAudio();
  requestNotificationPermission();
  endTime = Date.now() + remainingSeconds * 1000;
  intervalId = setInterval(tick, 250);
  render();
  saveState();
}

function pause() {
  clearInterval(intervalId);
  intervalId = null;
  render();
  saveState();
}

function reset() {
  pause();
  remainingSeconds = modeDuration(currentMode);
  render();
  saveState();
}

function setMode(mode, { keepRunning = false } = {}) {
  if (!keepRunning) pause();
  currentMode = mode;
  el.body.dataset.mode = mode;
  remainingSeconds = modeDuration(mode);
  render();
  saveState();
}

function nextMode() {
  if (currentMode !== "focus") return "focus";
  return completedFocus % ROUNDS_BEFORE_LONG === 0 ? "long" : "short";
}

function finish() {
  pause();
  const finishedMode = currentMode;

  if (finishedMode === "focus") {
    completedFocus += 1;
    stats.count += 1;
    stats.minutes += settings.focus;
  }

  if (settings.sound) playAlarm();
  notify(finishedMode);
  renderSummary();

  const upcoming = nextMode();
  setMode(upcoming);

  if (settings.autoStart) {
    start();
  }
  saveState();
}

function unlockAudio() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
}

function playAlarm() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  for (let i = 0; i < 3; i++) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const startAt = now + i * 0.4;
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.4, startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.3);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(startAt);
    osc.stop(startAt + 0.3);
  }
}

function requestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

function notify(finishedMode) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const text =
    finishedMode === "focus"
      ? "Odaklanma süresi bitti. Mola zamanı!"
      : "Mola bitti. Çalışmaya dönebilirsin!";
  try {
    new Notification("Pomodoro", { body: text });
  } catch {
    /* notifications may be blocked; ignore */
  }
}

function renderTasks() {
  el.taskList.innerHTML = "";
  tasks.forEach((task) => {
    const li = document.createElement("li");
    li.className = "task-item" + (task.done ? " done" : "");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = task.done;
    checkbox.setAttribute("aria-label", "Tamamlandı");
    checkbox.addEventListener("change", () => {
      task.done = checkbox.checked;
      renderTasks();
      saveState();
    });

    const span = document.createElement("span");
    span.textContent = task.text;

    const del = document.createElement("button");
    del.className = "task-del";
    del.type = "button";
    del.textContent = "×";
    del.setAttribute("aria-label", "Görevi sil");
    del.addEventListener("click", () => {
      tasks = tasks.filter((t) => t.id !== task.id);
      renderTasks();
      saveState();
    });

    li.append(checkbox, span, del);
    el.taskList.appendChild(li);
  });
}

function addTask(text) {
  const trimmed = text.trim();
  if (!trimmed) return;
  tasks.push({ id: Date.now(), text: trimmed, done: false });
  renderTasks();
  saveState();
}

function renderSummary() {
  if (stats.date !== todayKey()) {
    stats = { date: todayKey(), count: 0, minutes: 0 };
  }
  el.summaryCount.textContent = String(stats.count);
  el.summaryMinutes.textContent = String(stats.minutes);
}

function applyTheme() {
  el.body.classList.toggle("dark", theme === "dark");
}

function toggleTheme() {
  theme = theme === "dark" ? "light" : "dark";
  applyTheme();
  saveState();
}

function openSettings() {
  el.focusMin.value = settings.focus;
  el.shortMin.value = settings.short;
  el.longMin.value = settings.long;
  el.soundToggle.checked = settings.sound;
  el.autoStartToggle.checked = settings.autoStart;
  el.modal.hidden = false;
}

function closeSettings() {
  el.modal.hidden = true;
}

function clampMinutes(value, fallback, max) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

function saveSettings() {
  settings = {
    focus: clampMinutes(el.focusMin.value, DEFAULT_SETTINGS.focus, 120),
    short: clampMinutes(el.shortMin.value, DEFAULT_SETTINGS.short, 60),
    long: clampMinutes(el.longMin.value, DEFAULT_SETTINGS.long, 60),
    sound: el.soundToggle.checked,
    autoStart: el.autoStartToggle.checked,
  };
  closeSettings();
  if (!isRunning()) {
    remainingSeconds = modeDuration(currentMode);
  }
  render();
  saveState();
}

el.startPause.addEventListener("click", () => (isRunning() ? pause() : start()));
el.reset.addEventListener("click", reset);
el.modeButtons.forEach((btn) => {
  btn.addEventListener("click", () => setMode(btn.dataset.mode));
});
el.themeBtn.addEventListener("click", toggleTheme);
el.settingsBtn.addEventListener("click", openSettings);
el.closeSettings.addEventListener("click", closeSettings);
el.saveSettings.addEventListener("click", saveSettings);
el.modal.addEventListener("click", (e) => {
  if (e.target === el.modal) closeSettings();
});
el.taskForm.addEventListener("submit", (e) => {
  e.preventDefault();
  addTask(el.taskInput.value);
  el.taskInput.value = "";
});

document.addEventListener("keydown", (e) => {
  const typing = ["INPUT", "TEXTAREA"].includes(e.target.tagName);
  if (!el.modal.hidden && e.key === "Escape") {
    closeSettings();
    return;
  }
  if (typing) return;

  switch (e.key) {
    case " ":
      e.preventDefault();
      isRunning() ? pause() : start();
      break;
    case "r":
    case "R":
      reset();
      break;
    case "1":
      setMode("focus");
      break;
    case "2":
      setMode("short");
      break;
    case "3":
      setMode("long");
      break;
  }
});

function init() {
  loadState();
  el.body.dataset.mode = currentMode;
  applyTheme();
  renderTasks();
  renderSummary();
  render();
}

init();
