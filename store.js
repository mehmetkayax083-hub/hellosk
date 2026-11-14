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
      dailyGoal: 8,
      focusMode: false,
    },
    tasks: [],
    activeTaskId: null,
    timer: { mode: "focus", remaining: 25 * 60, running: false, endTime: null, cycle: 0 },
    history: [],
  };

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
    }
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

  function resetAll() {
    state = clone(DEFAULTS);
    save();
  }

  FF.store = {
    get state() {
      return state;
    },
    DEFAULTS,
    MOTIVATIONS,
    load,
    save,
    commit,
    resetAll,
    modeSeconds,
    todayKey,
    clone,
  };
  FF.bus = bus;
})();
