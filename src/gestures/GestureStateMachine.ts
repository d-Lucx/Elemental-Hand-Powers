import * as THREE from 'three';
import * as xb from 'xrblocks';

import {
  HYSTERESIS_DWELL_MS,
  HYSTERESIS_ENTER_CONFIDENCE,
  HYSTERESIS_EXIT_CONFIDENCE,
  TRACKING_HOLD_DECAY_MS,
} from '../constants.ts';
import {
  BimanualState,
  GestureName,
  HandSide,
  TrackedHandFrame,
} from '../types.ts';

export type HandGesturePhase =
  | 'IDLE'
  | 'DWELL_ENTER'
  | 'ACTIVE'
  | 'DWELL_EXIT'
  | 'OCCLUDED_HOLD'
  | 'COOLDOWN';

export type GestureExitReason =
  | 'confidence-drop'
  | 'switched'
  | 'occlusion-timeout'
  | 'bimanual-preempt'
  | 'dispelled';

export interface GestureTransitionEvent {
  side: HandSide;
  gesture: GestureName;
  confidence: number;
  reason?: GestureExitReason;
}

export interface BimanualTransitionEvent {
  combo: 'plasma-core' | 'void-dome';
  type: 'start' | 'end';
  reason?: GestureExitReason;
}

export interface GestureHysteresisProfile {
  enterThreshold: number;
  exitThreshold: number;
  enterDwellMs: number;
  exitDwellMs: number;
  cooldownMs: number;
  /** Maximum wrist speed (m/s) allowed when entering this pose from IDLE/another pose. */
  maxEntrySpeedMps: number;
}

export interface HandStateSnapshot {
  phase: HandGesturePhase;
  activeGesture: GestureName | null;
  candidateGesture: GestureName | null;
  confidence: number;
  wristSpeed: number;
  occluded: boolean;
  dwellProgress: number;
}

export interface StateMachineSnapshot {
  left: HandStateSnapshot;
  right: HandStateSnapshot;
  bimanual: 'none' | 'plasma-core' | 'void-dome';
  misfiresBlocked: number;
}

export interface StateMachineStepResult {
  started: GestureTransitionEvent[];
  ended: GestureTransitionEvent[];
  bimanualEvents: BimanualTransitionEvent[];
}

export const ALL_SINGLE_HAND_GESTURES: readonly GestureName[] = [
  'open-palm',
  'victory',
  'fist',
  'point',
  'pinch',
  'spread',
  'thumbs-up',
  'rock',
  'shaka',
  'finger-gun',
  'palm-up',
];

const CRITICAL_JOINTS: readonly xb.JointName[] = [
  'wrist',
  'middle-finger-metacarpal',
  'thumb-tip',
  'index-finger-tip',
  'middle-finger-tip',
  'ring-finger-tip',
  'pinky-finger-tip',
];

/**
 * Per-gesture hysteresis thresholds, dwell timings, cooldowns, and entry speed limits.
 * Larger enter/exit gaps and longer dwells protect easily-crossed transitional poses.
 */
export const GESTURE_HYSTERESIS_PROFILES: Record<
  GestureName,
  GestureHysteresisProfile
> = {
  'open-palm': {
    enterThreshold: HYSTERESIS_ENTER_CONFIDENCE,
    exitThreshold: HYSTERESIS_EXIT_CONFIDENCE,
    enterDwellMs: 42,
    exitDwellMs: 36,
    cooldownMs: 140,
    maxEntrySpeedMps: 1.75,
  },
  victory: {
    enterThreshold: 0.7,
    exitThreshold: 0.42,
    enterDwellMs: 52,
    exitDwellMs: 44,
    cooldownMs: 120,
    maxEntrySpeedMps: 1.65,
  },
  fist: {
    enterThreshold: 0.7,
    exitThreshold: 0.42,
    enterDwellMs: 48,
    exitDwellMs: 40,
    cooldownMs: 320,
    maxEntrySpeedMps: 1.9,
  },
  point: {
    enterThreshold: 0.72,
    exitThreshold: 0.44,
    enterDwellMs: 46,
    exitDwellMs: 38,
    cooldownMs: 100,
    maxEntrySpeedMps: 1.55,
  },
  pinch: {
    enterThreshold: 0.72,
    exitThreshold: 0.4,
    enterDwellMs: HYSTERESIS_DWELL_MS + 10,
    exitDwellMs: 45,
    cooldownMs: 140,
    maxEntrySpeedMps: 1.6,
  },
  spread: {
    enterThreshold: 0.74,
    exitThreshold: 0.45,
    enterDwellMs: 58,
    exitDwellMs: 36,
    cooldownMs: 420,
    maxEntrySpeedMps: 1.7,
  },
  'thumbs-up': {
    enterThreshold: 0.72,
    exitThreshold: 0.44,
    enterDwellMs: 55,
    exitDwellMs: 42,
    cooldownMs: 380,
    maxEntrySpeedMps: 1.6,
  },
  rock: {
    enterThreshold: 0.72,
    exitThreshold: 0.44,
    enterDwellMs: 54,
    exitDwellMs: 44,
    cooldownMs: 140,
    maxEntrySpeedMps: 1.6,
  },
  shaka: {
    enterThreshold: 0.72,
    exitThreshold: 0.44,
    enterDwellMs: 58,
    exitDwellMs: 44,
    cooldownMs: 300,
    maxEntrySpeedMps: 1.6,
  },
  'finger-gun': {
    enterThreshold: 0.74,
    exitThreshold: 0.44,
    enterDwellMs: 52,
    exitDwellMs: 40,
    cooldownMs: 260,
    maxEntrySpeedMps: 1.5,
  },
  'palm-up': {
    enterThreshold: 0.72,
    exitThreshold: 0.44,
    enterDwellMs: 60,
    exitDwellMs: 46,
    cooldownMs: 220,
    maxEntrySpeedMps: 1.35,
  },
};

/**
 * Pairs of gestures that commonly cross through each other while folding or
 * unfolding fingers (e.g., closing Open Palm into Fist briefly passes through
 * Point / Pinch / Finger Gun). Switching between these pairs requires an
 * elevated dwell multiplier to eliminate accidental misfires.
 */
const TRANSITION_DWELL_MULTIPLIER: Partial<
  Record<GestureName, Partial<Record<GestureName, number>>>
> = {
  'open-palm': {
    point: 2.5,
    pinch: 2.2,
    'finger-gun': 2.5,
    victory: 2.0,
    rock: 2.2,
  },
  spread: {
    point: 2.5,
    pinch: 2.3,
    'finger-gun': 2.5,
    victory: 2.1,
  },
  'palm-up': {
    point: 2.4,
    pinch: 2.2,
    'finger-gun': 2.4,
  },
  fist: {
    point: 2.3,
    pinch: 2.1,
    victory: 2.2,
    rock: 2.2,
    shaka: 2.1,
    'finger-gun': 2.3,
  },
  point: {
    'finger-gun': 1.9,
    pinch: 1.8,
  },
  'finger-gun': {
    point: 1.9,
    'thumbs-up': 1.8,
  },
};

const MAX_FRAME_JUMP_METERS = 0.24;
const CONFIDENCE_EMA_LAMBDA = 18.0;
const VELOCITY_EMA_ALPHA = 0.32;
const BIMANUAL_ENTER_DWELL_MS = 65;
const BIMANUAL_EXIT_DWELL_MS = 95;
const VOID_DOME_COOLDOWN_MS = 1200;
const HEAD_GESTURE_COOLDOWN_MS = 750;
const HEAD_GESTURE_MIN_CONFIDENCE = 0.65;

const _vecA = new THREE.Vector3();
const _vecB = new THREE.Vector3();
const _vecC = new THREE.Vector3();

interface HandChannel {
  phase: HandGesturePhase;
  active: GestureName | null;
  candidate: GestureName | null;
  candidateSinceMs: number;
  exitSinceMs: number;
  occludedSinceMs: number;
  cooldownUntilMs: number;
  lastActiveGesture: GestureName | null;
  smoothedScores: Record<GestureName, number>;
  lastWristPos: THREE.Vector3;
  hasPrevWrist: boolean;
  smoothedVelocity: THREE.Vector3;
  dwellProgress: number;
}

interface BimanualChannel {
  activeCombo: 'none' | 'plasma-core' | 'void-dome';
  candidateCombo: 'none' | 'plasma-core' | 'void-dome';
  candidateSinceMs: number;
  exitSinceMs: number;
  voidCooldownUntilMs: number;
}

/**
 * Production-grade hysteresis-based finite state machine for the 14-power
 * elemental gesture system. Guards against rapid hand swings, intermediate
 * finger-fold silhouettes, optical tracking teleport spikes, and joint occlusions.
 */
export class ElementalGestureStateMachine {
  private readonly channels: Record<HandSide, HandChannel>;
  private readonly bimanualChannel: BimanualChannel;
  readonly hands: Record<HandSide, TrackedHandFrame>;
  readonly bimanual: BimanualState;

  private lastHeadGestureAt: Record<'nod' | 'shake', number> = {
    nod: -9999,
    shake: -9999,
  };

  misfiresBlocked = 0;

  constructor(
    private readonly occlusionHoldMs = TRACKING_HOLD_DECAY_MS
  ) {
    this.channels = {
      left: this.createChannel(),
      right: this.createChannel(),
    };
    this.bimanualChannel = {
      activeCombo: 'none',
      candidateCombo: 'none',
      candidateSinceMs: 0,
      exitSinceMs: 0,
      voidCooldownUntilMs: 0,
    };
    this.hands = {
      left: this.createHandFrame('left'),
      right: this.createHandFrame('right'),
    };
    this.bimanual = {
      plasmaActive: false,
      plasmaMidpoint: new THREE.Vector3(),
      plasmaSeparation: 0,
      voidDomeActive: false,
      voidDomeCenter: new THREE.Vector3(),
    };
  }

  private createEmptyScoreMap(): Record<GestureName, number> {
    const map = {} as Record<GestureName, number>;
    for (const g of ALL_SINGLE_HAND_GESTURES) {
      map[g] = 0;
    }
    return map;
  }

  private createChannel(): HandChannel {
    return {
      phase: 'IDLE',
      active: null,
      candidate: null,
      candidateSinceMs: 0,
      exitSinceMs: 0,
      occludedSinceMs: 0,
      cooldownUntilMs: 0,
      lastActiveGesture: null,
      smoothedScores: this.createEmptyScoreMap(),
      lastWristPos: new THREE.Vector3(),
      hasPrevWrist: false,
      smoothedVelocity: new THREE.Vector3(),
      dwellProgress: 0,
    };
  }

  private createHandFrame(side: HandSide): TrackedHandFrame {
    return {
      side,
      active: false,
      lastSeenAt: -9999,
      palmCenter: new THREE.Vector3(),
      palmNormal: new THREE.Vector3(0, 0, -1),
      palmUp: new THREE.Vector3(0, 1, 0),
      wristPos: new THREE.Vector3(),
      wristVelocity: new THREE.Vector3(),
      indexTip: new THREE.Vector3(),
      indexDir: new THREE.Vector3(0, 0, -1),
      middleTip: new THREE.Vector3(),
      thumbTip: new THREE.Vector3(),
      activeGesture: null,
      confidence: 0,
    };
  }

  /**
   * Advances all per-hand and bimanual hysteresis state machines for the frame.
   */
  step(
    contexts: Partial<Record<HandSide, xb.HandContext>>,
    recognizer: xb.GestureRecognizer,
    dt: number,
    nowMs: number,
    camera: THREE.Camera
  ): StateMachineStepResult {
    const started: GestureTransitionEvent[] = [];
    const ended: GestureTransitionEvent[] = [];
    const bimanualEvents: BimanualTransitionEvent[] = [];

    const safeDt = Math.max(0.004, Math.min(dt, 0.1));
    const scoreAlpha = 1 - Math.exp(-CONFIDENCE_EMA_LAMBDA * safeDt);

    // 1. Update each hand channel with joint validation, velocity tracking & hysteresis
    for (const side of ['left', 'right'] as const) {
      this.stepHandChannel(
        side,
        contexts[side],
        recognizer,
        safeDt,
        scoreAlpha,
        nowMs,
        started,
        ended
      );
    }

    // 2. Evaluate bimanual combos with their own hysteresis + dwell
    this.stepBimanualChannel(camera, nowMs, ended, bimanualEvents);

    return {started, ended, bimanualEvents};
  }

  /**
   * Validates and debounces Head Gestures (the 14th power tier: Nod = Empower, Shake = Dispel).
   */
  processHeadGesture(
    name: string,
    confidence: number,
    nowMs: number
  ): 'nod' | 'shake' | null {
    if (name !== 'nod' && name !== 'shake') return null;
    if (confidence < HEAD_GESTURE_MIN_CONFIDENCE) {
      this.misfiresBlocked++;
      return null;
    }
    if (nowMs - this.lastHeadGestureAt[name] < HEAD_GESTURE_COOLDOWN_MS) {
      this.misfiresBlocked++;
      return null;
    }
    this.lastHeadGestureAt[name] = nowMs;
    return name;
  }

  /**
   * Cleanly resets active locks (e.g., when Dispel or Arena Reset is triggered).
   */
  reset(nowMs = performance.now()): void {
    for (const side of ['left', 'right'] as const) {
      const ch = this.channels[side];
      ch.phase = 'IDLE';
      ch.active = null;
      ch.candidate = null;
      ch.dwellProgress = 0;
      ch.cooldownUntilMs = nowMs + 160;
      for (const g of ALL_SINGLE_HAND_GESTURES) {
        ch.smoothedScores[g] = 0;
      }
      this.hands[side].activeGesture = null;
      this.hands[side].confidence = 0;
    }
    this.bimanualChannel.activeCombo = 'none';
    this.bimanualChannel.candidateCombo = 'none';
    this.bimanual.plasmaActive = false;
    this.bimanual.voidDomeActive = false;
  }

  getSnapshot(): StateMachineSnapshot {
    const buildHand = (side: HandSide): HandStateSnapshot => {
      const ch = this.channels[side];
      const frame = this.hands[side];
      return {
        phase: ch.phase,
        activeGesture: ch.active,
        candidateGesture: ch.candidate,
        confidence: frame.confidence,
        wristSpeed: frame.wristVelocity.length(),
        occluded: ch.phase === 'OCCLUDED_HOLD',
        dwellProgress: ch.dwellProgress,
      };
    };
    return {
      left: buildHand('left'),
      right: buildHand('right'),
      bimanual: this.bimanualChannel.activeCombo,
      misfiresBlocked: this.misfiresBlocked,
    };
  }

  private hasValidJointTracking(ctx: xb.HandContext): boolean {
    for (const jointName of CRITICAL_JOINTS) {
      const pos = ctx.getJoint(jointName);
      if (
        !pos ||
        !Number.isFinite(pos.x) ||
        !Number.isFinite(pos.y) ||
        !Number.isFinite(pos.z)
      ) {
        return false;
      }
    }
    return true;
  }

  private handleOcclusionFrame(
    side: HandSide,
    ch: HandChannel,
    frame: TrackedHandFrame,
    nowMs: number,
    ended: GestureTransitionEvent[]
  ): void {
    // Decay velocity cleanly while occluded so no phantom thrust/flick fires
    ch.smoothedVelocity.multiplyScalar(0.82);
    frame.wristVelocity.copy(ch.smoothedVelocity);
    ch.candidate = null;
    ch.dwellProgress = 0;

    if (ch.active) {
      if (ch.phase !== 'OCCLUDED_HOLD') {
        ch.phase = 'OCCLUDED_HOLD';
        ch.occludedSinceMs = nowMs;
      }
      if (nowMs - ch.occludedSinceMs >= this.occlusionHoldMs) {
        // Grace window expired: safely cancel gesture without throwing
        ended.push({
          side,
          gesture: ch.active,
          confidence: 0,
          reason: 'occlusion-timeout',
        });
        this.misfiresBlocked++;
        ch.lastActiveGesture = ch.active;
        ch.active = null;
        ch.phase = 'IDLE';
        ch.hasPrevWrist = false;
        frame.active = false;
        frame.activeGesture = null;
        frame.confidence = 0;
      }
      return;
    }

    if (nowMs - frame.lastSeenAt > this.occlusionHoldMs) {
      ch.phase = 'IDLE';
      ch.hasPrevWrist = false;
      frame.active = false;
      frame.activeGesture = null;
      frame.confidence = 0;
    }
  }

  private stepHandChannel(
    side: HandSide,
    ctx: xb.HandContext | undefined,
    recognizer: xb.GestureRecognizer,
    dt: number,
    scoreAlpha: number,
    nowMs: number,
    started: GestureTransitionEvent[],
    ended: GestureTransitionEvent[]
  ): void {
    const ch = this.channels[side];
    const frame = this.hands[side];

    // 1. Validate hand context & critical joint presence
    if (!ctx || !this.hasValidJointTracking(ctx)) {
      this.handleOcclusionFrame(side, ch, frame, nowMs, ended);
      return;
    }

    const wrist = ctx.getJoint('wrist')!;
    const palmPose = xb.getPalmPose(ctx);
    if (!palmPose) {
      this.handleOcclusionFrame(side, ch, frame, nowMs, ended);
      return;
    }

    // 2. Reject single-frame optical tracking teleportation spikes as occlusion glitches
    if (ch.hasPrevWrist) {
      const jumpDist = wrist.distanceTo(ch.lastWristPos);
      if (jumpDist > MAX_FRAME_JUMP_METERS) {
        this.misfiresBlocked++;
        this.handleOcclusionFrame(side, ch, frame, nowMs, ended);
        // Re-anchor wrist position only if multiple consecutive frames moved
        ch.lastWristPos.lerp(wrist, 0.25);
        return;
      }
    }

    // 3. Valid tracking frame: update spatial kinematics
    frame.active = true;
    frame.lastSeenAt = nowMs;
    frame.wristPos.copy(wrist);
    frame.palmCenter.copy(palmPose.center);
    frame.palmNormal.copy(palmPose.normal).normalize();
    frame.palmUp.copy(palmPose.up).normalize();

    const indexTip = ctx.getJoint('index-finger-tip');
    const middleTip = ctx.getJoint('middle-finger-tip');
    const thumbTip = ctx.getJoint('thumb-tip');
    const indexDir = xb.getFingerDirection(ctx, 'index');

    frame.indexTip.copy(indexTip ?? palmPose.center);
    frame.middleTip.copy(middleTip ?? palmPose.center);
    frame.thumbTip.copy(thumbTip ?? palmPose.center);
    frame.indexDir.copy(indexDir ?? palmPose.normal).normalize();

    if (ch.hasPrevWrist) {
      _vecA.subVectors(wrist, ch.lastWristPos).divideScalar(dt);
      ch.smoothedVelocity.lerp(_vecA, VELOCITY_EMA_ALPHA);
    } else {
      ch.smoothedVelocity.set(0, 0, 0);
      ch.hasPrevWrist = true;
    }
    ch.lastWristPos.copy(wrist);
    frame.wristVelocity.copy(ch.smoothedVelocity);
    const wristSpeed = ch.smoothedVelocity.length();

    // 4. Score & exponentially smooth all 11 single-hand gestures
    const rawScores = recognizer.recognize(ctx) as xb.GestureScoreMap;
    let bestGesture: GestureName | null = null;
    let bestScore = 0;

    for (const g of ALL_SINGLE_HAND_GESTURES) {
      const raw = rawScores[g]?.confidence ?? 0;
      const smoothed =
        ch.smoothedScores[g] + (raw - ch.smoothedScores[g]) * scoreAlpha;
      ch.smoothedScores[g] = smoothed;
      if (smoothed > bestScore) {
        bestScore = smoothed;
        bestGesture = g;
      }
    }

    // Resume seamlessly from OCCLUDED_HOLD if tracking came back cleanly
    if (ch.phase === 'OCCLUDED_HOLD') {
      ch.phase = ch.active ? 'ACTIVE' : 'IDLE';
    }

    // Check cooldown expiry
    if (ch.phase === 'COOLDOWN') {
      if (nowMs < ch.cooldownUntilMs) {
        frame.activeGesture = null;
        frame.confidence = 0;
        return;
      }
      ch.phase = 'IDLE';
    }

    // Skip single-hand entry while a bimanual combo owns both hands
    if (this.bimanualChannel.activeCombo !== 'none') {
      frame.activeGesture = ch.active;
      frame.confidence = ch.active ? ch.smoothedScores[ch.active] : 0;
      return;
    }

    // 5. Execute Hysteresis FSM transitions
    if (ch.active) {
      const activeProfile = GESTURE_HYSTERESIS_PROFILES[ch.active];
      const activeScore = ch.smoothedScores[ch.active];

      if (activeScore >= activeProfile.exitThreshold) {
        ch.exitSinceMs = 0;
        ch.phase = 'ACTIVE';
        frame.activeGesture = ch.active;
        frame.confidence = activeScore;

        // Check if another gesture strongly dominates (direct switch with transition guard)
        if (bestGesture && bestGesture !== ch.active) {
          const nextProfile = GESTURE_HYSTERESIS_PROFILES[bestGesture];
          const switchMargin = nextProfile.enterThreshold + 0.1;
          if (bestScore >= switchMargin) {
            if (wristSpeed > nextProfile.maxEntrySpeedMps) {
              // Suppress rapid hand-swing switches
              ch.candidate = null;
              ch.dwellProgress = 0;
              this.misfiresBlocked++;
            } else {
              const mult =
                TRANSITION_DWELL_MULTIPLIER[ch.active]?.[bestGesture] ?? 1.25;
              const requiredDwell = nextProfile.enterDwellMs * mult;
              if (ch.candidate !== bestGesture) {
                ch.candidate = bestGesture;
                ch.candidateSinceMs = nowMs;
                ch.dwellProgress = 0;
              } else {
                const elapsed = nowMs - ch.candidateSinceMs;
                ch.dwellProgress = Math.min(1, elapsed / requiredDwell);
                if (elapsed >= requiredDwell) {
                  const prev = ch.active;
                  ended.push({
                    side,
                    gesture: prev,
                    confidence: activeScore,
                    reason: 'switched',
                  });
                  ch.lastActiveGesture = prev;
                  ch.active = bestGesture;
                  ch.candidate = null;
                  ch.dwellProgress = 1;
                  frame.activeGesture = bestGesture;
                  frame.confidence = bestScore;
                  started.push({
                    side,
                    gesture: bestGesture,
                    confidence: bestScore,
                  });
                }
              }
            }
          } else {
            ch.candidate = null;
            ch.dwellProgress = 0;
          }
        } else {
          ch.candidate = null;
          ch.dwellProgress = 0;
        }
      } else {
        // Active gesture dipped below exitThreshold: require brief exit dwell
        if (ch.phase !== 'DWELL_EXIT') {
          ch.phase = 'DWELL_EXIT';
          ch.exitSinceMs = nowMs;
        }
        if (nowMs - ch.exitSinceMs >= activeProfile.exitDwellMs) {
          const endedGesture = ch.active;
          ended.push({
            side,
            gesture: endedGesture,
            confidence: activeScore,
            reason: 'confidence-drop',
          });
          ch.lastActiveGesture = endedGesture;
          ch.active = null;
          ch.candidate = null;
          ch.dwellProgress = 0;
          frame.activeGesture = null;
          frame.confidence = 0;

          if (activeProfile.cooldownMs > 0) {
            ch.phase = 'COOLDOWN';
            ch.cooldownUntilMs = nowMs + activeProfile.cooldownMs;
          } else {
            ch.phase = 'IDLE';
          }
        } else {
          frame.activeGesture = ch.active;
          frame.confidence = activeScore;
        }
      }
      return;
    }

    // IDLE / DWELL_ENTER state
    if (bestGesture) {
      const profile = GESTURE_HYSTERESIS_PROFILES[bestGesture];
      if (bestScore >= profile.enterThreshold) {
        // Rapid hand movement lockout prevents accidental entries during fast arm swings
        if (wristSpeed > profile.maxEntrySpeedMps) {
          if (ch.candidate !== null) {
            this.misfiresBlocked++;
          }
          ch.candidate = null;
          ch.phase = 'IDLE';
          ch.dwellProgress = 0;
          frame.activeGesture = null;
          frame.confidence = 0;
          return;
        }

        // Apply extra transition dwell if coming right off a silhouette-adjacent pose
        const recentMult =
          ch.lastActiveGesture &&
          nowMs - ch.cooldownUntilMs < 350
            ? (TRANSITION_DWELL_MULTIPLIER[ch.lastActiveGesture]?.[
                bestGesture
              ] ?? 1.0)
            : 1.0;
        const requiredDwell = profile.enterDwellMs * recentMult;

        if (ch.candidate !== bestGesture) {
          ch.candidate = bestGesture;
          ch.candidateSinceMs = nowMs;
          ch.phase = 'DWELL_ENTER';
          ch.dwellProgress = 0;
        } else {
          const elapsed = nowMs - ch.candidateSinceMs;
          ch.dwellProgress = Math.min(1, elapsed / requiredDwell);
          if (elapsed >= requiredDwell) {
            ch.active = bestGesture;
            ch.candidate = null;
            ch.phase = 'ACTIVE';
            ch.dwellProgress = 1;
            frame.activeGesture = bestGesture;
            frame.confidence = bestScore;
            started.push({
              side,
              gesture: bestGesture,
              confidence: bestScore,
            });
            return;
          }
        }
      } else {
        ch.candidate = null;
        ch.phase = 'IDLE';
        ch.dwellProgress = 0;
      }
    } else {
      ch.candidate = null;
      ch.phase = 'IDLE';
      ch.dwellProgress = 0;
    }

    frame.activeGesture = null;
    frame.confidence = 0;
  }

  private stepBimanualChannel(
    camera: THREE.Camera,
    nowMs: number,
    endedSingle: GestureTransitionEvent[],
    bimanualEvents: BimanualTransitionEvent[]
  ): void {
    const L = this.hands.left;
    const R = this.hands.right;
    const bc = this.bimanualChannel;

    let detected: 'none' | 'plasma-core' | 'void-dome' = 'none';

    if (L.active && R.active) {
      const palmDist = L.palmCenter.distanceTo(R.palmCenter);
      const wristDist = L.wristPos.distanceTo(R.wristPos);
      const facingDot = L.palmNormal.dot(R.palmNormal);

      _vecB.subVectors(R.palmCenter, L.palmCenter).normalize();
      const facingEachOther =
        L.palmNormal.dot(_vecB) > 0.35 && R.palmNormal.dot(_vecB) < -0.35;

      const leftOpenScore = Math.max(
        this.channels.left.smoothedScores['open-palm'],
        this.channels.left.smoothedScores['spread'],
        this.channels.left.smoothedScores['palm-up']
      );
      const rightOpenScore = Math.max(
        this.channels.right.smoothedScores['open-palm'],
        this.channels.right.smoothedScores['spread'],
        this.channels.right.smoothedScores['palm-up']
      );
      const leftFistScore = this.channels.left.smoothedScores['fist'];
      const rightFistScore = this.channels.right.smoothedScores['fist'];

      // Hysteresis bounds widen slightly while already active
      const isPlasma = bc.activeCombo === 'plasma-core';
      const minSep = isPlasma ? 0.06 : 0.1;
      const maxSep = isPlasma ? 0.82 : 0.66;
      const openMin = isPlasma ? 0.42 : 0.62;
      const dotCutoff = isPlasma ? -0.22 : -0.45;

      if (
        leftOpenScore >= openMin &&
        rightOpenScore >= openMin &&
        palmDist >= minSep &&
        palmDist <= maxSep &&
        (facingDot < dotCutoff || facingEachOther)
      ) {
        detected = 'plasma-core';
        this.bimanual.plasmaMidpoint
          .addVectors(L.palmCenter, R.palmCenter)
          .multiplyScalar(0.5);
        this.bimanual.plasmaSeparation = palmDist;
      } else {
        const isVoid = bc.activeCombo === 'void-dome';
        const maxWristDist = isVoid ? 0.28 : 0.19;
        const fistMin = isVoid ? 0.42 : 0.64;
        if (
          leftFistScore >= fistMin &&
          rightFistScore >= fistMin &&
          wristDist < maxWristDist &&
          (isVoid || nowMs >= bc.voidCooldownUntilMs)
        ) {
          detected = 'void-dome';
          camera.getWorldPosition(_vecC);
          this.bimanual.voidDomeCenter.copy(_vecC);
          this.bimanual.voidDomeCenter.y -= 0.15;
        }
      }
    }

    if (bc.activeCombo !== 'none') {
      if (detected === bc.activeCombo) {
        bc.exitSinceMs = 0;
      } else {
        if (bc.exitSinceMs === 0) bc.exitSinceMs = nowMs;
        if (nowMs - bc.exitSinceMs >= BIMANUAL_EXIT_DWELL_MS) {
          const prev = bc.activeCombo;
          bc.activeCombo = 'none';
          bc.exitSinceMs = 0;
          if (prev === 'void-dome') {
            bc.voidCooldownUntilMs = nowMs + VOID_DOME_COOLDOWN_MS;
          }
          bimanualEvents.push({
            combo: prev,
            type: 'end',
            reason: 'confidence-drop',
          });
        }
      }
    } else if (detected !== 'none') {
      if (bc.candidateCombo !== detected) {
        bc.candidateCombo = detected;
        bc.candidateSinceMs = nowMs;
      } else if (nowMs - bc.candidateSinceMs >= BIMANUAL_ENTER_DWELL_MS) {
        // Preempt active single-hand spells cleanly so they don't misfire fireballs
        for (const side of ['left', 'right'] as const) {
          const ch = this.channels[side];
          if (ch.active) {
            endedSingle.push({
              side,
              gesture: ch.active,
              confidence: this.hands[side].confidence,
              reason: 'bimanual-preempt',
            });
            ch.active = null;
            ch.candidate = null;
            ch.phase = 'IDLE';
            this.hands[side].activeGesture = null;
          }
        }
        bc.activeCombo = detected;
        bc.candidateCombo = 'none';
        bc.exitSinceMs = 0;
        bimanualEvents.push({combo: detected, type: 'start'});
      }
    } else {
      bc.candidateCombo = 'none';
    }

    this.bimanual.plasmaActive = bc.activeCombo === 'plasma-core';
    this.bimanual.voidDomeActive = bc.activeCombo === 'void-dome';
  }
}
