/* Focus Flow — istatistikler, grafikler, seri ve geçmiş. */
(function () {
  "use strict";

  const FF = (window.FF = window.FF || {});
  const GOAL_CIRC = 2 * Math.PI * 34;
  const DAYS = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
  const DAYS_SHORT = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
  const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

  let dom = {};

  function cache() {
    dom = {
      todayMin: document.getElementById("statTodayMin"),
      todayPomo: document.getElementById("statTodayPomo"),
      totalPomo: document.getElementById("statTotalPomo"),
      goalBar: document.getElementById("goalBar"),
      goalText: document.getElementById("goalText"),
      weekChart: document.getElementById("weekChart"),
      weekTotal: document.getElementById("weekTotal"),
      monthMin: document.getElementById("monthMin"),
      monthPomo: document.getElementById("monthPomo"),
      monthDays: document.getElementById("monthDays"),
      bestDay: document.getElementById("bestDay"),
      bestHour: document.getElementById("bestHour"),
      bestStreak: document.getElementById("bestStreak"),
      streakCount: document.getElementById("streakCount"),
      historyList: document.getElementById("historyList"),
      historyEmpty: document.getElementById("historyEmpty"),
      heatmap: document.getElementById("heatmap"),
      yearTotal: document.getElementById("yearTotal"),
      dayDetail: document.getElementById("dayDetail"),
      dayTitle: document.getElementById("dayDetailTitle"),
      dayList: document.getElementById("dayDetailList"),
      dayEmpty: document.getElementById("dayDetailEmpty"),
      dayRest: document.getElementById("dayRest"),
      dayClose: document.getElementById("dayDetailClose"),
      restStatus: document.getElementById("restStatus"),
      restBtn: document.getElementById("restBtn"),
    };
  }

  let selectedDay = null;

  function dateKey(d) {
    const x = new Date(d);
    x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
    return x.toISOString().slice(0, 10);
  }

  function addDays(key, delta) {
    const d = new Date(key + "T00:00:00");
    d.setDate(d.getDate() + delta);
    return dateKey(d);
  }

  function coveredDays() {
    const days = new Set(FF.store.state.history.map((item) => item.date));
    const rest = (FF.store.state.rest && FF.store.state.rest.days) || [];
    rest.forEach((day) => days.add(day));
    return days;
  }

  function computeStreak(dateSet) {
    const today = FF.store.todayKey();
    let cursor = dateSet.has(today) ? today : addDays(today, -1);
    let streak = 0;
    while (dateSet.has(cursor)) {
      streak += 1;
      cursor = addDays(cursor, -1);
    }
    return streak;
  }

  function longestStreak(dateSet) {
    const keys = Array.from(dateSet).sort();
    let best = 0;
    let run = 0;
    let prev = null;
    for (const k of keys) {
      if (prev && addDays(prev, 1) === k) run += 1;
      else run = 1;
      best = Math.max(best, run);
      prev = k;
    }
    return best;
  }

  function heatLevel(count) {
    if (count <= 0) return 0;
    if (count === 1) return 1;
    if (count <= 3) return 2;
    if (count <= 6) return 3;
    return 4;
  }

  function renderHeatmap(history, today) {
    const end = new Date(today + "T00:00:00");
    const sinceMonday = (end.getDay() + 6) % 7;
    const start = new Date(end);
    start.setDate(end.getDate() - sinceMonday - 52 * 7);

    const byDate = {};
    history.forEach((item) => {
      const bucket = byDate[item.date] || (byDate[item.date] = { count: 0, minutes: 0 });
      bucket.count += 1;
      bucket.minutes += item.minutes;
    });

    let html = "";
    let yearMinutes = 0;
    const cursor = new Date(start);
    while (cursor <= end) {
      const key = dateKey(cursor);
      const bucket = byDate[key] || { count: 0, minutes: 0 };
      yearMinutes += bucket.minutes;
      const level = heatLevel(bucket.count);
      const rest = ((FF.store.state.rest && FF.store.state.rest.days) || []).includes(key);
      const label = `${cursor.getDate()} ${MONTHS[cursor.getMonth()]} · ${bucket.count} pomodoro · ${bucket.minutes} dk`;
      html +=
        `<button type="button" class="heat-cell${level ? " l" + level : ""}${key === today ? " today" : ""}${rest ? " rest" : ""}${key === selectedDay ? " selected" : ""}" data-date="${key}" aria-label="${label}"></button>`;
      cursor.setDate(cursor.getDate() + 1);
    }
    dom.heatmap.innerHTML = html;
    if (selectedDay) showDay(selectedDay);
    dom.heatmap.setAttribute("aria-label", `Son bir yıl, ${yearMinutes} dakika odaklanma`);
    dom.yearTotal.textContent = `${yearMinutes} dk`;
  }

  function currentStreak() {
    return computeStreak(coveredDays());
  }

  function render() {
    const s = FF.store.state;
    const history = s.history;
    const today = FF.store.todayKey();

    const todaySessions = history.filter((h) => h.date === today);
    const todayMin = todaySessions.reduce((a, h) => a + h.minutes, 0);
    dom.todayMin.textContent = todayMin;
    dom.todayPomo.textContent = todaySessions.length;
    dom.totalPomo.textContent = history.length;

    // Günlük hedef halkası
    const goal = s.settings.dailyGoal;
    const ratio = goal > 0 ? Math.min(todaySessions.length / goal, 1) : 0;
    dom.goalBar.style.strokeDasharray = String(GOAL_CIRC);
    dom.goalBar.style.strokeDashoffset = String(GOAL_CIRC * (1 - ratio));
    dom.goalText.textContent = `${todaySessions.length}/${goal}`;

    // Son 7 gün
    const week = [];
    for (let i = 6; i >= 0; i--) {
      const key = addDays(today, -i);
      const mins = history.filter((h) => h.date === key).reduce((a, h) => a + h.minutes, 0);
      week.push({ key, mins, dow: new Date(key + "T00:00:00").getDay() });
    }
    const maxMin = Math.max(60, ...week.map((d) => d.mins));
    dom.weekChart.innerHTML = week
      .map((d) => {
        const h = Math.round((d.mins / maxMin) * 100);
        const isToday = d.key === today;
        return (
          `<div class="bar-col${isToday ? " today" : ""}">` +
          `<div class="bar-val">${d.mins || ""}</div>` +
          `<div class="bar" style="height:${Math.max(h, 2)}%"></div>` +
          `<div class="bar-label">${DAYS_SHORT[d.dow]}</div>` +
          `</div>`
        );
      })
      .join("");
    const weekMin = week.reduce((a, d) => a + d.mins, 0);
    dom.weekTotal.textContent = `${weekMin} dk · ${Math.round(weekMin / 60 * 10) / 10} sa`;
    renderHeatmap(history, today);

    // Bu ay
    const month = today.slice(0, 7);
    const monthSessions = history.filter((h) => h.date.slice(0, 7) === month);
    dom.monthMin.textContent = `${monthSessions.reduce((a, h) => a + h.minutes, 0)} dk`;
    dom.monthPomo.textContent = monthSessions.length;
    dom.monthDays.textContent = new Set(monthSessions.map((h) => h.date)).size;

    // En verimli gün/saat
    const byDay = [0, 0, 0, 0, 0, 0, 0];
    const byHour = {};
    history.forEach((h) => {
      byDay[new Date(h.ts).getDay()] += h.minutes;
      const hr = new Date(h.ts).getHours();
      byHour[hr] = (byHour[hr] || 0) + 1;
    });
    const maxDay = Math.max(...byDay);
    dom.bestDay.textContent = maxDay > 0 ? DAYS[byDay.indexOf(maxDay)] : "—";
    const hourEntries = Object.entries(byHour);
    if (hourEntries.length) {
      const bestHr = hourEntries.sort((a, b) => b[1] - a[1])[0][0];
      dom.bestHour.textContent = `${String(bestHr).padStart(2, "0")}:00`;
    } else {
      dom.bestHour.textContent = "—";
    }

    // Seri (izin günleri boşluğu doldurur)
    const dateSet = coveredDays();
    const streak = computeStreak(dateSet);
    dom.streakCount.textContent = streak;
    dom.bestStreak.textContent = `${longestStreak(dateSet)} gün`;
    renderRest();

    // Geçmiş (son 20)
    const recent = history.slice().reverse().slice(0, 20);
    dom.historyEmpty.hidden = recent.length > 0;
    dom.historyList.innerHTML = recent
      .map((h) => {
        const task = s.tasks.find((x) => x.id === h.taskId);
        const d = new Date(h.ts);
        const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        const when = h.date === today ? `Bugün ${time}` : `${h.date} ${time}`;
        const note = h.note ? `<span class="hist-note">${escapeHtml(h.note)}</span>` : "";
        return (
          `<li class="history-item">` +
          `<span class="hist-dot" aria-hidden="true"></span>` +
          `<span class="hist-body">` +
          `<span class="hist-main">${h.minutes} dk odaklanma${task ? ` · ${escapeHtml(task.text)}` : ""}</span>` +
          note +
          `</span>` +
          `<span class="hist-when">${when}</span>` +
          `</li>`
        );
      })
      .join("");
  }

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function formatDay(key) {
    const date = new Date(key + "T12:00:00");
    return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  }

  function showDay(key) {
    selectedDay = key;
    const sessions = FF.store.state.history.filter((item) => item.date === key);
    const rest = ((FF.store.state.rest && FF.store.state.rest.days) || []).includes(key);
    dom.dayDetail.hidden = false;
    dom.dayTitle.textContent = formatDay(key);
    dom.dayRest.hidden = !rest;
    dom.dayEmpty.hidden = sessions.length > 0;
    dom.dayList.innerHTML = sessions
      .slice()
      .reverse()
      .map((item) => {
        const task = FF.store.state.tasks.find((entry) => entry.id === item.taskId);
        const when = new Date(item.ts);
        const time = `${String(when.getHours()).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")}`;
        const note = item.note ? `<span class="hist-note">${escapeHtml(item.note)}</span>` : "";
        return (
          `<li class="history-item">` +
          `<span class="hist-dot" aria-hidden="true"></span>` +
          `<span class="hist-body">` +
          `<span class="hist-main">${time} · ${item.minutes} dk${task ? ` · ${escapeHtml(task.text)}` : ""}</span>` +
          note +
          `</span></li>`
        );
      })
      .join("");
  }

  function closeDay() {
    selectedDay = null;
    dom.dayDetail.hidden = true;
    dom.heatmap.querySelectorAll(".heat-cell.selected").forEach((cell) => cell.classList.remove("selected"));
  }

  function renderRest() {
    const rest = FF.store.state.rest || { credits: 0, days: [] };
    const today = FF.store.todayKey();
    const todayRest = rest.days.includes(today);
    const worked = FF.store.state.history.some((item) => item.date === today);
    if (todayRest) {
      dom.restStatus.textContent = "Bugün izin günü. Serin bozulmaz. Hakkın kullanılmazsa en fazla 2'ye kadar ertesi haftaya kalır.";
      dom.restBtn.textContent = "İzni geri al";
      dom.restBtn.disabled = false;
    } else if (worked) {
      dom.restStatus.textContent = `Bu hafta ${rest.credits} hakkın var. Bugün odaklandığın için izin seçilmez.`;
      dom.restBtn.textContent = "Bugünü izin yap";
      dom.restBtn.disabled = true;
    } else if (rest.credits < 1) {
      dom.restStatus.textContent = "Bu haftanın izni kullanıldı. Yeni haftada bir hak daha gelir.";
      dom.restBtn.textContent = "Hak kalmadı";
      dom.restBtn.disabled = true;
    } else {
      dom.restStatus.textContent = `Bu hafta ${rest.credits} hakkın var. Kullanılmazsa bir sonraki haftaya kalır, en fazla 2.`;
      dom.restBtn.textContent = "Bugünü izin yap";
      dom.restBtn.disabled = false;
    }
  }

  function clearHistory() {
    FF.store.state.history = [];
    FF.store.commit();
  }

  function init() {
    cache();
    const clearBtn = document.getElementById("clearHistoryBtn");
    clearBtn.addEventListener("click", () => {
      if (confirm("Tüm oturum geçmişi silinsin mi?")) clearHistory();
    });
    dom.heatmap.addEventListener("click", (event) => {
      const cell = event.target.closest("[data-date]");
      if (!cell) return;
      showDay(cell.dataset.date);
      dom.heatmap.querySelectorAll(".heat-cell").forEach((item) => {
        item.classList.toggle("selected", item.dataset.date === selectedDay);
      });
    });
    dom.dayClose.addEventListener("click", closeDay);
    dom.restBtn.addEventListener("click", () => {
      const result = FF.store.toggleRest();
      if (!result.ok && FF.app) FF.app.toast(result.error);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && selectedDay) closeDay();
    });
    render();
    FF.bus.on("change", render);
  }

  FF.stats = { init, render, currentStreak, closeDay };
})();
