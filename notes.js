/* Focus Flow — ders notları. Yazarken kaydeder. */
(function () {
  "use strict";

  const FF = (window.FF = window.FF || {});
  let dom = {};
  let query = "";
  let editing = null;
  let saveTimer = null;

  function cache() {
    dom = {
      form: document.getElementById("noteForm"),
      title: document.getElementById("noteTitle"),
      body: document.getElementById("noteBody"),
      course: document.getElementById("noteCourse"),
      search: document.getElementById("noteSearch"),
      list: document.getElementById("noteList"),
      empty: document.getElementById("noteEmpty"),
    };
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function fillCourses(selected) {
    const current = selected === undefined ? dom.course.value : selected;
    dom.course.innerHTML = `<option value="">Ders yok</option>`;
    FF.store.state.courses.forEach((course) => {
      const option = document.createElement("option");
      option.value = course.id;
      option.textContent = course.name;
      dom.course.appendChild(option);
    });
    if ([...dom.course.options].some((option) => option.value === current)) dom.course.value = current;
  }

  function upsert() {
    const title = dom.title.value.trim();
    if (!title) return;
    const note = {
      id: editing || "n" + Date.now(),
      title: title.slice(0, 80),
      body: dom.body.value.slice(0, 4000),
      courseId: dom.course.value || null,
      updatedAt: Date.now(),
    };
    const index = FF.store.state.notes.findIndex((item) => item.id === note.id);
    if (index >= 0) FF.store.state.notes[index] = note;
    else FF.store.state.notes.unshift(note);
    editing = note.id;
    FF.store.commit();
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(upsert, 400);
  }

  function render() {
    fillCourses();
    const q = query;
    const notes = FF.store.state.notes.filter((note) => {
      if (!q) return true;
      return `${note.title} ${note.body}`.toLowerCase().includes(q);
    });
    dom.empty.hidden = notes.length > 0;
    dom.empty.textContent = q && FF.store.state.notes.length ? "Eşleşen not yok." : "Henüz not yok.";
    dom.list.innerHTML = notes
      .map((note) => {
        const course = FF.store.state.courses.find((item) => item.id === note.courseId);
        return (
          `<li class="task-item${note.id === editing ? " active" : ""}">` +
          `<div class="task-main"><span class="task-text">${escapeHtml(note.title)}</span>` +
          `<span class="task-desc">${escapeHtml(note.body.slice(0, 120))}</span>` +
          `<span class="task-cat">${course ? escapeHtml(course.name) : "Ders yok"}</span></div>` +
          `<div class="task-actions"><button type="button" class="task-focus" data-edit="${note.id}">Düzenle</button>` +
          `<button type="button" class="task-del" data-del="${note.id}" aria-label="Notu sil">×</button></div></li>`
        );
      })
      .join("");
  }

  function init() {
    cache();
    dom.form.addEventListener("submit", (event) => {
      event.preventDefault();
      upsert();
      editing = null;
      dom.title.value = "";
      dom.body.value = "";
      dom.course.value = "";
      render();
    });
    dom.title.addEventListener("input", scheduleSave);
    dom.body.addEventListener("input", scheduleSave);
    dom.course.addEventListener("change", scheduleSave);
    dom.search.addEventListener("input", () => {
      query = dom.search.value.trim().toLowerCase();
      render();
    });
    dom.list.addEventListener("click", (event) => {
      const edit = event.target.closest("[data-edit]");
      const del = event.target.closest("[data-del]");
      if (edit) {
        const note = FF.store.state.notes.find((item) => item.id === edit.dataset.edit);
        if (!note) return;
        editing = note.id;
        dom.title.value = note.title;
        dom.body.value = note.body;
        fillCourses(note.courseId || "");
        render();
      }
      if (del) {
        FF.store.state.notes = FF.store.state.notes.filter((item) => item.id !== del.dataset.del);
        if (editing === del.dataset.del) editing = null;
        FF.store.commit();
      }
    });
    render();
    FF.bus.on("change", render);
  }

  FF.notes = { init, render };
})();
