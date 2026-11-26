import * as THREE from 'three';
import * as xb from 'xrblocks';

import {
  ELEMENTAL_POWERS,
  GESTURE_TO_POWER,
  HYSTERESIS_DWELL_MS,
  HYSTERESIS_ENTER_CONFIDENCE,
  HYSTERESIS_EXIT_CONFIDENCE,
  POWER_BY_ID,
  TRACKING_HOLD_DECAY_MS,
} from '../constants.ts';
import {
  BimanualState,
  GestureName,
  HandSide,
  PowerId,
  TrackedHandFrame,
} from '../types.ts';

export type BimanualGestureId = 'plasma-core' | 'void-dome';
export type HeadGestureId = 'head-nod' | 'head-shake';
export type ElementalGestureId = GestureName | BimanualGestureId | HeadGestureId;

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
  | 'dispelled'
  | 'unequipped';

export type MisfireBlockReason =
  | 'rapid-linear-motion'
  | 'rapid-wrist-rotation'
  | 'joint-occlusion'
  | 'optical-jump-spike'
  | 'transition-guard'
  | 'cast-cooldown'
  | 'head-refractory'
  | 'unequipped-spell';

export interface CastCooldownConfig {
  /** Minimum per-hand refractory window (ms) between consecutive spell casts. */
  minInterCastMs: number;
  /** Brief global refractory window (ms) across hands/combos so VFX can resolve. */
  globalInterCastMs: number;
}

export const DEFAULT_INTER_CAST_COOLDOWN_MS = 450;
export const DEFAULT_GLOBAL_CAST_COOLDOWN_MS = 220;
const MIN_SAFE_COOLDOWN_FLOOR_MS = 320;

export type StabilityPreset = 'balanced' | 'strict' | 'responsive';

export interface GestureTransitionEvent {
  side: HandSide;
  gesture: GestureName;
  confidence: number;
  reason?: GestureExitReason;
}

export interface BimanualTransitionEvent {
  combo: BimanualGestureId;
  type: 'start' | 'end';
  reason?: GestureExitReason;
}

export interface HeadGestureTransitionEvent {
  gesture: HeadGestureId;
  confidence: number;
}

export interface MisfireBlockedEvent {
  side: HandSide | 'bimanual' | 'head';
  candidate: ElementalGestureId | null;
  reason: MisfireBlockReason;
  timestampMs: number;
}

export interface GestureHysteresisProfile {
  enterThreshold: number;
  exitThreshold: number;
  enterDwellMs: number;
  exitDwellMs: number;
  cooldownMs: number;
  /** Maximum wrist linear speed (m/s) allowed when entering this pose. */
  maxEntrySpeedMps: number;
  /** Maximum palm normal angular velocity (rad/s) allowed when entering. */
  maxPalmAngularSpeedRad: number;
}

export interface BimanualHysteresisProfile {
  enterConfidence: number;
  exitConfidence: number;
  enterDwellMs: number;
  exitDwellMs: number;
  cooldownMs: number;
  enterMinSeparation: number;
  enterMaxSeparation: number;
  exitMinSeparation: number;
  exitMaxSeparation: number;
}

export interface HeadHysteresisProfile {
  minConfidence: number;
  cooldownMs: number;
}

export type SpellChargeStatus =
  | 'idle'
  | 'dwelling'
  | 'charging'
  | 'ready'
  | 'overcharged'
  | 'channeling'
  | 'occluded'
  | 'cooldown';

export interface SpellChargeState {
  status: SpellChargeStatus;
  /** Normalized charge intensity in [0, 1]. */
  chargeLevel: number;
  /** Gesture or bimanual combo currently driving this charge state. */
  gesture: ElementalGestureId | null;
  /** Procedural wrist pulse frequency in Hz derived from charge status. */
  pulseFrequencyHz: number;
  /** Primary hex color for wrist pulse & HUD styling. */
  colorHex: string;
  /** Accent hex color for wave crests & secondary rings. */
  accentHex: string;
}

export type TrackedJointKey =
  | 'wrist'
  | 'middle-finger-metacarpal'
  | 'thumb-tip'
  | 'index-finger-tip'
  | 'middle-finger-tip'
  | 'ring-finger-tip'
  | 'pinky-finger-tip';

export const TRACKED_JOINT_KEYS: readonly TrackedJointKey[] = [
  'wrist',
  'middle-finger-metacarpal',
  'thumb-tip',
  'index-finger-tip',
  'middle-finger-tip',
  'ring-finger-tip',
  'pinky-finger-tip',
];

export type HandJointConfidenceMap = Record<TrackedJointKey, number>;

export interface HandStateSnapshot {
  phase: HandGesturePhase;
  activeGesture: GestureName | null;
  candidateGesture: GestureName | null;
  topRawGesture: GestureName | null;
  topRawConfidence: number;
  confidence: number;
  rawScores: Record<GestureName, number>;
  smoothedScores: Record<GestureName, number>;
  jointConfidences: HandJointConfidenceMap;
  trackedJointCount: number;
  totalJointCount: number;
  wristSpeed: number;
  palmAngularSpeed: number;
  occluded: boolean;
  trackingDropActive: boolean;
  trackingDropsTotal: number;
  trackedJointRatio: number;
  dwellProgress: number;
  cooldownRemainingMs: number;
  cooldownProgress: number;
  charge: SpellChargeState;
}

export interface LoadoutChangeEvent {
  equippedPowers: PowerId[];
  bindings: Record<GestureName, PowerId>;
}

export interface SpellBookToggleEvent {
  anchorPosition: THREE.Vector3;
  timestampMs: number;
}

export interface StateMachineSnapshot {
  preset: StabilityPreset;
  left: HandStateSnapshot;
  right: HandStateSnapshot;
  bimanual: 'none' | BimanualGestureId;
  globalCooldownRemainingMs: number;
  misfiresBlocked: number;
  lastBlockReason: MisfireBlockReason | null;
  equippedPowers: PowerId[];
  equippedCount: number;
  spellBookOpen: boolean;
  spellBookDwellProgress: number;
}

export interface StateMachineStepResult {
  started: GestureTransitionEvent[];
  ended: GestureTransitionEvent[];
  bimanualEvents: BimanualTransitionEvent[];
  spellBookToggled: boolean;
  spellBookAnchor: THREE.Vector3 | null;
}

export interface GestureStateMachineListeners {
  gestureenter: (event: GestureTransitionEvent) => void;
  gestureexit: (event: GestureTransitionEvent) => void;
  bimanual: (event: BimanualTransitionEvent) => void;
  headgesture: (event: HeadGestureTransitionEvent) => void;
  misfireblocked: (event: MisfireBlockedEvent) => void;
  loadoutchange: (event: LoadoutChangeEvent) => void;
  spellbooktoggle: (event: SpellBookToggleEvent) => void;
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

/** Complete 14-power gesture inventory (11 single-hand + 2 bimanual + head modifier tier). */
export const FOURTEEN_ELEMENTAL_GESTURES: readonly ElementalGestureId[] = [
  ...ALL_SINGLE_HAND_GESTURES,
  'plasma-core',
  'void-dome',
  'head-nod',
  'head-shake',
];

const ANCHOR_JOINTS: readonly xb.JointName[] = [
  'wrist',
  'middle-finger-metacarpal',
];

const ALL_TIP_JOINTS: readonly xb.JointName[] = [
  'thumb-tip',
  'index-finger-tip',
  'middle-finger-tip',
  'ring-finger-tip',
  'pinky-finger-tip',
];

/**
 * Per-gesture critical fingertips required for trustworthy recognition.
 * Missing a non-critical tip still allows active poses to continue smoothly,
 * whereas losing a critical tip puts the hand into OCCLUDED_HOLD.
 */
const GESTURE_CRITICAL_TIPS: Record<GestureName, readonly xb.JointName[]> = {
  'open-palm': ALL_TIP_JOINTS,
  spread: ALL_TIP_JOINTS,
  'palm-up': ALL_TIP_JOINTS,
  fist: [
    'index-finger-tip',
    'middle-finger-tip',
    'ring-finger-tip',
    'pinky-finger-tip',
  ],
  victory: ['index-finger-tip', 'middle-finger-tip', 'ring-finger-tip'],
  point: ['index-finger-tip', 'middle-finger-tip'],
  pinch: ['thumb-tip', 'index-finger-tip'],
  'thumbs-up': ['thumb-tip', 'index-finger-tip', 'middle-finger-tip'],
  rock: ['index-finger-tip', 'middle-finger-tip', 'pinky-finger-tip'],
  shaka: ['thumb-tip', 'index-finger-tip', 'pinky-finger-tip'],
  'finger-gun': ['thumb-tip', 'index-finger-tip', 'middle-finger-tip'],
};

/**
 * Per-gesture hysteresis thresholds, dwell timings, cooldowns, and motion limits.
 * Asymmetric enter/exit bands (e.g. 0.72 enter / 0.42 exit) prevent chatter near
 * decision boundaries while dwell timers filter transient finger-fold shapes.
 */
export const GESTURE_HYSTERESIS_PROFILES: Record<
  GestureName,
  GestureHysteresisProfile
> = {
  'open-palm': {
    enterThreshold: HYSTERESIS_ENTER_CONFIDENCE,
    exitThreshold: HYSTERESIS_EXIT_CONFIDENCE,
    enterDwellMs: 42,
    exitDwellMs: 38,
    cooldownMs: 480,
    maxEntrySpeedMps: 1.75,
    maxPalmAngularSpeedRad: 5.5,
  },
  victory: {
    enterThreshold: 0.7,
    exitThreshold: 0.42,
    enterDwellMs: 52,
    exitDwellMs: 44,
    cooldownMs: 450,
    maxEntrySpeedMps: 1.65,
    maxPalmAngularSpeedRad: 5.2,
  },
  fist: {
    enterThreshold: 0.7,
    exitThreshold: 0.42,
    enterDwellMs: 48,
    exitDwellMs: 40,
    cooldownMs: 520,
    maxEntrySpeedMps: 1.9,
    maxPalmAngularSpeedRad: 6.0,
  },
  point: {
    enterThreshold: 0.72,
    exitThreshold: 0.44,
    enterDwellMs: 46,
    exitDwellMs: 38,
    cooldownMs: 450,
    maxEntrySpeedMps: 1.55,
    maxPalmAngularSpeedRad: 4.8,
  },
  pinch: {
    enterThreshold: 0.72,
    exitThreshold: 0.4,
    enterDwellMs: HYSTERESIS_DWELL_MS + 10,
    exitDwellMs: 46,
    cooldownMs: 450,
    maxEntrySpeedMps: 1.6,
    maxPalmAngularSpeedRad: 5.2,
  },
  spread: {
    enterThreshold: 0.74,
    exitThreshold: 0.45,
    enterDwellMs: 58,
    exitDwellMs: 36,
    cooldownMs: 650,
    maxEntrySpeedMps: 1.7,
    maxPalmAngularSpeedRad: 5.0,
  },
  'thumbs-up': {
    enterThreshold: 0.72,
    exitThreshold: 0.44,
    enterDwellMs: 55,
    exitDwellMs: 42,
    cooldownMs: 620,
    maxEntrySpeedMps: 1.6,
    maxPalmAngularSpeedRad: 4.6,
  },
  rock: {
    enterThreshold: 0.72,
    exitThreshold: 0.44,
    enterDwellMs: 54,
    exitDwellMs: 44,
    cooldownMs: 480,
    maxEntrySpeedMps: 1.6,
    maxPalmAngularSpeedRad: 5.0,
  },
  shaka: {
    enterThreshold: 0.72,
    exitThreshold: 0.44,
    enterDwellMs: 58,
    exitDwellMs: 44,
    cooldownMs: 620,
    maxEntrySpeedMps: 1.6,
    maxPalmAngularSpeedRad: 4.8,
  },
  'finger-gun': {
    enterThreshold: 0.74,
    exitThreshold: 0.44,
    enterDwellMs: 52,
    exitDwellMs: 40,
    cooldownMs: 480,
    maxEntrySpeedMps: 1.5,
    maxPalmAngularSpeedRad: 4.6,
  },
  'palm-up': {
    enterThreshold: 0.72,
    exitThreshold: 0.44,
    enterDwellMs: 60,
    exitDwellMs: 46,
    cooldownMs: 560,
    maxEntrySpeedMps: 1.35,
    maxPalmAngularSpeedRad: 3.8,
  },
};

export const BIMANUAL_HYSTERESIS_PROFILES: Record<
  BimanualGestureId,
  BimanualHysteresisProfile
> = {
  'plasma-core': {
    enterConfidence: 0.62,
    exitConfidence: 0.42,
    enterDwellMs: 65,
    exitDwellMs: 95,
    cooldownMs: 750,
    enterMinSeparation: 0.1,
    enterMaxSeparation: 0.66,
    exitMinSeparation: 0.06,
    exitMaxSeparation: 0.84,
  },
  'void-dome': {
    enterConfidence: 0.64,
    exitConfidence: 0.42,
    enterDwellMs: 70,
    exitDwellMs: 95,
    cooldownMs: 1400,
    enterMinSeparation: 0.0,
    enterMaxSeparation: 0.19,
    exitMinSeparation: 0.0,
    exitMaxSeparation: 0.28,
  },
};

export const HEAD_HYSTERESIS_PROFILES: Record<
  HeadGestureId,
  HeadHysteresisProfile
> = {
  'head-nod': {minConfidence: 0.65, cooldownMs: 750},
  'head-shake': {minConfidence: 0.65, cooldownMs: 850},
};

const PRESET_SCALES: Record<
  StabilityPreset,
  {
    dwellScale: number;
    cooldownScale: number;
    thresholdOffset: number;
    speedScale: number;
  }
> = {
  responsive: {
    dwellScale: 0.72,
    cooldownScale: 0.8,
    thresholdOffset: -0.04,
    speedScale: 1.2,
  },
  balanced: {
    dwellScale: 1.0,
    cooldownScale: 1.0,
    thresholdOffset: 0.0,
    speedScale: 1.0,
  },
  strict: {
    dwellScale: 1.45,
    cooldownScale: 1.25,
    thresholdOffset: 0.05,
    speedScale: 0.8,
  },
};

/**
 * Elevated dwell multipliers when transitioning between silhouette-adjacent
 * finger poses (e.g. closing Open Palm into Fist briefly passes through
 * Point / Pinch / Finger Gun; opening Fist passes through Peace / Rock).
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
    'open-palm': 1.6,
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

const _vecA = new THREE.Vector3();
const _vecB = new THREE.Vector3();
const _vecC = new THREE.Vector3();

const CHARGEABLE_GESTURES = new Set<GestureName>([
  'open-palm',
  'finger-gun',
]);

const TOTAL_XR_HAND_JOINTS = xb.HAND_JOINT_NAMES.length;

function intToHexColor(colorInt: number): string {
  return `#${colorInt.toString(16).padStart(6, '0')}`;
}

function getElementalPalette(
  gesture: ElementalGestureId | null,
  bindings?: Record<GestureName, PowerId>
): {primary: string; accent: string} {
  if (!gesture) {
    return {primary: '#38bdf8', accent: '#94a3b8'};
  }
  if (gesture === 'plasma-core' || gesture === 'void-dome') {
    const spec = POWER_BY_ID[gesture];
    return {primary: spec.colorHex, accent: intToHexColor(spec.accentInt)};
  }
  if (gesture === 'head-nod') {
    return {primary: '#fde047', accent: '#f97316'};
  }
  if (gesture === 'head-shake') {
    return {primary: '#94a3b8', accent: '#cbd5e1'};
  }
  const powerId: PowerId = bindings ? bindings[gesture] : GESTURE_TO_POWER[gesture];
  const spec = POWER_BY_ID[powerId];
  return {primary: spec.colorHex, accent: intToHexColor(spec.accentInt)};
}

const CHARGEABLE_POWERS = new Set<PowerId>(['fireball', 'magma-bolt']);
const SPELL_BOOK_DWELL_MS = 280;
const SPELL_BOOK_COOLDOWN_MS = 1200;
const _spellBookMidpoint = new THREE.Vector3();

interface HandChannel {
  phase: HandGesturePhase;
  active: GestureName | null;
  candidate: GestureName | null;
  candidateSinceMs: number;
  activeSinceMs: number;
  exitSinceMs: number;
  occludedSinceMs: number;
  cooldownUntilMs: number;
  cooldownDurationMs: number;
  cooldownBlockedLogged: boolean;
  pendingDischargeCooldownMs: number;
  lastActiveGesture: GestureName | null;
  rawScores: Record<GestureName, number>;
  smoothedScores: Record<GestureName, number>;
  topRawGesture: GestureName | null;
  topRawConfidence: number;
  jointConfidences: HandJointConfidenceMap;
  lastJointPositions: Partial<Record<TrackedJointKey, THREE.Vector3>>;
  trackedJointCount: number;
  trackingDropActive: boolean;
  wasTrackingDropped: boolean;
  trackingDropsTotal: number;
  spellDischargedInPose: boolean;
  lastWristPos: THREE.Vector3;
  lastPalmNormal: THREE.Vector3;
  hasPrevPose: boolean;
  smoothedVelocity: THREE.Vector3;
  smoothedAngularSpeed: number;
  trackedJointRatio: number;
  dwellProgress: number;
  charge: SpellChargeState;
}

interface BimanualChannel {
  activeCombo: 'none' | BimanualGestureId;
  candidateCombo: 'none' | BimanualGestureId;
  candidateSinceMs: number;
  activeSinceMs: number;
  exitSinceMs: number;
  cooldownUntilMs: Record<BimanualGestureId, number>;
  cooldownBlockedLogged: boolean;
}

/**
 * Hysteresis-based finite state machine controller for the 14-power elemental
 * gesture system. Enforces asymmetric enter/exit thresholds, per-gesture dwell
 * timers, transition-silhouette guards, linear & angular hand-speed lockouts,
 * optical spike filtering, and graceful joint-occlusion holds.
 */
export class GestureStateMachine {
  private readonly channels: Record<HandSide, HandChannel>;
  private readonly bimanualChannel: BimanualChannel;
  private readonly profiles: Record<GestureName, GestureHysteresisProfile>;
  private readonly listeners: {
    [K in keyof GestureStateMachineListeners]: Set<
      GestureStateMachineListeners[K]
    >;
  };

  readonly hands: Record<HandSide, TrackedHandFrame>;
  readonly bimanual: BimanualState;

  private preset: StabilityPreset = 'balanced';
  private minInterCastCooldownMs: number;
  private globalCastCooldownMs: number;
  private globalCastCooldownUntilMs = 0;
  private lastStepNowMs = 0;
  private lastHeadGestureAt: Record<HeadGestureId, number> = {
    'head-nod': -9999,
    'head-shake': -9999,
  };

  // Dynamic Spell Book loadout & gesture bindings
  private equippedPowers = new Set<PowerId>(ELEMENTAL_POWERS.map((p) => p.id));
  private gestureBindings: Record<GestureName, PowerId> = {...GESTURE_TO_POWER};
  private spellBookOpen = false;
  private spellBookDwelling = false;
  private spellBookDwellSinceMs = 0;
  private spellBookDwellProgress = 0;
  private spellBookCooldownUntilMs = 0;
  private spellBookLatchBlocked = false;

  misfiresBlocked = 0;
  lastBlockReason: MisfireBlockReason | null = null;

  constructor(
    private readonly occlusionHoldMs = TRACKING_HOLD_DECAY_MS,
    cooldownConfig?: Partial<CastCooldownConfig>
  ) {
    this.minInterCastCooldownMs = Math.max(
      MIN_SAFE_COOLDOWN_FLOOR_MS,
      cooldownConfig?.minInterCastMs ?? DEFAULT_INTER_CAST_COOLDOWN_MS
    );
    this.globalCastCooldownMs = Math.max(
      120,
      cooldownConfig?.globalInterCastMs ?? DEFAULT_GLOBAL_CAST_COOLDOWN_MS
    );

    this.profiles = {} as Record<GestureName, GestureHysteresisProfile>;
    for (const g of ALL_SINGLE_HAND_GESTURES) {
      this.profiles[g] = {...GESTURE_HYSTERESIS_PROFILES[g]};
    }

    this.listeners = {
      gestureenter: new Set(),
      gestureexit: new Set(),
      bimanual: new Set(),
      headgesture: new Set(),
      misfireblocked: new Set(),
      loadoutchange: new Set(),
      spellbooktoggle: new Set(),
    };

    this.channels = {
      left: this.createChannel(),
      right: this.createChannel(),
    };
    this.bimanualChannel = {
      activeCombo: 'none',
      candidateCombo: 'none',
      candidateSinceMs: 0,
      activeSinceMs: 0,
      exitSinceMs: 0,
      cooldownUntilMs: {'plasma-core': 0, 'void-dome': 0},
      cooldownBlockedLogged: false,
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

  on<K extends keyof GestureStateMachineListeners>(
    event: K,
    listener: GestureStateMachineListeners[K]
  ): () => void {
    this.listeners[event].add(listener);
    return () => {
      this.listeners[event].delete(listener);
    };
  }

  setStabilityPreset(preset: StabilityPreset): void {
    this.preset = preset;
  }

  getStabilityPreset(): StabilityPreset {
    return this.preset;
  }

  setInterCastCooldown(config: Partial<CastCooldownConfig>): void {
    if (config.minInterCastMs !== undefined) {
      this.minInterCastCooldownMs = Math.max(
        MIN_SAFE_COOLDOWN_FLOOR_MS,
        config.minInterCastMs
      );
    }
    if (config.globalInterCastMs !== undefined) {
      this.globalCastCooldownMs = Math.max(120, config.globalInterCastMs);
    }
  }

  getInterCastCooldown(): CastCooldownConfig {
    return {
      minInterCastMs: this.minInterCastCooldownMs,
      globalInterCastMs: this.globalCastCooldownMs,
    };
  }

  private getEffectiveMinInterCastMs(): number {
    const scale = PRESET_SCALES[this.preset];
    return Math.max(
      MIN_SAFE_COOLDOWN_FLOOR_MS,
      this.minInterCastCooldownMs * scale.cooldownScale
    );
  }

  private getEffectiveGlobalCooldownMs(): number {
    const scale = PRESET_SCALES[this.preset];
    return Math.max(120, this.globalCastCooldownMs * scale.cooldownScale);
  }

  configureGesture(
    gesture: GestureName,
    overrides: Partial<GestureHysteresisProfile>
  ): void {
    this.profiles[gesture] = {...this.profiles[gesture], ...overrides};
  }

  getEffectiveProfile(gesture: GestureName): GestureHysteresisProfile {
    const base = this.profiles[gesture];
    const scale = PRESET_SCALES[this.preset];
    const scaledCooldown = base.cooldownMs * scale.cooldownScale;
    return {
      enterThreshold: THREE.MathUtils.clamp(
        base.enterThreshold + scale.thresholdOffset,
        0.52,
        0.92
      ),
      exitThreshold: THREE.MathUtils.clamp(
        base.exitThreshold + scale.thresholdOffset * 0.5,
        0.25,
        0.72
      ),
      enterDwellMs: base.enterDwellMs * scale.dwellScale,
      exitDwellMs: base.exitDwellMs * scale.dwellScale,
      cooldownMs: Math.max(scaledCooldown, this.getEffectiveMinInterCastMs()),
      maxEntrySpeedMps: base.maxEntrySpeedMps * scale.speedScale,
      maxPalmAngularSpeedRad: base.maxPalmAngularSpeedRad * scale.speedScale,
    };
  }

  // ---------------- Dynamic Spell Book Loadout & Bindings ----------------
  isPowerEquipped(powerId: PowerId): boolean {
    return this.equippedPowers.has(powerId);
  }

  getEquippedPowers(): PowerId[] {
    return ELEMENTAL_POWERS.filter((p) => this.equippedPowers.has(p.id)).map(
      (p) => p.id
    );
  }

  getEquippedCount(): number {
    return this.equippedPowers.size;
  }

  getPowerForGesture(gesture: GestureName): PowerId {
    return this.gestureBindings[gesture];
  }

  getGestureForPower(powerId: PowerId): GestureName | null {
    for (const g of ALL_SINGLE_HAND_GESTURES) {
      if (this.gestureBindings[g] === powerId) return g;
    }
    return null;
  }

  getGestureBindings(): Record<GestureName, PowerId> {
    return {...this.gestureBindings};
  }

  isGestureEquipped(gesture: GestureName): boolean {
    const boundPower = this.gestureBindings[gesture];
    return this.equippedPowers.has(boundPower);
  }

  setPowerEquipped(powerId: PowerId, equipped: boolean): boolean {
    const currently = this.equippedPowers.has(powerId);
    if (currently === equipped) return equipped;
    if (equipped) {
      this.equippedPowers.add(powerId);
    } else {
      this.equippedPowers.delete(powerId);
      this.cancelPowerIfActive(powerId);
    }
    this.emitLoadoutChange();
    return equipped;
  }

  togglePowerEquipped(powerId: PowerId): boolean {
    const next = !this.equippedPowers.has(powerId);
    return this.setPowerEquipped(powerId, next);
  }

  setEquippedPowers(powers: Iterable<PowerId>): void {
    const nextSet = new Set<PowerId>(powers);
    for (const prev of this.equippedPowers) {
      if (!nextSet.has(prev)) {
        this.cancelPowerIfActive(prev);
      }
    }
    this.equippedPowers = nextSet;
    this.emitLoadoutChange();
  }

  /**
   * Rebinds a single-hand gesture slot to a chosen single-hand elemental power,
   * swapping with the power's previous slot so every single-hand spell remains
   * uniquely mapped and immediately equipping the newly bound spell.
   */
  setGestureBinding(gesture: GestureName, powerId: PowerId): void {
    if (powerId === 'plasma-core' || powerId === 'void-dome') return;
    const prevPowerAtTarget = this.gestureBindings[gesture];
    const prevGestureForPower = this.getGestureForPower(powerId);

    if (prevPowerAtTarget !== powerId) {
      this.gestureBindings[gesture] = powerId;
      if (prevGestureForPower && prevGestureForPower !== gesture) {
        this.gestureBindings[prevGestureForPower] = prevPowerAtTarget;
      }
      this.cancelGestureIfActive(gesture);
      if (prevGestureForPower) {
        this.cancelGestureIfActive(prevGestureForPower);
      }
    }

    this.equippedPowers.add(powerId);
    this.emitLoadoutChange();
  }

  resetLoadout(): void {
    this.equippedPowers = new Set<PowerId>(ELEMENTAL_POWERS.map((p) => p.id));
    this.gestureBindings = {...GESTURE_TO_POWER};
    this.emitLoadoutChange();
  }

  setSpellBookOpen(open: boolean): void {
    if (this.spellBookOpen === open) return;
    this.spellBookOpen = open;
    if (open) {
      // Cleanly clear active spells while browsing the Spell Book so UI pinches
      // never misfire elemental powers behind the menu
      for (const side of ['left', 'right'] as const) {
        this.cancelHandActivePose(side, 'bimanual-preempt');
      }
      this.bimanualChannel.activeCombo = 'none';
      this.bimanualChannel.candidateCombo = 'none';
      this.bimanual.plasmaActive = false;
      this.bimanual.voidDomeActive = false;
    }
  }

  isSpellBookOpen(): boolean {
    return this.spellBookOpen;
  }

  private cancelGestureIfActive(gesture: GestureName): void {
    for (const side of ['left', 'right'] as const) {
      if (this.channels[side].active === gesture) {
        this.cancelHandActivePose(side, 'unequipped');
      }
    }
  }

  private cancelPowerIfActive(powerId: PowerId): void {
    if (powerId === 'plasma-core' || powerId === 'void-dome') {
      if (this.bimanualChannel.activeCombo === powerId) {
        this.bimanualChannel.activeCombo = 'none';
        this.bimanualChannel.candidateCombo = 'none';
        this.bimanual.plasmaActive = false;
        this.bimanual.voidDomeActive = false;
        const ev: BimanualTransitionEvent = {
          combo: powerId,
          type: 'end',
          reason: 'unequipped',
        };
        for (const fn of this.listeners.bimanual) fn(ev);
      }
      return;
    }
    const g = this.getGestureForPower(powerId);
    if (g) this.cancelGestureIfActive(g);
  }

  private cancelHandActivePose(
    side: HandSide,
    reason: GestureExitReason
  ): void {
    const ch = this.channels[side];
    if (!ch.active) return;
    const endedGesture = ch.active;
    const confidence = this.hands[side].confidence;
    ch.active = null;
    ch.candidate = null;
    ch.phase = 'IDLE';
    ch.dwellProgress = 0;
    this.hands[side].activeGesture = null;
    this.hands[side].confidence = 0;
    const ev: GestureTransitionEvent = {
      side,
      gesture: endedGesture,
      confidence,
      reason,
    };
    for (const fn of this.listeners.gestureexit) fn(ev);
  }

  private emitLoadoutChange(): void {
    const payload: LoadoutChangeEvent = {
      equippedPowers: this.getEquippedPowers(),
      bindings: this.getGestureBindings(),
    };
    for (const fn of this.listeners.loadoutchange) fn(payload);
  }

  private createEmptyScoreMap(): Record<GestureName, number> {
    const map = {} as Record<GestureName, number>;
    for (const g of ALL_SINGLE_HAND_GESTURES) {
      map[g] = 0;
    }
    return map;
  }

  private createEmptyJointConfidenceMap(): HandJointConfidenceMap {
    const map = {} as HandJointConfidenceMap;
    for (const key of TRACKED_JOINT_KEYS) {
      map[key] = 0;
    }
    return map;
  }

  private createDefaultChargeState(): SpellChargeState {
    return {
      status: 'idle',
      chargeLevel: 0,
      gesture: null,
      pulseFrequencyHz: 0.85,
      colorHex: '#38bdf8',
      accentHex: '#64748b',
    };
  }

  private createChannel(): HandChannel {
    return {
      phase: 'IDLE',
      active: null,
      candidate: null,
      candidateSinceMs: 0,
      activeSinceMs: 0,
      exitSinceMs: 0,
      occludedSinceMs: 0,
      cooldownUntilMs: 0,
      cooldownDurationMs: DEFAULT_INTER_CAST_COOLDOWN_MS,
      cooldownBlockedLogged: false,
      pendingDischargeCooldownMs: 0,
      lastActiveGesture: null,
      rawScores: this.createEmptyScoreMap(),
      smoothedScores: this.createEmptyScoreMap(),
      topRawGesture: null,
      topRawConfidence: 0,
      jointConfidences: this.createEmptyJointConfidenceMap(),
      lastJointPositions: {},
      trackedJointCount: 0,
      trackingDropActive: false,
      wasTrackingDropped: false,
      trackingDropsTotal: 0,
      spellDischargedInPose: false,
      lastWristPos: new THREE.Vector3(),
      lastPalmNormal: new THREE.Vector3(0, 0, -1),
      hasPrevPose: false,
      smoothedVelocity: new THREE.Vector3(),
      smoothedAngularSpeed: 0,
      trackedJointRatio: 0,
      dwellProgress: 0,
      charge: this.createDefaultChargeState(),
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

  private recordBlockedMisfire(
    side: HandSide | 'bimanual' | 'head',
    candidate: ElementalGestureId | null,
    reason: MisfireBlockReason,
    nowMs: number
  ): void {
    this.misfiresBlocked++;
    this.lastBlockReason = reason;
    const payload: MisfireBlockedEvent = {
      side,
      candidate,
      reason,
      timestampMs: nowMs,
    };
    for (const fn of this.listeners.misfireblocked) fn(payload);
  }

  /**
   * Advances per-hand and bimanual hysteresis state machines for the frame.
   */
  step(
    contexts: Partial<Record<HandSide, xb.HandContext>>,
    recognizer: xb.GestureRecognizer,
    dt: number,
    nowMs: number,
    camera: THREE.Camera
  ): StateMachineStepResult {
    this.lastStepNowMs = nowMs;
    const started: GestureTransitionEvent[] = [];
    const ended: GestureTransitionEvent[] = [];
    const bimanualEvents: BimanualTransitionEvent[] = [];

    const safeDt = Math.max(0.004, Math.min(dt, 0.1));
    const scoreAlpha = 1 - Math.exp(-CONFIDENCE_EMA_LAMBDA * safeDt);

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

    const spellBookToggle = this.stepSpellBookGesture(nowMs, ended);
    this.stepBimanualChannel(camera, nowMs, ended, bimanualEvents);
    this.updateSpellChargeState('left', nowMs);
    this.updateSpellChargeState('right', nowMs);

    for (const ev of started) {
      for (const fn of this.listeners.gestureenter) fn(ev);
    }
    for (const ev of ended) {
      for (const fn of this.listeners.gestureexit) fn(ev);
    }
    for (const ev of bimanualEvents) {
      for (const fn of this.listeners.bimanual) fn(ev);
    }
    if (spellBookToggle.toggled && spellBookToggle.anchor) {
      const payload: SpellBookToggleEvent = {
        anchorPosition: spellBookToggle.anchor,
        timestampMs: nowMs,
      };
      for (const fn of this.listeners.spellbooktoggle) fn(payload);
    }

    return {
      started,
      ended,
      bimanualEvents,
      spellBookToggled: spellBookToggle.toggled,
      spellBookAnchor: spellBookToggle.anchor,
    };
  }

  /**
   * Transitions a hand channel into its post-cast VFX-resolution cooldown and
   * updates the brief global refractory timer across hands.
   */
  private enterHandCooldown(
    side: HandSide,
    nowMs: number,
    endedGesture: GestureName | null,
    customDurationMs?: number
  ): void {
    const ch = this.channels[side];
    const frame = this.hands[side];
    const profileCooldown = endedGesture
      ? this.getEffectiveProfile(endedGesture).cooldownMs
      : this.getEffectiveMinInterCastMs();
    const durationMs = Math.max(
      this.getEffectiveMinInterCastMs(),
      profileCooldown,
      customDurationMs ?? 0,
      ch.pendingDischargeCooldownMs
    );

    ch.lastActiveGesture = endedGesture ?? ch.lastActiveGesture;
    ch.active = null;
    ch.candidate = null;
    ch.dwellProgress = 0;
    ch.spellDischargedInPose = false;
    ch.pendingDischargeCooldownMs = 0;
    ch.phase = 'COOLDOWN';
    ch.cooldownDurationMs = durationMs;
    ch.cooldownUntilMs = Math.max(ch.cooldownUntilMs, nowMs + durationMs);
    ch.cooldownBlockedLogged = false;

    frame.activeGesture = null;
    frame.confidence = 0;

    this.globalCastCooldownUntilMs = Math.max(
      this.globalCastCooldownUntilMs,
      nowMs + this.getEffectiveGlobalCooldownMs()
    );
  }

  /**
   * Marks a charged spell (such as Fireball thrust or Magma flick) as discharged
   * while the hand remains in the same pose, arming the inter-cast cooldown so
   * procedural VFX have time to resolve before the next spell can trigger.
   */
  notifySpellDischarged(side: HandSide, nowMs = performance.now()): void {
    const ch = this.channels[side];
    ch.spellDischargedInPose = true;
    const activeCooldown = ch.active
      ? this.getEffectiveProfile(ch.active).cooldownMs
      : this.getEffectiveMinInterCastMs();
    ch.pendingDischargeCooldownMs = Math.max(
      ch.pendingDischargeCooldownMs,
      activeCooldown
    );
    this.globalCastCooldownUntilMs = Math.max(
      this.globalCastCooldownUntilMs,
      nowMs + this.getEffectiveGlobalCooldownMs()
    );
  }

  /**
   * Returns remaining cooldown time in milliseconds for a specific hand (including
   * the global inter-cast floor) or for the global refractory timer if omitted.
   */
  getCooldownRemainingMs(nowMs = performance.now(), side?: HandSide): number {
    const globalRem = Math.max(0, this.globalCastCooldownUntilMs - nowMs);
    if (!side) return globalRem;
    const handRem = Math.max(0, this.channels[side].cooldownUntilMs - nowMs);
    return Math.max(handRem, globalRem);
  }

  /**
   * Returns true if consecutive spell casting is currently gated by cooldown.
   */
  isCastOnCooldown(nowMs = performance.now(), side?: HandSide): boolean {
    return this.getCooldownRemainingMs(nowMs, side) > 0;
  }

  /**
   * Enforces the same consecutive-cast cooldown for controller, mouse, and
   * Spellbook fallback casts so procedural VFX always have time to resolve.
   */
  tryConsumeCastCooldown(
    nowMs = performance.now(),
    powerId?: PowerId
  ): boolean {
    const remaining = this.getCooldownRemainingMs(nowMs);
    if (remaining > 0) {
      const candidate: ElementalGestureId | null =
        powerId === 'plasma-core' || powerId === 'void-dome'
          ? powerId
          : powerId
            ? (POWER_BY_ID[powerId]?.gestureName ?? null)
            : null;
      this.recordBlockedMisfire('right', candidate, 'cast-cooldown', nowMs);
      return false;
    }

    let durationMs = this.getEffectiveMinInterCastMs();
    if (powerId === 'plasma-core' || powerId === 'void-dome') {
      durationMs = Math.max(
        durationMs,
        BIMANUAL_HYSTERESIS_PROFILES[powerId].cooldownMs *
          PRESET_SCALES[this.preset].cooldownScale
      );
    } else if (powerId) {
      const g = POWER_BY_ID[powerId]?.gestureName;
      if (g) {
        durationMs = this.getEffectiveProfile(g).cooldownMs;
      }
    }

    this.globalCastCooldownUntilMs = Math.max(
      this.globalCastCooldownUntilMs,
      nowMs + durationMs
    );
    return true;
  }

  /**
   * Returns the live spell charge status for a given hand, used to drive the
   * procedural wrist pulse shader and debug telemetry.
   */
  getSpellChargeState(side: HandSide): SpellChargeState {
    return {...this.channels[side].charge};
  }

  /**
   * Validates and debounces Head Gestures (Head Nod = Empower, Head Shake = Dispel).
   */
  processHeadGesture(
    name: string,
    confidence: number,
    nowMs: number
  ): 'nod' | 'shake' | null {
    if (name !== 'nod' && name !== 'shake') return null;
    const id: HeadGestureId = name === 'nod' ? 'head-nod' : 'head-shake';
    const profile = HEAD_HYSTERESIS_PROFILES[id];
    const scale = PRESET_SCALES[this.preset];

    const minConf = THREE.MathUtils.clamp(
      profile.minConfidence + scale.thresholdOffset,
      0.5,
      0.9
    );
    const cooldown = profile.cooldownMs * scale.dwellScale;

    if (confidence < minConf) {
      this.recordBlockedMisfire('head', id, 'head-refractory', nowMs);
      return null;
    }
    if (nowMs - this.lastHeadGestureAt[id] < cooldown) {
      this.recordBlockedMisfire('head', id, 'head-refractory', nowMs);
      return null;
    }

    this.lastHeadGestureAt[id] = nowMs;
    const ev: HeadGestureTransitionEvent = {gesture: id, confidence};
    for (const fn of this.listeners.headgesture) fn(ev);
    return name;
  }

  /**
   * Resets active locks cleanly (e.g. on Dispel or Arena Reset).
   */
  reset(nowMs = performance.now()): void {
    const resetCooldown = this.getEffectiveGlobalCooldownMs();
    for (const side of ['left', 'right'] as const) {
      const ch = this.channels[side];
      ch.phase = 'COOLDOWN';
      ch.active = null;
      ch.candidate = null;
      ch.dwellProgress = 0;
      ch.activeSinceMs = 0;
      ch.cooldownUntilMs = nowMs + resetCooldown;
      ch.cooldownDurationMs = resetCooldown;
      ch.cooldownBlockedLogged = false;
      ch.pendingDischargeCooldownMs = 0;
      ch.spellDischargedInPose = false;
      ch.topRawGesture = null;
      ch.topRawConfidence = 0;
      for (const g of ALL_SINGLE_HAND_GESTURES) {
        ch.rawScores[g] = 0;
        ch.smoothedScores[g] = 0;
      }
      ch.charge = this.createDefaultChargeState();
      this.hands[side].activeGesture = null;
      this.hands[side].confidence = 0;
    }
    this.globalCastCooldownUntilMs = nowMs + resetCooldown;
    this.bimanualChannel.activeCombo = 'none';
    this.bimanualChannel.candidateCombo = 'none';
    this.bimanualChannel.activeSinceMs = 0;
    this.bimanualChannel.cooldownBlockedLogged = false;
    this.bimanual.plasmaActive = false;
    this.bimanual.voidDomeActive = false;
  }

  getSnapshot(nowMs = this.lastStepNowMs || performance.now()): StateMachineSnapshot {
    const globalRem = Math.max(0, this.globalCastCooldownUntilMs - nowMs);
    const buildHand = (side: HandSide): HandStateSnapshot => {
      const ch = this.channels[side];
      const frame = this.hands[side];
      const handRem = Math.max(0, ch.cooldownUntilMs - nowMs);
      const cooldownRemainingMs = Math.max(handRem, globalRem);
      const cooldownProgress =
        cooldownRemainingMs > 0
          ? THREE.MathUtils.clamp(
              cooldownRemainingMs / Math.max(1, ch.cooldownDurationMs),
              0,
              1
            )
          : 0;
      return {
        phase: ch.phase,
        activeGesture: ch.active,
        candidateGesture: ch.candidate,
        topRawGesture: ch.topRawGesture,
        topRawConfidence: ch.topRawConfidence,
        confidence: frame.confidence,
        rawScores: {...ch.rawScores},
        smoothedScores: {...ch.smoothedScores},
        jointConfidences: {...ch.jointConfidences},
        trackedJointCount: ch.trackedJointCount,
        totalJointCount: TOTAL_XR_HAND_JOINTS,
        wristSpeed: frame.wristVelocity.length(),
        palmAngularSpeed: ch.smoothedAngularSpeed,
        occluded: ch.phase === 'OCCLUDED_HOLD',
        trackingDropActive: ch.trackingDropActive,
        trackingDropsTotal: ch.trackingDropsTotal,
        trackedJointRatio: ch.trackedJointRatio,
        dwellProgress: ch.dwellProgress,
        cooldownRemainingMs,
        cooldownProgress,
        charge: {...ch.charge},
      };
    };
    return {
      preset: this.preset,
      left: buildHand('left'),
      right: buildHand('right'),
      bimanual: this.bimanualChannel.activeCombo,
      globalCooldownRemainingMs: globalRem,
      misfiresBlocked: this.misfiresBlocked,
      lastBlockReason: this.lastBlockReason,
      equippedPowers: this.getEquippedPowers(),
      equippedCount: this.equippedPowers.size,
      spellBookOpen: this.spellBookOpen,
      spellBookDwellProgress: this.spellBookDwellProgress,
    };
  }

  private updateSpellChargeState(side: HandSide, nowMs: number): void {
    const ch = this.channels[side];
    const bc = this.bimanualChannel;
    const out = ch.charge;

    // 1a. Open Book summoning gesture dwell feedback (arcane gold-violet pulse)
    if (this.spellBookDwelling && this.spellBookDwellProgress > 0.05) {
      out.status = 'dwelling';
      out.gesture = null;
      out.chargeLevel = THREE.MathUtils.clamp(
        0.25 + this.spellBookDwellProgress * 0.7,
        0.25,
        0.95
      );
      out.pulseFrequencyHz = 3.2 + this.spellBookDwellProgress * 5.2;
      out.colorHex = '#fbbf24';
      out.accentHex = '#a855f7';
      return;
    }

    // 1b. Bimanual combos own both wrists' pulse state
    if (bc.activeCombo !== 'none') {
      const elapsedS = Math.max(0, (nowMs - bc.activeSinceMs) / 1000);
      const pal = getElementalPalette(bc.activeCombo, this.gestureBindings);
      out.gesture = bc.activeCombo;
      if (bc.activeCombo === 'plasma-core') {
        const sepBoost = THREE.MathUtils.clamp(
          (this.bimanual.plasmaSeparation - 0.14) / 0.44,
          0,
          1
        );
        const level = THREE.MathUtils.clamp(
          0.35 + elapsedS * 0.42 + sepBoost * 0.25,
          0.35,
          1.0
        );
        out.chargeLevel = level;
        if (level >= 0.92) {
          out.status = 'overcharged';
          out.pulseFrequencyHz = 11.5;
          out.colorHex = '#fde047';
          out.accentHex = '#f43f5e';
        } else if (level >= 0.72) {
          out.status = 'ready';
          out.pulseFrequencyHz = 8.4;
          out.colorHex = pal.primary;
          out.accentHex = '#ffffff';
        } else {
          out.status = 'charging';
          out.pulseFrequencyHz = 3.8 + level * 4.5;
          out.colorHex = pal.primary;
          out.accentHex = pal.accent;
        }
      } else {
        out.status = 'channeling';
        out.chargeLevel = 0.85;
        out.pulseFrequencyHz = 6.2;
        out.colorHex = pal.primary;
        out.accentHex = pal.accent;
      }
      return;
    }

    // 2. Occlusion warning state
    if (ch.phase === 'OCCLUDED_HOLD') {
      const holdProgress = THREE.MathUtils.clamp(
        1 - (nowMs - ch.occludedSinceMs) / Math.max(1, this.occlusionHoldMs),
        0.15,
        1
      );
      out.status = 'occluded';
      out.gesture = ch.active;
      out.chargeLevel = holdProgress;
      out.pulseFrequencyHz = 13.5;
      out.colorHex = '#f59e0b';
      out.accentHex = '#ef4444';
      return;
    }

    // 3. Post-cast cooldown state
    if (ch.phase === 'COOLDOWN') {
      const remaining = Math.max(
        0,
        Math.max(ch.cooldownUntilMs, this.globalCastCooldownUntilMs) - nowMs
      );
      const ratio = THREE.MathUtils.clamp(
        remaining / Math.max(1, ch.cooldownDurationMs),
        0,
        1
      );
      out.status = 'cooldown';
      out.gesture = ch.lastActiveGesture;
      out.chargeLevel = ratio * 0.4;
      out.pulseFrequencyHz = 1.35;
      out.colorHex = '#6366f1';
      out.accentHex = '#475569';
      return;
    }

    // 4. Hysteresis entry dwell build-up
    if (ch.phase === 'DWELL_ENTER' && ch.candidate) {
      const pal = getElementalPalette(ch.candidate, this.gestureBindings);
      out.status = 'dwelling';
      out.gesture = ch.candidate;
      out.chargeLevel = THREE.MathUtils.clamp(ch.dwellProgress * 0.45, 0.08, 0.45);
      out.pulseFrequencyHz = 2.0 + ch.dwellProgress * 3.0;
      out.colorHex = pal.primary;
      out.accentHex = '#fef08a';
      return;
    }

    // 5. Active spell (charging vs. channeling)
    if ((ch.phase === 'ACTIVE' || ch.phase === 'DWELL_EXIT') && ch.active) {
      const pal = getElementalPalette(ch.active, this.gestureBindings);
      const boundPower = this.gestureBindings[ch.active];
      const elapsedS = Math.max(0, (nowMs - ch.activeSinceMs) / 1000);
      out.gesture = ch.active;

      if (CHARGEABLE_POWERS.has(boundPower)) {
        if (ch.spellDischargedInPose) {
          out.status = 'cooldown';
          out.chargeLevel = 0.22;
          out.pulseFrequencyHz = 1.6;
          out.colorHex = pal.primary;
          out.accentHex = '#64748b';
          return;
        }
        const chargeDuration = boundPower === 'fireball' ? 1.35 : 0.95;
        const level = THREE.MathUtils.clamp(elapsedS / chargeDuration, 0.15, 1.0);
        out.chargeLevel = level;
        if (elapsedS >= chargeDuration * 1.35) {
          out.status = 'overcharged';
          out.pulseFrequencyHz = 11.8;
          out.colorHex = '#fef08a';
          out.accentHex = pal.primary;
        } else if (level >= 0.85) {
          out.status = 'ready';
          out.pulseFrequencyHz = 8.6;
          out.colorHex = pal.primary;
          out.accentHex = '#ffffff';
        } else {
          out.status = 'charging';
          out.pulseFrequencyHz = 3.2 + level * 4.8;
          out.colorHex = pal.primary;
          out.accentHex = pal.accent;
        }
      } else {
        const conf = THREE.MathUtils.clamp(this.hands[side].confidence, 0.4, 1.0);
        out.status = 'channeling';
        out.chargeLevel = 0.55 + conf * 0.35;
        out.pulseFrequencyHz = 4.8 + conf * 2.4;
        out.colorHex = pal.primary;
        out.accentHex = pal.accent;
      }
      return;
    }

    // 6. Idle ambient pulse
    out.status = 'idle';
    out.gesture = null;
    out.chargeLevel = this.hands[side].active ? 0.12 : 0;
    out.pulseFrequencyHz = 0.85;
    out.colorHex = '#38bdf8';
    out.accentHex = '#475569';
  }

  private isJointValid(ctx: xb.HandContext, jointName: xb.JointName): boolean {
    const pos = ctx.getJoint(jointName);
    return Boolean(
      pos &&
        Number.isFinite(pos.x) &&
        Number.isFinite(pos.y) &&
        Number.isFinite(pos.z)
    );
  }

  private evaluateJointHealth(
    ctx: xb.HandContext,
    ch: HandChannel
  ): {
    anchorsValid: boolean;
    ratio: number;
    hasCriticalTipsFor: (gesture: GestureName) => boolean;
  } {
    let totalTracked = 0;
    for (const jointName of xb.HAND_JOINT_NAMES) {
      if (this.isJointValid(ctx, jointName)) totalTracked++;
    }
    ch.trackedJointCount = totalTracked;

    const wrist = ctx.getJoint('wrist');
    const handScale = Math.max(0.06, xb.estimateHandScale(ctx));
    const maxAnatomicalReach = handScale * 2.65;

    let anyCriticalDrop = false;
    for (const key of TRACKED_JOINT_KEYS) {
      const pos = ctx.getJoint(key);
      if (
        !pos ||
        !Number.isFinite(pos.x) ||
        !Number.isFinite(pos.y) ||
        !Number.isFinite(pos.z)
      ) {
        ch.jointConfidences[key] = 0;
        anyCriticalDrop = true;
        continue;
      }

      let rawConf = 1.0;

      // Penalize implausible anatomical distance from wrist (partial tracking drift)
      if (key !== 'wrist' && wrist && this.isJointValid(ctx, 'wrist')) {
        const distFromWrist = pos.distanceTo(wrist);
        if (distFromWrist < 0.015 || distFromWrist > maxAnatomicalReach) {
          rawConf *= 0.35;
        }
      }

      // Penalize abrupt per-joint frame jump (optical tracking jitter / drop spike)
      const prev = ch.lastJointPositions[key];
      if (prev) {
        const jump = pos.distanceTo(prev);
        if (jump > MAX_FRAME_JUMP_METERS) {
          rawConf *= 0.15;
          anyCriticalDrop = true;
        } else if (jump > 0.09) {
          const penalty = THREE.MathUtils.clamp(
            (jump - 0.09) / (MAX_FRAME_JUMP_METERS - 0.09),
            0,
            1
          );
          rawConf *= 1 - penalty * 0.65;
        }
        prev.copy(pos);
      } else {
        ch.lastJointPositions[key] = pos.clone();
      }

      ch.jointConfidences[key] = THREE.MathUtils.clamp(rawConf, 0, 1);
      if (rawConf < 0.5) anyCriticalDrop = true;
    }

    const anchorsValid = ANCHOR_JOINTS.every((j) => this.isJointValid(ctx, j));
    let validTips = 0;
    for (const tip of ALL_TIP_JOINTS) {
      if (this.isJointValid(ctx, tip)) validTips++;
    }
    const ratio =
      ((anchorsValid ? ANCHOR_JOINTS.length : 0) + validTips) /
      (ANCHOR_JOINTS.length + ALL_TIP_JOINTS.length);

    const dropNow = !anchorsValid || anyCriticalDrop || totalTracked < 18;
    if (dropNow && !ch.wasTrackingDropped && ch.hasPrevPose) {
      ch.trackingDropsTotal++;
    }
    ch.trackingDropActive = dropNow;
    ch.wasTrackingDropped = dropNow;

    return {
      anchorsValid,
      ratio,
      hasCriticalTipsFor: (gesture: GestureName) =>
        GESTURE_CRITICAL_TIPS[gesture].every((j) => this.isJointValid(ctx, j)),
    };
  }

  private handleOcclusionFrame(
    side: HandSide,
    ch: HandChannel,
    frame: TrackedHandFrame,
    nowMs: number,
    ended: GestureTransitionEvent[]
  ): void {
    // Damp velocity cleanly while occluded so no phantom thrust/flick fires
    ch.smoothedVelocity.multiplyScalar(0.82);
    ch.smoothedAngularSpeed *= 0.82;
    frame.wristVelocity.copy(ch.smoothedVelocity);
    ch.candidate = null;
    ch.dwellProgress = 0;

    if (ch.active) {
      if (ch.phase !== 'OCCLUDED_HOLD') {
        ch.phase = 'OCCLUDED_HOLD';
        ch.occludedSinceMs = nowMs;
      }
      if (nowMs - ch.occludedSinceMs >= this.occlusionHoldMs) {
        const lostGesture = ch.active;
        ended.push({
          side,
          gesture: lostGesture,
          confidence: 0,
          reason: 'occlusion-timeout',
        });
        this.recordBlockedMisfire(side, lostGesture, 'joint-occlusion', nowMs);
        ch.lastActiveGesture = lostGesture;
        ch.active = null;
        ch.phase = 'IDLE';
        ch.hasPrevPose = false;
        frame.active = false;
        frame.activeGesture = null;
        frame.confidence = 0;
      }
      return;
    }

    if (nowMs - frame.lastSeenAt > this.occlusionHoldMs) {
      ch.phase = 'IDLE';
      ch.hasPrevPose = false;
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

    // 1. Validate hand context & anchor joints
    if (!ctx) {
      if (ch.hasPrevPose && !ch.wasTrackingDropped) {
        ch.trackingDropsTotal++;
      }
      ch.trackedJointRatio = 0;
      ch.trackedJointCount = 0;
      ch.trackingDropActive = ch.hasPrevPose;
      ch.wasTrackingDropped = ch.hasPrevPose;
      ch.topRawGesture = null;
      ch.topRawConfidence = 0;
      for (const key of TRACKED_JOINT_KEYS) {
        ch.jointConfidences[key] = 0;
      }
      for (const g of ALL_SINGLE_HAND_GESTURES) {
        ch.rawScores[g] = 0;
      }
      this.handleOcclusionFrame(side, ch, frame, nowMs, ended);
      return;
    }

    const health = this.evaluateJointHealth(ctx, ch);
    ch.trackedJointRatio = health.ratio;

    if (!health.anchorsValid) {
      this.handleOcclusionFrame(side, ch, frame, nowMs, ended);
      return;
    }

    // If an active gesture loses its own critical fingertips, hold cleanly in OCCLUDED_HOLD
    if (ch.active && !health.hasCriticalTipsFor(ch.active)) {
      this.handleOcclusionFrame(side, ch, frame, nowMs, ended);
      return;
    }

    const wrist = ctx.getJoint('wrist')!;
    const palmPose = xb.getPalmPose(ctx);
    if (!palmPose) {
      this.handleOcclusionFrame(side, ch, frame, nowMs, ended);
      return;
    }

    // 2. Reject optical tracking teleportation spikes as occlusion glitches
    if (ch.hasPrevPose) {
      const jumpDist = wrist.distanceTo(ch.lastWristPos);
      if (jumpDist > MAX_FRAME_JUMP_METERS) {
        this.recordBlockedMisfire(
          side,
          ch.active ?? ch.candidate,
          'optical-jump-spike',
          nowMs
        );
        this.handleOcclusionFrame(side, ch, frame, nowMs, ended);
        ch.lastWristPos.lerp(wrist, 0.25);
        return;
      }
    }

    // 3. Valid tracking frame: update spatial kinematics + linear & angular speed
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

    if (ch.hasPrevPose) {
      _vecA.subVectors(wrist, ch.lastWristPos).divideScalar(dt);
      ch.smoothedVelocity.lerp(_vecA, VELOCITY_EMA_ALPHA);

      const dot = THREE.MathUtils.clamp(
        frame.palmNormal.dot(ch.lastPalmNormal),
        -1,
        1
      );
      const angVel = Math.acos(dot) / dt;
      ch.smoothedAngularSpeed = THREE.MathUtils.lerp(
        ch.smoothedAngularSpeed,
        angVel,
        VELOCITY_EMA_ALPHA
      );
    } else {
      ch.smoothedVelocity.set(0, 0, 0);
      ch.smoothedAngularSpeed = 0;
      ch.hasPrevPose = true;
    }
    ch.lastWristPos.copy(wrist);
    ch.lastPalmNormal.copy(frame.palmNormal);
    frame.wristVelocity.copy(ch.smoothedVelocity);

    const wristSpeed = ch.smoothedVelocity.length();
    const palmAngSpeed = ch.smoothedAngularSpeed;

    // 4. Score & exponentially smooth all 11 single-hand gestures
    const rawScores = recognizer.recognize(ctx) as xb.GestureScoreMap;
    let bestGesture: GestureName | null = null;
    let bestScore = 0;
    let topRawGesture: GestureName | null = null;
    let topRawConfidence = 0;

    for (const g of ALL_SINGLE_HAND_GESTURES) {
      const raw = health.hasCriticalTipsFor(g)
        ? (rawScores[g]?.confidence ?? 0)
        : 0;
      ch.rawScores[g] = raw;
      if (raw > topRawConfidence) {
        topRawConfidence = raw;
        topRawGesture = g;
      }
      const smoothed =
        ch.smoothedScores[g] + (raw - ch.smoothedScores[g]) * scoreAlpha;
      ch.smoothedScores[g] = smoothed;
      if (this.isGestureEquipped(g) && smoothed > bestScore) {
        bestScore = smoothed;
        bestGesture = g;
      }
    }
    ch.topRawGesture = topRawGesture;
    ch.topRawConfidence = topRawConfidence;

    // Suspend single-hand casting while the Spell Book menu is open so UI pinches
    // and browsing motions never misfire elemental spells
    if (this.spellBookOpen) {
      ch.candidate = null;
      ch.dwellProgress = 0;
      if (ch.active) {
        ended.push({
          side,
          gesture: ch.active,
          confidence: frame.confidence,
          reason: 'bimanual-preempt',
        });
        ch.active = null;
        ch.phase = 'IDLE';
      }
      frame.activeGesture = null;
      frame.confidence = 0;
      return;
    }

    // Resume seamlessly from OCCLUDED_HOLD when tracking recovers cleanly
    if (ch.phase === 'OCCLUDED_HOLD') {
      ch.phase = ch.active ? 'ACTIVE' : 'IDLE';
    }

    // Respect per-hand and global post-cast cooldown so procedural VFX can resolve
    if (ch.phase === 'COOLDOWN') {
      const cooldownTargetMs = Math.max(
        ch.cooldownUntilMs,
        this.globalCastCooldownUntilMs
      );
      if (nowMs < cooldownTargetMs) {
        if (
          !ch.cooldownBlockedLogged &&
          bestGesture &&
          bestScore >= this.getEffectiveProfile(bestGesture).enterThreshold
        ) {
          ch.cooldownBlockedLogged = true;
          this.recordBlockedMisfire(side, bestGesture, 'cast-cooldown', nowMs);
        }
        ch.candidate = null;
        ch.dwellProgress = 0;
        frame.activeGesture = null;
        frame.confidence = 0;
        return;
      }
      ch.phase = 'IDLE';
      ch.cooldownBlockedLogged = false;
    }

    // Yield single-hand entry while a bimanual combo owns both hands
    if (this.bimanualChannel.activeCombo !== 'none') {
      frame.activeGesture = ch.active;
      frame.confidence = ch.active ? ch.smoothedScores[ch.active] : 0;
      return;
    }

    // 5. Execute Asymmetric Hysteresis FSM transitions
    if (ch.active) {
      if (!this.isGestureEquipped(ch.active)) {
        ended.push({
          side,
          gesture: ch.active,
          confidence: frame.confidence,
          reason: 'unequipped',
        });
        ch.active = null;
        ch.candidate = null;
        ch.phase = 'IDLE';
        ch.dwellProgress = 0;
        frame.activeGesture = null;
        frame.confidence = 0;
        return;
      }
      const activeProfile = this.getEffectiveProfile(ch.active);
      const activeScore = ch.smoothedScores[ch.active];

      if (activeScore >= activeProfile.exitThreshold) {
        ch.exitSinceMs = 0;
        ch.phase = 'ACTIVE';
        frame.activeGesture = ch.active;
        frame.confidence = activeScore;

        // Direct switch requires dominant confidence margin + motion & transition guards
        if (bestGesture && bestGesture !== ch.active) {
          const nextProfile = this.getEffectiveProfile(bestGesture);
          const switchMargin = nextProfile.enterThreshold + 0.1;
          if (bestScore >= switchMargin) {
            if (wristSpeed > nextProfile.maxEntrySpeedMps) {
              if (ch.candidate !== null) {
                this.recordBlockedMisfire(
                  side,
                  bestGesture,
                  'rapid-linear-motion',
                  nowMs
                );
              }
              ch.candidate = null;
              ch.dwellProgress = 0;
            } else if (palmAngSpeed > nextProfile.maxPalmAngularSpeedRad) {
              if (ch.candidate !== null) {
                this.recordBlockedMisfire(
                  side,
                  bestGesture,
                  'rapid-wrist-rotation',
                  nowMs
                );
              }
              ch.candidate = null;
              ch.dwellProgress = 0;
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
                  // Enforce inter-cast cooldown before entering the next spell so
                  // procedural VFX resolve cleanly and rapid pose toggling cannot spam
                  this.enterHandCooldown(side, nowMs, prev);
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
        // Below exitThreshold: require continuous exit dwell to ignore 1-frame dips
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
          this.enterHandCooldown(side, nowMs, endedGesture);
        } else {
          frame.activeGesture = ch.active;
          frame.confidence = activeScore;
        }
      }
      return;
    }

    // IDLE / DWELL_ENTER state
    if (bestGesture) {
      const profile = this.getEffectiveProfile(bestGesture);
      if (bestScore >= profile.enterThreshold) {
        // Enforce brief global VFX-resolution refractory window across consecutive casts
        if (nowMs < this.globalCastCooldownUntilMs) {
          const rem = this.globalCastCooldownUntilMs - nowMs;
          ch.phase = 'COOLDOWN';
          ch.cooldownDurationMs = Math.max(rem, this.getEffectiveGlobalCooldownMs());
          ch.cooldownUntilMs = this.globalCastCooldownUntilMs;
          ch.candidate = null;
          ch.dwellProgress = 0;
          if (!ch.cooldownBlockedLogged) {
            ch.cooldownBlockedLogged = true;
            this.recordBlockedMisfire(side, bestGesture, 'cast-cooldown', nowMs);
          }
          frame.activeGesture = null;
          frame.confidence = 0;
          return;
        }
        if (wristSpeed > profile.maxEntrySpeedMps) {
          if (ch.candidate !== null) {
            this.recordBlockedMisfire(
              side,
              bestGesture,
              'rapid-linear-motion',
              nowMs
            );
          }
          ch.candidate = null;
          ch.phase = 'IDLE';
          ch.dwellProgress = 0;
          frame.activeGesture = null;
          frame.confidence = 0;
          return;
        }

        if (palmAngSpeed > profile.maxPalmAngularSpeedRad) {
          if (ch.candidate !== null) {
            this.recordBlockedMisfire(
              side,
              bestGesture,
              'rapid-wrist-rotation',
              nowMs
            );
          }
          ch.candidate = null;
          ch.phase = 'IDLE';
          ch.dwellProgress = 0;
          frame.activeGesture = null;
          frame.confidence = 0;
          return;
        }

        // Apply extra dwell if transitioning shortly after a silhouette-adjacent pose
        const recentMult =
          ch.lastActiveGesture && nowMs - ch.cooldownUntilMs < 350
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
            ch.activeSinceMs = nowMs;
            ch.spellDischargedInPose = false;
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
        if (ch.candidate !== null) {
          this.recordBlockedMisfire(
            side,
            ch.candidate,
            'transition-guard',
            nowMs
          );
        }
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

  /**
   * Evaluates the bimanual "Open Book" gesture (both open palms held side-by-side
   * tilted upward like reading an open tome). Distinct from Plasma Fusion Core
   * (palms facing inward toward each other) and Void Dome (crossed fists).
   */
  private stepSpellBookGesture(
    nowMs: number,
    endedSingle: GestureTransitionEvent[]
  ): {toggled: boolean; anchor: THREE.Vector3 | null} {
    const L = this.hands.left;
    const R = this.hands.right;

    let poseMatched = false;
    if (L.active && R.active) {
      const palmDist = L.palmCenter.distanceTo(R.palmCenter);
      const palmsAligned = L.palmNormal.dot(R.palmNormal);
      const leftOpen = Math.max(
        this.channels.left.smoothedScores['palm-up'],
        this.channels.left.smoothedScores['open-palm'],
        this.channels.left.smoothedScores['spread']
      );
      const rightOpen = Math.max(
        this.channels.right.smoothedScores['palm-up'],
        this.channels.right.smoothedScores['open-palm'],
        this.channels.right.smoothedScores['spread']
      );
      const lowLinearMotion =
        L.wristVelocity.length() < 1.0 && R.wristVelocity.length() < 1.0;

      if (
        leftOpen >= 0.48 &&
        rightOpen >= 0.48 &&
        L.palmNormal.y > 0.42 &&
        R.palmNormal.y > 0.42 &&
        palmsAligned > 0.42 &&
        palmDist >= 0.075 &&
        palmDist <= 0.36 &&
        lowLinearMotion
      ) {
        poseMatched = true;
        _spellBookMidpoint
          .addVectors(L.palmCenter, R.palmCenter)
          .multiplyScalar(0.5);
        _spellBookMidpoint.y += 0.22;
      }
    }

    if (!poseMatched) {
      this.spellBookDwelling = false;
      this.spellBookDwellProgress = 0;
      this.spellBookLatchBlocked = false;
      return {toggled: false, anchor: null};
    }

    // Require releasing the Open Book pose before a second toggle can trigger
    if (this.spellBookLatchBlocked || nowMs < this.spellBookCooldownUntilMs) {
      this.spellBookDwelling = false;
      this.spellBookDwellProgress = 0;
      return {toggled: false, anchor: null};
    }

    if (!this.spellBookDwelling) {
      this.spellBookDwelling = true;
      this.spellBookDwellSinceMs = nowMs;
      this.spellBookDwellProgress = 0;
      return {toggled: false, anchor: null};
    }

    const dwellElapsed = nowMs - this.spellBookDwellSinceMs;
    const scale = PRESET_SCALES[this.preset];
    const requiredDwell = SPELL_BOOK_DWELL_MS * scale.dwellScale;
    this.spellBookDwellProgress = Math.min(1, dwellElapsed / requiredDwell);

    if (dwellElapsed >= requiredDwell) {
      this.spellBookDwelling = false;
      this.spellBookDwellProgress = 0;
      this.spellBookLatchBlocked = true;
      this.spellBookCooldownUntilMs = nowMs + SPELL_BOOK_COOLDOWN_MS;

      // Preempt any single-hand pose (e.g. palm-up Verdant Flora) cleanly
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

      return {toggled: true, anchor: _spellBookMidpoint.clone()};
    }

    return {toggled: false, anchor: null};
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
    const scale = PRESET_SCALES[this.preset];

    let detected: 'none' | BimanualGestureId = 'none';

    if (L.active && R.active && !this.spellBookOpen && !this.spellBookDwelling) {
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

      const plasmaProf = BIMANUAL_HYSTERESIS_PROFILES['plasma-core'];
      const isPlasma = bc.activeCombo === 'plasma-core';
      const minSep = isPlasma
        ? plasmaProf.exitMinSeparation
        : plasmaProf.enterMinSeparation;
      const maxSep = isPlasma
        ? plasmaProf.exitMaxSeparation
        : plasmaProf.enterMaxSeparation;
      const openMin = isPlasma
        ? plasmaProf.exitConfidence
        : plasmaProf.enterConfidence;
      const dotCutoff = isPlasma ? -0.22 : -0.45;

      if (
        this.equippedPowers.has('plasma-core') &&
        (isPlasma ||
          (nowMs >= bc.cooldownUntilMs['plasma-core'] &&
            nowMs >= this.globalCastCooldownUntilMs)) &&
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
        const voidProf = BIMANUAL_HYSTERESIS_PROFILES['void-dome'];
        const isVoid = bc.activeCombo === 'void-dome';
        const maxWristDist = isVoid
          ? voidProf.exitMaxSeparation
          : voidProf.enterMaxSeparation;
        const fistMin = isVoid
          ? voidProf.exitConfidence
          : voidProf.enterConfidence;

        if (
          this.equippedPowers.has('void-dome') &&
          (isVoid ||
            (nowMs >= bc.cooldownUntilMs['void-dome'] &&
              nowMs >= this.globalCastCooldownUntilMs)) &&
          leftFistScore >= fistMin &&
          rightFistScore >= fistMin &&
          wristDist < maxWristDist
        ) {
          detected = 'void-dome';
          camera.getWorldPosition(_vecC);
          this.bimanual.voidDomeCenter.copy(_vecC);
          this.bimanual.voidDomeCenter.y -= 0.15;
        } else if (
          bc.activeCombo === 'none' &&
          !bc.cooldownBlockedLogged &&
          ((leftOpenScore >= openMin &&
            rightOpenScore >= openMin &&
            palmDist >= minSep &&
            palmDist <= maxSep &&
            (facingDot < dotCutoff || facingEachOther)) ||
            (leftFistScore >= fistMin &&
              rightFistScore >= fistMin &&
              wristDist < maxWristDist))
        ) {
          bc.cooldownBlockedLogged = true;
          this.recordBlockedMisfire('bimanual', null, 'cast-cooldown', nowMs);
        }
      }
    }

    if (bc.activeCombo !== 'none') {
      const prof = BIMANUAL_HYSTERESIS_PROFILES[bc.activeCombo];
      if (detected === bc.activeCombo) {
        bc.exitSinceMs = 0;
      } else {
        if (bc.exitSinceMs === 0) bc.exitSinceMs = nowMs;
        if (nowMs - bc.exitSinceMs >= prof.exitDwellMs * scale.dwellScale) {
          const prev = bc.activeCombo;
          const comboCooldown = prof.cooldownMs * scale.cooldownScale;
          bc.activeCombo = 'none';
          bc.exitSinceMs = 0;
          bc.cooldownUntilMs[prev] = nowMs + comboCooldown;
          bc.cooldownBlockedLogged = false;
          // Place both hands into brief post-combo cooldown so releasing Plasma
          // Core or uncrossing wrists cannot immediately fire stray spells
          const handPostComboCooldown = Math.max(
            this.getEffectiveMinInterCastMs(),
            comboCooldown * 0.65
          );
          this.enterHandCooldown('left', nowMs, null, handPostComboCooldown);
          this.enterHandCooldown('right', nowMs, null, handPostComboCooldown);
          bimanualEvents.push({
            combo: prev,
            type: 'end',
            reason: 'confidence-drop',
          });
        }
      }
    } else if (detected !== 'none') {
      const prof = BIMANUAL_HYSTERESIS_PROFILES[detected];
      if (bc.candidateCombo !== detected) {
        bc.candidateCombo = detected;
        bc.candidateSinceMs = nowMs;
      } else if (
        nowMs - bc.candidateSinceMs >=
        prof.enterDwellMs * scale.dwellScale
      ) {
        // Preempt active single-hand spells cleanly so they never misfire
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
        bc.activeSinceMs = nowMs;
        bc.candidateCombo = 'none';
        bc.exitSinceMs = 0;
        bc.cooldownBlockedLogged = false;
        bimanualEvents.push({combo: detected, type: 'start'});
      }
    } else {
      bc.candidateCombo = 'none';
      if (
        nowMs >= bc.cooldownUntilMs['plasma-core'] &&
        nowMs >= bc.cooldownUntilMs['void-dome'] &&
        nowMs >= this.globalCastCooldownUntilMs
      ) {
        bc.cooldownBlockedLogged = false;
      }
    }

    this.bimanual.plasmaActive = bc.activeCombo === 'plasma-core';
    this.bimanual.voidDomeActive = bc.activeCombo === 'void-dome';
  }
}

export {GestureStateMachine as ElementalGestureStateMachine};
