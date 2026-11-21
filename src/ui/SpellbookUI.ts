import * as THREE from 'three';
import * as xb from 'xrblocks';

import {ELEMENTAL_POWERS, POWER_BY_ID} from '../constants.ts';
import {StateMachineSnapshot} from '../gestures/GestureStateMachine.ts';
import {CastHandPreference, PowerId} from '../types.ts';

export interface SpellbookCallbacks {
  onSelectPower: (power: PowerId) => void;
  onCastNow: (power: PowerId) => void;
  onToggleHandPref: (pref: CastHandPreference) => void;
  onToggleBarrage: (enabled: boolean) => void;
  onToggleOffice: (enabled: boolean) => void;
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
  private handPrefButton: xb.UIButton;
  private barrageButton: xb.UIButton;
  private officeButton: xb.UIButton;
  private muteButton: xb.UIButton;
  private powerButtons = new Map<PowerId, xb.UIButton>();

  private selectedPower: PowerId = 'fireball';
  private handPref: CastHandPreference = 'both';
  private barrageOn = false;
  private officeOn = true;
  private muted = false;

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
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 2,
          },
          children: [
            new xb.UIText({
              text: 'Elemental Spellbook',
              style: {fontSize: 24, fontWeight: 'bold', color: '#ffffff'},
            }),
            this.fsmStatusText,
          ],
        }),
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
      label: 'Office: On',
      icon: 'meeting_room',
      style: {flexGrow: 1, height: 40, fontSize: 13},
      onClick: () => {
        this.officeOn = !this.officeOn;
        this.officeButton.label = this.officeOn ? 'Office: On' : 'Office: Off';
        this.callbacks.onToggleOffice(this.officeOn);
      },
    });

    this.muteButton = new xb.UIButton({
      label: 'Audio: On',
      icon: 'volume_up',
      style: {flexGrow: 1, height: 40, fontSize: 13},
      onClick: () => {
        this.muted = !this.muted;
        this.muteButton.label = this.muted ? 'Audio: Muted' : 'Audio: On';
        this.muteButton.icon = this.muted ? 'volume_off' : 'volume_up';
        this.callbacks.onToggleMute(this.muted);
      },
    });

    const resetButton = new xb.UIButton({
      label: 'Reset',
      icon: 'restart_alt',
      style: {flexGrow: 1, height: 40, fontSize: 13},
      onClick: () => this.callbacks.onResetArena(),
    });

    const utilRow1 = new xb.UIPanel({
      style: {width: '100%', flexDirection: 'row', gap: 8},
      children: [this.handPrefButton, this.barrageButton],
    });

    const utilRow2 = new xb.UIPanel({
      style: {width: '100%', flexDirection: 'row', gap: 8},
      children: [this.officeButton, this.muteButton, resetButton],
    });

    // Positioned at ergonomic ~0.72m–1.05m reach on the left flank so the central
    // crystal arena and hand workspace remain 100% unobstructed.
    this.card = new xb.UICard({
      size: {width: 0.56, height: 0.68},
      manipulation: true,
      edge: true,
      style: {
        flexDirection: 'column',
        justifyContent: 'flex-start',
        gap: 12,
        padding: 18,
      },
      children: [header, handTelemetryRow, scrollList, headRow, utilRow1, utilRow2],
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
      text: 'Pose hands or click/pinch to cast · Keys 1-9, 0, -, =, V switch power · N Empower · X Dispel · Headphones recommended for 3D HRTF audio',
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
    for (const [id, btn] of this.powerButtons.entries()) {
      const spec = POWER_BY_ID[id];
      if (id === powerId) {
        btn.style.backgroundColor = spec.colorHex;
        btn.style.color = '#0b1020';
      } else {
        btn.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
        btn.style.color = '#f8fafc';
      }
    }
    this.refreshOverlay(0);
  }

  setOfficeEnabled(enabled: boolean): void {
    this.officeOn = enabled;
    this.officeButton.label = enabled ? 'Office: On' : 'Office: Off';
  }

  updateHandStatus(
    leftPower: PowerId | null,
    rightPower: PowerId | null,
    bimanualLabel: string | null,
    shatteredCount: number,
    fsm?: StateMachineSnapshot
  ): void {
    if (fsm) {
      this.fsmStatusText.text = `Hysteresis FSM · Misfires blocked: ${fsm.misfiresBlocked}`;
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
        : fsm?.left.phase === 'COOLDOWN'
          ? ' (CD)'
          : '';
      const rightTag = fsm?.right.occluded
        ? ' (Hold)'
        : fsm?.right.phase === 'COOLDOWN'
          ? ' (CD)'
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
