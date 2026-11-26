import * as THREE from 'three';

import type {
  ElementalThemeId,
  ThemeLightRig,
} from './ElementalThemeEnvironment.ts';

export interface SkyboxThemeConfig {
  topHex: number;
  horizonHex: number;
  bottomHex: number;
  accentHex: number;
  sunColorHex: number;
  /** Normalized direction to the sky's sun / moon / celestial focus. */
  sunDir: readonly [number, number, number];
  /**
   * Packed atmospheric feature weights:
   * x = cloud/ash density (0..1)
   * y = aurora ribbon intensity (0..1)
   * z = starfield & nebula intensity (0..1)
   * w = horizon volcanic pulse / storm lightning flash (0..1)
   */
  atmosphere: readonly [number, number, number, number];
  fogHex: number;
  fogDensity: number;
  hemiSkyHex: number;
  hemiGroundHex: number;
  hemiIntensity: number;
  keyHex: number;
  keyIntensity: number;
  rimHex: number;
  rimIntensity: number;
}

export const SKYBOX_THEME_CONFIGS: Record<ElementalThemeId, SkyboxThemeConfig> = {
  volcanic: {
    topHex: 0x120507,
    horizonHex: 0x7c2210,
    bottomHex: 0x1a0806,
    accentHex: 0xff6b2b,
    sunColorHex: 0xff9248,
    sunDir: [0.46, 0.24, -0.85],
    atmosphere: [0.78, 0.0, 0.14, 0.72],
    fogHex: 0x3b130c,
    fogDensity: 0.048,
    hemiSkyHex: 0xffb07c,
    hemiGroundHex: 0x451209,
    hemiIntensity: 1.78,
    keyHex: 0xffa062,
    keyIntensity: 2.5,
    rimHex: 0xff4d1a,
    rimIntensity: 1.4,
  },
  'frozen-tundra': {
    topHex: 0x061326,
    horizonHex: 0x2b6a96,
    bottomHex: 0x102438,
    accentHex: 0x38f2c8,
    sunColorHex: 0xdff6ff,
    sunDir: [-0.38, 0.42, -0.82],
    atmosphere: [0.36, 0.92, 0.58, 0.0],
    fogHex: 0x1b4260,
    fogDensity: 0.042,
    hemiSkyHex: 0xe0f2fe,
    hemiGroundHex: 0x2a4d69,
    hemiIntensity: 2.15,
    keyHex: 0xf0f9ff,
    keyIntensity: 2.38,
    rimHex: 0x38bdf8,
    rimIntensity: 1.3,
  },
  'ancient-ruins': {
    topHex: 0x17313d,
    horizonHex: 0x9c7b4f,
    bottomHex: 0x24281e,
    accentHex: 0xfde68a,
    sunColorHex: 0xffe09e,
    sunDir: [0.58, 0.48, -0.66],
    atmosphere: [0.54, 0.0, 0.08, 0.0],
    fogHex: 0x494938,
    fogDensity: 0.038,
    hemiSkyHex: 0xfff3d6,
    hemiGroundHex: 0x3f4732,
    hemiIntensity: 2.05,
    keyHex: 0xffe4b0,
    keyIntensity: 2.48,
    rimHex: 0x6ee7b7,
    rimIntensity: 1.05,
  },
  'storm-citadel': {
    topHex: 0x070a1a,
    horizonHex: 0x28356b,
    bottomHex: 0x0e1226,
    accentHex: 0x60a5fa,
    sunColorHex: 0xb8d4ff,
    sunDir: [-0.26, 0.52, -0.81],
    atmosphere: [0.94, 0.14, 0.22, 0.95],
    fogHex: 0x171f40,
    fogDensity: 0.048,
    hemiSkyHex: 0xc7d2fe,
    hemiGroundHex: 0x1e2242,
    hemiIntensity: 1.85,
    keyHex: 0xdce4ff,
    keyIntensity: 2.25,
    rimHex: 0x60a5fa,
    rimIntensity: 1.5,
  },
  'arcane-sanctum': {
    topHex: 0x090318,
    horizonHex: 0x4c1d70,
    bottomHex: 0x140826,
    accentHex: 0xe879f9,
    sunColorHex: 0xf5d0fe,
    sunDir: [0.16, 0.58, -0.8],
    atmosphere: [0.3, 0.65, 1.0, 0.18],
    fogHex: 0x241042,
    fogDensity: 0.044,
    hemiSkyHex: 0xf3e8ff,
    hemiGroundHex: 0x2a1447,
    hemiIntensity: 1.98,
    keyHex: 0xfde7ff,
    keyIntensity: 2.25,
    rimHex: 0xe879f9,
    rimIntensity: 1.45,
  },
};

const MORPH_DURATION_S = 1.45;
const KEY_LIGHT_DISTANCE = 6.5;

interface LightingSnapshot {
  fogColor: THREE.Color;
  fogDensity: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  keyColor: THREE.Color;
  keyIntensity: number;
  keyDir: THREE.Vector3;
  rimColor: THREE.Color;
  rimIntensity: number;
}

const SKYBOX_VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldDir;

  void main() {
    vWorldDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKYBOX_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uMorph;

  // Outgoing ("From") theme sky uniforms
  uniform vec3 uFromTop;
  uniform vec3 uFromHorizon;
  uniform vec3 uFromBottom;
  uniform vec3 uFromAccent;
  uniform vec3 uFromSunColor;
  uniform vec3 uFromSunDir;
  uniform vec4 uFromAtmo; // x: clouds, y: aurora, z: stars, w: storm/volcanic glow

  // Incoming ("To") theme sky uniforms
  uniform vec3 uToTop;
  uniform vec3 uToHorizon;
  uniform vec3 uToBottom;
  uniform vec3 uToAccent;
  uniform vec3 uToSunColor;
  uniform vec3 uToSunDir;
  uniform vec4 uToAtmo;

  varying vec3 vWorldDir;

  float hash21(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }

  float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float amp = 0.5;
    mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
    for (int i = 0; i < 4; i++) {
      v += amp * noise2(p);
      p = rot * p * 2.02 + vec2(17.3, 9.2);
      amp *= 0.5;
    }
    return v;
  }

  vec3 evaluateSky(
    vec3 dir,
    vec3 topCol,
    vec3 horizonCol,
    vec3 bottomCol,
    vec3 accentCol,
    vec3 sunCol,
    vec3 sunDir,
    vec4 atmo
  ) {
    float h = dir.y;
    float upH = clamp(h, 0.0, 1.0);
    float downH = clamp(-h, 0.0, 1.0);

    // 1. Multi-band Rayleigh-inspired zenith / horizon / nadir atmospheric gradient
    vec3 upperSky = mix(horizonCol, topCol, pow(upH, 0.58));
    vec3 lowerSky = mix(horizonCol, bottomCol, pow(downH, 0.52));
    vec3 col = h >= 0.0 ? upperSky : lowerSky;

    // Warm/cool atmospheric horizon haze band
    float horizonGlow = exp(-abs(h) * 6.5);
    col += horizonCol * horizonGlow * 0.24;

    // 2. Celestial sun/moon disc & Mie forward scattering halo
    vec3 sDir = normalize(sunDir);
    float sunDot = max(dot(dir, sDir), 0.0);
    float mieScatter = pow(sunDot, 7.0) * 0.36 + pow(sunDot, 42.0) * 0.42;
    float sunDisc = smoothstep(0.9965, 0.9992, sunDot);
    col += sunCol * (mieScatter * (0.45 + 0.55 * horizonGlow) + sunDisc * 1.45);

    // 3. Procedural animated FBM cloud deck / ash plumes (upper hemisphere)
    if (atmo.x > 0.01 && h > -0.06) {
      vec2 skyUv = dir.xz / (max(h, 0.05) + 0.26);
      float drift = uTime * 0.018;
      float c1 = fbm(skyUv * 1.15 + vec2(drift, -drift * 0.65));
      float c2 = fbm(skyUv * 2.35 - vec2(drift * 1.4, drift * 0.5));
      float cloud = smoothstep(0.42, 0.82, c1 * 0.68 + c2 * 0.32);
      float cloudMask = smoothstep(-0.04, 0.14, h) * (1.0 - smoothstep(0.75, 1.0, upH) * 0.35);
      vec3 cloudDark = mix(topCol, horizonCol, 0.45) * 0.85;
      vec3 cloudLit = mix(horizonCol * 1.35, sunCol * 1.15, pow(sunDot, 3.0) * 0.7 + 0.2);
      vec3 cloudColor = mix(cloudDark, cloudLit, smoothstep(0.45, 0.85, c1));
      col = mix(col, cloudColor, cloud * cloudMask * atmo.x * 0.72);
    }

    // 4. Shimmering Aurora ribbons (Frozen Tundra / Arcane Sanctum)
    if (atmo.y > 0.01 && h > 0.02) {
      vec2 aUv = vec2(atan(dir.z, dir.x) * 1.8, h * 3.8);
      float wave = sin(aUv.x * 2.2 + uTime * 0.45 + fbm(aUv * 1.4 + uTime * 0.08) * 3.6);
      float curtain = smoothstep(0.35, 0.96, 0.5 + 0.5 * wave);
      float altFade = smoothstep(0.06, 0.28, h) * (1.0 - smoothstep(0.55, 0.92, h));
      float streaks = 0.65 + 0.35 * sin(aUv.x * 16.0 - uTime * 1.1);
      vec3 auroraCol = mix(accentCol, mix(sunCol, vec3(0.55, 0.95, 1.0), 0.5), 0.5 + 0.5 * sin(aUv.x + uTime * 0.3));
      col += auroraCol * curtain * altFade * streaks * atmo.y * 0.55;
    }

    // 5. Starfield & subtle nebula bands (Arcane Sanctum / Tundra / Night)
    if (atmo.z > 0.01 && h > 0.04) {
      vec3 starCell = floor(dir * 135.0);
      float starSeed = hash31(starCell);
      float starMask = step(0.992, starSeed);
      float twinkle = 0.55 + 0.45 * sin(uTime * (2.2 + starSeed * 4.0) + starSeed * 62.0);
      float starAlt = smoothstep(0.06, 0.35, h);
      col += mix(vec3(1.0), accentCol, 0.35) * starMask * twinkle * starAlt * atmo.z * 0.95;

      // Soft astral nebula band
      float neb = fbm(vec2(atan(dir.z, dir.x) * 2.0 + 1.5, h * 3.2 - uTime * 0.012));
      float nebBand = smoothstep(0.52, 0.86, neb) * smoothstep(0.08, 0.45, h);
      col += accentCol * nebBand * atmo.z * 0.24;
    }

    // 6. Horizon thermal pulse / distant sheet-lightning activity
    if (atmo.w > 0.01) {
      float az = atan(dir.z, dir.x);
      float emberPulse = 0.5 + 0.5 * sin(az * 4.0 + uTime * 0.85);
      float flashWave = pow(max(0.0, sin(uTime * 1.9 + sin(uTime * 0.7) * 2.5)), 16.0);
      float flashAz = smoothstep(0.4, 1.0, cos(az - floor(uTime * 0.6) * 2.3));
      float lowBand = exp(-abs(h - 0.04) * 9.5);
      col += accentCol * lowBand * (emberPulse * 0.18 + flashWave * flashAz * 0.75) * atmo.w;
    }

    return col;
  }

  void main() {
    vec3 dir = normalize(vWorldDir);
    float m = clamp(uMorph, 0.0, 1.0);

    // Fast path when settled on target theme
    if (m >= 0.999) {
      vec3 finalCol = evaluateSky(
        dir,
        uToTop,
        uToHorizon,
        uToBottom,
        uToAccent,
        uToSunColor,
        uToSunDir,
        uToAtmo
      );
      gl_FragColor = vec4(finalCol, 1.0);
      return;
    }

    // Shader-based sweeping horizon-to-zenith organic morph front
    vec2 morphCoord = vec2(atan(dir.z, dir.x) * 1.4, dir.y * 2.8);
    float swirlNoise = fbm(morphCoord + vec2(uTime * 0.14, -uTime * 0.08));
    // Maps sphere elevation (-1..1) + organic turbulence into a sweeping front
    float sweepPos = clamp((dir.y + 0.35) * 0.65 + (swirlNoise - 0.5) * 0.32, 0.0, 1.0);
    float localT = smoothstep(sweepPos - 0.24, sweepPos + 0.24, m * 1.38 - 0.19);

    vec3 colFrom = evaluateSky(
      dir,
      uFromTop,
      uFromHorizon,
      uFromBottom,
      uFromAccent,
      uFromSunColor,
      uFromSunDir,
      uFromAtmo
    );
    vec3 colTo = evaluateSky(
      dir,
      uToTop,
      uToHorizon,
      uToBottom,
      uToAccent,
      uToSunColor,
      uToSunDir,
      uToAtmo
    );

    vec3 blended = mix(colFrom, colTo, localT);

    // Subtle luminous spectral shimmer along the active morph boundary
    float edgeMask = 4.0 * localT * (1.0 - localT);
    float transitionEnvelope = sin(m * 3.14159265);
    vec3 morphRim = mix(uFromAccent, uToAccent, localT);
    blended += morphRim * edgeMask * transitionEnvelope * 0.28;

    gl_FragColor = vec4(blended, 1.0);
  }
`;

const _tmpVec = new THREE.Vector3();
const _tmpColorA = new THREE.Color();
const _tmpColorB = new THREE.Color();
const _tmpColorC = new THREE.Color();
const _tmpAtmo = new THREE.Vector4();
const _neutralSky = new THREE.Color(0xdbeafe);
const _neutralGround = new THREE.Color(0x334155);
const _neutralKey = new THREE.Color(0xfff4e0);
const _neutralRim = new THREE.Color(0x93c5fd);
const _neutralKeyPos = new THREE.Vector3(2.5, 5.5, 2.0);

function smoothstep01(t: number): number {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/**
 * Procedural GLSL skybox with shader-based atmospheric morphing across all
 * elemental environmental themes. Synchronizes horizon fog, directional key
 * sun position, hemisphere sky/ground fill, and rim lighting seamlessly with
 * the sky dome's shader transition progress.
 */
export class ProceduralSkybox extends THREE.Group {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  readonly sceneFog: THREE.FogExp2;

  private readonly geometry: THREE.SphereGeometry;
  private morphProgress = 1.0;
  private activeTheme: ElementalThemeId;

  private fromLight: LightingSnapshot;
  private toLight: LightingSnapshot;

  constructor(initialTheme: ElementalThemeId = 'volcanic') {
    super();
    this.name = 'Procedural Elemental Skybox';
    this.xb = {pointerEvents: 'none'};
    this.activeTheme = initialTheme;

    const initCfg = SKYBOX_THEME_CONFIGS[initialTheme];
    this.sceneFog = new THREE.FogExp2(initCfg.fogHex, initCfg.fogDensity);

    this.fromLight = this.createLightingSnapshot(initCfg);
    this.toLight = this.createLightingSnapshot(initCfg);

    this.geometry = new THREE.SphereGeometry(32, 40, 28);
    this.material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTime: {value: 0},
        uMorph: {value: 1.0},

        uFromTop: {value: new THREE.Color(initCfg.topHex)},
        uFromHorizon: {value: new THREE.Color(initCfg.horizonHex)},
        uFromBottom: {value: new THREE.Color(initCfg.bottomHex)},
        uFromAccent: {value: new THREE.Color(initCfg.accentHex)},
        uFromSunColor: {value: new THREE.Color(initCfg.sunColorHex)},
        uFromSunDir: {
          value: new THREE.Vector3(...initCfg.sunDir).normalize(),
        },
        uFromAtmo: {value: new THREE.Vector4(...initCfg.atmosphere)},

        uToTop: {value: new THREE.Color(initCfg.topHex)},
        uToHorizon: {value: new THREE.Color(initCfg.horizonHex)},
        uToBottom: {value: new THREE.Color(initCfg.bottomHex)},
        uToAccent: {value: new THREE.Color(initCfg.accentHex)},
        uToSunColor: {value: new THREE.Color(initCfg.sunColorHex)},
        uToSunDir: {
          value: new THREE.Vector3(...initCfg.sunDir).normalize(),
        },
        uToAtmo: {value: new THREE.Vector4(...initCfg.atmosphere)},
      },
      vertexShader: SKYBOX_VERTEX_SHADER,
      fragmentShader: SKYBOX_FRAGMENT_SHADER,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'Procedural Skybox Dome';
    this.mesh.renderOrder = -10;
    this.mesh.frustumCulled = false;
    this.mesh.xb = {pointerEvents: 'none'};
    this.add(this.mesh);
  }

  private createLightingSnapshot(cfg: SkyboxThemeConfig): LightingSnapshot {
    return {
      fogColor: new THREE.Color(cfg.fogHex),
      fogDensity: cfg.fogDensity,
      hemiSky: new THREE.Color(cfg.hemiSkyHex),
      hemiGround: new THREE.Color(cfg.hemiGroundHex),
      hemiIntensity: cfg.hemiIntensity,
      keyColor: new THREE.Color(cfg.keyHex),
      keyIntensity: cfg.keyIntensity,
      keyDir: new THREE.Vector3(...cfg.sunDir).normalize(),
      rimColor: new THREE.Color(cfg.rimHex),
      rimIntensity: cfg.rimIntensity,
    };
  }

  /**
   * Begins a smooth shader-driven atmospheric & lighting morph to `nextTheme`.
   * If a previous morph is still in flight, snapshots the current blended state
   * into the `From` uniforms so repeated theme switches never snap or pop.
   */
  transitionTo(nextTheme: ElementalThemeId): void {
    if (this.activeTheme === nextTheme && this.morphProgress >= 0.999) return;

    const u = this.material.uniforms;
    const t = smoothstep01(this.morphProgress);

    // 1. Snapshot current shader sky state into From uniforms
    (u.uFromTop.value as THREE.Color).lerp(u.uToTop.value as THREE.Color, t);
    (u.uFromHorizon.value as THREE.Color).lerp(
      u.uToHorizon.value as THREE.Color,
      t
    );
    (u.uFromBottom.value as THREE.Color).lerp(
      u.uToBottom.value as THREE.Color,
      t
    );
    (u.uFromAccent.value as THREE.Color).lerp(
      u.uToAccent.value as THREE.Color,
      t
    );
    (u.uFromSunColor.value as THREE.Color).lerp(
      u.uToSunColor.value as THREE.Color,
      t
    );
    (u.uFromSunDir.value as THREE.Vector3)
      .lerp(u.uToSunDir.value as THREE.Vector3, t)
      .normalize();
    _tmpAtmo.copy(u.uFromAtmo.value as THREE.Vector4).lerp(
      u.uToAtmo.value as THREE.Vector4,
      t
    );
    (u.uFromAtmo.value as THREE.Vector4).copy(_tmpAtmo);

    // 2. Snapshot current lighting rig state into fromLight
    this.fromLight.fogColor.lerp(this.toLight.fogColor, t);
    this.fromLight.fogDensity = THREE.MathUtils.lerp(
      this.fromLight.fogDensity,
      this.toLight.fogDensity,
      t
    );
    this.fromLight.hemiSky.lerp(this.toLight.hemiSky, t);
    this.fromLight.hemiGround.lerp(this.toLight.hemiGround, t);
    this.fromLight.hemiIntensity = THREE.MathUtils.lerp(
      this.fromLight.hemiIntensity,
      this.toLight.hemiIntensity,
      t
    );
    this.fromLight.keyColor.lerp(this.toLight.keyColor, t);
    this.fromLight.keyIntensity = THREE.MathUtils.lerp(
      this.fromLight.keyIntensity,
      this.toLight.keyIntensity,
      t
    );
    this.fromLight.keyDir.lerp(this.toLight.keyDir, t).normalize();
    this.fromLight.rimColor.lerp(this.toLight.rimColor, t);
    this.fromLight.rimIntensity = THREE.MathUtils.lerp(
      this.fromLight.rimIntensity,
      this.toLight.rimIntensity,
      t
    );

    // 3. Populate To uniforms & toLight from the target theme
    const cfg = SKYBOX_THEME_CONFIGS[nextTheme];
    (u.uToTop.value as THREE.Color).setHex(cfg.topHex);
    (u.uToHorizon.value as THREE.Color).setHex(cfg.horizonHex);
    (u.uToBottom.value as THREE.Color).setHex(cfg.bottomHex);
    (u.uToAccent.value as THREE.Color).setHex(cfg.accentHex);
    (u.uToSunColor.value as THREE.Color).setHex(cfg.sunColorHex);
    (u.uToSunDir.value as THREE.Vector3)
      .set(cfg.sunDir[0], cfg.sunDir[1], cfg.sunDir[2])
      .normalize();
    (u.uToAtmo.value as THREE.Vector4).set(
      cfg.atmosphere[0],
      cfg.atmosphere[1],
      cfg.atmosphere[2],
      cfg.atmosphere[3]
    );

    this.toLight.fogColor.setHex(cfg.fogHex);
    this.toLight.fogDensity = cfg.fogDensity;
    this.toLight.hemiSky.setHex(cfg.hemiSkyHex);
    this.toLight.hemiGround.setHex(cfg.hemiGroundHex);
    this.toLight.hemiIntensity = cfg.hemiIntensity;
    this.toLight.keyColor.setHex(cfg.keyHex);
    this.toLight.keyIntensity = cfg.keyIntensity;
    this.toLight.keyDir
      .set(cfg.sunDir[0], cfg.sunDir[1], cfg.sunDir[2])
      .normalize();
    this.toLight.rimColor.setHex(cfg.rimHex);
    this.toLight.rimIntensity = cfg.rimIntensity;

    this.activeTheme = nextTheme;
    this.morphProgress = 0;
    u.uMorph.value = 0;
  }

  /**
   * Advances the skybox shader transition and synchronizes scene fog + 3-point
   * lighting (colors, intensities, and directional key light sun vector).
   */
  update(
    dt: number,
    elapsed: number,
    scene: THREE.Scene,
    lights: ThemeLightRig,
    themeEnabled: boolean,
    immersiveBackdrop: boolean,
    camera?: THREE.Camera
  ): void {
    const u = this.material.uniforms;
    u.uTime.value = elapsed;

    if (this.morphProgress < 1) {
      this.morphProgress = Math.min(1, this.morphProgress + dt / MORPH_DURATION_S);
      u.uMorph.value = this.morphProgress;
    }

    // Keep sky dome centered on camera so horizon distance stays constant in XR
    if (camera) {
      camera.getWorldPosition(_tmpVec);
      this.mesh.position.copy(_tmpVec);
    }

    const t = smoothstep01(this.morphProgress);

    // 1. Sky dome & horizon-matched fog visibility
    if (themeEnabled && immersiveBackdrop) {
      this.mesh.visible = true;
      this.sceneFog.color
        .copy(this.fromLight.fogColor)
        .lerp(this.toLight.fogColor, t);
      this.sceneFog.density = THREE.MathUtils.lerp(
        this.fromLight.fogDensity,
        this.toLight.fogDensity,
        t
      );
      if (scene.fog !== this.sceneFog) {
        scene.fog = this.sceneFog;
      }
    } else {
      this.mesh.visible = false;
      if (scene.fog === this.sceneFog) {
        scene.fog = null;
      }
    }

    // 2. Synchronize 3-point lighting rig with the shader transition state
    const neutralDamp = 1 - Math.exp(-3.4 * dt);
    if (themeEnabled) {
      _tmpColorA.copy(this.fromLight.hemiSky).lerp(this.toLight.hemiSky, t);
      _tmpColorB
        .copy(this.fromLight.hemiGround)
        .lerp(this.toLight.hemiGround, t);
      lights.hemi.color.lerp(_tmpColorA, Math.min(1, neutralDamp * 2.4));
      lights.hemi.groundColor.lerp(_tmpColorB, Math.min(1, neutralDamp * 2.4));
      lights.hemi.intensity = THREE.MathUtils.damp(
        lights.hemi.intensity,
        THREE.MathUtils.lerp(
          this.fromLight.hemiIntensity,
          this.toLight.hemiIntensity,
          t
        ),
        6.0,
        dt
      );

      // Subtle atmospheric lighting pulse matching skybox weather (storm flash / volcanic glow)
      let dynamicRimBoost = 0;
      if (this.activeTheme === 'storm-citadel' && t > 0.5) {
        const flash = Math.pow(
          Math.max(0, Math.sin(elapsed * 1.9 + Math.sin(elapsed * 0.7) * 2.5)),
          16
        );
        dynamicRimBoost = flash * 0.9 * t;
      } else if (this.activeTheme === 'volcanic' && t > 0.5) {
        dynamicRimBoost = (0.5 + 0.5 * Math.sin(elapsed * 1.8)) * 0.18 * t;
      }

      _tmpColorC.copy(this.fromLight.keyColor).lerp(this.toLight.keyColor, t);
      lights.key.color.lerp(_tmpColorC, Math.min(1, neutralDamp * 2.4));
      lights.key.intensity = THREE.MathUtils.damp(
        lights.key.intensity,
        THREE.MathUtils.lerp(
          this.fromLight.keyIntensity,
          this.toLight.keyIntensity,
          t
        ),
        6.0,
        dt
      );

      // Smoothly swing directional key light to match skybox celestial sun direction
      _tmpVec
        .copy(this.fromLight.keyDir)
        .lerp(this.toLight.keyDir, t)
        .normalize()
        .multiplyScalar(KEY_LIGHT_DISTANCE);
      _tmpVec.y = Math.max(2.6, _tmpVec.y);
      lights.key.position.lerp(_tmpVec, Math.min(1, neutralDamp * 2.0));

      _tmpColorA.copy(this.fromLight.rimColor).lerp(this.toLight.rimColor, t);
      lights.rim.color.lerp(_tmpColorA, Math.min(1, neutralDamp * 2.4));
      lights.rim.intensity = THREE.MathUtils.damp(
        lights.rim.intensity,
        THREE.MathUtils.lerp(
          this.fromLight.rimIntensity,
          this.toLight.rimIntensity,
          t
        ) + dynamicRimBoost,
        6.0,
        dt
      );
    } else {
      // Gently restore neutral studio lighting when indoor Office Environment is active
      lights.hemi.color.lerp(_neutralSky, neutralDamp);
      lights.hemi.groundColor.lerp(_neutralGround, neutralDamp);
      lights.hemi.intensity = THREE.MathUtils.damp(
        lights.hemi.intensity,
        1.9,
        3.4,
        dt
      );
      lights.key.color.lerp(_neutralKey, neutralDamp);
      lights.key.intensity = THREE.MathUtils.damp(
        lights.key.intensity,
        2.2,
        3.4,
        dt
      );
      lights.key.position.lerp(_neutralKeyPos, neutralDamp);
      lights.rim.color.lerp(_neutralRim, neutralDamp);
      lights.rim.intensity = THREE.MathUtils.damp(
        lights.rim.intensity,
        0.9,
        3.4,
        dt
      );
    }
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
