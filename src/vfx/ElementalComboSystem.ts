import * as THREE from 'three';
import * as xb from 'xrblocks';

import {POWER_BY_ID} from '../constants.ts';
import {HandSide, PowerId} from '../types.ts';

export type FusionMotionMode =
  | 'burst-nova'
  | 'shatter-nova'
  | 'vortex'
  | 'helix'
  | 'blossom'
  | 'implode-burst';

export interface ElementalComboRecipe {
  id: string;
  name: string;
  subtitle: string;
  groupA: readonly PowerId[];
  groupB: readonly PowerId[];
  primaryColor: number;
  secondaryColor: number;
  accentHex: string;
  motion: FusionMotionMode;
  aoeRadius: number;
  aoeImpulse: number;
  aoeDamage: number;
  ringScale: number;
  particleCount: number;
}

export interface FusionComboTrigger {
  recipe: ElementalComboRecipe;
  firstPower: PowerId;
  secondPower: PowerId;
  origin: THREE.Vector3;
  chainCount: number;
}

export const ELEMENTAL_COMBO_RECIPES: readonly ElementalComboRecipe[] = [
  {
    id: 'steam-supernova',
    name: 'STEAM SUPERNOVA',
    subtitle: 'Thermal Shatter · Fire × Ice/Water',
    groupA: ['fireball', 'magma-bolt'],
    groupB: ['frost-lance', 'tidal-vortex'],
    primaryColor: 0xe0f2fe,
    secondaryColor: 0xff7b29,
    accentHex: '#7dd3fc',
    motion: 'burst-nova',
    aoeRadius: 3.4,
    aoeImpulse: 3.1,
    aoeDamage: 48,
    ringScale: 2.35,
    particleCount: 54,
  },
  {
    id: 'obsidian-cataclysm',
    name: 'OBSIDIAN CATACLYSM',
    subtitle: 'Tectonic Forging · Fire/Magma × Earth',
    groupA: ['fireball', 'magma-bolt'],
    groupB: ['earth-shield'],
    primaryColor: 0xf59e0b,
    secondaryColor: 0x57534e,
    accentHex: '#fbbf24',
    motion: 'shatter-nova',
    aoeRadius: 3.6,
    aoeImpulse: 3.6,
    aoeDamage: 62,
    ringScale: 2.45,
    particleCount: 56,
  },
  {
    id: 'superconduct-storm',
    name: 'SUPERCONDUCT STORM',
    subtitle: 'Cryo-Arc Surge · Frost/Tide × Lightning',
    groupA: ['frost-lance', 'tidal-vortex'],
    groupB: ['chain-lightning', 'lightning-tether'],
    primaryColor: 0x38bdf8,
    secondaryColor: 0xa78bfa,
    accentHex: '#a78bfa',
    motion: 'vortex',
    aoeRadius: 3.5,
    aoeImpulse: 2.8,
    aoeDamage: 54,
    ringScale: 2.25,
    particleCount: 56,
  },
  {
    id: 'solar-firestorm',
    name: 'SOLAR FIRESTORM',
    subtitle: 'Ignited Cyclone · Fire/Magma × Wind',
    groupA: ['fireball', 'magma-bolt'],
    groupB: ['kinetic-gale', 'sky-updraft'],
    primaryColor: 0xfde047,
    secondaryColor: 0xef4444,
    accentHex: '#fde047',
    motion: 'helix',
    aoeRadius: 3.7,
    aoeImpulse: 3.4,
    aoeDamage: 56,
    ringScale: 2.5,
    particleCount: 60,
  },
  {
    id: 'emerald-monsoon',
    name: 'EMERALD MONSOON',
    subtitle: 'Living Tempest · Flora × Water/Wind/Earth',
    groupA: ['verdant-flora'],
    groupB: ['tidal-vortex', 'sky-updraft', 'earth-shield'],
    primaryColor: 0x34d399,
    secondaryColor: 0x22d3ee,
    accentHex: '#34d399',
    motion: 'blossom',
    aoeRadius: 3.2,
    aoeImpulse: 2.4,
    aoeDamage: 42,
    ringScale: 2.2,
    particleCount: 52,
  },
  {
    id: 'tempest-maelstrom',
    name: 'TEMPEST MAELSTROM',
    subtitle: 'Ionized Gale · Wind × Lightning',
    groupA: ['kinetic-gale', 'sky-updraft'],
    groupB: ['chain-lightning', 'lightning-tether'],
    primaryColor: 0x67e8f9,
    secondaryColor: 0xfacc15,
    accentHex: '#67e8f9',
    motion: 'vortex',
    aoeRadius: 3.8,
    aoeImpulse: 3.5,
    aoeDamage: 52,
    ringScale: 2.55,
    particleCount: 58,
  },
  {
    id: 'prismatic-singularity',
    name: 'PRISMATIC SINGULARITY',
    subtitle: 'Chromatic Collapse · Rainbow × Plasma/Void/Arc',
    groupA: ['rainbow-ribbons'],
    groupB: ['plasma-core', 'void-dome', 'chain-lightning'],
    primaryColor: 0xf472b6,
    secondaryColor: 0x38bdf8,
    accentHex: '#f472b6',
    motion: 'implode-burst',
    aoeRadius: 3.9,
    aoeImpulse: 3.6,
    aoeDamage: 66,
    ringScale: 2.6,
    particleCount: 64,
  },
  {
    id: 'eclipse-nova',
    name: 'ECLIPSE NOVA',
    subtitle: 'Astral Detonation · Plasma × Void/Fire',
    groupA: ['plasma-core'],
    groupB: ['void-dome', 'fireball', 'magma-bolt'],
    primaryColor: 0xf43f5e,
    secondaryColor: 0x8b5cf6,
    accentHex: '#fb7185',
    motion: 'implode-burst',
    aoeRadius: 4.2,
    aoeImpulse: 4.1,
    aoeDamage: 78,
    ringScale: 2.8,
    particleCount: 68,
  },
];

const COMBO_WINDOW_MS = 3200;
const RECIPE_COOLDOWN_MS = 900;
const MAX_FUSION_PARTICLES = 260;
const MAX_FUSION_EFFECTS = 6;
const BANNER_DURATION_S = 2.4;

const _dummy = new THREE.Object3D();
const _tmpPos = new THREE.Vector3();
const _tmpColor = new THREE.Color();
const _tmpColorB = new THREE.Color();

interface FusionParticleSlot {
  active: boolean;
  motion: FusionMotionMode;
  origin: THREE.Vector3;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  angle: number;
  angularSpeed: number;
  radius: number;
  radialSpeed: number;
  verticalSpeed: number;
  age: number;
  maxAge: number;
  startScale: number;
  endScale: number;
  colorA: THREE.Color;
  colorB: THREE.Color;
  spinAxis: number;
}

interface FusionRingEffect {
  active: boolean;
  group: THREE.Group;
  ringMesh: THREE.Mesh;
  ringMat: THREE.ShaderMaterial;
  coreMesh: THREE.Mesh;
  coreMat: THREE.ShaderMaterial;
  spokesMesh: THREE.LineSegments;
  spokesMat: THREE.LineBasicMaterial;
  age: number;
  maxAge: number;
  maxScale: number;
  motion: FusionMotionMode;
}

const FUSION_RING_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FUSION_RING_FRAGMENT = `
  uniform float uTime;
  uniform float uProgress;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  varying vec2 vUv;

  void main() {
    vec2 centered = vUv * 2.0 - 1.0;
    float r = length(centered);
    float angle = atan(centered.y, centered.x);

    // Dual-layer swirling energy ring with harmonic spokes
    float ringBand = smoothstep(0.32, 0.56, r) * (1.0 - smoothstep(0.74, 0.99, r));
    float spiral = 0.5 + 0.5 * sin(angle * 7.0 - uTime * 9.5 + r * 14.0);
    float counterSpiral = 0.5 + 0.5 * sin(angle * 11.0 + uTime * 6.5 - r * 10.0);
    float energy = clamp(ringBand * (0.55 + spiral * 0.45 + counterSpiral * 0.25), 0.0, 1.0);

    vec3 col = mix(uColorA, uColorB, spiral);
    col += vec3(1.0) * pow(energy, 3.0) * 0.45;

    float fadeIn = smoothstep(0.0, 0.12, uProgress);
    float fadeOut = pow(1.0 - uProgress, 1.65);
    float alpha = energy * fadeIn * fadeOut * 0.92;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(col * 1.45, alpha);
  }
`;

const FUSION_CORE_VERTEX = `
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying vec3 vLocalPos;
  uniform float uTime;
  void main() {
    vLocalPos = position;
    float pulse = 1.0 + 0.08 * sin(uTime * 16.0 + position.y * 8.0);
    vec3 displaced = position * pulse;
    vNormal = normalize(normalMatrix * normal);
    vec4 wp = modelMatrix * vec4(displaced, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const FUSION_CORE_FRAGMENT = `
  uniform float uTime;
  uniform float uProgress;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying vec3 vLocalPos;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float fresnel = pow(1.0 - abs(dot(viewDir, normalize(vNormal))), 1.9);
    float swirl = 0.5 + 0.5 * sin(vLocalPos.y * 12.0 - uTime * 10.0 + vLocalPos.x * 10.0);
    vec3 col = mix(uColorA, uColorB, swirl);
    col = mix(col, vec3(1.0), fresnel * 0.55);
    float fade = (1.0 - uProgress) * (1.0 - uProgress);
    float alpha = (0.35 + fresnel * 0.65) * fade;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(col * 1.5, alpha);
  }
`;

/**
 * Tracks rapid elemental spell chains and spawns unique procedural 3D fusion
 * particle bursts, GLSL swirling fusion rings, radial energy spokes, and a
 * non-intrusive floating spatial combo callout banner.
 */
export class ElementalComboSystem extends THREE.Group {
  readonly bannerCard: xb.UICard;

  private readonly bannerTitle: xb.UIText;
  private readonly bannerSub: xb.UIText;
  private bannerRemaining = 0;

  private readonly particleGeo: THREE.OctahedronGeometry;
  private readonly particleMat: THREE.MeshBasicMaterial;
  private readonly particleMesh: THREE.InstancedMesh;
  private readonly particles: FusionParticleSlot[] = [];
  private particleCursor = 0;

  private readonly ringGeo: THREE.PlaneGeometry;
  private readonly coreGeo: THREE.IcosahedronGeometry;
  private readonly spokesGeo: THREE.BufferGeometry;
  private readonly effects: FusionRingEffect[] = [];

  private lastPower: PowerId | null = null;
  private lastCastMs = -10000;
  private readonly lastOrigin = new THREE.Vector3();
  private chainCount = 1;
  private readonly recipeLastTriggeredMs = new Map<string, number>();

  constructor() {
    super();
    this.name = 'Elemental Combo Fusion System';

    // 1. Pooled InstancedMesh for custom trajectory fusion particles
    this.particleGeo = new THREE.OctahedronGeometry(0.026, 0);
    this.particleMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.94,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.particleMesh = new THREE.InstancedMesh(
      this.particleGeo,
      this.particleMat,
      MAX_FUSION_PARTICLES
    );
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleMesh.frustumCulled = false;
    this.particleMesh.xb = {pointerEvents: 'none'};

    _dummy.scale.setScalar(0);
    _dummy.updateMatrix();
    for (let i = 0; i < MAX_FUSION_PARTICLES; i++) {
      this.particleMesh.setMatrixAt(i, _dummy.matrix);
      this.particleMesh.setColorAt(i, _tmpColor.setHex(0xffffff));
      this.particles.push({
        active: false,
        motion: 'burst-nova',
        origin: new THREE.Vector3(),
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        angle: 0,
        angularSpeed: 0,
        radius: 0,
        radialSpeed: 0,
        verticalSpeed: 0,
        age: 0,
        maxAge: 1,
        startScale: 1,
        endScale: 0,
        colorA: new THREE.Color(0xffffff),
        colorB: new THREE.Color(0xffffff),
        spinAxis: 0,
      });
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    this.add(this.particleMesh);

    // 2. Pooled GLSL Fusion Ring + Core + Radial Spokes effects
    this.ringGeo = new THREE.PlaneGeometry(1, 1);
    this.coreGeo = new THREE.IcosahedronGeometry(0.24, 2);
    this.spokesGeo = this.buildSpokesGeometry();

    for (let i = 0; i < MAX_FUSION_EFFECTS; i++) {
      const group = new THREE.Group();
      group.visible = false;
      group.xb = {pointerEvents: 'none'};

      const ringMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: {value: 0},
          uProgress: {value: 0},
          uColorA: {value: new THREE.Color(0xffffff)},
          uColorB: {value: new THREE.Color(0x38bdf8)},
        },
        vertexShader: FUSION_RING_VERTEX,
        fragmentShader: FUSION_RING_FRAGMENT,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const ringMesh = new THREE.Mesh(this.ringGeo, ringMat);
      ringMesh.rotation.x = -Math.PI / 2;
      ringMesh.xb = {pointerEvents: 'none'};
      group.add(ringMesh);

      const coreMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: {value: 0},
          uProgress: {value: 0},
          uColorA: {value: new THREE.Color(0xffffff)},
          uColorB: {value: new THREE.Color(0xf43f5e)},
        },
        vertexShader: FUSION_CORE_VERTEX,
        fragmentShader: FUSION_CORE_FRAGMENT,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const coreMesh = new THREE.Mesh(this.coreGeo, coreMat);
      coreMesh.xb = {pointerEvents: 'none'};
      group.add(coreMesh);

      const spokesMat = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const spokesMesh = new THREE.LineSegments(this.spokesGeo, spokesMat);
      spokesMesh.xb = {pointerEvents: 'none'};
      group.add(spokesMesh);

      this.add(group);
      this.effects.push({
        active: false,
        group,
        ringMesh,
        ringMat,
        coreMesh,
        coreMat,
        spokesMesh,
        spokesMat,
        age: 0,
        maxAge: 1.25,
        maxScale: 2.2,
        motion: 'burst-nova',
      });
    }

    // 3. Non-intrusive floating combo banner (auto-hides after 2.4s)
    this.bannerTitle = new xb.UIText({
      text: 'ELEMENTAL FUSION',
      pointerEvents: 'none',
      style: {
        fontSize: 22,
        fontWeight: 'bold',
        textAlign: 'center',
        color: '#fde047',
      },
    });
    this.bannerSub = new xb.UIText({
      text: '',
      pointerEvents: 'none',
      style: {
        fontSize: 13,
        textAlign: 'center',
        opacity: 0.88,
        color: '#f8fafc',
      },
    });

    this.bannerCard = new xb.UICard({
      size: {width: 0.44, height: 'auto'},
      pointerEvents: 'none',
      style: {
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: 12,
        borderRadius: 16,
        backgroundColor: 'rgba(15, 23, 42, 0.78)',
        borderWidth: 1.5,
        borderColor: 'rgba(253, 224, 71, 0.65)',
      },
      children: [this.bannerTitle, this.bannerSub],
    });
    this.bannerCard.name = 'Elemental Fusion Callout';
    this.bannerCard.visible = false;
    this.bannerCard.add(
      new xb.FollowHead({
        offset: new THREE.Vector3(0, 0.19, -1.08),
        smoothing: 0.12,
      })
    );
    this.bannerCard.add(new xb.FaceCamera({mode: 'spherical', smoothing: 0.3}));
    this.add(this.bannerCard);
  }

  private buildSpokesGeometry(): THREE.BufferGeometry {
    const spokeCount = 14;
    const verts: number[] = [];
    for (let i = 0; i < spokeCount; i++) {
      const theta = (i / spokeCount) * Math.PI * 2;
      const phi = ((i % 3) - 1) * 0.42;
      const r0 = 0.14;
      const r1 = 0.78 + (i % 2) * 0.28;
      const cosP = Math.cos(phi);
      verts.push(
        Math.cos(theta) * cosP * r0,
        Math.sin(phi) * r0,
        Math.sin(theta) * cosP * r0,
        Math.cos(theta) * cosP * r1,
        Math.sin(phi) * r1,
        Math.sin(theta) * cosP * r1
      );
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    return geo;
  }

  /**
   * Returns current active combo chain multiplier (1 = no active chain, 2+ = chaining).
   */
  getChainCount(nowMs = performance.now()): number {
    if (nowMs - this.lastCastMs > COMBO_WINDOW_MS) {
      return 1;
    }
    return this.chainCount;
  }

  /**
   * Records a spell cast and triggers an elemental fusion combo if a distinct
   * spell was cast within the combo window.
   */
  recordSpellCast(
    power: PowerId,
    origin: THREE.Vector3,
    _side: HandSide | 'both',
    nowMs = performance.now()
  ): FusionComboTrigger | null {
    const withinWindow =
      this.lastPower !== null && nowMs - this.lastCastMs <= COMBO_WINDOW_MS;

    if (!withinWindow) {
      this.chainCount = 1;
      this.lastPower = power;
      this.lastCastMs = nowMs;
      this.lastOrigin.copy(origin);
      return null;
    }

    // Repeating the exact same spell refreshes the timer without triggering fusion
    if (this.lastPower === power) {
      this.lastCastMs = nowMs;
      this.lastOrigin.copy(origin);
      return null;
    }

    const firstPower = this.lastPower!;
    const recipe = this.resolveRecipe(firstPower, power);

    // Refractory cooldown prevents stream spells from firing fusions every frame
    const lastRecipeAt = this.recipeLastTriggeredMs.get(recipe.id) ?? -10000;
    if (nowMs - lastRecipeAt < RECIPE_COOLDOWN_MS) {
      this.lastPower = power;
      this.lastCastMs = nowMs;
      this.lastOrigin.copy(origin);
      return null;
    }

    this.recipeLastTriggeredMs.set(recipe.id, nowMs);
    this.chainCount = Math.min(8, this.chainCount + 1);
    const fusionOrigin = this.lastOrigin
      .clone()
      .lerp(origin, 0.65);
    // Keep fusion comfortably visible above floor
    fusionOrigin.y = Math.max(0.45, fusionOrigin.y);

    this.lastPower = power;
    this.lastCastMs = nowMs;
    this.lastOrigin.copy(origin);

    this.spawnFusionVFX(recipe, fusionOrigin, this.chainCount);
    this.showBanner(recipe, this.chainCount);

    return {
      recipe,
      firstPower,
      secondPower: power,
      origin: fusionOrigin,
      chainCount: this.chainCount,
    };
  }

  private resolveRecipe(a: PowerId, b: PowerId): ElementalComboRecipe {
    for (const recipe of ELEMENTAL_COMBO_RECIPES) {
      const matchForward =
        recipe.groupA.includes(a) && recipe.groupB.includes(b);
      const matchReverse =
        recipe.groupA.includes(b) && recipe.groupB.includes(a);
      if (matchForward || matchReverse) {
        return recipe;
      }
    }

    // Harmonic Resonance fallback for any other distinct elemental pairing
    const specA = POWER_BY_ID[a];
    const specB = POWER_BY_ID[b];
    return {
      id: `harmonic-${[a, b].sort().join('-')}`,
      name: 'HARMONIC RESONANCE',
      subtitle: `${specA.name} × ${specB.name}`,
      groupA: [a],
      groupB: [b],
      primaryColor: specA.colorInt,
      secondaryColor: specB.colorInt,
      accentHex: specB.colorHex,
      motion: 'burst-nova',
      aoeRadius: 2.9,
      aoeImpulse: 2.3,
      aoeDamage: 36,
      ringScale: 1.95,
      particleCount: 44,
    };
  }

  private spawnFusionVFX(
    recipe: ElementalComboRecipe,
    origin: THREE.Vector3,
    chainCount: number
  ): void {
    const chainScale = 1 + Math.min(chainCount - 2, 4) * 0.14;

    // 1. Activate pooled GLSL ring + core + spokes
    const effect =
      this.effects.find((e) => !e.active) ??
      this.effects.reduce((oldest, cur) =>
        cur.age > oldest.age ? cur : oldest
      );

    effect.active = true;
    effect.age = 0;
    effect.maxAge = recipe.motion === 'implode-burst' ? 1.45 : 1.25;
    effect.maxScale = recipe.ringScale * chainScale;
    effect.motion = recipe.motion;
    effect.group.position.copy(origin);
    effect.group.rotation.set(
      (Math.random() - 0.5) * 0.3,
      Math.random() * Math.PI * 2,
      (Math.random() - 0.5) * 0.3
    );
    effect.group.visible = true;

    effect.ringMat.uniforms.uColorA.value.setHex(recipe.primaryColor);
    effect.ringMat.uniforms.uColorB.value.setHex(recipe.secondaryColor);
    effect.ringMat.uniforms.uProgress.value = 0;

    effect.coreMat.uniforms.uColorA.value.setHex(recipe.primaryColor);
    effect.coreMat.uniforms.uColorB.value.setHex(recipe.secondaryColor);
    effect.coreMat.uniforms.uProgress.value = 0;

    effect.spokesMat.color.setHex(recipe.primaryColor);
    effect.spokesMat.opacity = 0.92;

    // 2. Spawn bespoke fusion particles according to recipe motion archetype
    const count = Math.min(
      Math.round(recipe.particleCount * (1 + Math.min(chainCount - 2, 3) * 0.12)),
      84
    );

    for (let i = 0; i < count; i++) {
      const slot = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % MAX_FUSION_PARTICLES;

      slot.active = true;
      slot.motion = recipe.motion;
      slot.origin.copy(origin);
      slot.age = 0;
      slot.colorA.setHex(i % 2 === 0 ? recipe.primaryColor : recipe.secondaryColor);
      slot.colorB.setHex(i % 2 === 0 ? recipe.secondaryColor : 0xffffff);
      slot.spinAxis = (Math.random() - 0.5) * 8;

      const frac = i / count;
      const theta = frac * Math.PI * 2 + (Math.random() - 0.5) * 0.35;

      switch (recipe.motion) {
        case 'helix': {
          // Double-helix rising solar firestorm
          const strand = i % 2 === 0 ? 0 : Math.PI;
          slot.angle = frac * Math.PI * 4 + strand;
          slot.angularSpeed = 7.5 + Math.random() * 2.5;
          slot.radius = 0.12 + (i % 5) * 0.04;
          slot.radialSpeed = 0.45 + Math.random() * 0.5;
          slot.verticalSpeed = 1.15 + Math.random() * 1.45;
          slot.pos.copy(origin);
          slot.vel.set(0, 0, 0);
          slot.maxAge = 0.95 + Math.random() * 0.55;
          slot.startScale = 1.1 + Math.random() * 0.9;
          slot.endScale = 0.04;
          break;
        }
        case 'vortex': {
          // Swirling high-speed cryo-electric or ionized cyclone
          slot.angle = theta;
          slot.angularSpeed = (i % 2 === 0 ? 1 : -1) * (8.5 + Math.random() * 4.5);
          slot.radius = 0.14 + Math.random() * 0.25;
          slot.radialSpeed = 0.95 + Math.random() * 0.85;
          slot.verticalSpeed = (Math.random() - 0.35) * 1.6;
          slot.pos.copy(origin);
          slot.vel.set(0, 0, 0);
          slot.maxAge = 0.85 + Math.random() * 0.5;
          slot.startScale = 0.85 + Math.random() * 0.85;
          slot.endScale = 0.05;
          break;
        }
        case 'implode-burst': {
          // Draws inward during first 28% then detonates into an expanding starlight nova
          const phi = Math.acos(2 * Math.random() - 1);
          const startR = 0.58 + Math.random() * 0.42;
          slot.angle = theta;
          slot.angularSpeed = 5.5 + Math.random() * 3.0;
          slot.radius = startR;
          slot.radialSpeed = 2.6 + Math.random() * 1.8;
          slot.verticalSpeed = Math.cos(phi);
          slot.vel.set(
            Math.sin(phi) * Math.cos(theta),
            Math.cos(phi),
            Math.sin(phi) * Math.sin(theta)
          );
          slot.pos.copy(origin).addScaledVector(slot.vel, startR);
          slot.maxAge = 1.1 + Math.random() * 0.45;
          slot.startScale = 1.15 + Math.random() * 0.95;
          slot.endScale = 0.04;
          break;
        }
        case 'blossom': {
          // Spiralling emerald petals & buoyant luminous canopy
          slot.angle = theta;
          slot.angularSpeed = 3.2 + Math.random() * 2.2;
          slot.radius = 0.08 + Math.random() * 0.16;
          slot.radialSpeed = 1.05 + Math.random() * 0.8;
          slot.verticalSpeed = 0.65 + Math.random() * 0.95;
          slot.pos.copy(origin);
          slot.vel.set(0, 0, 0);
          slot.maxAge = 1.2 + Math.random() * 0.55;
          slot.startScale = 1.25 + Math.random() * 0.8;
          slot.endScale = 0.08;
          break;
        }
        case 'shatter-nova': {
          // Heavy tectonic obsidian shards erupting with fiery arcs
          const phi = Math.acos(2 * Math.random() - 1);
          const spd = 1.9 + Math.random() * 2.6;
          slot.pos.copy(origin);
          slot.vel.set(
            Math.sin(phi) * Math.cos(theta) * spd,
            Math.abs(Math.cos(phi)) * spd * 0.95 + 0.65,
            Math.sin(phi) * Math.sin(theta) * spd
          );
          slot.maxAge = 0.95 + Math.random() * 0.55;
          slot.startScale = 1.35 + Math.random() * 1.1;
          slot.endScale = 0.06;
          break;
        }
        case 'burst-nova':
        default: {
          // Billowing steam + superheated ember radial shockwave
          const phi = Math.acos(2 * Math.random() - 1);
          const spd = 1.6 + Math.random() * 2.4;
          slot.pos.copy(origin);
          slot.vel.set(
            Math.sin(phi) * Math.cos(theta) * spd,
            Math.cos(phi) * spd * 0.75 + 0.45,
            Math.sin(phi) * Math.sin(theta) * spd
          );
          slot.maxAge = 0.85 + Math.random() * 0.55;
          slot.startScale = 1.05 + Math.random() * 1.15;
          slot.endScale = 0.04;
          break;
        }
      }
    }
  }

  private showBanner(recipe: ElementalComboRecipe, chainCount: number): void {
    this.bannerTitle.text = `${recipe.name} · ${chainCount}x CHAIN`;
    this.bannerTitle.style.color = recipe.accentHex;
    this.bannerSub.text = recipe.subtitle;
    this.bannerCard.style.borderColor = recipe.accentHex;
    this.bannerCard.visible = true;
    this.bannerRemaining = BANNER_DURATION_S;
  }

  /**
   * Advances all active fusion particle trajectories, GLSL vortex rings,
   * and the auto-hiding floating combo callout (zero per-frame allocations).
   */
  update(dt: number, elapsed: number): void {
    // 1. Update pooled fusion particles
    let anyUpdated = false;
    for (let i = 0; i < MAX_FUSION_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      anyUpdated = true;

      p.age += dt;
      if (p.age >= p.maxAge) {
        p.active = false;
        _dummy.scale.setScalar(0);
        _dummy.updateMatrix();
        this.particleMesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }

      const t = p.age / p.maxAge;
      switch (p.motion) {
        case 'helix':
        case 'vortex': {
          p.angle += p.angularSpeed * dt;
          p.radius += p.radialSpeed * dt * (1 - t * 0.45);
          _tmpPos.set(
            p.origin.x + Math.cos(p.angle) * p.radius,
            p.origin.y + p.verticalSpeed * p.age * (1 - t * 0.3),
            p.origin.z + Math.sin(p.angle) * p.radius
          );
          p.pos.copy(_tmpPos);
          break;
        }
        case 'blossom': {
          p.angle += p.angularSpeed * dt;
          const r = p.radius + p.radialSpeed * Math.sin(t * Math.PI * 0.85);
          const yOffset =
            p.verticalSpeed * p.age - 0.55 * p.age * p.age;
          p.pos.set(
            p.origin.x + Math.cos(p.angle) * r,
            Math.max(0.06, p.origin.y + yOffset),
            p.origin.z + Math.sin(p.angle) * r
          );
          break;
        }
        case 'implode-burst': {
          p.angle += p.angularSpeed * dt;
          let r: number;
          if (t < 0.28) {
            const it = t / 0.28;
            r = THREE.MathUtils.lerp(p.radius, 0.05, it * it);
          } else {
            const et = (t - 0.28) / 0.72;
            r = 0.05 + p.radialSpeed * (1 - Math.pow(1 - et, 2.2)) * 0.85;
          }
          const cosA = Math.cos(p.angle * 0.35);
          const sinA = Math.sin(p.angle * 0.35);
          const vx = p.vel.x * cosA - p.vel.z * sinA;
          const vz = p.vel.x * sinA + p.vel.z * cosA;
          p.pos.set(
            p.origin.x + vx * r,
            Math.max(0.06, p.origin.y + p.vel.y * r),
            p.origin.z + vz * r
          );
          break;
        }
        case 'shatter-nova': {
          p.vel.y -= 4.2 * dt;
          p.vel.multiplyScalar(Math.pow(0.96, dt * 60));
          p.pos.addScaledVector(p.vel, dt);
          if (p.pos.y < 0.05) {
            p.pos.y = 0.05;
            p.vel.y = Math.abs(p.vel.y) * 0.52;
          }
          break;
        }
        case 'burst-nova':
        default: {
          p.vel.y += 0.55 * dt;
          p.vel.multiplyScalar(Math.pow(0.94, dt * 60));
          p.pos.addScaledVector(p.vel, dt);
          break;
        }
      }

      const scaleEnvelope =
        t < 0.14
          ? THREE.MathUtils.lerp(0.25, p.startScale, t / 0.14)
          : THREE.MathUtils.lerp(p.startScale, p.endScale, (t - 0.14) / 0.86);

      _dummy.position.copy(p.pos);
      _dummy.rotation.set(
        p.age * (3.5 + p.spinAxis * 0.4),
        p.age * (4.5 - p.spinAxis * 0.3),
        p.age * 2.2
      );
      if (p.motion === 'shatter-nova') {
        _dummy.scale.set(
          scaleEnvelope * 1.45,
          scaleEnvelope * 0.72,
          scaleEnvelope * 1.15
        );
      } else {
        _dummy.scale.setScalar(scaleEnvelope);
      }
      _dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, _dummy.matrix);

      _tmpColor.copy(p.colorA).lerp(_tmpColorB.copy(p.colorB), t);
      this.particleMesh.setColorAt(i, _tmpColor);
    }

    if (anyUpdated) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
      if (this.particleMesh.instanceColor) {
        this.particleMesh.instanceColor.needsUpdate = true;
      }
    }

    // 2. Update pooled GLSL Fusion Ring + Core + Radial Spokes effects
    for (const fx of this.effects) {
      if (!fx.active) continue;
      fx.age += dt;
      const t = Math.min(1, fx.age / fx.maxAge);
      if (t >= 1) {
        fx.active = false;
        fx.group.visible = false;
        continue;
      }

      fx.ringMat.uniforms.uTime.value = elapsed;
      fx.ringMat.uniforms.uProgress.value = t;
      fx.coreMat.uniforms.uTime.value = elapsed;
      fx.coreMat.uniforms.uProgress.value = t;

      const easeOut = 1 - Math.pow(1 - t, 2.8);
      const ringScale =
        fx.motion === 'implode-burst' && t < 0.28
          ? THREE.MathUtils.lerp(fx.maxScale * 0.65, 0.25, t / 0.28)
          : THREE.MathUtils.lerp(0.28, fx.maxScale, easeOut);
      fx.ringMesh.scale.setScalar(ringScale);
      fx.ringMesh.rotation.z += dt * (fx.motion === 'vortex' ? 4.8 : 2.6);

      const coreScale =
        fx.motion === 'implode-burst' && t < 0.28
          ? THREE.MathUtils.lerp(1.4, 0.35, t / 0.28)
          : THREE.MathUtils.lerp(0.5, 2.1, easeOut);
      fx.coreMesh.scale.setScalar(coreScale);
      fx.coreMesh.rotation.y += dt * 3.8;

      fx.spokesMesh.scale.setScalar(0.35 + easeOut * fx.maxScale * 0.72);
      fx.spokesMesh.rotation.y -= dt * 2.2;
      fx.spokesMat.opacity = (1 - t) * (1 - t) * 0.88;
    }

    // 3. Auto-hide floating combo callout banner
    if (this.bannerRemaining > 0) {
      this.bannerRemaining -= dt;
      if (this.bannerRemaining <= 0) {
        this.bannerRemaining = 0;
        this.bannerCard.visible = false;
      }
    }
  }

  /** Clears active fusion effects and resets chain tracking. */
  resetCombos(): void {
    this.lastPower = null;
    this.lastCastMs = -10000;
    this.chainCount = 1;
    this.bannerRemaining = 0;
    this.bannerCard.visible = false;

    _dummy.scale.setScalar(0);
    _dummy.updateMatrix();
    for (let i = 0; i < MAX_FUSION_PARTICLES; i++) {
      this.particles[i].active = false;
      this.particleMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;

    for (const fx of this.effects) {
      fx.active = false;
      fx.group.visible = false;
    }
  }

  dispose(): void {
    this.resetCombos();
    this.particleGeo.dispose();
    this.particleMat.dispose();
    this.ringGeo.dispose();
    this.coreGeo.dispose();
    this.spokesGeo.dispose();
    for (const fx of this.effects) {
      fx.ringMat.dispose();
      fx.coreMat.dispose();
      fx.spokesMat.dispose();
    }
  }
}
