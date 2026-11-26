import * as THREE from 'three';
import * as xb from 'xrblocks';

import {ELEMENTAL_POWERS, POWER_BY_ID} from '../constants.ts';
import {ALL_SINGLE_HAND_GESTURES} from '../gestures/GestureStateMachine.ts';
import {ElementalPowerSpec, GestureName, PowerId} from '../types.ts';
import {
  ELEMENTAL_THEMES,
  ElementalThemeId,
  POWER_TO_THEME,
} from '../world/ElementalThemeEnvironment.ts';

export type SpellSchoolFilter =
  | 'all'
  | 'fire-earth'
  | 'frost-water'
  | 'storm-air'
  | 'arcane-dual';

export interface SpellLoadoutPreset {
  id: string;
  label: string;
  powers: readonly PowerId[];
}

export const SPELL_LOADOUT_PRESETS: readonly SpellLoadoutPreset[] = [
  {
    id: 'all',
    label: 'All (13)',
    powers: ELEMENTAL_POWERS.map((p) => p.id),
  },
  {
    id: 'pyro-earth',
    label: 'Pyromancer',
    powers: ['fireball', 'magma-bolt', 'earth-shield', 'kinetic-gale'],
  },
  {
    id: 'cryo-storm',
    label: 'Cryo-Storm',
    powers: ['frost-lance', 'tidal-vortex', 'chain-lightning', 'sky-updraft'],
  },
  {
    id: 'arcanist',
    label: 'Arcanist',
    powers: [
      'rainbow-ribbons',
      'verdant-flora',
      'lightning-tether',
      'plasma-core',
      'void-dome',
    ],
  },
  {
    id: 'core-3',
    label: 'Core 3',
    powers: ['fireball', 'earth-shield', 'frost-lance'],
  },
];

const SCHOOL_BY_POWER: Record<PowerId, Exclude<SpellSchoolFilter, 'all'>> = {
  fireball: 'fire-earth',
  'magma-bolt': 'fire-earth',
  'earth-shield': 'fire-earth',
  'frost-lance': 'frost-water',
  'tidal-vortex': 'frost-water',
  'lightning-tether': 'storm-air',
  'kinetic-gale': 'storm-air',
  'sky-updraft': 'storm-air',
  'chain-lightning': 'storm-air',
  'rainbow-ribbons': 'arcane-dual',
  'verdant-flora': 'arcane-dual',
  'plasma-core': 'arcane-dual',
  'void-dome': 'arcane-dual',
};

const GESTURE_DISPLAY_LABELS: Record<GestureName, string> = {
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

const _camPos = new THREE.Vector3();
const _camForward = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();

export interface SpellBookMenuCallbacks {
  onToggleEquip: (powerId: PowerId) => void;
  onApplyPreset: (preset: SpellLoadoutPreset) => void;
  onRebindGesture: (gesture: GestureName, powerId: PowerId) => void;
  onResetLoadout: () => void;
  onTestCast: (powerId: PowerId) => void;
  onCycleTheme?: () => void;
  onClose: () => void;
}

interface CatalogRowWidgets {
  row: xb.UIPanel;
  selectBtn: xb.UIButton;
  equipBtn: xb.UIButton;
  metaText: xb.UIText;
}

/**
 * Gesture-summoned world-space 'Spell Book' menu built with XR Blocks' native
 * spatial UI (`UICard`, `UIScrollView`, `UIPanel`, `UIButton`, `UIText`, `UIIcon`).
 *
 * Summoned by holding both open palms side-by-side tilted upward ("Open Book"
 * gesture) or pressing `B`, allowing users to browse elemental schools, apply
 * quick loadout presets, toggle spells equipped/unequipped, and rebind single-hand
 * gesture slots — dynamically updating the active `GestureStateMachine`.
 */
export class SpellBookMenu extends THREE.Group {
  readonly card: xb.UICard;

  private isOpen = false;
  private animScale = 0.01;
  private activeSchool: SpellSchoolFilter = 'all';
  private inspectedPower: PowerId = 'fireball';
  private equippedSet = new Set<PowerId>(ELEMENTAL_POWERS.map((p) => p.id));
  private bindings: Record<GestureName, PowerId> = {
    'open-palm': 'fireball',
    victory: 'rainbow-ribbons',
    fist: 'earth-shield',
    point: 'frost-lance',
    pinch: 'lightning-tether',
    spread: 'kinetic-gale',
    'thumbs-up': 'sky-updraft',
    rock: 'chain-lightning',
    shaka: 'tidal-vortex',
    'finger-gun': 'magma-bolt',
    'palm-up': 'verdant-flora',
  };

  private subtitleText: xb.UIText;
  private themeBadgeBtn: xb.UIButton;
  private schoolButtons = new Map<SpellSchoolFilter, xb.UIButton>();
  private catalogRows = new Map<PowerId, CatalogRowWidgets>();

  // Right-pane Spell Inspector widgets
  private inspectorAccentBar: xb.UIPanel;
  private inspectorIcon: xb.UIIcon;
  private inspectorTitle: xb.UIText;
  private inspectorTier: xb.UIText;
  private inspectorDesc: xb.UIText;
  private inspectorBindingText: xb.UIText;
  private inspectorStatusText: xb.UIText;
  private inspectorEquipBtn: xb.UIButton;
  private inspectorRebindBtn: xb.UIButton;
  private inspectorCastBtn: xb.UIButton;

  constructor(private readonly callbacks: SpellBookMenuCallbacks) {
    super();
    this.name = 'Arcane Spell Book Menu';

    // --- 1. Header Bar ---
    this.subtitleText = new xb.UIText({
      text: 'Equipped: 13 / 13 · Live GestureStateMachine Loadout',
      style: {fontSize: 13, color: '#94a3b8'},
    });

    this.themeBadgeBtn = new xb.UIButton({
      label: 'Realm: Volcanic Caldera',
      icon: 'landscape',
      ariaLabel: 'Cycle elemental environment theme',
      style: {
        height: 38,
        paddingLeft: 12,
        paddingRight: 12,
        borderRadius: 10,
        fontSize: 12,
        fontWeight: 'bold',
        backgroundColor: 'rgba(255, 107, 43, 0.22)',
        color: '#ff6b2b',
      },
      onClick: () => this.callbacks.onCycleTheme?.(),
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
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            flexGrow: 1,
          },
          children: [
            new xb.UIIcon({
              icon: 'menu_book',
              style: {width: 32, height: 32, color: '#fbbf24'},
            }),
            new xb.UIPanel({
              style: {
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 2,
              },
              children: [
                new xb.UIText({
                  text: 'Arcane Spell Book',
                  style: {fontSize: 24, fontWeight: 'bold', color: '#ffffff'},
                }),
                this.subtitleText,
              ],
            }),
          ],
        }),
        this.themeBadgeBtn,
        new xb.UIButton({
          label: 'Close',
          icon: 'close',
          ariaLabel: 'Close Spell Book menu',
          style: {height: 38, paddingLeft: 12, paddingRight: 12, fontSize: 13},
          onClick: () => this.callbacks.onClose(),
        }),
      ],
    });

    // --- 2. Elemental School Filter Tabs ---
    const schools: Array<{id: SpellSchoolFilter; label: string}> = [
      {id: 'all', label: 'All Spells'},
      {id: 'fire-earth', label: 'Fire & Earth'},
      {id: 'frost-water', label: 'Frost & Water'},
      {id: 'storm-air', label: 'Storm & Air'},
      {id: 'arcane-dual', label: 'Arcane & Dual'},
    ];
    const schoolTabWidgets: xb.UIButton[] = [];
    for (const s of schools) {
      const btn = new xb.UIButton({
        label: s.label,
        style: {
          flexGrow: 1,
          height: 34,
          fontSize: 12,
          borderRadius: 10,
        },
        onClick: () => this.setSchoolFilter(s.id),
      });
      this.schoolButtons.set(s.id, btn);
      schoolTabWidgets.push(btn);
    }
    const schoolBar = new xb.UIPanel({
      style: {width: '100%', flexDirection: 'row', gap: 6},
      children: schoolTabWidgets,
    });

    // --- 3. Loadout Preset Quick-Equip Row ---
    const presetButtons = SPELL_LOADOUT_PRESETS.map(
      (preset) =>
        new xb.UIButton({
          label: preset.label,
          style: {
            flexGrow: 1,
            height: 32,
            fontSize: 11,
            borderRadius: 8,
            backgroundColor: 'rgba(99, 102, 241, 0.22)',
          },
          onClick: () => this.callbacks.onApplyPreset(preset),
        })
    );
    const presetBar = new xb.UIPanel({
      style: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
      },
      children: [
        new xb.UIText({
          text: 'Loadouts:',
          style: {fontSize: 12, color: '#cbd5e1', fontWeight: 'bold'},
        }),
        ...presetButtons,
      ],
    });

    // --- 4. Left Column: Scrollable Spell Catalog ---
    const catalogChildren: xb.UIPanel[] = [];
    for (const spec of ELEMENTAL_POWERS) {
      const selectBtn = new xb.UIButton({
        label: spec.name,
        icon: spec.icon,
        style: {
          flexGrow: 1,
          justifyContent: 'flex-start',
          height: 38,
          paddingLeft: 10,
          paddingRight: 10,
          borderRadius: 10,
          fontSize: 14,
        },
        onClick: () => this.selectSpell(spec.id),
      });

      const equipBtn = new xb.UIButton({
        label: 'ON',
        ariaLabel: `Toggle ${spec.name} equipped`,
        style: {
          width: 64,
          height: 38,
          borderRadius: 10,
          fontSize: 12,
          fontWeight: 'bold',
        },
        onClick: () => {
          this.selectSpell(spec.id);
          this.callbacks.onToggleEquip(spec.id);
        },
      });

      const metaText = new xb.UIText({
        text: `${spec.gestureLabel} · ${spec.tier}`,
        style: {fontSize: 11, color: '#94a3b8', marginLeft: 6},
      });

      const row = new xb.UIPanel({
        style: {
          width: '100%',
          flexDirection: 'column',
          gap: 3,
        },
        children: [
          new xb.UIPanel({
            style: {width: '100%', flexDirection: 'row', gap: 6},
            children: [selectBtn, equipBtn],
          }),
          metaText,
        ],
      });

      this.catalogRows.set(spec.id, {row, selectBtn, equipBtn, metaText});
      catalogChildren.push(row);
    }

    const catalogScroll = new xb.UIScrollView({
      ariaLabel: 'Spell Book catalog',
      style: {
        width: '56%',
        height: '100%',
        gap: 8,
      },
      children: catalogChildren,
    });

    // --- 5. Right Column: Selected Spell Inspector & Rebinding ---
    this.inspectorAccentBar = new xb.UIPanel({
      pointerEvents: 'none',
      style: {
        width: '100%',
        height: 5,
        borderRadius: 3,
        backgroundColor: '#ff6b2b',
      },
    });
    this.inspectorIcon = new xb.UIIcon({
      icon: 'local_fire_department',
      style: {width: 34, height: 34, color: '#ff6b2b'},
    });
    this.inspectorTitle = new xb.UIText({
      text: 'Fireballs',
      style: {fontSize: 20, fontWeight: 'bold', color: '#ffffff'},
    });
    this.inspectorTier = new xb.UIText({
      text: 'Built-in · Sustained',
      style: {fontSize: 12, color: '#cbd5e1'},
    });
    this.inspectorDesc = new xb.UIText({
      text: POWER_BY_ID.fireball.summary,
      style: {fontSize: 13, lineHeight: 1.35, color: '#e2e8f0'},
    });
    this.inspectorBindingText = new xb.UIText({
      text: 'Active Gesture: Open Palm',
      style: {fontSize: 13, fontWeight: 'bold', color: '#fbbf24'},
    });
    this.inspectorStatusText = new xb.UIText({
      text: 'Status: Equipped in GestureStateMachine',
      style: {fontSize: 12, color: '#34d399'},
    });

    this.inspectorEquipBtn = new xb.UIButton({
      label: 'Unequip Spell',
      icon: 'check_circle',
      style: {width: '100%', height: 40, borderRadius: 10, fontSize: 14},
      onClick: () => this.callbacks.onToggleEquip(this.inspectedPower),
    });

    this.inspectorRebindBtn = new xb.UIButton({
      label: 'Cycle Gesture Slot',
      icon: 'swap_horiz',
      style: {width: '100%', height: 36, borderRadius: 10, fontSize: 13},
      onClick: () => this.cycleInspectedBinding(),
    });

    this.inspectorCastBtn = new xb.UIButton({
      label: 'Test Cast',
      icon: 'auto_fix_high',
      style: {flexGrow: 1, height: 36, borderRadius: 10, fontSize: 13},
      onClick: () => this.callbacks.onTestCast(this.inspectedPower),
    });

    const resetBtn = new xb.UIButton({
      label: 'Defaults',
      icon: 'restart_alt',
      style: {flexGrow: 1, height: 36, borderRadius: 10, fontSize: 13},
      onClick: () => this.callbacks.onResetLoadout(),
    });

    const inspectorPane = new xb.UIPanel({
      style: {
        width: '42%',
        height: '100%',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 14,
        borderRadius: 14,
        backgroundColor: 'rgba(15, 23, 42, 0.72)',
        gap: 10,
      },
      children: [
        new xb.UIPanel({
          style: {width: '100%', flexDirection: 'column', gap: 8},
          children: [
            this.inspectorAccentBar,
            new xb.UIPanel({
              style: {
                width: '100%',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
              },
              children: [
                this.inspectorIcon,
                new xb.UIPanel({
                  style: {flexDirection: 'column', gap: 2, flexGrow: 1},
                  children: [this.inspectorTitle, this.inspectorTier],
                }),
              ],
            }),
            this.inspectorDesc,
            this.inspectorBindingText,
            this.inspectorStatusText,
          ],
        }),
        new xb.UIPanel({
          style: {width: '100%', flexDirection: 'column', gap: 7},
          children: [
            this.inspectorEquipBtn,
            this.inspectorRebindBtn,
            new xb.UIPanel({
              style: {width: '100%', flexDirection: 'row', gap: 6},
              children: [this.inspectorCastBtn, resetBtn],
            }),
          ],
        }),
      ],
    });

    const splitBody = new xb.UIPanel({
      style: {
        width: '100%',
        flexGrow: 1,
        flexBasis: 0,
        minHeight: 240,
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 10,
      },
      children: [catalogScroll, inspectorPane],
    });

    const footerHint = new xb.UIText({
      text: 'Hold both open palms upturned side-by-side (Open Book) or press B to open/close · Drag border to move',
      pointerEvents: 'none',
      style: {
        width: '100%',
        fontSize: 12,
        color: '#94a3b8',
        textAlign: 'center',
      },
    });

    this.card = new xb.UICard({
      size: {width: 0.78, height: 0.62},
      manipulation: true,
      edge: true,
      style: {
        flexDirection: 'column',
        justifyContent: 'flex-start',
        gap: 10,
        padding: 18,
      },
      children: [header, schoolBar, presetBar, splitBody, footerHint],
    });
    this.card.name = 'Arcane Spell Book Card';
    this.card.visible = false;
    this.card.scale.setScalar(0.01);
    this.add(this.card);

    this.setSchoolFilter('all');
    this.selectSpell('fireball');
  }

  get open(): boolean {
    return this.isOpen;
  }

  setOpen(
    open: boolean,
    camera: THREE.Camera,
    anchorPosition?: THREE.Vector3 | null
  ): void {
    if (this.isOpen === open) return;
    this.isOpen = open;
    if (open) {
      this.positionNearUser(camera, anchorPosition);
      this.card.visible = true;
      this.animScale = 0.76;
      this.card.scale.setScalar(this.animScale);
    }
  }

  toggle(
    camera: THREE.Camera,
    anchorPosition?: THREE.Vector3 | null
  ): boolean {
    this.setOpen(!this.isOpen, camera, anchorPosition);
    return this.isOpen;
  }

  private positionNearUser(
    camera: THREE.Camera,
    anchorPosition?: THREE.Vector3 | null
  ): void {
    camera.getWorldPosition(_camPos);
    camera.getWorldDirection(_camForward);

    if (anchorPosition) {
      // Spawn right above the user's open-book palms, pulled slightly forward if too close
      this.card.position.copy(anchorPosition);
      const dist = this.card.position.distanceTo(_camPos);
      if (dist < 0.62) {
        this.card.position
          .sub(_camPos)
          .normalize()
          .multiplyScalar(0.68)
          .add(_camPos);
      }
      this.card.position.y = THREE.MathUtils.clamp(
        this.card.position.y,
        _camPos.y - 0.3,
        _camPos.y + 0.25
      );
    } else {
      // Camera-anchored ergonomic eye-comfort placement (~0.92m in front)
      const flatForward = _camForward.clone();
      flatForward.y = 0;
      if (flatForward.lengthSq() < 1e-4) flatForward.set(0, 0, -1);
      flatForward.normalize();
      this.card.position
        .copy(_camPos)
        .addScaledVector(flatForward, 0.92);
      this.card.position.y = _camPos.y - 0.06;
    }

    // Face camera upright (horizontal yaw alignment keeps text crisp & readable)
    _lookTarget.set(_camPos.x, this.card.position.y, _camPos.z);
    this.card.lookAt(_lookTarget);
  }

  update(dt: number): void {
    if (!this.card.visible && !this.isOpen) return;
    const target = this.isOpen ? 1.0 : 0.72;
    this.animScale = THREE.MathUtils.damp(this.animScale, target, 14, dt);
    this.card.scale.setScalar(this.animScale);
    if (!this.isOpen && this.animScale < 0.75) {
      this.card.visible = false;
    }
  }

  syncLoadout(
    equippedPowers: readonly PowerId[],
    bindings: Record<GestureName, PowerId>
  ): void {
    this.equippedSet = new Set(equippedPowers);
    this.bindings = {...bindings};
    this.subtitleText.text = `Equipped: ${this.equippedSet.size} / ${ELEMENTAL_POWERS.length} · Live GestureStateMachine Loadout`;
    this.refreshAllRows();
    this.refreshInspector();
  }

  setActiveTheme(themeId: ElementalThemeId): void {
    const theme = ELEMENTAL_THEMES[themeId];
    this.themeBadgeBtn.label = `Realm: ${theme.name}`;
    this.themeBadgeBtn.style.color = theme.accentHex;
    this.themeBadgeBtn.style.backgroundColor = 'rgba(15, 23, 42, 0.72)';
  }

  private setSchoolFilter(school: SpellSchoolFilter): void {
    this.activeSchool = school;
    for (const [id, btn] of this.schoolButtons.entries()) {
      if (id === school) {
        btn.style.backgroundColor = '#fbbf24';
        btn.style.color = '#0b1020';
      } else {
        btn.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
        btn.style.color = '#e2e8f0';
      }
    }
    for (const spec of ELEMENTAL_POWERS) {
      const widgets = this.catalogRows.get(spec.id);
      if (!widgets) continue;
      widgets.row.visible =
        school === 'all' || SCHOOL_BY_POWER[spec.id] === school;
    }
  }

  selectSpell(powerId: PowerId): void {
    this.inspectedPower = powerId;
    this.refreshAllRows();
    this.refreshInspector();
  }

  private getBoundGestureForPower(powerId: PowerId): GestureName | null {
    for (const g of ALL_SINGLE_HAND_GESTURES) {
      if (this.bindings[g] === powerId) return g;
    }
    return null;
  }

  private getGestureDisplay(spec: ElementalPowerSpec): string {
    if (spec.id === 'plasma-core' || spec.id === 'void-dome') {
      return spec.gestureLabel;
    }
    const g = this.getBoundGestureForPower(spec.id);
    return g ? GESTURE_DISPLAY_LABELS[g] : spec.gestureLabel;
  }

  private cycleInspectedBinding(): void {
    if (
      this.inspectedPower === 'plasma-core' ||
      this.inspectedPower === 'void-dome'
    ) {
      return;
    }
    const cur = this.getBoundGestureForPower(this.inspectedPower);
    const idx = cur ? ALL_SINGLE_HAND_GESTURES.indexOf(cur) : 0;
    const nextGesture =
      ALL_SINGLE_HAND_GESTURES[(idx + 1) % ALL_SINGLE_HAND_GESTURES.length];
    this.callbacks.onRebindGesture(nextGesture, this.inspectedPower);
  }

  private refreshAllRows(): void {
    for (const spec of ELEMENTAL_POWERS) {
      const w = this.catalogRows.get(spec.id);
      if (!w) continue;
      const isEquipped = this.equippedSet.has(spec.id);
      const isSelected = this.inspectedPower === spec.id;
      const boundLabel = this.getGestureDisplay(spec);

      if (isSelected) {
        w.selectBtn.style.backgroundColor = spec.colorHex;
        w.selectBtn.style.color = '#0b1020';
      } else {
        w.selectBtn.style.backgroundColor = isEquipped
          ? 'rgba(255, 255, 255, 0.10)'
          : 'rgba(255, 255, 255, 0.04)';
        w.selectBtn.style.color = isEquipped ? '#f8fafc' : '#64748b';
      }

      w.equipBtn.label = isEquipped ? 'ON' : 'OFF';
      w.equipBtn.style.backgroundColor = isEquipped
        ? 'rgba(52, 211, 153, 0.28)'
        : 'rgba(248, 113, 113, 0.18)';
      w.equipBtn.style.color = isEquipped ? '#34d399' : '#fca5a5';

      w.metaText.text = `${boundLabel} · ${spec.tier} · Key ${spec.hotkey}`;
      w.metaText.style.color = isEquipped ? '#94a3b8' : '#475569';
    }
  }

  private refreshInspector(): void {
    const spec = POWER_BY_ID[this.inspectedPower];
    const isEquipped = this.equippedSet.has(spec.id);
    const isBimanual = spec.id === 'plasma-core' || spec.id === 'void-dome';
    const boundLabel = this.getGestureDisplay(spec);

    this.inspectorAccentBar.style.backgroundColor = spec.colorHex;
    this.inspectorIcon.icon = spec.icon;
    this.inspectorIcon.style.color = spec.colorHex;
    this.inspectorTitle.text = spec.name;
    const realmName = ELEMENTAL_THEMES[POWER_TO_THEME[spec.id]].name;
    this.inspectorTier.text = `${spec.tier} · Realm: ${realmName}`;
    this.inspectorDesc.text = spec.summary;
    this.inspectorBindingText.text = `Active Gesture: ${boundLabel}`;

    this.inspectorStatusText.text = isEquipped
      ? 'Status: Equipped in GestureStateMachine'
      : 'Status: Unequipped (ignored by hand tracking)';
    this.inspectorStatusText.style.color = isEquipped ? '#34d399' : '#f87171';

    this.inspectorEquipBtn.label = isEquipped ? 'Unequip Spell' : 'Equip Spell';
    this.inspectorEquipBtn.icon = isEquipped
      ? 'remove_circle_outline'
      : 'add_circle_outline';
    this.inspectorEquipBtn.style.backgroundColor = isEquipped
      ? 'rgba(248, 113, 113, 0.25)'
      : spec.colorHex;
    this.inspectorEquipBtn.style.color = isEquipped ? '#fecaca' : '#0b1020';

    this.inspectorRebindBtn.disabled = isBimanual;
    this.inspectorRebindBtn.label = isBimanual
      ? 'Bimanual Gesture Fixed'
      : `Rebind Slot (${boundLabel})`;
  }
}
