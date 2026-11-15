/* Focus Flow — ses: bitiş bildirimi ve ambiyans sesleri (Web Audio). */
(function () {
  "use strict";

  const FF = (window.FF = window.FF || {});
  let ctx = null;
  let ambientNodes = null;
  let currentAmbient = "none";

  function ensureCtx() {
    if (!ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      ctx = new Ctx();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  /* Tarayıcılar sese ancak bir kullanıcı hareketinden sonra izin verir. */
  function unlock() {
    ensureCtx();
  }

  const VOICES = {
    bell: { type: "sine", notes: [660, 880, 1046], gap: 0.18, dur: 0.5, level: 0.5 },
    soft: { type: "triangle", notes: [392, 494, 587], gap: 0.28, dur: 0.7, level: 0.45 },
    digital: { type: "square", notes: [880, 880, 1175], gap: 0.12, dur: 0.16, level: 0.18 },
  };

  function playChime(volume, style) {
    const ac = ensureCtx();
    if (!ac) return;
    const vol = typeof volume === "number" ? volume : 0.6;
    if (vol <= 0) return;
    const voice = VOICES[style] || VOICES.bell;
    const now = ac.currentTime;
    voice.notes.forEach((freq, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      const at = now + i * voice.gap;
      osc.type = voice.type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(voice.level * vol, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + voice.dur);
      osc.connect(gain).connect(ac.destination);
      osc.start(at);
      osc.stop(at + voice.dur);
    });
  }

  /* Gürültü tamponu — ambiyans seslerinin temeli. */
  function noiseBuffer(ac, type) {
    const len = ac.sampleRate * 2;
    const buffer = ac.createBuffer(1, len, ac.sampleRate);
    const data = buffer.getChannelData(0);
    if (type === "brown") {
      let last = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      }
    } else {
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  function startAmbient(kind, volume) {
    stopAmbient();
    currentAmbient = kind;
    if (!kind || kind === "none") return;
    const ac = ensureCtx();
    if (!ac) return;

    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(ac, kind === "brown" ? "brown" : "white");
    src.loop = true;

    const filter = ac.createBiquadFilter();
    const gain = ac.createGain();
    gain.gain.value = typeof volume === "number" ? volume * 0.5 : 0.2;

    let lfo = null;
    let lfoGain = null;

    if (kind === "rain") {
      filter.type = "highpass";
      filter.frequency.value = 1000;
    } else if (kind === "waves") {
      filter.type = "lowpass";
      filter.frequency.value = 600;
      // Yavaş dalgalanma için ses seviyesini LFO ile modüle et.
      lfo = ac.createOscillator();
      lfoGain = ac.createGain();
      lfo.frequency.value = 0.12;
      lfoGain.gain.value = gain.gain.value * 0.6;
      lfo.connect(lfoGain).connect(gain.gain);
      lfo.start();
    } else if (kind === "white") {
      filter.type = "bandpass";
      filter.frequency.value = 1800;
      filter.Q.value = 0.4;
    } else {
      filter.type = "lowpass";
      filter.frequency.value = 900;
    }

    src.connect(filter).connect(gain).connect(ac.destination);
    src.start();
    ambientNodes = { src, gain, lfo, lfoGain };
  }

  function stopAmbient() {
    if (ambientNodes) {
      try {
        ambientNodes.src.stop();
        if (ambientNodes.lfo) ambientNodes.lfo.stop();
      } catch {
        /* zaten durmuş olabilir */
      }
      ambientNodes = null;
    }
    currentAmbient = "none";
  }

  function setAmbientVolume(volume) {
    if (ambientNodes) ambientNodes.gain.gain.value = volume * 0.5;
  }

  FF.audio = {
    unlock,
    playChime,
    startAmbient,
    stopAmbient,
    setAmbientVolume,
    get playing() {
      return currentAmbient;
    },
  };
})();
