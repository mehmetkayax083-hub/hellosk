/* Focus Flow — soru kartları. Tekrar aralığı gerçek yanıtlardan ilerler. */
(function () {
  "use strict";

  const FF = (window.FF = window.FF || {});
  let dom = {};
  let current = null;

  function cache() {
    dom = {
      form: document.getElementById("cardForm"),
      front: document.getElementById("cardFront"),
      back: document.getElementById("cardBack"),
      course: document.getElementById("cardCourse"),
      deck: document.getElementById("cardDeck"),
      face: document.getElementById("cardFace"),
      show: document.getElementById("cardShow"),
      again: document.getElementById("cardAgain"),
      knew: document.getElementById("cardKnew"),
      progress: document.getElementById("cardProgress"),
      empty: document.getElementById("cardEmpty"),
    };
  }

  function dueCards() {
    const today = FF.store.todayKey();
    return FF.store.state.cards.filter((card) => card.due <= today);
  }

  function fillCourses() {
    const currentValue = dom.course.value;
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

  function render() {
    fillCourses();
    const cards = FF.store.state.cards;
    const due = dueCards();
    const known = cards.filter((card) => card.box >= 3).length;
    dom.progress.textContent = cards.length ? `${known}/${cards.length} öğrenildi · bugün ${due.length} tekrar` : "Henüz kart yok.";
    if (!current || !cards.some((card) => card.id === current.id && card.due <= FF.store.todayKey())) pick();
    const showing = dom.face.dataset.side === "back";
    dom.empty.hidden = Boolean(current);
    dom.face.hidden = !current;
    dom.show.hidden = !current || showing;
    dom.again.hidden = !current || !showing;
    dom.knew.hidden = !current || !showing;
    if (current) {
      const course = FF.store.state.courses.find((item) => item.id === current.courseId);
      dom.face.textContent = showing ? current.back : current.front;
      dom.deck.textContent = course ? course.name : "Genel";
    } else {
      dom.deck.textContent = "";
    }
  }

  function init() {
    cache();
    dom.form.addEventListener("submit", (event) => {
      event.preventDefault();
      const front = dom.front.value.trim();
      const back = dom.back.value.trim();
      if (!front || !back) return;
      FF.store.state.cards.push({
        id: "f" + Date.now(),
        courseId: dom.course.value || null,
        front: front.slice(0, 200),
        back: back.slice(0, 400),
        box: 0,
        due: FF.store.todayKey(),
      });
      dom.front.value = "";
      dom.back.value = "";
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
    render();
    FF.bus.on("change", render);
  }

  FF.cards = { init, render };
})();
