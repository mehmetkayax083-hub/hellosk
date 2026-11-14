const MODES = {
  focus: { label: "Odaklanma zamanı", minutes: 25 },
  short: { label: "Kısa mola zamanı", minutes: 5 },
  long: { label: "Uzun mola zamanı", minutes: 15 },
};

const timerEl = document.getElementById("timer");
const statusEl = document.getElementById("status");
const startPauseBtn = document.getElementById("startPauseBtn");
const resetBtn = document.getElementById("resetBtn");
const modeButtons = document.querySelectorAll(".mode-btn");

let currentMode = "focus";
let remainingSeconds = MODES.focus.minutes * 60;
let endTime = null;
let intervalId = null;
let audioCtx = null;

function formatTime(totalSeconds) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function render() {
  const time = formatTime(remainingSeconds);
  timerEl.textContent = time;
  document.title = `${time} · ${MODES[currentMode].label}`;
  startPauseBtn.textContent = intervalId ? "Duraklat" : "Başlat";
}

function tick() {
  // Wall-clock based so the countdown stays accurate when the tab is throttled.
  remainingSeconds = Math.max(0, Math.round((endTime - Date.now()) / 1000));
  render();

  if (remainingSeconds === 0) {
    finish();
  }
}

function start() {
  if (intervalId) return;
  unlockAudio();
  endTime = Date.now() + remainingSeconds * 1000;
  intervalId = setInterval(tick, 250);
  render();
}

function pause() {
  clearInterval(intervalId);
  intervalId = null;
  render();
}

function reset() {
  pause();
  remainingSeconds = MODES[currentMode].minutes * 60;
  render();
}

function setMode(mode) {
  currentMode = mode;
  document.body.dataset.mode = mode;
  statusEl.textContent = MODES[mode].label;

  modeButtons.forEach((btn) => {
    const isActive = btn.dataset.mode === mode;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", String(isActive));
  });

  reset();
}

function finish() {
  pause();
  playAlarm();
  setMode(currentMode === "focus" ? "short" : "focus");
}

// Browsers only allow audio after a user gesture, so the context is created on "Start".
function unlockAudio() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
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

startPauseBtn.addEventListener("click", () => (intervalId ? pause() : start()));
resetBtn.addEventListener("click", reset);
modeButtons.forEach((btn) => {
  btn.addEventListener("click", () => setMode(btn.dataset.mode));
});

render();
