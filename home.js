/* Focus Flow — ana sayfa: özet, plan ve hızlı ekleme. Sayaç burada yok. */
(function () {
  "use strict";

  const FF = (window.FF = window.FF || {});
  let dom = {};
  let clock = null;

  function cache() {
    dom = {
      greeting: document.getElementById("homeGreeting"),
      date: document.getElementById("homeDate"),
      min: document.getElementById("homeMin"),
      pomo: document.getElementById("homePomo"),
      done: document.getElementById("homeDone"),
      streak: document.getElementById("homeStreak"),
      goalText: document.getElementById("homeGoalText"),
      goalBar: document.getElementById("homeGoalBar"),
      status: document.getElementById("homeTimerStatus"),
      go: document.getElementById("goTimer"),
      form: document.getElementById("homeTaskForm"),
      input: document.getElementById("homeTaskInput"),
      today: document.getElementById("homeToday"),
      todayEmpty: document.getElementById("homeTodayEmpty"),
      upcoming: document.getElementById("homeUpcoming"),
      upcomingEmpty: document.getElementById("homeUpcomingEmpty"),
      week: document.getElementById("homeWeek"),
      note: document.getElementById("homeNote"),
      recent: document.getElementById("homeRecent"),
      recentEmpty: document.getElementById("homeRecentEmpty"),
    };
  }

  function greeting() {
    const hour = new Date().getHours();
    const hello = hour < 6 ? "İyi geceler" : hour < 12 ? "Günaydın" : hour < 18 ? "İyi günler" : "İyi akşamlar";
    const name = (FF.store.state.settings.displayName || "").trim();
    return name ? `${hello}, ${name}` : hello;
  }

  function fmt(total) {
    const m = String(Math.floor(total / 60)).padStart(2, "0");
    const s = String(total % 60).padStart(2, "0");
    return `${m}:${s}`;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function insight(todayCount, goal) {
    const state = FF.store.state;
    const active = state.tasks.find((task) => task.id === state.activeTaskId && !task.completed && !task.archived);
    if (todayCount >= goal) return "Günlük hedef tamam. İstersen plandaki sıradaki işe geçebilirsin.";
    if (active) {
      const left = Math.max(0, active.targetPomodoros - active.donePomodoros);
      return left
        ? `${active.text} için ${left} pomodoro kaldı.`
        : `${active.text} hedefini doldurdu. Sıradaki göreve geçebilirsin.`;
    }
    return `Hedefe ${goal - todayCount} pomodoro kaldı.`;
  }

  function render() {
    const state = FF.store.state;
    const today = FF.store.todayKey();
    const sessions = state.history.filter((item) => item.date === today);
    const pomodoros = sessions.filter((item) => item.mode !== "free");
    const minutes = sessions.reduce((sum, item) => sum + item.minutes, 0);
    const goal = state.settings.dailyGoal || 8;
    const done = state.tasks.filter((task) => task.completedOn === today).length;
    dom.greeting.textContent = greeting();
    dom.date.textContent = new Date().toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" });
    dom.min.textContent = minutes;
    dom.pomo.textContent = pomodoros.length;
    dom.done.textContent = done;
    dom.streak.textContent = FF.stats.currentStreak();
    dom.goalText.textContent = `${pomodoros.length}/${goal}`;
    dom.goalBar.style.width = `${Math.min(100, Math.round((pomodoros.length / goal) * 100))}%`;

    const timer = state.timer;
    const label = timer.mode === "short" ? "Kısa mola" : timer.mode === "long" ? "Uzun mola" : "Odak";
    dom.go.textContent = timer.running ? "Sayaca dön" : "Sayacı aç";

    const order = state.plan && state.plan.date === today ? state.plan.order : [];
    const todayTasks = order
      .map((id) => state.tasks.find((task) => task.id === id))
      .filter((task) => task && !task.archived);
    dom.today.innerHTML = todayTasks
      .map((task) => `<li>${escapeHtml(task.text)} <span>${task.donePomodoros}/${task.targetPomodoros}</span></li>`)
      .join("");
    dom.todayEmpty.hidden = todayTasks.length > 0;

    const upcoming = state.tasks
      .filter((task) => task.dueDate && task.dueDate >= today && !task.completed && !task.archived)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 5);
    dom.upcoming.innerHTML = upcoming
      .map((task) => `<li>${escapeHtml(task.text)} <span>${task.dueDate}</span></li>`)
      .join("");
    dom.upcomingEmpty.hidden = upcoming.length > 0;

    const start = FF.store.weekStart(today);
    const weekSessions = state.history.filter((item) => item.date >= start && item.date <= today);
    const weekMinutes = weekSessions.reduce((sum, item) => sum + item.minutes, 0);
    const weekPomos = weekSessions.filter((item) => item.mode !== "free").length;
    dom.week.textContent = `${weekPomos}/${state.settings.weeklyGoal || 30} pomodoro · ${weekMinutes} dk`;
    dom.note.textContent = insight(pomodoros.length, goal);
    const shown = timer.mode === "free" ? timer.elapsed || 0 : timer.remaining;
    const modeLabel = timer.mode === "free" ? "Serbest" : label;
    dom.status.textContent = timer.running ? `${modeLabel} · ${fmt(shown)}` : `${fmt(shown)} hazır`;

    const weekday = (new Date().getDay() + 6) % 7;
    const weekPlan = document.getElementById("homeWeekPlan");
    const plannedIds = (state.weekPlan.days[weekday] || []).filter((id) => state.tasks.some((task) => task.id === id && !task.archived));
    weekPlan.innerHTML = (plannedIds.length ? plannedIds : [""])
      .map((id) => {
        const task = state.tasks.find((item) => item.id === id);
        return `<li>${task ? escapeHtml(task.text) : "Bugünün haftalık programı boş."}</li>`;
      })
      .join("");
    const plannedPomos = todayTasks.reduce((sum, task) => sum + task.targetPomodoros, 0);
    const actualPomos = pomodoros.length;
    document.getElementById("homeCompare").textContent = `Plan ${plannedPomos} pomodoro · gerçekleşen ${actualPomos}.`;
    document.getElementById("homeHours").textContent = `Çalışma saatin ${state.settings.studyStart}–${state.settings.studyEnd}.`;
    const notices = state.notices.slice(0, 6);
    document.getElementById("homeNotices").innerHTML = notices.map((item) => `<li>${escapeHtml(item.text)}</li>`).join("");
    document.getElementById("homeNoticesEmpty").hidden = notices.length > 0;
    const who = state.settings.displayName.trim() || "Sen";
    document.getElementById("homeRoom").textContent = `Ortak oda bağlı değil. ${who}, bugün ${minutes} dakika. Yalnızca bu cihazdaki oturum görünür.`;

    const recent = state.history.slice().reverse().slice(0, 5);
    dom.recent.innerHTML = recent
      .map((item) => {
        const task = state.tasks.find((entry) => entry.id === item.taskId);
        return `<li>${item.minutes} dk${task ? ` · ${escapeHtml(task.text)}` : ""} <span>${item.date === today ? "Bugün" : item.date}</span></li>`;
      })
      .join("");
    dom.recentEmpty.hidden = recent.length > 0;
  }

  function init() {
    cache();
    dom.form.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = dom.input.value.trim();
      if (!text) return;
      FF.tasks.add(text, "medium", 1);
      const created = FF.store.state.tasks[FF.store.state.tasks.length - 1];
      if (created && created.text === text) FF.tasks.togglePlan(created.id);
      dom.input.value = "";
    });
    dom.go.addEventListener("click", () => FF.app.navigate("timer"));
    render();
    FF.bus.on("change", render);
    clock = setInterval(() => {
      if (FF.store.state.timer.running) render();
    }, 1000);
  }

  FF.home = { init, render };
})();
