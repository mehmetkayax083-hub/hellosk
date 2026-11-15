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
      weeklyGoal: 30,
      focusMode: false,
      reminder: { enabled: false, time: "09:00" },
      chime: "bell",
    },
    tasks: [],
    activeTaskId: null,
    plan: { date: "", order: [] },
    previousPlan: { date: "", order: [] },
    yesterdayDismissed: null,
    rest: { week: "", credits: 1, days: [] },
    goalCelebratedOn: null,
    reminderSentOn: null,
    timer: { mode: "focus", remaining: 25 * 60, running: false, endTime: null, cycle: 0, tip: "" },
    history: [],
  };

  const PRESETS = {
    classic: { focus: 25, short: 5, long: 15 },
    deep: { focus: 50, short: 10, long: 15 },
    short: { focus: 15, short: 3, long: 10 },
  };

  const PALETTES = ["violet", "ocean", "forest"];
  const CHIMES = ["bell", "soft", "digital"];
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
      if (!state.previousPlan || !Array.isArray(state.previousPlan.order)) {
        state.previousPlan = { date: "", order: [] };
      }
    }
    if (!PALETTES.includes(state.settings.palette)) state.settings.palette = "violet";
    if (!CHIMES.includes(state.settings.chime)) state.settings.chime = "bell";
    state.settings.weeklyGoal = clamp(state.settings.weeklyGoal, 1, 80, 30);
    rollPlan();
    reopenRepeating();
    if (!state.settings.reminder) state.settings.reminder = { enabled: false, time: "09:00" };
    settleRest();
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

  function shiftDay(key, delta) {
    const date = new Date(key + "T12:00:00");
    date.setDate(date.getDate() + delta);
    return todayKey(date);
  }

  function rollPlan() {
    if (!state.plan || !Array.isArray(state.plan.order)) state.plan = { date: "", order: [] };
    if (!state.previousPlan || !Array.isArray(state.previousPlan.order)) {
      state.previousPlan = { date: "", order: [] };
    }
    if (state.plan.date && state.plan.date !== todayKey()) {
      if (state.plan.order.length) {
        state.previousPlan = { date: state.plan.date, order: state.plan.order.slice() };
      }
      state.plan = { date: todayKey(), order: [] };
    } else if (!state.plan.date) {
      state.plan.date = todayKey();
    }
  }

  function copyPreviousPlan() {
    const previous = state.previousPlan;
    if (!previous || !previous.order.length) return { ok: false, error: "Dünden aktarılacak plan yok." };
    const open = previous.order.filter((id) =>
      state.tasks.some((task) => task.id === id && !task.completed && !task.archived)
    );
    if (!open.length) return { ok: false, error: "Dünün planında açık görev kalmadı." };
    state.plan = { date: todayKey(), order: open };
    if (!open.includes(state.activeTaskId)) state.activeTaskId = open[0];
    commit();
    return { ok: true };
  }

  function dismissYesterday() {
    state.yesterdayDismissed = todayKey();
    save();
  }

  function reopenRepeating() {
    const today = todayKey();
    state.tasks.forEach((task) => {
      if (!task || task.repeat !== "daily" || task.archived) return;
      if (task.repeatDay === today) return;
      task.completed = false;
      task.donePomodoros = 0;
      task.repeatDay = today;
    });
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
      archived: Boolean(task.archived),
      createdAt: Number(task.createdAt) || Date.now(),
      repeat: task.repeat === "daily" ? "daily" : null,
      repeatDay: typeof task.repeatDay === "string" ? task.repeatDay : null,
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
      previousPlan: state.previousPlan,
      yesterdayDismissed: state.yesterdayDismissed,
      goalCelebratedOn: state.goalCelebratedOn,
      reminderSentOn: state.reminderSentOn,
      rest: state.rest,
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
    next.previousPlan = {
      date: typeof data.previousPlan?.date === "string" ? data.previousPlan.date : "",
      order: Array.isArray(data.previousPlan?.order)
        ? data.previousPlan.order.filter((id) => typeof id === "string")
        : [],
    };
    next.yesterdayDismissed = typeof data.yesterdayDismissed === "string" ? data.yesterdayDismissed : null;
    if (!CHIMES.includes(next.settings.chime)) next.settings.chime = "bell";
    next.goalCelebratedOn = typeof data.goalCelebratedOn === "string" ? data.goalCelebratedOn : null;
    next.reminderSentOn = typeof data.reminderSentOn === "string" ? data.reminderSentOn : null;
    next.rest = {
      week: typeof data.rest?.week === "string" ? data.rest.week : "",
      credits: clamp(data.rest && data.rest.credits, 0, 2, 1),
      days: Array.isArray(data.rest?.days) ? data.rest.days.filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day)) : [],
    };

    const modes = ["focus", "short", "long"];
    const mode = data.timer && modes.includes(data.timer.mode) ? data.timer.mode : "focus";
    next.timer.mode = mode;
    next.timer.cycle = clamp(data.timer && data.timer.cycle, 0, 99, 0);
    next.timer.running = false;
    next.timer.endTime = null;
    const remaining = Number(data.timer && data.timer.remaining);
    next.timer.remaining = Number.isFinite(remaining) && remaining > 0 ? remaining : next.settings.durations[mode] * 60;

    state = next;
    rollPlan();
    reopenRepeating();
    settleRest();
    save();
    bus.emit("change");
    if (FF.app && FF.app.applyTheme) FF.app.applyTheme();
    return { ok: true };
  }

  function weekStart(key) {
    const date = new Date(key + "T12:00:00");
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    return todayKey(date);
  }

  /* Haftada bir izin. Kullanılmazsa bir sonraki haftaya kalır, en fazla 2. */
  function settleRest() {
    if (!state.rest || !Array.isArray(state.rest.days)) state.rest = { week: "", credits: 1, days: [] };
    state.rest.days = state.rest.days.filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day));
    state.rest.credits = clamp(state.rest.credits, 0, 2, 1);
    const week = weekStart(todayKey());
    if (state.rest.week === week) return;
    const previous = state.rest.week;
    const used = previous && state.rest.days.some((day) => weekStart(day) === previous);
    if (!previous) state.rest.credits = Math.max(1, state.rest.credits);
    else if (!used && state.rest.credits > 0) state.rest.credits = 2;
    else state.rest.credits = 1;
    state.rest.week = week;
  }

  function toggleRest() {
    settleRest();
    const today = todayKey();
    if (state.rest.days.includes(today)) {
      state.rest.days = state.rest.days.filter((day) => day !== today);
      state.rest.credits = Math.min(2, state.rest.credits + 1);
      commit();
      return { ok: true };
    }
    if (state.history.some((item) => item.date === today)) {
      return { ok: false, error: "Bugün odaklanma var. İzin, çalışılmayan gün içindir." };
    }
    if (state.rest.credits < 1) return { ok: false, error: "Bu hafta izin hakkın kalmadı." };
    state.rest.days.push(today);
    state.rest.credits -= 1;
    commit();
    return { ok: true };
  }

  function clearRestToday() {
    const today = todayKey();
    if (!state.rest || !state.rest.days.includes(today)) return;
    state.rest.days = state.rest.days.filter((day) => day !== today);
    state.rest.credits = Math.min(2, state.rest.credits + 1);
  }

  function resetAll() {
    state = clone(DEFAULTS);
    state.plan = { date: todayKey(), order: [] };
    settleRest();
    save();
  }

  FF.store = {
    get state() {
      return state;
    },
    DEFAULTS,
    MOTIVATIONS,
    PALETTES,
    PRESETS,
    CHIMES,
    HISTORY_CAP,
    load,
    save,
    commit,
    resetAll,
    exportData,
    importData,
    settleRest,
    toggleRest,
    clearRestToday,
    weekStart,
    shiftDay,
    rollPlan,
    reopenRepeating,
    copyPreviousPlan,
    dismissYesterday,
    modeSeconds,
    todayKey,
    clone,
  };
  FF.bus = bus;
})();
