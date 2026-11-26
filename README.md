<p align="center">
  <img src="public/favicon.svg" alt="Elemental Hand Powers Icon" width="84" height="84" />
</p>

<h1 align="center">Elemental Hand Powers</h1>

<p align="center">
  <strong>A 14-power gesture-driven WebXR elemental sandbox built with XR Blocks, Three.js, Rapier 3D physics, custom GLSL fusion VFX, dynamic elemental realms, Web Audio HRTF sound, and WebXR Gamepad haptics.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/XR_Blocks-0.24.0-4285F4?style=flat-square" alt="XR Blocks 0.24.0" />
  <img src="https://img.shields.io/badge/Three.js-0.186.0-111827?style=flat-square" alt="Three.js 0.186.0" />
  <img src="https://img.shields.io/badge/Rapier_3D-Physics-F97316?style=flat-square" alt="Rapier 3D Physics" />
  <img src="https://img.shields.io/badge/TypeScript-Strict-3178C6?style=flat-square" alt="TypeScript" />
  <img src="https://img.shields.io/badge/WebXR-Hand_Tracking_%26_Haptics-8B5CF6?style=flat-square" alt="WebXR Hand Tracking & Haptics" />
</p>

---

## Overview

**Elemental Hand Powers** turns natural hand poses, bimanual gestures, and head movements into 14 responsive elemental abilities and 8 chainable elemental fusion combos in mixed reality—without requiring a native headset build. Powered by **XR Blocks** (`xrblocks`) and **Vanilla TypeScript**, the experience runs natively in **Chrome 136+ on Android XR** (Samsung Galaxy XR, XREAL Aura) and immediately on **Desktop Chrome** via XR Blocks' built-in Hand Pose Simulator.

Every spell is guarded by a dedicated **hysteresis gesture state machine** with asymmetric confidence bands, dwell timers, silhouette-adjacency guards, optical occlusion recovery, inter-cast cooldowns, and dynamic loadout rebinding driven by an interactive gesture-summoned **Spell Book**.

---

## Key Features

- **14 Elemental Powers Across 3 Input Tiers**
  - **6 Native WebXR Hand Poses** (`open-palm`, `fist`, `point`, `pinch`, `spread`, `thumbs-up`)
  - **5 Custom 25-Joint `XRHand` Poses** (`victory`, `rock`, `shaka`, `finger-gun`, `palm-up`) computed via finger curl, abduction/splay, and palm orientation vectors
  - **2 Bimanual Combos** (`Plasma Fusion Core` with facing open palms; `Void Barrier Dome` with crossed fists/wrists)
  - **Head-Gesture Modifiers** (`Head Nod` to empower & detonate active summons; `Head Shake` to dispel shields, ribbons, and vortices)
- **Elemental Combo & Fusion Particle System (`ElementalComboSystem`)**
  - Chaining distinct elemental spells within a `3.2 s` window triggers **8 named elemental fusion reactions** (plus a **Harmonic Resonance** fallback for any other distinct spell pair), spawning custom GLSL swirling fusion rings, energy cores, radial energy spokes, bespoke 3D particle trajectories (`helix`, `vortex`, `burst-nova`, `shatter-nova`, `blossom`, `implode-burst`), radial AoE physics shockwaves on nearby crystals, and an auto-hiding floating combo callout banner.
- **Gesture-Summoned Spell Book & Live Loadout Rebinding (`SpellBookMenu`)**
  - Hold both hands side-by-side with palms facing upward (**Open Book** gesture, or press `B`) to summon a floating spatial Spell Book. Browse spells by elemental category, equip/unequip individual powers, apply curated presets, test-cast spells, or rebind single-hand gestures in real time—immediately updating `GestureStateMachine`.
- **5 Dynamic Elemental Realms (`ElementalThemeEnvironment`)**
  - Automatically cross-fades sky domes, hemisphere/key/rim lighting, atmospheric fog, procedural landmarks, and ambient particles whenever you equip or select spells across **Volcanic Caldera**, **Frozen Tundra**, **Ancient Ruins**, **Storm Spire**, and **Arcane Sanctum** (or cycle realms manually with `M`). Preserves unobstructed AR passthrough on headsets while retaining perimeter landmarks and atmosphere.
- **Guided Elemental Tutorial (`GuidedTutorialManager`)**
  - First-time interactive walkthrough combining a non-intrusive floating peripheral instruction card with a 3D spatial motion beacon to teach every hand pose, bimanual combo, Spell Book summon, and head modifier step by step (replayable anytime via `T`).
- **Power-Level & Physics-Impact WebXR Gamepad Haptics (`WebXRHapticsEngine`)**
  - Integrates `XRInputSource.gamepad.hapticActuators`, modern dual-rumble `Gamepad.vibrationActuator`, and a `navigator.getGamepads()` fallback. Dynamically scales vibration intensity, duration, and strong/weak motor balance from spell charge duration, elemental power tier, fusion combo chain count, hand-to-object contact velocity, and Rapier 3D projectile impact & wall/floor bounce impulses.
- **Hysteresis Gesture State Machine & Cooldown Guard (`GestureStateMachine`)**
  - 6-phase per-hand FSM (`IDLE → DWELL_ENTER → ACTIVE ↔ OCCLUDED_HOLD → DWELL_EXIT → COOLDOWN`) with asymmetric enter/exit thresholds, per-gesture dwell timers, silhouette-adjacency multipliers, velocity/rotation lockouts, optical jump-spike rejection, live loadout/binding overrides, and configurable per-hand (`450 ms`) / global (`220 ms`) inter-cast cooldowns.
- **Procedural Wrist Charge Pulse (`WristPulseEffect`)**
  - Custom GLSL shader cuff anchored to each wrist whose pulse frequency, displacement amplitude, and color dynamically reflect the live charge state (`idle`, `dwelling`, `charging`, `ready`, `overcharged`, `cooldown`, `occluded`).
- **Real-Time Gesture & Joint Confidence Debug Overlay (`GestureDebugOverlay`)**
  - Toggleable view-space HUD (`D` key or Spellbook button) displaying live FSM phase, active/candidate gesture names, charge/cooldown state, and color-coded raw confidence bars for 7 critical joints (`WRST`, `PALM`, `THMB`, `INDX`, `MIDL`, `RING`, `PNKY`) to diagnose tracking drops in real time.
- **Non-Intrusive Idle Gesture Guide (`IdleGestureGuidePanel`)**
  - Procedurally illustrated floating gesture reference panel that automatically fades in only when the user is idle inside an active XR session and disappears immediately on motion or casting.
- **Procedural GLSL VFX, Rapier 3D Physics & Watertight Office Room (`ElementalVFXSystem`, `ElementalArena`, `OfficeEnvironment`)**
  - Dynamic Rapier rigid-body projectiles with bounce detection, kinematic basalt Earth Shields, orbital vortices, telekinetic lightning tethers, breakable composite crystal clusters, Practice Barrage orbs, real-world XR depth-mesh colliders, and a toggleable (`O`) watertight procedural PBR Office room with acoustic tile ceiling, walnut beams, desk, workstation, and matching static colliders.
- **Spatial HRTF Audio Engine (`SpatialAudioEngine`)**
  - 100% procedural Web Audio API sound synthesis using 3D `PannerNode` HRTF positioning for fireballs, ice shards, rainbow shimmers, lightning arcs, shockwaves, wind vortices, flora chimes, fusion blasts, and shattering crystals.

---

## Elemental Power Matrix (14 Powers)

| # | Power | Default Gesture | Detection Tier | Core Spatial & Physics Mechanic | Hotkey |
| :-: | :--- | :--- | :--- | :--- | :-: |
| 1 | **Fireballs** | Open Palm | Built-in (`open-palm`) | Charges an ember sphere in the palm; launches a dynamic Rapier projectile on release or forward thrust. | `1` |
| 2 | **Rainbow Ribbons** | Peace Sign | Custom `XRHand` (`victory`) | Emits dual additive-blended iridescent trails anchored to index and middle fingertips. | `2` |
| 3 | **Earth Shield** | Closed Fist | Built-in (`fist`) | Tap-to-summon faceted basalt barrier with a kinematic Rapier collider that deflects incoming projectiles. | `3` |
| 4 | **Frost Lance** | Point | Built-in (`point`) | Streams crystalline ice shards from the index fingertip along its distal forward vector. | `4` |
| 5 | **Lightning Tether** | Pinch | Built-in (`pinch`) | Anchors an electric telekinesis tether to physics targets for pulling and flinging. | `5` |
| 6 | **Kinetic Gale** | Finger Spread | Built-in (`spread`) | Releases a radial solar shockwave applying outward Rapier impulses to nearby targets. | `6` |
| 7 | **Sky Updraft** | Thumbs-Up | Built-in (`thumbs-up`) | Spawns buoyant wind vortices that lift and levitate nearby crystals. | `7` |
| 8 | **Chain Lightning** | Rock-On | Custom `XRHand` (`rock`) | Fires branching jagged electric arcs jumping across the closest crystal targets. | `8` |
| 9 | **Tidal Vortex** | Shaka | Custom `XRHand` (`shaka`) | Spawns a swirling water cyclone above the wrist that draws loose rigid bodies into orbit. | `9` |
| 10 | **Magma Bolt** | Finger Gun | Custom `XRHand` (`finger-gun`) | Charges a molten slug at the index tip; an upward wrist flick fires a high-impulse shot. | `0` |
| 11 | **Verdant Flora** | Palm-Up Cup | Custom `XRHand` (`palm-up`) | Grows glowing helical vines and healing crystals upward from an upturned palm. | `-` |
| 12 | **Plasma Fusion Core** | Double Palm Facing | Bimanual (`plasma-core`) | Synthesizes an unstable star between both palms that scales with separation before launching. | `=` |
| 13 | **Void Barrier Dome** | Crossed Wrists | Bimanual (`void-dome`) | Expands a translucent hexagonal arcane dome around the player that freezes incoming projectiles. | `V` |
| 14 | **Empower / Dispel** | Head Nod / Shake | Head Gesture (`head-nod` / `head-shake`) | **Nod** overcharges and detonates active summons; **Shake** shatters shields and clears active trails. | `N` / `X` |

---

## Elemental Fusion Combos

Cast any two distinct elemental powers within **`3.2 seconds`** to ignite a fusion combo and build a chain multiplier (`2x`–`8x`):

| Fusion Combo | Chained Elements | Particle Trajectory & Effect |
| :--- | :--- | :--- |
| **Steam Supernova** | Fireball / Magma Bolt × Frost Lance / Tidal Vortex | Billowing pearlescent steam & ember radial shockwave (`burst-nova`) |
| **Obsidian Cataclysm** | Fireball / Magma Bolt × Earth Shield | Bouncing jagged basalt shards & molten gold shockwave (`shatter-nova`) |
| **Superconduct Storm** | Frost Lance / Tidal Vortex × Chain Lightning / Tether | Swirling cryo-crystal & cobalt-violet lightning cyclone (`vortex`) |
| **Solar Firestorm** | Fireball / Magma Bolt × Kinetic Gale / Sky Updraft | Rising double-helix solar flame vortex (`helix`) |
| **Emerald Monsoon** | Verdant Flora × Tidal Vortex / Sky Updraft / Earth Shield | Spiralling emerald petals & luminous cyan canopy (`blossom`) |
| **Tempest Maelstrom** | Kinetic Gale / Sky Updraft × Chain Lightning / Tether | High-velocity ionized gold-cyan wind funnel (`vortex`) |
| **Prismatic Singularity** | Rainbow Ribbons × Plasma Core / Void Dome / Chain Lightning | Imploding-then-detonating iridescent starlight nova (`implode-burst`) |
| **Eclipse Nova** | Plasma Core × Void Dome / Fireball / Magma Bolt | Astral violet-crimson implosion with high-impulse crystal blast (`implode-burst`) |
| **Harmonic Resonance** | Any other distinct spell pair | Dual-element color-blended shockwave & particle nova (`burst-nova`) |

---

## Dynamic Elemental Realms

Equipping or selecting spells automatically shifts the surrounding procedural environment:

| Realm Theme | Triggering Elements | Atmosphere & Procedural Landmarks |
| :--- | :--- | :--- |
| **Volcanic Caldera** | Fireballs, Magma Bolt | Obsidian basalt monoliths, glowing lava fissures, rising embers |
| **Frozen Tundra** | Frost Lance, Tidal Vortex | Crystalline glacier spires, frosted sky gradient, drifting snow motes |
| **Ancient Ruins** | Earth Shield, Verdant Flora | Moss-draped stone obelisks, arcane plinths, golden fireflies |
| **Storm Spire** | Chain Lightning, Lightning Tether, Kinetic Gale, Sky Updraft | Conductive copper-slate pylons, electric horizon, swirling wind sparks |
| **Arcane Sanctum** | Plasma Fusion Core, Void Barrier Dome, Rainbow Ribbons | Floating starlit obelisk rings, nebula dome, iridescent cosmic motes |

---

## Architecture

### System Data Flow

```text
WebXR XRHand (25 joints) / Head Pose / Controllers / Desktop Simulator
                                 │
                                 ▼
              ┌─────────────────────────────────────┐
              │     ElementalGestureRecognizer      │  25-joint curl, splay, palm
              │   (11 single-hand poses + kinematics)│  normal, fingertip & wrist math
              └──────────────────┬──────────────────┘
                                 │ raw scores + per-joint tracking health
                                 ▼
              ┌─────────────────────────────────────┐
              │         GestureStateMachine         │  Asymmetric thresholds, dwell
              │  (14-power hysteresis, occlusion,   │  timers, silhouette guards,
              │   loadout/rebind & cast cooldowns)  │  Open Book & refractory windows
              └──────────────────┬──────────────────┘
                                 │ validated events + live snapshots
                                 ▼
              ┌─────────────────────────────────────┐
              │          ElementalSandbox           │  Top-level xb.Script
              └──┬───────┬───────┬───────┬───────┬──┘
                 │       │       │       │       │
                 ▼       ▼       ▼       ▼       ▼
             VFX,      Realms,  Spatial  WebXR   Spatial UI
             Fusion &  Arena &  Audio   Gamepad  (Spell Book,
             Wrist     Office   (HRTF)  Haptics  Tutorial, HUD,
             Pulse    (Rapier)  Engine  Engine   Debug, Guide)
```

### Project Structure

```text
.
├── index.html                              # App entry point, OpenGraph meta, and favicon links
├── metadata.json                           # Application title and description manifest
├── package.json                            # Dependencies and npm scripts
├── tsconfig.json                           # Strict TypeScript compiler configuration
├── types.d.ts                              # Ambient module type declarations
├── public/
│   ├── favicon.svg                         # Scalable vector website icon
│   ├── favicon-32x32.png                   # 32x32 PNG browser tab fallback icon
│   └── apple-touch-icon.png                # 180x180 Apple touch home-screen icon
└── src/
    ├── index.ts                            # XR Blocks bootstrap, Rapier & depth mesh setup
    ├── index.css                           # Global styles and Enter XR button styling
    ├── types.ts                            # Shared gesture, hand frame, and power types
    ├── constants.ts                        # 14-power registry, hotkeys, and ergonomic constants
    ├── ElementalSandbox.ts                 # Main xb.Script orchestrating input, physics, VFX & UI
    ├── gestures/
    │   ├── ElementalGestureRecognizer.ts   # Custom 25-joint XRHand classifier & kinematics
    │   └── GestureStateMachine.ts          # 14-power hysteresis, occlusion, loadout & cooldown FSM
    ├── haptics/
    │   └── WebXRHapticsEngine.ts           # Power-level, fusion & physics-impact Gamepad haptics
    ├── vfx/
    │   ├── ElementalVFXSystem.ts           # GLSL shaders, Rapier projectiles, ribbons, arcs & domes
    │   ├── ElementalComboSystem.ts         # 8-recipe elemental fusion VFX, GLSL rings & callout banner
    │   └── WristPulseEffect.ts             # Procedural charge-reactive wrist cuff shader effect
    ├── world/
    │   ├── ElementalArena.ts               # Breakable crystal targets, pedestals & practice barrage
    │   ├── ElementalThemeEnvironment.ts    # 5 dynamic elemental realms with smooth transitions
    │   └── OfficeEnvironment.ts            # Watertight procedural PBR office + Rapier static colliders
    ├── audio/
    │   └── SpatialAudioEngine.ts           # Procedural Web Audio API HRTF synthesizer
    └── ui/
        ├── SpellbookUI.ts                  # Floating quick-cast HUD card & bottom status overlay
        ├── SpellBookMenu.ts                # Gesture-summoned Spell Book for equipping & rebinding
        ├── GuidedTutorialManager.ts        # Interactive floating tutorial & 3D spatial motion beacon
        ├── GestureDebugOverlay.ts          # Real-time gesture & raw joint confidence debug panel
        └── IdleGestureGuidePanel.ts        # Idle-only illustrated hand-gesture reference panel
```

---

## Hysteresis Gesture State Machine & Loadout API

`src/gestures/GestureStateMachine.ts` guards all 14 elemental triggers against noisy optical hand tracking, accidental mid-transition silhouettes (e.g., passing through `point` or `victory` while closing an `open-palm` into a `fist`), and spell spamming, while supporting live spell equipping and gesture rebinding:

- **Asymmetric Hysteresis Bands**: High `enterThreshold` (`0.70–0.84`) prevents unintended activation, while a lower `exitThreshold` (`0.40–0.52`) keeps sustained spells stable through minor jitter.
- **Silhouette-Adjacency Dwell Multipliers**: Dynamically extends entry dwell time (`1.6x–2.5x`) when moving between geometrically close finger silhouettes.
- **Occlusion Hold Recovery**: Validates anchor joints, critical fingertips, and frame-to-frame jump spikes (`> 0.24 m`). If tracking drops mid-cast, the hand enters `OCCLUDED_HOLD` (`260 ms` grace window) before cleanly canceling without misfiring charged projectiles.
- **Inter-Cast Cooldown Enforcement**: Enforces both per-hand (`450 ms` default, `320 ms` minimum floor) and global (`220 ms` default) refractory periods between consecutive casts so procedural VFX and audio resolve cleanly.
- **Dynamic Loadout & Gesture Rebinding**: Toggle individual powers on/off, apply presets, or remap any single-hand gesture to another spell at runtime.

```ts
import {GestureStateMachine} from './src/gestures/GestureStateMachine.ts';

const fsm = new GestureStateMachine();

// Switch global stability preset: 'balanced' | 'strict' | 'responsive'
fsm.setStabilityPreset('strict');

// Tune per-hand and global inter-cast cooldown periods (ms)
fsm.setInterCastCooldown({
  minInterCastMs: 500,
  globalInterCastMs: 250,
});

// Dynamically equip spells or rebind a gesture from the Spell Book
fsm.setEquippedPowers(['fireball', 'frost-lance', 'chain-lightning', 'earth-shield']);
fsm.setGestureBinding('open-palm', 'magma-bolt');

// Subscribe to blocked misfires or loadout updates
const unsubMisfire = fsm.on('misfireblocked', (event) => {
  console.log(`Blocked ${event.candidate} on ${event.side}: ${event.reason}`);
});
const unsubLoadout = fsm.on('loadoutchange', ({equippedPowers}) => {
  console.log(`Equipped spells: ${equippedPowers.length}`);
});
```

---

## Getting Started

### Prerequisites

- **Node.js** `20+` (or **Bun**)
- **Chrome `136+`** for Desktop XR simulation or an **Android XR** device (Samsung Galaxy XR, XREAL Aura) for native WebXR hand tracking

### Local Development

```bash
# 1. Install dependencies
npm install

# 2. Start the Vite dev server on http://localhost:3000
npm run dev

# 3. Type-check with TypeScript
npm run lint

# 4. Build for production (outputs to dist/)
npm run build

# 5. Preview the production bundle locally
npm run preview
```

---

## Controls & Testing

### XR Headsets (Hand Tracking & Controllers)
- Form any of the **11 single-hand gestures** with either hand to cast, and chain two different elements within `3.2 s` to trigger an **Elemental Fusion Combo**.
- Hold both hands side-by-side with palms facing upward (**Open Book**) to summon or dismiss the interactive **Spell Book**.
- Face both open palms toward each other to grow and launch a **Plasma Fusion Core**, or cross both closed-fist wrists in front of your torso to deploy the **Void Barrier Dome**.
- **Nod** your head to empower/detonate active summons, or **Shake** your head to dispel shields, ribbons, and vortices.
- Physically reach out to bat breakable crystals, swat incoming Practice Barrage orbs, or touch surfaces for impulse-scaled WebXR Gamepad haptic feedback.
- Follow the first-time **Guided Tutorial** indicators (or pause casting for `~2.6 s` after completing it to reveal the floating **Idle Gesture Guide**).

### Desktop Chrome Simulator
- Click **Enter Simulator** to launch in **Hand Pose** mode.
- Click any power in the floating **Elemental Spellbook** card to cast immediately, or click/hold in the 3D viewport to charge and launch the selected spell.
- **Keyboard Shortcuts**:
  - `1`–`0`, `-`, `=`, `V`: Select elemental powers 1–13 (automatically attunes the active Elemental Realm)
  - `B`: Open / close the interactive **Spell Book** menu (`Esc` also closes)
  - `T`: Start / pause the **Guided Tutorial**
  - `M`: Cycle the **Elemental Realm** theme (Volcanic Caldera, Frozen Tundra, Ancient Ruins, Storm Spire, Arcane Sanctum)
  - `N`: Trigger **Head Nod** (Empower)
  - `X`: Trigger **Head Shake** (Dispel)
  - `D`: Toggle the **Gesture & Joint Confidence Debug Overlay**
  - `O`: Toggle the procedural **Office Environment**
  - `R`: Reset the sandbox and restore all shattered crystals

---

## Platform Notes & Deployment

- **Supported Targets**: Designed for **Desktop Chrome 136+** (via XR Blocks Simulator) and **Android XR** headsets (Samsung Galaxy XR, XREAL Aura) with WebXR Hand Input and Depth Sensing. Standalone Meta Quest browsers are not officially supported by XR Blocks.
- **Static Hosting**: `npm run build` outputs a self-contained static bundle in `dist/` (including the SVG and PNG favicons from `public/`) ready for deployment on HTTPS hosts (required by WebXR), such as GitHub Pages, Vercel, Netlify, or Cloud Run.

---

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| **XR Framework** | [XR Blocks](https://github.com/google/xrblocks) (`~0.24.0`) |
| **3D Engine & Shaders** | [Three.js](https://threejs.org/) (`~0.186.0`) + Custom GLSL Shaders |
| **Physics Engine** | [Rapier 3D](https://rapier.rs/) (`@dimforge/rapier3d-simd-compat`) |
| **Spatial UI** | XR Blocks Built-in UI (`@pmndrs/uikit`, `troika-three-text`) |
| **Audio & Haptics** | Web Audio API (`PannerNode` HRTF) + WebXR Gamepad Haptic Actuators |
| **Language & Build** | TypeScript (`^7.0.2`) + Vite (`^8.3.0`) |
