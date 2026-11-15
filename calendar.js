/* Focus Flow — ay, hafta ve gün takvimi. Veriler geçmiş ve teslim tarihlerinden gelir. */
(function () {
  "use strict";

  const FF = (window.FF = window.FF || {});
  const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
  const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

  let dom = {};
  let mode = "month";
  let cursor = FF.store ? FF.store.todayKey() : "";
  let selected = null;

  function cache() {
    dom = {
      title: document.getElementById("calTitle"),
      prev: document.getElementById("calPrev"),
      next: document.getElementById("calNext"),
      modes: document.querySelectorAll("[data-cal]"),
      body: document.getElementById("calBody"),
      detail: document.getElementById("calDetail"),
      detailTitle: document.getElementById("calDetailTitle"),
      detailStats: document.getElementById("calDetailStats"),
      tasks: document.getElementById("calTasks"),
      sessions: document.getElementById("calSessions"),
    };
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function monthKey(key) {
    return key.slice(0, 7);
  }

  function shiftMonth(key, delta) {
    const date = new Date(key.slice(0, 7) + "-01T12:00:00");
    date.setMonth(date.getMonth() + delta);
    return FF.store.todayKey(date);
  }

  function heat(count) {
    if (count <= 0) return 0;
    if (count === 1) return 1;
    if (count <= 3) return 2;
    if (count <= 6) return 3;
    return 4;
  }

  function dayStats(key) {
    const sessions = FF.store.state.history.filter((item) => item.date === key);
    const tasks = FF.store.state.tasks.filter((task) => task.dueDate === key && !task.archived);
    const minutes = sessions.reduce((sum, item) => sum + item.minutes, 0);
    return { sessions, tasks, minutes };
  }

  function showDetail(key) {
    selected = key;
    const info = dayStats(key);
    const date = new Date(key + "T12:00:00");
    dom.detail.hidden = false;
    dom.detailTitle.textContent = `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
    dom.detailStats.textContent = info.sessions.length
      ? `${info.sessions.length} pomodoro · ${info.minutes} dk`
      : "Bu gün tamamlanmış oturum yok.";
    dom.tasks.innerHTML = info.tasks
      .map((task) => `<li>${escapeHtml(task.text)} <span>${task.completed ? "Tamam" : "Açık"}</span></li>`)
      .join("");
    dom.sessions.innerHTML = info.sessions
      .slice()
      .reverse()
      .map((item) => {
        const task = FF.store.state.tasks.find((entry) => entry.id === item.taskId);
        const when = new Date(item.ts);
        const time = `${String(when.getHours()).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")}`;
        return `<li class="history-item"><span class="hist-dot"></span><span class="hist-main">${time} · ${item.minutes} dk${task ? ` · ${escapeHtml(task.text)}` : ""}</span></li>`;
      })
      .join("");
  }

  function cell(key, label) {
    const info = dayStats(key);
    const today = key === FF.store.todayKey();
    const level = heat(info.sessions.length);
    return (
      `<button type="button" class="cal-cell${level ? " lv" + level : ""}${today ? " today" : ""}${key === selected ? " selected" : ""}" data-date="${key}">` +
      `<span class="cal-num">${label}</span>` +
      `<span class="cal-meta">${info.minutes ? info.minutes + " dk" : ""}</span>` +
      (info.tasks.length ? `<span class="cal-dot" aria-hidden="true"></span>` : "") +
      `</button>`
    );
  }

  function renderMonth() {
    const today = cursor || FF.store.todayKey();
    const start = new Date(monthKey(today) + "-01T12:00:00");
    dom.title.textContent = `${MONTHS[start.getMonth()]} ${start.getFullYear()}`;
    const lead = (start.getDay() + 6) % 7;
    let html = `<div class="cal-weekdays">${WEEKDAYS.map((day) => `<span>${day}</span>`).join("")}</div><div class="cal-grid">`;
    for (let i = 0; i < lead; i++) html += `<span class="cal-empty"></span>`;
    const days = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
    for (let day = 1; day <= days; day++) {
      const key = `${monthKey(today)}-${String(day).padStart(2, "0")}`;
      html += cell(key, day);
    }
    html += "</div>";
    dom.body.innerHTML = html;
  }

  function renderWeek() {
    const start = FF.store.weekStart(cursor || FF.store.todayKey());
    const end = FF.store.shiftDay(start, 6);
    dom.title.textContent = `${start.slice(8)}–${end.slice(8)} ${MONTHS[Number(start.slice(5, 7)) - 1]}`;
    let html = `<div class="cal-week">`;
    for (let i = 0; i < 7; i++) {
      const key = FF.store.shiftDay(start, i);
      html += cell(key, `${WEEKDAYS[i]} ${Number(key.slice(8))}`);
    }
    html += "</div>";
    dom.body.innerHTML = html;
  }

  function renderDay() {
    const key = cursor || FF.store.todayKey();
    const date = new Date(key + "T12:00:00");
    dom.title.textContent = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
    dom.body.innerHTML = `<div class="cal-week">${cell(key, "Seçili gün")}</div>`;
    showDetail(key);
  }

  function render() {
    if (!cursor) cursor = FF.store.todayKey();
    dom.modes.forEach((btn) => btn.classList.toggle("active", btn.dataset.cal === mode));
    if (mode === "week") renderWeek();
    else if (mode === "day") renderDay();
    else renderMonth();
    if (selected && mode !== "day") showDetail(selected);
  }

  function move(delta) {
    if (mode === "month") cursor = shiftMonth(cursor || FF.store.todayKey(), delta);
    else if (mode === "week") cursor = FF.store.shiftDay(FF.store.weekStart(cursor || FF.store.todayKey()), delta * 7);
    else cursor = FF.store.shiftDay(cursor || FF.store.todayKey(), delta);
    render();
  }

  function init() {
    cache();
    cursor = FF.store.todayKey();
    dom.prev.addEventListener("click", () => move(-1));
    dom.next.addEventListener("click", () => move(1));
    dom.modes.forEach((btn) => {
      btn.addEventListener("click", () => {
        mode = btn.dataset.cal;
        render();
      });
    });
    dom.body.addEventListener("click", (event) => {
      const cellBtn = event.target.closest("[data-date]");
      if (!cellBtn) return;
      cursor = cellBtn.dataset.date;
      showDetail(cellBtn.dataset.date);
      render();
    });
    render();
    FF.bus.on("change", render);
  }

  FF.calendar = { init, render };
})();
