import * as THREE from 'three';
import * as xb from 'xrblocks';

import {ELEMENTAL_POWERS, POWER_BY_ID} from '../constants.ts';
import {
  ALL_SINGLE_HAND_GESTURES,
  StabilityPreset,
  StateMachineSnapshot,
} from '../gestures/GestureStateMachine.ts';
import {CastHandPreference, GestureName, PowerId} from '../types.ts';

const GESTURE_SHORT_LABELS: Record<GestureName, string> = {
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

export interface SpellbookCallbacks {
  onSelectPower: (power: PowerId) => void;
  onCastNow: (power: PowerId) => void;
  onToggleSpellBook: () => void;
  onToggleTutorial: () => void;
  onCycleTheme: () => void;
  onToggleHandPref: (pref: CastHandPreference) => void;
  onCycleStability: (preset: StabilityPreset) => void;
  onToggleBarrage: (enabled: boolean) => void;
  onToggleOffice: (enabled: boolean) => void;
  onToggleDebug: (enabled: boolean) => void;
  onToggleMute: (muted: boolean) => void;
  onEmpower: () => void;
  onDispel: () => void;
  onResetArena: () => void;
}

/**
 * Built-in XR Blocks Spatial UI for Elemental Hand Powers:
 * 1. World-space Elemental Spellbook UICard (positioned off to the left-front
 *    at comfortable glanceable/reach distance so center playspace stays clear).
 * 2. Compact bottom view-space UIOverlay showing live Left/Right active hand
 *    powers, selected quick-cast spell, and exit control.
 */
export class SpellbookUI extends THREE.Group {
  readonly card: xb.UICard;
  readonly overlay: xb.UIOverlay;

  private leftHandStatus: xb.UIText;
  private rightHandStatus: xb.UIText;
  private fsmStatusText: xb.UIText;
  private overlayStatus: xb.UIText;
  private overlayHint: xb.UIText;
  private spellBookButton: xb.UIButton;
  private tutorialButton: xb.UIButton;
  private themeButton: xb.UIButton;
  private handPrefButton: xb.UIButton;
  private stabilityButton: xb.UIButton;
  private barrageButton: xb.UIButton;
  private officeButton: xb.UIButton;
  private debugButton: xb.UIButton;
  private muteButton: xb.UIButton;
  private powerButtons = new Map<PowerId, xb.UIButton>();
  private powerMetaTexts = new Map<PowerId, xb.UIText>();
  private equippedSet = new Set<PowerId>(ELEMENTAL_POWERS.map((p) => p.id));
  private gestureBindings: Partial<Record<GestureName, PowerId>> = {};

  private selectedPower: PowerId = 'fireball';
  private handPref: CastHandPreference = 'both';
  private stabilityPreset: StabilityPreset = 'balanced';
  private barrageOn = false;
  private officeOn = false;
  private debugOn = true;
  private muted = false;
  private tutorialActive = false;

  constructor(private readonly callbacks: SpellbookCallbacks) {
    super();
    this.name = 'Elemental Spellbook UI';

    // --- Header & Active Hand Status ---
    this.leftHandStatus = new xb.UIText({
      text: 'L: Idle',
      style: {fontSize: 15, color: '#cbd5e1'},
    });
    this.rightHandStatus = new xb.UIText({
      text: 'R: Idle',
      style: {fontSize: 15, color: '#cbd5e1'},
    });
    this.fsmStatusText = new xb.UIText({
      text: 'Hysteresis FSM · Misfires blocked: 0',
      style: {fontSize: 12, color: '#94a3b8'},
    });

    this.spellBookButton = new xb.UIButton({
      label: 'Book (B)',
      icon: 'menu_book',
      style: {
        height: 40,
        paddingLeft: 10,
        paddingRight: 10,
        borderRadius: 12,
        fontSize: 13,
        fontWeight: 'bold',
        backgroundColor: 'rgba(251, 191, 36, 0.2)',
        color: '#fde68a',
      },
      onClick: () => this.callbacks.onToggleSpellBook(),
    });

    const header = new xb.UIPanel({
      style: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
      },
      children: [
        new xb.UIPanel({
          style: {
            flexGrow: 1,
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 2,
          },
          children: [
            new xb.UIText({
              text: 'Elemental Spellbook',
              style: {fontSize: 22, fontWeight: 'bold', color: '#ffffff'},
            }),
            this.fsmStatusText,
          ],
        }),
        this.spellBookButton,
      ],
    });

    const handTelemetryRow = new xb.UIPanel({
      style: {
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 10,
        borderRadius: 12,
        backgroundColor: 'rgba(15, 23, 42, 0.55)',
      },
      children: [this.leftHandStatus, this.rightHandStatus],
    });

    // --- Scrollable Power Matrix ---
    const powerRows: xb.UIPanel[] = [];
    for (const spec of ELEMENTAL_POWERS) {
      const btn = new xb.UIButton({
        label: `${spec.name}`,
        icon: spec.icon,
        style: {
          width: '100%',
          justifyContent: 'flex-start',
          paddingLeft: 12,
          paddingRight: 12,
          height: 44,
          borderRadius: 12,
          fontSize: 16,
        },
        onClick: () => {
          this.setSelectedPower(spec.id);
          this.callbacks.onSelectPower(spec.id);
          this.callbacks.onCastNow(spec.id);
        },
      });
      this.powerButtons.set(spec.id, btn);

      const meta = new xb.UIText({
        text: `${spec.gestureLabel} · ${spec.tier} · Key ${spec.hotkey}`,
        style: {
          fontSize: 12,
          opacity: 0.68,
          marginLeft: 6,
        },
      });
      this.powerMetaTexts.set(spec.id, meta);

      powerRows.push(
        new xb.UIPanel({
          style: {
            width: '100%',
            flexDirection: 'column',
            gap: 4,
          },
          children: [btn, meta],
        })
      );
    }

    const scrollList = new xb.UIScrollView({
      ariaLabel: 'Elemental powers list',
      style: {
        width: '100%',
        flexGrow: 1,
        flexBasis: 0,
        minHeight: 210,
        gap: 10,
      },
      children: powerRows,
    });

    // --- Head Gesture & Sandbox Utility Controls ---
    const headRow = new xb.UIPanel({
      style: {width: '100%', flexDirection: 'row', gap: 8},
      children: [
        new xb.UIButton({
          label: 'Empower (Nod)',
          icon: 'bolt',
          style: {flexGrow: 1, height: 42, fontSize: 14},
          onClick: () => this.callbacks.onEmpower(),
        }),
        new xb.UIButton({
          label: 'Dispel (Shake)',
          icon: 'close',
          style: {flexGrow: 1, height: 42, fontSize: 14},
          onClick: () => this.callbacks.onDispel(),
        }),
      ],
    });

    this.handPrefButton = new xb.UIButton({
      label: 'Hands: Both',
      icon: 'pan_tool',
      style: {flexGrow: 1, height: 40, fontSize: 13},
      onClick: () => {
        const order: CastHandPreference[] = ['both', 'right', 'left'];
        const next = order[(order.indexOf(this.handPref) + 1) % order.length];
        this.handPref = next;
        this.handPrefButton.label =
          next === 'both'
            ? 'Hands: Both'
            : next === 'right'
              ? 'Hands: Right'
              : 'Hands: Left';
        this.callbacks.onToggleHandPref(next);
      },
    });

    this.barrageButton = new xb.UIButton({
      label: 'Barrage: Off',
      icon: 'shield',
      style: {flexGrow: 1, height: 40, fontSize: 13},
      onClick: () => {
        this.barrageOn = !this.barrageOn;
        this.barrageButton.label = this.barrageOn
          ? 'Barrage: On'
          : 'Barrage: Off';
        this.callbacks.onToggleBarrage(this.barrageOn);
      },
    });

    this.officeButton = new xb.UIButton({
      label: 'Office: Off',
      icon: 'meeting_room',
      style: {flexGrow: 1, height: 38, fontSize: 12},
      onClick: () => {
        this.officeOn = !this.officeOn;
        this.officeButton.label = this.officeOn ? 'Office: On' : 'Office: Off';
        this.callbacks.onToggleOffice(this.officeOn);
      },
    });

    this.debugButton = new xb.UIButton({
      label: 'Debug: On',
      icon: 'bug_report',
      style: {flexGrow: 1, height: 38, fontSize: 12},
      onClick: () => {
        this.debugOn = !this.debugOn;
        this.debugButton.label = this.debugOn ? 'Debug: On' : 'Debug: Off';
        this.callbacks.onToggleDebug(this.debugOn);
      },
    });

    this.muteButton = new xb.UIButton({
      label: 'Audio: On',
      icon: 'volume_up',
      style: {flexGrow: 1, height: 38, fontSize: 12},
      onClick: () => {
        this.muted = !this.muted;
        this.muteButton.label = this.muted ? 'Audio: Off' : 'Audio: On';
        this.muteButton.icon = this.muted ? 'volume_off' : 'volume_up';
        this.callbacks.onToggleMute(this.muted);
      },
    });

    const resetButton = new xb.UIButton({
      label: 'Reset',
      icon: 'restart_alt',
      style: {flexGrow: 1, height: 38, fontSize: 12},
      onClick: () => this.callbacks.onResetArena(),
    });

    this.tutorialButton = new xb.UIButton({
      label: 'Tutorial (T)',
      icon: 'school',
      style: {flexGrow: 1, height: 38, fontSize: 12},
      onClick: () => this.callbacks.onToggleTutorial(),
    });

    this.themeButton = new xb.UIButton({
      label: 'Realm: Volcanic',
      icon: 'landscape',
      style: {flexGrow: 1, height: 38, fontSize: 12},
      onClick: () => this.callbacks.onCycleTheme(),
    });

    this.stabilityButton = new xb.UIButton({
      label: 'Guard: Balanced',
      icon: 'tune',
      style: {flexGrow: 1, height: 38, fontSize: 12},
      onClick: () => {
        const order: StabilityPreset[] = ['balanced', 'strict', 'responsive'];
        const next =
          order[(order.indexOf(this.stabilityPreset) + 1) % order.length];
        this.stabilityPreset = next;
        this.stabilityButton.label =
          next === 'balanced'
            ? 'Guard: Balanced'
            : next === 'strict'
              ? 'Guard: Strict'
              : 'Guard: Fast';
        this.callbacks.onCycleStability(next);
      },
    });

    const utilRow0 = new xb.UIPanel({
      style: {width: '100%', flexDirection: 'row', gap: 6},
      children: [this.tutorialButton, this.themeButton],
    });

    const utilRow1 = new xb.UIPanel({
      style: {width: '100%', flexDirection: 'row', gap: 6},
      children: [this.handPrefButton, this.stabilityButton, this.barrageButton],
    });

    const utilRow2 = new xb.UIPanel({
      style: {width: '100%', flexDirection: 'row', gap: 6},
      children: [
        this.officeButton,
        this.debugButton,
        this.muteButton,
        resetButton,
      ],
    });

    // Positioned at ergonomic ~0.72m–1.05m reach on the left flank so the central
    // crystal arena and hand workspace remain 100% unobstructed.
    this.card = new xb.UICard({
      size: {width: 0.56, height: 0.72},
      manipulation: true,
      edge: true,
      style: {
        flexDirection: 'column',
        justifyContent: 'flex-start',
        gap: 10,
        padding: 16,
      },
      children: [
        header,
        handTelemetryRow,
        scrollList,
        headRow,
        utilRow0,
        utilRow1,
        utilRow2,
      ],
    });
    this.card.name = 'Elemental Spellbook Card';
    this.card.position.set(-0.78, 1.36, -0.96);
    this.card.rotation.y = 0.44;
    this.add(this.card);

    // --- Compact View-Space Bottom Overlay ---
    this.overlayStatus = new xb.UIText({
      text: 'Selected: Fireballs (Open Palm) · Crystals Shattered: 0',
      pointerEvents: 'none',
      style: {
        fontSize: 18,
        fontWeight: 'bold',
        textAlign: 'center',
        color: '#ffffff',
      },
    });
    this.overlayHint = new xb.UIText({
      text: 'Open Book Palms / B: Spell Book · T: Tutorial · M: Realm Theme · Keys 1-9, 0, -, =, V switch power · N Empower · X Dispel',
      pointerEvents: 'none',
      style: {
        fontSize: 14,
        opacity: 0.78,
        textAlign: 'center',
      },
    });

    this.overlay = new xb.UIOverlay({
      style: {
        width: 780,
        position: 'absolute',
        left: '50%',
        bottom: 20,
        transform: {translateX: '-50%'},
        flexDirection: 'column',
        gap: 6,
        padding: 12,
      },
      children: [new xb.UIExitButton(), this.overlayStatus, this.overlayHint],
    });
    this.overlay.name = 'Elemental HUD Overlay';
    this.add(this.overlay);

    this.setSelectedPower('fireball');
  }

  setSelectedPower(powerId: PowerId): void {
    this.selectedPower = powerId;
    this.refreshPowerStyles();
    this.refreshOverlay(0);
  }

  setSpellBookOpen(open: boolean): void {
    this.spellBookButton.label = open ? 'Close (B)' : 'Book (B)';
    this.spellBookButton.style.backgroundColor = open
      ? '#fbbf24'
      : 'rgba(251, 191, 36, 0.2)';
    this.spellBookButton.style.color = open ? '#0b1020' : '#fde68a';
  }

  setTutorialActive(active: boolean): void {
    this.tutorialActive = active;
    this.tutorialButton.label = active ? 'Tutorial: On' : 'Tutorial (T)';
    this.tutorialButton.style.backgroundColor = active
      ? 'rgba(52, 211, 153, 0.28)'
      : 'rgba(255, 255, 255, 0.08)';
    this.tutorialButton.style.color = active ? '#6ee7b7' : '#f8fafc';
  }

  setThemeLabel(themeName: string, accentHex: string): void {
    this.themeButton.label = `Realm: ${themeName}`;
    this.themeButton.style.color = accentHex;
  }

  syncEquippedLoadout(
    equippedPowers: readonly PowerId[],
    bindings: Record<GestureName, PowerId>
  ): void {
    this.equippedSet = new Set(equippedPowers);
    this.gestureBindings = {...bindings};
    this.refreshPowerStyles();
  }

  private refreshPowerStyles(): void {
    for (const spec of ELEMENTAL_POWERS) {
      const btn = this.powerButtons.get(spec.id);
      const meta = this.powerMetaTexts.get(spec.id);
      const equipped = this.equippedSet.has(spec.id);
      if (btn) {
        if (spec.id === this.selectedPower) {
          btn.style.backgroundColor = spec.colorHex;
          btn.style.color = '#0b1020';
        } else if (equipped) {
          btn.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
          btn.style.color = '#f8fafc';
        } else {
          btn.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
          btn.style.color = '#64748b';
        }
      }
      if (meta) {
        let gestureLabel = spec.gestureLabel;
        if (spec.id !== 'plasma-core' && spec.id !== 'void-dome') {
          for (const g of ALL_SINGLE_HAND_GESTURES) {
            if (this.gestureBindings[g] === spec.id) {
              gestureLabel = GESTURE_SHORT_LABELS[g];
              break;
            }
          }
        }
        const statusTag = equipped ? '' : '[Unequipped] · ';
        meta.text = `${statusTag}${gestureLabel} · ${spec.tier} · Key ${spec.hotkey}`;
        meta.style.color = equipped ? '#cbd5e1' : '#64748b';
      }
    }
  }

  setOfficeEnabled(enabled: boolean): void {
    this.officeOn = enabled;
    this.officeButton.label = enabled ? 'Office: On' : 'Office: Off';
  }

  setDebugEnabled(enabled: boolean): void {
    this.debugOn = enabled;
    this.debugButton.label = enabled ? 'Debug: On' : 'Debug: Off';
  }

  updateHandStatus(
    leftPower: PowerId | null,
    rightPower: PowerId | null,
    bimanualLabel: string | null,
    shatteredCount: number,
    fsm?: StateMachineSnapshot
  ): void {
    if (fsm) {
      const tag = fsm.spellBookOpen
        ? ' · Spell Book Open'
        : fsm.lastBlockReason
          ? ` · Last: ${fsm.lastBlockReason}`
          : '';
      this.fsmStatusText.text = `Equipped ${fsm.equippedCount}/${ELEMENTAL_POWERS.length} · ${fsm.preset} · Blocked: ${fsm.misfiresBlocked}${tag}`;
    }

    if (bimanualLabel) {
      this.leftHandStatus.text = `Bimanual: ${bimanualLabel}`;
      this.leftHandStatus.style.color = '#f472b6';
      this.rightHandStatus.text = 'Active Combo';
      this.rightHandStatus.style.color = '#f472b6';
    } else {
      const leftSpec = leftPower ? POWER_BY_ID[leftPower] : null;
      const rightSpec = rightPower ? POWER_BY_ID[rightPower] : null;

      const leftTag = fsm?.left.occluded
        ? ' (Hold)'
        : fsm?.left.phase === 'COOLDOWN' && fsm.left.cooldownRemainingMs > 0
          ? ` (CD ${(fsm.left.cooldownRemainingMs / 1000).toFixed(1)}s)`
          : '';
      const rightTag = fsm?.right.occluded
        ? ' (Hold)'
        : fsm?.right.phase === 'COOLDOWN' && fsm.right.cooldownRemainingMs > 0
          ? ` (CD ${(fsm.right.cooldownRemainingMs / 1000).toFixed(1)}s)`
          : '';

      this.leftHandStatus.text = leftSpec
        ? `L: ${leftSpec.name}${leftTag}`
        : `L: Idle${leftTag}`;
      this.leftHandStatus.style.color = fsm?.left.occluded
        ? '#fbbf24'
        : leftSpec
          ? leftSpec.colorHex
          : '#cbd5e1';

      this.rightHandStatus.text = rightSpec
        ? `R: ${rightSpec.name}${rightTag}`
        : `R: Idle${rightTag}`;
      this.rightHandStatus.style.color = fsm?.right.occluded
        ? '#fbbf24'
        : rightSpec
          ? rightSpec.colorHex
          : '#cbd5e1';
    }
    this.refreshOverlay(shatteredCount);
  }

  flashFeedback(message: string): void {
    this.overlayHint.text = message;
  }

  private refreshOverlay(shatteredCount: number): void {
    const spec = POWER_BY_ID[this.selectedPower];
    this.overlayStatus.text = `Selected: ${spec.name} (${spec.gestureLabel}) · Shattered: ${shatteredCount}`;
  }
}
