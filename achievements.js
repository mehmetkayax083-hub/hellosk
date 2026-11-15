/* Focus Flow — XP, seviye ve rozetler. Hepsi gerçek oturumlardan hesaplanır. */
(function () {
  "use strict";

  const FF = (window.FF = window.FF || {});
  const STEP = 120;
  let dom = {};

  const BADGES = [
    { id: "first", title: "İlk pomodoro", text: "Bir odak oturumunu bitir.", test: (ctx) => ctx.count >= 1 },
    { id: "five", title: "5 pomodoro", text: "5 odak oturumu biriktir.", test: (ctx) => ctx.count >= 5 },
    { id: "hours", title: "10 saat odak", text: "Toplam 600 dakika biriktir.", test: (ctx) => ctx.minutes >= 600 },
    { id: "week", title: "7 gün seri", text: "7 gün boyunca seriyi koru.", test: (ctx) => ctx.streak >= 7 },
    { id: "month", title: "30 gün seri", text: "30 gün boyunca seriyi koru.", test: (ctx) => ctx.streak >= 30 },
    { id: "goal", title: "Günlük hedef", text: "Bir günde günlük hedefi doldur.", test: (ctx) => ctx.goalHit },
  ];

  function cache() {
    dom = {
      title: document.getElementById("levelTitle"),
      xp: document.getElementById("levelXp"),
      bar: document.getElementById("levelBar"),
      hint: document.getElementById("levelHint"),
      grid: document.getElementById("badgeGrid"),
    };
  }

  function minutesOf(history) {
    return history.reduce((sum, item) => sum + item.minutes, 0);
  }

  function context() {
    const history = FF.store.state.history;
    const byDay = {};
    history.forEach((item) => {
      byDay[item.date] = (byDay[item.date] || 0) + 1;
    });
    const goal = FF.store.state.settings.dailyGoal || 8;
    const longest = FF.stats.longestStreak ? FF.stats.longestStreak() : FF.stats.currentStreak();
    return {
      count: history.length,
      minutes: minutesOf(history),
      streak: Math.max(FF.stats.currentStreak(), longest),
      goalHit: Object.values(byDay).some((count) => count >= goal),
    };
  }

  function levelFrom(xp) {
    return Math.floor(xp / STEP) + 1;
  }

  function render() {
    const ctx = context();
    const xp = ctx.minutes;
    const level = levelFrom(xp);
    const into = xp % STEP;
    dom.title.textContent = `Seviye ${level}`;
    dom.xp.textContent = `${xp} XP`;
    dom.bar.style.width = `${Math.round((into / STEP) * 100)}%`;
    dom.hint.textContent = `Sonraki seviye için ${STEP - into} dakika. Bir dakika, bir XP.`;
    dom.grid.innerHTML = BADGES.map((badge) => {
      const earned = badge.test(ctx);
      return (
        `<article class="badge${earned ? " earned" : ""}">` +
        `<h3>${badge.title}</h3>` +
        `<p>${badge.text}</p>` +
        `<span>${earned ? "Açıldı" : "Kilitli"}</span>` +
        `</article>`
      );
    }).join("");
  }

  function noteLevel() {
    const level = levelFrom(minutesOf(FF.store.state.history));
    if (!FF.store.state.levelSeen) {
      FF.store.state.levelSeen = level;
      FF.store.save();
      return;
    }
    if (level > FF.store.state.levelSeen) {
      FF.store.state.levelSeen = level;
      FF.store.save();
      if (FF.app) FF.app.toast(`Seviye ${level}.`);
    }
  }

  function init() {
    cache();
    noteLevel();
    render();
    FF.bus.on("change", () => {
      noteLevel();
      render();
    });
  }

  FF.achievements = { init, render, levelFrom, noteLevel };
})();
