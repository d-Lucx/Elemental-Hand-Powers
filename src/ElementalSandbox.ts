import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import * as xb from 'xrblocks';

import {SpatialAudioEngine} from './audio/SpatialAudioEngine.ts';
import {
  ELEMENTAL_POWERS,
  FIREBALL_THRUST_VELOCITY,
  GESTURE_TO_POWER,
  MAGMA_FLICK_VELOCITY_Y,
  POWER_BY_ID,
} from './constants.ts';
import {ElementalGestureRecognizer} from './gestures/ElementalGestureRecognizer.ts';
import {
  ElementalGestureStateMachine,
  GestureExitReason,
} from './gestures/GestureStateMachine.ts';
import {
  CastHandPreference,
  GestureName,
  HandSide,
  PowerId,
  TrackedHandFrame,
} from './types.ts';
import {SpellbookUI} from './ui/SpellbookUI.ts';
import {ElementalVFXSystem} from './vfx/ElementalVFXSystem.ts';
import {ElementalArena, ElementalTarget} from './world/ElementalArena.ts';
import {OfficeEnvironment} from './world/OfficeEnvironment.ts';

const _camPos = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _tmpPos = new THREE.Vector3();
const _tmpDir = new THREE.Vector3();
const _tmpImpulse = new THREE.Vector3();

interface HandSpellRuntime {
  fireballCharge: number;
  fireballFiredInPose: boolean;
  magmaCharge: number;
  magmaFiredInPose: boolean;
  frostCooldown: number;
  chainCooldown: number;
  floraCooldown: number;
  vortexCooldown: number;
  tetherTarget: ElementalTarget | null;
}

/**
 * Main XR Blocks script orchestrating gesture detection, hysteresis state machine,
 * Rapier 3D physics arena, procedural GLSL elemental VFX, HRTF spatial audio,
 * head gesture Empower/Dispel modifiers, and the floating Spellbook UI.
 */
export class ElementalSandbox extends xb.Script {
  readonly recognizer: ElementalGestureRecognizer;
  private readonly stateMachine = new ElementalGestureStateMachine();
  private readonly audio = new SpatialAudioEngine();
  private readonly office = new OfficeEnvironment();
  private readonly arena = new ElementalArena();
  private readonly vfx = new ElementalVFXSystem();
  private readonly ui: SpellbookUI;

  private selectedPower: PowerId = 'fireball';
  private handPref: CastHandPreference = 'both';
  private envRenderTarget: THREE.WebGLRenderTarget | null = null;

  private handRuntime: Record<HandSide, HandSpellRuntime> = {
    left: this.createHandRuntime(),
    right: this.createHandRuntime(),
  };

  private wasPlasmaActive = false;
  private plasmaSeparationPeak = 0.22;
  private lastPlasmaMidpoint = new THREE.Vector3();
  private wasVoidDomeActive = false;

  // Controller / mouse fallback continuous casting state
  private activeSelectController: THREE.Object3D | null = null;
  private selectChargeTime = 0;
  private selectStreamCooldown = 0;
  private selectTetherTarget: ElementalTarget | null = null;

  private elapsed = 0;
  private lastHudSyncAt = 0;
  private lastSimulatorEnvName: string | undefined = undefined;

  private onHeadGestureBound = (event: xb.HeadGestureEvent) =>
    this.handleHeadGesture(event);
  private onKeyDownBound = (event: KeyboardEvent) => this.handleKeyDown(event);

  constructor(recognizer: ElementalGestureRecognizer) {
    super();
    this.recognizer = recognizer;
    this.name = 'Elemental Sandbox';

    this.ui = new SpellbookUI({
      onSelectPower: (power) => {
        this.selectedPower = power;
        this.ui.flashFeedback(POWER_BY_ID[power].summary);
      },
      onCastNow: (power) => this.castFromView(power),
      onToggleHandPref: (pref) => {
        this.handPref = pref;
        this.ui.flashFeedback(`Active hand filter set to: ${pref}.`);
      },
      onToggleBarrage: (enabled) => {
        this.arena.barrageEnabled = enabled;
        if (!enabled) this.arena.clearIncomingOrbs();
        this.ui.flashFeedback(
          enabled
            ? 'Practice Barrage active: use Earth Shield (Fist) or Void Dome (Crossed Wrists) to defend.'
            : 'Practice Barrage paused.'
        );
      },
      onToggleOffice: (enabled) => {
        this.office.setEnabled(enabled);
        this.ui.flashFeedback(
          enabled
            ? 'Procedural Office Environment enabled with desk, monitor, and wall colliders.'
            : 'Procedural Office Environment hidden.'
        );
      },
      onToggleMute: (muted) => this.audio.setMuted(muted),
      onEmpower: () => this.triggerEmpower(),
      onDispel: () => this.triggerDispel(),
      onResetArena: () => this.resetSandbox(),
    });
  }

  private createHandRuntime(): HandSpellRuntime {
    return {
      fireballCharge: 0,
      fireballFiredInPose: false,
      magmaCharge: 0,
      magmaFiredInPose: false,
      frostCooldown: 0,
      chainCooldown: 0,
      floraCooldown: 0,
      vortexCooldown: 0,
      tetherTarget: null,
    };
  }

  init(): void {
    this.setupLightingAndEnvironment();
    this.add(this.office);
    this.add(this.arena);
    this.add(this.vfx);
    this.add(this.ui);

    // Subscribe to built-in Head Gestures (Nod -> Empower, Shake -> Dispel)
    xb.core.input.headGestures?.addEventListener(
      'gesture',
      this.onHeadGestureBound
    );
    window.addEventListener('keydown', this.onKeyDownBound);
  }

  onXRSessionStarted(): void {
    // Keep AR passthrough unobstructed on real XR headsets unless user toggles Office on
    this.office.setEnabled(false);
    this.ui.setOfficeEnabled(false);
  }

  onSimulatorStarted(): void {
    this.office.setEnabled(true);
    this.ui.setOfficeEnabled(true);
  }

  private setupLightingAndEnvironment(): void {
    // Cool sky/ground hemisphere fill
    const hemi = new THREE.HemisphereLight(0xdbeafe, 0x334155, 1.9);
    this.add(hemi);

    // Warm directional key light with tight shadow bounds
    const key = new THREE.DirectionalLight(0xfff4e0, 2.2);
    key.position.set(2.5, 5.5, 2.0);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 14;
    key.shadow.camera.left = -4;
    key.shadow.camera.right = 4;
    key.shadow.camera.top = 4;
    key.shadow.camera.bottom = -4;
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.02;
    this.add(key);

    // Subtle cool rim light separating crystals from room backdrop
    const rim = new THREE.DirectionalLight(0x93c5fd, 0.9);
    rim.position.set(-3.0, 2.5, -4.0);
    this.add(rim);

    // Procedural RoomEnvironment IBL for PBR metallic brass, basalt & crystal reflections
    const renderer = xb.core.renderer;
    if (renderer && 'compile' in renderer && renderer instanceof THREE.WebGLRenderer) {
      const pmrem = new THREE.PMREMGenerator(renderer);
      this.envRenderTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
      xb.core.scene.environment = this.envRenderTarget.texture;
      pmrem.dispose();
    }
  }

  initPhysics(physics: xb.Physics): void {
    this.office.initPhysics(physics);
    this.arena.initPhysics(physics);
    this.vfx.initPhysics(physics);
  }

  private isUIObject(target: THREE.Object3D | null | undefined): boolean {
    let cur: THREE.Object3D | null | undefined = target;
    while (cur) {
      if (cur === this.ui || cur === this.ui.card || cur === this.ui.overlay) {
        return true;
      }
      cur = cur.parent;
    }
    return false;
  }

  // ---------------- Controller / Desktop Click Casting Fallback ----------------
  onSelectStart(event: xb.SelectEvent): void {
    this.audio.ensureStarted();
    if (this.isUIObject(event.target)) return;

    const controller = event.source.controller;
    this.activeSelectController = controller;
    this.selectChargeTime = 0;
    this.selectStreamCooldown = 0;

    controller.getWorldPosition(_tmpPos);
    controller.getWorldDirection(_tmpDir).negate();
    _tmpPos.addScaledVector(_tmpDir, 0.14);

    // Immediate cast for non-sustained powers, or start stream/charge for sustained ones
    switch (this.selectedPower) {
      case 'earth-shield':
        this.vfx.summonEarthShield('right', _tmpPos, _tmpDir);
        this.audio.playEarthThud(_tmpPos);
        break;
      case 'kinetic-gale':
        this.castKineticGale(_tmpPos);
        break;
      case 'sky-updraft':
        this.castVortexAt(_tmpPos, _tmpDir, 'sky-updraft');
        break;
      case 'tidal-vortex':
        this.castVortexAt(_tmpPos, _tmpDir, 'tidal-vortex');
        break;
      case 'magma-bolt':
        this.vfx.launchProjectile('magma-bolt', _tmpPos, _tmpDir, 7.6, 0.068);
        this.audio.playFireballLaunch(_tmpPos, 1.35);
        break;
      case 'verdant-flora':
        this.vfx.spawnFloraBloom(_tmpPos);
        this.audio.playFloraChime(_tmpPos);
        break;
      case 'void-dome':
        xb.core.camera.getWorldPosition(_camPos);
        _camPos.y -= 0.12;
        this.vfx.activateVoidDome(_camPos);
        this.audio.playVoidDome(_camPos);
        break;
      case 'lightning-tether':
        this.selectTetherTarget = this.findNearestTarget(_tmpPos, 4.8);
        if (this.selectTetherTarget) {
          this.audio.playElectricArc(this.selectTetherTarget.group.position);
        }
        break;
      default:
        break;
    }
  }

  onSelectEnd(event: xb.SelectEvent): void {
    if (this.activeSelectController !== event.source.controller) return;
    const controller = this.activeSelectController;
    controller.getWorldPosition(_tmpPos);
    controller.getWorldDirection(_tmpDir).negate();
    _tmpPos.addScaledVector(_tmpDir, 0.18);

    if (this.selectedPower === 'fireball') {
      const r = THREE.MathUtils.clamp(0.068 + this.selectChargeTime * 0.055, 0.068, 0.13);
      this.vfx.setChargeOrb('right', false);
      this.vfx.launchProjectile('fireball', _tmpPos, _tmpDir, 6.4, r);
      this.audio.playFireballLaunch(_tmpPos, 1 + this.selectChargeTime * 0.35);
    } else if (this.selectedPower === 'plasma-core') {
      const r = THREE.MathUtils.clamp(0.1 + this.selectChargeTime * 0.08, 0.1, 0.2);
      this.vfx.setPlasmaCoreCharge(false);
      this.vfx.launchProjectile('plasma-core', _tmpPos, _tmpDir, 5.4, r);
      this.audio.playFireballLaunch(_tmpPos, 1.5);
    } else if (this.selectedPower === 'rainbow-ribbons') {
      this.vfx.releaseRainbowRibbons('right');
    } else if (this.selectedPower === 'lightning-tether' && this.selectTetherTarget) {
      // Fling tethered crystal forward on release
      this.arena.applyImpulseToTarget(
        this.selectTetherTarget,
        _tmpDir.clone().multiplyScalar(2.6),
        22,
        (pos, col) => this.onTargetShattered(pos, col)
      );
      this.selectTetherTarget = null;
    }

    this.activeSelectController = null;
    this.selectChargeTime = 0;
  }

  private castFromView(power: PowerId): void {
    this.audio.ensureStarted();
    xb.core.camera.getWorldPosition(_camPos);
    xb.core.camera.getWorldDirection(_camDir);
    const spawnPos = _camPos.clone().addScaledVector(_camDir, 0.55);
    spawnPos.y -= 0.12;

    switch (power) {
      case 'fireball':
        this.vfx.launchProjectile('fireball', spawnPos, _camDir, 6.2, 0.085);
        this.audio.playFireballLaunch(spawnPos, 1.0);
        break;
      case 'rainbow-ribbons': {
        // Draw a graceful luminous arc in front of the viewer
        for (let i = 0; i < 14; i++) {
          const t = (i / 13) - 0.5;
          const p1 = spawnPos
            .clone()
            .add(new THREE.Vector3(t * 0.65, Math.sin(t * Math.PI * 2) * 0.16, -0.35));
          const p2 = p1.clone().add(new THREE.Vector3(0, 0.045, 0));
          this.vfx.emitRainbowRibbons('right', p1, p2);
        }
        this.vfx.releaseRainbowRibbons('right');
        this.audio.playRainbowShimmer(spawnPos);
        break;
      }
      case 'earth-shield':
        this.vfx.summonEarthShield('right', spawnPos, _camDir);
        this.audio.playEarthThud(spawnPos);
        break;
      case 'frost-lance':
        for (let i = 0; i < 6; i++) {
          const spreadDir = _camDir
            .clone()
            .add(
              new THREE.Vector3(
                (Math.random() - 0.5) * 0.06,
                (Math.random() - 0.5) * 0.06,
                0
              )
            );
          this.vfx.launchProjectile(
            'frost-shard',
            spawnPos.clone().addScaledVector(_camDir, i * 0.08),
            spreadDir,
            9.5,
            0.03
          );
        }
        this.audio.playFrostTick(spawnPos);
        break;
      case 'lightning-tether': {
        const target = this.findNearestTarget(spawnPos, 4.8);
        if (target) {
          this.vfx.addLightningArc(spawnPos, target.group.position, 10, 0.09);
          this.arena.applyImpulseToTarget(
            target,
            _camPos.clone().sub(target.group.position).normalize().multiplyScalar(1.8),
            28,
            (pos, col) => this.onTargetShattered(pos, col)
          );
          this.audio.playElectricArc(target.group.position);
        }
        break;
      }
      case 'kinetic-gale':
        this.castKineticGale(spawnPos);
        break;
      case 'sky-updraft':
        this.castVortexAt(spawnPos, _camDir, 'sky-updraft');
        break;
      case 'chain-lightning':
        this.castChainLightning(spawnPos);
        break;
      case 'tidal-vortex':
        this.castVortexAt(spawnPos, _camDir, 'tidal-vortex');
        break;
      case 'magma-bolt':
        this.vfx.launchProjectile('magma-bolt', spawnPos, _camDir, 8.2, 0.072);
        this.audio.playFireballLaunch(spawnPos, 1.35);
        break;
      case 'verdant-flora':
        this.vfx.spawnFloraBloom(spawnPos.clone().addScaledVector(_camDir, 0.25));
        this.audio.playFloraChime(spawnPos);
        break;
      case 'plasma-core':
        this.vfx.launchProjectile('plasma-core', spawnPos, _camDir, 5.2, 0.145);
        this.audio.playPlasmaPulse(spawnPos);
        break;
      case 'void-dome':
        this.vfx.activateVoidDome(_camPos.clone().add(new THREE.Vector3(0, -0.1, 0)));
        this.audio.playVoidDome(_camPos);
        break;
    }
  }

  // ---------------- Main Per-Frame Update ----------------
  update(): void {
    const dt = Math.min(xb.getDeltaTime() || 0.016, 0.05);
    this.elapsed += dt;
    const nowMs = performance.now();
    const camera = xb.core.camera;

    this.audio.updateListener(camera);
    this.vfx.resetLightningFrame();

    // 1. Sample 25-joint XRHand contexts (works for both WebXR hands & Simulator Pose mode)
    const rawContexts = xb.core.poseEstimation?.getHandContexts() ?? {};
    const filteredContexts: Partial<Record<HandSide, xb.HandContext>> = {};
    if (this.handPref !== 'right' && rawContexts.left) {
      filteredContexts.left = rawContexts.left;
    }
    if (this.handPref !== 'left' && rawContexts.right) {
      filteredContexts.right = rawContexts.right;
    }

    const stepResult = this.stateMachine.step(
      filteredContexts,
      this.recognizer,
      dt,
      nowMs,
      camera
    );

    // Handle gesture enter / exit transitions with exit-reason safety
    for (const ev of stepResult.started) {
      this.onHandGestureStart(ev.side, ev.gesture);
    }
    for (const ev of stepResult.ended) {
      this.onHandGestureEnd(ev.side, ev.gesture, ev.reason);
    }

    // 2. Process bimanual combos (preempts single-hand poses cleanly)
    const bimanual = this.stateMachine.bimanual;
    let bimanualLabel: string | null = null;

    if (bimanual.plasmaActive) {
      bimanualLabel = 'Plasma Fusion Core';
      this.wasPlasmaActive = true;
      this.plasmaSeparationPeak = Math.max(
        this.plasmaSeparationPeak,
        bimanual.plasmaSeparation
      );
      this.lastPlasmaMidpoint.copy(bimanual.plasmaMidpoint);
      this.vfx.setPlasmaCoreCharge(
        true,
        bimanual.plasmaMidpoint,
        bimanual.plasmaSeparation
      );
      this.vfx.setChargeOrb('left', false);
      this.vfx.setChargeOrb('right', false);
    } else if (this.wasPlasmaActive) {
      this.wasPlasmaActive = false;
      this.vfx.setPlasmaCoreCharge(false);
      camera.getWorldDirection(_camDir);
      const radius = THREE.MathUtils.clamp(
        this.plasmaSeparationPeak * 0.38,
        0.1,
        0.2
      );
      this.vfx.launchProjectile(
        'plasma-core',
        this.lastPlasmaMidpoint,
        _camDir,
        5.5,
        radius
      );
      this.audio.playPlasmaPulse(this.lastPlasmaMidpoint);
      this.plasmaSeparationPeak = 0.22;
    }

    if (bimanual.voidDomeActive) {
      bimanualLabel = 'Void Barrier Dome';
      if (!this.wasVoidDomeActive) {
        this.wasVoidDomeActive = true;
        this.vfx.activateVoidDome(bimanual.voidDomeCenter);
        this.audio.playVoidDome(bimanual.voidDomeCenter);
      }
    } else {
      this.wasVoidDomeActive = false;
    }

    // 3. Process single-hand sustained powers & near-field auras
    if (!bimanual.plasmaActive && !bimanual.voidDomeActive) {
      this.updateHandPower(this.stateMachine.hands.left, dt);
      this.updateHandPower(this.stateMachine.hands.right, dt);
    }

    // 4. Process controller / mouse continuous cast when held
    this.updateSelectHold(dt);

    // 5. Commit dynamic lightning geometry & step VFX + Arena
    this.vfx.commitLightningFrame();

    camera.getWorldPosition(_camPos);
    this.vfx.update(
      dt,
      camera,
      this.arena.targets,
      (target, impulse, damage, impactPos) => {
        this.arena.applyImpulseToTarget(target, impulse, damage, (pos, col) =>
          this.onTargetShattered(pos, col)
        );
        this.audio.playFireballLaunch(impactPos, 0.7);
      },
      (bouncePos) => this.audio.playEarthThud(bouncePos)
    );

    this.arena.update(
      dt,
      this.elapsed,
      _camPos,
      this.vfx.voidDomeRemaining > 0,
      this.vfx.voidDomeCenter,
      this.vfx.voidDomeRadius,
      this.vfx.getActiveShields(),
      (deflectPos) => {
        this.vfx.spawnBurst(deflectPos, 16, 0xf59e0b, 0xffffff, 2.8, -1.8);
        this.audio.playEarthThud(deflectPos);
      }
    );

    // 6. Sync procedural OfficeEnvironment when switching Simulator rooms, plus HUD at ~10Hz
    if (nowMs - this.lastHudSyncAt > 100) {
      this.lastHudSyncAt = nowMs;
      const simEnvName = xb.core.simulator?.activeEnvironment?.name;
      if (simEnvName && simEnvName !== this.lastSimulatorEnvName) {
        this.lastSimulatorEnvName = simEnvName;
        const isOffice = simEnvName.toLowerCase() === 'office';
        this.office.setEnabled(isOffice);
        this.ui.setOfficeEnabled(isOffice);
      }
      const fsmSnap = this.stateMachine.getSnapshot();
      const lGest = this.stateMachine.hands.left.activeGesture;
      const rGest = this.stateMachine.hands.right.activeGesture;
      this.ui.updateHandStatus(
        lGest ? GESTURE_TO_POWER[lGest] : null,
        rGest ? GESTURE_TO_POWER[rGest] : null,
        bimanualLabel,
        this.arena.shatteredCount,
        fsmSnap
      );
    }
  }

  private onHandGestureStart(side: HandSide, gesture: GestureName): void {
    this.audio.ensureStarted();
    const hand = this.stateMachine.hands[side];
    const rt = this.handRuntime[side];
    const power = GESTURE_TO_POWER[gesture];
    this.ui.flashFeedback(
      `${side.toUpperCase()} hand: ${POWER_BY_ID[power].name} (${POWER_BY_ID[power].gestureLabel})`
    );

    switch (gesture) {
      case 'open-palm':
        rt.fireballCharge = 0;
        rt.fireballFiredInPose = false;
        break;
      case 'fist':
        this.vfx.summonEarthShield(side, hand.palmCenter, hand.palmNormal);
        this.audio.playEarthThud(hand.palmCenter);
        break;
      case 'spread':
        this.castKineticGale(hand.palmCenter);
        break;
      case 'thumbs-up':
        this.castVortexAt(hand.palmCenter, hand.palmNormal, 'sky-updraft');
        break;
      case 'shaka':
        this.castVortexAt(hand.wristPos, hand.palmNormal, 'tidal-vortex');
        break;
      case 'finger-gun':
        rt.magmaCharge = 0;
        rt.magmaFiredInPose = false;
        break;
      case 'palm-up':
        this.vfx.spawnFloraBloom(hand.palmCenter);
        this.audio.playFloraChime(hand.palmCenter);
        rt.floraCooldown = 1.6;
        break;
      case 'pinch':
        rt.tetherTarget = this.findNearestTarget(hand.indexTip, 4.5);
        if (rt.tetherTarget) {
          this.audio.playElectricArc(rt.tetherTarget.group.position);
        }
        break;
      default:
        break;
    }
  }

  private onHandGestureEnd(
    side: HandSide,
    gesture: GestureName,
    reason?: GestureExitReason
  ): void {
    const hand = this.stateMachine.hands[side];
    const rt = this.handRuntime[side];
    // Never fire a charged projectile if tracking was lost or preempted by a bimanual combo
    const allowReleaseFire =
      reason !== 'occlusion-timeout' &&
      reason !== 'bimanual-preempt' &&
      reason !== 'dispelled';

    if (gesture === 'open-palm') {
      this.vfx.setChargeOrb(side, false);
      if (allowReleaseFire && !rt.fireballFiredInPose && rt.fireballCharge >= 0.16) {
        const radius = THREE.MathUtils.clamp(0.065 + rt.fireballCharge * 0.05, 0.065, 0.125);
        this.vfx.launchProjectile(
          'fireball',
          hand.palmCenter.clone().addScaledVector(hand.palmNormal, 0.1),
          hand.palmNormal,
          6.2,
          radius
        );
        this.audio.playFireballLaunch(hand.palmCenter, 1.0);
      }
      rt.fireballCharge = 0;
    } else if (gesture === 'victory') {
      this.vfx.releaseRainbowRibbons(side);
    } else if (gesture === 'finger-gun') {
      this.vfx.setChargeOrb(side, false);
      if (allowReleaseFire && !rt.magmaFiredInPose && rt.magmaCharge >= 0.14) {
        this.vfx.launchProjectile(
          'magma-bolt',
          hand.indexTip,
          hand.indexDir,
          8.2,
          0.07
        );
        this.audio.playFireballLaunch(hand.indexTip, 1.35);
      }
      rt.magmaCharge = 0;
    } else if (gesture === 'pinch' && rt.tetherTarget) {
      if (allowReleaseFire) {
        const fling = hand.wristVelocity.clone().multiplyScalar(1.4);
        if (fling.length() < 1.2) {
          fling.copy(hand.palmNormal).multiplyScalar(2.4);
        }
        this.arena.applyImpulseToTarget(rt.tetherTarget, fling, 18, (pos, col) =>
          this.onTargetShattered(pos, col)
        );
      }
      rt.tetherTarget = null;
    }
  }

  private updateHandPower(hand: TrackedHandFrame, dt: number): void {
    const rt = this.handRuntime[hand.side];
    if (!hand.active || !hand.activeGesture) {
      this.vfx.setHandAura(hand.side, false);
      this.vfx.setChargeOrb(hand.side, false);
      return;
    }

    const power = GESTURE_TO_POWER[hand.activeGesture];
    this.vfx.setHandAura(hand.side, true, hand.palmCenter, power);

    switch (hand.activeGesture) {
      case 'open-palm': {
        if (!rt.fireballFiredInPose) {
          rt.fireballCharge += dt;
          const r = THREE.MathUtils.clamp(0.055 + rt.fireballCharge * 0.055, 0.055, 0.125);
          const orbPos = hand.palmCenter.clone().addScaledVector(hand.palmNormal, 0.1);
          this.vfx.setChargeOrb(hand.side, true, orbPos, r, 'fireball');

          // Velocity-gated thrust launch along palm normal
          const thrust = hand.wristVelocity.dot(hand.palmNormal);
          if (thrust > FIREBALL_THRUST_VELOCITY && rt.fireballCharge > 0.15) {
            rt.fireballFiredInPose = true;
            this.vfx.setChargeOrb(hand.side, false);
            this.vfx.launchProjectile('fireball', orbPos, hand.palmNormal, 7.0, r);
            this.audio.playFireballLaunch(orbPos, 1.15);
          }
        }
        break;
      }

      case 'victory': {
        this.vfx.emitRainbowRibbons(hand.side, hand.indexTip, hand.middleTip);
        this.audio.playRainbowShimmer(hand.indexTip);
        break;
      }

      case 'fist': {
        this.vfx.updateEarthShieldTarget(
          hand.side,
          hand.palmCenter,
          hand.palmNormal
        );
        break;
      }

      case 'point': {
        rt.frostCooldown -= dt;
        if (rt.frostCooldown <= 0) {
          rt.frostCooldown = 0.065;
          this.vfx.launchProjectile(
            'frost-shard',
            hand.indexTip,
            hand.indexDir,
            9.6,
            0.028
          );
          this.audio.playFrostTick(hand.indexTip);
        }
        break;
      }

      case 'pinch': {
        if (!rt.tetherTarget || rt.tetherTarget.shattered) {
          rt.tetherTarget = this.findNearestTarget(hand.indexTip, 4.5);
        }
        if (rt.tetherTarget) {
          const targetCenter = rt.tetherTarget.group.position
            .clone()
            .add(new THREE.Vector3(0, 0.16, 0));
          this.vfx.addLightningArc(hand.indexTip, targetCenter, 9, 0.065);
          if (rt.tetherTarget.body) {
            const desired = hand.indexTip
              .clone()
              .addScaledVector(hand.palmNormal, 0.65);
            _tmpImpulse.subVectors(desired, targetCenter).multiplyScalar(0.28);
            rt.tetherTarget.body.setGravityScale(0.05, true);
            rt.tetherTarget.body.applyImpulse(
              {x: _tmpImpulse.x * dt * 20, y: _tmpImpulse.y * dt * 20, z: _tmpImpulse.z * dt * 20},
              true
            );
          }
        }
        break;
      }

      case 'rock': {
        rt.chainCooldown -= dt;
        this.castChainLightning(hand.indexTip, rt.chainCooldown <= 0);
        if (rt.chainCooldown <= 0) {
          rt.chainCooldown = 0.24;
        }
        break;
      }

      case 'shaka': {
        rt.vortexCooldown -= dt;
        if (rt.vortexCooldown <= 0) {
          rt.vortexCooldown = 1.9;
          this.castVortexAt(hand.wristPos, hand.palmNormal, 'tidal-vortex');
        }
        break;
      }

      case 'finger-gun': {
        if (!rt.magmaFiredInPose) {
          rt.magmaCharge += dt;
          const r = THREE.MathUtils.clamp(0.036 + rt.magmaCharge * 0.04, 0.036, 0.072);
          this.vfx.setChargeOrb(hand.side, true, hand.indexTip, r, 'magma-bolt');
          if (hand.wristVelocity.y > MAGMA_FLICK_VELOCITY_Y && rt.magmaCharge > 0.12) {
            rt.magmaFiredInPose = true;
            this.vfx.setChargeOrb(hand.side, false);
            this.vfx.launchProjectile('magma-bolt', hand.indexTip, hand.indexDir, 8.8, r);
            this.audio.playFireballLaunch(hand.indexTip, 1.4);
          }
        }
        break;
      }

      case 'palm-up': {
        rt.floraCooldown -= dt;
        if (rt.floraCooldown <= 0) {
          rt.floraCooldown = 1.8;
          this.vfx.spawnFloraBloom(hand.palmCenter);
          this.audio.playFloraChime(hand.palmCenter);
        }
        break;
      }

      default:
        break;
    }
  }

  private updateSelectHold(dt: number): void {
    if (!this.activeSelectController) return;
    this.selectChargeTime += dt;
    this.selectStreamCooldown -= dt;

    this.activeSelectController.getWorldPosition(_tmpPos);
    this.activeSelectController.getWorldDirection(_tmpDir).negate();
    _tmpPos.addScaledVector(_tmpDir, 0.16);

    switch (this.selectedPower) {
      case 'fireball': {
        const r = THREE.MathUtils.clamp(0.06 + this.selectChargeTime * 0.055, 0.06, 0.13);
        this.vfx.setChargeOrb('right', true, _tmpPos, r, 'fireball');
        break;
      }
      case 'plasma-core': {
        const sep = THREE.MathUtils.clamp(0.2 + this.selectChargeTime * 0.25, 0.2, 0.6);
        this.vfx.setPlasmaCoreCharge(true, _tmpPos, sep);
        break;
      }
      case 'rainbow-ribbons': {
        const tipA = _tmpPos.clone().add(new THREE.Vector3(-0.025, 0.015, 0));
        const tipB = _tmpPos.clone().add(new THREE.Vector3(0.025, -0.015, 0));
        this.vfx.emitRainbowRibbons('right', tipA, tipB);
        this.audio.playRainbowShimmer(_tmpPos);
        break;
      }
      case 'frost-lance': {
        if (this.selectStreamCooldown <= 0) {
          this.selectStreamCooldown = 0.065;
          this.vfx.launchProjectile('frost-shard', _tmpPos, _tmpDir, 9.6, 0.028);
          this.audio.playFrostTick(_tmpPos);
        }
        break;
      }
      case 'chain-lightning': {
        const dealDmg = this.selectStreamCooldown <= 0;
        this.castChainLightning(_tmpPos, dealDmg);
        if (dealDmg) this.selectStreamCooldown = 0.22;
        break;
      }
      case 'lightning-tether': {
        if (!this.selectTetherTarget || this.selectTetherTarget.shattered) {
          this.selectTetherTarget = this.findNearestTarget(_tmpPos, 4.8);
        }
        if (this.selectTetherTarget) {
          const tc = this.selectTetherTarget.group.position
            .clone()
            .add(new THREE.Vector3(0, 0.16, 0));
          this.vfx.addLightningArc(_tmpPos, tc, 9, 0.065);
          if (this.selectTetherTarget.body) {
            const desired = _tmpPos.clone().addScaledVector(_tmpDir, 0.9);
            _tmpImpulse.subVectors(desired, tc).multiplyScalar(0.32);
            this.selectTetherTarget.body.setGravityScale(0.05, true);
            this.selectTetherTarget.body.applyImpulse(
              {
                x: _tmpImpulse.x * dt * 20,
                y: _tmpImpulse.y * dt * 20,
                z: _tmpImpulse.z * dt * 20,
              },
              true
            );
          }
        }
        break;
      }
      case 'earth-shield': {
        this.vfx.updateEarthShieldTarget('right', _tmpPos, _tmpDir);
        break;
      }
      default:
        break;
    }
  }

  // ---------------- Elemental Power Helpers ----------------
  private castKineticGale(origin: THREE.Vector3): void {
    this.vfx.triggerShockwave(origin, 0xfbbf24, 3.6);
    this.audio.playShockwave(origin);

    for (const target of this.arena.targets) {
      if (target.shattered) continue;
      const dist = target.group.position.distanceTo(origin);
      if (dist < 3.8) {
        const strength = (1 - dist / 3.8) * 3.8 + 0.8;
        _tmpImpulse
          .subVectors(target.group.position, origin)
          .normalize()
          .multiplyScalar(strength);
        _tmpImpulse.y += 1.2;
        this.arena.applyImpulseToTarget(target, _tmpImpulse, 35, (pos, col) =>
          this.onTargetShattered(pos, col)
        );
      }
    }
  }

  private castVortexAt(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    kind: 'sky-updraft' | 'tidal-vortex'
  ): void {
    const pos =
      kind === 'sky-updraft'
        ? origin.clone().addScaledVector(dir, 1.35)
        : origin.clone().add(new THREE.Vector3(0, 0.25, 0)).addScaledVector(dir, 0.55);
    pos.y = Math.max(0.35, pos.y);
    this.vfx.spawnVortex(pos, kind);
    this.audio.playWindSwirl(pos, kind === 'sky-updraft' ? 540 : 280);
  }

  private castChainLightning(origin: THREE.Vector3, dealDamage = true): void {
    const candidates = this.arena.targets
      .filter((t) => !t.shattered)
      .map((t) => ({t, d: t.group.position.distanceTo(origin)}))
      .filter((item) => item.d < 4.5)
      .sort((a, b) => a.d - b.d)
      .slice(0, 3);

    if (candidates.length === 0) return;

    let prev = origin;
    for (const {t} of candidates) {
      const nextPos = t.group.position.clone().add(new THREE.Vector3(0, 0.18, 0));
      this.vfx.addLightningArc(prev, nextPos, 8, 0.085);
      if (dealDamage) {
        this.vfx.spawnBurst(nextPos, 6, 0x818cf8, 0xe0e7ff, 1.8, -1.0);
        this.arena.applyImpulseToTarget(
          t,
          new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.5, (Math.random() - 0.5) * 0.4),
          18,
          (pos, col) => this.onTargetShattered(pos, col)
        );
      }
      prev = nextPos;
    }
    if (dealDamage) {
      this.audio.playElectricArc(candidates[0].t.group.position);
    }
  }

  private findNearestTarget(
    origin: THREE.Vector3,
    maxDist: number
  ): ElementalTarget | null {
    let best: ElementalTarget | null = null;
    let bestD = maxDist;
    for (const t of this.arena.targets) {
      if (t.shattered) continue;
      const d = t.group.position.distanceTo(origin);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  private onTargetShattered(pos: THREE.Vector3, color: number): void {
    this.vfx.spawnBurst(pos, 32, color, 0xffffff, 3.8, -4.5);
    this.audio.playCrystalShatter(pos);
  }

  // ---------------- Head Gestures & Keyboard Shortcuts ----------------
  private handleHeadGesture(event: xb.HeadGestureEvent): void {
    const validated = this.stateMachine.processHeadGesture(
      event.detail.name,
      event.detail.confidence,
      performance.now()
    );
    if (validated === 'nod') {
      this.triggerEmpower();
    } else if (validated === 'shake') {
      this.triggerDispel();
    }
  }

  private triggerEmpower(): void {
    this.audio.ensureStarted();
    xb.core.camera.getWorldPosition(_camPos);
    this.vfx.empowerActiveEffects(this.arena.targets, (pos, col) =>
      this.onTargetShattered(pos, col)
    );
    this.audio.playHeadGesture('nod', _camPos);
    this.ui.flashFeedback('Head Nod: Active elemental summons empowered & detonated!');
  }

  private triggerDispel(): void {
    this.audio.ensureStarted();
    xb.core.camera.getWorldPosition(_camPos);
    this.stateMachine.reset();
    this.vfx.dispelAll();
    this.audio.playHeadGesture('shake', _camPos);
    this.ui.flashFeedback('Head Shake: Shields, ribbons, and vortices dispelled.');
  }

  private resetSandbox(): void {
    this.stateMachine.reset();
    this.vfx.dispelAll();
    this.arena.resetAll();
    this.ui.flashFeedback('Arena reset: all elemental crystals restored.');
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.repeat) return;
    const key = event.key.toUpperCase();
    for (const spec of ELEMENTAL_POWERS) {
      if (spec.hotkey.toUpperCase() === key) {
        this.selectedPower = spec.id;
        this.ui.setSelectedPower(spec.id);
        this.ui.flashFeedback(`${spec.name}: ${spec.summary}`);
        return;
      }
    }
    if (key === 'N') this.triggerEmpower();
    else if (key === 'X') this.triggerDispel();
    else if (key === 'R') this.resetSandbox();
    else if (key === 'O') {
      const next = !this.office.enabled;
      this.office.setEnabled(next);
      this.ui.setOfficeEnabled(next);
    }
  }

  dispose(): void {
    xb.core.input.headGestures?.removeEventListener(
      'gesture',
      this.onHeadGestureBound
    );
    window.removeEventListener('keydown', this.onKeyDownBound);
    this.envRenderTarget?.dispose();
    this.office.dispose();
    this.arena.dispose();
    this.vfx.dispose();
    this.audio.dispose();
  }
}
