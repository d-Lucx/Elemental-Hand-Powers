import type RAPIER from '@dimforge/rapier3d-simd-compat';
import * as THREE from 'three';
import * as xb from 'xrblocks';

type RapierModule = typeof RAPIER;

import {
  EARTH_SHIELD_DURATION_S,
  POWER_BY_ID,
  VOID_DOME_DURATION_S,
} from '../constants.ts';
import {HandSide, PowerId} from '../types.ts';
import {ElementalTarget} from '../world/ElementalArena.ts';

const MAX_PARTICLES = 420;
const RIBBON_POINTS = 34;

const _dummy = new THREE.Object3D();
const _tmpVec = new THREE.Vector3();
const _tmpVec2 = new THREE.Vector3();
const _tmpVec3 = new THREE.Vector3();
const _tmpColor = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0);

interface ParticleSlot {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  maxAge: number;
  startScale: number;
  endScale: number;
  gravity: number;
  drag: number;
  color: THREE.Color;
}

export interface ElementalProjectile {
  kind: 'fireball' | 'magma-bolt' | 'frost-shard' | 'plasma-core';
  ownerSide: HandSide | 'both';
  mesh: THREE.Mesh;
  body: RAPIER.RigidBody | null;
  velocity: THREE.Vector3;
  prevVelocity: THREE.Vector3;
  radius: number;
  damage: number;
  impulseStrength: number;
  age: number;
  maxAge: number;
  color: number;
  bounces: number;
  lastBounceAge: number;
}

interface RibbonTrail {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  material: THREE.ShaderMaterial;
  points: THREE.Vector3[];
  ages: number[];
  headIndex: number;
  count: number;
  emitting: boolean;
  width: number;
  hueOffset: number;
  lastSamplePos: THREE.Vector3;
}

export interface EarthShieldInstance {
  side: HandSide;
  group: THREE.Group;
  body: RAPIER.RigidBody | null;
  targetPos: THREE.Vector3;
  targetQuat: THREE.Quaternion;
  normal: THREE.Vector3;
  remaining: number;
  active: boolean;
}

interface ShockwaveInstance {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  age: number;
  maxAge: number;
  maxRadius: number;
}

interface UpdraftVortex {
  group: THREE.Group;
  center: THREE.Vector3;
  age: number;
  maxAge: number;
  kind: 'sky-updraft' | 'tidal-vortex';
  radius: number;
}

interface FloraCluster {
  group: THREE.Group;
  age: number;
  maxAge: number;
}

const PLASMA_VERTEX_SHADER = `
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying vec3 vLocalPos;
  uniform float uTime;
  uniform float uTurbulence;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z
    );
  }

  void main() {
    vLocalPos = position;
    float n = noise(position * 5.5 + vec3(uTime * 2.8, -uTime * 2.1, uTime * 1.4));
    vec3 displaced = position + normal * (n - 0.5) * uTurbulence;
    vNormal = normalize(normalMatrix * normal);
    vec4 wp = modelMatrix * vec4(displaced, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const PLASMA_FRAGMENT_SHADER = `
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying vec3 vLocalPos;
  uniform float uTime;
  uniform vec3 uCoreColor;
  uniform vec3 uEdgeColor;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float fresnel = pow(1.0 - max(dot(viewDir, normalize(vNormal)), 0.0), 2.2);
    float wave = 0.5 + 0.5 * sin(vLocalPos.y * 16.0 - uTime * 7.0 + sin(vLocalPos.x * 12.0 + uTime * 4.0));
    vec3 col = mix(uCoreColor, uEdgeColor, clamp(fresnel * 0.85 + wave * 0.35, 0.0, 1.0));
    gl_FragColor = vec4(col * (1.15 + fresnel * 0.65), 0.96);
  }
`;

const RAINBOW_RIBBON_VERTEX = `
  attribute float aAlpha;
  attribute float aAlong;
  varying float vAlpha;
  varying float vAlong;
  varying vec2 vUv;
  void main() {
    vAlpha = aAlpha;
    vAlong = aAlong;
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const RAINBOW_RIBBON_FRAGMENT = `
  uniform float uTime;
  uniform float uHueOffset;
  varying float vAlpha;
  varying float vAlong;
  varying vec2 vUv;

  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  void main() {
    float edge = 1.0 - abs(vUv.y * 2.0 - 1.0);
    edge = smoothstep(0.0, 0.65, edge);
    float hue = fract(vAlong * 1.4 - uTime * 0.55 + uHueOffset);
    vec3 rainbow = hsv2rgb(vec3(hue, 0.92, 1.0));
    float coreStripe = smoothstep(0.55, 0.98, edge);
    vec3 col = mix(rainbow, vec3(1.0), coreStripe * 0.38);
    float alpha = edge * vAlpha * 0.92;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(col, alpha);
  }
`;

const HEX_DOME_VERTEX = `
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying vec3 vLocalPos;
  void main() {
    vLocalPos = normalize(position);
    vNormal = normalize(normalMatrix * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const HEX_DOME_FRAGMENT = `
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3 uColor;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying vec3 vLocalPos;

  float hexGrid(vec2 p) {
    p *= 11.0;
    vec2 r = vec2(1.0, 1.73205);
    vec2 h = r * 0.5;
    vec2 a = mod(p, r) - h;
    vec2 b = mod(p - h, r) - h;
    vec2 gv = dot(a, a) < dot(b, b) ? a : b;
    float d = max(abs(gv.x), dot(abs(gv), normalize(r)));
    return smoothstep(0.43, 0.49, d);
  }

  void main() {
    vec2 spherical = vec2(atan(vLocalPos.z, vLocalPos.x) / 3.14159, asin(clamp(vLocalPos.y, -1.0, 1.0)) / 1.5708);
    float grid = hexGrid(spherical + vec2(uTime * 0.03, 0.0));
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float fresnel = pow(1.0 - abs(dot(viewDir, normalize(vNormal))), 1.7);
    float scan = 0.5 + 0.5 * sin(vLocalPos.y * 14.0 - uTime * 3.5);
    float alpha = (grid * 0.52 + fresnel * 0.48 + scan * 0.08) * uOpacity;
    vec3 col = uColor * (0.9 + grid * 0.8 + fresnel * 0.7);
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.82));
  }
`;

const SHOCKWAVE_VERTEX = `
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const SHOCKWAVE_FRAGMENT = `
  uniform vec3 uColor;
  uniform float uProgress;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float fresnel = pow(1.0 - abs(dot(viewDir, normalize(vNormal))), 2.1);
    float fade = (1.0 - uProgress) * (1.0 - uProgress);
    gl_FragColor = vec4(uColor * 1.4, fresnel * fade * 0.85);
  }
`;

/**
 * Manages all procedural elemental visual effects, instanced particle pool,
 * Rapier-backed projectiles & earth shields, custom GLSL shaders, ribbons,
 * lightning arcs, vortices, flora blooms, and near-field hand elemental auras.
 */
export class ElementalVFXSystem extends THREE.Group {
  private RAPIER: RapierModule | null = null;
  private world: RAPIER.World | null = null;

  // 1. Pooled instanced particle system (1 draw call)
  private particleMesh: THREE.InstancedMesh;
  private particles: ParticleSlot[] = [];
  private particleCursor = 0;

  // 2. Active projectiles (Fireballs, Magma Bolts, Frost Shards, Plasma Cores)
  readonly projectiles: ElementalProjectile[] = [];
  private fireballGeo: THREE.IcosahedronGeometry;
  private frostShardGeo: THREE.OctahedronGeometry;
  private fireballMat: THREE.ShaderMaterial;
  private magmaMat: THREE.ShaderMaterial;
  private plasmaMat: THREE.ShaderMaterial;
  private frostMat: THREE.MeshBasicMaterial;

  // 3. Palm charge orbs (Left, Right, and Bimanual Plasma Core)
  private chargeOrbs: Record<HandSide, THREE.Mesh>;
  private plasmaCoreOrb: THREE.Mesh;

  // 4. Hand near-field affective elemental auras (additive, no depth write)
  private handAuras: Record<HandSide, THREE.Mesh>;

  // 5. Dual Rainbow Ribbon trails
  private ribbons: RibbonTrail[] = [];
  private activeHandRibbons: Record<HandSide, [RibbonTrail | null, RibbonTrail | null]> = {
    left: [null, null],
    right: [null, null],
  };

  // 6. Floating Earth Shields (composite faceted basalt + Rapier kinematic collider)
  readonly shields: Record<HandSide, EarthShieldInstance>;
  private shieldRockMat: THREE.MeshStandardMaterial;
  private shieldRuneMat: THREE.MeshStandardMaterial;

  // 7. Void Barrier Dome
  private voidDomeMesh: THREE.Mesh;
  private voidDomeMat: THREE.ShaderMaterial;
  voidDomeRemaining = 0;
  readonly voidDomeCenter = new THREE.Vector3();
  readonly voidDomeRadius = 1.48;

  // 8. Expanding Shockwaves (Kinetic Gale / Solar Burst / Empower Detonation)
  private shockwaves: ShockwaveInstance[] = [];
  private shockwaveGeo: THREE.SphereGeometry;

  // 9. Dynamic Lightning & Tether Geometry
  private lightningLines: THREE.LineSegments;
  private lightningPositions: Float32Array;
  private lightningVertexCount = 0;
  private readonly maxLightningSegments = 96;

  // 10. Vortices (Sky Updraft & Tidal Vortex) and Verdant Flora Clusters
  private vortices: UpdraftVortex[] = [];
  private floras: FloraCluster[] = [];

  private elapsed = 0;

  constructor() {
    super();
    this.name = 'Elemental VFX System';
    this.xb = {pointerEvents: 'none'};

    // --- 1. Pooled Instanced Particles ---
    const particleGeo = new THREE.OctahedronGeometry(0.022, 0);
    const particleMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.particleMesh = new THREE.InstancedMesh(
      particleGeo,
      particleMat,
      MAX_PARTICLES
    );
    this.particleMesh.frustumCulled = false;
    this.particleMesh.xb = {pointerEvents: 'none'};

    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        age: 0,
        maxAge: 1,
        startScale: 1,
        endScale: 0,
        gravity: 0,
        drag: 0.98,
        color: new THREE.Color(1, 1, 1),
      });
      _dummy.scale.setScalar(0);
      _dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, _dummy.matrix);
      this.particleMesh.setColorAt(i, _tmpColor.setHex(0xffffff));
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    this.add(this.particleMesh);

    // --- 2. Projectile & Charge Orb Materials ---
    this.fireballGeo = new THREE.IcosahedronGeometry(1, 3);
    this.frostShardGeo = new THREE.OctahedronGeometry(0.028, 0);
    this.shockwaveGeo = new THREE.SphereGeometry(1, 24, 18);

    this.fireballMat = this.createPlasmaMaterial(0xfff1a8, 0xff4d12, 0.14);
    this.magmaMat = this.createPlasmaMaterial(0xffb703, 0xd90429, 0.2);
    this.plasmaMat = this.createPlasmaMaterial(0xfef08a, 0xf43f5e, 0.22);
    this.frostMat = new THREE.MeshBasicMaterial({
      color: 0xa5f3fc,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const createChargeOrb = () => {
      const m = new THREE.Mesh(this.fireballGeo, this.fireballMat);
      m.visible = false;
      m.xb = {pointerEvents: 'none'};
      this.add(m);
      return m;
    };
    this.chargeOrbs = {
      left: createChargeOrb(),
      right: createChargeOrb(),
    };
    this.plasmaCoreOrb = new THREE.Mesh(this.fireballGeo, this.plasmaMat);
    this.plasmaCoreOrb.visible = false;
    this.plasmaCoreOrb.xb = {pointerEvents: 'none'};
    this.add(this.plasmaCoreOrb);

    // --- 3. Near-Field Hand Elemental Auras ---
    const createAura = () => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.068, 16, 12),
        new THREE.MeshBasicMaterial({
          color: 0xff6b2b,
          transparent: true,
          opacity: 0.26,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      m.visible = false;
      m.xb = {pointerEvents: 'none'};
      this.add(m);
      return m;
    };
    this.handAuras = {left: createAura(), right: createAura()};

    // --- 4. Composite Faceted Earth Shields ---
    this.shieldRockMat = new THREE.MeshStandardMaterial({
      color: 0x5c4d42,
      roughness: 0.88,
      metalness: 0.12,
      flatShading: true,
    });
    this.shieldRuneMat = new THREE.MeshStandardMaterial({
      color: 0xe6a15c,
      emissive: 0xd97706,
      emissiveIntensity: 0.9,
      roughness: 0.3,
      metalness: 0.72,
    });
    this.shields = {
      left: this.createEarthShield('left'),
      right: this.createEarthShield('right'),
    };

    // --- 5. Void Barrier Dome ---
    this.voidDomeMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: {value: 0},
        uOpacity: {value: 0},
        uColor: {value: new THREE.Color(0xa855f7)},
      },
      vertexShader: HEX_DOME_VERTEX,
      fragmentShader: HEX_DOME_FRAGMENT,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.voidDomeMesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(this.voidDomeRadius, 3),
      this.voidDomeMat
    );
    this.voidDomeMesh.visible = false;
    this.voidDomeMesh.renderOrder = 12;
    this.voidDomeMesh.xb = {pointerEvents: 'none'};
    this.add(this.voidDomeMesh);

    // --- 6. Dynamic Lightning LineSegments ---
    this.lightningPositions = new Float32Array(this.maxLightningSegments * 2 * 3);
    const lightningGeo = new THREE.BufferGeometry();
    lightningGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.lightningPositions, 3)
    );
    lightningGeo.setDrawRange(0, 0);
    const lightningMat = new THREE.LineBasicMaterial({
      color: 0xa5d8ff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.lightningLines = new THREE.LineSegments(lightningGeo, lightningMat);
    this.lightningLines.frustumCulled = false;
    this.lightningLines.xb = {pointerEvents: 'none'};
    this.add(this.lightningLines);
  }

  private createPlasmaMaterial(
    coreHex: number,
    edgeHex: number,
    turbulence: number
  ): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: {value: 0},
        uTurbulence: {value: turbulence},
        uCoreColor: {value: new THREE.Color(coreHex)},
        uEdgeColor: {value: new THREE.Color(edgeHex)},
      },
      vertexShader: PLASMA_VERTEX_SHADER,
      fragmentShader: PLASMA_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: true,
    });
  }

  private createEarthShield(side: HandSide): EarthShieldInstance {
    const group = new THREE.Group();
    group.name = `Earth Shield (${side})`;
    group.visible = false;
    group.xb = {pointerEvents: 'none'};

    // Central faceted hexagonal stone boss + 7 orbiting perimeter basalt plates + glowing rune ring
    const centerRock = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.16, 0.055, 6),
      this.shieldRockMat
    );
    centerRock.rotation.x = Math.PI / 2;
    centerRock.castShadow = true;
    centerRock.receiveShadow = true;
    group.add(centerRock);

    const runeRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.19, 0.011, 8, 6),
      this.shieldRuneMat
    );
    runeRing.position.z = 0.025;
    group.add(runeRing);

    const plateGeo = new THREE.DodecahedronGeometry(0.095, 0);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const plate = new THREE.Mesh(plateGeo, this.shieldRockMat);
      plate.position.set(
        Math.cos(a) * 0.24,
        Math.sin(a) * 0.24,
        (i % 2 === 0 ? 1 : -1) * 0.014
      );
      plate.scale.set(1.15, 0.92, 0.45);
      plate.rotation.set(i * 0.5, i * 0.3, a);
      plate.castShadow = true;
      plate.receiveShadow = true;
      group.add(plate);
    }

    this.add(group);
    return {
      side,
      group,
      body: null,
      targetPos: new THREE.Vector3(),
      targetQuat: new THREE.Quaternion(),
      normal: new THREE.Vector3(0, 0, -1),
      remaining: 0,
      active: false,
    };
  }

  initPhysics(physics: xb.Physics): void {
    this.RAPIER = physics.RAPIER as unknown as RapierModule;
    this.world = physics.blendedWorld as unknown as RAPIER.World;
  }

  // ---------------- Particle Emission ----------------
  spawnParticle(
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    colorHex: number,
    options?: {
      maxAge?: number;
      startScale?: number;
      endScale?: number;
      gravity?: number;
      drag?: number;
    }
  ): void {
    const slot = this.particles[this.particleCursor];
    this.particleCursor = (this.particleCursor + 1) % MAX_PARTICLES;
    slot.active = true;
    slot.pos.copy(pos);
    slot.vel.copy(vel);
    slot.age = 0;
    slot.maxAge = options?.maxAge ?? 0.55;
    slot.startScale = options?.startScale ?? 1.0;
    slot.endScale = options?.endScale ?? 0.05;
    slot.gravity = options?.gravity ?? 0;
    slot.drag = options?.drag ?? 0.96;
    slot.color.setHex(colorHex);
  }

  spawnBurst(
    origin: THREE.Vector3,
    count: number,
    colorA: number,
    colorB: number,
    speed = 2.6,
    gravity = -3.8
  ): void {
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const spd = speed * (0.45 + Math.random() * 0.85);
      _tmpVec.set(
        Math.sin(phi) * Math.cos(theta) * spd,
        Math.cos(phi) * spd + 0.5,
        Math.sin(phi) * Math.sin(theta) * spd
      );
      this.spawnParticle(origin, _tmpVec, i % 2 === 0 ? colorA : colorB, {
        maxAge: 0.45 + Math.random() * 0.45,
        startScale: 0.75 + Math.random() * 1.15,
        endScale: 0.02,
        gravity,
        drag: 0.95,
      });
    }
  }

  // ---------------- Hand Aura & Charge Orbs ----------------
  setHandAura(
    side: HandSide,
    visible: boolean,
    position?: THREE.Vector3,
    powerId?: PowerId
  ): void {
    const aura = this.handAuras[side];
    aura.visible = visible;
    if (visible && position) {
      aura.position.copy(position);
      const spec = powerId ? POWER_BY_ID[powerId] : POWER_BY_ID.fireball;
      const mat = aura.material as THREE.MeshBasicMaterial;
      mat.color.setHex(spec.colorInt);
      const pulse = 1 + Math.sin(this.elapsed * 8.0) * 0.14;
      aura.scale.setScalar(pulse);
    }
  }

  setChargeOrb(
    side: HandSide,
    visible: boolean,
    position?: THREE.Vector3,
    radius = 0.075,
    kind: 'fireball' | 'magma-bolt' = 'fireball'
  ): void {
    const orb = this.chargeOrbs[side];
    orb.visible = visible;
    if (visible && position) {
      orb.material = kind === 'magma-bolt' ? this.magmaMat : this.fireballMat;
      orb.position.copy(position);
      orb.scale.setScalar(radius);
      if (Math.random() < 0.45) {
        _tmpVec.set(
          (Math.random() - 0.5) * 0.5,
          0.5 + Math.random() * 0.6,
          (Math.random() - 0.5) * 0.5
        );
        this.spawnParticle(
          position,
          _tmpVec,
          kind === 'magma-bolt' ? 0xef4444 : 0xff9f1c,
          {maxAge: 0.35, startScale: 0.55, gravity: 0.6}
        );
      }
    }
  }

  setPlasmaCoreCharge(
    visible: boolean,
    midpoint?: THREE.Vector3,
    separation = 0.25
  ): void {
    this.plasmaCoreOrb.visible = visible;
    if (visible && midpoint) {
      const r = THREE.MathUtils.clamp(separation * 0.36, 0.06, 0.22);
      this.plasmaCoreOrb.position.copy(midpoint);
      this.plasmaCoreOrb.scale.setScalar(
        r * (1 + Math.sin(this.elapsed * 12) * 0.08)
      );
      if (Math.random() < 0.65) {
        _tmpVec
          .set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
          .normalize()
          .multiplyScalar(0.9);
        this.spawnParticle(midpoint, _tmpVec, 0xf43f5e, {
          maxAge: 0.32,
          startScale: 0.7,
        });
      }
    }
  }

  // ---------------- Projectiles ----------------
  launchProjectile(
    kind: ElementalProjectile['kind'],
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    speed: number,
    radius = 0.075,
    ownerSide: HandSide | 'both' = 'right'
  ): void {
    const dir = direction.clone().normalize();
    const vel = dir.clone().multiplyScalar(speed);
    const isFrost = kind === 'frost-shard';

    const mesh = new THREE.Mesh(
      isFrost ? this.frostShardGeo : this.fireballGeo,
      kind === 'magma-bolt'
        ? this.magmaMat
        : kind === 'plasma-core'
          ? this.plasmaMat
          : isFrost
            ? this.frostMat
            : this.fireballMat
    );
    mesh.position.copy(origin);
    if (isFrost) {
      mesh.scale.set(0.65, 0.65, 2.3);
      mesh.lookAt(origin.clone().add(dir));
    } else {
      mesh.scale.setScalar(radius);
    }
    mesh.xb = {pointerEvents: 'none'};
    this.add(mesh);

    let body: RAPIER.RigidBody | null = null;
    if (this.RAPIER && this.world && !isFrost) {
      const desc = this.RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(origin.x, origin.y, origin.z)
        .setLinvel(vel.x, vel.y, vel.z)
        .setGravityScale(kind === 'magma-bolt' ? 0.35 : kind === 'plasma-core' ? 0.15 : 0.65)
        .setCcdEnabled(true);
      body = this.world.createRigidBody(desc);
      const colDesc = this.RAPIER.ColliderDesc.ball(radius)
        .setRestitution(0.75)
        .setDensity(kind === 'plasma-core' ? 4.0 : 2.2);
      this.world.createCollider(colDesc, body);
    }

    this.projectiles.push({
      kind,
      ownerSide: kind === 'plasma-core' ? 'both' : ownerSide,
      mesh,
      body,
      velocity: vel,
      prevVelocity: vel.clone(),
      radius,
      damage:
        kind === 'plasma-core'
          ? 120
          : kind === 'magma-bolt'
            ? 80
            : kind === 'fireball'
              ? 55
              : 14,
      impulseStrength:
        kind === 'plasma-core'
          ? 4.6
          : kind === 'magma-bolt'
            ? 3.4
            : kind === 'fireball'
              ? 2.2
              : 0.45,
      age: 0,
      maxAge: isFrost ? 1.4 : 4.2,
      color:
        kind === 'frost-shard'
          ? 0x38bdf8
          : kind === 'plasma-core'
            ? 0xf43f5e
            : kind === 'magma-bolt'
              ? 0xef4444
              : 0xff6b2b,
      bounces: 0,
      lastBounceAge: -1,
    });
  }

  // ---------------- Dual Rainbow Ribbons ----------------
  private createRibbonTrail(hueOffset: number, width = 0.024): RibbonTrail {
    const vertCount = RIBBON_POINTS * 2;
    const positions = new Float32Array(vertCount * 3);
    const uvs = new Float32Array(vertCount * 2);
    const alphas = new Float32Array(vertCount);
    const alongs = new Float32Array(vertCount);
    const indices: number[] = [];

    for (let i = 0; i < RIBBON_POINTS; i++) {
      uvs[i * 4 + 0] = i / (RIBBON_POINTS - 1);
      uvs[i * 4 + 1] = 0;
      uvs[i * 4 + 2] = i / (RIBBON_POINTS - 1);
      uvs[i * 4 + 3] = 1;
      if (i < RIBBON_POINTS - 1) {
        const a = i * 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        indices.push(a, b, c, b, d, c);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
    geometry.setAttribute('aAlong', new THREE.BufferAttribute(alongs, 1));
    geometry.setIndex(indices);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: {value: 0},
        uHueOffset: {value: hueOffset},
      },
      vertexShader: RAINBOW_RIBBON_VERTEX,
      fragmentShader: RAINBOW_RIBBON_FRAGMENT,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.xb = {pointerEvents: 'none'};
    this.add(mesh);

    const trail: RibbonTrail = {
      mesh,
      geometry,
      material,
      points: Array.from({length: RIBBON_POINTS}, () => new THREE.Vector3()),
      ages: new Array(RIBBON_POINTS).fill(99),
      headIndex: 0,
      count: 0,
      emitting: true,
      width,
      hueOffset,
      lastSamplePos: new THREE.Vector3(999, 999, 999),
    };
    this.ribbons.push(trail);
    return trail;
  }

  emitRainbowRibbons(
    side: HandSide,
    indexTip: THREE.Vector3,
    middleTip: THREE.Vector3
  ): void {
    const pair = this.activeHandRibbons[side];
    if (!pair[0]) pair[0] = this.createRibbonTrail(0.0, 0.022);
    if (!pair[1]) pair[1] = this.createRibbonTrail(0.42, 0.022);
    pair[0].emitting = true;
    pair[1].emitting = true;
    this.appendRibbonPoint(pair[0], indexTip);
    this.appendRibbonPoint(pair[1], middleTip);

    if (Math.random() < 0.35) {
      _tmpVec.set(
        (Math.random() - 0.5) * 0.25,
        0.15 + Math.random() * 0.25,
        (Math.random() - 0.5) * 0.25
      );
      _tmpColor.setHSL(Math.random(), 0.95, 0.65);
      this.spawnParticle(indexTip, _tmpVec, _tmpColor.getHex(), {
        maxAge: 0.65,
        startScale: 0.45,
        gravity: 0.08,
      });
    }
  }

  releaseRainbowRibbons(side: HandSide): void {
    const pair = this.activeHandRibbons[side];
    if (pair[0]) pair[0].emitting = false;
    if (pair[1]) pair[1].emitting = false;
    this.activeHandRibbons[side] = [null, null];
  }

  private appendRibbonPoint(trail: RibbonTrail, pos: THREE.Vector3): void {
    if (trail.count > 0 && trail.lastSamplePos.distanceToSquared(pos) < 0.00018) {
      return;
    }
    trail.lastSamplePos.copy(pos);
    // Shift points down cleanly (small fixed array of 34)
    const maxShift = Math.min(trail.count, RIBBON_POINTS - 1);
    for (let i = maxShift; i > 0; i--) {
      trail.points[i].copy(trail.points[i - 1]);
      trail.ages[i] = trail.ages[i - 1];
    }
    trail.points[0].copy(pos);
    trail.ages[0] = 0;
    trail.count = Math.min(trail.count + 1, RIBBON_POINTS);
  }

  // ---------------- Earth Shield (Tap-to-Summon, Anti-Gorilla-Arm) ----------------
  summonEarthShield(
    side: HandSide,
    palmPos: THREE.Vector3,
    forwardNormal: THREE.Vector3
  ): void {
    const shield = this.shields[side];
    const dir = forwardNormal.clone().normalize();
    shield.normal.copy(dir);
    shield.targetPos.copy(palmPos).addScaledVector(dir, 0.28);
    _dummy.position.copy(shield.targetPos);
    _dummy.lookAt(shield.targetPos.clone().add(dir));
    shield.targetQuat.copy(_dummy.quaternion);

    if (!shield.active) {
      shield.group.position.copy(shield.targetPos);
      shield.group.quaternion.copy(shield.targetQuat);
      shield.group.scale.setScalar(0.05);
      shield.group.visible = true;
      shield.active = true;

      if (this.RAPIER && this.world && !shield.body) {
        const desc = this.RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
          shield.targetPos.x,
          shield.targetPos.y,
          shield.targetPos.z
        );
        shield.body = this.world.createRigidBody(desc);
        const colDesc = this.RAPIER.ColliderDesc.cuboid(0.32, 0.32, 0.05).setRestitution(
          1.05
        );
        this.world.createCollider(colDesc, shield.body);
      }
      this.spawnBurst(shield.targetPos, 18, 0xb08968, 0xf59e0b, 1.8, -2.5);
    }
    shield.remaining = EARTH_SHIELD_DURATION_S;
  }

  updateEarthShieldTarget(
    side: HandSide,
    palmPos: THREE.Vector3,
    forwardNormal: THREE.Vector3
  ): void {
    const shield = this.shields[side];
    if (!shield.active) return;
    const dir = forwardNormal.clone().normalize();
    shield.normal.lerp(dir, 0.18).normalize();
    shield.targetPos.copy(palmPos).addScaledVector(dir, 0.28);
    _dummy.position.copy(shield.targetPos);
    _dummy.lookAt(shield.targetPos.clone().add(dir));
    shield.targetQuat.copy(_dummy.quaternion);
  }

  // ---------------- Shockwave (Kinetic Gale / Solar Burst) ----------------
  triggerShockwave(
    origin: THREE.Vector3,
    colorHex = 0xfbbf24,
    maxRadius = 3.2
  ): void {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: {value: new THREE.Color(colorHex)},
        uProgress: {value: 0},
      },
      vertexShader: SHOCKWAVE_VERTEX,
      fragmentShader: SHOCKWAVE_FRAGMENT,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(this.shockwaveGeo, material);
    mesh.position.copy(origin);
    mesh.scale.setScalar(0.12);
    mesh.xb = {pointerEvents: 'none'};
    this.add(mesh);

    this.shockwaves.push({
      mesh,
      material,
      age: 0,
      maxAge: 0.72,
      maxRadius,
    });
    this.spawnBurst(origin, 26, colorHex, 0xffffff, 4.2, -0.4);
  }

  // ---------------- Lightning Arcs & Telekinesis Tether ----------------
  resetLightningFrame(): void {
    this.lightningVertexCount = 0;
  }

  addLightningArc(
    start: THREE.Vector3,
    end: THREE.Vector3,
    segments = 9,
    jitter = 0.085
  ): void {
    if (this.lightningVertexCount + segments * 2 > this.maxLightningSegments * 2) {
      return;
    }
    _tmpVec.copy(start);
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      _tmpVec2.lerpVectors(start, end, t);
      if (i < segments) {
        const amp = Math.sin(t * Math.PI) * jitter;
        _tmpVec2.x += (Math.random() - 0.5) * 2 * amp;
        _tmpVec2.y += (Math.random() - 0.5) * 2 * amp;
        _tmpVec2.z += (Math.random() - 0.5) * 2 * amp;
      }
      const base = this.lightningVertexCount * 3;
      this.lightningPositions[base] = _tmpVec.x;
      this.lightningPositions[base + 1] = _tmpVec.y;
      this.lightningPositions[base + 2] = _tmpVec.z;
      this.lightningPositions[base + 3] = _tmpVec2.x;
      this.lightningPositions[base + 4] = _tmpVec2.y;
      this.lightningPositions[base + 5] = _tmpVec2.z;
      this.lightningVertexCount += 2;
      _tmpVec.copy(_tmpVec2);
    }
  }

  commitLightningFrame(): void {
    const geo = this.lightningLines.geometry;
    geo.setDrawRange(0, this.lightningVertexCount);
    (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  // ---------------- Sky Updraft & Tidal Vortex ----------------
  spawnVortex(
    origin: THREE.Vector3,
    kind: 'sky-updraft' | 'tidal-vortex'
  ): void {
    const group = new THREE.Group();
    group.position.copy(origin);
    group.xb = {pointerEvents: 'none'};

    const color = kind === 'sky-updraft' ? 0x67e8f9 : 0x0ea5e9;
    const ringMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    for (let i = 0; i < 4; i++) {
      const r = kind === 'sky-updraft' ? 0.14 + i * 0.08 : 0.12 + i * 0.1;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.011, 8, 28), ringMat);
      ring.rotation.x = Math.PI / 2 + (i % 2 === 0 ? 0.18 : -0.14);
      ring.position.y = i * 0.18;
      group.add(ring);
    }

    this.add(group);
    this.vortices.push({
      group,
      center: origin.clone(),
      age: 0,
      maxAge: kind === 'sky-updraft' ? 4.8 : 5.5,
      kind,
      radius: kind === 'sky-updraft' ? 1.85 : 2.25,
    });
  }

  // ---------------- Verdant Flora / Healing Crystal ----------------
  spawnFloraBloom(palmPos: THREE.Vector3): void {
    const group = new THREE.Group();
    group.position.copy(palmPos);
    group.xb = {pointerEvents: 'none'};

    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0x34d399,
      emissive: 0x10b981,
      emissiveIntensity: 0.9,
      roughness: 0.18,
      metalness: 0.3,
      flatShading: true,
    });
    const vineMat = new THREE.MeshBasicMaterial({
      color: 0x6ee7b7,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    // Procedural helical vine tube
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 18; i++) {
      const t = i / 18;
      const a = t * Math.PI * 3.5;
      const r = 0.045 * (1 - t * 0.55);
      pts.push(new THREE.Vector3(Math.cos(a) * r, t * 0.32, Math.sin(a) * r));
    }
    const vineCurve = new THREE.CatmullRomCurve3(pts);
    const vineMesh = new THREE.Mesh(
      new THREE.TubeGeometry(vineCurve, 22, 0.006, 6, false),
      vineMat
    );
    group.add(vineMesh);

    // Floating emerald crystal cluster at apex
    const mainGem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.048, 0),
      crystalMat
    );
    mainGem.scale.set(0.75, 1.55, 0.75);
    mainGem.position.y = 0.34;
    group.add(mainGem);

    for (let s = 0; s < 3; s++) {
      const a = (s / 3) * Math.PI * 2;
      const bud = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.026, 0),
        crystalMat
      );
      bud.position.set(Math.cos(a) * 0.055, 0.25 + s * 0.02, Math.sin(a) * 0.055);
      group.add(bud);
    }

    group.scale.setScalar(0.05);
    this.add(group);
    this.floras.push({group, age: 0, maxAge: 5.5});
  }

  // ---------------- Void Barrier Dome ----------------
  activateVoidDome(center: THREE.Vector3): void {
    this.voidDomeCenter.copy(center);
    this.voidDomeMesh.position.copy(center);
    this.voidDomeMesh.visible = true;
    this.voidDomeRemaining = VOID_DOME_DURATION_S;
    this.spawnBurst(center, 24, 0xa855f7, 0xd8b4fe, 2.2, 0);
  }

  // ---------------- Head Gestures: Empower (Nod) & Dispel (Shake) ----------------
  empowerActiveEffects(
    targets: ElementalTarget[],
    onShatter: (pos: THREE.Vector3, color: number) => void
  ): void {
    // Detonate all flying projectiles with shockwaves
    for (const proj of this.projectiles) {
      this.triggerShockwave(proj.mesh.position, proj.color, 2.4);
      proj.age = proj.maxAge;
    }
    // Overcharge vortices & push nearby crystals outward
    for (const v of this.vortices) {
      this.triggerShockwave(v.center, 0x38bdf8, 2.8);
      for (const t of targets) {
        if (t.shattered) continue;
        const d = t.group.position.distanceTo(v.center);
        if (d < 3.2 && t.body) {
          _tmpVec.subVectors(t.group.position, v.center).normalize().multiplyScalar(2.6);
          _tmpVec.y += 1.6;
          t.body.applyImpulse({x: _tmpVec.x, y: _tmpVec.y, z: _tmpVec.z}, true);
        }
      }
    }
    // Also send a pulse from active earth shields
    for (const side of ['left', 'right'] as const) {
      const s = this.shields[side];
      if (s.active) {
        this.triggerShockwave(s.group.position, 0xf59e0b, 2.6);
      }
    }
    // Crack any weakened crystals immediately
    for (const t of targets) {
      if (!t.shattered && t.hp < t.maxHp * 0.75) {
        t.hp = 0;
        onShatter(t.group.position.clone(), t.color);
      }
    }
  }

  dispelAll(): void {
    for (const side of ['left', 'right'] as const) {
      const s = this.shields[side];
      if (s.active) {
        this.spawnBurst(s.group.position, 22, 0xb08968, 0xddb892, 2.5, -3.5);
        this.deactivateShield(side);
      }
      this.releaseRainbowRibbons(side);
      this.setChargeOrb(side, false);
      this.setHandAura(side, false);
    }
    this.setPlasmaCoreCharge(false);

    if (this.voidDomeRemaining > 0) {
      this.voidDomeRemaining = 0;
      this.voidDomeMesh.visible = false;
      this.spawnBurst(this.voidDomeCenter, 26, 0xa855f7, 0xe9d5ff, 3.0, -0.8);
    }

    for (const r of this.ribbons) {
      this.remove(r.mesh);
      r.geometry.dispose();
      r.material.dispose();
    }
    this.ribbons.length = 0;

    for (const v of this.vortices) {
      this.remove(v.group);
    }
    this.vortices.length = 0;

    for (const f of this.floras) {
      this.remove(f.group);
    }
    this.floras.length = 0;

    for (const p of this.projectiles) {
      this.remove(p.mesh);
      if (p.body && this.world) this.world.removeRigidBody(p.body);
    }
    this.projectiles.length = 0;
  }

  private deactivateShield(side: HandSide): void {
    const s = this.shields[side];
    s.active = false;
    s.remaining = 0;
    s.group.visible = false;
    if (s.body && this.world) {
      this.world.removeRigidBody(s.body);
      s.body = null;
    }
  }

  getActiveShields(): Array<{
    pos: THREE.Vector3;
    normal: THREE.Vector3;
    radius: number;
  }> {
    const out: Array<{pos: THREE.Vector3; normal: THREE.Vector3; radius: number}> = [];
    for (const side of ['left', 'right'] as const) {
      const s = this.shields[side];
      if (s.active) {
        out.push({pos: s.group.position, normal: s.normal, radius: 0.34});
      }
    }
    return out;
  }

  // ---------------- Per-Frame Update ----------------
  update(
    dt: number,
    camera: THREE.Camera,
    targets: ElementalTarget[],
    onHitTarget: (
      target: ElementalTarget,
      impulse: THREE.Vector3,
      damage: number,
      impactPos: THREE.Vector3,
      kind: ElementalProjectile['kind'],
      ownerSide: HandSide | 'both',
      impactSpeed: number
    ) => void,
    onBounce?: (
      pos: THREE.Vector3,
      impactSpeed: number,
      kind: ElementalProjectile['kind'],
      ownerSide: HandSide | 'both'
    ) => void
  ): void {
    this.elapsed += dt;
    this.fireballMat.uniforms.uTime.value = this.elapsed;
    this.magmaMat.uniforms.uTime.value = this.elapsed;
    this.plasmaMat.uniforms.uTime.value = this.elapsed;

    // 1. Update pooled instanced particles
    let anyParticleUpdated = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      anyParticleUpdated = true;
      p.age += dt;
      if (p.age >= p.maxAge) {
        p.active = false;
        _dummy.scale.setScalar(0);
        _dummy.updateMatrix();
        this.particleMesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }
      const t = p.age / p.maxAge;
      p.vel.y += p.gravity * dt;
      p.vel.multiplyScalar(Math.pow(p.drag, dt * 60));
      p.pos.addScaledVector(p.vel, dt);

      const s = THREE.MathUtils.lerp(p.startScale, p.endScale, t);
      _dummy.position.copy(p.pos);
      _dummy.rotation.set(p.age * 4, p.age * 3, 0);
      _dummy.scale.setScalar(s);
      _dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, _dummy.matrix);
      this.particleMesh.setColorAt(i, p.color);
    }
    if (anyParticleUpdated) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
      if (this.particleMesh.instanceColor) {
        this.particleMesh.instanceColor.needsUpdate = true;
      }
    }

    // 2. Update Projectiles & Collisions
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      proj.age += dt;
      proj.prevVelocity.copy(proj.velocity);

      if (proj.body) {
        const t = proj.body.translation();
        const lv = proj.body.linvel();
        proj.mesh.position.set(t.x, t.y, t.z);
        proj.velocity.set(lv.x, lv.y, lv.z);

        // Detect Rapier 3D collision bounce from sudden velocity impulse change
        const deltaV = proj.prevVelocity.distanceTo(proj.velocity);
        if (
          proj.age > 0.04 &&
          proj.age - proj.lastBounceAge > 0.09 &&
          deltaV > 1.75
        ) {
          proj.bounces++;
          proj.lastBounceAge = proj.age;
          this.spawnBurst(
            proj.mesh.position,
            6,
            proj.color,
            0xffe4b5,
            Math.min(2.8, 1.0 + deltaV * 0.28),
            -2.4
          );
          onBounce?.(proj.mesh.position, deltaV, proj.kind, proj.ownerSide);
        }
      } else {
        proj.mesh.position.addScaledVector(proj.velocity, dt);
      }

      // Emit trailing sparks
      if (Math.random() < (proj.kind === 'frost-shard' ? 0.35 : 0.72)) {
        _tmpVec.set(
          (Math.random() - 0.5) * 0.45,
          (Math.random() - 0.5) * 0.45 + 0.15,
          (Math.random() - 0.5) * 0.45
        );
        this.spawnParticle(proj.mesh.position, _tmpVec, proj.color, {
          maxAge: 0.28,
          startScale: proj.kind === 'frost-shard' ? 0.35 : 0.65,
          gravity: proj.kind === 'frost-shard' ? -0.6 : 0.4,
        });
      }

      // Floor bounce fallback if no Rapier body
      if (!proj.body && proj.mesh.position.y < 0.05) {
        const impactSpeed = Math.max(1.2, Math.abs(proj.velocity.y) * 1.7);
        proj.mesh.position.y = 0.05;
        proj.velocity.y = Math.abs(proj.velocity.y) * 0.7;
        proj.bounces++;
        onBounce?.(proj.mesh.position, impactSpeed, proj.kind, proj.ownerSide);
      }

      // Check collision against elemental targets
      let exploded = false;
      for (const target of targets) {
        if (target.shattered) continue;
        _tmpVec3.copy(target.group.position);
        _tmpVec3.y += 0.18;
        if (proj.mesh.position.distanceTo(_tmpVec3) < proj.radius + 0.24) {
          const impactSpeed = Math.max(
            proj.impulseStrength * 1.35,
            proj.velocity.length()
          );
          _tmpVec2.copy(proj.velocity).normalize().multiplyScalar(proj.impulseStrength);
          _tmpVec2.y += 0.45;
          onHitTarget(
            target,
            _tmpVec2,
            proj.damage,
            proj.mesh.position.clone(),
            proj.kind,
            proj.ownerSide,
            impactSpeed
          );
          this.spawnBurst(
            proj.mesh.position,
            proj.kind === 'frost-shard' ? 8 : 22,
            proj.color,
            0xffffff,
            3.2,
            -2.4
          );
          if (proj.kind === 'plasma-core') {
            this.triggerShockwave(proj.mesh.position, 0xf43f5e, 2.8);
          }
          exploded = true;
          break;
        }
      }

      if (exploded || proj.age >= proj.maxAge) {
        if (!exploded && proj.kind !== 'frost-shard') {
          this.spawnBurst(proj.mesh.position, 12, proj.color, 0xffd166, 2.0, -2.0);
        }
        this.remove(proj.mesh);
        if (proj.body && this.world) this.world.removeRigidBody(proj.body);
        this.projectiles.splice(i, 1);
      }
    }

    // 3. Update Rainbow Ribbons (camera-facing billboard strip + smooth dissolve)
    camera.getWorldPosition(_tmpVec3);
    for (let r = this.ribbons.length - 1; r >= 0; r--) {
      const trail = this.ribbons[r];
      trail.material.uniforms.uTime.value = this.elapsed;

      let aliveCount = 0;
      for (let i = 0; i < trail.count; i++) {
        trail.ages[i] += dt;
        if (trail.ages[i] < 3.4) aliveCount++;
      }

      if (!trail.emitting && aliveCount === 0) {
        this.remove(trail.mesh);
        trail.geometry.dispose();
        trail.material.dispose();
        this.ribbons.splice(r, 1);
        continue;
      }

      const posAttr = trail.geometry.attributes.position as THREE.BufferAttribute;
      const alphaAttr = trail.geometry.attributes.aAlpha as THREE.BufferAttribute;
      const alongAttr = trail.geometry.attributes.aAlong as THREE.BufferAttribute;

      for (let i = 0; i < RIBBON_POINTS; i++) {
        const idx = Math.min(i, Math.max(0, trail.count - 1));
        const p = trail.points[idx];
        const prev = trail.points[Math.max(0, idx - 1)];
        const next = trail.points[Math.min(Math.max(0, trail.count - 1), idx + 1)];

        _tmpVec.subVectors(next, prev);
        if (_tmpVec.lengthSq() < 1e-6) _tmpVec.set(0, 1, 0);
        else _tmpVec.normalize();

        _tmpVec2.subVectors(_tmpVec3, p).normalize();
        const sideVec = _tmpVec.cross(_tmpVec2);
        if (sideVec.lengthSq() < 1e-6) sideVec.set(1, 0, 0);
        else sideVec.normalize();

        const life = THREE.MathUtils.clamp(1 - trail.ages[idx] / 3.4, 0, 1);
        const taper =
          trail.count > 1 ? Math.sin((i / Math.max(1, trail.count - 1)) * Math.PI) : 0;
        const halfW = trail.width * (0.35 + 0.65 * taper) * life;

        const v0 = i * 2;
        const v1 = v0 + 1;
        posAttr.setXYZ(
          v0,
          p.x + sideVec.x * halfW,
          p.y + sideVec.y * halfW,
          p.z + sideVec.z * halfW
        );
        posAttr.setXYZ(
          v1,
          p.x - sideVec.x * halfW,
          p.y - sideVec.y * halfW,
          p.z - sideVec.z * halfW
        );
        const a = i < trail.count ? life * (0.2 + 0.8 * taper) : 0;
        alphaAttr.setX(v0, a);
        alphaAttr.setX(v1, a);
        const along = i / (RIBBON_POINTS - 1);
        alongAttr.setX(v0, along);
        alongAttr.setX(v1, along);
      }

      posAttr.needsUpdate = true;
      alphaAttr.needsUpdate = true;
      alongAttr.needsUpdate = true;
    }

    // 4. Update Floating Earth Shields (damped exponential smoothing to remove wrist micro-jitter)
    for (const side of ['left', 'right'] as const) {
      const s = this.shields[side];
      if (!s.active) continue;
      s.remaining -= dt;
      if (s.remaining <= 0) {
        this.spawnBurst(s.group.position, 14, 0xb08968, 0xddb892, 1.6, -2.5);
        this.deactivateShield(side);
        continue;
      }

      const damp = 1 - Math.exp(-9.5 * dt);
      s.group.position.lerp(s.targetPos, damp);
      s.group.quaternion.slerp(s.targetQuat, damp);
      const scaleTarget = s.remaining < 0.45 ? s.remaining / 0.45 : 1.0;
      const nextScale = THREE.MathUtils.damp(s.group.scale.x, scaleTarget, 12, dt);
      s.group.scale.setScalar(nextScale);

      // Gentle hovering wobble on outer plates
      s.group.children.forEach((child, idx) => {
        if (idx >= 2) {
          child.position.z =
            (idx % 2 === 0 ? 1 : -1) * 0.014 + Math.sin(this.elapsed * 3.5 + idx) * 0.008;
        }
      });

      if (s.body) {
        s.body.setNextKinematicTranslation({
          x: s.group.position.x,
          y: s.group.position.y,
          z: s.group.position.z,
        });
        s.body.setNextKinematicRotation({
          x: s.group.quaternion.x,
          y: s.group.quaternion.y,
          z: s.group.quaternion.z,
          w: s.group.quaternion.w,
        });
      }
    }

    // 5. Update Void Barrier Dome
    if (this.voidDomeRemaining > 0) {
      this.voidDomeRemaining -= dt;
      this.voidDomeMat.uniforms.uTime.value = this.elapsed;
      const fade =
        this.voidDomeRemaining < 0.8
          ? this.voidDomeRemaining / 0.8
          : Math.min(1, (VOID_DOME_DURATION_S - this.voidDomeRemaining) / 0.35);
      this.voidDomeMat.uniforms.uOpacity.value = Math.max(0, fade);
      const scale = 0.72 + 0.28 * Math.min(1, fade * 1.2);
      this.voidDomeMesh.scale.setScalar(scale);
      if (this.voidDomeRemaining <= 0) {
        this.voidDomeMesh.visible = false;
      }
    }

    // 6. Update Shockwaves
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.age += dt;
      const t = Math.min(1, sw.age / sw.maxAge);
      sw.material.uniforms.uProgress.value = t;
      const radius = THREE.MathUtils.lerp(0.14, sw.maxRadius, 1 - Math.pow(1 - t, 3));
      sw.mesh.scale.setScalar(radius);
      if (t >= 1) {
        this.remove(sw.mesh);
        sw.material.dispose();
        this.shockwaves.splice(i, 1);
      }
    }

    // 7. Update Vortices (Sky Updraft buoyancy & Tidal Vortex orbital pull)
    for (let i = this.vortices.length - 1; i >= 0; i--) {
      const v = this.vortices[i];
      v.age += dt;
      v.group.rotation.y += dt * (v.kind === 'tidal-vortex' ? 5.2 : 3.4);
      const life = 1 - v.age / v.maxAge;
      const sc = Math.min(1, v.age * 4) * Math.min(1, life * 3);
      v.group.scale.setScalar(Math.max(0.01, sc));

      if (Math.random() < 0.5) {
        const a = Math.random() * Math.PI * 2;
        const r = 0.15 + Math.random() * 0.45;
        _tmpVec.set(
          v.center.x + Math.cos(a) * r,
          v.center.y + Math.random() * 0.65,
          v.center.z + Math.sin(a) * r
        );
        _tmpVec2.set(-Math.sin(a) * 1.1, v.kind === 'sky-updraft' ? 1.5 : 0.4, Math.cos(a) * 1.1);
        this.spawnParticle(_tmpVec, _tmpVec2, v.kind === 'sky-updraft' ? 0x67e8f9 : 0x0ea5e9, {
          maxAge: 0.48,
          startScale: 0.55,
          gravity: 0.1,
        });
      }

      // Apply physical forces to nearby crystal rigid bodies
      for (const target of targets) {
        if (target.shattered || !target.body) continue;
        const pos = target.group.position;
        const dist = pos.distanceTo(v.center);
        if (dist < v.radius) {
          if (v.kind === 'sky-updraft') {
            target.body.applyImpulse({x: 0, y: 0.22 * dt * 60 * 0.08, z: 0}, true);
          } else {
            // Tangential orbit + inward suction
            _tmpVec.subVectors(v.center, pos);
            _tmpVec.y *= 0.4;
            const inward = _tmpVec.clone().normalize().multiplyScalar(0.09);
            const tangent = _tmpVec.clone().cross(_up).normalize().multiplyScalar(0.14);
            target.body.applyImpulse(
              {
                x: (inward.x + tangent.x) * dt * 28,
                y: (inward.y + 0.04) * dt * 28,
                z: (inward.z + tangent.z) * dt * 28,
              },
              true
            );
          }
        }
      }

      if (v.age >= v.maxAge) {
        this.remove(v.group);
        this.vortices.splice(i, 1);
      }
    }

    // 8. Update Verdant Flora Clusters
    for (let i = this.floras.length - 1; i >= 0; i--) {
      const f = this.floras[i];
      f.age += dt;
      const grow = Math.min(1, f.age / 0.55);
      const fade = f.age > f.maxAge - 0.6 ? (f.maxAge - f.age) / 0.6 : 1;
      f.group.scale.setScalar(Math.max(0.01, grow * fade));
      f.group.rotation.y += dt * 0.8;
      if (Math.random() < 0.22) {
        _tmpVec.copy(f.group.position).add(new THREE.Vector3(0, 0.28, 0));
        _tmpVec2.set((Math.random() - 0.5) * 0.3, 0.35 + Math.random() * 0.3, (Math.random() - 0.5) * 0.3);
        this.spawnParticle(_tmpVec, _tmpVec2, 0x34d399, {
          maxAge: 0.7,
          startScale: 0.42,
        });
      }
      if (f.age >= f.maxAge) {
        this.remove(f.group);
        this.floras.splice(i, 1);
      }
    }
  }

  dispose(): void {
    this.dispelAll();
    this.particleMesh.geometry.dispose();
    (this.particleMesh.material as THREE.Material).dispose();
    this.fireballGeo.dispose();
    this.frostShardGeo.dispose();
    this.shockwaveGeo.dispose();
    this.fireballMat.dispose();
    this.magmaMat.dispose();
    this.plasmaMat.dispose();
    this.frostMat.dispose();
    this.shieldRockMat.dispose();
    this.shieldRuneMat.dispose();
    this.voidDomeMesh.geometry.dispose();
    this.voidDomeMat.dispose();
    this.lightningLines.geometry.dispose();
    (this.lightningLines.material as THREE.Material).dispose();
  }
}
