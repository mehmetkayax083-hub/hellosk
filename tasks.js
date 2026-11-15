/* Focus Flow — görev yönetimi. */
(function () {
  "use strict";

  const FF = (window.FF = window.FF || {});
  const PRIO = { high: { label: "Yüksek", weight: 0 }, medium: { label: "Orta", weight: 1 }, low: { label: "Düşük", weight: 2 } };

  let dom = {};
  let archiveOpen = false;
  let query = "";
  let editingId = null;
  let filterStatus = "all";
  let filterPriority = "all";
  let filterCategory = "";
  let filterDue = "all";

  function cache() {
    dom = {
      form: document.getElementById("taskForm"),
      input: document.getElementById("taskInput"),
      priority: document.getElementById("taskPriority"),
      target: document.getElementById("taskTarget"),
      repeat: document.getElementById("taskRepeat"),
      desc: document.getElementById("taskDesc"),
      due: document.getElementById("taskDue"),
      category: document.getElementById("taskCategory"),
      newCategory: document.getElementById("newCategory"),
      filterStatus: document.getElementById("filterStatus"),
      filterPriority: document.getElementById("filterPriority"),
      filterCategory: document.getElementById("filterCategory"),
      filterDue: document.getElementById("filterDue"),
      list: document.getElementById("taskList"),
      empty: document.getElementById("taskEmpty"),
      summary: document.getElementById("planSummary"),
      copyPlan: document.getElementById("copyPlanBtn"),
      search: document.getElementById("taskSearch"),
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
      repeat: dom.repeat.checked ? "daily" : null,
      repeatDay: dom.repeat.checked ? FF.store.todayKey() : null,
      description: dom.desc.value.trim().slice(0, 280),
      categoryId: categoryFromForm(),
      dueDate: validDate(dom.due.value),
      completedOn: null,
    };
    dom.desc.value = "";
    dom.due.value = "";
    dom.newCategory.value = "";
    s.tasks.push(task);
    if (!s.activeTaskId) s.activeTaskId = task.id;
    dom.repeat.checked = false;
    FF.store.commit();
  }

  function validDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  }

  function categoryFromForm() {
    const named = dom.newCategory.value.trim();
    if (named) return FF.store.addCategory(named);
    return dom.category.value || null;
  }

  function fillCategories(select, selected, emptyLabel) {
    const current = selected === undefined ? select.value : selected;
    select.innerHTML = "";
    const none = document.createElement("option");
    none.value = "";
    none.textContent = emptyLabel || (select === dom.category ? "Kategori yok" : "Tüm kategoriler");
    select.appendChild(none);
    FF.store.state.categories.forEach((cat) => {
      const option = document.createElement("option");
      option.value = cat.id;
      option.textContent = cat.name;
      select.appendChild(option);
    });
    if ([...select.options].some((option) => option.value === current)) select.value = current;
  }

  function update(id, text, priority, target, repeat, desc, due, categoryId) {
    const task = FF.store.state.tasks.find((item) => item.id === id);
    const trimmed = text.trim();
    if (!task || !trimmed) return;
    task.text = trimmed.slice(0, 100);
    task.priority = PRIO[priority] ? priority : "medium";
    task.targetPomodoros = Math.min(Math.max(parseInt(target, 10) || 1, 1), 20);
    if (repeat) {
      if (task.repeat !== "daily") task.repeatDay = FF.store.todayKey();
      task.repeat = "daily";
    } else {
      task.repeat = null;
      task.repeatDay = null;
    }
    task.description = desc.trim().slice(0, 280);
    task.categoryId = categoryId || null;
    task.dueDate = validDate(due);
    editingId = null;
    FF.store.commit();
  }

  function toggleComplete(id) {
    const task = FF.store.state.tasks.find((x) => x.id === id);
    if (!task) return;
    task.completed = !task.completed;
    task.completedOn = task.completed ? FF.store.todayKey() : null;
    if (task.completed && task.repeat === "daily") task.repeatDay = FF.store.todayKey();
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

  function nextInPlan() {
    const order = todayPlan().filter((id) => {
      const task = FF.store.state.tasks.find((item) => item.id === id);
      return task && !task.completed && !task.archived;
    });
    if (!order.length) return;
    const index = order.indexOf(FF.store.state.activeTaskId);
    FF.store.state.activeTaskId = order[(index + 1) % order.length];
    FF.store.commit();
  }

  function canCopyPlan() {
    const previous = FF.store.state.previousPlan;
    if (!previous || !previous.order.length) return false;
    if ((FF.store.state.plan.order || []).length) return false;
    return previous.order.some((id) => {
      const task = FF.store.state.tasks.find((item) => item.id === id);
      return task && !task.completed && !task.archived;
    });
  }

  function setActive(id) {
    const task = FF.store.state.tasks.find((x) => x.id === id);
    if (!task || task.completed) return;
    FF.store.state.activeTaskId = id;
    FF.store.commit();
  }

  function render() {
    const s = FF.store.state;
    const openTasks = sorted();
    fillCategories(dom.category);
    fillCategories(dom.filterCategory, filterCategory);
    const today = FF.store.todayKey();
    const weekStart = FF.store.weekStart(today);
    const weekEnd = FF.store.shiftDay(weekStart, 6);
    const items = openTasks.filter((task) => {
      if (query && !`${task.text} ${task.description || ""}`.toLowerCase().includes(query)) return false;
      if (filterStatus === "open" && task.completed) return false;
      if (filterStatus === "done" && !task.completed) return false;
      if (filterPriority !== "all" && task.priority !== filterPriority) return false;
      if (filterCategory && task.categoryId !== filterCategory) return false;
      if (filterDue === "today" && task.dueDate !== today) return false;
      if (filterDue === "week" && (!task.dueDate || task.dueDate < weekStart || task.dueDate > weekEnd)) return false;
      if (filterDue === "overdue" && (!task.dueDate || task.dueDate >= today || task.completed)) return false;
      return true;
    });
    const archived = FF.store.state.tasks.filter((task) => task.archived);
    const completedCount = openTasks.filter((task) => task.completed).length;
    const hasTasks = FF.store.state.tasks.some((task) => !task.archived);
    dom.empty.hidden = items.length > 0;
    dom.empty.textContent = query && hasTasks ? "Eşleşen görev yok." : "Henüz görev yok. İlk görevini ekleyerek başla.";
    dom.copyPlan.hidden = !canCopyPlan();
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

      if (editingId === task.id) {
        li.appendChild(editForm(task));
        dom.list.appendChild(li);
        return;
      }

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
      if (task.repeat === "daily") {
        const repeat = document.createElement("span");
        repeat.className = "repeat-badge";
        repeat.textContent = "Her gün";
        meta.appendChild(repeat);
      }
      const category = FF.store.state.categories.find((item) => item.id === task.categoryId);
      if (category) {
        const cat = document.createElement("span");
        cat.className = "task-cat";
        cat.textContent = category.name;
        meta.appendChild(cat);
      }
      if (task.dueDate) {
        const due = document.createElement("span");
        due.className = "task-due" + (!task.completed && task.dueDate < FF.store.todayKey() ? " overdue" : "");
        due.textContent = task.dueDate;
        meta.appendChild(due);
      }
      main.append(title, meta);
      if (task.description) {
        const desc = document.createElement("p");
        desc.className = "task-desc";
        desc.textContent = task.description;
        main.appendChild(desc);
      }

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
        actions.appendChild(editButton(task));
      } else {
        actions.appendChild(editButton(task));
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

  function editButton(task) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "task-focus";
    button.textContent = "Düzenle";
    button.addEventListener("click", () => {
      editingId = task.id;
      render();
    });
    return button;
  }

  function editForm(task) {
    const form = document.createElement("form");
    form.className = "task-edit";
    form.autocomplete = "off";

    const name = document.createElement("input");
    name.className = "input edit-title";
    name.type = "text";
    name.maxLength = 100;
    name.value = task.text;
    name.setAttribute("aria-label", "Görev adı");

    const priority = document.createElement("select");
    priority.className = "input";
    priority.setAttribute("aria-label", "Öncelik");
    ["high", "medium", "low"].forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = PRIO[value].label;
      option.selected = task.priority === value;
      priority.appendChild(option);
    });

    const target = document.createElement("input");
    target.className = "input edit-target";
    target.type = "number";
    target.min = "1";
    target.max = "20";
    target.value = String(task.targetPomodoros);
    target.setAttribute("aria-label", "Hedef pomodoro");

    const desc = document.createElement("textarea");
    desc.className = "input edit-desc";
    desc.maxLength = 280;
    desc.rows = 2;
    desc.value = task.description || "";
    desc.setAttribute("aria-label", "Açıklama");

    const due = document.createElement("input");
    due.className = "input";
    due.type = "date";
    due.value = task.dueDate || "";
    due.setAttribute("aria-label", "Son teslim tarihi");

    const category = document.createElement("select");
    category.className = "input";
    category.setAttribute("aria-label", "Kategori");
    fillCategories(category, task.categoryId || "", "Kategori yok");

    const repeatLabel = document.createElement("label");
    repeatLabel.className = "repeat-opt";
    const repeat = document.createElement("input");
    repeat.type = "checkbox";
    repeat.checked = task.repeat === "daily";
    const repeatText = document.createElement("span");
    repeatText.textContent = "Her gün";
    repeatLabel.append(repeat, repeatText);

    const actions = document.createElement("div");
    actions.className = "edit-actions";
    const save = document.createElement("button");
    save.type = "submit";
    save.className = "btn btn-primary";
    save.textContent = "Kaydet";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn btn-line";
    cancel.textContent = "Vazgeç";
    cancel.addEventListener("click", () => {
      editingId = null;
      render();
    });
    actions.append(save, cancel, repeatLabel);

    form.append(name, desc, priority, target, due, category, actions);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      update(task.id, name.value, priority.value, target.value, repeat.checked, desc.value, due.value, category.value);
    });
    return form;
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
    dom.search.addEventListener("input", () => {
      query = dom.search.value.trim().toLowerCase();
      render();
    });
    dom.filterStatus.addEventListener("change", () => {
      filterStatus = dom.filterStatus.value;
      render();
    });
    dom.filterPriority.addEventListener("change", () => {
      filterPriority = dom.filterPriority.value;
      render();
    });
    dom.filterCategory.addEventListener("change", () => {
      filterCategory = dom.filterCategory.value;
      render();
    });
    dom.filterDue.addEventListener("change", () => {
      filterDue = dom.filterDue.value;
      render();
    });
    dom.copyPlan.addEventListener("click", () => {
      const result = FF.store.copyPreviousPlan();
      if (!result.ok && FF.app) FF.app.toast(result.error);
    });
    dom.archiveDone.addEventListener("click", archiveCompleted);
    dom.toggleArchive.addEventListener("click", () => {
      archiveOpen = !archiveOpen;
      render();
    });
    render();
    FF.bus.on("change", render);
  }

  FF.tasks = {
    init,
    render,
    add,
    remove,
    toggleComplete,
    setActive,
    togglePlan,
    movePlan,
    archiveCompleted,
    restore,
    nextInPlan,
  };
})();
