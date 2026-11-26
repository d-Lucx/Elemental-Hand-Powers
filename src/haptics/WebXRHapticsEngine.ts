import * as xb from 'xrblocks';

import {HandSide, PowerId} from '../types.ts';

export type HapticTarget = HandSide | 'both';

export type PhysicsContactKind =
  | 'crystal'
  | 'prop'
  | 'surface'
  | 'deflect'
  | 'shatter'
  | 'tether-hum';

export type ProjectileImpactKind =
  | 'fireball'
  | 'magma-bolt'
  | 'frost-shard'
  | 'plasma-core'
  | 'bounce';

interface HapticPulseStep {
  delayMs: number;
  intensity: number;
  durationMs: number;
  /** Ratio of high-frequency weak motor to low-frequency strong motor (0..1.35). */
  weakRatio?: number;
}

interface ScheduledHapticPulse {
  fireAtMs: number;
  target: HapticTarget;
  intensity: number;
  durationMs: number;
  priority: number;
  weakRatio: number;
}

interface SpellHapticProfile {
  priority: number;
  /** Baseline elemental weight (0..1) reflecting the spell's innate power tier. */
  basePowerWeight: number;
  /** Default dual-rumble texture: lower = deep bass rumble, higher = crisp buzz. */
  weakRatio: number;
  steps: readonly HapticPulseStep[];
}

/** Structural interface covering modern Gamepad vibrationActuator (dual-rumble). */
interface DualRumbleActuator {
  playEffect?: (
    type: string,
    params: {
      startDelay?: number;
      duration: number;
      weakMagnitude: number;
      strongMagnitude: number;
    }
  ) => Promise<unknown>;
  pulse?: (value: number, duration: number) => Promise<boolean>;
}

/**
 * Per-power haptic vibration envelopes tuned to each element's tactile feel,
 * power tier, and dual-rumble frequency character.
 */
const SPELL_HAPTIC_PATTERNS: Record<PowerId, SpellHapticProfile> = {
  fireball: {
    priority: 3,
    basePowerWeight: 0.78,
    weakRatio: 0.65,
    steps: [
      {delayMs: 0, intensity: 0.82, durationMs: 92, weakRatio: 0.58},
      {delayMs: 98, intensity: 0.36, durationMs: 50, weakRatio: 0.88},
    ],
  },
  'rainbow-ribbons': {
    priority: 1,
    basePowerWeight: 0.35,
    weakRatio: 1.25,
    steps: [{delayMs: 0, intensity: 0.24, durationMs: 42, weakRatio: 1.25}],
  },
  'earth-shield': {
    priority: 3,
    basePowerWeight: 0.88,
    weakRatio: 0.35,
    steps: [
      {delayMs: 0, intensity: 0.92, durationMs: 110, weakRatio: 0.32},
      {delayMs: 118, intensity: 0.54, durationMs: 68, weakRatio: 0.45},
    ],
  },
  'frost-lance': {
    priority: 1,
    basePowerWeight: 0.42,
    weakRatio: 1.3,
    steps: [{delayMs: 0, intensity: 0.28, durationMs: 28, weakRatio: 1.3}],
  },
  'lightning-tether': {
    priority: 2,
    basePowerWeight: 0.65,
    weakRatio: 1.15,
    steps: [{delayMs: 0, intensity: 0.58, durationMs: 55, weakRatio: 1.15}],
  },
  'kinetic-gale': {
    priority: 3,
    basePowerWeight: 0.92,
    weakRatio: 0.5,
    steps: [
      {delayMs: 0, intensity: 0.96, durationMs: 128, weakRatio: 0.45},
      {delayMs: 138, intensity: 0.42, durationMs: 58, weakRatio: 0.85},
    ],
  },
  'sky-updraft': {
    priority: 2,
    basePowerWeight: 0.62,
    weakRatio: 0.92,
    steps: [
      {delayMs: 0, intensity: 0.36, durationMs: 55, weakRatio: 0.95},
      {delayMs: 66, intensity: 0.66, durationMs: 88, weakRatio: 0.78},
    ],
  },
  'chain-lightning': {
    priority: 2,
    basePowerWeight: 0.72,
    weakRatio: 1.25,
    steps: [
      {delayMs: 0, intensity: 0.7, durationMs: 38, weakRatio: 1.28},
      {delayMs: 50, intensity: 0.48, durationMs: 32, weakRatio: 1.3},
    ],
  },
  'tidal-vortex': {
    priority: 2,
    basePowerWeight: 0.7,
    weakRatio: 0.72,
    steps: [
      {delayMs: 0, intensity: 0.46, durationMs: 65, weakRatio: 0.8},
      {delayMs: 72, intensity: 0.72, durationMs: 96, weakRatio: 0.62},
    ],
  },
  'magma-bolt': {
    priority: 3,
    basePowerWeight: 0.86,
    weakRatio: 0.42,
    steps: [{delayMs: 0, intensity: 0.88, durationMs: 88, weakRatio: 0.42}],
  },
  'verdant-flora': {
    priority: 2,
    basePowerWeight: 0.48,
    weakRatio: 1.05,
    steps: [
      {delayMs: 0, intensity: 0.34, durationMs: 55, weakRatio: 1.05},
      {delayMs: 68, intensity: 0.22, durationMs: 42, weakRatio: 1.18},
    ],
  },
  'plasma-core': {
    priority: 4,
    basePowerWeight: 1.0,
    weakRatio: 0.55,
    steps: [
      {delayMs: 0, intensity: 1.0, durationMs: 170, weakRatio: 0.5},
      {delayMs: 178, intensity: 0.62, durationMs: 92, weakRatio: 0.82},
    ],
  },
  'void-dome': {
    priority: 4,
    basePowerWeight: 0.95,
    weakRatio: 0.38,
    steps: [
      {delayMs: 0, intensity: 0.86, durationMs: 135, weakRatio: 0.34},
      {delayMs: 148, intensity: 0.48, durationMs: 108, weakRatio: 0.52},
    ],
  },
};

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Manages WebXR Gamepad API haptic actuators (`XRInputSource.gamepad.hapticActuators`),
 * modern `Gamepad.vibrationActuator` (`dual-rumble`), and `navigator.getGamepads()`
 * fallback. Scales vibration intensity, duration, and dual-motor frequency balance
 * based on elemental spell power level, fusion combo tier, and physics collision
 * impulse magnitude.
 */
export class WebXRHapticsEngine {
  private enabled = true;
  private readonly queue: ScheduledHapticPulse[] = [];
  private readonly lastPulseEndMs: Record<HandSide, number> = {
    left: 0,
    right: 0,
  };
  private readonly lastPulsePriority: Record<HandSide, number> = {
    left: 0,
    right: 0,
  };
  private readonly lastChargeTickMs: Record<HandSide, number> = {
    left: 0,
    right: 0,
  };
  private readonly lastStreamPulseMs: Record<HandSide, number> = {
    left: 0,
    right: 0,
  };
  private readonly lastContactPulseMs: Record<HandSide, number> = {
    left: 0,
    right: 0,
  };
  private readonly lastImpactPulseMs: Record<HandSide, number> = {
    left: 0,
    right: 0,
  };

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.queue.length = 0;
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Advances any scheduled multi-step haptic pulse patterns (e.g. double-thuds,
   * jagged lightning twin-zaps, or fusion combo crescendo tails).
   */
  update(nowMs = performance.now()): void {
    if (!this.enabled || this.queue.length === 0) return;
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const item = this.queue[i];
      if (nowMs >= item.fireAtMs) {
        this.queue.splice(i, 1);
        this.triggerRaw(
          item.target,
          item.intensity,
          item.durationMs,
          item.priority,
          nowMs,
          item.weakRatio
        );
      }
    }
  }

  /**
   * Plays a tailored haptic vibration pattern for a successfully cast spell.
   * `powerLevel` (0..1) modulates both vibration intensity and pulse duration
   * according to charge duration, spell tier, overcharge, or combo bonus.
   */
  playSpellCast(
    power: PowerId,
    target: HapticTarget,
    powerLevel = 0.75,
    nowMs = performance.now()
  ): void {
    if (!this.enabled) return;

    // Rate-limit high-frequency stream casts so the actuator stays crisp
    const isStream =
      power === 'frost-lance' ||
      power === 'rainbow-ribbons' ||
      power === 'chain-lightning';
    if (isStream) {
      const minGap = power === 'chain-lightning' ? 135 : 90;
      if (target === 'both') {
        if (
          nowMs - this.lastStreamPulseMs.left < minGap &&
          nowMs - this.lastStreamPulseMs.right < minGap
        ) {
          return;
        }
        this.lastStreamPulseMs.left = nowMs;
        this.lastStreamPulseMs.right = nowMs;
      } else {
        if (nowMs - this.lastStreamPulseMs[target] < minGap) return;
        this.lastStreamPulseMs[target] = nowMs;
      }
    }

    const profile = SPELL_HAPTIC_PATTERNS[power];
    const lvl = clamp01(powerLevel);
    // Blend the spell's innate elemental tier with the live cast power level
    const intensityScale = (0.48 + 0.52 * lvl) * (0.72 + 0.28 * profile.basePowerWeight);
    const durationScale = 0.74 + 0.44 * lvl;

    const resolvedTarget: HapticTarget =
      power === 'plasma-core' || power === 'void-dome' ? 'both' : target;
    this.playSequence(
      resolvedTarget,
      profile.steps,
      profile.priority,
      intensityScale,
      durationScale,
      profile.weakRatio,
      nowMs
    );
  }

  /**
   * Emits a subtle periodic tactile tick while charging a spell (e.g., Fireball,
   * Magma Bolt, or Plasma Core), scaling intensity and frequency feel with charge level.
   */
  playChargeTick(
    target: HapticTarget,
    chargeLevel: number,
    nowMs = performance.now()
  ): void {
    if (!this.enabled) return;
    const lvl = clamp01(chargeLevel);
    // Slightly faster ticks as the spell approaches overcharge
    const minIntervalMs = 165 - lvl * 55;
    const sides: HandSide[] = target === 'both' ? ['left', 'right'] : [target];
    const readySides = sides.filter(
      (side) => nowMs - this.lastChargeTickMs[side] >= minIntervalMs
    );
    if (readySides.length === 0) return;

    const intensity = 0.1 + lvl * 0.3;
    const durationMs = 20 + lvl * 22;
    const weakRatio = 1.15 - lvl * 0.45;
    for (const side of readySides) {
      this.lastChargeTickMs[side] = nowMs;
      this.triggerRaw(side, intensity, durationMs, 0, nowMs, weakRatio);
    }
  }

  /**
   * Fires impact-scaled haptic feedback when a cast elemental projectile collides
   * with a physics target or bounces off environmental Rapier 3D colliders.
   * `impactImpulse` is the collision speed / impulse magnitude (typically 0.5..10+).
   */
  playProjectileImpact(
    target: HapticTarget,
    impactImpulse: number,
    kind: ProjectileImpactKind,
    nowMs = performance.now()
  ): void {
    if (!this.enabled) return;

    const minGap = kind === 'frost-shard' ? 48 : kind === 'bounce' ? 68 : 55;
    const sides: HandSide[] = target === 'both' ? ['left', 'right'] : [target];
    const readySides = sides.filter(
      (side) => nowMs - this.lastImpactPulseMs[side] >= minGap
    );
    if (readySides.length === 0) return;
    for (const side of readySides) {
      this.lastImpactPulseMs[side] = nowMs;
    }

    const effectiveTarget: HapticTarget =
      readySides.length === 2 ? 'both' : readySides[0];
    const normalized = clamp01((impactImpulse - 0.6) / 6.5);

    switch (kind) {
      case 'plasma-core': {
        this.playSequence(
          'both',
          [
            {
              delayMs: 0,
              intensity: 0.72 + normalized * 0.28,
              durationMs: 110 + normalized * 55,
              weakRatio: 0.42,
            },
            {
              delayMs: 120,
              intensity: 0.4 + normalized * 0.3,
              durationMs: 70 + normalized * 35,
              weakRatio: 0.75,
            },
          ],
          4,
          1.0,
          1.0,
          0.5,
          nowMs
        );
        break;
      }
      case 'magma-bolt': {
        this.triggerRaw(
          effectiveTarget,
          0.44 + normalized * 0.48,
          52 + normalized * 52,
          3,
          nowMs,
          0.45
        );
        break;
      }
      case 'fireball': {
        this.triggerRaw(
          effectiveTarget,
          0.38 + normalized * 0.48,
          46 + normalized * 48,
          3,
          nowMs,
          0.62
        );
        break;
      }
      case 'frost-shard': {
        this.triggerRaw(
          effectiveTarget,
          0.14 + normalized * 0.28,
          18 + normalized * 20,
          2,
          nowMs,
          1.3
        );
        break;
      }
      case 'bounce': {
        this.triggerRaw(
          effectiveTarget,
          0.16 + normalized * 0.46,
          24 + normalized * 38,
          2,
          nowMs,
          0.55
        );
        break;
      }
    }
  }

  /**
   * Fires an escalating triple-pulse crescendo rumble when the user triggers
   * an elemental fusion combo chain (`chainCount >= 2`).
   */
  playFusionCombo(
    chainCount: number,
    target: HapticTarget = 'both',
    nowMs = performance.now()
  ): void {
    if (!this.enabled) return;
    const tierBoost = clamp01((chainCount - 2) / 3);
    const scale = 0.8 + tierBoost * 0.2;
    const durScale = 0.92 + tierBoost * 0.24;

    this.playSequence(
      target,
      [
        {delayMs: 0, intensity: 0.56, durationMs: 52, weakRatio: 1.15},
        {delayMs: 64, intensity: 0.82, durationMs: 74, weakRatio: 0.78},
        {delayMs: 148, intensity: 1.0, durationMs: 135, weakRatio: 0.42},
      ],
      4,
      scale,
      durScale,
      0.65,
      nowMs
    );
  }

  /**
   * Fires tactile vibration feedback when a hand or controller interacts with
   * environmental physics objects (crystals, furniture/surfaces, shields, or
   * telekinetic tether tension).
   */
  playPhysicsContact(
    target: HapticTarget,
    kind: PhysicsContactKind,
    impactSpeed = 1.0,
    nowMs = performance.now()
  ): void {
    if (!this.enabled) return;
    const speedFactor = clamp01(impactSpeed / 2.4);

    if (kind === 'tether-hum') {
      const sides: HandSide[] = target === 'both' ? ['left', 'right'] : [target];
      for (const side of sides) {
        if (nowMs - this.lastContactPulseMs[side] < 125) continue;
        this.lastContactPulseMs[side] = nowMs;
        this.triggerRaw(side, 0.16 + speedFactor * 0.16, 34, 1, nowMs, 1.15);
      }
      return;
    }

    // Throttle rapid surface/prop chatter to keep contacts clean & distinct
    if (kind === 'crystal' || kind === 'prop' || kind === 'surface') {
      const sides: HandSide[] = target === 'both' ? ['left', 'right'] : [target];
      const allowedSides = sides.filter(
        (side) => nowMs - this.lastContactPulseMs[side] >= 70
      );
      if (allowedSides.length === 0) return;
      for (const side of allowedSides) {
        this.lastContactPulseMs[side] = nowMs;
      }
    }

    switch (kind) {
      case 'crystal': {
        const intensity = 0.26 + speedFactor * 0.56;
        const duration = 34 + speedFactor * 44;
        this.triggerRaw(target, intensity, duration, 2, nowMs, 0.95);
        break;
      }
      case 'prop':
      case 'surface': {
        const intensity = 0.2 + speedFactor * 0.48;
        const duration = 28 + speedFactor * 38;
        this.triggerRaw(target, intensity, duration, 2, nowMs, 0.48);
        break;
      }
      case 'deflect': {
        const scale = 0.72 + speedFactor * 0.28;
        this.playSequence(
          target,
          [
            {delayMs: 0, intensity: 0.88, durationMs: 88, weakRatio: 0.45},
            {delayMs: 96, intensity: 0.38, durationMs: 44, weakRatio: 0.85},
          ],
          3,
          scale,
          1.0,
          0.55,
          nowMs
        );
        break;
      }
      case 'shatter': {
        const scale = 0.76 + speedFactor * 0.24;
        this.playSequence(
          target,
          [
            {delayMs: 0, intensity: 0.76, durationMs: 65, weakRatio: 1.05},
            {delayMs: 74, intensity: 0.4, durationMs: 46, weakRatio: 1.25},
          ],
          3,
          scale,
          1.0,
          1.1,
          nowMs
        );
        break;
      }
    }
  }

  /**
   * Subtle dual-controller confirmation pulse for Head Gesture Empower / Dispel.
   */
  playHeadModifier(
    type: 'nod' | 'shake',
    nowMs = performance.now()
  ): void {
    if (!this.enabled) return;
    if (type === 'nod') {
      this.playSequence(
        'both',
        [
          {delayMs: 0, intensity: 0.5, durationMs: 55, weakRatio: 0.85},
          {delayMs: 70, intensity: 0.82, durationMs: 88, weakRatio: 0.55},
        ],
        3,
        1.0,
        1.0,
        0.7,
        nowMs
      );
    } else {
      this.playSequence(
        'both',
        [
          {delayMs: 0, intensity: 0.45, durationMs: 45, weakRatio: 0.9},
          {delayMs: 65, intensity: 0.3, durationMs: 45, weakRatio: 1.05},
        ],
        2,
        1.0,
        1.0,
        0.95,
        nowMs
      );
    }
  }

  /**
   * Low-level single pulse entry point.
   */
  pulse(
    target: HapticTarget,
    intensity: number,
    durationMs: number,
    priority = 2,
    nowMs = performance.now(),
    weakRatio = 0.72
  ): void {
    if (!this.enabled) return;
    this.triggerRaw(target, intensity, durationMs, priority, nowMs, weakRatio);
  }

  /**
   * Returns the count of currently discoverable WebXR / Gamepad haptic actuators.
   */
  getActiveActuatorCount(): number {
    return this.collectGamepads('both').length;
  }

  dispose(): void {
    this.queue.length = 0;
  }

  private playSequence(
    target: HapticTarget,
    steps: readonly HapticPulseStep[],
    priority: number,
    intensityScale: number,
    durationScale: number,
    defaultWeakRatio: number,
    nowMs: number
  ): void {
    for (const step of steps) {
      const scaledIntensity = clamp01(step.intensity * intensityScale);
      const scaledDuration = step.durationMs * durationScale;
      const weakRatio = step.weakRatio ?? defaultWeakRatio;
      if (step.delayMs <= 0) {
        this.triggerRaw(
          target,
          scaledIntensity,
          scaledDuration,
          priority,
          nowMs,
          weakRatio
        );
      } else {
        this.queue.push({
          fireAtMs: nowMs + step.delayMs,
          target,
          intensity: scaledIntensity,
          durationMs: scaledDuration,
          priority,
          weakRatio,
        });
      }
    }
  }

  private triggerRaw(
    target: HapticTarget,
    intensity: number,
    durationMs: number,
    priority: number,
    nowMs: number,
    weakRatio = 0.72
  ): void {
    const safeIntensity = clamp01(intensity);
    const safeDuration = Math.max(12, Math.min(420, durationMs));
    if (safeIntensity <= 0.01) return;

    const sides: HandSide[] = target === 'both' ? ['left', 'right'] : [target];
    const allowedSides: HandSide[] = [];

    for (const side of sides) {
      const busy = nowMs < this.lastPulseEndMs[side];
      if (busy && priority < this.lastPulsePriority[side]) {
        continue;
      }
      this.lastPulseEndMs[side] = nowMs + safeDuration;
      this.lastPulsePriority[side] = priority;
      allowedSides.push(side);
    }

    if (allowedSides.length === 0) return;

    const effectiveTarget: HapticTarget =
      allowedSides.length === 2 ? 'both' : allowedSides[0];
    const gamepads = this.collectGamepads(effectiveTarget);
    for (const gp of gamepads) {
      this.fireGamepadActuator(gp, safeIntensity, safeDuration, weakRatio);
    }
  }

  private collectGamepads(target: HapticTarget): Gamepad[] {
    const found: Gamepad[] = [];
    const seen = new Set<Gamepad>();

    // 1. Primary path: active WebXR session inputSources matched by handedness
    const xrSession = xb.core.renderer?.xr?.getSession?.() ?? null;
    if (xrSession?.inputSources) {
      const matched: Gamepad[] = [];
      const fallbackAny: Gamepad[] = [];

      for (const source of xrSession.inputSources) {
        const gp = source.gamepad;
        if (!gp || !this.hasActuator(gp)) continue;

        if (target === 'both' || source.handedness === target) {
          matched.push(gp);
        } else if (source.handedness === 'none') {
          fallbackAny.push(gp);
        }
      }

      const chosen = matched.length > 0 ? matched : fallbackAny;
      for (const gp of chosen) {
        if (!seen.has(gp)) {
          seen.add(gp);
          found.push(gp);
        }
      }
    }

    // 2. Fallback path: XR Blocks simulator physical GamepadController actuator
    if (found.length === 0) {
      const simGamepad = xb.core.input?.gamepadController?.gamepad;
      if (simGamepad && this.hasActuator(simGamepad) && !seen.has(simGamepad)) {
        seen.add(simGamepad);
        found.push(simGamepad);
      }
    }

    // 3. Fallback path: standard browser Gamepad API (`navigator.getGamepads()`)
    if (
      found.length === 0 &&
      typeof navigator !== 'undefined' &&
      typeof navigator.getGamepads === 'function'
    ) {
      try {
        const pads = navigator.getGamepads();
        for (const gp of pads) {
          if (gp && gp.connected && this.hasActuator(gp) && !seen.has(gp)) {
            seen.add(gp);
            found.push(gp);
          }
        }
      } catch {
        // Ignore restricted navigator.getGamepads contexts
      }
    }

    return found;
  }

  private hasActuator(gp: Gamepad): boolean {
    const hasWebXR =
      Array.isArray(gp.hapticActuators) &&
      gp.hapticActuators.length > 0 &&
      typeof gp.hapticActuators[0]?.pulse === 'function';
    const vib = gp.vibrationActuator as DualRumbleActuator | undefined;
    const hasVibration =
      typeof vib?.playEffect === 'function' || typeof vib?.pulse === 'function';
    return hasWebXR || hasVibration;
  }

  private fireGamepadActuator(
    gp: Gamepad,
    intensity: number,
    durationMs: number,
    weakRatio: number
  ): void {
    try {
      // Standard WebXR GamepadHapticActuator.pulse(value, duration)
      const xrActuator = gp.hapticActuators?.[0];
      if (xrActuator && typeof xrActuator.pulse === 'function') {
        void xrActuator.pulse(intensity, durationMs).catch(() => {});
        return;
      }

      // Modern Gamepad vibrationActuator (dual-rumble / pulse)
      const vib = gp.vibrationActuator as DualRumbleActuator | undefined;
      if (!vib) return;
      if (typeof vib.playEffect === 'function') {
        // Asymmetric strong/weak motor weighting shapes bass vs crisp tactile texture
        const strongMag = clamp01(intensity * (weakRatio > 1.0 ? 0.78 : 1.0));
        const weakMag = clamp01(intensity * weakRatio);
        void vib
          .playEffect('dual-rumble', {
            startDelay: 0,
            duration: durationMs,
            strongMagnitude: strongMag,
            weakMagnitude: weakMag,
          })
          .catch(() => {});
      } else if (typeof vib.pulse === 'function') {
        void vib.pulse(intensity, durationMs).catch(() => {});
      }
    } catch {
      // Ignore unsupported or disconnected actuator states gracefully
    }
  }
}
