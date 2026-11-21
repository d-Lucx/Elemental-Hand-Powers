import * as THREE from 'three';

import {PowerId} from '../types.ts';

const _camPos = new THREE.Vector3();
const _camFwd = new THREE.Vector3();
const _camUp = new THREE.Vector3();

/**
 * Procedural Web Audio API spatial synthesizer using HRTF PannerNodes
 * synced to the XR camera for congruent elemental pseudo-haptic feedback.
 */
export class SpatialAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  muted = false;
  private lastRibbonNoteAt = 0;
  private ribbonStep = 0;
  private lastStreamTickAt = 0;

  ensureStarted(): void {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as {webkitAudioContext: typeof AudioContext})
          .webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.72;
      this.masterGain.connect(this.ctx.destination);
      this.noiseBuffer = this.createNoiseBuffer(this.ctx);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        muted ? 0 : 0.72,
        this.ctx.currentTime,
        0.04
      );
    }
  }

  /**
   * Syncs the Web Audio AudioListener pose to the active XR camera each frame.
   */
  updateListener(camera: THREE.Camera): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const listener = this.ctx.listener;
    camera.getWorldPosition(_camPos);
    camera.getWorldDirection(_camFwd);
    _camUp.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();

    const now = this.ctx.currentTime;
    if (listener.positionX) {
      listener.positionX.setValueAtTime(_camPos.x, now);
      listener.positionY.setValueAtTime(_camPos.y, now);
      listener.positionZ.setValueAtTime(_camPos.z, now);
      listener.forwardX.setValueAtTime(_camFwd.x, now);
      listener.forwardY.setValueAtTime(_camFwd.y, now);
      listener.forwardZ.setValueAtTime(_camFwd.z, now);
      listener.upX.setValueAtTime(_camUp.x, now);
      listener.upY.setValueAtTime(_camUp.y, now);
      listener.upZ.setValueAtTime(_camUp.z, now);
    }
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = ctx.sampleRate * 1.5;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private createPanner(position: THREE.Vector3): PannerNode | null {
    if (!this.ctx || !this.masterGain) return null;
    const panner = this.ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 0.6;
    panner.maxDistance = 18;
    panner.rolloffFactor = 1.15;
    const now = this.ctx.currentTime;
    panner.positionX.setValueAtTime(position.x, now);
    panner.positionY.setValueAtTime(position.y, now);
    panner.positionZ.setValueAtTime(position.z, now);
    panner.connect(this.masterGain);
    return panner;
  }

  playCastCue(power: PowerId, position: THREE.Vector3): void {
    this.ensureStarted();
    if (!this.ctx || this.muted) return;
    switch (power) {
      case 'fireball':
        this.playFireballLaunch(position, 1.0);
        break;
      case 'rainbow-ribbons':
        this.playRainbowShimmer(position);
        break;
      case 'earth-shield':
        this.playEarthThud(position);
        break;
      case 'frost-lance':
        this.playFrostTick(position);
        break;
      case 'lightning-tether':
      case 'chain-lightning':
        this.playElectricArc(position);
        break;
      case 'kinetic-gale':
        this.playShockwave(position);
        break;
      case 'sky-updraft':
        this.playWindSwirl(position, 520);
        break;
      case 'tidal-vortex':
        this.playWindSwirl(position, 280);
        break;
      case 'magma-bolt':
        this.playFireballLaunch(position, 1.35);
        break;
      case 'verdant-flora':
        this.playFloraChime(position);
        break;
      case 'plasma-core':
        this.playPlasmaPulse(position);
        break;
      case 'void-dome':
        this.playVoidDome(position);
        break;
    }
  }

  playFireballLaunch(position: THREE.Vector3, powerScale = 1): void {
    this.ensureStarted();
    if (!this.ctx || !this.noiseBuffer || this.muted) return;
    const panner = this.createPanner(position);
    if (!panner) return;
    const now = this.ctx.currentTime;

    // Filtered crackle whoosh
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(240 * powerScale, now);
    filter.frequency.exponentialRampToValueAtTime(980 * powerScale, now + 0.14);
    filter.frequency.exponentialRampToValueAtTime(160, now + 0.45);
    filter.Q.value = 1.6;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.42, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);

    noise.connect(filter).connect(gain).connect(panner);
    noise.start(now);
    noise.stop(now + 0.5);

    // Warm sub thump
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(145 * powerScale, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.28);
    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(0.32, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(oscGain).connect(panner);
    osc.start(now);
    osc.stop(now + 0.32);
  }

  playEarthThud(position: THREE.Vector3): void {
    this.ensureStarted();
    if (!this.ctx || !this.noiseBuffer || this.muted) return;
    const panner = this.createPanner(position);
    if (!panner) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(115, now);
    osc.frequency.exponentialRampToValueAtTime(34, now + 0.34);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.55, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    osc.connect(g).connect(panner);
    osc.start(now);
    osc.stop(now + 0.4);

    // Stone scrape burst
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(420, now);
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.26, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    noise.connect(lp).connect(ng).connect(panner);
    noise.start(now);
    noise.stop(now + 0.25);
  }

  playRainbowShimmer(position: THREE.Vector3): void {
    const nowMs = performance.now();
    if (nowMs - this.lastRibbonNoteAt < 130) return;
    this.lastRibbonNoteAt = nowMs;
    this.ensureStarted();
    if (!this.ctx || this.muted) return;
    const panner = this.createPanner(position);
    if (!panner) return;
    const now = this.ctx.currentTime;

    const pentatonic = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66];
    const freq = pentatonic[this.ribbonStep % pentatonic.length];
    this.ribbonStep++;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.03, now + 0.22);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.14, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    osc.connect(g).connect(panner);
    osc.start(now);
    osc.stop(now + 0.35);
  }

  playFrostTick(position: THREE.Vector3): void {
    const nowMs = performance.now();
    if (nowMs - this.lastStreamTickAt < 95) return;
    this.lastStreamTickAt = nowMs;
    this.ensureStarted();
    if (!this.ctx || !this.noiseBuffer || this.muted) return;
    const panner = this.createPanner(position);
    if (!panner) return;
    const now = this.ctx.currentTime;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(2400, now);
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.14, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    noise.connect(hp).connect(ng).connect(panner);
    noise.start(now);
    noise.stop(now + 0.16);

    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1650 + Math.random() * 600, now);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.08, now);
    og.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(og).connect(panner);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  playElectricArc(position: THREE.Vector3): void {
    const nowMs = performance.now();
    if (nowMs - this.lastStreamTickAt < 110) return;
    this.lastStreamTickAt = nowMs;
    this.ensureStarted();
    if (!this.ctx || !this.noiseBuffer || this.muted) return;
    const panner = this.createPanner(position);
    if (!panner) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110 + Math.random() * 80, now);
    osc.frequency.linearRampToValueAtTime(480 + Math.random() * 240, now + 0.08);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1400, now);
    bp.Q.value = 3.2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.22, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(bp).connect(g).connect(panner);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  playShockwave(position: THREE.Vector3): void {
    this.ensureStarted();
    if (!this.ctx || !this.noiseBuffer || this.muted) return;
    const panner = this.createPanner(position);
    if (!panner) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.55);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.6, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.58);
    osc.connect(g).connect(panner);
    osc.start(now);
    osc.stop(now + 0.6);

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1200, now);
    lp.frequency.exponentialRampToValueAtTime(180, now + 0.45);
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.32, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
    noise.connect(lp).connect(ng).connect(panner);
    noise.start(now);
    noise.stop(now + 0.5);
  }

  playWindSwirl(position: THREE.Vector3, centerFreq: number): void {
    this.ensureStarted();
    if (!this.ctx || !this.noiseBuffer || this.muted) return;
    const panner = this.createPanner(position);
    if (!panner) return;
    const now = this.ctx.currentTime;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(centerFreq * 0.7, now);
    bp.frequency.exponentialRampToValueAtTime(centerFreq * 1.8, now + 0.28);
    bp.frequency.exponentialRampToValueAtTime(centerFreq, now + 0.55);
    bp.Q.value = 3.5;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.28, now + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    noise.connect(bp).connect(g).connect(panner);
    noise.start(now);
    noise.stop(now + 0.62);
  }

  playFloraChime(position: THREE.Vector3): void {
    const nowMs = performance.now();
    if (nowMs - this.lastStreamTickAt < 220) return;
    this.lastStreamTickAt = nowMs;
    this.ensureStarted();
    if (!this.ctx || this.muted) return;
    const panner = this.createPanner(position);
    if (!panner) return;
    const now = this.ctx.currentTime;

    const chord = [392.0, 493.88, 587.33];
    chord.forEach((f, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now + idx * 0.04);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.001, now + idx * 0.04);
      g.gain.linearRampToValueAtTime(0.1, now + idx * 0.04 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.04 + 0.45);
      osc.connect(g).connect(panner);
      osc.start(now + idx * 0.04);
      osc.stop(now + idx * 0.04 + 0.48);
    });
  }

  playPlasmaPulse(position: THREE.Vector3): void {
    this.ensureStarted();
    if (!this.ctx || this.muted) return;
    const panner = this.createPanner(position);
    if (!panner) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(92, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.35);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(520, now);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.24, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
    osc.connect(lp).connect(g).connect(panner);
    osc.start(now);
    osc.stop(now + 0.45);
  }

  playVoidDome(position: THREE.Vector3): void {
    this.ensureStarted();
    if (!this.ctx || this.muted) return;
    const panner = this.createPanner(position);
    if (!panner) return;
    const now = this.ctx.currentTime;

    [220, 329.63, 440, 659.25].forEach((freq) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.96, now + 0.7);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(0.09, now + 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
      osc.connect(g).connect(panner);
      osc.start(now);
      osc.stop(now + 0.78);
    });
  }

  playCrystalShatter(position: THREE.Vector3): void {
    this.ensureStarted();
    if (!this.ctx || this.muted) return;
    const panner = this.createPanner(position);
    if (!panner) return;
    const now = this.ctx.currentTime;

    for (let i = 0; i < 4; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      const base = 1100 + Math.random() * 1400;
      osc.frequency.setValueAtTime(base, now + i * 0.025);
      osc.frequency.exponentialRampToValueAtTime(base * 0.6, now + i * 0.025 + 0.14);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.14, now + i * 0.025);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.025 + 0.16);
      osc.connect(g).connect(panner);
      osc.start(now + i * 0.025);
      osc.stop(now + i * 0.025 + 0.18);
    }
  }

  playHeadGesture(kind: 'nod' | 'shake', position: THREE.Vector3): void {
    this.ensureStarted();
    if (!this.ctx || this.muted) return;
    if (kind === 'nod') {
      this.playShockwave(position);
      this.playPlasmaPulse(position);
    } else {
      this.playCrystalShatter(position);
    }
  }

  dispose(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.masterGain = null;
    this.noiseBuffer = null;
  }
}
