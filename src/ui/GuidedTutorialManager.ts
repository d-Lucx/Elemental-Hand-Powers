import * as THREE from 'three';
import * as xb from 'xrblocks';

import {ELEMENTAL_POWERS, POWER_BY_ID} from '../constants.ts';
import {
  ALL_SINGLE_HAND_GESTURES,
  StateMachineSnapshot,
} from '../gestures/GestureStateMachine.ts';
import {GestureName, PowerId} from '../types.ts';
import {
  createGestureIllustrationTexture,
  GuideEntryId,
} from './IdleGestureGuidePanel.ts';

export type TutorialStepId = PowerId | 'head-modifiers' | 'open-book';

type BeaconMotionKind =
  | 'thrust-forward'
  | 'sweep-arc'
  | 'hold-steady'
  | 'aim-point'
  | 'pull-pinch'
  | 'expand-ring'
  | 'lift-up'
  | 'flick-up'
  | 'dual-gather'
  | 'cross-wrists'
  | 'head-nod'
  | 'open-book';

interface TutorialStepSpec {
  id: TutorialStepId;
  title: string;
  defaultGestureLabel: string;
  coachingTip: string;
  colorHex: string;
  colorInt: number;
  accentHex: string;
  motion: BeaconMotionKind;
  powerId?: PowerId;
}

const STORAGE_KEY = 'ehp_guided_tutorial_completed_v1';

const GESTURE_LABELS: Record<GestureName, string> = {
  'open-palm': 'Open Palm',
  victory: 'Peace Sign',
  fist: 'Closed Fist',
  point: 'Point',
  pinch: 'Pinch',
  spread: 'Finger Spread',
  'thumbs-up': 'Thumbs-Up',
  rock: 'Rock-On',
  shaka: 'Shaka',
  'finger-gun': 'Finger Gun',
  'palm-up': 'Palm-Up Cup',
};

const TUTORIAL_STEPS: readonly TutorialStepSpec[] = [
  {
    id: 'fireball',
    powerId: 'fireball',
    title: 'Fireballs',
    defaultGestureLabel: 'Open Palm',
    coachingTip: 'Hold an open palm steady to charge, then thrust forward or release.',
    colorHex: POWER_BY_ID.fireball.colorHex,
    colorInt: POWER_BY_ID.fireball.colorInt,
    accentHex: '#ffd166',
    motion: 'thrust-forward',
  },
  {
    id: 'earth-shield',
    powerId: 'earth-shield',
    title: 'Earth Shield',
    defaultGestureLabel: 'Closed Fist',
    coachingTip: 'Clench a closed fist briefly to raise a protective basalt shield.',
    colorHex: POWER_BY_ID['earth-shield'].colorHex,
    colorInt: POWER_BY_ID['earth-shield'].colorInt,
    accentHex: '#ddb892',
    motion: 'hold-steady',
  },
  {
    id: 'frost-lance',
    powerId: 'frost-lance',
    title: 'Frost Lance',
    defaultGestureLabel: 'Point',
    coachingTip: 'Extend your index finger and aim at a crystal to stream ice shards.',
    colorHex: POWER_BY_ID['frost-lance'].colorHex,
    colorInt: POWER_BY_ID['frost-lance'].colorInt,
    accentHex: '#e0f2fe',
    motion: 'aim-point',
  },
  {
    id: 'rainbow-ribbons',
    powerId: 'rainbow-ribbons',
    title: 'Rainbow Ribbons',
    defaultGestureLabel: 'Peace Sign',
    coachingTip: 'Hold a V peace sign and sweep your hand to paint iridescent ribbons.',
    colorHex: POWER_BY_ID['rainbow-ribbons'].colorHex,
    colorInt: POWER_BY_ID['rainbow-ribbons'].colorInt,
    accentHex: '#38bdf8',
    motion: 'sweep-arc',
  },
  {
    id: 'lightning-tether',
    powerId: 'lightning-tether',
    title: 'Lightning Tether',
    defaultGestureLabel: 'Pinch',
    coachingTip: 'Pinch thumb & index together to grapple a crystal, then fling on release.',
    colorHex: POWER_BY_ID['lightning-tether'].colorHex,
    colorInt: POWER_BY_ID['lightning-tether'].colorInt,
    accentHex: '#fef08a',
    motion: 'pull-pinch',
  },
  {
    id: 'kinetic-gale',
    powerId: 'kinetic-gale',
    title: 'Kinetic Gale',
    defaultGestureLabel: 'Finger Spread',
    coachingTip: 'Splay all five fingers wide to unleash a radial shockwave blast.',
    colorHex: POWER_BY_ID['kinetic-gale'].colorHex,
    colorInt: POWER_BY_ID['kinetic-gale'].colorInt,
    accentHex: '#fef3c7',
    motion: 'expand-ring',
  },
  {
    id: 'sky-updraft',
    powerId: 'sky-updraft',
    title: 'Sky Updraft',
    defaultGestureLabel: 'Thumbs-Up',
    coachingTip: 'Raise a steady thumbs-up to summon an ascending levitation vortex.',
    colorHex: POWER_BY_ID['sky-updraft'].colorHex,
    colorInt: POWER_BY_ID['sky-updraft'].colorInt,
    accentHex: '#cffafe',
    motion: 'lift-up',
  },
  {
    id: 'chain-lightning',
    powerId: 'chain-lightning',
    title: 'Chain Lightning',
    defaultGestureLabel: 'Rock-On',
    coachingTip: 'Extend index & pinky (rock-on) to arc voltage across crystal targets.',
    colorHex: POWER_BY_ID['chain-lightning'].colorHex,
    colorInt: POWER_BY_ID['chain-lightning'].colorInt,
    accentHex: '#e0e7ff',
    motion: 'aim-point',
  },
  {
    id: 'tidal-vortex',
    powerId: 'tidal-vortex',
    title: 'Tidal Vortex',
    defaultGestureLabel: 'Shaka',
    coachingTip: 'Extend thumb & pinky wide (shaka) to swirl a water cyclone above wrist.',
    colorHex: POWER_BY_ID['tidal-vortex'].colorHex,
    colorInt: POWER_BY_ID['tidal-vortex'].colorInt,
    accentHex: '#7dd3fc',
    motion: 'sweep-arc',
  },
  {
    id: 'magma-bolt',
    powerId: 'magma-bolt',
    title: 'Magma Bolt',
    defaultGestureLabel: 'Finger Gun',
    coachingTip: 'Form a finger gun to charge molten rock, then flick upward to fire.',
    colorHex: POWER_BY_ID['magma-bolt'].colorHex,
    colorInt: POWER_BY_ID['magma-bolt'].colorInt,
    accentHex: '#fb923c',
    motion: 'flick-up',
  },
  {
    id: 'verdant-flora',
    powerId: 'verdant-flora',
    title: 'Verdant Flora',
    defaultGestureLabel: 'Palm-Up Cup',
    coachingTip: 'Cup your open palm facing upward to bloom glowing helical vines.',
    colorHex: POWER_BY_ID['verdant-flora'].colorHex,
    colorInt: POWER_BY_ID['verdant-flora'].colorInt,
    accentHex: '#a7f3d0',
    motion: 'lift-up',
  },
  {
    id: 'plasma-core',
    powerId: 'plasma-core',
    title: 'Plasma Fusion Core',
    defaultGestureLabel: 'Double Palm Facing',
    coachingTip: 'Face both open palms inward together, grow the star, then release.',
    colorHex: POWER_BY_ID['plasma-core'].colorHex,
    colorInt: POWER_BY_ID['plasma-core'].colorInt,
    accentHex: '#fde047',
    motion: 'dual-gather',
  },
  {
    id: 'void-dome',
    powerId: 'void-dome',
    title: 'Void Barrier Dome',
    defaultGestureLabel: 'Crossed Wrists',
    coachingTip: 'Cross both wrists in an X in front of your chest to raise the Void Dome.',
    colorHex: POWER_BY_ID['void-dome'].colorHex,
    colorInt: POWER_BY_ID['void-dome'].colorInt,
    accentHex: '#d8b4fe',
    motion: 'cross-wrists',
  },
  {
    id: 'head-modifiers',
    title: 'Empower / Dispel',
    defaultGestureLabel: 'Head Nod / Shake',
    coachingTip: 'Nod your head (or press N) to empower spells, or Shake (X) to dispel.',
    colorHex: '#fde047',
    colorInt: 0xfde047,
    accentHex: '#94a3b8',
    motion: 'head-nod',
  },
  {
    id: 'open-book',
    title: 'Summon Spell Book',
    defaultGestureLabel: 'Open Book Palms',
    coachingTip: 'Hold both open palms side-by-side tilted upward (or press B) to open your Spell Book.',
    colorHex: '#fbbf24',
    colorInt: 0xfbbf24,
    accentHex: '#c084fc',
    motion: 'open-book',
  },
];

export interface GuidedTutorialCallbacks {
  onStepCompleted?: (stepId: TutorialStepId, remainingCount: number) => void;
  onAllCompleted?: () => void;
  onVisibilityChange?: (active: boolean) => void;
  onPracticeCast?: (powerId: PowerId) => void;
}

const _camPos = new THREE.Vector3();
const _camForward = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _camUp = new THREE.Vector3();
const _beaconTarget = new THREE.Vector3();
const _colorTmp = new THREE.Color();

/**
 * Non-intrusive guided tutorial sequence with:
 * 1. Compact peripheral floating `xb.UICard` (FollowHead + FaceCamera) showing the
 *    current gesture illustration, live confidence/dwell bar, and coaching tip.
 * 2. Floating translucent 3D spatial motion beacon (pointer-transparent) that
 *    visually cues the hand motion (thrust, flick, aim, dual-palm, open book)
 *    and flashes emerald on first-time mastery of each elemental gesture.
 */
export class GuidedTutorialManager extends THREE.Group {
  readonly card: xb.UICard;

  private readonly visibilityTransition: xb.VisibilityTransition;
  private readonly textures = new Map<GuideEntryId, THREE.CanvasTexture>();
  private readonly completed = new Set<TutorialStepId>();
  private gestureBindings: Partial<Record<GestureName, PowerId>> = {};

  private _active = false;
  private currentStepIndex = 0;
  private celebrationTimer = 0;
  private elapsed = 0;

  // Retained UI widgets
  private readonly stepCounterText: xb.UIText;
  private readonly titleText: xb.UIText;
  private readonly gestureBadgeText: xb.UIText;
  private readonly tipText: xb.UIText;
  private readonly statusText: xb.UIText;
  private readonly illustrationImg: xb.UIImage;
  private readonly progressFill: xb.UIPanel;
  private readonly accentBar: xb.UIPanel;
  private readonly tryBtn: xb.UIButton;
  private readonly skipBtn: xb.UIButton;
  private readonly hideBtn: xb.UIButton;

  // Non-intrusive 3D floating spatial motion indicator beacon
  private readonly beaconGroup: THREE.Group;
  private readonly outerRingMesh: THREE.Mesh;
  private readonly innerRingMesh: THREE.Mesh;
  private readonly cueArrowGroup: THREE.Group;
  private readonly secondaryRingMesh: THREE.Mesh;
  private readonly beaconGeos: THREE.BufferGeometry[] = [];
  private readonly beaconMats: THREE.MeshBasicMaterial[] = [];
  private readonly outerRingMat: THREE.MeshBasicMaterial;
  private readonly innerRingMat: THREE.MeshBasicMaterial;
  private readonly cueMat: THREE.MeshBasicMaterial;

  constructor(private readonly callbacks: GuidedTutorialCallbacks = {}) {
    super();
    this.name = 'Guided Elemental Tutorial';

    this.loadPersistedProgress();

    // Pre-generate crisp vector-style gesture illustrations once
    for (const step of TUTORIAL_STEPS) {
      const tex = createGestureIllustrationTexture({
        id: step.id,
        title: step.title,
        gesture: step.defaultGestureLabel,
        colorHex: step.colorHex,
        accentHex: step.accentHex,
      });
      this.textures.set(step.id, tex);
    }

    // --- Compact, Non-Intrusive Floating Tutorial Card ---
    this.accentBar = new xb.UIPanel({
      pointerEvents: 'none',
      style: {
        width: '100%',
        height: 4,
        borderRadius: 2,
        backgroundColor: TUTORIAL_STEPS[0].colorHex,
      },
    });

    this.stepCounterText = new xb.UIText({
      text: 'GUIDED LESSON 1 / 15',
      pointerEvents: 'none',
      style: {
        fontSize: 11,
        fontWeight: 'bold',
        color: '#94a3b8',
      },
    });

    this.gestureBadgeText = new xb.UIText({
      text: 'Open Palm',
      pointerEvents: 'none',
      style: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#fde68a',
      },
    });

    const topRow = new xb.UIPanel({
      pointerEvents: 'none',
      style: {
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
      },
      children: [this.stepCounterText, this.gestureBadgeText],
    });

    this.illustrationImg = new xb.UIImage({
      src: this.textures.get('fireball')!,
      ariaLabel: 'Current tutorial gesture illustration',
      pointerEvents: 'none',
      style: {
        width: 112,
        height: 70,
        objectFit: 'contain',
        borderRadius: 10,
      },
    });

    this.titleText = new xb.UIText({
      text: 'Fireballs',
      pointerEvents: 'none',
      style: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#ff6b2b',
      },
    });

    this.tipText = new xb.UIText({
      text: TUTORIAL_STEPS[0].coachingTip,
      pointerEvents: 'none',
      style: {
        fontSize: 12,
        lineHeight: 1.3,
        color: '#e2e8f0',
      },
    });

    const bodyRow = new xb.UIPanel({
      pointerEvents: 'none',
      style: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      },
      children: [
        this.illustrationImg,
        new xb.UIPanel({
          pointerEvents: 'none',
          style: {
            flexGrow: 1,
            flexBasis: 0,
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 4,
          },
          children: [this.titleText, this.tipText],
        }),
      ],
    });

    this.progressFill = new xb.UIPanel({
      pointerEvents: 'none',
      style: {
        width: '4%',
        height: '100%',
        borderRadius: 4,
        backgroundColor: TUTORIAL_STEPS[0].colorHex,
      },
    });

    const progressTrack = new xb.UIPanel({
      pointerEvents: 'none',
      style: {
        width: '100%',
        height: 7,
        borderRadius: 4,
        backgroundColor: 'rgba(255, 255, 255, 0.12)',
        overflow: 'hidden',
      },
      children: [this.progressFill],
    });

    this.statusText = new xb.UIText({
      text: 'Hold gesture steadily to complete lesson',
      pointerEvents: 'none',
      style: {
        fontSize: 11,
        color: '#94a3b8',
      },
    });

    this.tryBtn = new xb.UIButton({
      label: 'Demo',
      icon: 'play_arrow',
      style: {
        height: 30,
        paddingLeft: 10,
        paddingRight: 10,
        borderRadius: 8,
        fontSize: 11,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        color: '#f8fafc',
      },
      onClick: () => {
        const step = this.getCurrentStep();
        if (step?.powerId) {
          this.callbacks.onPracticeCast?.(step.powerId);
        }
      },
    });

    this.skipBtn = new xb.UIButton({
      label: 'Skip',
      icon: 'skip_next',
      style: {
        height: 30,
        paddingLeft: 10,
        paddingRight: 10,
        borderRadius: 8,
        fontSize: 11,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        color: '#cbd5e1',
      },
      onClick: () => this.skipCurrentStep(),
    });

    this.hideBtn = new xb.UIButton({
      label: 'Hide (T)',
      icon: 'close',
      style: {
        height: 30,
        paddingLeft: 10,
        paddingRight: 10,
        borderRadius: 8,
        fontSize: 11,
        backgroundColor: 'rgba(248, 113, 113, 0.16)',
        color: '#fecaca',
      },
      onClick: () => this.setActive(false),
    });

    const footerRow = new xb.UIPanel({
      style: {
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 6,
      },
      children: [
        this.statusText,
        new xb.UIPanel({
          style: {
            flexDirection: 'row',
            gap: 6,
          },
          children: [this.tryBtn, this.skipBtn, this.hideBtn],
        }),
      ],
    });

    this.card = new xb.UICard({
      size: {width: 0.46, height: 'auto'},
      style: {
        flexDirection: 'column',
        gap: 8,
        padding: 12,
        borderRadius: 16,
        backgroundColor: 'rgba(11, 16, 32, 0.84)',
      },
      children: [
        this.accentBar,
        topRow,
        bodyRow,
        progressTrack,
        footerRow,
      ],
    });
    this.card.name = 'Guided Tutorial Card';
    this.card.visible = false;

    this.visibilityTransition = new xb.VisibilityTransition({duration: 0.3});
    // Float unobtrusively in upper-center peripheral zone so central crystal arena stays clear
    this.card.add(
      new xb.FollowHead({
        offset: new THREE.Vector3(0.0, 0.27, -1.12),
        smoothing: 0.075,
      }),
      new xb.FaceCamera({
        mode: 'capsule',
        capsuleHalfHeight: 0.25,
        smoothing: 0.09,
      }),
      this.visibilityTransition
    );
    this.add(this.card);

    // --- 3D Non-Intrusive Floating Spatial Gesture Beacon ---
    this.beaconGroup = new THREE.Group();
    this.beaconGroup.name = 'Tutorial Spatial Beacon';
    this.beaconGroup.visible = false;
    this.beaconGroup.xb = {pointerEvents: 'none'};

    const outerGeo = this.trackGeo(new THREE.RingGeometry(0.056, 0.068, 32));
    this.outerRingMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xff6b2b,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.outerRingMesh = new THREE.Mesh(outerGeo, this.outerRingMat);
    this.outerRingMesh.xb = {pointerEvents: 'none'};
    this.beaconGroup.add(this.outerRingMesh);

    const innerGeo = this.trackGeo(new THREE.RingGeometry(0.032, 0.04, 24));
    this.innerRingMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xffd166,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.innerRingMesh = new THREE.Mesh(innerGeo, this.innerRingMat);
    this.innerRingMesh.xb = {pointerEvents: 'none'};
    this.beaconGroup.add(this.innerRingMesh);

    // Secondary ring used for bimanual gestures (dual-palm, crossed wrists, open book)
    const secGeo = this.trackGeo(new THREE.RingGeometry(0.044, 0.053, 28));
    this.secondaryRingMesh = new THREE.Mesh(secGeo, this.innerRingMat);
    this.secondaryRingMesh.visible = false;
    this.secondaryRingMesh.xb = {pointerEvents: 'none'};
    this.beaconGroup.add(this.secondaryRingMesh);

    // Directional translucent motion cue cone (indicates thrust / flick / lift / aim)
    this.cueArrowGroup = new THREE.Group();
    const coneGeo = this.trackGeo(new THREE.ConeGeometry(0.016, 0.044, 12));
    this.cueMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    const arrowTip = new THREE.Mesh(coneGeo, this.cueMat);
    arrowTip.xb = {pointerEvents: 'none'};
    this.cueArrowGroup.add(arrowTip);
    this.beaconGroup.add(this.cueArrowGroup);

    this.add(this.beaconGroup);

    this.advanceToNextUncompleted();
    this.refreshCardVisuals();
  }

  get active(): boolean {
    return this._active;
  }

  get completedCount(): number {
    return this.completed.size;
  }

  get totalSteps(): number {
    return TUTORIAL_STEPS.length;
  }

  get isAllCompleted(): boolean {
    return this.completed.size >= TUTORIAL_STEPS.length;
  }

  getCurrentStep(): TutorialStepSpec | null {
    return TUTORIAL_STEPS[this.currentStepIndex] ?? null;
  }

  /**
   * Starts the guided tutorial automatically on first visit if lessons remain.
   */
  autoStartIfFirstTime(): void {
    if (!this.isAllCompleted) {
      this.advanceToNextUncompleted();
      this.setActive(true);
    }
  }

  setActive(active: boolean): void {
    if (this._active === active) return;
    if (active && this.isAllCompleted) {
      // Restart from lesson 1 when user explicitly re-opens a completed tutorial
      this.restart();
      return;
    }
    this._active = active;
    if (active) {
      this.advanceToNextUncompleted();
      this.refreshCardVisuals();
      this.visibilityTransition.show();
      this.beaconGroup.visible = true;
    } else {
      this.visibilityTransition.hide();
      this.beaconGroup.visible = false;
    }
    this.callbacks.onVisibilityChange?.(active);
  }

  toggle(): boolean {
    this.setActive(!this._active);
    return this._active;
  }

  restart(): void {
    this.completed.clear();
    this.savePersistedProgress();
    this.currentStepIndex = 0;
    this.celebrationTimer = 0;
    this._active = true;
    this.refreshCardVisuals();
    this.visibilityTransition.show();
    this.beaconGroup.visible = true;
    this.callbacks.onVisibilityChange?.(true);
  }

  syncBindings(bindings: Record<GestureName, PowerId>): void {
    this.gestureBindings = {...bindings};
    this.refreshCardVisuals();
  }

  /**
   * Called whenever the user successfully triggers an elemental power, head modifier,
   * or Spell Book gesture. Marks the matching lesson completed and smoothly advances.
   */
  notifyActionPerformed(stepId: TutorialStepId): boolean {
    const alreadyDone = this.completed.has(stepId);
    const current = this.getCurrentStep();
    if (!alreadyDone) {
      this.completed.add(stepId);
      this.savePersistedProgress();
    }

    if (!this._active || !current) return false;

    if (current.id === stepId && this.celebrationTimer <= 0) {
      this.celebrationTimer = 1.35;
      this.statusText.text = `Mastered ${current.title}! Advancing...`;
      this.statusText.style.color = '#34d399';
      this.progressFill.style.width = '100%';
      this.progressFill.style.backgroundColor = '#34d399';
      this.accentBar.style.backgroundColor = '#34d399';
      this.outerRingMat.color.setHex(0x34d399);
      this.innerRingMat.color.setHex(0xa7f3d0);
      this.cueMat.color.setHex(0x34d399);

      const remaining = Math.max(0, TUTORIAL_STEPS.length - this.completed.size);
      this.callbacks.onStepCompleted?.(stepId, remaining);
      return true;
    }
    return false;
  }

  skipCurrentStep(): void {
    if (!this._active) return;
    this.celebrationTimer = 0;
    const len = TUTORIAL_STEPS.length;
    for (let offset = 1; offset <= len; offset++) {
      const idx = (this.currentStepIndex + offset) % len;
      if (!this.completed.has(TUTORIAL_STEPS[idx].id)) {
        this.currentStepIndex = idx;
        this.refreshCardVisuals();
        return;
      }
    }
    this.finishAllLessons();
  }

  update(
    dt: number,
    camera: THREE.Camera,
    fsm: StateMachineSnapshot,
    rightHandPos: THREE.Vector3 | null,
    leftHandPos: THREE.Vector3 | null,
    spellBookOpen: boolean
  ): void {
    this.elapsed += dt;
    if (!this._active) {
      this.beaconGroup.visible = false;
      return;
    }

    // Handle post-mastery celebration pause before advancing
    if (this.celebrationTimer > 0) {
      this.celebrationTimer -= dt;
      const pulse = 1.0 + Math.sin(this.elapsed * 16) * 0.14;
      this.outerRingMesh.scale.setScalar(pulse * 1.25);
      this.innerRingMesh.scale.setScalar(pulse);
      if (this.celebrationTimer <= 0) {
        if (this.isAllCompleted) {
          this.finishAllLessons();
          return;
        }
        this.advanceToNextUncompleted();
        this.refreshCardVisuals();
      }
      this.updateBeaconTransform(camera, rightHandPos, leftHandPos, dt);
      return;
    }

    const step = this.getCurrentStep();
    if (!step) return;

    // Hide spatial 3D beacon while Spell Book is open (unless lesson IS open-book)
    this.beaconGroup.visible = !spellBookOpen || step.id === 'open-book';

    // Drive live confidence / dwell progress bar from GestureStateMachine
    const progress = this.computeLiveStepProgress(step, fsm);
    const pct = Math.round(THREE.MathUtils.clamp(progress * 100, 4, 100));
    this.progressFill.style.width = `${pct}%`;

    if (progress > 0.65) {
      this.statusText.text = `Locking pose... ${pct}%`;
      this.statusText.style.color = '#fde047';
    } else if (progress > 0.2) {
      this.statusText.text = `Gesture detected (${pct}%) — hold steady`;
      this.statusText.style.color = '#cbd5e1';
    } else {
      this.statusText.text = `${this.completed.size}/${TUTORIAL_STEPS.length} mastered · Perform pose or tap Demo`;
      this.statusText.style.color = '#94a3b8';
    }

    // Animate non-intrusive 3D spatial motion beacon
    this.updateBeaconTransform(camera, rightHandPos, leftHandPos, dt);
    this.animateBeaconMotion(step, progress);
  }

  private computeLiveStepProgress(
    step: TutorialStepSpec,
    fsm: StateMachineSnapshot
  ): number {
    if (step.id === 'open-book') {
      return fsm.spellBookDwellProgress;
    }
    if (step.id === 'plasma-core') {
      return fsm.bimanual === 'plasma-core' ? 1 : 0;
    }
    if (step.id === 'void-dome') {
      return fsm.bimanual === 'void-dome' ? 1 : 0;
    }
    if (step.id === 'head-modifiers') {
      return 0.1;
    }

    // Find which single-hand gesture currently triggers this power
    const boundGesture = this.getBoundGestureForStep(step);
    if (!boundGesture) return 0;

    const leftScore = fsm.left.smoothedScores[boundGesture] ?? 0;
    const rightScore = fsm.right.smoothedScores[boundGesture] ?? 0;
    const bestScore = Math.max(leftScore, rightScore);
    const dwellBoost =
      fsm.left.candidateGesture === boundGesture
        ? fsm.left.dwellProgress
        : fsm.right.candidateGesture === boundGesture
          ? fsm.right.dwellProgress
          : 0;
    return THREE.MathUtils.clamp(Math.max(bestScore, dwellBoost), 0, 1);
  }

  private updateBeaconTransform(
    camera: THREE.Camera,
    rightHandPos: THREE.Vector3 | null,
    leftHandPos: THREE.Vector3 | null,
    dt: number
  ): void {
    camera.getWorldPosition(_camPos);
    camera.getWorldDirection(_camForward);
    _camRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    _camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);

    const step = this.getCurrentStep();
    const isBimanual =
      step?.motion === 'dual-gather' ||
      step?.motion === 'cross-wrists' ||
      step?.motion === 'open-book';

    if (isBimanual && leftHandPos && rightHandPos) {
      _beaconTarget.addVectors(leftHandPos, rightHandPos).multiplyScalar(0.5);
      _beaconTarget.y += 0.12;
    } else if (rightHandPos) {
      _beaconTarget.copy(rightHandPos).addScaledVector(_camUp, 0.13);
    } else if (leftHandPos) {
      _beaconTarget.copy(leftHandPos).addScaledVector(_camUp, 0.13);
    } else {
      // Gentle ergonomic hand-zone anchor slightly below eye center on desktop/simulator
      _beaconTarget
        .copy(_camPos)
        .addScaledVector(_camForward, 0.72)
        .addScaledVector(_camRight, 0.18)
        .addScaledVector(_camUp, -0.14);
    }

    const alpha = 1 - Math.exp(-8 * dt);
    this.beaconGroup.position.lerp(_beaconTarget, alpha);
    this.beaconGroup.lookAt(_camPos);
  }

  private animateBeaconMotion(step: TutorialStepSpec, progress: number): void {
    const t = this.elapsed;
    const breathe = 1.0 + Math.sin(t * 3.4) * 0.08 + progress * 0.18;
    this.outerRingMesh.scale.setScalar(breathe);
    this.innerRingMesh.scale.setScalar(0.65 + progress * 0.45);
    this.outerRingMat.opacity = 0.38 + progress * 0.42;
    this.innerRingMat.opacity = 0.28 + progress * 0.52;

    this.secondaryRingMesh.visible = false;
    this.cueArrowGroup.visible = true;
    this.cueArrowGroup.position.set(0, 0, 0);
    this.cueArrowGroup.rotation.set(0, 0, 0);

    switch (step.motion) {
      case 'thrust-forward': {
        // Pulsing forward arrow away from user along local -Z
        const zOff = -((t * 0.12) % 0.11);
        this.cueArrowGroup.position.set(0, 0, zOff);
        this.cueArrowGroup.rotation.x = -Math.PI / 2;
        break;
      }
      case 'flick-up':
      case 'lift-up': {
        const yOff = ((t * 0.14) % 0.1) - 0.02;
        this.cueArrowGroup.position.set(0, yOff, 0);
        break;
      }
      case 'sweep-arc': {
        const xOff = Math.sin(t * 2.8) * 0.075;
        const yOff = Math.cos(t * 2.8) * 0.025;
        this.cueArrowGroup.position.set(xOff, yOff, 0);
        this.cueArrowGroup.rotation.z = -Math.cos(t * 2.8) * 0.8;
        break;
      }
      case 'expand-ring': {
        const expand = 0.75 + ((t * 0.9) % 0.85);
        this.outerRingMesh.scale.setScalar(expand);
        this.cueArrowGroup.visible = false;
        break;
      }
      case 'pull-pinch': {
        const zOff = ((t * 0.1) % 0.09) - 0.04;
        this.cueArrowGroup.position.set(0, 0, zOff);
        this.cueArrowGroup.rotation.x = Math.PI / 2;
        break;
      }
      case 'dual-gather': {
        this.secondaryRingMesh.visible = true;
        const sep = 0.075 + Math.sin(t * 2.4) * 0.032;
        this.outerRingMesh.position.set(-sep, 0, 0);
        this.secondaryRingMesh.position.set(sep, 0, 0);
        this.cueArrowGroup.visible = false;
        return;
      }
      case 'cross-wrists': {
        this.secondaryRingMesh.visible = true;
        this.outerRingMesh.position.set(-0.02, 0, 0);
        this.secondaryRingMesh.position.set(0.02, 0, 0);
        this.outerRingMesh.rotation.z = t * 1.4;
        this.secondaryRingMesh.rotation.z = -t * 1.4;
        this.cueArrowGroup.visible = false;
        return;
      }
      case 'open-book': {
        this.secondaryRingMesh.visible = true;
        this.outerRingMesh.position.set(-0.055, -0.01, 0);
        this.secondaryRingMesh.position.set(0.055, -0.01, 0);
        this.cueArrowGroup.position.set(0, 0.04 + Math.sin(t * 3.0) * 0.015, 0);
        return;
      }
      case 'head-nod': {
        this.cueArrowGroup.position.set(0, Math.sin(t * 3.2) * 0.05, 0);
        break;
      }
      default: {
        this.cueArrowGroup.visible = false;
        break;
      }
    }

    // Reset ring offsets when not in dual-ring mode
    this.outerRingMesh.position.set(0, 0, 0);
    this.outerRingMesh.rotation.z = t * 0.6;
  }

  private getBoundGestureForStep(step: TutorialStepSpec): GestureName | null {
    if (!step.powerId) return null;
    if (step.powerId === 'plasma-core' || step.powerId === 'void-dome') {
      return null;
    }
    for (const g of ALL_SINGLE_HAND_GESTURES) {
      if (this.gestureBindings[g] === step.powerId) return g;
    }
    const spec = ELEMENTAL_POWERS.find((p) => p.id === step.powerId);
    return spec?.gestureName ?? null;
  }

  private advanceToNextUncompleted(): void {
    for (let i = 0; i < TUTORIAL_STEPS.length; i++) {
      if (!this.completed.has(TUTORIAL_STEPS[i].id)) {
        this.currentStepIndex = i;
        return;
      }
    }
    this.currentStepIndex = TUTORIAL_STEPS.length - 1;
  }

  private finishAllLessons(): void {
    this._active = false;
    this.visibilityTransition.hide();
    this.beaconGroup.visible = false;
    this.callbacks.onAllCompleted?.();
    this.callbacks.onVisibilityChange?.(false);
  }

  private refreshCardVisuals(): void {
    const step = this.getCurrentStep();
    if (!step) return;

    const bound = this.getBoundGestureForStep(step);
    const gestureLabel = bound ? GESTURE_LABELS[bound] : step.defaultGestureLabel;

    this.stepCounterText.text = `GUIDED LESSON ${this.currentStepIndex + 1} / ${TUTORIAL_STEPS.length}`;
    this.gestureBadgeText.text = `Pose: ${gestureLabel}`;
    this.titleText.text = step.title;
    this.titleText.style.color = step.colorHex;
    this.tipText.text = step.coachingTip;
    this.accentBar.style.backgroundColor = step.colorHex;
    this.progressFill.style.backgroundColor = step.colorHex;
    this.progressFill.style.width = '4%';

    const tex = this.textures.get(step.id);
    if (tex) this.illustrationImg.src = tex;

    this.tryBtn.visible = Boolean(step.powerId);

    _colorTmp.setHex(step.colorInt);
    this.outerRingMat.color.copy(_colorTmp);
    this.innerRingMat.color.set(step.accentHex);
    this.cueMat.color.copy(_colorTmp);
  }

  private loadPersistedProgress(): void {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (typeof item === 'string') {
            this.completed.add(item as TutorialStepId);
          }
        }
      }
    } catch {
      // Ignore storage access errors in restricted iframes
    }
  }

  private savePersistedProgress(): void {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(Array.from(this.completed))
      );
    } catch {
      // Ignore storage write errors
    }
  }

  private trackGeo<T extends THREE.BufferGeometry>(g: T): T {
    this.beaconGeos.push(g);
    return g;
  }

  private trackMat<T extends THREE.MeshBasicMaterial>(m: T): T {
    this.beaconMats.push(m);
    return m;
  }

  dispose(): void {
    for (const tex of this.textures.values()) tex.dispose();
    this.textures.clear();
    for (const g of this.beaconGeos) g.dispose();
    for (const m of this.beaconMats) m.dispose();
    this.beaconGeos.length = 0;
    this.beaconMats.length = 0;
  }
}
