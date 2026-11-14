/* Focus Flow — görev yönetimi. */
(function () {
  "use strict";

  const FF = (window.FF = window.FF || {});
  const PRIO = { high: { label: "Yüksek", weight: 0 }, medium: { label: "Orta", weight: 1 }, low: { label: "Düşük", weight: 2 } };

  let dom = {};

  function cache() {
    dom = {
      form: document.getElementById("taskForm"),
      input: document.getElementById("taskInput"),
      priority: document.getElementById("taskPriority"),
      target: document.getElementById("taskTarget"),
      list: document.getElementById("taskList"),
      empty: document.getElementById("taskEmpty"),
    };
  }

  function sorted() {
    return FF.store.state.tasks.slice().sort((a, b) => {
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
    if (task.completed && FF.store.state.activeTaskId === id) {
      const nextActive = FF.store.state.tasks.find((x) => !x.completed);
      FF.store.state.activeTaskId = nextActive ? nextActive.id : null;
    }
    FF.store.commit();
  }

  function remove(id) {
    const s = FF.store.state;
    s.tasks = s.tasks.filter((x) => x.id !== id);
    if (s.activeTaskId === id) {
      const nextActive = s.tasks.find((x) => !x.completed);
      s.activeTaskId = nextActive ? nextActive.id : null;
    }
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
    dom.empty.hidden = items.length > 0;
    dom.list.innerHTML = "";

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
        const focusBtn = document.createElement("button");
        focusBtn.className = "task-focus";
        focusBtn.type = "button";
        focusBtn.textContent = task.id === s.activeTaskId ? "Aktif" : "Odaklan";
        focusBtn.disabled = task.id === s.activeTaskId;
        focusBtn.addEventListener("click", () => setActive(task.id));
        actions.appendChild(focusBtn);
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
    render();
    FF.bus.on("change", render);
  }

  FF.tasks = { init, render, add, remove, toggleComplete, setActive };
})();
