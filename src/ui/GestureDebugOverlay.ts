import * as THREE from 'three';
import * as xb from 'xrblocks';

import {
  HandStateSnapshot,
  StateMachineSnapshot,
  TRACKED_JOINT_KEYS,
  TrackedJointKey,
} from '../gestures/GestureStateMachine.ts';

const JOINT_SHORT_LABELS: Record<TrackedJointKey, string> = {
  wrist: 'WRST',
  'middle-finger-metacarpal': 'PALM',
  'thumb-tip': 'THMB',
  'index-finger-tip': 'INDX',
  'middle-finger-tip': 'MIDL',
  'ring-finger-tip': 'RING',
  'pinky-finger-tip': 'PNKY',
};

interface JointMeterWidgets {
  row: xb.UIPanel;
  label: xb.UIText;
  barFill: xb.UIPanel;
  valueText: xb.UIText;
}

interface HandDebugSection {
  panel: xb.UIPanel;
  headerText: xb.UIText;
  gestureText: xb.UIText;
  chargeText: xb.UIText;
  rawGestureText: xb.UIText;
  joints: Record<TrackedJointKey, JointMeterWidgets>;
}

function confidenceColor(score: number): string {
  if (score >= 0.8) return '#34d399'; // healthy emerald
  if (score >= 0.45) return '#fbbf24'; // degraded amber
  return '#f87171'; // tracking drop coral-red
}

/**
 * Real-time on-screen XR Blocks view-space debug overlay displaying live
 * GestureStateMachine gesture names, hysteresis phases, spell charge status,
 * raw gesture scores, and per-joint raw confidence meters to diagnose
 * optical tracking drops.
 */
export class GestureDebugOverlay extends THREE.Group {
  readonly overlay: xb.UIOverlay;

  private readonly statusBadge: xb.UIText;
  private readonly summaryLine: xb.UIText;
  private readonly bimanualLine: xb.UIText;
  private readonly leftSection: HandDebugSection;
  private readonly rightSection: HandDebugSection;

  private isVisible = true;

  constructor(private readonly onRequestHide?: () => void) {
    super();
    this.name = 'Gesture Debug Overlay';

    this.statusBadge = new xb.UIText({
      text: 'WAITING FOR HANDS',
      pointerEvents: 'none',
      style: {
        fontSize: 11,
        fontWeight: 'bold',
        color: '#94a3b8',
      },
    });

    const hideButton = new xb.UIButton({
      label: 'Hide (D)',
      style: {
        height: 26,
        paddingLeft: 10,
        paddingRight: 10,
        borderRadius: 8,
        fontSize: 11,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
      },
      onClick: () => {
        this.setOverlayVisible(false);
        this.onRequestHide?.();
      },
    });

    const titleRow = new xb.UIPanel({
      style: {
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 8,
      },
      children: [
        new xb.UIPanel({
          pointerEvents: 'none',
          style: {
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 2,
          },
          children: [
            new xb.UIText({
              text: 'GESTURE DEBUG TELEMETRY',
              pointerEvents: 'none',
              style: {
                fontSize: 13,
                fontWeight: 'bold',
                color: '#f8fafc',
              },
            }),
            this.statusBadge,
          ],
        }),
        hideButton,
      ],
    });

    this.summaryLine = new xb.UIText({
      text: 'Preset: balanced · Drops: 0 · Blocked: 0',
      pointerEvents: 'none',
      style: {
        width: '100%',
        fontSize: 11,
        color: '#cbd5e1',
      },
    });

    this.bimanualLine = new xb.UIText({
      text: 'Bimanual: none · Last Guard: none',
      pointerEvents: 'none',
      style: {
        width: '100%',
        fontSize: 11,
        color: '#94a3b8',
      },
    });

    this.leftSection = this.createHandSection('LEFT HAND');
    this.rightSection = this.createHandSection('RIGHT HAND');

    this.overlay = new xb.UIOverlay({
      style: {
        width: 372,
        position: 'absolute',
        top: 16,
        right: 16,
        flexDirection: 'column',
        gap: 8,
        padding: 12,
        borderRadius: 16,
        backgroundColor: 'rgba(10, 15, 28, 0.86)',
      },
      children: [
        titleRow,
        this.summaryLine,
        this.bimanualLine,
        this.leftSection.panel,
        this.rightSection.panel,
      ],
    });
    this.overlay.name = 'Gesture Telemetry Overlay';
    this.add(this.overlay);
  }

  private createHandSection(title: string): HandDebugSection {
    const headerText = new xb.UIText({
      text: `${title} · 0/25 joints`,
      pointerEvents: 'none',
      style: {
        width: '100%',
        fontSize: 11,
        fontWeight: 'bold',
        color: '#e2e8f0',
      },
    });

    const gestureText = new xb.UIText({
      text: 'Gesture: none (IDLE)',
      pointerEvents: 'none',
      style: {
        width: '100%',
        fontSize: 13,
        fontWeight: 'bold',
        color: '#94a3b8',
      },
    });

    const chargeText = new xb.UIText({
      text: 'Charge: idle · 0% · 0.85 Hz',
      pointerEvents: 'none',
      style: {
        width: '100%',
        fontSize: 11,
        color: '#38bdf8',
      },
    });

    const rawGestureText = new xb.UIText({
      text: 'Raw: none 0.00 · Smooth: 0.00 · Spd: 0.00 m/s',
      pointerEvents: 'none',
      style: {
        width: '100%',
        fontSize: 11,
        color: '#cbd5e1',
      },
    });

    const joints = {} as Record<TrackedJointKey, JointMeterWidgets>;
    const jointRows: xb.UIPanel[] = [];

    for (const key of TRACKED_JOINT_KEYS) {
      const label = new xb.UIText({
        text: JOINT_SHORT_LABELS[key],
        pointerEvents: 'none',
        style: {
          width: 42,
          fontSize: 10,
          fontWeight: 'bold',
          color: '#94a3b8',
        },
      });

      const barFill = new xb.UIPanel({
        pointerEvents: 'none',
        style: {
          width: '0%',
          height: '100%',
          borderRadius: 4,
          backgroundColor: '#34d399',
        },
      });

      const barTrack = new xb.UIPanel({
        pointerEvents: 'none',
        style: {
          flexGrow: 1,
          height: 7,
          borderRadius: 4,
          overflow: 'hidden',
          backgroundColor: 'rgba(148, 163, 184, 0.2)',
        },
        children: [barFill],
      });

      const valueText = new xb.UIText({
        text: '0.00',
        pointerEvents: 'none',
        style: {
          width: 34,
          fontSize: 10,
          textAlign: 'right',
          color: '#94a3b8',
        },
      });

      const row = new xb.UIPanel({
        pointerEvents: 'none',
        style: {
          width: '100%',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        },
        children: [label, barTrack, valueText],
      });

      joints[key] = {row, label, barFill, valueText};
      jointRows.push(row);
    }

    const panel = new xb.UIPanel({
      pointerEvents: 'none',
      style: {
        width: '100%',
        flexDirection: 'column',
        gap: 4,
        padding: 8,
        borderRadius: 10,
        backgroundColor: 'rgba(30, 41, 59, 0.62)',
      },
      children: [
        headerText,
        gestureText,
        chargeText,
        rawGestureText,
        ...jointRows,
      ],
    });

    return {
      panel,
      headerText,
      gestureText,
      chargeText,
      rawGestureText,
      joints,
    };
  }

  getOverlayVisible(): boolean {
    return this.isVisible;
  }

  setOverlayVisible(visible: boolean): void {
    this.isVisible = visible;
    this.overlay.visible = visible;
  }

  updateFromSnapshot(snapshot: StateMachineSnapshot): void {
    if (!this.isVisible) return;

    const totalDrops =
      snapshot.left.trackingDropsTotal + snapshot.right.trackingDropsTotal;
    const anyTracked =
      snapshot.left.trackedJointCount > 0 ||
      snapshot.right.trackedJointCount > 0;
    const anyDrop =
      snapshot.left.trackingDropActive ||
      snapshot.right.trackingDropActive ||
      snapshot.left.occluded ||
      snapshot.right.occluded;

    if (anyDrop) {
      this.statusBadge.text = 'TRACKING DROP DETECTED';
      this.statusBadge.style.color = '#f87171';
    } else if (anyTracked) {
      this.statusBadge.text = 'TRACKING HEALTHY';
      this.statusBadge.style.color = '#34d399';
    } else {
      this.statusBadge.text = 'NO HANDS IN VIEW';
      this.statusBadge.style.color = '#94a3b8';
    }

    this.summaryLine.text = `Preset: ${snapshot.preset} · Drops: ${totalDrops} · Blocked: ${snapshot.misfiresBlocked}`;
    this.bimanualLine.text = `Bimanual: ${snapshot.bimanual} · Guard: ${snapshot.lastBlockReason ?? 'none'}`;
    this.bimanualLine.style.color =
      snapshot.bimanual !== 'none' ? '#f472b6' : '#94a3b8';

    this.updateHandSection('LEFT', this.leftSection, snapshot.left);
    this.updateHandSection('RIGHT', this.rightSection, snapshot.right);
  }

  private updateHandSection(
    label: string,
    section: HandDebugSection,
    hand: HandStateSnapshot
  ): void {
    const dropTag = hand.occluded
      ? ' · OCCLUDED HOLD'
      : hand.trackingDropActive
        ? ' · DROP'
        : '';
    section.headerText.text = `${label} · ${hand.trackedJointCount}/${hand.totalJointCount} joints (${Math.round(hand.trackedJointRatio * 100)}%)${dropTag}`;
    section.headerText.style.color =
      hand.occluded || hand.trackingDropActive
        ? '#f87171'
        : hand.trackedJointCount > 0
          ? '#e2e8f0'
          : '#64748b';

    // Current gesture name & phase
    if (hand.activeGesture) {
      section.gestureText.text = `Gesture: ${hand.activeGesture} (${hand.phase})`;
      section.gestureText.style.color = hand.occluded
        ? '#fbbf24'
        : hand.charge.colorHex;
    } else if (hand.phase === 'COOLDOWN' && hand.cooldownRemainingMs > 0) {
      section.gestureText.text = `Gesture: COOLDOWN (${Math.ceil(hand.cooldownRemainingMs)}ms)`;
      section.gestureText.style.color = '#818cf8';
    } else if (hand.candidateGesture) {
      const dwellPct = Math.round(hand.dwellProgress * 100);
      section.gestureText.text = `Candidate: ${hand.candidateGesture} (DWELL ${dwellPct}%)`;
      section.gestureText.style.color = '#fde047';
    } else {
      section.gestureText.text = `Gesture: none (${hand.phase})`;
      section.gestureText.style.color = '#94a3b8';
    }

    // Spell charge status & wrist pulse frequency
    const chargePct = Math.round(hand.charge.chargeLevel * 100);
    section.chargeText.text = `Charge: ${hand.charge.status.toUpperCase()} ${chargePct}% · Pulse: ${hand.charge.pulseFrequencyHz.toFixed(1)} Hz`;
    section.chargeText.style.color = hand.charge.colorHex;

    // Raw vs smoothed gesture confidence + hand speed
    const rawName = hand.topRawGesture ?? 'none';
    const smoothForDisplay = hand.activeGesture
      ? hand.smoothedScores[hand.activeGesture]
      : hand.topRawGesture
        ? hand.smoothedScores[hand.topRawGesture]
        : 0;
    section.rawGestureText.text = `Raw: ${rawName} ${hand.topRawConfidence.toFixed(2)} · Smooth: ${smoothForDisplay.toFixed(2)} · ${hand.wristSpeed.toFixed(2)} m/s`;

    // Per-joint raw confidence bars
    for (const key of TRACKED_JOINT_KEYS) {
      const score = hand.jointConfidences[key] ?? 0;
      const widget = section.joints[key];
      const pct = Math.round(THREE.MathUtils.clamp(score, 0, 1) * 100);
      const col = hand.trackedJointCount === 0 ? '#475569' : confidenceColor(score);

      widget.barFill.style.width = `${pct}%`;
      widget.barFill.style.backgroundColor = col;
      widget.valueText.text = score.toFixed(2);
      widget.valueText.style.color = col;
      widget.label.style.color =
        hand.trackedJointCount > 0 && score < 0.45 ? '#f87171' : '#94a3b8';
    }
  }
}
