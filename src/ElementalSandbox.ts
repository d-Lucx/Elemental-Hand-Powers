import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import * as xb from 'xrblocks';

import {SpatialAudioEngine} from './audio/SpatialAudioEngine.ts';
import {
  ELEMENTAL_POWERS,
  FIREBALL_THRUST_VELOCITY,
  MAGMA_FLICK_VELOCITY_Y,
  POWER_BY_ID,
} from './constants.ts';
import {ElementalGestureRecognizer} from './gestures/ElementalGestureRecognizer.ts';
import {
  GestureExitReason,
  GestureStateMachine,
  SpellChargeState,
} from './gestures/GestureStateMachine.ts';
import {HapticTarget, WebXRHapticsEngine} from './haptics/WebXRHapticsEngine.ts';
import {
  CastHandPreference,
  GestureName,
  HandSide,
  PowerId,
  TrackedHandFrame,
} from './types.ts';
import {GestureDebugOverlay} from './ui/GestureDebugOverlay.ts';
import {GuidedTutorialManager} from './ui/GuidedTutorialManager.ts';
import {IdleGestureGuidePanel} from './ui/IdleGestureGuidePanel.ts';
import {SpellBookMenu, SpellLoadoutPreset} from './ui/SpellBookMenu.ts';
import {SpellbookUI} from './ui/SpellbookUI.ts';
import {ElementalComboSystem} from './vfx/ElementalComboSystem.ts';
import {ElementalVFXSystem} from './vfx/ElementalVFXSystem.ts';
import {FallbackWristPose, WristPulseEffect} from './vfx/WristPulseEffect.ts';
import {ElementalArena, ElementalTarget} from './world/ElementalArena.ts';
import {
  ELEMENTAL_THEMES,
  ElementalThemeEnvironment,
  ElementalThemeId,
  POWER_TO_THEME,
  resolveThemeForEquippedPowers,
} from './world/ElementalThemeEnvironment.ts';
import {OfficeEnvironment} from './world/OfficeEnvironment.ts';

const _camPos = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _tmpPos = new THREE.Vector3();
const _tmpDir = new THREE.Vector3();
const _tmpImpulse = new THREE.Vector3();
const _fallbackWristPos = new THREE.Vector3();
const _fallbackWristDir = new THREE.Vector3();
const _probePos = new THREE.Vector3();
const _probeVel = new THREE.Vector3();
const _targetCenter = new THREE.Vector3();

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
  private readonly stateMachine = new GestureStateMachine();
  private readonly audio = new SpatialAudioEngine();
  private readonly haptics = new WebXRHapticsEngine();
  private readonly office = new OfficeEnvironment();
  private readonly themeEnv = new ElementalThemeEnvironment();
  private readonly arena = new ElementalArena();
  private readonly vfx = new ElementalVFXSystem();
  private readonly comboSystem = new ElementalComboSystem();
  private readonly wristPulse = new WristPulseEffect();
  private readonly idleGuide = new IdleGestureGuidePanel();
  private readonly tutorial: GuidedTutorialManager;
  private readonly debugOverlay: GestureDebugOverlay;
  private readonly spellBookMenu: SpellBookMenu;
  private readonly ui: SpellbookUI;
  private unsubscribeLoadout: (() => void) | null = null;

  private hemiLight!: THREE.HemisphereLight;
  private keyLight!: THREE.DirectionalLight;
  private rimLight!: THREE.DirectionalLight;
  private isARPassthrough = false;

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
  private activeSelectHand: HapticTarget = 'right';
  private selectChargeTime = 0;
  private selectStreamCooldown = 0;
  private selectTetherTarget: ElementalTarget | null = null;

  // Hand / controller physical contact tracking for environmental physics haptics
  private readonly activeCrystalContacts: Record<HandSide, Set<number>> = {
    left: new Set(),
    right: new Set(),
  };
  private readonly activeSurfaceContacts: Record<HandSide, Set<number>> = {
    left: new Set(),
    right: new Set(),
  };
  private readonly prevControllerPos: Record<HandSide, THREE.Vector3> = {
    left: new THREE.Vector3(),
    right: new THREE.Vector3(),
  };
  private readonly hasPrevControllerPos: Record<HandSide, boolean> = {
    left: false,
    right: false,
  };

  private elapsed = 0;
  private lastHudSyncAt = 0;
  private lastDebugSyncAt = 0;
  private lastSimulatorEnvName: string | undefined = undefined;
  private sessionActive = false;
  private idleTimeSeconds = 0;
  private readonly idleShowDelayS = 2.6;

  private onHeadGestureBound = (event: xb.HeadGestureEvent) =>
    this.handleHeadGesture(event);
  private onKeyDownBound = (event: KeyboardEvent) => this.handleKeyDown(event);

  constructor(recognizer: ElementalGestureRecognizer) {
    super();
    this.recognizer = recognizer;
    this.name = 'Elemental Sandbox';

    this.debugOverlay = new GestureDebugOverlay(() => {
      this.ui.setDebugEnabled(false);
    });

    this.tutorial = new GuidedTutorialManager({
      onStepCompleted: (_stepId, remaining) => {
        xb.core.camera.getWorldPosition(_camPos);
        this.audio.playFloraChime(_camPos);
        this.haptics.playPhysicsContact('both', 'crystal', 1.0);
        this.ui.flashFeedback(
          remaining > 0
            ? `Lesson complete! ${remaining} elemental gesture${remaining === 1 ? '' : 's'} left in tutorial.`
            : 'All elemental gestures mastered!'
        );
      },
      onAllCompleted: () => {
        xb.core.camera.getWorldPosition(_camPos);
        this.audio.playFloraChime(_camPos);
        this.haptics.playPhysicsContact('both', 'shatter', 1.4);
        this.ui.flashFeedback(
          'Guided Tutorial complete! Press T anytime to replay.'
        );
      },
      onVisibilityChange: (active) => {
        this.ui.setTutorialActive(active);
      },
      onPracticeCast: (powerId) => {
        this.selectedPower = powerId;
        this.ui.setSelectedPower(powerId);
        this.applyElementalTheme(POWER_TO_THEME[powerId], false);
        this.castFromView(powerId, true);
      },
    });

    this.spellBookMenu = new SpellBookMenu({
      onToggleEquip: (powerId) => {
        this.audio.ensureStarted();
        const equipped = this.stateMachine.togglePowerEquipped(powerId);
        const spec = POWER_BY_ID[powerId];
        xb.core.camera.getWorldPosition(_camPos);
        this.audio.playFloraChime(_camPos);
        this.haptics.playPhysicsContact('both', 'surface', 0.55);

        // Automatically transition environmental theme to match the equipped spell
        const nextTheme = equipped
          ? POWER_TO_THEME[powerId]
          : resolveThemeForEquippedPowers(
              this.stateMachine.getEquippedPowers(),
              this.selectedPower
            );
        this.applyElementalTheme(nextTheme, false);
        const realmName = ELEMENTAL_THEMES[nextTheme].name;

        this.ui.flashFeedback(
          equipped
            ? `Equipped ${spec.name} · Realm shifted to ${realmName}.`
            : `Unequipped ${spec.name} · Realm attuned to ${realmName}.`
        );
      },
      onApplyPreset: (preset: SpellLoadoutPreset) => {
        this.audio.ensureStarted();
        this.stateMachine.setEquippedPowers(preset.powers);
        xb.core.camera.getWorldPosition(_camPos);
        this.audio.playFloraChime(_camPos);
        this.haptics.playPhysicsContact('both', 'crystal', 0.85);

        const nextTheme = resolveThemeForEquippedPowers(
          preset.powers,
          preset.powers[0]
        );
        this.applyElementalTheme(nextTheme, false);
        this.ui.flashFeedback(
          `Loaded "${preset.label}" (${preset.powers.length} spells) · Realm: ${ELEMENTAL_THEMES[nextTheme].name}.`
        );
      },
      onRebindGesture: (gesture, powerId) => {
        this.audio.ensureStarted();
        this.stateMachine.setGestureBinding(gesture, powerId);
        const spec = POWER_BY_ID[powerId];
        xb.core.camera.getWorldPosition(_camPos);
        this.audio.playFrostTick(_camPos);
        this.haptics.playPhysicsContact('both', 'surface', 0.65);
        this.applyElementalTheme(POWER_TO_THEME[powerId], false);
        this.ui.flashFeedback(
          `Rebound ${spec.name} to "${gesture}" · Realm: ${ELEMENTAL_THEMES[POWER_TO_THEME[powerId]].name}.`
        );
      },
      onResetLoadout: () => {
        this.audio.ensureStarted();
        this.stateMachine.resetLoadout();
        xb.core.camera.getWorldPosition(_camPos);
        this.audio.playFloraChime(_camPos);
        this.haptics.playPhysicsContact('both', 'surface', 0.6);
        this.applyElementalTheme(POWER_TO_THEME[this.selectedPower], false);
        this.ui.flashFeedback(
          'Spell Book reset: all 13 elemental spells equipped with default gestures.'
        );
      },
      onTestCast: (powerId) => {
        this.selectedPower = powerId;
        this.ui.setSelectedPower(powerId);
        this.applyElementalTheme(POWER_TO_THEME[powerId], false);
        this.castFromView(powerId, true);
      },
      onCycleTheme: () => {
        this.cycleElementalTheme();
      },
      onClose: () => this.setSpellBookOpen(false),
    });

    this.ui = new SpellbookUI({
      onSelectPower: (power) => {
        this.selectedPower = power;
        this.applyElementalTheme(POWER_TO_THEME[power], false);
        this.ui.flashFeedback(
          `${POWER_BY_ID[power].summary} · Realm: ${ELEMENTAL_THEMES[POWER_TO_THEME[power]].name}`
        );
      },
      onCastNow: (power) => this.castFromView(power),
      onToggleSpellBook: () => this.toggleSpellBook(),
      onToggleTutorial: () => {
        const active = this.tutorial.toggle();
        this.ui.flashFeedback(
          active
            ? 'Guided Tutorial active — follow the floating indicator to master each gesture.'
            : 'Guided Tutorial paused (press T anytime to resume).'
        );
      },
      onCycleTheme: () => this.cycleElementalTheme(),
      onToggleHandPref: (pref) => {
        this.handPref = pref;
        this.ui.flashFeedback(`Active hand filter set to: ${pref}.`);
      },
      onCycleStability: (preset) => {
        this.stateMachine.setStabilityPreset(preset);
        this.ui.flashFeedback(
          `Gesture hysteresis guard set to ${preset} mode.`
        );
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
        this.themeEnv.setEnabled(!enabled);
        this.ui.flashFeedback(
          enabled
            ? 'Procedural Office Environment enabled with desk, monitor, and wall colliders.'
            : `Elemental Realm active: ${this.themeEnv.currentSpec.name}.`
        );
      },
      onToggleDebug: (enabled) => {
        this.debugOverlay.setOverlayVisible(enabled);
        this.ui.flashFeedback(
          enabled
            ? 'Real-time Gesture & Joint Confidence debug overlay visible.'
            : 'Debug overlay hidden (press D to reopen).'
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
    // Default to Elemental Theme realm on startup (indoor Office can be toggled on anytime)
    this.office.setEnabled(false);
    this.ui.setOfficeEnabled(false);
    this.themeEnv.setEnabled(true);
    this.themeEnv.setImmersiveBackdrop(true);

    this.add(this.office);
    this.add(this.themeEnv);
    this.add(this.arena);
    this.add(this.vfx);
    this.add(this.comboSystem);
    this.add(this.wristPulse);
    this.add(this.ui);
    this.add(this.spellBookMenu);
    this.add(this.tutorial);
    this.add(this.idleGuide);
    this.add(this.debugOverlay);

    // Keep Spell Book menu, flank SpellbookUI & GuidedTutorial continuously synced with GestureStateMachine
    this.unsubscribeLoadout = this.stateMachine.on(
      'loadoutchange',
      ({equippedPowers, bindings}) => {
        this.spellBookMenu.syncLoadout(equippedPowers, bindings);
        this.ui.syncEquippedLoadout(equippedPowers, bindings);
        this.tutorial.syncBindings(bindings);
      }
    );
    const initialEquipped = this.stateMachine.getEquippedPowers();
    const initialBindings = this.stateMachine.getGestureBindings();
    this.spellBookMenu.syncLoadout(initialEquipped, initialBindings);
    this.ui.syncEquippedLoadout(initialEquipped, initialBindings);
    this.tutorial.syncBindings(initialBindings);

    // Sync initial environmental theme indicator
    const initialTheme = POWER_TO_THEME[this.selectedPower];
    this.applyElementalTheme(initialTheme, false);

    // Subscribe to built-in Head Gestures (Nod -> Empower, Shake -> Dispel)
    xb.core.input.headGestures?.addEventListener(
      'gesture',
      this.onHeadGestureBound
    );
    window.addEventListener('keydown', this.onKeyDownBound);
  }

  private applyElementalTheme(
    themeId: ElementalThemeId,
    announce = true
  ): void {
    this.themeEnv.setTheme(themeId);
    if (!this.themeEnv.enabled) {
      this.themeEnv.setEnabled(true);
    }
    if (!this.isARPassthrough && this.office.enabled) {
      this.office.setEnabled(false);
      this.ui.setOfficeEnabled(false);
    }
    const spec = ELEMENTAL_THEMES[themeId];
    this.spellBookMenu.setActiveTheme(themeId);
    this.ui.setThemeLabel(spec.name, spec.accentHex);
    if (announce) {
      this.ui.flashFeedback(`Realm shifted to ${spec.name} — ${spec.subtitle}.`);
    }
  }

  private cycleElementalTheme(): void {
    this.audio.ensureStarted();
    const next = this.themeEnv.cycleTheme();
    this.applyElementalTheme(next, true);
    xb.core.camera.getWorldPosition(_camPos);
    this.audio.playWindSwirl(_camPos, 360);
    this.haptics.playPhysicsContact('both', 'surface', 0.65);
  }

  private toggleSpellBook(anchor?: THREE.Vector3 | null): void {
    this.setSpellBookOpen(!this.spellBookMenu.open, anchor);
  }

  private setSpellBookOpen(
    open: boolean,
    anchor?: THREE.Vector3 | null
  ): void {
    if (this.spellBookMenu.open === open) return;
    this.audio.ensureStarted();
    this.markUserActive();

    this.spellBookMenu.setOpen(open, xb.core.camera, anchor);
    this.stateMachine.setSpellBookOpen(open);
    this.ui.setSpellBookOpen(open);

    if (open) {
      this.tutorial.notifyActionPerformed('open-book');
      // Clear held charge visuals cleanly while browsing the Spell Book
      this.vfx.setChargeOrb('left', false);
      this.vfx.setChargeOrb('right', false);
      this.vfx.setPlasmaCoreCharge(false);
      this.activeSelectController = null;
      this.selectChargeTime = 0;
      this.selectTetherTarget = null;
    }

    xb.core.camera.getWorldPosition(_camPos);
    if (open) {
      this.audio.playFloraChime(anchor ?? _camPos);
      this.haptics.playPhysicsContact('both', 'crystal', 1.1);
      this.ui.flashFeedback(
        'Spell Book opened — browse, equip, or rebind spells (repeat Open Book palms or press B to close).'
      );
    } else {
      this.audio.playWindSwirl(_camPos, 420);
      this.haptics.playPhysicsContact('both', 'surface', 0.65);
      this.ui.flashFeedback(
        `Spell Book closed (${this.stateMachine.getEquippedCount()}/${ELEMENTAL_POWERS.length} spells active).`
      );
    }
  }

  onXRSessionStarted(): void {
    this.sessionActive = true;
    this.isARPassthrough = true;
    this.idleTimeSeconds = 0;
    this.idleGuide.setIdleVisible(false);
    // Keep AR passthrough unobstructed on real XR headsets while retaining perimeter landmarks & particles
    this.office.setEnabled(false);
    this.ui.setOfficeEnabled(false);
    this.themeEnv.setEnabled(true);
    this.themeEnv.setImmersiveBackdrop(false);
    this.tutorial.autoStartIfFirstTime();
  }

  onXRSessionEnded(): void {
    this.sessionActive = false;
    this.isARPassthrough = false;
    this.idleTimeSeconds = 0;
    this.idleGuide.setIdleVisible(false);
  }

  onSimulatorStarted(): void {
    this.sessionActive = true;
    this.isARPassthrough = false;
    this.idleTimeSeconds = 0;
    this.idleGuide.setIdleVisible(false);
    this.office.setEnabled(false);
    this.ui.setOfficeEnabled(false);
    this.themeEnv.setEnabled(true);
    this.themeEnv.setImmersiveBackdrop(true);
    this.tutorial.autoStartIfFirstTime();
  }

  private markUserActive(): void {
    this.idleTimeSeconds = 0;
    this.idleGuide.setIdleVisible(false);
  }

  private setupLightingAndEnvironment(): void {
    // Cool sky/ground hemisphere fill
    this.hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x334155, 1.9);
    this.add(this.hemiLight);

    // Warm directional key light with tight shadow bounds
    this.keyLight = new THREE.DirectionalLight(0xfff4e0, 2.2);
    this.keyLight.position.set(2.5, 5.5, 2.0);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.camera.near = 0.5;
    this.keyLight.shadow.camera.far = 14;
    this.keyLight.shadow.camera.left = -4;
    this.keyLight.shadow.camera.right = 4;
    this.keyLight.shadow.camera.top = 4;
    this.keyLight.shadow.camera.bottom = -4;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.add(this.keyLight);

    // Subtle cool rim light separating crystals from room backdrop
    this.rimLight = new THREE.DirectionalLight(0x93c5fd, 0.9);
    this.rimLight.position.set(-3.0, 2.5, -4.0);
    this.add(this.rimLight);

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
      if (
        cur === this.ui ||
        cur === this.ui.card ||
        cur === this.ui.overlay ||
        cur === this.spellBookMenu ||
        cur === this.spellBookMenu.card ||
        cur === this.tutorial ||
        cur === this.tutorial.card ||
        cur === this.debugOverlay ||
        cur === this.debugOverlay.overlay ||
        cur === this.comboSystem.bannerCard
      ) {
        return true;
      }
      cur = cur.parent;
    }
    return false;
  }

  // ---------------- Controller / Desktop Click Casting Fallback ----------------
  onSelectStart(event: xb.SelectEvent): void {
    this.audio.ensureStarted();
    this.markUserActive();
    if (this.isUIObject(event.target)) return;
    if (this.spellBookMenu.open) return;

    const nowMs = performance.now();
    const isHoldReleasePower =
      this.selectedPower === 'fireball' ||
      this.selectedPower === 'plasma-core' ||
      this.selectedPower === 'rainbow-ribbons' ||
      this.selectedPower === 'frost-lance' ||
      this.selectedPower === 'chain-lightning' ||
      this.selectedPower === 'lightning-tether';

    if (isHoldReleasePower) {
      if (this.stateMachine.isCastOnCooldown(nowMs)) {
        // Log the blocked attempt through the state machine without starting a cast
        this.stateMachine.tryConsumeCastCooldown(nowMs, this.selectedPower);
        return;
      }
    } else if (
      !this.stateMachine.tryConsumeCastCooldown(nowMs, this.selectedPower)
    ) {
      return;
    }

    const controller = event.source.controller;
    this.activeSelectController = controller;
    this.activeSelectHand =
      event.source.handedness === 'left'
        ? 'left'
        : event.source.handedness === 'right'
          ? 'right'
          : 'right';
    this.selectChargeTime = 0;
    this.selectStreamCooldown = 0;

    controller.getWorldPosition(_tmpPos);
    controller.getWorldDirection(_tmpDir).negate();
    _tmpPos.addScaledVector(_tmpDir, 0.14);
    this.tutorial.notifyActionPerformed(this.selectedPower);

    // Immediate cast for non-sustained powers, or start stream/charge for sustained ones
    switch (this.selectedPower) {
      case 'earth-shield':
        this.vfx.summonEarthShield('right', _tmpPos, _tmpDir);
        this.audio.playEarthThud(_tmpPos);
        this.onSpellCastFeedback('earth-shield', _tmpPos, this.activeSelectHand, 0.85, nowMs);
        break;
      case 'kinetic-gale':
        this.castKineticGale(_tmpPos);
        this.onSpellCastFeedback('kinetic-gale', _tmpPos, this.activeSelectHand, 0.9, nowMs);
        break;
      case 'sky-updraft':
        this.castVortexAt(_tmpPos, _tmpDir, 'sky-updraft');
        this.onSpellCastFeedback('sky-updraft', _tmpPos, this.activeSelectHand, 0.72, nowMs);
        break;
      case 'tidal-vortex':
        this.castVortexAt(_tmpPos, _tmpDir, 'tidal-vortex');
        this.onSpellCastFeedback('tidal-vortex', _tmpPos, this.activeSelectHand, 0.78, nowMs);
        break;
      case 'magma-bolt':
        this.vfx.launchProjectile('magma-bolt', _tmpPos, _tmpDir, 7.6, 0.068, this.activeSelectHand);
        this.audio.playFireballLaunch(_tmpPos, 1.35);
        this.onSpellCastFeedback('magma-bolt', _tmpPos, this.activeSelectHand, 0.84, nowMs);
        break;
      case 'verdant-flora':
        this.vfx.spawnFloraBloom(_tmpPos);
        this.audio.playFloraChime(_tmpPos);
        this.onSpellCastFeedback('verdant-flora', _tmpPos, this.activeSelectHand, 0.62, nowMs);
        break;
      case 'void-dome':
        xb.core.camera.getWorldPosition(_camPos);
        _camPos.y -= 0.12;
        this.vfx.activateVoidDome(_camPos);
        this.audio.playVoidDome(_camPos);
        this.onSpellCastFeedback('void-dome', _camPos, 'both', 0.96, nowMs);
        break;
      case 'lightning-tether':
        this.selectTetherTarget = this.findNearestTarget(_tmpPos, 4.8);
        if (this.selectTetherTarget) {
          this.audio.playElectricArc(this.selectTetherTarget.group.position);
          this.onSpellCastFeedback(
            'lightning-tether',
            this.selectTetherTarget.group.position,
            this.activeSelectHand,
            0.7,
            nowMs
          );
        }
        break;
      default:
        break;
    }
  }

  onSelectEnd(event: xb.SelectEvent): void {
    if (this.activeSelectController !== event.source.controller) return;
    const nowMs = performance.now();
    const controller = this.activeSelectController;
    controller.getWorldPosition(_tmpPos);
    controller.getWorldDirection(_tmpDir).negate();
    _tmpPos.addScaledVector(_tmpDir, 0.18);

    if (this.selectedPower === 'fireball') {
      const chargeNorm = THREE.MathUtils.clamp(this.selectChargeTime / 1.35, 0.25, 1.0);
      const r = THREE.MathUtils.clamp(0.068 + this.selectChargeTime * 0.055, 0.068, 0.13);
      this.vfx.setChargeOrb('right', false);
      this.vfx.launchProjectile(
        'fireball',
        _tmpPos,
        _tmpDir,
        6.0 + chargeNorm * 1.4,
        r,
        this.activeSelectHand
      );
      this.audio.playFireballLaunch(_tmpPos, 1 + this.selectChargeTime * 0.35);
      this.onSpellCastFeedback('fireball', _tmpPos, this.activeSelectHand, chargeNorm, nowMs);
    } else if (this.selectedPower === 'plasma-core') {
      const chargeNorm = THREE.MathUtils.clamp(0.5 + this.selectChargeTime / 1.4, 0.5, 1.0);
      const r = THREE.MathUtils.clamp(0.1 + this.selectChargeTime * 0.08, 0.1, 0.2);
      this.vfx.setPlasmaCoreCharge(false);
      this.vfx.launchProjectile('plasma-core', _tmpPos, _tmpDir, 5.4, r, 'both');
      this.audio.playFireballLaunch(_tmpPos, 1.5);
      this.onSpellCastFeedback('plasma-core', _tmpPos, 'both', chargeNorm, nowMs);
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
      this.haptics.playPhysicsContact(this.activeSelectHand, 'crystal', 2.0, nowMs);
      this.selectTetherTarget = null;
    }

    // Stamp post-cast cooldown after releasing held/charged powers so VFX resolve cleanly
    if (
      this.selectedPower === 'fireball' ||
      this.selectedPower === 'plasma-core' ||
      this.selectedPower === 'rainbow-ribbons' ||
      this.selectedPower === 'frost-lance' ||
      this.selectedPower === 'chain-lightning' ||
      this.selectedPower === 'lightning-tether'
    ) {
      this.stateMachine.tryConsumeCastCooldown(nowMs, this.selectedPower);
    }

    this.activeSelectController = null;
    this.selectChargeTime = 0;
  }

  private castFromView(power: PowerId, ignoreCooldown = false): void {
    this.audio.ensureStarted();
    this.markUserActive();
    const nowMs = performance.now();
    if (
      !ignoreCooldown &&
      !this.stateMachine.tryConsumeCastCooldown(nowMs, power)
    ) {
      return;
    }
    this.tutorial.notifyActionPerformed(power);
    xb.core.camera.getWorldPosition(_camPos);
    xb.core.camera.getWorldDirection(_camDir);
    const spawnPos = _camPos.clone().addScaledVector(_camDir, 0.55);
    spawnPos.y -= 0.12;

    const side: HapticTarget =
      power === 'plasma-core' || power === 'void-dome' ? 'both' : 'right';
    this.onSpellCastFeedback(power, spawnPos, side, 0.82, nowMs);

    switch (power) {
      case 'fireball':
        this.vfx.launchProjectile('fireball', spawnPos, _camDir, 6.2, 0.085, side);
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
            0.03,
            side
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
        this.vfx.launchProjectile('magma-bolt', spawnPos, _camDir, 8.2, 0.072, side);
        this.audio.playFireballLaunch(spawnPos, 1.35);
        break;
      case 'verdant-flora':
        this.vfx.spawnFloraBloom(spawnPos.clone().addScaledVector(_camDir, 0.25));
        this.audio.playFloraChime(spawnPos);
        break;
      case 'plasma-core':
        this.vfx.launchProjectile('plasma-core', spawnPos, _camDir, 5.2, 0.145, 'both');
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

    // Handle Open Book bimanual gesture summoning/dismissing the Spell Book menu
    if (stepResult.spellBookToggled) {
      this.toggleSpellBook(stepResult.spellBookAnchor);
    }
    this.spellBookMenu.update(dt);

    // 2. Process bimanual combos (preempts single-hand poses cleanly)
    const bimanual = this.stateMachine.bimanual;
    let bimanualLabel: string | null = null;

    if (bimanual.plasmaActive) {
      bimanualLabel = 'Plasma Fusion Core';
      this.tutorial.notifyActionPerformed('plasma-core');
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
      this.haptics.playChargeTick(
        'both',
        THREE.MathUtils.clamp((bimanual.plasmaSeparation - 0.12) / 0.45, 0.25, 1.0),
        nowMs
      );
    } else if (this.wasPlasmaActive) {
      this.wasPlasmaActive = false;
      this.vfx.setPlasmaCoreCharge(false);
      camera.getWorldDirection(_camDir);
      const radius = THREE.MathUtils.clamp(
        this.plasmaSeparationPeak * 0.38,
        0.1,
        0.2
      );
      const plasmaPower = THREE.MathUtils.clamp(
        (this.plasmaSeparationPeak - 0.12) / 0.42,
        0.55,
        1.0
      );
      this.vfx.launchProjectile(
        'plasma-core',
        this.lastPlasmaMidpoint,
        _camDir,
        5.5,
        radius,
        'both'
      );
      this.audio.playPlasmaPulse(this.lastPlasmaMidpoint);
      this.onSpellCastFeedback(
        'plasma-core',
        this.lastPlasmaMidpoint,
        'both',
        plasmaPower,
        nowMs
      );
      this.plasmaSeparationPeak = 0.22;
    }

    if (bimanual.voidDomeActive) {
      bimanualLabel = 'Void Barrier Dome';
      if (!this.wasVoidDomeActive) {
        this.wasVoidDomeActive = true;
        this.tutorial.notifyActionPerformed('void-dome');
        this.vfx.activateVoidDome(bimanual.voidDomeCenter);
        this.audio.playVoidDome(bimanual.voidDomeCenter);
        this.onSpellCastFeedback(
          'void-dome',
          bimanual.voidDomeCenter,
          'both',
          0.95,
          nowMs
        );
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

    // 4b. Detect physical hand / controller contacts with arena crystals & office colliders
    this.updateHandPhysicsInteractions(dt, nowMs);

    // 4c. Advance scheduled multi-step WebXR haptic pulse envelopes
    this.haptics.update(nowMs);

    // 5. Commit dynamic lightning geometry & step VFX + Combo Fusion + Arena
    this.vfx.commitLightningFrame();

    camera.getWorldPosition(_camPos);
    this.vfx.update(
      dt,
      camera,
      this.arena.targets,
      (target, impulse, damage, impactPos, kind, ownerSide, impactSpeed) => {
        this.arena.applyImpulseToTarget(target, impulse, damage, (pos, col) =>
          this.onTargetShattered(pos, col)
        );
        this.audio.playFireballLaunch(impactPos, 0.7);
        this.haptics.playProjectileImpact(ownerSide, impactSpeed, kind, nowMs);
      },
      (bouncePos, impactSpeed, _kind, ownerSide) => {
        this.audio.playEarthThud(bouncePos);
        this.haptics.playProjectileImpact(
          ownerSide,
          impactSpeed,
          'bounce',
          nowMs
        );
      }
    );
    this.comboSystem.update(dt, this.elapsed);

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
        this.haptics.playPhysicsContact('both', 'deflect', 1.8, nowMs);
      }
    );

    // 5a. Smoothly animate procedural Elemental Theme & shader-morphing skybox
    this.themeEnv.update(
      dt,
      this.elapsed,
      xb.core.scene,
      {
        hemi: this.hemiLight,
        key: this.keyLight,
        rim: this.rimLight,
      },
      camera
    );

    // 5b. Update procedural wrist pulse effect directly from GestureStateMachine charge status
    const fsmSnapshot = this.stateMachine.getSnapshot();
    this.tutorial.update(
      dt,
      camera,
      fsmSnapshot,
      this.stateMachine.hands.right.active
        ? this.stateMachine.hands.right.palmCenter
        : null,
      this.stateMachine.hands.left.active
        ? this.stateMachine.hands.left.palmCenter
        : null,
      this.spellBookMenu.open
    );

    let fallbackWrist: FallbackWristPose | null = null;
    if (this.activeSelectController && !this.stateMachine.hands.right.active) {
      this.activeSelectController.getWorldPosition(_fallbackWristPos);
      this.activeSelectController.getWorldDirection(_fallbackWristDir).negate();
      const spec = POWER_BY_ID[this.selectedPower];
      const level = THREE.MathUtils.clamp(this.selectChargeTime / 1.2, 0.2, 1.0);
      const fallbackCharge: SpellChargeState = {
        status:
          this.selectChargeTime >= 1.65
            ? 'overcharged'
            : level >= 0.85
              ? 'ready'
              : spec.sustained
                ? 'charging'
                : 'channeling',
        chargeLevel: level,
        gesture: spec.gestureName ?? null,
        pulseFrequencyHz:
          this.selectChargeTime >= 1.65
            ? 11.8
            : level >= 0.85
              ? 8.6
              : 3.2 + level * 4.8,
        colorHex: this.selectChargeTime >= 1.65 ? '#fef08a' : spec.colorHex,
        accentHex: `#${spec.accentInt.toString(16).padStart(6, '0')}`,
      };
      fallbackWrist = {
        position: _fallbackWristPos,
        direction: _fallbackWristDir,
        charge: fallbackCharge,
      };
    }
    this.wristPulse.update(
      dt,
      this.stateMachine.hands,
      fsmSnapshot,
      fallbackWrist
    );

    // 5c. Show floating gesture illustration guide only when idle inside an active XR session
    const inXR =
      this.sessionActive || Boolean(xb.core.renderer?.xr?.isPresenting);
    const leftStatus = fsmSnapshot.left.charge.status;
    const rightStatus = fsmSnapshot.right.charge.status;
    const userBusy =
      this.tutorial.active ||
      this.spellBookMenu.open ||
      this.activeSelectController !== null ||
      fsmSnapshot.bimanual !== 'none' ||
      fsmSnapshot.spellBookDwellProgress > 0.05 ||
      fsmSnapshot.left.activeGesture !== null ||
      fsmSnapshot.right.activeGesture !== null ||
      fsmSnapshot.left.candidateGesture !== null ||
      fsmSnapshot.right.candidateGesture !== null ||
      (leftStatus !== 'idle' && leftStatus !== 'occluded' && leftStatus !== 'cooldown') ||
      (rightStatus !== 'idle' && rightStatus !== 'occluded' && rightStatus !== 'cooldown') ||
      fsmSnapshot.left.wristSpeed > 0.22 ||
      fsmSnapshot.right.wristSpeed > 0.22 ||
      fsmSnapshot.left.palmAngularSpeed > 1.8 ||
      fsmSnapshot.right.palmAngularSpeed > 1.8;

    if (!inXR || userBusy) {
      this.markUserActive();
    } else {
      this.idleTimeSeconds += dt;
      if (this.idleTimeSeconds >= this.idleShowDelayS) {
        this.idleGuide.setIdleVisible(true);
      }
    }

    // 6a. Refresh real-time gesture & raw joint confidence debug overlay at ~20Hz
    if (nowMs - this.lastDebugSyncAt > 50) {
      this.lastDebugSyncAt = nowMs;
      this.debugOverlay.updateFromSnapshot(fsmSnapshot);
    }

    // 6b. Sync HUD at ~10Hz
    if (nowMs - this.lastHudSyncAt > 100) {
      this.lastHudSyncAt = nowMs;
      const simEnvName = xb.core.simulator?.activeEnvironment?.name;
      if (simEnvName && simEnvName !== this.lastSimulatorEnvName) {
        this.lastSimulatorEnvName = simEnvName;
      }
      const lGest = this.stateMachine.hands.left.activeGesture;
      const rGest = this.stateMachine.hands.right.activeGesture;
      this.ui.updateHandStatus(
        lGest ? this.stateMachine.getPowerForGesture(lGest) : null,
        rGest ? this.stateMachine.getPowerForGesture(rGest) : null,
        bimanualLabel,
        this.arena.shatteredCount,
        fsmSnapshot
      );
    }
  }

  /**
   * Resolves intuitive aim origin & forward vector for any single-hand gesture,
   * so spells rebound in the Spell Book fire naturally from the active pose.
   */
  private getHandAim(
    hand: TrackedHandFrame,
    gesture: GestureName
  ): {origin: THREE.Vector3; dir: THREE.Vector3} {
    if (gesture === 'point' || gesture === 'finger-gun') {
      return {origin: hand.indexTip, dir: hand.indexDir};
    }
    return {origin: hand.palmCenter, dir: hand.palmNormal};
  }

  private onHandGestureStart(side: HandSide, gesture: GestureName): void {
    this.audio.ensureStarted();
    const hand = this.stateMachine.hands[side];
    const rt = this.handRuntime[side];
    const power = this.stateMachine.getPowerForGesture(gesture);
    const aim = this.getHandAim(hand, gesture);
    this.tutorial.notifyActionPerformed(power);
    this.ui.flashFeedback(
      `${side.toUpperCase()} hand: ${POWER_BY_ID[power].name} (${gesture})`
    );

    const nowMs = performance.now();
    switch (power) {
      case 'fireball':
        rt.fireballCharge = 0;
        rt.fireballFiredInPose = false;
        break;
      case 'earth-shield':
        this.vfx.summonEarthShield(side, hand.palmCenter, hand.palmNormal);
        this.audio.playEarthThud(hand.palmCenter);
        this.onSpellCastFeedback('earth-shield', hand.palmCenter, side, 0.85, nowMs);
        break;
      case 'kinetic-gale':
        this.castKineticGale(hand.palmCenter);
        this.onSpellCastFeedback('kinetic-gale', hand.palmCenter, side, 0.92, nowMs);
        break;
      case 'sky-updraft':
        this.castVortexAt(aim.origin, aim.dir, 'sky-updraft');
        this.onSpellCastFeedback('sky-updraft', aim.origin, side, 0.72, nowMs);
        break;
      case 'tidal-vortex':
        this.castVortexAt(hand.wristPos, aim.dir, 'tidal-vortex');
        this.onSpellCastFeedback('tidal-vortex', hand.wristPos, side, 0.78, nowMs);
        break;
      case 'magma-bolt':
        rt.magmaCharge = 0;
        rt.magmaFiredInPose = false;
        break;
      case 'verdant-flora':
        this.vfx.spawnFloraBloom(hand.palmCenter);
        this.audio.playFloraChime(hand.palmCenter);
        this.onSpellCastFeedback('verdant-flora', hand.palmCenter, side, 0.62, nowMs);
        rt.floraCooldown = 1.6;
        break;
      case 'lightning-tether':
        rt.tetherTarget = this.findNearestTarget(aim.origin, 4.5);
        if (rt.tetherTarget) {
          this.audio.playElectricArc(rt.tetherTarget.group.position);
          this.onSpellCastFeedback(
            'lightning-tether',
            rt.tetherTarget.group.position,
            side,
            0.7,
            nowMs
          );
        }
        break;
      case 'rainbow-ribbons':
        this.onSpellCastFeedback('rainbow-ribbons', hand.indexTip, side, 0.45, nowMs);
        break;
      case 'frost-lance':
        this.onSpellCastFeedback('frost-lance', aim.origin, side, 0.55, nowMs);
        break;
      case 'chain-lightning':
        this.onSpellCastFeedback('chain-lightning', aim.origin, side, 0.75, nowMs);
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
    const nowMs = performance.now();
    const hand = this.stateMachine.hands[side];
    const rt = this.handRuntime[side];
    const power = this.stateMachine.getPowerForGesture(gesture);
    const aim = this.getHandAim(hand, gesture);
    // Never fire a charged projectile if tracking was lost, unequipped, or preempted
    const allowReleaseFire =
      reason !== 'occlusion-timeout' &&
      reason !== 'bimanual-preempt' &&
      reason !== 'dispelled' &&
      reason !== 'unequipped';

    if (power === 'fireball') {
      this.vfx.setChargeOrb(side, false);
      if (allowReleaseFire && !rt.fireballFiredInPose && rt.fireballCharge >= 0.16) {
        const powerLevel = THREE.MathUtils.clamp(rt.fireballCharge / 1.35, 0.3, 1.0);
        const radius = THREE.MathUtils.clamp(0.065 + rt.fireballCharge * 0.05, 0.065, 0.125);
        const spawn = aim.origin.clone().addScaledVector(aim.dir, 0.1);
        this.vfx.launchProjectile(
          'fireball',
          spawn,
          aim.dir,
          5.8 + powerLevel * 1.4,
          radius,
          side
        );
        this.audio.playFireballLaunch(aim.origin, 1.0 + powerLevel * 0.25);
        this.onSpellCastFeedback('fireball', spawn, side, powerLevel, nowMs);
      }
      rt.fireballCharge = 0;
    } else if (power === 'rainbow-ribbons') {
      this.vfx.releaseRainbowRibbons(side);
    } else if (power === 'magma-bolt') {
      this.vfx.setChargeOrb(side, false);
      if (allowReleaseFire && !rt.magmaFiredInPose && rt.magmaCharge >= 0.14) {
        const powerLevel = THREE.MathUtils.clamp(rt.magmaCharge / 0.95, 0.35, 1.0);
        this.vfx.launchProjectile(
          'magma-bolt',
          aim.origin,
          aim.dir,
          7.6 + powerLevel * 1.4,
          0.07,
          side
        );
        this.audio.playFireballLaunch(aim.origin, 1.35);
        this.onSpellCastFeedback('magma-bolt', aim.origin, side, powerLevel, nowMs);
      }
      rt.magmaCharge = 0;
    } else if (power === 'lightning-tether' && rt.tetherTarget) {
      if (allowReleaseFire) {
        const fling = hand.wristVelocity.clone().multiplyScalar(1.4);
        if (fling.length() < 1.2) {
          fling.copy(aim.dir).multiplyScalar(2.4);
        }
        this.arena.applyImpulseToTarget(rt.tetherTarget, fling, 18, (pos, col) =>
          this.onTargetShattered(pos, col)
        );
        this.haptics.playPhysicsContact(side, 'crystal', fling.length(), nowMs);
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

    const power = this.stateMachine.getPowerForGesture(hand.activeGesture);
    const aim = this.getHandAim(hand, hand.activeGesture);
    this.vfx.setHandAura(hand.side, true, hand.palmCenter, power);

    switch (power) {
      case 'fireball': {
        if (!rt.fireballFiredInPose) {
          rt.fireballCharge += dt;
          const r = THREE.MathUtils.clamp(0.055 + rt.fireballCharge * 0.055, 0.055, 0.125);
          const orbPos = aim.origin.clone().addScaledVector(aim.dir, 0.1);
          this.vfx.setChargeOrb(hand.side, true, orbPos, r, 'fireball');
          this.haptics.playChargeTick(
            hand.side,
            THREE.MathUtils.clamp(rt.fireballCharge / 1.35, 0.15, 1.0)
          );

          // Velocity-gated thrust launch along aim direction
          const thrust = hand.wristVelocity.dot(aim.dir);
          if (thrust > FIREBALL_THRUST_VELOCITY && rt.fireballCharge > 0.15) {
            const powerLevel = THREE.MathUtils.clamp(
              0.45 + rt.fireballCharge * 0.45 + Math.min(thrust, 3.0) * 0.08,
              0.45,
              1.0
            );
            rt.fireballFiredInPose = true;
            this.stateMachine.notifySpellDischarged(hand.side);
            this.vfx.setChargeOrb(hand.side, false);
            this.vfx.launchProjectile('fireball', orbPos, aim.dir, 7.0, r, hand.side);
            this.audio.playFireballLaunch(orbPos, 1.15);
            this.onSpellCastFeedback('fireball', orbPos, hand.side, powerLevel);
          }
        }
        break;
      }

      case 'rainbow-ribbons': {
        this.vfx.emitRainbowRibbons(hand.side, hand.indexTip, hand.middleTip);
        this.audio.playRainbowShimmer(hand.indexTip);
        this.haptics.playSpellCast('rainbow-ribbons', hand.side, 0.48);
        break;
      }

      case 'earth-shield': {
        this.vfx.updateEarthShieldTarget(
          hand.side,
          hand.palmCenter,
          hand.palmNormal
        );
        break;
      }

      case 'frost-lance': {
        rt.frostCooldown -= dt;
        if (rt.frostCooldown <= 0) {
          rt.frostCooldown = 0.065;
          this.vfx.launchProjectile(
            'frost-shard',
            aim.origin,
            aim.dir,
            9.6,
            0.028,
            hand.side
          );
          this.audio.playFrostTick(aim.origin);
          this.haptics.playSpellCast('frost-lance', hand.side, 0.52);
        }
        break;
      }

      case 'lightning-tether': {
        if (!rt.tetherTarget || rt.tetherTarget.shattered) {
          rt.tetherTarget = this.findNearestTarget(aim.origin, 4.5);
        }
        if (rt.tetherTarget) {
          const targetCenter = rt.tetherTarget.group.position
            .clone()
            .add(new THREE.Vector3(0, 0.16, 0));
          this.vfx.addLightningArc(aim.origin, targetCenter, 9, 0.065);
          if (rt.tetherTarget.body) {
            const desired = aim.origin
              .clone()
              .addScaledVector(aim.dir, 0.65);
            _tmpImpulse.subVectors(desired, targetCenter).multiplyScalar(0.28);
            rt.tetherTarget.body.setGravityScale(0.05, true);
            rt.tetherTarget.body.applyImpulse(
              {x: _tmpImpulse.x * dt * 20, y: _tmpImpulse.y * dt * 20, z: _tmpImpulse.z * dt * 20},
              true
            );
            this.haptics.playPhysicsContact(
              hand.side,
              'tether-hum',
              _tmpImpulse.length() * 3.5
            );
          }
        }
        break;
      }

      case 'chain-lightning': {
        rt.chainCooldown -= dt;
        const dealt = rt.chainCooldown <= 0;
        this.castChainLightning(aim.origin, dealt);
        if (dealt) {
          rt.chainCooldown = 0.24;
          this.haptics.playSpellCast('chain-lightning', hand.side, 0.78);
        }
        break;
      }

      case 'tidal-vortex': {
        rt.vortexCooldown -= dt;
        if (rt.vortexCooldown <= 0) {
          rt.vortexCooldown = 1.9;
          this.castVortexAt(hand.wristPos, aim.dir, 'tidal-vortex');
          this.onSpellCastFeedback('tidal-vortex', hand.wristPos, hand.side, 0.78);
        }
        break;
      }

      case 'magma-bolt': {
        if (!rt.magmaFiredInPose) {
          rt.magmaCharge += dt;
          const r = THREE.MathUtils.clamp(0.036 + rt.magmaCharge * 0.04, 0.036, 0.072);
          this.vfx.setChargeOrb(hand.side, true, aim.origin, r, 'magma-bolt');
          this.haptics.playChargeTick(
            hand.side,
            THREE.MathUtils.clamp(rt.magmaCharge / 0.95, 0.15, 1.0)
          );
          if (hand.wristVelocity.y > MAGMA_FLICK_VELOCITY_Y && rt.magmaCharge > 0.12) {
            const powerLevel = THREE.MathUtils.clamp(
              0.5 + rt.magmaCharge * 0.55,
              0.5,
              1.0
            );
            rt.magmaFiredInPose = true;
            this.stateMachine.notifySpellDischarged(hand.side);
            this.vfx.setChargeOrb(hand.side, false);
            this.vfx.launchProjectile('magma-bolt', aim.origin, aim.dir, 8.8, r, hand.side);
            this.audio.playFireballLaunch(aim.origin, 1.4);
            this.onSpellCastFeedback('magma-bolt', aim.origin, hand.side, powerLevel);
          }
        }
        break;
      }

      case 'verdant-flora': {
        rt.floraCooldown -= dt;
        if (rt.floraCooldown <= 0) {
          rt.floraCooldown = 1.8;
          this.vfx.spawnFloraBloom(hand.palmCenter);
          this.audio.playFloraChime(hand.palmCenter);
          this.onSpellCastFeedback('verdant-flora', hand.palmCenter, hand.side, 0.62);
        }
        break;
      }

      default:
        break;
    }
  }

  private updateSelectHold(dt: number): void {
    if (!this.activeSelectController) return;
    const prevCharge = this.selectChargeTime;
    this.selectChargeTime += dt;
    this.selectStreamCooldown -= dt;

    this.activeSelectController.getWorldPosition(_tmpPos);
    this.activeSelectController.getWorldDirection(_tmpDir).negate();
    _tmpPos.addScaledVector(_tmpDir, 0.16);

    switch (this.selectedPower) {
      case 'fireball': {
        const r = THREE.MathUtils.clamp(0.06 + this.selectChargeTime * 0.055, 0.06, 0.13);
        this.vfx.setChargeOrb('right', true, _tmpPos, r, 'fireball');
        this.haptics.playChargeTick(
          this.activeSelectHand,
          THREE.MathUtils.clamp(this.selectChargeTime / 1.2, 0.15, 1.0)
        );
        break;
      }
      case 'plasma-core': {
        const sep = THREE.MathUtils.clamp(0.2 + this.selectChargeTime * 0.25, 0.2, 0.6);
        this.vfx.setPlasmaCoreCharge(true, _tmpPos, sep);
        this.haptics.playChargeTick(
          'both',
          THREE.MathUtils.clamp(this.selectChargeTime / 1.4, 0.2, 1.0)
        );
        break;
      }
      case 'rainbow-ribbons': {
        const tipA = _tmpPos.clone().add(new THREE.Vector3(-0.025, 0.015, 0));
        const tipB = _tmpPos.clone().add(new THREE.Vector3(0.025, -0.015, 0));
        this.vfx.emitRainbowRibbons('right', tipA, tipB);
        this.audio.playRainbowShimmer(_tmpPos);
        if (prevCharge === 0) {
          this.onSpellCastFeedback('rainbow-ribbons', _tmpPos, this.activeSelectHand, 0.45);
        } else {
          this.haptics.playSpellCast('rainbow-ribbons', this.activeSelectHand, 0.45);
        }
        break;
      }
      case 'frost-lance': {
        if (this.selectStreamCooldown <= 0) {
          this.selectStreamCooldown = 0.065;
          this.vfx.launchProjectile(
            'frost-shard',
            _tmpPos,
            _tmpDir,
            9.6,
            0.028,
            this.activeSelectHand
          );
          this.audio.playFrostTick(_tmpPos);
          if (prevCharge === 0) {
            this.onSpellCastFeedback('frost-lance', _tmpPos, this.activeSelectHand, 0.55);
          } else {
            this.haptics.playSpellCast('frost-lance', this.activeSelectHand, 0.55);
          }
        }
        break;
      }
      case 'chain-lightning': {
        const dealDmg = this.selectStreamCooldown <= 0;
        this.castChainLightning(_tmpPos, dealDmg);
        if (dealDmg) {
          this.selectStreamCooldown = 0.22;
          if (prevCharge === 0) {
            this.onSpellCastFeedback('chain-lightning', _tmpPos, this.activeSelectHand, 0.78);
          } else {
            this.haptics.playSpellCast('chain-lightning', this.activeSelectHand, 0.78);
          }
        }
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
            this.haptics.playPhysicsContact(
              this.activeSelectHand,
              'tether-hum',
              _tmpImpulse.length() * 3.5
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

  /**
   * Detects physical proximity/contact between tracked hands or WebXR
   * controllers and environmental physics objects (breakable crystals,
   * incoming barrage orbs, office furniture colliders, and the floor),
   * applying physical nudges and triggering velocity-scaled haptic pulses.
   */
  private updateHandPhysicsInteractions(dt: number, nowMs: number): void {
    const isPresenting = Boolean(xb.core.renderer?.xr?.isPresenting);
    const officeBounds = this.office.getColliderBounds();
    const safeDt = Math.max(0.008, dt);

    for (const side of ['left', 'right'] as const) {
      const hand = this.stateMachine.hands[side];
      const crystalContacts = this.activeCrystalContacts[side];
      const surfaceContacts = this.activeSurfaceContacts[side];

      let probeValid = false;
      let probeRadius = 0.085;

      if (hand.active) {
        _probePos.copy(hand.palmCenter);
        _probeVel.copy(hand.wristVelocity);
        probeValid = true;
      } else if (isPresenting) {
        const ctrl =
          side === 'left'
            ? xb.core.input?.leftController
            : xb.core.input?.rightController;
        if (ctrl && ctrl.visible) {
          ctrl.getWorldPosition(_probePos);
          if (this.hasPrevControllerPos[side]) {
            _probeVel
              .subVectors(_probePos, this.prevControllerPos[side])
              .divideScalar(safeDt);
          } else {
            _probeVel.set(0, 0, 0);
            this.hasPrevControllerPos[side] = true;
          }
          this.prevControllerPos[side].copy(_probePos);
          probeRadius = 0.075;
          probeValid = true;
        } else {
          this.hasPrevControllerPos[side] = false;
        }
      } else {
        this.hasPrevControllerPos[side] = false;
      }

      if (!probeValid) {
        crystalContacts.clear();
        surfaceContacts.clear();
        continue;
      }

      const speed = Math.min(_probeVel.length(), 4.0);

      // 1. Dynamic Elemental Crystal physics targets
      const crystalHitDist = probeRadius + 0.175;
      for (const target of this.arena.targets) {
        if (target.shattered) {
          crystalContacts.delete(target.id);
          continue;
        }
        _targetCenter.copy(target.group.position);
        _targetCenter.y += 0.16;
        const dist = _probePos.distanceTo(_targetCenter);
        if (dist <= crystalHitDist) {
          if (!crystalContacts.has(target.id)) {
            crystalContacts.add(target.id);
            // Apply physical hand-push impulse to the Rapier rigid body
            if (speed > 0.25) {
              _tmpImpulse.copy(_probeVel).multiplyScalar(0.55);
            } else {
              _tmpImpulse
                .subVectors(_targetCenter, _probePos)
                .normalize()
                .multiplyScalar(0.45);
            }
            this.arena.applyImpulseToTarget(
              target,
              _tmpImpulse,
              speed > 1.4 ? 14 : 0,
              (pos, col) => this.onTargetShattered(pos, col)
            );
            this.vfx.spawnBurst(_targetCenter, 6, target.color, 0xffffff, 1.4, -1.2);
            this.audio.playFrostTick(_targetCenter);
            this.haptics.playPhysicsContact(
              side,
              'crystal',
              Math.max(0.45, speed),
              nowMs
            );
          }
        } else if (dist > crystalHitDist + 0.04) {
          crystalContacts.delete(target.id);
        }
      }

      // 2. Incoming barrage physics orbs (physical hand/controller swat)
      const orbHitDist = probeRadius + 0.095;
      for (const orb of this.arena.incomingOrbs) {
        if (orb.deflected) continue;
        if (_probePos.distanceTo(orb.mesh.position) <= orbHitDist) {
          orb.deflected = true;
          if (speed > 0.4) {
            orb.velocity.copy(_probeVel).normalize().multiplyScalar(4.4);
          } else {
            orb.velocity
              .subVectors(orb.mesh.position, _probePos)
              .normalize()
              .multiplyScalar(3.6);
          }
          orb.velocity.y += 0.8;
          if (orb.body) {
            orb.body.setGravityScale(0.6, true);
            orb.body.setLinvel(
              {x: orb.velocity.x, y: orb.velocity.y, z: orb.velocity.z},
              true
            );
          }
          this.vfx.spawnBurst(orb.mesh.position, 14, 0x38bdf8, 0xffffff, 2.6, -1.6);
          this.audio.playEarthThud(orb.mesh.position);
          this.haptics.playPhysicsContact(
            side,
            'deflect',
            Math.max(0.9, speed),
            nowMs
          );
        }
      }

      // 3. Static Office environmental physics colliders (desk, monitors, shelves, walls)
      const probeR2 = probeRadius * probeRadius;
      const releaseR2 = (probeRadius + 0.035) * (probeRadius + 0.035);
      for (let i = 0; i < officeBounds.length; i++) {
        const b = officeBounds[i];
        const cx = THREE.MathUtils.clamp(
          _probePos.x,
          b.pos[0] - b.halfExtents[0],
          b.pos[0] + b.halfExtents[0]
        );
        const cy = THREE.MathUtils.clamp(
          _probePos.y,
          b.pos[1] - b.halfExtents[1],
          b.pos[1] + b.halfExtents[1]
        );
        const cz = THREE.MathUtils.clamp(
          _probePos.z,
          b.pos[2] - b.halfExtents[2],
          b.pos[2] + b.halfExtents[2]
        );
        const dx = _probePos.x - cx;
        const dy = _probePos.y - cy;
        const dz = _probePos.z - cz;
        const distSq = dx * dx + dy * dy + dz * dz;

        if (distSq <= probeR2) {
          if (!surfaceContacts.has(i)) {
            surfaceContacts.add(i);
            this.haptics.playPhysicsContact(
              side,
              'surface',
              Math.max(0.35, speed),
              nowMs
            );
          }
        } else if (distSq > releaseR2) {
          surfaceContacts.delete(i);
        }
      }

      // 4. Safety floor surface contact (id = -1)
      if (_probePos.y <= probeRadius + 0.02) {
        if (!surfaceContacts.has(-1)) {
          surfaceContacts.add(-1);
          this.haptics.playPhysicsContact(
            side,
            'surface',
            Math.max(0.35, speed),
            nowMs
          );
        }
      } else if (_probePos.y > probeRadius + 0.06) {
        surfaceContacts.delete(-1);
      }
    }
  }

  // ---------------- Elemental Power & Fusion Combo Helpers ----------------
  /**
   * Central spell-cast feedback handler: scales WebXR Gamepad haptic intensity
   * by the spell's power level & active chain bonus, and triggers unique
   * elemental fusion particle bursts + AoE shockwaves when spells are chained.
   */
  private onSpellCastFeedback(
    power: PowerId,
    origin: THREE.Vector3,
    side: HapticTarget,
    powerLevel: number,
    nowMs = performance.now()
  ): void {
    const combo = this.comboSystem.recordSpellCast(power, origin, side, nowMs);
    if (combo) {
      // Escalating fusion combo haptic crescendo + spatial audio + radial crystal blast
      this.haptics.playFusionCombo(combo.chainCount, 'both', nowMs);
      this.audio.playShockwave(combo.origin);
      this.audio.playPlasmaPulse(combo.origin);
      this.vfx.triggerShockwave(
        combo.origin,
        combo.recipe.primaryColor,
        combo.recipe.ringScale * 1.15
      );

      const radius = combo.recipe.aoeRadius;
      const chainMult = 1 + Math.min(combo.chainCount - 2, 4) * 0.12;
      for (const target of this.arena.targets) {
        if (target.shattered) continue;
        const dist = target.group.position.distanceTo(combo.origin);
        if (dist < radius) {
          const falloff = 1 - dist / radius;
          const strength = (falloff * combo.recipe.aoeImpulse + 0.7) * chainMult;
          _tmpImpulse
            .subVectors(target.group.position, combo.origin)
            .normalize()
            .multiplyScalar(strength);
          _tmpImpulse.y += 1.05;
          this.arena.applyImpulseToTarget(
            target,
            _tmpImpulse,
            Math.round(combo.recipe.aoeDamage * (0.5 + 0.5 * falloff) * chainMult),
            (pos, col) => this.onTargetShattered(pos, col)
          );
        }
      }

      this.ui.flashFeedback(
        `Elemental Fusion: ${combo.recipe.name} (${combo.chainCount}x Chain) — ${combo.recipe.subtitle}!`
      );
      return;
    }

    const activeChain = this.comboSystem.getChainCount(nowMs);
    const boostedPower = THREE.MathUtils.clamp(
      powerLevel + (activeChain - 1) * 0.06,
      0.2,
      1.0
    );
    this.haptics.playSpellCast(power, side, boostedPower, nowMs);
  }

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
    this.haptics.playPhysicsContact('both', 'shatter', 2.0);
  }

  // ---------------- Head Gestures & Keyboard Shortcuts ----------------
  private handleHeadGesture(event: xb.HeadGestureEvent): void {
    const validated = this.stateMachine.processHeadGesture(
      event.detail.name,
      event.detail.confidence,
      performance.now()
    );
    if (validated === 'nod') {
      this.markUserActive();
      this.triggerEmpower();
    } else if (validated === 'shake') {
      this.markUserActive();
      this.triggerDispel();
    }
  }

  private triggerEmpower(): void {
    this.audio.ensureStarted();
    this.tutorial.notifyActionPerformed('head-modifiers');
    xb.core.camera.getWorldPosition(_camPos);
    this.vfx.empowerActiveEffects(this.arena.targets, (pos, col) =>
      this.onTargetShattered(pos, col)
    );
    this.audio.playHeadGesture('nod', _camPos);
    this.haptics.playHeadModifier('nod');
    this.ui.flashFeedback('Head Nod: Active elemental summons empowered & detonated!');
  }

  private triggerDispel(): void {
    this.audio.ensureStarted();
    this.tutorial.notifyActionPerformed('head-modifiers');
    xb.core.camera.getWorldPosition(_camPos);
    this.stateMachine.reset();
    this.vfx.dispelAll();
    this.comboSystem.resetCombos();
    this.audio.playHeadGesture('shake', _camPos);
    this.haptics.playHeadModifier('shake');
    this.ui.flashFeedback('Head Shake: Shields, ribbons, and vortices dispelled.');
  }

  private resetSandbox(): void {
    this.stateMachine.reset();
    this.vfx.dispelAll();
    this.comboSystem.resetCombos();
    this.arena.resetAll();
    this.ui.flashFeedback('Arena reset: all elemental crystals restored.');
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.repeat) return;
    this.markUserActive();
    const key = event.key.toUpperCase();
    for (const spec of ELEMENTAL_POWERS) {
      if (spec.hotkey.toUpperCase() === key) {
        this.selectedPower = spec.id;
        this.ui.setSelectedPower(spec.id);
        this.applyElementalTheme(POWER_TO_THEME[spec.id], false);
        this.ui.flashFeedback(
          `${spec.name}: ${spec.summary} · Realm: ${ELEMENTAL_THEMES[POWER_TO_THEME[spec.id]].name}`
        );
        return;
      }
    }
    if (key === 'B') this.toggleSpellBook();
    else if (key === 'T') {
      const active = this.tutorial.toggle();
      this.ui.flashFeedback(
        active
          ? 'Guided Tutorial active — follow the floating indicator.'
          : 'Guided Tutorial paused.'
      );
    } else if (key === 'M') {
      this.cycleElementalTheme();
    } else if (key === 'ESCAPE' && this.spellBookMenu.open) {
      this.setSpellBookOpen(false);
    } else if (key === 'N') this.triggerEmpower();
    else if (key === 'X') this.triggerDispel();
    else if (key === 'R') this.resetSandbox();
    else if (key === 'D') {
      const next = !this.debugOverlay.getOverlayVisible();
      this.debugOverlay.setOverlayVisible(next);
      this.ui.setDebugEnabled(next);
    } else if (key === 'O') {
      const next = !this.office.enabled;
      this.office.setEnabled(next);
      this.themeEnv.setEnabled(!next);
      this.ui.setOfficeEnabled(next);
    }
  }

  dispose(): void {
    this.unsubscribeLoadout?.();
    this.unsubscribeLoadout = null;
    xb.core.input.headGestures?.removeEventListener(
      'gesture',
      this.onHeadGestureBound
    );
    window.removeEventListener('keydown', this.onKeyDownBound);
    this.envRenderTarget?.dispose();
    this.office.dispose();
    this.themeEnv.dispose();
    this.arena.dispose();
    this.vfx.dispose();
    this.comboSystem.dispose();
    this.wristPulse.dispose();
    this.tutorial.dispose();
    this.idleGuide.dispose();
    this.haptics.dispose();
    this.audio.dispose();
  }
}
