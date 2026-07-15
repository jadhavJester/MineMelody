/* ============================================================
   MineMelody — Girly Hand-Tracking Musical Instrument
   ============================================================ */
import {
  FilesetResolver, HandLandmarker
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/+esm";

/* ---------- Constants ---------- */
const WRIST = 0, THUMB_TIP = 4, INDEX_TIP = 8, MIDDLE_MCP = 9;
const HAND_CONNS = [
  [0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],[0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],[5,9],[9,13],[13,17]
];

const NOTES_SIMPLE = ['C','D','E','F','G','A','B'];
const NOTES_ALL = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const NOTE_DISPLAY = {'C':'C','C#':'C♯','D':'D','D#':'D♯','E':'E','F':'F','F#':'F♯','G':'G','G#':'G♯','A':'A','A#':'A♯','B':'B'};
const SEMITONE_MAP = {'C':0,'C#':1,'D':2,'D#':3,'E':4,'F':5,'F#':6,'G':7,'G#':8,'A':9,'A#':10,'B':11};
const BASE_C4 = 261.63;

const CHORD_NAMES = ['maj','maj7','7','sus4','m','m7','dim','aug'];
const CHORD_INTERVALS = {
  'maj':[0,4,7], 'min':[0,3,7], 'm':[0,3,7], 'dim':[0,3,6], 'aug':[0,4,8],
  'maj7':[0,4,7,11], '7':[0,4,7,10], 'm7':[0,3,7,10], 'sus4':[0,5,7]
};

const SCALES = {
  major:[0,2,4,5,7,9,11], minor:[0,2,3,5,7,8,10],
  penta_maj:[0,2,4,7,9], penta_min:[0,3,5,7,10],
  blues:[0,3,5,6,7,10], dorian:[0,2,3,5,7,9,10],
  mixolydian:[0,2,4,5,7,9,10], whole_tone:[0,2,4,6,8,10],
  chromatic:[0,1,2,3,4,5,6,7,8,9,10,11]
};

// Indian Classical: Yaman (Kalyan), Bhupali, Kafi, Bhairav, Malkauns
const INDIAN_RAGAS = {
  yaman: { name: 'Yaman', intervals: [0,2,4,6,7,9,11], drone: [0, 7] }, // Ma is तीव्र (#4, semitone 6)
  bhupali: { name: 'Bhupali', intervals: [0,2,4,7,9], drone: [0, 7] }, // Pentatonic
  kafi: { name: 'Kafi', intervals: [0,2,3,5,7,9,10], drone: [0, 7] }, // Kharaharapriya
  bhairav: { name: 'Bhairav', intervals: [0,1,4,5,7,8,11], drone: [0, 7] }, // komal re, komal dha
  malkauns: { name: 'Malkauns', intervals: [0,3,5,8,10], drone: [0, 5] } // Pentatonic (Sa, komal ga, ma, komal dha, komal ni) - Ma drone
};

// 22-Shruti frequencies relative to Sa (just intonation ratios)
const SHRUTI_RATIOS = [
  1.0, 256/243, 16/15, 9/8, 10/9, 6/5, 5/4, 81/64, 4/3, 27/20,
  45/32, 64/45, 3/2, 128/81, 8/5, 5/3, 27/16, 16/9, 9/5, 15/8, 243/128, 2.0
];

const MOODS = {
  rainy: { key: 'A', type: 'minor', prog: ['m','VI','III','VII'], capo: -2, name: '🌧️ Rainy Day' },
  warm: { key: 'C', type: 'major', prog: ['I','V','vi','IV'], capo: 0, name: '☀️ Warm & Nostalgic' },
  heartbreak: { key: 'E', type: 'minor', prog: ['m','IV','I','V'], capo: 2, name: '💔 Heartbreak Ballad' }
};

const EASY_PROGS = [
  ['I', 'V', 'vi', 'IV'],   // 0
  ['vi', 'IV', 'I', 'V'],   // 1
  ['I', 'vi', 'IV', 'V'],   // 2
  ['ii', 'V', 'I', 'V']     // 3
];

/* ---------- State ---------- */
const state = {
  mode: 'western', // 'western', 'indian', 'easyplay'
  
  // Western
  wMode: 'continuous',
  wRoot: 'C',
  wScale: 'major',
  wWave: 'sine',
  wRange: 3,
  wChord: false,

  // Indian
  iRaga: 'yaman',
  iTimbre: 'bansuri',
  iTuning: 'equal',
  iSaFreq: BASE_C4, // Default Sa is C4
  iTanpura: true,
  iDroneVol: 0.3,

  // Easy Play
  eKey: 'C',
  eKeyType: 'major',
  eCapo: 0,
  eProgIdx: 0,
  eActiveMood: null,
  eSelectedChordPad: -1,

  // WebKeys
  wKeysInstrument: 'piano',
  wKeysGesture: 'hover',
  wKeysRoot: 'C',
  wKeysScale: 'chromatic',
  wKeysOctave: 4,
  wKeysSustain: 800,
  wKeysReverb: 0.3,

  // Shared / Tracking state
  handsDetected: 0,
  melodyFreq: 0,
  volume: 0,
  pinchRatio: 0
};

/* ---------- DOM Elements ---------- */
const $start = document.getElementById('start-screen');
const $startBtn = document.getElementById('start-btn');
const $startErr = document.getElementById('start-error');
const $app = document.getElementById('app');
const $video = document.getElementById('video-feed');
const $canvas = document.getElementById('canvas');
const $loading = document.getElementById('loading-overlay');
const ctx = $canvas.getContext('2d');

const $sMelody = document.getElementById('s-melody');
const $sVolume = document.getElementById('s-volume');
const $sPinch = document.getElementById('s-pinch');
const $sChord = document.getElementById('s-chord');
const $sHands = document.getElementById('s-hands');
const $sScale = document.getElementById('s-scale');

// Toolbars & Tabs
const $tabs = document.querySelectorAll('.mode-tab');
const $tbWestern = document.getElementById('tb-western');
const $tbIndian = document.getElementById('tb-indian');
const $tbEasyplay = document.getElementById('tb-easyplay');
const $tbWebkeys = document.getElementById('tb-webkeys');
const $kbWrap = document.getElementById('keyboard-wrap');
const $chordPadsContainer = document.getElementById('chord-pads');
const $moodPresetsContainer = document.getElementById('mood-presets');

/* ---------- Audio Engine (Polished Synth) ---------- */
let audioCtx = null, masterGain = null;
let filterNode = null, lfoNode = null, lfoGainNode = null;
let delayNode = null, feedbackGain = null, delayDry = null, delayWet = null;
let voices = [];
let tanpuraOsc1 = null, tanpuraOsc2 = null, tanpuraGain = null;

// WebKeys Piano buffers and loader
const pianoBuffers = {};
let pianoLoaded = false;
let pianoLoading = false;
const PIANO_URL = "https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/acoustic_grand_piano-mp3/";
const PIANO_NOTES_PRIORITY = [
  "C4","D4","E4","F4","G4","A4","B4",
  "C5","D5","E5","F5","G5","A5","B5",
  "C3","D3","E3","F3","G3","A3","B3"
];
const PIANO_NOTES_EXTENDED = [
  "A0","B0","C1","D1","E1","F1","G1","A1","B1",
  "C2","C#2","D2","D#2","E2","F2","F#2","G2","G#2","A2","A#2","B2",
  "C#3","D#3","F#3","G#3","A#3",
  "C#4","D#4","F#4","G#4","A#4",
  "C#5","D#5","F#5","G#5","A#5",
  "C6","C#6","D6","D#6","E6","F6","F#6","G6","G#6","A6","A#6","B6",
  "C7","D7","E7"
];

function loadPianoSamples() {
  if (pianoLoading || pianoLoaded) return;
  pianoLoading = true;
  console.log("🎹 [WebKeys] Lazy-loading piano samples...");
  loadBatch(PIANO_NOTES_PRIORITY, () => {
    console.log("✅ [WebKeys] Priority piano samples loaded!");
    loadBatch(PIANO_NOTES_EXTENDED, () => {
      pianoLoaded = true;
      console.log(`✅ [WebKeys] Extended piano samples loaded! Total: ${Object.keys(pianoBuffers).length}`);
    });
  });
}

function loadBatch(notes, callback) {
  let loaded = 0;
  const total = notes.length;
  if (total === 0) { if (callback) callback(); return; }
  notes.forEach(noteName => {
    fetch(PIANO_URL + noteName + ".mp3")
      .then(r => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.arrayBuffer();
      })
      .then(ab => {
        if (!audioCtx) return;
        return audioCtx.decodeAudioData(ab);
      })
      .then(buffer => {
        if (!buffer) return;
        pianoBuffers[noteName] = buffer;
        loaded++;
        if (loaded === total && callback) callback();
      })
      .catch(err => {
        console.warn(`Could not load piano sample ${noteName}:`, err);
        loaded++;
        if (loaded === total && callback) callback();
      });
  });
}

function findBestPianoSample(targetFreq) {
  let bestMatch = null;
  let smallestDiff = Infinity;
  for (const noteName in pianoBuffers) {
    const noteWithoutOctave = noteName.replace(/[0-9]/g, '');
    const octave = parseInt(noteName.match(/[0-9]/)[0]);
    let baseFreq;
    switch(noteWithoutOctave) {
      case 'C': baseFreq = 16.35; break;
      case 'C#': baseFreq = 17.32; break;
      case 'D': baseFreq = 18.35; break;
      case 'D#': baseFreq = 19.45; break;
      case 'E': baseFreq = 20.60; break;
      case 'F': baseFreq = 21.83; break;
      case 'F#': baseFreq = 23.12; break;
      case 'G': baseFreq = 24.50; break;
      case 'G#': baseFreq = 25.96; break;
      case 'A': baseFreq = 27.50; break;
      case 'A#': baseFreq = 29.14; break;
      case 'B': baseFreq = 30.87; break;
      default: baseFreq = 440;
    }
    const sampleFreq = baseFreq * Math.pow(2, octave);
    const difference = Math.abs(targetFreq - sampleFreq);
    if (difference < smallestDiff) {
      smallestDiff = difference;
      bestMatch = noteName;
    }
  }
  return bestMatch;
}

// Violin physical modeling synthesizer constants
const VIOLIN_PARAMS = {
  stringStiffness: 0.0008,
  formants: [
    { freq: 280,  Q: 15, gain: 4.5 },
    { freq: 550,  Q: 8,  gain: 2.0 },
    { freq: 900,  Q: 12, gain: 3.5 },
    { freq: 1500, Q: 10, gain: 2.8 },
    { freq: 2800, Q: 6,  gain: 1.8 }
  ],
  bowNoiseAmount: 0.02,
  vibrato: { onsetDelay: 0.25, rampTime: 0.4, rate: 5.5, maxDepth: 18 },
  envelope: { attackTime: 0.08, bloomTime: 0.25, sustainLevel: 0.85, releaseTime: 0.12 }
};

function initAudio() {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  
  // Master Output
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.65;
  masterGain.connect(audioCtx.destination);

  // Warm filter
  filterNode = audioCtx.createBiquadFilter();
  filterNode.type = 'lowpass';
  filterNode.frequency.value = 2500;
  filterNode.Q.value = 1.0;

  // Space/Delay Reverb
  delayNode = audioCtx.createDelay(1.0);
  delayNode.delayTime.value = 0.35;
  feedbackGain = audioCtx.createGain();
  feedbackGain.gain.value = 0.3; // nice space
  delayWet = audioCtx.createGain();
  delayWet.gain.value = 0.25;
  delayDry = audioCtx.createGain();
  delayDry.gain.value = 0.95;

  filterNode.connect(delayDry);
  delayDry.connect(masterGain);
  
  filterNode.connect(delayNode);
  delayNode.connect(feedbackGain);
  feedbackGain.connect(delayNode);
  delayNode.connect(delayWet);
  delayWet.connect(masterGain);

  // Vibrato LFO
  lfoNode = audioCtx.createOscillator();
  lfoNode.frequency.value = 5.5; // Sweet vibrato
  lfoGainNode = audioCtx.createGain();
  lfoGainNode.gain.value = 4.0; 
  lfoNode.connect(lfoGainNode);
  lfoNode.start();

  // Voice Pool
  const detuning = [0, 4, -4, 6];
  for (let i = 0; i < 4; i++) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 261.63;
    osc.detune.value = detuning[i];
    gain.gain.value = 0;
    
    osc.connect(gain);
    gain.connect(filterNode);
    lfoGainNode.connect(osc.frequency);
    osc.start();
    voices.push({ osc, gain });
  }

  // Tanpura Drone Setup
  tanpuraGain = audioCtx.createGain();
  tanpuraGain.gain.value = 0; // starts off
  tanpuraGain.connect(masterGain);

  updateDrone();
  
  // Lazy load piano samples
  loadPianoSamples();
}

function updateDrone() {
  if (!audioCtx) return;
  
  // Stop existing
  if (tanpuraOsc1) { try { tanpuraOsc1.stop(); } catch(e){} }
  if (tanpuraOsc2) { try { tanpuraOsc2.stop(); } catch(e){} }

  if (state.mode === 'indian' && state.iTanpura) {
    const rootSa = state.iSaFreq;
    const ragaInfo = INDIAN_RAGAS[state.iRaga] || INDIAN_RAGAS.yaman;
    const secondDroneInterval = ragaInfo.drone[1]; // Pa (7 semitones) or Ma (5 semitones)
    const secondSa = rootSa * Math.pow(2, secondDroneInterval / 12);

    tanpuraOsc1 = audioCtx.createOscillator();
    tanpuraOsc1.type = 'triangle';
    tanpuraOsc1.frequency.value = rootSa / 2; // low octave drone

    tanpuraOsc2 = audioCtx.createOscillator();
    tanpuraOsc2.type = 'sawtooth';
    tanpuraOsc2.frequency.value = secondSa / 2;

    const f1 = audioCtx.createBiquadFilter();
    f1.type = 'lowpass';
    f1.frequency.value = 400; // very warm drone

    const f2 = audioCtx.createBiquadFilter();
    f2.type = 'lowpass';
    f2.frequency.value = 400;

    tanpuraOsc1.connect(f1);
    f1.connect(tanpuraGain);
    tanpuraOsc2.connect(f2);
    f2.connect(tanpuraGain);

    tanpuraOsc1.start();
    tanpuraOsc2.start();

    // Volume fade
    tanpuraGain.gain.setTargetAtTime(state.iDroneVol * 0.25, audioCtx.currentTime, 0.1);
  } else {
    tanpuraGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
  }
}

// Global play call
function playSynth(frequencies, vol, type = 'sine', slideSpeed = 0.02) {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const targetVol = frequencies.length > 0 ? (vol * 0.7) / Math.sqrt(frequencies.length) : 0;

  // Filter sweep matching loudness
  filterNode.frequency.setTargetAtTime(800 + vol * 3000, t, 0.05);

  // Map instrument types to oscillator types for sliding voices
  let oscType = 'sine';
  if (type === 'piano') oscType = 'triangle';
  else if (type === 'violin') oscType = 'sawtooth';
  else if (type === 'organ') oscType = 'sine';
  else if (type === 'synth') oscType = 'sawtooth';
  else if (type === 'harmonium') oscType = 'sawtooth';
  else oscType = type;

  for (let i = 0; i < 4; i++) {
    if (i < frequencies.length && frequencies[i] > 20) {
      voices[i].osc.type = oscType;
      voices[i].osc.frequency.setTargetAtTime(frequencies[i], t, slideSpeed);
      voices[i].gain.gain.setTargetAtTime(targetVol, t, 0.03);
    } else {
      voices[i].gain.gain.setTargetAtTime(0, t, 0.05);
    }
  }
}

function silenceSynth() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  for (const v of voices) {
    v.gain.gain.setTargetAtTime(0, t, 0.06);
  }
}

// ============================================================
// ★ WEBKEYS INSTRUMENT VOICE TRIGGERS ★
// ============================================================

const activeKeyboardNotes = new Map();

function triggerPiano(midiNote, targetFreq, now, volume, sustainMs) {
  const sampleName = findBestPianoSample(targetFreq);
  if (!sampleName || !pianoBuffers[sampleName]) {
    // Triangle fallback piano
    const osc = audioCtx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = targetFreq;
    const gainNode = audioCtx.createGain();
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(volume * 0.5, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(volume * 0.25, now + 0.5);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 2.0);
    osc.connect(gainNode);
    gainNode.connect(filterNode);
    osc.start(now);
    osc.stop(now + 2.1);
    return {
      stop(stopTime) {
        const rel = sustainMs / 1000;
        gainNode.gain.cancelScheduledValues(stopTime);
        gainNode.gain.setValueAtTime(gainNode.gain.value, stopTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, stopTime + rel);
        try { osc.stop(stopTime + rel + 0.05); } catch(e){}
      }
    };
  }

  const sampleBuffer = pianoBuffers[sampleName];
  const sampleNote = sampleName.replace(/[0-9]/g, '');
  const sampleOctave = parseInt(sampleName.match(/[0-9]/)[0]);
  const noteIndices = {'C':0,'C#':1,'D':2,'D#':3,'E':4,'F':5,'F#':6,'G':7,'G#':8,'A':9,'A#':10,'B':11};
  const sampleFreq = 261.63 * Math.pow(2, (noteIndices[sampleNote] + (sampleOctave - 4) * 12) / 12);

  const source = audioCtx.createBufferSource();
  source.buffer = sampleBuffer;
  source.playbackRate.value = targetFreq / sampleFreq;

  const gainNode = audioCtx.createGain();
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(volume * 0.8, now + 0.002);
  gainNode.gain.exponentialRampToValueAtTime(volume * 0.5, now + 0.3);
  gainNode.gain.exponentialRampToValueAtTime(volume * 0.3, now + 1.0);
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + 3.5);

  const warmFilter = audioCtx.createBiquadFilter();
  warmFilter.type = 'lowpass';
  warmFilter.frequency.value = Math.min(5000, targetFreq * 3);
  warmFilter.Q.value = 0.5;

  source.connect(warmFilter);
  warmFilter.connect(gainNode);
  gainNode.connect(filterNode);

  source.start(now);
  source.stop(now + 4.0);

  return {
    stop(stopTime) {
      const rel = sustainMs / 1000;
      gainNode.gain.cancelScheduledValues(stopTime);
      gainNode.gain.setValueAtTime(gainNode.gain.value, stopTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, stopTime + rel);
      try { source.stop(stopTime + rel + 0.05); } catch(e){}
    }
  };
}

function triggerViolin(midiNote, targetFreq, now, volume) {
  const nodes = [];
  const masterG = audioCtx.createGain();
  masterG.connect(filterNode);

  const stringOutput = audioCtx.createGain();
  stringOutput.gain.value = 1.0;

  const harmonics = [
    { ratio: 1.0, amplitude: 1.00 },
    { ratio: 2.0, amplitude: 0.55 },
    { ratio: 3.0, amplitude: 0.72 },
    { ratio: 4.0, amplitude: 0.28 },
    { ratio: 5.0, amplitude: 0.22 },
    { ratio: 6.0, amplitude: 0.18 },
    { ratio: 7.0, amplitude: 0.12 }
  ];

  harmonics.forEach(harmonic => {
    const inharmonicity = 1 + (VIOLIN_PARAMS.stringStiffness * Math.pow(harmonic.ratio, 2));
    const harmonicFreq = targetFreq * harmonic.ratio * inharmonicity;

    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = harmonicFreq;
    osc.detune.value = (Math.random() - 0.5) * 2;

    const harmonicGain = audioCtx.createGain();
    harmonicGain.gain.value = harmonic.amplitude * volume * 0.15;

    osc.connect(harmonicGain);
    harmonicGain.connect(stringOutput);
    osc.start(now);
    nodes.push({ osc, gain: harmonicGain });
  });

  // Bow Noise
  const noiseBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < noiseData.length; i++) {
    noiseData[i] = (Math.random() * 2 - 1) * 0.7;
  }
  const noiseSource = audioCtx.createBufferSource();
  noiseSource.buffer = noiseBuffer;
  noiseSource.loop = true;

  const bowFilter = audioCtx.createBiquadFilter();
  bowFilter.type = 'bandpass';
  bowFilter.frequency.value = Math.min(targetFreq * 2.5, 3500);
  bowFilter.Q.value = 0.7;

  const bowNoiseGain = audioCtx.createGain();
  bowNoiseGain.gain.value = volume * VIOLIN_PARAMS.bowNoiseAmount;

  noiseSource.connect(bowFilter);
  bowFilter.connect(bowNoiseGain);
  bowNoiseGain.connect(masterG);
  noiseSource.start(now);
  nodes.push({ osc: noiseSource, gain: bowNoiseGain });

  // Formant peaking chain
  let lastNode = stringOutput;
  VIOLIN_PARAMS.formants.forEach(formant => {
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'peaking';
    filter.frequency.value = formant.freq;
    filter.Q.value = formant.Q;
    filter.gain.value = formant.gain;
    lastNode.connect(filter);
    lastNode = filter;
  });
  lastNode.connect(masterG);

  // Vibrato LFO
  const vibratoLFO = audioCtx.createOscillator();
  vibratoLFO.type = 'sine';
  vibratoLFO.frequency.value = VIOLIN_PARAMS.vibrato.rate;

  const vibratoGain = audioCtx.createGain();
  vibratoGain.gain.value = 0;
  const vibOnset = now + VIOLIN_PARAMS.vibrato.onsetDelay;
  const vibRampEnd = vibOnset + VIOLIN_PARAMS.vibrato.rampTime;
  const maxDepthFreq = targetFreq * (VIOLIN_PARAMS.vibrato.maxDepth / 1200);

  vibratoGain.gain.setValueAtTime(0, now);
  vibratoGain.gain.setValueAtTime(0, vibOnset);
  vibratoGain.gain.linearRampToValueAtTime(maxDepthFreq * 0.1, vibOnset + 0.05);
  vibratoGain.gain.linearRampToValueAtTime(maxDepthFreq, vibRampEnd);

  vibratoLFO.connect(vibratoGain);
  nodes.forEach(node => {
    if (node.osc && node.osc.frequency && node.osc.type === 'sine') {
      if (node.osc.frequency.value < targetFreq * 5) {
        vibratoGain.connect(node.osc.frequency);
      }
    }
  });
  vibratoLFO.start(now);
  nodes.push({ osc: vibratoLFO, gain: vibratoGain });

  // Volume Envelope
  const env = VIOLIN_PARAMS.envelope;
  masterG.gain.setValueAtTime(0, now);
  masterG.gain.linearRampToValueAtTime(volume * 0.4, now + env.attackTime);
  masterG.gain.linearRampToValueAtTime(volume * 0.75, now + env.bloomTime);
  masterG.gain.linearRampToValueAtTime(volume * env.sustainLevel, now + env.bloomTime + 0.15);

  return {
    stop(stopTime) {
      masterG.gain.cancelScheduledValues(stopTime);
      masterG.gain.setValueAtTime(masterG.gain.value, stopTime);
      masterG.gain.exponentialRampToValueAtTime(0.001, stopTime + env.releaseTime);

      nodes.forEach(n => {
        try { n.osc.stop(stopTime + env.releaseTime + 0.05); } catch(e){}
      });
      setTimeout(() => {
        try { masterG.disconnect(); } catch(e){}
        nodes.forEach(n => {
          try { n.osc.disconnect(); } catch(e){}
          try { n.gain.disconnect(); } catch(e){}
        });
      }, (env.releaseTime + 0.2) * 1000);
    }
  };
}

function triggerOrgan(midiNote, targetFreq, now, volume, sustainMs) {
  const nodes = [];
  const masterG = audioCtx.createGain();
  masterG.gain.setValueAtTime(0, now);
  masterG.gain.linearRampToValueAtTime(volume * 0.85, now + 0.01);
  masterG.connect(filterNode);

  const harmonics = [
    { r: 1, g: 1.0 },
    { r: 2, g: 0.75 },
    { r: 3, g: 0.5 },
    { r: 4, g: 0.35 },
    { r: 6, g: 0.2 },
    { r: 8, g: 0.12 }
  ];

  harmonics.forEach(h => {
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = targetFreq * h.r;
    const og = audioCtx.createGain();
    og.gain.value = h.g * 0.35;
    osc.connect(og);
    og.connect(masterG);
    osc.start(now);
    nodes.push({ osc, gain: og });
  });

  return {
    stop(stopTime) {
      const rel = sustainMs / 1000;
      masterG.gain.cancelScheduledValues(stopTime);
      masterG.gain.setValueAtTime(masterG.gain.value, stopTime);
      masterG.gain.exponentialRampToValueAtTime(0.0001, stopTime + rel);
      nodes.forEach(n => {
        try { n.osc.stop(stopTime + rel + 0.05); } catch(e){}
      });
      setTimeout(() => {
        try { masterG.disconnect(); } catch(e){}
        nodes.forEach(n => {
          try { n.osc.disconnect(); n.gain.disconnect(); } catch(e){}
        });
      }, (rel + 0.2) * 1000);
    }
  };
}

function triggerSynth(midiNote, targetFreq, now, volume, sustainMs) {
  const osc = audioCtx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = targetFreq;

  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1200;
  filter.Q.value = 12;

  const masterG = audioCtx.createGain();
  masterG.gain.setValueAtTime(0, now);
  masterG.gain.linearRampToValueAtTime(volume * 0.85, now + 0.02);
  masterG.gain.linearRampToValueAtTime(volume * 0.55, now + 0.15);

  osc.connect(filter);
  filter.connect(masterG);
  masterG.connect(filterNode);
  osc.start(now);

  return {
    stop(stopTime) {
      const rel = sustainMs / 1000;
      masterG.gain.cancelScheduledValues(stopTime);
      masterG.gain.setValueAtTime(masterG.gain.value, stopTime);
      masterG.gain.exponentialRampToValueAtTime(0.0001, stopTime + rel);
      try { osc.stop(stopTime + rel + 0.05); } catch(e){}
      setTimeout(() => {
        try { osc.disconnect(); filter.disconnect(); masterG.disconnect(); } catch(e){}
      }, (rel + 0.2) * 1000);
    }
  };
}

function triggerHarmonium(midiNote, targetFreq, now, volume, sustainMs) {
  const nodes = [];
  const masterG = audioCtx.createGain();
  masterG.gain.setValueAtTime(0, now);
  masterG.gain.linearRampToValueAtTime(volume * 0.5, now + 0.08);
  masterG.connect(filterNode);

  const lowShelf = audioCtx.createBiquadFilter();
  lowShelf.type = 'lowshelf';
  lowShelf.frequency.value = 300;
  lowShelf.gain.value = 3.5;

  const midPeak = audioCtx.createBiquadFilter();
  midPeak.type = 'peaking';
  midPeak.frequency.value = 900;
  midPeak.Q.value = 1.5;
  midPeak.gain.value = 6;

  const lpf = audioCtx.createBiquadFilter();
  lpf.type = 'lowpass';
  lpf.frequency.value = 4500;
  lpf.Q.value = 0.5;

  lowShelf.connect(midPeak);
  midPeak.connect(lpf);
  lpf.connect(masterG);

  // LFO
  const lfo = audioCtx.createOscillator();
  const lfoGain = audioCtx.createGain();
  lfo.type = 'sine';
  lfo.frequency.value = 5.5;
  lfoGain.gain.value = targetFreq * 0.002;
  lfo.connect(lfoGain);
  lfo.start(now);
  nodes.push({ osc: lfo, gain: lfoGain });

  const layers = [
    { detune: 0, vol: 0.50 },
    { detune: 4, vol: 0.28 },
    { detune: -3, vol: 0.26 }
  ];

  layers.forEach(layer => {
    const dr = Math.pow(2, layer.detune / 1200);
    const harmonics = [
      { mult: 1, type: 'sawtooth', g: 0.75 },
      { mult: 2, type: 'sine', g: 0.22 },
      { mult: 0.5, type: 'sine', g: 0.12 }
    ];

    harmonics.forEach(h => {
      const osc = audioCtx.createOscillator();
      const og = audioCtx.createGain();
      osc.type = h.type;
      osc.frequency.value = targetFreq * h.mult * dr;
      og.gain.value = layer.vol * h.g * 0.38;
      lfoGain.connect(osc.frequency);
      osc.connect(og);
      og.connect(lowShelf);
      osc.start(now);
      nodes.push({ osc, gain: og });
    });
  });

  return {
    stop(stopTime) {
      const rel = sustainMs / 1000;
      masterG.gain.cancelScheduledValues(stopTime);
      masterG.gain.setValueAtTime(masterG.gain.value, stopTime);
      masterG.gain.exponentialRampToValueAtTime(0.0001, stopTime + rel);
      nodes.forEach(n => {
        try { n.osc.stop(stopTime + rel + 0.05); } catch(e){}
      });
      setTimeout(() => {
        try { masterG.disconnect(); } catch(e){}
        nodes.forEach(n => {
          try { n.osc.disconnect(); n.gain.disconnect(); } catch(e){}
        });
      }, (rel + 0.2) * 1000);
    }
  };
}

function triggerDiscreteNote(midiNote, instrument, velocity = 0.8, sustainMs = 800) {
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  if (activeKeyboardNotes.has(midiNote)) return;

  const targetFreq = 440 * Math.pow(2, (midiNote - 69) / 12);
  const now = audioCtx.currentTime;

  let voice = null;
  switch (instrument) {
    case 'piano':
      voice = triggerPiano(midiNote, targetFreq, now, velocity, sustainMs);
      break;
    case 'violin':
      voice = triggerViolin(midiNote, targetFreq, now, velocity);
      break;
    case 'organ':
      voice = triggerOrgan(midiNote, targetFreq, now, velocity, sustainMs);
      break;
    case 'synth':
      voice = triggerSynth(midiNote, targetFreq, now, velocity, sustainMs);
      break;
    case 'harmonium':
      voice = triggerHarmonium(midiNote, targetFreq, now, velocity, sustainMs);
      break;
    default:
      voice = triggerPiano(midiNote, targetFreq, now, velocity, sustainMs);
  }

  if (voice) {
    activeKeyboardNotes.set(midiNote, voice);
  }
}

function stopDiscreteNote(midiNote) {
  const voice = activeKeyboardNotes.get(midiNote);
  if (voice) {
    voice.stop(audioCtx ? audioCtx.currentTime : 0);
    activeKeyboardNotes.delete(midiNote);
  }
}

/* ---------- Hand Tracking Setup ---------- */
let handLandmarker = null;
let lastVidTime = -1;
let latestLandmarks = [];

async function initHands() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
  );
  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      delegate: "GPU"
    },
    runningMode: "VIDEO", numHands: 2
  });
  $loading.classList.add('hidden');
}

/* ---------- Pitch Mapping ---------- */
function getWesternFreq(y) {
  const rootIdx = NOTES_ALL.indexOf(state.wRoot);
  const baseFreq = BASE_C4 * Math.pow(2, (rootIdx - 0) / 12 - 1); // root octave below C4
  const maxFreq = baseFreq * Math.pow(2, state.wRange);
  // exponential mapping
  return baseFreq * Math.pow(maxFreq / baseFreq, 1 - y);
}

function getIndianFreq(y) {
  const raga = INDIAN_RAGAS[state.iRaga];
  const octRange = 3;
  const baseFreq = state.iSaFreq / 2; // base Sa is 1 octave lower
  const maxFreq = baseFreq * Math.pow(2, octRange);
  return baseFreq * Math.pow(maxFreq / baseFreq, 1 - y);
}

function snapToWesternScale(freq) {
  const rootIdx = NOTES_ALL.indexOf(state.wRoot);
  const baseFreq = BASE_C4 * Math.pow(2, (rootIdx - 0) / 12 - 1);
  const scaleIntervals = SCALES[state.wScale] || SCALES.major;

  let bestF = baseFreq, minD = Infinity;
  for (let oct = 0; oct <= state.wRange; oct++) {
    for (const iv of scaleIntervals) {
      const f = baseFreq * Math.pow(2, oct + iv / 12);
      const d = Math.abs(Math.log2(freq / f));
      if (d < minD) { minD = d; bestF = f; }
    }
  }
  return bestF;
}

function snapToIndianRaga(freq) {
  const raga = INDIAN_RAGAS[state.iRaga];
  const baseFreq = state.iSaFreq / 2;

  if (state.iTuning === 'shruti') {
    // 22 Shruti tuning
    let bestF = baseFreq, minD = Infinity;
    for (let oct = 0; oct < 3; oct++) {
      for (const ratio of SHRUTI_RATIOS) {
        const f = baseFreq * Math.pow(2, oct) * ratio;
        const d = Math.abs(Math.log2(freq / f));
        if (d < minD) { minD = d; bestF = f; }
      }
    }
    return bestF;
  } else {
    // Equal temperament snap
    let bestF = baseFreq, minD = Infinity;
    for (let oct = 0; oct <= 3; oct++) {
      for (const iv of raga.intervals) {
        const f = baseFreq * Math.pow(2, oct + iv / 12);
        const d = Math.abs(Math.log2(freq / f));
        if (d < minD) { minD = d; bestF = f; }
      }
    }
    return bestF;
  }
}

// Convert frequency back to closest Note Name (Western & Indian Swara formats)
function freqToName(f) {
  if (f <= 0) return '---';
  const semi = Math.round(12 * Math.log2(f / 16.3516));
  const idx = ((semi % 12) + 12) % 12;
  const oct = Math.floor(semi / 12);
  const noteStr = NOTES_ALL[idx];
  return (NOTE_DISPLAY[noteStr] || noteStr) + oct;
}

function freqToSwara(f) {
  if (f <= 0) return '---';
  const ratio = f / state.iSaFreq;
  // Map back to nearest Swara in the 12 semitones
  const semitones = Math.round(12 * Math.log2(ratio));
  const normalizedSemi = ((semitones % 12) + 12) % 12;
  const swaras = ['Sa', 're (komal)', 'Re', 'ga (komal)', 'Ga', 'ma', 'Ma (tivra)', 'Pa', 'dha (komal)', 'Dha', 'ni (komal)', 'Ni'];
  const octOffset = Math.floor(semitones / 12);
  const octIndicator = octOffset > 0 ? '⁺' : (octOffset < 0 ? '₋' : '');
  return swaras[normalizedSemi] + octIndicator;
}

function getPinch(lm) {
  const t = lm[THUMB_TIP], ix = lm[INDEX_TIP], w = lm[WRIST], m = lm[MIDDLE_MCP];
  const pinchDist = Math.sqrt((t.x - ix.x)**2 + (t.y - ix.y)**2);
  const handScale = Math.sqrt((w.x - m.x)**2 + (w.y - m.y)**2);
  return handScale > 0.001 ? pinchDist / handScale : 0;
}

/* ---------- Arpeggiator & Gamak timers ---------- */
let arpIdx = 0, lastArpTime = 0;
let lastGamakTime = 0, gamakPhase = 0;

/* ---------- Render Engine (Flicker-Free 60fps) ---------- */
let smoothVol = 0, smoothFreq = 261.63;

function renderLoop(ts) {
  requestAnimationFrame(renderLoop);
  if (!handLandmarker || !$video.videoWidth) return;

  // 1. Maintain Canvas Resolution
  if ($canvas.width !== $video.videoWidth || $canvas.height !== $video.videoHeight) {
    $canvas.width = $video.videoWidth;
    $canvas.height = $video.videoHeight;
  }

  // 2. Clear canvas and Draw mirrored video frame with transparency
  ctx.save();
  ctx.translate($canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.globalAlpha = 0.35;
  ctx.drawImage($video, 0, 0, $canvas.width, $canvas.height);
  ctx.restore();
  ctx.globalAlpha = 1.0;

  // Girly soft pink translucent canvas wash
  ctx.fillStyle = 'rgba(255, 240, 245, 0.08)';
  ctx.fillRect(0, 0, $canvas.width, $canvas.height);

  // 3. Process new tracking data ONLY if camera frame updated (prevents CPU lock)
  if ($video.currentTime !== lastVidTime) {
    lastVidTime = $video.currentTime;
    try {
      const results = handLandmarker.detectForVideo($video, ts);
      latestLandmarks = results.landmarks || [];
    } catch (e) {
      console.warn("MediaPipe model detection error", e);
    }
  }

  const numHands = latestLandmarks.length;
  state.handsDetected = numHands;
  $sHands.textContent = numHands;

  // Mirror landmarks for UI alignment
  const mirrored = latestLandmarks.map(lm => lm.map(p => ({ x: 1 - p.x, y: p.y, z: p.z })));

  // 4. Render skeleton overlay
  for (let i = 0; i < mirrored.length; i++) {
    drawSkeleton(mirrored[i], i);
  }

  // 5. Execute Active Mode Logic
  if (state.mode === 'western') {
    processWestern(mirrored, ts);
  } else if (state.mode === 'indian') {
    processIndian(mirrored, ts);
  } else if (state.mode === 'easyplay') {
    processEasyPlay(mirrored, ts);
  } else if (state.mode === 'webkeys') {
    processWebKeys(mirrored, ts);
  }
}

/* ---------- SKELETON DRAWER ---------- */
function drawSkeleton(landmarks, idx) {
  const w = $canvas.width, h = $canvas.height;
  // Girly colors: Hot Pink and Lilac
  const colors = ['rgba(255, 105, 180, 0.8)', 'rgba(179, 136, 255, 0.8)'];
  const col = colors[idx % 2];

  ctx.strokeStyle = col;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  
  // Connections
  for (const [a, b] of HAND_CONNS) {
    ctx.beginPath();
    ctx.moveTo(landmarks[a].x * w, landmarks[a].y * h);
    ctx.lineTo(landmarks[b].x * w, landmarks[b].y * h);
    ctx.stroke();
  }

  // Joint nodes with sparkliness
  for (let i = 0; i < landmarks.length; i++) {
    const p = landmarks[i];
    const rad = (i === THUMB_TIP || i === INDEX_TIP) ? 6 : 4;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, rad, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, rad * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ---------- WESTERN MODE ---------- */
function processWestern(mirrored, ts) {
  $sScale.textContent = `${state.wRoot} ${state.wScale}`;
  
  if (state.handsDetected === 0) {
    silenceSynth();
    smoothVol = 0;
    updateStatus('---', '0%', '----', '---');
    return;
  }

  // Leftmost hand = Pitch/Melody, Rightmost = Volume/Pinch
  const sorted = [...mirrored].sort((a, b) => a[WRIST].x - b[WRIST].x);
  const pitchHand = sorted[0];
  const volHand = state.handsDetected >= 2 ? sorted[sorted.length - 1] : sorted[0];

  // Volume
  const pinch = getPinch(volHand);
  const targetVol = Math.max(0, Math.min(1, (pinch - 0.15) / 0.85)) * 0.85;
  smoothVol += (targetVol - smoothVol) * 0.25;

  // Raw Pitch
  let freq = getWesternFreq(pitchHand[WRIST].y);

  // Mode: Continuous vs Scale Snap vs Arp
  if (state.wMode === 'scale') {
    freq = snapToWesternScale(freq);
  } else if (state.wMode === 'arp') {
    const baseFreq = snapToWesternScale(freq);
    const intervals = [0, 4, 7]; // Root, 3rd, 5th
    const msPerStep = 250; // default tempo
    if (ts - lastArpTime >= msPerStep) {
      arpIdx = (arpIdx + 1) % 3;
      lastArpTime = ts;
    }
    freq = baseFreq * Math.pow(2, intervals[arpIdx] / 12);
  }

  smoothFreq += (freq - smoothFreq) * 0.25;

  // Playing notes
  let playFreqs = [smoothFreq];
  let chordNameStr = '---';

  // Chord layer toggle
  if (state.wChord && state.handsDetected >= 2) {
    // Add Major triad overlay
    const rootSnap = snapToWesternScale(smoothFreq);
    playFreqs = [smoothFreq, rootSnap * 1.25, rootSnap * 1.5]; // 3rd and 5th
    chordNameStr = 'Triad';
  }

  playSynth(playFreqs, smoothVol, state.wWave, 0.02);

  updateStatus(
    freqToName(smoothFreq),
    Math.round(smoothVol * 100) + '%',
    pinch.toFixed(2),
    chordNameStr
  );

  // Girly sparkle trail drawn at the pitch hand fingertip
  drawSparkle(pitchHand[INDEX_TIP].x * $canvas.width, pitchHand[INDEX_TIP].y * $canvas.height, smoothVol);
}

/* ---------- INDIAN CLASSICAL MODE ---------- */
function processIndian(mirrored, ts) {
  $sScale.textContent = INDIAN_RAGAS[state.iRaga].name;

  if (state.handsDetected === 0) {
    silenceSynth();
    smoothVol = 0;
    updateStatus('---', '0%', '----', '---');
    return;
  }

  const sorted = [...mirrored].sort((a, b) => a[WRIST].x - b[WRIST].x);
  const pitchHand = sorted[0];
  const volHand = state.handsDetected >= 2 ? sorted[sorted.length - 1] : sorted[0];

  // Volume
  const pinch = getPinch(volHand);
  const targetVol = Math.max(0, Math.min(1, (pinch - 0.15) / 0.85)) * 0.85;
  smoothVol += (targetVol - smoothVol) * 0.25;

  // Base frequency
  let freq = getIndianFreq(pitchHand[WRIST].y);

  // Equal vs 22-Shruti scale snapping
  freq = snapToIndianRaga(freq);

  // Instrument Timbre synthesis parameters
  let waveType = 'sine';
  let slideSpeed = 0.025; // Bansuri meend/glide

  if (state.iTimbre === 'bansuri') {
    waveType = 'sine';
    slideSpeed = 0.05; // smooth breathy glide
  } else if (state.iTimbre === 'sitar') {
    waveType = 'triangle';
    slideSpeed = 0.03; // detuned meend
  } else if (state.iTimbre === 'santoor') {
    waveType = 'square';
    slideSpeed = 0.005; // discrete plucked, virtually no glide
  } else if (state.iTimbre === 'veena') {
    waveType = 'sawtooth';
    slideSpeed = 0.04;
  }

  // Gamak gesture (fast hand shake / speed trigger)
  // We look at pitch hand velocity. If hand is moving back/forth quickly, we add vibrato.
  let gamakFreqOffset = 0;
  const isGamakActive = checkGamakActive(pitchHand);
  if (isGamakActive) {
    gamakPhase += 0.45;
    gamakFreqOffset = Math.sin(gamakPhase) * (freq * 0.04); // ±4% wobble
  }

  smoothFreq += ((freq + gamakFreqOffset) - smoothFreq) * 0.25;

  playSynth([smoothFreq], smoothVol, waveType, slideSpeed);

  updateStatus(
    freqToSwara(smoothFreq),
    Math.round(smoothVol * 100) + '%',
    pinch.toFixed(2),
    isGamakActive ? 'Gamak active' : '---'
  );

  drawSparkle(pitchHand[INDEX_TIP].x * $canvas.width, pitchHand[INDEX_TIP].y * $canvas.height, smoothVol);
}

let lastHandX = 0, lastHandY = 0;
function checkGamakActive(hand) {
  const x = hand[WRIST].x;
  const y = hand[WRIST].y;
  const dist = Math.sqrt((x - lastHandX)**2 + (y - lastHandY)**2);
  lastHandX = x;
  lastHandY = y;
  // If moving quickly, activate gamak
  return dist > 0.04;
}

/* ---------- EASY PLAY MODE ---------- */
function processEasyPlay(mirrored, ts) {
  $sScale.textContent = `${state.eKey} ${state.eKeyType} (Easy Play)`;

  if (state.handsDetected === 0) {
    silenceSynth();
    smoothVol = 0;
    updateStatus('---', '0%', '----', '---');
    return;
  }

  const sorted = [...mirrored].sort((a, b) => a[WRIST].x - b[WRIST].x);
  const pitchHand = sorted[0];
  const volHand = state.handsDetected >= 2 ? sorted[sorted.length - 1] : sorted[0];

  // Volume
  const pinch = getPinch(volHand);
  const targetVol = Math.max(0, Math.min(1, (pinch - 0.15) / 0.85)) * 0.85;
  smoothVol += (targetVol - smoothVol) * 0.25;

  // Melody Pitch (Locked strictly to key)
  const rootIdx = NOTES_ALL.indexOf(state.eKey);
  const baseFreq = BASE_C4 * Math.pow(2, (rootIdx + state.eCapo) / 12 - 1);
  const intervals = state.eKeyType === 'major' ? SCALES.major : SCALES.minor;

  let rawFreq = baseFreq * Math.pow(8, 1 - pitchHand[WRIST].y); // wider range for easy play
  
  // STRICT SCALE SNAP (no wrong notes possible)
  let bestF = baseFreq, minD = Infinity;
  for (let oct = 0; oct < 4; oct++) {
    for (const iv of intervals) {
      const f = baseFreq * Math.pow(2, oct + iv / 12);
      const d = Math.abs(Math.log2(rawFreq / f));
      if (d < minD) { minD = d; bestF = f; }
    }
  }

  // Slow legato portamento for easy play (0.09)
  smoothFreq += (bestF - smoothFreq) * 0.1;

  // Chord Pad voice stacking
  let frequencies = [smoothFreq];
  let chordPadStr = '---';

  if (state.eSelectedChordPad >= 0) {
    const prog = EASY_PROGS[state.eProgIdx];
    const roman = prog[state.eSelectedChordPad];
    chordPadStr = roman;

    // Generate triad under the melody note
    const scaleBase = baseFreq;
    const chordRoots = state.eKeyType === 'major' 
      ? { 'I': 0, 'ii': 2, 'iii': 4, 'IV': 5, 'V': 7, 'vi': 9 }
      : { 'i': 0, 'ii': 2, 'III': 3, 'iv': 5, 'v': 7, 'VI': 8, 'VII': 10 };
      
    const rootInterval = chordRoots[roman] || 0;
    const chordF = scaleBase * Math.pow(2, rootInterval / 12);
    
    // Major/Minor triad intervals
    const isMinChord = roman === 'ii' || roman === 'vi' || roman === 'm' || roman === 'i' || roman === 'iv';
    const c3rd = isMinChord ? 3 : 4;
    
    frequencies = [
      smoothFreq,
      chordF / 2,                // bass note
      (chordF / 2) * Math.pow(2, c3rd / 12), // third
      (chordF / 2) * Math.pow(2, 7 / 12)     // fifth
    ];
  }

  playSynth(frequencies, smoothVol, 'sine', 0.08);

  updateStatus(
    freqToName(smoothFreq),
    Math.round(smoothVol * 100) + '%',
    pinch.toFixed(2),
    chordPadStr
  );

  drawSparkle(pitchHand[INDEX_TIP].x * $canvas.width, pitchHand[INDEX_TIP].y * $canvas.height, smoothVol);
}

/* ---------- Decorative Sparkles Drawing ---------- */
function drawSparkle(x, y, vol) {
  if (vol < 0.05) return;
  const size = 15 + vol * 30;
  ctx.save();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.fillStyle = 'rgba(255, 182, 193, 0.4)';
  ctx.shadowColor = '#FF69B4';
  ctx.shadowBlur = 12;

  // Draw cute diamond sparkle
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.quadraticCurveTo(x, y, x + size, y);
  ctx.quadraticCurveTo(x, y, x, y + size);
  ctx.quadraticCurveTo(x, y, x - size, y);
  ctx.quadraticCurveTo(x, y, x, y - size);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// ============================================================
// ★ WEBKEYS VIRTUAL KEYBOARD BUILDER & TRACKING ★
// ============================================================

const WHITE_NOTES = [0, 2, 4, 5, 7, 9, 11]; // C, D, E, F, G, A, B relative intervals
const BLACK_NOTES = [
  { interval: 1, afterWhite: 0 }, // C# after C (index 0)
  { interval: 3, afterWhite: 1 }, // D# after D (index 1)
  { interval: 6, afterWhite: 3 }, // F# after F (index 3)
  { interval: 8, afterWhite: 4 }, // G# after G (index 4)
  { interval: 10, afterWhite: 5 } // A# after A (index 5)
];

const CHORD_TYPES = [
  [[0,4,7,11],'Maj7'],[[0,4,7,10],'7'],[[0,3,7,10],'m7'],
  [[0,3,6,10],'m7b5'],[[0,3,6,9],'dim7'],
  [[0,4,7],'Major'],[[0,3,7],'Minor'],[[0,3,6],'dim'],
  [[0,4,8],'Aug'],[[0,2,7],'Sus2'],[[0,5,7],'Sus4'],
  [[0,4,7,9,11],'Maj9'],[[0,3,7,10,14],'m9'],
];

const WHITE_LABELS = [
  ['`', 'Q', 'W', 'E', 'R', 'T', 'Y'],
  ['U', 'I', 'O', 'P', '[', ']', '\\']
];
const BLACK_LABELS = [
  ['1', '2', '4', '5', '6'],
  ['8', '9', '-', '=', '⌫']
];

function buildKeyboard() {
  if (!$kbWrap) return;
  $kbWrap.innerHTML = '';

  const row = document.createElement('div');
  row.className = 'keys-row';

  const isMobile = window.innerWidth <= 700;
  const wkw = isMobile ? 32 : 64; // white key width
  const bkw = isMobile ? 20 : 38; // black key width
  const totalWhites = 14;
  row.style.width = (totalWhites * wkw) + 'px';

  const rootOffset = SEMITONE_MAP[state.wKeysRoot] || 0;
  const baseOct = state.wKeysOctave;

  // 1. Create White Keys
  const whites = [];
  for (let octOffset = 0; octOffset < 2; octOffset++) {
    const oct = baseOct + octOffset;
    WHITE_NOTES.forEach((interval, idx) => {
      const midi = (oct + 1) * 12 + interval + rootOffset;
      const el = document.createElement('div');
      el.className = 'key-white';
      el.dataset.midi = midi;
      el.dataset.note = NOTE_DISPLAY[(NOTES_ALL[(midi % 12 + 12) % 12])] + oct;
      el.dataset.shortcut = WHITE_LABELS[octOffset][idx] || '';
      
      if (!isMidiInSelectedScale(midi)) {
        el.classList.add('scale-inactive');
      }

      bindKeyboardElementEvents(el, midi);
      row.appendChild(el);
      whites.push(el);
    });
  }

  // 2. Create Black Keys
  for (let octOffset = 0; octOffset < 2; octOffset++) {
    const oct = baseOct + octOffset;
    BLACK_NOTES.forEach((bk, idx) => {
      const midi = (oct + 1) * 12 + bk.interval + rootOffset;
      const el = document.createElement('div');
      el.className = 'key-black';
      el.dataset.midi = midi;
      el.dataset.note = NOTE_DISPLAY[(NOTES_ALL[(midi % 12 + 12) % 12])] + oct;
      el.dataset.shortcut = BLACK_LABELS[octOffset][idx] || '';

      const whiteIdx = octOffset * 7 + bk.afterWhite;
      const leftPx = (whiteIdx + 1) * wkw - Math.round(bkw / 2);
      el.style.left = leftPx + 'px';

      if (!isMidiInSelectedScale(midi)) {
        el.classList.add('scale-inactive');
      }

      bindKeyboardElementEvents(el, midi);
      row.appendChild(el);
    });
  }

  $kbWrap.appendChild(row);
}

function isMidiInSelectedScale(midi) {
  if (state.wKeysScale === 'chromatic') return true;
  const rootOffset = SEMITONE_MAP[state.wKeysRoot] || 0;
  const intervalFromRoot = (midi - rootOffset) % 12;
  const normalizedInterval = (intervalFromRoot + 12) % 12;
  
  let scaleIntervals = [];
  if (state.wKeysScale === 'major') scaleIntervals = SCALES.major;
  else if (state.wKeysScale === 'minor') scaleIntervals = SCALES.minor;
  else if (state.wKeysScale === 'pentatonic') scaleIntervals = SCALES.penta_maj;
  else return true;

  return scaleIntervals.includes(normalizedInterval);
}

function bindKeyboardElementEvents(el, midi) {
  el.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    triggerDiscreteNote(midi, state.wKeysInstrument, 0.8, state.wKeysSustain);
    el.classList.add('active');
  });

  const stopEvent = () => {
    stopDiscreteNote(midi);
    el.classList.remove('active');
  };
  el.addEventListener('mouseup', stopEvent);
  el.addEventListener('mouseleave', stopEvent);
}

function detectChordName(midiNotes) {
  if (!midiNotes || !midiNotes.length) return '---';
  if (midiNotes.length === 1) {
    const pitchClass = midiNotes[0] % 12;
    return NOTES_ALL[pitchClass] + (Math.floor(midiNotes[0] / 12) - 1);
  }
  
  let pcs = midiNotes.map(m => m % 12);
  pcs = [...new Set(pcs)].sort((a,b) => a - b);
  
  for (let ci = 0; ci < CHORD_TYPES.length; ci++) {
    const intervals = CHORD_TYPES[ci][0];
    const name = CHORD_TYPES[ci][1];
    
    for (let ri = 0; ri < pcs.length; ri++) {
      const root = pcs[ri];
      const shifted = pcs.map(p => (p - root + 12) % 12).sort((a,b) => a - b);
      if (intervals.length === shifted.length && intervals.every((v,i) => v === shifted[i])) {
        return NOTES_ALL[root] + ' ' + name;
      }
    }
  }
  
  return pcs.map(p => NOTES_ALL[p]).join('+');
}

// Hand hover & play intersection loop
function processWebKeys(mirrored, ts) {
  $sScale.textContent = `${state.wKeysRoot} ${state.wKeysScale}`;

  if (state.handsDetected === 0) {
    // Release all
    if (activeKeyboardNotes.size > 0) {
      for (const [midi] of activeKeyboardNotes) {
        stopDiscreteNote(midi);
      }
      document.querySelectorAll('.key-white, .key-black').forEach(k => k.classList.remove('active'));
    }
    updateStatus('---', '0%', '----', '---');
    return;
  }

  // Leftmost hand = Play pointer, Rightmost = Volume / Pinch Trigger
  const sorted = [...mirrored].sort((a, b) => a[WRIST].x - b[WRIST].x);
  const playHand = sorted[0];
  const volHand = state.handsDetected >= 2 ? sorted[sorted.length - 1] : sorted[0];

  const pinch = getPinch(volHand);
  
  // Volume: open hand = loud, pinched = quiet
  const targetVol = Math.max(0, Math.min(1, (pinch - 0.15) / 0.85)) * 0.85;
  smoothVol += (targetVol - smoothVol) * 0.25;

  // Let's find index finger location
  const indexTip = playHand[INDEX_TIP];
  const clientX = indexTip.x * window.innerWidth;
  const clientY = indexTip.y * window.innerHeight;

  const currentFramePlayingMidi = new Set();
  let hoveredMidi = -1;

  // Find DOM element under index fingertip
  const hoveredElement = document.elementFromPoint(clientX, clientY);
  if (hoveredElement) {
    const keyEl = hoveredElement.closest('.key-white, .key-black');
    if (keyEl && !keyEl.classList.contains('scale-inactive')) {
      hoveredMidi = parseInt(keyEl.dataset.midi);
      
      let isPlayTriggered = false;
      if (state.wKeysGesture === 'hover') {
        // Trigger if volume is not fully pinched off
        isPlayTriggered = smoothVol > 0.05;
      } else if (state.wKeysGesture === 'pinch') {
        // Trigger only if we pinch
        isPlayTriggered = pinch < 0.18;
      }

      if (isPlayTriggered) {
        currentFramePlayingMidi.add(hoveredMidi);
      }
    }
  }

  // Trigger new notes & release old notes
  const vol = state.wKeysGesture === 'pinch' ? 0.75 : smoothVol;
  
  for (const midi of currentFramePlayingMidi) {
    if (!activeKeyboardNotes.has(midi)) {
      triggerDiscreteNote(midi, state.wKeysInstrument, vol, state.wKeysSustain);
      const keyEl = document.querySelector(`[data-midi="${midi}"]`);
      if (keyEl) keyEl.classList.add('active');
    }
  }

  for (const [midi] of activeKeyboardNotes) {
    if (!currentFramePlayingMidi.has(midi)) {
      stopDiscreteNote(midi);
      const keyEl = document.querySelector(`[data-midi="${midi}"]`);
      if (keyEl) keyEl.classList.remove('active');
    }
  }

  // Display status
  const activeMidiList = Array.from(activeKeyboardNotes.keys());
  const chordName = activeMidiList.length > 0 ? detectChordName(activeMidiList) : '---';
  const melodyDisplay = hoveredMidi > 0 ? freqToName(440 * Math.pow(2, (hoveredMidi - 69) / 12)) : '---';

  updateStatus(
    melodyDisplay,
    Math.round(smoothVol * 100) + '%',
    pinch.toFixed(2),
    chordName
  );

  // Draw glowing keyboard cursor on canvas
  const canvasX = indexTip.x * $canvas.width;
  const canvasY = indexTip.y * $canvas.height;
  const isPinching = pinch < 0.18;
  drawKeyboardCursor(canvasX, canvasY, isPinching);
}

function drawKeyboardCursor(x, y, isPinching) {
  ctx.save();
  ctx.shadowColor = isPinching ? '#B388FF' : '#FF69B4';
  ctx.shadowBlur = 15;
  ctx.fillStyle = isPinching ? 'rgba(179, 136, 255, 0.8)' : 'rgba(255, 105, 180, 0.8)';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2.5;

  ctx.beginPath();
  ctx.arc(x, y, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* ---------- UI Event Listeners ---------- */
function setupUI() {
  // Mode selection tabs
  $tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      $tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      setMode(tab.dataset.mode);
    });
  });

  // Mode 1: Western listeners
  document.getElementById('w-mode').addEventListener('change', (e) => { state.wMode = e.target.value; });
  document.getElementById('w-root').addEventListener('change', (e) => { state.wRoot = e.target.value; });
  document.getElementById('w-scale').addEventListener('change', (e) => { state.wScale = e.target.value; });
  document.getElementById('w-wave').addEventListener('change', (e) => { state.wWave = e.target.value; });
  document.getElementById('w-range').addEventListener('change', (e) => { state.wRange = parseInt(e.target.value); });
  document.getElementById('w-chord').addEventListener('change', (e) => { state.wChord = e.target.checked; });

  // Mode 2: Indian Classical listeners
  document.getElementById('i-raga').addEventListener('change', (e) => {
    state.iRaga = e.target.value;
    updateDrone();
  });
  document.getElementById('i-timbre').addEventListener('change', (e) => { state.iTimbre = e.target.value; });
  document.getElementById('i-tuning').addEventListener('change', (e) => { state.iTuning = e.target.value; });
  document.getElementById('i-tanpura').addEventListener('change', (e) => {
    state.iTanpura = e.target.checked;
    updateDrone();
  });
  document.getElementById('i-drone-vol').addEventListener('input', (e) => {
    state.iDroneVol = parseFloat(e.target.value) / 100;
    updateDrone();
  });
  
  // Set Sa button calibration gesture / tap
  document.getElementById('i-set-sa').addEventListener('click', () => {
    // Calibrate Sa to current playing frequency, or reset to C4
    if (state.handsDetected > 0 && smoothFreq > 50) {
      state.iSaFreq = smoothFreq;
      console.log('Sa calibrated to:', state.iSaFreq);
    } else {
      state.iSaFreq = BASE_C4;
    }
    updateDrone();
  });

  // Mode 3: Easy Play listeners
  document.getElementById('e-key').addEventListener('change', (e) => { state.eKey = e.target.value; updateEasyPlayPads(); });
  document.getElementById('e-keytype').addEventListener('change', (e) => { state.eKeyType = e.target.value; updateEasyPlayPads(); });
  document.getElementById('e-capo').addEventListener('input', (e) => {
    state.eCapo = parseInt(e.target.value);
    document.getElementById('e-capo-val').textContent = (state.eCapo >= 0 ? '+' : '') + state.eCapo;
  });
  document.getElementById('e-prog').addEventListener('change', (e) => {
    state.eProgIdx = parseInt(e.target.value);
    updateEasyPlayPads();
  });

  // Easy Play Chord Pads click/hover
  const pads = document.querySelectorAll('.chord-pad');
  pads.forEach(pad => {
    pad.addEventListener('mousedown', () => {
      const idx = parseInt(pad.dataset.idx);
      state.eSelectedChordPad = idx;
      pads.forEach(p => p.classList.remove('active'));
      pad.classList.add('active');
    });
    pad.addEventListener('mouseup', () => {
      state.eSelectedChordPad = -1;
      pad.classList.remove('active');
    });
    pad.addEventListener('mouseleave', () => {
      if (state.eSelectedChordPad === parseInt(pad.dataset.idx)) {
        state.eSelectedChordPad = -1;
        pad.classList.remove('active');
      }
    });
  });

  // Mood Presets click
  const moodBtns = document.querySelectorAll('.mood-btn');
  moodBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const moodKey = btn.dataset.mood;
      moodBtns.forEach(b => b.classList.remove('active'));
      
      if (state.eActiveMood === moodKey) {
        state.eActiveMood = null;
      } else {
        state.eActiveMood = moodKey;
        btn.classList.add('active');
        applyMoodPreset(moodKey);
      }
    });
  });

  // WebKeys Toolbar Listeners
  document.getElementById('k-instrument').addEventListener('change', (e) => {
    state.wKeysInstrument = e.target.value;
  });
  document.getElementById('k-gesture').addEventListener('change', (e) => {
    state.wKeysGesture = e.target.value;
  });
  document.getElementById('k-root').addEventListener('change', (e) => {
    state.wKeysRoot = e.target.value;
    buildKeyboard();
  });
  document.getElementById('k-scale').addEventListener('change', (e) => {
    state.wKeysScale = e.target.value;
    buildKeyboard();
  });
  document.getElementById('k-octave').addEventListener('change', (e) => {
    state.wKeysOctave = parseInt(e.target.value);
    buildKeyboard();
  });
  document.getElementById('k-sustain').addEventListener('input', (e) => {
    state.wKeysSustain = parseInt(e.target.value);
    document.getElementById('k-sustain-val').textContent = (state.wKeysSustain / 1000).toFixed(1) + 's';
  });
  document.getElementById('k-reverb').addEventListener('input', (e) => {
    state.wKeysReverb = parseInt(e.target.value) / 100;
    document.getElementById('k-reverb-val').textContent = e.target.value + '%';
    // Dynamically adjust master delay feedback mapping to reverb percent
    if (feedbackGain) feedbackGain.gain.setValueAtTime(state.wKeysReverb * 0.65, audioCtx.currentTime);
  });

  // Computer Keyboard input support (WebKeys key notes replication)
  const KEY_MAP = {
    '`': { oct: 0, note: 0 },
    'q': { oct: 0, note: 2 },
    'w': { oct: 0, note: 4 },
    'e': { oct: 0, note: 5 },
    'r': { oct: 0, note: 7 },
    't': { oct: 0, note: 9 },
    'y': { oct: 0, note: 11 },
    'u': { oct: 1, note: 0 },
    'i': { oct: 1, note: 2 },
    'o': { oct: 1, note: 4 },
    'p': { oct: 1, note: 5 },
    '[': { oct: 1, note: 7 },
    ']': { oct: 1, note: 9 },
    '\\': { oct: 1, note: 11 },
    '1': { oct: 0, note: 1 },
    '2': { oct: 0, note: 3 },
    '4': { oct: 0, note: 6 },
    '5': { oct: 0, note: 8 },
    '6': { oct: 0, note: 10 },
    '8': { oct: 1, note: 1 },
    '9': { oct: 1, note: 3 },
    '-': { oct: 1, note: 6 },
    '=': { oct: 1, note: 8 },
    'backspace': { oct: 1, note: 10 }
  };

  const activeKeysPressed = new Set();

  window.addEventListener('keydown', (e) => {
    if (e.repeat || document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT') return;
    if (state.mode !== 'webkeys') return;

    let k = e.key.toLowerCase();
    // Normalize Backspace
    if (e.key === 'Backspace') k = 'backspace';

    const map = KEY_MAP[k];
    if (map) {
      const rootOffset = SEMITONE_MAP[state.wKeysRoot] || 0;
      const midi = (state.wKeysOctave + 1 + map.oct) * 12 + map.note + rootOffset;
      if (isMidiInSelectedScale(midi)) {
        if (!activeKeysPressed.has(midi)) {
          activeKeysPressed.add(midi);
          triggerDiscreteNote(midi, state.wKeysInstrument, 0.8, state.wKeysSustain);
          const keyEl = document.querySelector(`[data-midi="${midi}"]`);
          if (keyEl) keyEl.classList.add('active');

          // Update display status
          const activeMidiList = Array.from(activeKeyboardNotes.keys());
          const chordName = activeMidiList.length > 0 ? detectChordName(activeMidiList) : '---';
          const melodyDisplay = freqToName(440 * Math.pow(2, (midi - 69) / 12));
          updateStatus(melodyDisplay, '80%', '0.00', chordName);
        }
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    if (state.mode !== 'webkeys') return;

    let k = e.key.toLowerCase();
    if (e.key === 'Backspace') k = 'backspace';

    const map = KEY_MAP[k];
    if (map) {
      const rootOffset = SEMITONE_MAP[state.wKeysRoot] || 0;
      const midi = (state.wKeysOctave + 1 + map.oct) * 12 + map.note + rootOffset;
      activeKeysPressed.delete(midi);
      stopDiscreteNote(midi);
      const keyEl = document.querySelector(`[data-midi="${midi}"]`);
      if (keyEl) keyEl.classList.remove('active');

      // Update display status
      const activeMidiList = Array.from(activeKeyboardNotes.keys());
      const chordName = activeMidiList.length > 0 ? detectChordName(activeMidiList) : '---';
      const melodyDisplay = activeMidiList.length > 0 ? freqToName(440 * Math.pow(2, (activeMidiList[activeMidiList.length - 1] - 69) / 12)) : '---';
      updateStatus(melodyDisplay, '0%', '0.00', chordName);
    }
  });

  window.addEventListener('resize', () => {
    if (state.mode === 'webkeys') {
      buildKeyboard();
    }
  });

  // Initial toolbars state
  setMode('western');
}

function setMode(mode) {
  state.mode = mode;
  $tbWestern.classList.toggle('active', mode === 'western');
  $tbIndian.classList.toggle('active', mode === 'indian');
  $tbEasyplay.classList.toggle('active', mode === 'easyplay');
  $tbWebkeys.classList.toggle('active', mode === 'webkeys');
  $kbWrap.classList.toggle('active', mode === 'webkeys');
  const $kbHint = document.getElementById('keyboard-hint');
  if ($kbHint) {
    $kbHint.classList.toggle('active', mode === 'webkeys');
  }
  $chordPadsContainer.classList.toggle('active', mode === 'easyplay');
  $moodPresetsContainer.classList.toggle('active', mode === 'easyplay');

  // Silence any sliding oscillators when switching modes
  silenceSynth();

  updateDrone();
  updateEasyPlayPads();

  if (mode === 'webkeys') {
    buildKeyboard();
  } else {
    // Release any stuck virtual keyboard voices
    for (const [midi] of activeKeyboardNotes) {
      stopDiscreteNote(midi);
    }
  }
}

function updateEasyPlayPads() {
  const prog = EASY_PROGS[state.eProgIdx];
  const pads = document.querySelectorAll('.chord-pad');
  pads.forEach((pad, idx) => {
    pad.textContent = prog[idx];
  });
}

function applyMoodPreset(key) {
  const mood = MOODS[key];
  if (!mood) return;

  state.eKey = mood.key;
  state.eKeyType = mood.type;
  state.eCapo = mood.capo;

  document.getElementById('e-key').value = mood.key;
  document.getElementById('e-keytype').value = mood.type;
  document.getElementById('e-capo').value = mood.capo;
  document.getElementById('e-capo-val').textContent = (mood.capo >= 0 ? '+' : '') + mood.capo;

  // Select suitable progression index matching mood
  if (key === 'rainy') {
    state.eProgIdx = 1; // vi-IV-I-V
  } else if (key === 'warm') {
    state.eProgIdx = 0; // I-V-vi-IV
  } else if (key === 'heartbreak') {
    state.eProgIdx = 2; // I-vi-IV-V
  }
  document.getElementById('e-prog').value = state.eProgIdx;
  updateEasyPlayPads();
}

/* ---------- Startup ---------- */
async function start() {
  $startBtn.disabled = true;
  $startBtn.textContent = '⏳ Loading…';
  $startErr.classList.remove('visible');

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    $video.srcObject = stream;
    await $video.play();

    initAudio();
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    await initHands();

    $start.classList.add('hidden');
    $app.classList.add('visible');
    setupUI();
    
    // Start continuous 60fps render loop
    requestAnimationFrame(renderLoop);

  } catch (err) {
    console.error('Camera/tracking load failed:', err);
    $startBtn.disabled = false;
    $startBtn.textContent = '💖 Start Playing';
    $startErr.textContent = `Error: ${err.message || err}. Please check permissions and try again.`;
    $startErr.classList.add('visible');
  }
}

$startBtn.addEventListener('click', start);
