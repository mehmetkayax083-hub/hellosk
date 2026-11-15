/* Focus Flow — merkezi durum, kalıcılık ve basit olay yolu. */
(function () {
  "use strict";

  const FF = (window.FF = window.FF || {});
  const STORAGE_KEY = "focusflow.v1";

  const DEFAULTS = {
    settings: {
      durations: { focus: 25, short: 5, long: 15 },
      longBreakInterval: 4,
      autoStartBreaks: false,
      autoStartPomodoros: false,
      sound: true,
      volume: 0.6,
      notifications: true,
      ambient: "none",
      ambientVolume: 0.4,
      theme: "dark",
      palette: "violet",
      dailyGoal: 8,
      focusMode: false,
    },
    tasks: [],
    activeTaskId: null,
    plan: { date: "", order: [] },
    goalCelebratedOn: null,
    timer: { mode: "focus", remaining: 25 * 60, running: false, endTime: null, cycle: 0 },
    history: [],
  };

  const PALETTES = ["violet", "ocean", "forest"];
  const HISTORY_CAP = 4000;

  const MOTIVATIONS = [
    "Küçük adımlar büyük sonuçlar doğurur.",
    "Bugünün odağı, yarının başarısıdır.",
    "Tek bir pomodoro bile ivme yaratır.",
    "Dağınık zihin değil, net bir hedef.",
    "Mükemmeli bekleme; başla ve ilerle.",
    "Derin çalışma, sığ meşguliyeti yener.",
    "Dikkatin en değerli para birimindir.",
    "Önce en zor işi, sonra gerisi akar.",
    "Bir seferde tek iş, tam odak.",
    "Mola da işin bir parçasıdır; dinlen ve dön.",
    "Süreklilik, yoğunluktan güçlüdür.",
    "Şimdi başlarsan, sonra teşekkür edersin.",
  ];

  function deepMerge(base, extra) {
    const out = Array.isArray(base) ? base.slice() : { ...base };
    if (!extra || typeof extra !== "object") return out;
    for (const key of Object.keys(extra)) {
      const bv = base ? base[key] : undefined;
      const ev = extra[key];
      if (bv && ev && typeof bv === "object" && typeof ev === "object" && !Array.isArray(bv)) {
        out[key] = deepMerge(bv, ev);
      } else if (ev !== undefined) {
        out[key] = ev;
      }
    }
    return out;
  }

  let state = clone(DEFAULTS);

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function load() {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch {
      saved = null;
    }
    if (saved && typeof saved === "object") {
      state = deepMerge(clone(DEFAULTS), saved);
      state.settings = deepMerge(clone(DEFAULTS.settings), saved.settings || {});
      state.tasks = Array.isArray(saved.tasks) ? saved.tasks : [];
      state.history = Array.isArray(saved.history) ? saved.history : [];
      if (!state.plan || !Array.isArray(state.plan.order)) state.plan = { date: "", order: [] };
    }
    if (!PALETTES.includes(state.settings.palette)) state.settings.palette = "violet";
    if (!state.plan || state.plan.date !== todayKey()) state.plan = { date: todayKey(), order: [] };
    // Çalışır durumdayken sayfa kapanmışsa: geçen süreyi düş.
    const t = state.timer;
    if (t.running && t.endTime) {
      t.remaining = Math.max(0, Math.round((t.endTime - Date.now()) / 1000));
      t.running = false;
      t.endTime = null;
    }
    if (!Number.isFinite(t.remaining) || t.remaining <= 0) {
      t.remaining = modeSeconds(t.mode);
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* depolama kullanılamıyor olabilir */
    }
  }

  function modeSeconds(mode) {
    return state.settings.durations[mode] * 60;
  }

  function todayKey(d) {
    const date = d ? new Date(d) : new Date();
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 10);
  }

  /* Basit olay yolu: değişiklik bildirimleri için. */
  const listeners = {};
  const bus = {
    on(event, fn) {
      (listeners[event] = listeners[event] || []).push(fn);
    },
    emit(event, data) {
      (listeners[event] || []).forEach((fn) => fn(data));
    },
  };

  /* Durum değişince: kaydet ve "change" yayınla. */
  function commit() {
    save();
    bus.emit("change");
  }

  function clamp(value, min, max, fallback) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(Math.max(n, min), max);
  }

  function cleanTask(task) {
    if (!task || typeof task.text !== "string" || !task.text.trim()) return null;
    return {
      id: typeof task.id === "string" && task.id ? task.id : "t" + Date.now(),
      text: task.text.trim().slice(0, 100),
      priority: ["high", "medium", "low"].includes(task.priority) ? task.priority : "medium",
      targetPomodoros: clamp(task.targetPomodoros, 1, 20, 1),
      donePomodoros: Math.max(0, Math.round(Number(task.donePomodoros) || 0)),
      completed: Boolean(task.completed),
      createdAt: Number(task.createdAt) || Date.now(),
    };
  }

  function cleanSession(item) {
    if (!item || typeof item.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) return null;
    return {
      ts: Number(item.ts) || Date.now(),
      date: item.date,
      mode: "focus",
      minutes: clamp(item.minutes, 1, 180, 25),
      taskId: typeof item.taskId === "string" ? item.taskId : null,
      note: typeof item.note === "string" ? item.note.trim().slice(0, 140) : "",
    };
  }

  function exportData() {
    const timer = state.timer;
    return {
      app: "focus-flow",
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: state.settings,
      tasks: state.tasks,
      activeTaskId: state.activeTaskId,
      plan: state.plan,
      goalCelebratedOn: state.goalCelebratedOn,
      timer: { mode: timer.mode, remaining: timer.remaining, cycle: timer.cycle },
      history: state.history,
    };
  }

  function importData(data) {
    if (!data || data.app !== "focus-flow" || typeof data.settings !== "object" || data.settings === null) {
      return { ok: false, error: "Bu dosya Focus Flow yedeği değil." };
    }
    if (FF.timer && FF.timer.halt) FF.timer.halt();

    const next = clone(DEFAULTS);
    next.settings = deepMerge(clone(DEFAULTS.settings), data.settings);
    if (!PALETTES.includes(next.settings.palette)) next.settings.palette = "violet";
    next.tasks = Array.isArray(data.tasks) ? data.tasks.map(cleanTask).filter(Boolean) : [];
    next.history = Array.isArray(data.history)
      ? data.history.map(cleanSession).filter(Boolean).slice(-HISTORY_CAP)
      : [];
    next.activeTaskId = next.tasks.some((task) => task.id === data.activeTaskId) ? data.activeTaskId : null;
    const order = data.plan && Array.isArray(data.plan.order) ? data.plan.order.filter((id) => typeof id === "string") : [];
    next.plan = {
      date: typeof data.plan?.date === "string" ? data.plan.date : todayKey(),
      order,
    };
    if (next.plan.date !== todayKey()) next.plan = { date: todayKey(), order: [] };
    next.goalCelebratedOn = typeof data.goalCelebratedOn === "string" ? data.goalCelebratedOn : null;

    const modes = ["focus", "short", "long"];
    const mode = data.timer && modes.includes(data.timer.mode) ? data.timer.mode : "focus";
    next.timer.mode = mode;
    next.timer.cycle = clamp(data.timer && data.timer.cycle, 0, 99, 0);
    next.timer.running = false;
    next.timer.endTime = null;
    const remaining = Number(data.timer && data.timer.remaining);
    next.timer.remaining = Number.isFinite(remaining) && remaining > 0 ? remaining : next.settings.durations[mode] * 60;

    state = next;
    save();
    bus.emit("change");
    if (FF.app && FF.app.applyTheme) FF.app.applyTheme();
    return { ok: true };
  }

  function resetAll() {
    state = clone(DEFAULTS);
    state.plan = { date: todayKey(), order: [] };
    save();
  }

  FF.store = {
    get state() {
      return state;
    },
    DEFAULTS,
    MOTIVATIONS,
    PALETTES,
    HISTORY_CAP,
    load,
    save,
    commit,
    resetAll,
    exportData,
    importData,
    modeSeconds,
    todayKey,
    clone,
  };
  FF.bus = bus;
})();
