import * as THREE from 'three';

import {PowerId} from '../types.ts';
import {ProceduralSkybox} from './ProceduralSkybox.ts';

export type ElementalThemeId =
  | 'volcanic'
  | 'frozen-tundra'
  | 'ancient-ruins'
  | 'storm-citadel'
  | 'arcane-sanctum';

export interface ElementalThemeSpec {
  id: ElementalThemeId;
  name: string;
  subtitle: string;
  accentHex: string;
  skyTopHex: number;
  skyHorizonHex: number;
  skyBottomHex: number;
  fogHex: number;
  fogDensity: number;
  hemiSkyHex: number;
  hemiGroundHex: number;
  hemiIntensity: number;
  keyHex: number;
  keyIntensity: number;
  rimHex: number;
  rimIntensity: number;
  particleColorA: number;
  particleColorB: number;
  particleMotion: 'rise' | 'snow' | 'float' | 'swirl' | 'orbit';
}

export const ELEMENTAL_THEMES: Record<ElementalThemeId, ElementalThemeSpec> = {
  volcanic: {
    id: 'volcanic',
    name: 'Volcanic Caldera',
    subtitle: 'Obsidian spires & molten lava fissures',
    accentHex: '#ff6b2b',
    skyTopHex: 0x160708,
    skyHorizonHex: 0x5c1d12,
    skyBottomHex: 0x1d0907,
    fogHex: 0x260d0a,
    fogDensity: 0.052,
    hemiSkyHex: 0xffb07c,
    hemiGroundHex: 0x451209,
    hemiIntensity: 1.75,
    keyHex: 0xffa66b,
    keyIntensity: 2.45,
    rimHex: 0xff4d1a,
    rimIntensity: 1.35,
    particleColorA: 0xff6b2b,
    particleColorB: 0xfde047,
    particleMotion: 'rise',
  },
  'frozen-tundra': {
    id: 'frozen-tundra',
    name: 'Frozen Tundra',
    subtitle: 'Glacial monoliths & aurora snowfield',
    accentHex: '#38bdf8',
    skyTopHex: 0x091629,
    skyHorizonHex: 0x26547c,
    skyBottomHex: 0x12263a,
    fogHex: 0x142c42,
    fogDensity: 0.044,
    hemiSkyHex: 0xe0f2fe,
    hemiGroundHex: 0x2c4a66,
    hemiIntensity: 2.15,
    keyHex: 0xf0f9ff,
    keyIntensity: 2.35,
    rimHex: 0x38bdf8,
    rimIntensity: 1.25,
    particleColorA: 0xe0f2fe,
    particleColorB: 0x7dd3fc,
    particleMotion: 'snow',
  },
  'ancient-ruins': {
    id: 'ancient-ruins',
    name: 'Ancient Ruins',
    subtitle: 'Mossy sandstone columns & carved runes',
    accentHex: '#d4a373',
    skyTopHex: 0x17252a,
    skyHorizonHex: 0x5d6448,
    skyBottomHex: 0x23261d,
    fogHex: 0x252d24,
    fogDensity: 0.042,
    hemiSkyHex: 0xfff3d6,
    hemiGroundHex: 0x3f4732,
    hemiIntensity: 2.0,
    keyHex: 0xffe4b5,
    keyIntensity: 2.4,
    rimHex: 0x6ee7b7,
    rimIntensity: 1.0,
    particleColorA: 0xfde68a,
    particleColorB: 0x6ee7b7,
    particleMotion: 'float',
  },
  'storm-citadel': {
    id: 'storm-citadel',
    name: 'Storm Spire',
    subtitle: 'Copper lightning conduits & thunderhead sky',
    accentHex: '#818cf8',
    skyTopHex: 0x0b0e20,
    skyHorizonHex: 0x2a3261,
    skyBottomHex: 0x12152a,
    fogHex: 0x131730,
    fogDensity: 0.048,
    hemiSkyHex: 0xc7d2fe,
    hemiGroundHex: 0x1e2242,
    hemiIntensity: 1.85,
    keyHex: 0xe0e7ff,
    keyIntensity: 2.25,
    rimHex: 0x60a5fa,
    rimIntensity: 1.45,
    particleColorA: 0x93c5fd,
    particleColorB: 0xfef08a,
    particleMotion: 'swirl',
  },
  'arcane-sanctum': {
    id: 'arcane-sanctum',
    name: 'Arcane Sanctum',
    subtitle: 'Levitating runic obelisks & astral nebula',
    accentHex: '#c084fc',
    skyTopHex: 0x0d061c,
    skyHorizonHex: 0x3f1d5e,
    skyBottomHex: 0x150a29,
    fogHex: 0x1a0e30,
    fogDensity: 0.046,
    hemiSkyHex: 0xf3e8ff,
    hemiGroundHex: 0x2a1447,
    hemiIntensity: 1.95,
    keyHex: 0xfde7ff,
    keyIntensity: 2.2,
    rimHex: 0xe879f9,
    rimIntensity: 1.4,
    particleColorA: 0xe879f9,
    particleColorB: 0x38bdf8,
    particleMotion: 'orbit',
  },
};

export const THEME_ORDER: readonly ElementalThemeId[] = [
  'volcanic',
  'frozen-tundra',
  'ancient-ruins',
  'storm-citadel',
  'arcane-sanctum',
];

export const POWER_TO_THEME: Record<PowerId, ElementalThemeId> = {
  fireball: 'volcanic',
  'magma-bolt': 'volcanic',
  'plasma-core': 'volcanic',
  'frost-lance': 'frozen-tundra',
  'tidal-vortex': 'frozen-tundra',
  'earth-shield': 'ancient-ruins',
  'verdant-flora': 'ancient-ruins',
  'kinetic-gale': 'ancient-ruins',
  'lightning-tether': 'storm-citadel',
  'chain-lightning': 'storm-citadel',
  'sky-updraft': 'storm-citadel',
  'rainbow-ribbons': 'arcane-sanctum',
  'void-dome': 'arcane-sanctum',
};

/**
 * Resolves the best-matching environmental theme for a set of equipped powers
 * from the Spell Book, breaking ties in favor of the user's preferred/active power.
 */
export function resolveThemeForEquippedPowers(
  equippedPowers: readonly PowerId[],
  preferredPower?: PowerId
): ElementalThemeId {
  if (equippedPowers.length === 0) {
    return preferredPower ? POWER_TO_THEME[preferredPower] : 'ancient-ruins';
  }
  const counts: Record<ElementalThemeId, number> = {
    volcanic: 0,
    'frozen-tundra': 0,
    'ancient-ruins': 0,
    'storm-citadel': 0,
    'arcane-sanctum': 0,
  };
  for (const p of equippedPowers) {
    counts[POWER_TO_THEME[p]] += 1;
  }

  let bestTheme: ElementalThemeId = preferredPower
    ? POWER_TO_THEME[preferredPower]
    : POWER_TO_THEME[equippedPowers[0]];
  let bestCount = -1;

  for (const id of THEME_ORDER) {
    const c = counts[id];
    if (c > bestCount) {
      bestCount = c;
      bestTheme = id;
    } else if (
      c === bestCount &&
      preferredPower &&
      POWER_TO_THEME[preferredPower] === id
    ) {
      bestTheme = id;
    }
  }
  return bestTheme;
}

export interface ThemeLightRig {
  hemi: THREE.HemisphereLight;
  key: THREE.DirectionalLight;
  rim: THREE.DirectionalLight;
}

interface AmbientParticleSlot {
  x: number;
  y: number;
  z: number;
  phase: number;
  speed: number;
  radius: number;
  angle: number;
  scale: number;
}

const _targetColorA = new THREE.Color();
const _targetColorB = new THREE.Color();
const _targetColorC = new THREE.Color();
const _dummy = new THREE.Object3D();
const _instColor = new THREE.Color();

const AMBIENT_PARTICLE_COUNT = 120;

/**
 * Procedural multi-biome Environmental Theme controller for Elemental Hand Powers.
 *
 * Features 5 distinct natural-perimeter 3D worlds (Volcanic Caldera, Frozen Tundra,
 * Ancient Ruins, Storm Spire, Arcane Sanctum) with composite multi-part PBR
 * landmarks, procedural canvas terrain textures, custom gradient sky dome,
 * smooth lighting & fog interpolation, and instanced ambient elemental particles.
 *
 * Automatically switches when the user equips spells or presets in the Spell Book.
 */
export class ElementalThemeEnvironment extends THREE.Group {
  private _enabled = true;
  private _immersiveBackdrop = true;
  private activeThemeId: ElementalThemeId = 'volcanic';

  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly textures: THREE.Texture[] = [];

  // Procedural shader-morphing skybox & synchronized fog/lighting controller
  private readonly skybox: ProceduralSkybox;

  // Per-theme world roots (ground disc + composite perimeter landmarks + outer ridge)
  private readonly themeGroups = new Map<ElementalThemeId, THREE.Group>();
  private readonly themeBlend = new Map<ElementalThemeId, number>();
  private readonly floatingElements: Array<{
    obj: THREE.Object3D;
    baseY: number;
    phase: number;
    amp: number;
    spin: number;
  }> = [];

  // Instanced ambient particles shared across themes (recolored & re-animated live)
  private readonly particleMesh: THREE.InstancedMesh;
  private readonly particleSlots: AmbientParticleSlot[] = [];

  constructor() {
    super();
    this.name = 'Elemental Theme Environment';
    this.xb = {pointerEvents: 'none'};

    // 1. Procedural shader-based morphing skybox (natural horizon, no indoor box walls)
    this.skybox = new ProceduralSkybox(this.activeThemeId);
    this.add(this.skybox);

    // 2. Build all 5 distinct procedural biomes
    this.buildVolcanicTheme();
    this.buildFrozenTundraTheme();
    this.buildAncientRuinsTheme();
    this.buildStormCitadelTheme();
    this.buildArcaneSanctumTheme();

    for (const id of THEME_ORDER) {
      const grp = this.themeGroups.get(id)!;
      const isInit = id === this.activeThemeId;
      this.themeBlend.set(id, isInit ? 1 : 0);
      grp.visible = isInit;
      grp.position.y = isInit ? 0 : -1.2;
      this.add(grp);
    }

    // 3. Instanced ambient particles (embers / snow / pollen / sparks / starlight)
    const particleGeo = this.trackGeo(new THREE.OctahedronGeometry(0.022, 0));
    const particleMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.82,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.particleMesh = new THREE.InstancedMesh(
      particleGeo,
      particleMat,
      AMBIENT_PARTICLE_COUNT
    );
    this.particleMesh.name = 'Elemental Ambient Particles';
    this.particleMesh.frustumCulled = false;
    this.particleMesh.xb = {pointerEvents: 'none'};

    for (let i = 0; i < AMBIENT_PARTICLE_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 1.6 + Math.random() * 6.8;
      this.particleSlots.push({
        x: Math.cos(angle) * radius,
        y: 0.2 + Math.random() * 4.4,
        z: Math.sin(angle) * radius,
        phase: Math.random() * Math.PI * 2,
        speed: 0.35 + Math.random() * 0.75,
        radius,
        angle,
        scale: 0.55 + Math.random() * 1.15,
      });
    }
    this.recolorParticles(ELEMENTAL_THEMES[this.activeThemeId]);
    this.add(this.particleMesh);
  }

  get enabled(): boolean {
    return this._enabled;
  }

  get currentTheme(): ElementalThemeId {
    return this.activeThemeId;
  }

  get currentSpec(): ElementalThemeSpec {
    return ELEMENTAL_THEMES[this.activeThemeId];
  }

  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
    this.visible = enabled;
  }

  /**
   * On AR passthrough devices, keep the opaque sky dome & solid ground disabled
   * so the user's real room remains visible while ambient landmarks & particles
   * accent the perimeter. On desktop simulator / VR, show the full sky & terrain.
   */
  setImmersiveBackdrop(immersive: boolean): void {
    this._immersiveBackdrop = immersive;
    this.skybox.mesh.visible = immersive;
    for (const grp of this.themeGroups.values()) {
      const ground = grp.getObjectByName('theme-ground');
      if (ground) ground.visible = immersive;
    }
  }

  setTheme(themeId: ElementalThemeId): boolean {
    if (this.activeThemeId === themeId) return false;
    this.activeThemeId = themeId;
    this.skybox.transitionTo(themeId);
    this.recolorParticles(ELEMENTAL_THEMES[themeId]);
    return true;
  }

  cycleTheme(): ElementalThemeId {
    const idx = THEME_ORDER.indexOf(this.activeThemeId);
    const next = THEME_ORDER[(idx + 1) % THEME_ORDER.length];
    this.setTheme(next);
    return next;
  }

  update(
    dt: number,
    elapsed: number,
    scene: THREE.Scene,
    lights: ThemeLightRig,
    camera?: THREE.Camera
  ): void {
    const spec = ELEMENTAL_THEMES[this.activeThemeId];

    // 1 & 2. Advance shader-based skybox morph, horizon fog, and synchronized 3-point lighting
    this.skybox.update(
      dt,
      elapsed,
      scene,
      lights,
      this._enabled,
      this._immersiveBackdrop,
      camera
    );

    if (!this._enabled) return;

    // 3. Smoothly raise active biome landmarks & lower outgoing biome landmarks
    for (const id of THEME_ORDER) {
      const grp = this.themeGroups.get(id)!;
      const target = id === this.activeThemeId ? 1 : 0;
      const cur = this.themeBlend.get(id) ?? 0;
      const next = THREE.MathUtils.damp(cur, target, 4.5, dt);
      this.themeBlend.set(id, next);

      if (next < 0.015) {
        grp.visible = false;
      } else {
        grp.visible = true;
        // Ground stays flush once mostly settled; sinks subtly while transitioning
        grp.position.y = (next - 1) * 1.15;
        const s = 0.85 + 0.15 * next;
        grp.scale.set(1, s, 1);
      }
    }

    // 4. Animate floating arcane monoliths, astrolabe rings & storm coils
    for (const item of this.floatingElements) {
      item.obj.position.y =
        item.baseY + Math.sin(elapsed * 1.45 + item.phase) * item.amp;
      if (item.spin !== 0) {
        item.obj.rotation.y += item.spin * dt;
      }
    }

    // 5. Update instanced ambient elemental particles (zero GC allocations)
    const motion = spec.particleMotion;
    for (let i = 0; i < AMBIENT_PARTICLE_COUNT; i++) {
      const slot = this.particleSlots[i];
      if (motion === 'rise') {
        slot.y += slot.speed * 0.72 * dt;
        slot.x += Math.sin(elapsed * 1.2 + slot.phase) * 0.15 * dt;
        if (slot.y > 4.6) slot.y = 0.15;
      } else if (motion === 'snow') {
        slot.y -= slot.speed * 0.52 * dt;
        slot.x += Math.sin(elapsed * 0.9 + slot.phase) * 0.28 * dt;
        slot.z += Math.cos(elapsed * 0.7 + slot.phase) * 0.2 * dt;
        if (slot.y < 0.08) slot.y = 4.6;
      } else if (motion === 'float') {
        slot.y += Math.sin(elapsed * 0.8 + slot.phase) * 0.16 * dt;
        slot.angle += slot.speed * 0.08 * dt;
        slot.x = Math.cos(slot.angle) * slot.radius;
        slot.z = Math.sin(slot.angle) * slot.radius;
      } else if (motion === 'swirl') {
        slot.angle += slot.speed * 0.48 * dt;
        slot.x = Math.cos(slot.angle) * slot.radius;
        slot.z = Math.sin(slot.angle) * slot.radius;
        slot.y = 0.4 + ((slot.y + slot.speed * 0.4 * dt) % 4.1);
      } else {
        // orbit / astral rise
        slot.angle -= slot.speed * 0.24 * dt;
        slot.x = Math.cos(slot.angle) * slot.radius;
        slot.z = Math.sin(slot.angle) * slot.radius;
        slot.y += Math.sin(elapsed * 1.4 + slot.phase) * 0.22 * dt;
      }

      const twinkle =
        0.65 + 0.35 * Math.sin(elapsed * 3.1 + slot.phase * 2.0);
      _dummy.position.set(slot.x, slot.y, slot.z);
      _dummy.rotation.set(
        elapsed * 0.9 + slot.phase,
        elapsed * 1.1 + slot.phase,
        0
      );
      _dummy.scale.setScalar(slot.scale * twinkle);
      _dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
  }

  private recolorParticles(spec: ElementalThemeSpec): void {
    _targetColorA.setHex(spec.particleColorA);
    _targetColorB.setHex(spec.particleColorB);
    for (let i = 0; i < AMBIENT_PARTICLE_COUNT; i++) {
      const t = (i * 0.6180339) % 1;
      _instColor.copy(_targetColorA).lerp(_targetColorB, t);
      this.particleMesh.setColorAt(i, _instColor);
    }
    if (this.particleMesh.instanceColor) {
      this.particleMesh.instanceColor.needsUpdate = true;
    }
  }

  // ---------------- Theme Builders (Composite Multi-Part Procedural Landmarks) ----------------

  private createGroundDisc(
    texture: THREE.CanvasTexture,
    roughness: number,
    metalness: number,
    emissiveHex = 0x000000,
    emissiveIntensity = 0,
    emissiveMap?: THREE.CanvasTexture
  ): THREE.Mesh {
    const geo = this.trackGeo(new THREE.CircleGeometry(18, 48));
    const mat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: texture,
        roughness,
        metalness,
        emissive: emissiveHex,
        emissiveIntensity,
        emissiveMap,
      })
    );
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'theme-ground';
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = -0.005;
    mesh.receiveShadow = true;
    mesh.xb = {pointerEvents: 'none'};
    return mesh;
  }

  private buildVolcanicTheme(): void {
    const root = new THREE.Group();
    root.name = 'Theme: Volcanic Caldera';
    root.xb = {pointerEvents: 'none'};

    // Procedural cracked obsidian floor with glowing magma fissures
    const {albedo, emissive} = this.createVolcanicFloorTextures();
    root.add(this.createGroundDisc(albedo, 0.88, 0.14, 0xff5a1f, 1.35, emissive));

    const basaltMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x221c1d,
        roughness: 0.9,
        metalness: 0.12,
        flatShading: true,
      })
    );
    const scorchedMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x3b2622,
        roughness: 0.62,
        metalness: 0.35,
        flatShading: true,
      })
    );
    const lavaMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xff6b2b,
        emissive: 0xff4500,
        emissiveIntensity: 2.2,
        roughness: 0.25,
        metalness: 0.1,
      })
    );

    const baseGeo = this.trackGeo(new THREE.CylinderGeometry(0.68, 1.05, 0.45, 7));
    const spireGeo = this.trackGeo(new THREE.CylinderGeometry(0.18, 0.52, 2.55, 6));
    const flankGeo = this.trackGeo(new THREE.ConeGeometry(0.32, 1.35, 5));
    const rimGeo = this.trackGeo(new THREE.TorusGeometry(0.46, 0.08, 6, 12));
    const coreGeo = this.trackGeo(new THREE.CylinderGeometry(0.34, 0.38, 0.18, 8));

    // 7 composite basalt caldera spires around the natural perimeter (4.2m–6.2m out)
    const count = 7;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + 0.32;
      const dist = 4.35 + (i % 2) * 1.45;
      const spire = new THREE.Group();
      spire.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
      spire.rotation.y = angle + Math.PI * 0.5;
      const heightScale = 0.85 + (i % 3) * 0.32;

      // Part 1: Stepped obsidian mound base (bottom-center flush at y=0)
      const base = new THREE.Mesh(baseGeo, basaltMat);
      base.position.y = 0.225;
      base.castShadow = true;
      base.receiveShadow = true;
      spire.add(base);

      // Part 2: Primary tilted jagged volcanic spire
      const col = new THREE.Mesh(spireGeo, basaltMat);
      col.position.set(0.14, 1.25 * heightScale, 0);
      col.scale.set(1, heightScale, 1);
      col.rotation.z = -0.09;
      col.castShadow = true;
      spire.add(col);

      // Part 3 & 4: Flanking basalt shards with varied roughness
      const flankA = new THREE.Mesh(flankGeo, scorchedMat);
      flankA.position.set(-0.48, 0.65, 0.24);
      flankA.rotation.z = 0.22;
      spire.add(flankA);

      const flankB = new THREE.Mesh(flankGeo, scorchedMat);
      flankB.position.set(0.52, 0.55, -0.22);
      flankB.scale.setScalar(0.8);
      flankB.rotation.z = -0.26;
      spire.add(flankB);

      // Part 5 & 6: Glowing lava vent rim & magma pool collar
      const rim = new THREE.Mesh(rimGeo, scorchedMat);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(-0.22, 0.44, 0.12);
      spire.add(rim);

      const core = new THREE.Mesh(coreGeo, lavaMat);
      core.position.set(-0.22, 0.38, 0.12);
      spire.add(core);

      root.add(spire);
    }

    // Outer distant volcanic ridge ring so horizon blends naturally into fog
    this.addOuterHorizonRidge(root, 12.5, 16, 2.8, basaltMat, 0.35);

    this.themeGroups.set('volcanic', root);
  }

  private buildFrozenTundraTheme(): void {
    const root = new THREE.Group();
    root.name = 'Theme: Frozen Tundra';
    root.xb = {pointerEvents: 'none'};

    const snowTex = this.createSnowIceFloorTexture();
    root.add(this.createGroundDisc(snowTex, 0.48, 0.18, 0x0c4a6e, 0.18));

    const snowMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xdbeafe,
        roughness: 0.85,
        metalness: 0.05,
        flatShading: true,
      })
    );
    const glacierMat = this.trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0x7dd3fc,
        emissive: 0x0369a1,
        emissiveIntensity: 0.32,
        roughness: 0.14,
        metalness: 0.12,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1,
        flatShading: true,
      })
    );
    const iceShardMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xe0f2fe,
        emissive: 0x38bdf8,
        emissiveIntensity: 0.65,
        roughness: 0.18,
        metalness: 0.25,
        flatShading: true,
      })
    );

    const driftGeo = this.trackGeo(new THREE.CylinderGeometry(0.8, 1.25, 0.34, 8));
    const monolithGeo = this.trackGeo(new THREE.ConeGeometry(0.46, 2.85, 6));
    const shardGeo = this.trackGeo(new THREE.ConeGeometry(0.22, 1.5, 5));
    const crystalRingGeo = this.trackGeo(new THREE.TorusGeometry(0.55, 0.045, 5, 6));

    const count = 7;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + 0.12;
      const dist = 4.3 + (i % 2) * 1.35;
      const cluster = new THREE.Group();
      cluster.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
      cluster.rotation.y = angle;
      const s = 0.85 + (i % 3) * 0.26;

      // Part 1: Packed snowdrift base
      const drift = new THREE.Mesh(driftGeo, snowMat);
      drift.position.y = 0.17;
      drift.receiveShadow = true;
      cluster.add(drift);

      // Part 2: Primary glacial monolith spire
      const monolith = new THREE.Mesh(monolithGeo, glacierMat);
      monolith.position.y = 1.42 * s;
      monolith.scale.set(1, s, 1);
      monolith.rotation.z = 0.08;
      monolith.castShadow = true;
      cluster.add(monolith);

      // Part 3 & 4: Twin angled ice crystal shards
      const shardA = new THREE.Mesh(shardGeo, iceShardMat);
      shardA.position.set(-0.46, 0.72, 0.22);
      shardA.rotation.set(0.18, 0.4, 0.28);
      cluster.add(shardA);

      const shardB = new THREE.Mesh(shardGeo, iceShardMat);
      shardB.position.set(0.42, 0.62, -0.2);
      shardB.scale.setScalar(0.78);
      shardB.rotation.set(-0.15, 0.2, -0.32);
      cluster.add(shardB);

      // Part 5: Frosted hexagonal ice halo collar
      const halo = new THREE.Mesh(crystalRingGeo, iceShardMat);
      halo.rotation.x = Math.PI / 2;
      halo.position.y = 0.48;
      cluster.add(halo);

      root.add(cluster);
    }

    // Distant jagged alpine peaks
    this.addOuterHorizonRidge(root, 12.8, 18, 3.2, snowMat, 0.42);

    this.themeGroups.set('frozen-tundra', root);
  }

  private buildAncientRuinsTheme(): void {
    const root = new THREE.Group();
    root.name = 'Theme: Ancient Ruins';
    root.xb = {pointerEvents: 'none'};

    const stoneTex = this.createRuinsFloorTexture();
    root.add(this.createGroundDisc(stoneTex, 0.84, 0.08, 0x14532d, 0.16));

    const stoneMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xa89f8c,
        roughness: 0.9,
        metalness: 0.06,
        flatShading: true,
      })
    );
    const weatheredMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x7a7363,
        roughness: 0.82,
        metalness: 0.12,
        flatShading: true,
      })
    );
    const mossMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x3b7a57,
        roughness: 0.92,
        metalness: 0.02,
      })
    );
    const runeGoldMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xeab308,
        emissive: 0x34d399,
        emissiveIntensity: 0.85,
        roughness: 0.28,
        metalness: 0.85,
      })
    );

    const plinthGeo = this.trackGeo(new THREE.BoxGeometry(0.95, 0.32, 0.95));
    const stepGeo = this.trackGeo(new THREE.BoxGeometry(0.76, 0.2, 0.76));
    const shaftGeo = this.trackGeo(new THREE.CylinderGeometry(0.24, 0.28, 2.15, 10));
    const capitalGeo = this.trackGeo(new THREE.BoxGeometry(0.72, 0.22, 0.72));
    const runeBandGeo = this.trackGeo(new THREE.TorusGeometry(0.275, 0.032, 8, 20));
    const mossGeo = this.trackGeo(new THREE.DodecahedronGeometry(0.24, 0));

    const count = 6;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + 0.52;
      const dist = 4.45 + (i % 2) * 0.9;
      const pillar = new THREE.Group();
      pillar.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
      pillar.rotation.y = angle;

      // Part 1 & 2: Two-tier weathered stone plinth
      const plinth = new THREE.Mesh(plinthGeo, weatheredMat);
      plinth.position.y = 0.16;
      plinth.castShadow = true;
      plinth.receiveShadow = true;
      pillar.add(plinth);

      const step = new THREE.Mesh(stepGeo, stoneMat);
      step.position.y = 0.42;
      pillar.add(step);

      // Part 3: Fluted stone column shaft (alternating tall intact vs broken ancient column)
      const isBroken = i % 2 === 1;
      const shaftScaleY = isBroken ? 0.68 : 1.0;
      const shaft = new THREE.Mesh(shaftGeo, stoneMat);
      shaft.scale.set(1, shaftScaleY, 1);
      shaft.position.y = 0.52 + (2.15 * shaftScaleY) / 2;
      shaft.castShadow = true;
      pillar.add(shaft);

      // Part 4: Carved capital or angled broken lintel block
      const capital = new THREE.Mesh(capitalGeo, weatheredMat);
      capital.position.y = 0.52 + 2.15 * shaftScaleY + 0.08;
      if (isBroken) capital.rotation.set(0.18, 0.25, 0.22);
      pillar.add(capital);

      // Part 5: Glowing inlaid gold/emerald arcane rune collar
      const runeBand = new THREE.Mesh(runeBandGeo, runeGoldMat);
      runeBand.rotation.x = Math.PI / 2;
      runeBand.position.y = 1.28;
      pillar.add(runeBand);

      // Part 6: Creeping moss cluster at plinth corner
      const moss = new THREE.Mesh(mossGeo, mossMat);
      moss.position.set(0.32, 0.34, 0.28);
      moss.scale.set(1.2, 0.65, 1.0);
      pillar.add(moss);

      root.add(pillar);
    }

    this.addOuterHorizonRidge(root, 12.6, 14, 2.2, weatheredMat, 0.25);

    this.themeGroups.set('ancient-ruins', root);
  }

  private buildStormCitadelTheme(): void {
    const root = new THREE.Group();
    root.name = 'Theme: Storm Spire';
    root.xb = {pointerEvents: 'none'};

    const deckTex = this.createStormFloorTexture();
    root.add(this.createGroundDisc(deckTex, 0.56, 0.36, 0x312e81, 0.35));

    const slateMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x262b44,
        roughness: 0.72,
        metalness: 0.35,
        flatShading: true,
      })
    );
    const copperMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xb87333,
        roughness: 0.26,
        metalness: 0.92,
      })
    );
    const arcOrbMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x93c5fd,
        emissive: 0x60a5fa,
        emissiveIntensity: 2.0,
        roughness: 0.15,
        metalness: 0.4,
      })
    );

    const baseGeo = this.trackGeo(new THREE.CylinderGeometry(0.55, 0.78, 0.36, 8));
    const mastGeo = this.trackGeo(new THREE.CylinderGeometry(0.09, 0.18, 2.65, 8));
    const coilGeo = this.trackGeo(new THREE.TorusGeometry(0.32, 0.042, 8, 18));
    const prongGeo = this.trackGeo(new THREE.BoxGeometry(0.07, 0.85, 0.07));
    const orbGeo = this.trackGeo(new THREE.OctahedronGeometry(0.2, 1));

    const count = 6;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + 0.25;
      const dist = 4.5 + (i % 2) * 1.1;
      const pylon = new THREE.Group();
      pylon.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
      pylon.rotation.y = angle;

      // Part 1: Octagonal slate foundation
      const base = new THREE.Mesh(baseGeo, slateMat);
      base.position.y = 0.18;
      base.castShadow = true;
      base.receiveShadow = true;
      pylon.add(base);

      // Part 2: Tapered conductor mast
      const mast = new THREE.Mesh(mastGeo, slateMat);
      mast.position.y = 1.65;
      mast.castShadow = true;
      pylon.add(mast);

      // Part 3 & 4: Twin copper Tesla insulator rings
      const coilLow = new THREE.Mesh(coilGeo, copperMat);
      coilLow.rotation.x = Math.PI / 2;
      coilLow.position.y = 1.55;
      pylon.add(coilLow);

      const coilHigh = new THREE.Mesh(coilGeo, copperMat);
      coilHigh.rotation.x = Math.PI / 2;
      coilHigh.scale.setScalar(0.8);
      coilHigh.position.y = 2.15;
      pylon.add(coilHigh);

      // Part 5: Twin vertical copper conductor prongs
      const prongL = new THREE.Mesh(prongGeo, copperMat);
      prongL.position.set(-0.24, 2.55, 0);
      prongL.rotation.z = 0.14;
      pylon.add(prongL);

      const prongR = new THREE.Mesh(prongGeo, copperMat);
      prongR.position.set(0.24, 2.55, 0);
      prongR.rotation.z = -0.14;
      pylon.add(prongR);

      // Part 6: Levitating storm crown orb
      const orb = new THREE.Mesh(orbGeo, arcOrbMat);
      orb.position.y = 3.05;
      pylon.add(orb);
      this.floatingElements.push({
        obj: orb,
        baseY: 3.05,
        phase: i * 1.1,
        amp: 0.09,
        spin: 1.4,
      });

      root.add(pylon);
    }

    this.addOuterHorizonRidge(root, 12.8, 16, 2.6, slateMat, 0.3);

    this.themeGroups.set('storm-citadel', root);
  }

  private buildArcaneSanctumTheme(): void {
    const root = new THREE.Group();
    root.name = 'Theme: Arcane Sanctum';
    root.xb = {pointerEvents: 'none'};

    const astralTex = this.createArcaneFloorTexture();
    root.add(this.createGroundDisc(astralTex, 0.34, 0.42, 0x7e22ce, 0.55));

    const obsidianMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x1e1338,
        roughness: 0.35,
        metalness: 0.55,
        flatShading: true,
      })
    );
    const goldMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xf5d08c,
        roughness: 0.22,
        metalness: 0.94,
      })
    );
    const prismMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xe879f9,
        emissive: 0xa855f7,
        emissiveIntensity: 1.45,
        roughness: 0.16,
        metalness: 0.35,
        flatShading: true,
      })
    );

    const daisGeo = this.trackGeo(new THREE.CylinderGeometry(0.54, 0.68, 0.24, 6));
    const obeliskGeo = this.trackGeo(new THREE.CylinderGeometry(0.14, 0.3, 1.85, 6));
    const apexGeo = this.trackGeo(new THREE.OctahedronGeometry(0.26, 0));
    const ringGeo = this.trackGeo(new THREE.TorusGeometry(0.48, 0.028, 8, 28));

    const count = 6;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + 0.08;
      const dist = 4.4 + (i % 2) * 1.15;
      const monument = new THREE.Group();
      monument.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
      monument.rotation.y = angle;

      // Part 1: Grounded hexagonal astral dais
      const dais = new THREE.Mesh(daisGeo, obsidianMat);
      dais.position.y = 0.12;
      dais.receiveShadow = true;
      monument.add(dais);

      // Part 2: Floating obsidian runic obelisk
      const floater = new THREE.Group();
      floater.position.y = 1.48;
      const obelisk = new THREE.Mesh(obeliskGeo, obsidianMat);
      obelisk.castShadow = true;
      floater.add(obelisk);

      // Part 3: Prismatic apex crystal
      const apex = new THREE.Mesh(apexGeo, prismMat);
      apex.position.y = 1.18;
      floater.add(apex);

      // Part 4 & 5: Crossed gilded astrolabe rings
      const ringA = new THREE.Mesh(ringGeo, goldMat);
      ringA.rotation.x = Math.PI * 0.35;
      floater.add(ringA);

      const ringB = new THREE.Mesh(ringGeo, goldMat);
      ringB.rotation.z = Math.PI * 0.35;
      ringB.scale.setScalar(0.84);
      floater.add(ringB);

      monument.add(floater);
      this.floatingElements.push({
        obj: floater,
        baseY: 1.48 + (i % 2) * 0.25,
        phase: i * 1.05,
        amp: 0.16,
        spin: i % 2 === 0 ? 0.32 : -0.32,
      });

      root.add(monument);
    }

    this.addOuterHorizonRidge(root, 13.0, 14, 2.5, obsidianMat, 0.3);

    this.themeGroups.set('arcane-sanctum', root);
  }

  private addOuterHorizonRidge(
    parent: THREE.Group,
    radius: number,
    segments: number,
    height: number,
    mat: THREE.Material,
    jaggedness: number
  ): void {
    const ridgeGeo = this.trackGeo(new THREE.ConeGeometry(2.4, height, 5));
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const r = radius + Math.sin(i * 2.7) * 1.4;
      const peak = new THREE.Mesh(ridgeGeo, mat);
      const scaleY = 0.65 + ((i * 37) % 10) * 0.08 + jaggedness * Math.abs(Math.sin(i * 1.9));
      const scaleXZ = 0.9 + ((i * 19) % 7) * 0.14;
      peak.scale.set(scaleXZ, scaleY, scaleXZ);
      peak.position.set(
        Math.cos(a) * r,
        (height * scaleY) / 2 - 0.12,
        Math.sin(a) * r
      );
      peak.rotation.y = a + i * 0.6;
      peak.xb = {pointerEvents: 'none'};
      parent.add(peak);
    }
  }

  // ---------------- Procedural Canvas Textures (Zero 404s, SRGBColorSpace) ----------------

  private createVolcanicFloorTextures(): {
    albedo: THREE.CanvasTexture;
    emissive: THREE.CanvasTexture;
  } {
    const aCanvas = document.createElement('canvas');
    aCanvas.width = 512;
    aCanvas.height = 512;
    const actx = aCanvas.getContext('2d')!;

    const eCanvas = document.createElement('canvas');
    eCanvas.width = 512;
    eCanvas.height = 512;
    const ectx = eCanvas.getContext('2d')!;

    actx.fillStyle = '#1f191a';
    actx.fillRect(0, 0, 512, 512);
    ectx.fillStyle = '#000000';
    ectx.fillRect(0, 0, 512, 512);

    // Subtle basalt rock mottling
    for (let i = 0; i < 240; i++) {
      const x = (i * 97) % 512;
      const y = (i * 193) % 512;
      const r = 10 + (i % 24);
      actx.fillStyle = i % 2 === 0 ? 'rgba(48, 36, 34, 0.35)' : 'rgba(14, 10, 10, 0.35)';
      actx.beginPath();
      actx.arc(x, y, r, 0, Math.PI * 2);
      actx.fill();
    }

    // Glowing magma fissure veins
    for (let v = 0; v < 14; v++) {
      let x = (v * 73) % 512;
      let y = (v * 41) % 512;
      actx.strokeStyle = '#ff6b2b';
      actx.lineWidth = 3.5;
      ectx.strokeStyle = '#ff8c3a';
      ectx.lineWidth = 4.5;
      actx.beginPath();
      ectx.beginPath();
      actx.moveTo(x, y);
      ectx.moveTo(x, y);
      for (let s = 0; s < 7; s++) {
        x += Math.cos(v + s * 1.3) * 44;
        y += Math.sin(v * 0.7 + s * 1.1) * 44;
        actx.lineTo(x, y);
        ectx.lineTo(x, y);
      }
      actx.stroke();
      ectx.stroke();
    }

    const albedo = this.wrapTexture(aCanvas, 5, 5);
    const emissive = this.wrapTexture(eCanvas, 5, 5);
    return {albedo, emissive};
  }

  private createSnowIceFloorTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#cbdcf0';
    ctx.fillRect(0, 0, 512, 512);

    // Glacial wind drifts & icy patches
    for (let i = 0; i < 65; i++) {
      const x = (i * 89) % 512;
      const y = (i * 151) % 512;
      const grad = ctx.createRadialGradient(x, y, 4, x, y, 46);
      grad.addColorStop(0, i % 3 === 0 ? 'rgba(125, 211, 252, 0.42)' : 'rgba(241, 245, 249, 0.5)');
      grad.addColorStop(1, 'rgba(203, 220, 240, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, 46, 0, Math.PI * 2);
      ctx.fill();
    }

    // Fine crystalline ice cracks
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
    ctx.lineWidth = 1.6;
    for (let c = 0; c < 18; c++) {
      let x = (c * 113) % 512;
      let y = (c * 67) % 512;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let s = 0; s < 5; s++) {
        x += Math.cos(c * 1.7 + s) * 32;
        y += Math.sin(c * 1.1 + s * 1.4) * 32;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    return this.wrapTexture(canvas, 5, 5);
  }

  private createRuinsFloorTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#736c5e';
    ctx.fillRect(0, 0, 512, 512);

    // Flagstone temple slabs with mossy mortar joints
    const step = 64;
    for (let gy = 0; gy < 8; gy++) {
      for (let gx = 0; gx < 8; gx++) {
        const shade = 116 + ((gx * 13 + gy * 29) % 24);
        ctx.fillStyle = `rgb(${shade + 8}, ${shade + 2}, ${shade - 12})`;
        const ox = (gy % 2) * 32;
        ctx.fillRect((gx * step + ox) % 512 + 2, gy * step + 2, step - 4, step - 4);
      }
    }

    // Subtle moss accents along seams
    for (let m = 0; m < 45; m++) {
      const x = ((m * 127) % 8) * step;
      const y = (m * 71) % 512;
      ctx.fillStyle = 'rgba(52, 122, 82, 0.45)';
      ctx.beginPath();
      ctx.arc(x, y, 8 + (m % 10), 0, Math.PI * 2);
      ctx.fill();
    }

    // Carved circular sanctuary ring motif
    ctx.strokeStyle = 'rgba(234, 179, 8, 0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(256, 256, 170, 0, Math.PI * 2);
    ctx.stroke();

    return this.wrapTexture(canvas, 4, 4);
  }

  private createStormFloorTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#1b1f36';
    ctx.fillRect(0, 0, 512, 512);

    // Slate metallic tiles & copper conductor lines
    ctx.strokeStyle = 'rgba(184, 115, 51, 0.42)';
    ctx.lineWidth = 3;
    for (let i = 0; i <= 512; i += 128) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 512);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(512, i);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(96, 165, 250, 0.36)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(256, 256, 180, 0, Math.PI * 2);
    ctx.stroke();

    return this.wrapTexture(canvas, 5, 5);
  }

  private createArcaneFloorTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#140c26';
    ctx.fillRect(0, 0, 512, 512);

    // Astral starlight speckles
    for (let i = 0; i < 120; i++) {
      const x = (i * 137) % 512;
      const y = (i * 223) % 512;
      ctx.fillStyle = i % 3 === 0 ? 'rgba(232, 121, 249, 0.45)' : 'rgba(196, 181, 253, 0.38)';
      ctx.beginPath();
      ctx.arc(x, y, 1.5 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }

    // Sacred hexagonal rune rings
    ctx.strokeStyle = 'rgba(192, 132, 252, 0.42)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(256, 256, 200, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const px = 256 + Math.cos(a) * 185;
      const py = 256 + Math.sin(a) * 185;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();

    return this.wrapTexture(canvas, 4, 4);
  }

  private wrapTexture(
    canvas: HTMLCanvasElement,
    repeatX: number,
    repeatY: number
  ): THREE.CanvasTexture {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    this.textures.push(tex);
    return tex;
  }

  private trackGeo<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.push(g);
    return g;
  }

  private trackMat<T extends THREE.Material>(m: T): T {
    this.materials.push(m);
    return m;
  }

  dispose(): void {
    this.skybox.dispose();
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
    this.geometries.length = 0;
    this.materials.length = 0;
    this.textures.length = 0;
  }
}
