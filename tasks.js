/* Focus Flow — görev yönetimi. */
(function () {
  "use strict";

  const FF = (window.FF = window.FF || {});
  const PRIO = { high: { label: "Yüksek", weight: 0 }, medium: { label: "Orta", weight: 1 }, low: { label: "Düşük", weight: 2 } };

  let dom = {};
  let archiveOpen = false;

  function cache() {
    dom = {
      form: document.getElementById("taskForm"),
      input: document.getElementById("taskInput"),
      priority: document.getElementById("taskPriority"),
      target: document.getElementById("taskTarget"),
      list: document.getElementById("taskList"),
      empty: document.getElementById("taskEmpty"),
      summary: document.getElementById("planSummary"),
      archiveBar: document.getElementById("archiveBar"),
      archiveDone: document.getElementById("archiveDoneBtn"),
      toggleArchive: document.getElementById("toggleArchiveBtn"),
      archiveList: document.getElementById("archiveList"),
    };
  }

  function sorted() {
    return FF.store.state.tasks.filter((task) => !task.archived).slice().sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      const pa = PRIO[a.priority] ? PRIO[a.priority].weight : 1;
      const pb = PRIO[b.priority] ? PRIO[b.priority].weight : 1;
      if (pa !== pb) return pa - pb;
      return a.createdAt - b.createdAt;
    });
  }

  function add(text, priority, target) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const s = FF.store.state;
    const task = {
      id: "t" + Date.now() + Math.floor(Math.random() * 1000),
      text: trimmed,
      priority: PRIO[priority] ? priority : "medium",
      targetPomodoros: Math.min(Math.max(parseInt(target, 10) || 1, 1), 20),
      donePomodoros: 0,
      completed: false,
      archived: false,
      createdAt: Date.now(),
    };
    s.tasks.push(task);
    if (!s.activeTaskId) s.activeTaskId = task.id;
    FF.store.commit();
  }

  function toggleComplete(id) {
    const task = FF.store.state.tasks.find((x) => x.id === id);
    if (!task) return;
    task.completed = !task.completed;
    const s = FF.store.state;
    if (task.completed && s.plan && s.plan.date === FF.store.todayKey()) {
      s.plan.order = s.plan.order.filter((item) => item !== id);
    }
    if (task.completed && s.activeTaskId === id) {
      const nextPlanned = (s.plan && s.plan.order) || [];
      const nextActive =
        s.tasks.find((item) => nextPlanned.includes(item.id) && !item.completed && !item.archived) ||
        s.tasks.find((item) => !item.completed && !item.archived);
      s.activeTaskId = nextActive ? nextActive.id : null;
    }
    FF.store.commit();
  }

  function remove(id) {
    const s = FF.store.state;
    s.tasks = s.tasks.filter((x) => x.id !== id);
    if (s.plan) s.plan.order = s.plan.order.filter((item) => item !== id);
    if (s.activeTaskId === id) {
      const nextActive = s.tasks.find((x) => !x.completed && !x.archived);
      s.activeTaskId = nextActive ? nextActive.id : null;
    }
    FF.store.commit();
  }

  function todayPlan() {
    const plan = FF.store.state.plan;
    if (!plan || plan.date !== FF.store.todayKey()) return [];
    return plan.order;
  }

  function togglePlan(id) {
    const s = FF.store.state;
    const today = FF.store.todayKey();
    if (!s.plan || s.plan.date !== today) s.plan = { date: today, order: [] };
    if (s.plan.order.includes(id)) {
      s.plan.order = s.plan.order.filter((item) => item !== id);
    } else {
      s.plan.order.push(id);
      if (!s.activeTaskId) s.activeTaskId = id;
    }
    FF.store.commit();
  }

  function movePlan(id, direction) {
    const plan = FF.store.state.plan;
    if (!plan) return;
    const index = plan.order.indexOf(id);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= plan.order.length) return;
    const swapped = plan.order[index];
    plan.order[index] = plan.order[next];
    plan.order[next] = swapped;
    FF.store.commit();
  }

  function archiveCompleted() {
    const state = FF.store.state;
    state.tasks.forEach((task) => {
      if (task.completed) task.archived = true;
    });
    if (state.plan) {
      state.plan.order = state.plan.order.filter((id) => {
        const task = state.tasks.find((item) => item.id === id);
        return task && !task.archived && !task.completed;
      });
    }
    FF.store.commit();
  }

  function restore(id) {
    const task = FF.store.state.tasks.find((item) => item.id === id);
    if (!task) return;
    task.archived = false;
    FF.store.commit();
  }

  function setActive(id) {
    const task = FF.store.state.tasks.find((x) => x.id === id);
    if (!task || task.completed) return;
    FF.store.state.activeTaskId = id;
    FF.store.commit();
  }

  function render() {
    const s = FF.store.state;
    const items = sorted();
    const archived = FF.store.state.tasks.filter((task) => task.archived);
    const completedCount = items.filter((task) => task.completed).length;
    dom.empty.hidden = items.length > 0;
    dom.archiveBar.hidden = completedCount === 0 && archived.length === 0;
    dom.archiveDone.hidden = completedCount === 0;
    dom.toggleArchive.hidden = archived.length === 0;
    dom.toggleArchive.textContent = archiveOpen ? "Arşivi gizle" : `Arşiv (${archived.length})`;
    dom.archiveList.hidden = !archiveOpen || archived.length === 0;
    dom.list.innerHTML = "";

    const planned = todayPlan();
    const plannedOpen = planned.filter((id) => items.some((task) => task.id === id && !task.completed));
    if (planned.length) {
      dom.summary.hidden = false;
      dom.summary.textContent = plannedOpen.length
        ? `Bugün ${plannedOpen.length} görev planlandı`
        : "Bugünün planı bitti";
    } else {
      dom.summary.hidden = true;
    }

    items.forEach((task) => {
      const li = document.createElement("li");
      li.className =
        "task-item" +
        (task.completed ? " completed" : "") +
        (task.id === s.activeTaskId && !task.completed ? " active" : "");
      li.dataset.id = task.id;

      const check = document.createElement("button");
      check.className = "task-check";
      check.type = "button";
      check.setAttribute("aria-label", task.completed ? "Tamamlanmadı yap" : "Tamamlandı yap");
      check.addEventListener("click", () => toggleComplete(task.id));

      const main = document.createElement("div");
      main.className = "task-main";

      const title = document.createElement("span");
      title.className = "task-text";
      title.textContent = task.text;

      const meta = document.createElement("div");
      meta.className = "task-meta";
      const badge = document.createElement("span");
      badge.className = "prio prio-" + task.priority;
      badge.textContent = PRIO[task.priority].label;
      const pomo = document.createElement("span");
      pomo.className = "task-pomo";
      pomo.textContent = `${task.donePomodoros}/${task.targetPomodoros} pomodoro`;
      meta.append(badge, pomo);
      main.append(title, meta);

      const actions = document.createElement("div");
      actions.className = "task-actions";

      if (!task.completed) {
        const planBtn = document.createElement("button");
        planBtn.className = "task-plan" + (planned.includes(task.id) ? " on" : "");
        planBtn.type = "button";
        planBtn.textContent = planned.includes(task.id) ? `Planda ${planned.indexOf(task.id) + 1}` : "Bugün";
        planBtn.addEventListener("click", () => togglePlan(task.id));
        actions.appendChild(planBtn);

        if (planned.includes(task.id) && planned.length > 1) {
          const index = planned.indexOf(task.id);
          const up = document.createElement("button");
          up.type = "button";
          up.className = "plan-move";
          up.textContent = "↑";
          up.setAttribute("aria-label", "Planda yukarı taşı");
          up.disabled = index === 0;
          up.addEventListener("click", () => movePlan(task.id, -1));
          const down = document.createElement("button");
          down.type = "button";
          down.className = "plan-move";
          down.textContent = "↓";
          down.setAttribute("aria-label", "Planda aşağı taşı");
          down.disabled = index === planned.length - 1;
          down.addEventListener("click", () => movePlan(task.id, 1));
          actions.append(up, down);
        }

        const focusBtn = document.createElement("button");
        focusBtn.className = "task-focus";
        focusBtn.type = "button";
        focusBtn.textContent = task.id === s.activeTaskId ? "Aktif" : "Odaklan";
        focusBtn.disabled = task.id === s.activeTaskId;
        focusBtn.addEventListener("click", () => setActive(task.id));
        actions.appendChild(focusBtn);
      } else {
        const archiveBtn = document.createElement("button");
        archiveBtn.type = "button";
        archiveBtn.className = "task-focus";
        archiveBtn.textContent = "Arşivle";
        archiveBtn.addEventListener("click", () => {
          task.archived = true;
          FF.store.commit();
        });
        actions.appendChild(archiveBtn);
      }

      const del = document.createElement("button");
      del.className = "task-del";
      del.type = "button";
      del.setAttribute("aria-label", "Görevi sil");
      del.textContent = "×";
      del.addEventListener("click", () => remove(task.id));
      actions.appendChild(del);

      li.append(check, main, actions);
      dom.list.appendChild(li);
    });

    dom.archiveList.innerHTML = "";
    archived.forEach((task) => {
      const li = document.createElement("li");
      li.className = "task-item completed";
      const title = document.createElement("span");
      title.className = "task-text";
      title.textContent = task.text;
      const back = document.createElement("button");
      back.type = "button";
      back.className = "task-focus";
      back.textContent = "Geri al";
      back.addEventListener("click", () => restore(task.id));
      const del = document.createElement("button");
      del.type = "button";
      del.className = "task-del";
      del.textContent = "×";
      del.setAttribute("aria-label", "Görevi sil");
      del.addEventListener("click", () => remove(task.id));
      const actions = document.createElement("div");
      actions.className = "task-actions";
      actions.append(back, del);
      li.append(title, actions);
      dom.archiveList.appendChild(li);
    });
  }

  function init() {
    cache();
    dom.form.addEventListener("submit", (e) => {
      e.preventDefault();
      add(dom.input.value, dom.priority.value, dom.target.value);
      dom.input.value = "";
      dom.target.value = "1";
      dom.input.focus();
    });
    dom.archiveDone.addEventListener("click", archiveCompleted);
    dom.toggleArchive.addEventListener("click", () => {
      archiveOpen = !archiveOpen;
      render();
    });
    render();
    FF.bus.on("change", render);
  }

  FF.tasks = { init, render, add, remove, toggleComplete, setActive, togglePlan, movePlan, archiveCompleted, restore };
})();
