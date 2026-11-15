/* Focus Flow — soru kartları. Tekrar aralığı gerçek yanıtlardan ilerler. */
(function () {
  "use strict";

  const FF = (window.FF = window.FF || {});
  let dom = {};
  let current = null;
  let editing = null;

  function cache() {
    dom = {
      form: document.getElementById("cardForm"),
      title: document.getElementById("cardFormTitle"),
      front: document.getElementById("cardFront"),
      back: document.getElementById("cardBack"),
      course: document.getElementById("cardCourse"),
      save: document.getElementById("cardSave"),
      deck: document.getElementById("cardDeck"),
      face: document.getElementById("cardFace"),
      show: document.getElementById("cardShow"),
      again: document.getElementById("cardAgain"),
      knew: document.getElementById("cardKnew"),
      actions: document.getElementById("cardActions"),
      progress: document.getElementById("cardProgress"),
      empty: document.getElementById("cardEmpty"),
      list: document.getElementById("cardList"),
    };
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function ordered() {
    return FF.store.state.cards.slice().sort((a, b) => a.due.localeCompare(b.due) || a.box - b.box);
  }

  function dueCards() {
    const today = FF.store.todayKey();
    return ordered().filter((card) => card.due <= today);
  }

  function fillCourses(selected) {
    const currentValue = selected === undefined ? dom.course.value : selected;
    dom.course.innerHTML = `<option value="">Ders yok</option>`;
    FF.store.state.courses.forEach((course) => {
      const option = document.createElement("option");
      option.value = course.id;
      option.textContent = course.name;
      dom.course.appendChild(option);
    });
    if ([...dom.course.options].some((option) => option.value === currentValue)) dom.course.value = currentValue;
  }

  function pick() {
    const queue = dueCards();
    current = queue[0] || null;
  }

  function answer(knew) {
    if (!current) return;
    const card = FF.store.state.cards.find((item) => item.id === current.id);
    if (!card) return;
    if (knew) {
      card.box = Math.min(5, card.box + 1);
      card.due = FF.store.shiftDay(FF.store.todayKey(), Math.pow(2, card.box));
    } else {
      card.box = 0;
      card.due = FF.store.todayKey();
    }
    FF.store.commit();
  }

  function resetForm() {
    editing = null;
    dom.front.value = "";
    dom.back.value = "";
    dom.course.value = "";
    dom.title.textContent = "Yeni kart";
    dom.save.textContent = "Kart ekle";
  }

  function render() {
    fillCourses();
    const cards = ordered();
    const today = FF.store.todayKey();
    const due = dueCards();
    const known = cards.filter((card) => card.box >= 3).length;
    dom.progress.textContent = cards.length ? `${known}/${cards.length} öğrenildi · bugün ${due.length}` : "Kayıt yok";
    if (!current || !cards.some((card) => card.id === current.id && card.due <= today)) pick();
    const showing = dom.face.dataset.side === "back";
    dom.empty.hidden = Boolean(current);
    dom.empty.textContent = cards.length ? "Bugün tekrar edilecek kart yok." : "İlk kartı aşağıdaki formdan ekle.";
    dom.face.hidden = !current;
    dom.actions.hidden = !current;
    dom.show.hidden = !current || showing;
    dom.again.hidden = !current || !showing;
    dom.knew.hidden = !current || !showing;
    if (current) {
      const course = FF.store.state.courses.find((item) => item.id === current.courseId);
      dom.face.textContent = showing ? current.back : current.front;
      dom.deck.textContent = course ? course.name : "Genel";
    } else {
      dom.deck.textContent = "Tekrar";
    }

    dom.list.innerHTML = cards
      .map((card) => {
        const course = FF.store.state.courses.find((item) => item.id === card.courseId);
        const when = card.due === today ? "Bugün" : card.due;
        return (
          `<li class="task-item${card.id === editing ? " active" : ""}">` +
          `<div class="task-main"><span class="task-text">${escapeHtml(card.front)}</span>` +
          `<span class="task-desc">${escapeHtml(card.back)}</span>` +
          `<span class="task-cat">${course ? escapeHtml(course.name) : "Genel"} · ${when}</span></div>` +
          `<div class="task-actions"><button type="button" class="task-focus" data-edit="${card.id}">Düzenle</button>` +
          `<button type="button" class="task-del" data-del="${card.id}" aria-label="Kartı sil">×</button></div></li>`
        );
      })
      .join("");
  }

  function init() {
    cache();
    dom.form.addEventListener("submit", (event) => {
      event.preventDefault();
      const front = dom.front.value.trim();
      const back = dom.back.value.trim();
      if (!front || !back) return;
      if (editing) {
        const card = FF.store.state.cards.find((item) => item.id === editing);
        if (card) {
          card.front = front.slice(0, 200);
          card.back = back.slice(0, 400);
          card.courseId = dom.course.value || null;
        }
      } else {
        FF.store.state.cards.push({
          id: "f" + Date.now(),
          courseId: dom.course.value || null,
          front: front.slice(0, 200),
          back: back.slice(0, 400),
          box: 0,
          due: FF.store.todayKey(),
        });
      }
      resetForm();
      FF.store.commit();
    });
    dom.show.addEventListener("click", () => {
      dom.face.dataset.side = "back";
      render();
    });
    dom.again.addEventListener("click", () => {
      dom.face.dataset.side = "front";
      answer(false);
    });
    dom.knew.addEventListener("click", () => {
      dom.face.dataset.side = "front";
      answer(true);
    });
    dom.list.addEventListener("click", (event) => {
      const edit = event.target.closest("[data-edit]");
      const del = event.target.closest("[data-del]");
      if (edit) {
        const card = FF.store.state.cards.find((item) => item.id === edit.dataset.edit);
        if (!card) return;
        editing = card.id;
        dom.front.value = card.front;
        dom.back.value = card.back;
        fillCourses(card.courseId || "");
        dom.title.textContent = "Kartı düzenle";
        dom.save.textContent = "Kartı güncelle";
        render();
        dom.front.focus();
      }
      if (del) {
        const id = del.dataset.del;
        FF.store.state.cards = FF.store.state.cards.filter((item) => item.id !== id);
        if (current && current.id === id) current = null;
        if (editing === id) resetForm();
        FF.store.commit();
      }
    });
    render();
    FF.bus.on("change", render);
  }

  FF.cards = { init, render };
})();
