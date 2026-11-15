/* Focus Flow — dersler, konular ve sınav tarihleri. Süreler gerçek oturumlardan gelir. */
(function () {
  "use strict";

  const FF = (window.FF = window.FF || {});
  let dom = {};

  function cache() {
    dom = {
      form: document.getElementById("courseForm"),
      name: document.getElementById("courseName"),
      goal: document.getElementById("courseGoal"),
      exam: document.getElementById("courseExam"),
      list: document.getElementById("courseList"),
      empty: document.getElementById("courseEmpty"),
      compare: document.getElementById("courseCompare"),
    };
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function courseStats(course) {
    const taskIds = new Set(FF.store.state.tasks.filter((task) => task.courseId === course.id).map((task) => task.id));
    const sessions = FF.store.state.history.filter((item) => taskIds.has(item.taskId));
    return {
      minutes: sessions.reduce((sum, item) => sum + item.minutes, 0),
      pomodoros: sessions.filter((item) => item.mode === "focus").length,
    };
  }

  function examLabel(date) {
    if (!date) return "Sınav tarihi yok";
    const today = new Date(FF.store.todayKey() + "T12:00:00");
    const exam = new Date(date + "T12:00:00");
    const days = Math.round((exam - today) / 86400000);
    if (days > 0) return `${date} · ${days} gün kaldı`;
    if (days === 0) return `${date} · bugün`;
    return `${date} · ${Math.abs(days)} gün geçti`;
  }

  function addCourse(name, goal, exam) {
    const trimmed = name.trim();
    if (!trimmed) return;
    FF.store.state.courses.push({
      id: "d" + Date.now(),
      name: trimmed.slice(0, 60),
      goalMinutes: Math.min(5000, Math.max(1, parseInt(goal, 10) || 60)),
      examDate: /^\d{4}-\d{2}-\d{2}$/.test(exam) ? exam : null,
      topics: [],
    });
    FF.store.commit();
  }

  function addTopic(courseId, text) {
    const course = FF.store.state.courses.find((item) => item.id === courseId);
    const trimmed = text.trim();
    if (!course || !trimmed) return;
    course.topics.push({ id: "k" + Date.now(), text: trimmed.slice(0, 80), done: false });
    FF.store.commit();
  }

  function render() {
    const courses = FF.store.state.courses;
    dom.empty.hidden = courses.length > 0;
    dom.list.innerHTML = "";
    const ranked = courses
      .map((course) => ({ course, ...courseStats(course) }))
      .sort((a, b) => b.minutes - a.minutes);
    dom.compare.innerHTML = ranked
      .map((row) => `<li><span>${escapeHtml(row.course.name)}</span><span>${row.pomodoros} pomodoro · ${row.minutes} dk</span></li>`)
      .join("");

    courses.forEach((course) => {
      const stats = courseStats(course);
      const done = course.topics.filter((topic) => topic.done).length;
      const ratio = course.topics.length ? Math.round((done / course.topics.length) * 100) : 0;
      const card = document.createElement("article");
      card.className = "panel course-card";
      card.innerHTML =
        `<div class="panel-head"><h2>${escapeHtml(course.name)}</h2>` +
        `<button type="button" class="link-btn" data-remove="${course.id}">Sil</button></div>` +
        `<p class="panel-copy">${examLabel(course.examDate)}</p>` +
        `<p class="panel-copy">${stats.minutes}/${course.goalMinutes} dk · ${stats.pomodoros} pomodoro · konular ${ratio}%</p>` +
        `<div class="progress-track"><div class="progress-fill" style="width:${Math.min(100, Math.round((stats.minutes / course.goalMinutes) * 100))}%"></div></div>` +
        `<ul class="topic-list"></ul>` +
        `<form class="quick-add topic-form"><input class="input" maxlength="80" placeholder="Yeni konu" aria-label="Yeni konu"><button class="btn btn-line" type="submit">Ekle</button></form>`;
      const list = card.querySelector(".topic-list");
      course.topics.forEach((topic) => {
        const li = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "task-check" + (topic.done ? " done" : "");
        button.setAttribute("aria-label", topic.done ? "Konuyu aç" : "Konuyu tamamla");
        button.addEventListener("click", () => {
          topic.done = !topic.done;
          FF.store.commit();
        });
        const text = document.createElement("span");
        text.textContent = topic.text;
        if (topic.done) text.className = "done-text";
        li.append(button, text);
        list.appendChild(li);
      });
      card.querySelector("[data-remove]").addEventListener("click", () => {
        FF.store.state.courses = FF.store.state.courses.filter((item) => item.id !== course.id);
        FF.store.state.tasks.forEach((task) => {
          if (task.courseId === course.id) task.courseId = null;
        });
        FF.store.state.notes.forEach((note) => {
          if (note.courseId === course.id) note.courseId = null;
        });
        FF.store.commit();
      });
      card.querySelector(".topic-form").addEventListener("submit", (event) => {
        event.preventDefault();
        const input = event.target.querySelector("input");
        addTopic(course.id, input.value);
      });
      dom.list.appendChild(card);
    });
  }

  function init() {
    cache();
    dom.form.addEventListener("submit", (event) => {
      event.preventDefault();
      addCourse(dom.name.value, dom.goal.value, dom.exam.value);
      dom.name.value = "";
      dom.goal.value = "60";
      dom.exam.value = "";
    });
    render();
    FF.bus.on("change", render);
  }

  FF.courses = { init, render };
})();
