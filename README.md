# MineMelody 💖✨🎵

MineMelody is a stunning, browser-based musical instrument that lets you play music by moving your hands in front of your webcam. It is built entirely on the client side using **MediaPipe Hands** for real-time hand tracking and the **Web Audio API** for high-fidelity polyphonic sound synthesis. No audio samples or backend services are used, and no data ever leaves your browser. 🔒

---

## 🎀 Core Mechanics

* **Webcam tracking**: Tracks up to 2 hands in real time with a sparkling pink & purple skeleton overlay.
* **Dual Hand Control**:
  * **Left Hand**: Controls the melody pitch (vertical Y position; higher hand = higher pitch).
  * **Right Hand**: Controls the volume and articulation (pinch distance between thumb and index finger; open hand = loud, pinch = quiet).
* **Single Hand Mode**: If only one hand is visible, it controls both pitch (Y axis) and volume/articulation (pinch).
* **Sparkle Trails**: Moving your hand leaves a glowing, colored particle trail on the screen.

---

## 🎹 Interaction Modes

MineMelody features 4 top-level modes, each with custom layouts, instrument timbres, and pitch mappings:

### 1. Western Mode 🎹
* **Continuous (Theremin)**: Smooth, sliding frequency sweep.
* **Scale Snap**: Snaps notes automatically to the selected scale so you never play out of key.
* **Arpeggiator**: Cycles through notes in a triad based on your hand height.
* **Scale Options**: Major, Minor, Pentatonic Major/Minor, Blues, Dorian, Mixolydian, Whole Tone, and Chromatic.
* **Instruments**: Sine Wave, Grand Piano, Violin, Organ, Synth, Harmonium.
* **Chords Layer**: Toggle chord overlay to play automatic harmony lines when two hands are tracked.

### 2. Indian Classical Mode 🪷
* **Ragas**: Yaman, Bhupali, Kafi, Bhairav, and Malkauns.
* **Tuning Modes**: Equal Temperament or **22-Shruti** just intonation tuning.
* **Drone (Tanpura)**: Customizable drone volume to back your melodies.
* **Gamak Vibrato**: Speed tracking adds organic Indian classical vocal vibrato (Gamak) when shaking your hand.
* **Timbre Options**: Bansuri, Sitar, Santoor, and Veena.

### 3. Easy Play 💕
* **Progression Pads**: Hover over Chord progression buttons (e.g. `I-V-vi-IV`, `vi-IV-I-V`) to generate gorgeous triad harmonies instantly under your melody.
* **Mood Presets**: One-click filters configured for different emotional ranges:
  * 🌧️ **Rainy Day** (Sad Minor chords with soft reverb)
  * ☀️ **Warm & Nostalgic** (Bright Major triads)
  * 💔 **Heartbreak Ballad** (Dramatic minor transitions)
* **Capo Slider**: Transpose the play scale on the fly.

### 4. WebKeys Mode ✨
* **Centered Virtual Keyboard**: A transparent, glassmorphic piano overlay positioned in the middle of your screen for easy hand-hover play.
* **Hover or Pinch triggers**: Customize whether keys trigger by hovering over them or by pinching your fingers.
* **Chord Detection**: Analyzes active notes and displays the chord name (e.g. `CMaj7`, `Am7`, `G7`) on screen in real time.
* **Computer Keyboard Shortcuts**: Use your physical keyboard keys to trigger piano notes directly:
  * **White Keys**: `` ` `` (tilde), `Q`, `W`, `E`, `R`, `T`, `Y`, `U`, `I`, `O`, `P`, `[`, `]`, `\`
  * **Black Keys**: `1`, `2`, `4`, `5`, `6`, `8`, `9`, `-`, `=`, `Backspace`

---

## 🚀 Running Locally

To run the application locally, you just need a simple static web server:

1. Clone the repository:
   ```bash
   git clone https://github.com/jadhavJester/MineMelody.git
   cd MineMelody
   ```
2. Start a local server:
   ```bash
   npx http-server -p 3000
   ```
3. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

---

## 🎨 Theme & Design
MineMelody uses a customized **Girly Pink Glassmorphism Theme** featuring:
* A warm pink-lilac gradient background.
* Translucent panels with soft blurs (`backdrop-filter`).
* Vibrant pink and lavender interactive UI details.
* Responsive desktop and mobile layouts.
