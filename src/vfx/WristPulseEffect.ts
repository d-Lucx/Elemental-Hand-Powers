import * as THREE from 'three';
import * as xb from 'xrblocks';

import {
  SpellChargeState,
  StateMachineSnapshot,
} from '../gestures/GestureStateMachine.ts';
import {HandSide, TrackedHandFrame} from '../types.ts';

const TWO_PI = Math.PI * 2;

const _wristPos = new THREE.Vector3();
const _forearmAxis = new THREE.Vector3();
const _sideAxis = new THREE.Vector3();
const _upAxis = new THREE.Vector3();
const _basisMat = new THREE.Matrix4();
const _targetQuat = new THREE.Quaternion();
const _targetPrimary = new THREE.Color();
const _targetAccent = new THREE.Color();

const WRIST_CUFF_VERTEX = `
  uniform float uPhase;
  uniform float uCharge;
  uniform float uOcclusionAlert;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying float vPulseWave;

  void main() {
    vUv = uv;
    // Traveling harmonic pulse wave along the forearm-to-wrist sleeve
    float wave = 0.5 + 0.5 * sin(uv.y * 10.0 - uPhase);
    float harmonic = 0.5 + 0.5 * sin(uv.x * 18.849556 + uPhase * 0.5);
    vPulseWave = wave;

    // Subtle radial breathing displacement scaled by charge level
    float radialExpand = (0.0012 + uCharge * 0.0042) * wave + uOcclusionAlert * 0.0025 * sin(uPhase * 2.0);
    vec3 displaced = position + normal * (radialExpand + harmonic * 0.0006 * uCharge);

    vNormal = normalize(normalMatrix * normal);
    vec4 wp = modelMatrix * vec4(displaced, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const WRIST_CUFF_FRAGMENT = `
  uniform float uPhase;
  uniform float uCharge;
  uniform float uOpacity;
  uniform float uOcclusionAlert;
  uniform vec3 uPrimaryColor;
  uniform vec3 uAccentColor;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying float vPulseWave;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float fresnel = pow(1.0 - abs(dot(viewDir, normalize(vNormal))), 1.75);

    // Soft longitudinal fade at wrist cuff edges
    float edgeFade = smoothstep(0.0, 0.22, vUv.y) * smoothstep(1.0, 0.78, vUv.y);

    // Procedural arcane conduit bands circling the wrist
    float ringBand = pow(0.5 + 0.5 * sin(vUv.y * 12.56637 - uPhase), 3.0);
    float lattice = pow(0.5 + 0.5 * cos(vUv.x * 37.69911 + uPhase * 0.35), 4.0) * 0.45;
    float chargeCrest = smoothstep(0.35, 0.98, vPulseWave);

    vec3 col = mix(uPrimaryColor, uAccentColor, clamp(chargeCrest * 0.65 + fresnel * 0.5, 0.0, 1.0));
    float intensity = 0.45 + uCharge * 1.15 + ringBand * (0.45 + uCharge * 0.9) + lattice * uCharge;
    col *= intensity;

    // Alert flicker modulation during joint occlusion hold
    float alertBoost = 1.0 + uOcclusionAlert * 0.55 * step(0.0, sin(uPhase));
    float alpha = edgeFade * (0.24 + fresnel * 0.48 + ringBand * (0.22 + uCharge * 0.42)) * uOpacity * alertBoost;

    gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.92));
  }
`;

const WRIST_RING_VERTEX = `
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const WRIST_RING_FRAGMENT = `
  uniform float uPhase;
  uniform float uCharge;
  uniform float uOpacity;
  uniform vec3 uPrimaryColor;
  uniform vec3 uAccentColor;

  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying vec2 vUv;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float fresnel = pow(1.0 - abs(dot(viewDir, normalize(vNormal))), 1.5);
    float pulse = 0.5 + 0.5 * sin(uPhase);
    float spark = pow(0.5 + 0.5 * sin(vUv.x * 25.13274 - uPhase * 1.5), 5.0);

    vec3 col = mix(uPrimaryColor, uAccentColor, clamp(pulse * 0.55 + spark * 0.55, 0.0, 1.0));
    col *= 0.85 + pulse * (0.55 + uCharge * 0.95) + spark * uCharge;
    float alpha = (0.35 + fresnel * 0.45 + pulse * 0.25) * uOpacity;

    gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.95));
  }
`;

export interface FallbackWristPose {
  position: THREE.Vector3;
  direction: THREE.Vector3;
  charge: SpellChargeState;
}

interface WristPulseRig {
  root: THREE.Group;
  cuffMesh: THREE.Mesh;
  cuffMat: THREE.ShaderMaterial;
  distalRing: THREE.Mesh;
  proximalRing: THREE.Mesh;
  ringMat: THREE.ShaderMaterial;
  waveRing: THREE.Mesh;
  waveMat: THREE.MeshBasicMaterial;
  phase: number;
  smoothedFreqHz: number;
  smoothedCharge: number;
  smoothedOpacity: number;
  primaryColor: THREE.Color;
  accentColor: THREE.Color;
}

/**
 * Procedural 3D visual pulse effect anchored onto each hand's wrist mesh/joint.
 * Dynamically adapts wave frequency, expanding radial ripples, and elemental
 * colors directly from the SpellChargeState computed in GestureStateMachine.
 */
export class WristPulseEffect extends THREE.Group {
  private readonly cuffGeo: THREE.CylinderGeometry;
  private readonly conduitRingGeo: THREE.TorusGeometry;
  private readonly waveRingGeo: THREE.RingGeometry;
  private readonly rigs: Record<HandSide, WristPulseRig>;

  constructor() {
    super();
    this.name = 'Wrist Pulse Effect';

    // Open-ended contoured wrist cuff aligned along local Y axis
    this.cuffGeo = new THREE.CylinderGeometry(0.036, 0.04, 0.068, 32, 10, true);
    this.conduitRingGeo = new THREE.TorusGeometry(0.04, 0.0028, 12, 36);
    this.conduitRingGeo.rotateX(Math.PI / 2);
    this.waveRingGeo = new THREE.RingGeometry(0.038, 0.047, 36);
    this.waveRingGeo.rotateX(Math.PI / 2);

    this.rigs = {
      left: this.createRig('left'),
      right: this.createRig('right'),
    };
  }

  private createRig(side: HandSide): WristPulseRig {
    const root = new THREE.Group();
    root.name = `Wrist pulse (${side})`;
    root.visible = false;
    root.xb = {pointerEvents: 'none'};

    const primaryColor = new THREE.Color('#38bdf8');
    const accentColor = new THREE.Color('#64748b');

    const cuffMat = new THREE.ShaderMaterial({
      uniforms: {
        uPhase: {value: 0},
        uCharge: {value: 0},
        uOpacity: {value: 0},
        uOcclusionAlert: {value: 0},
        uPrimaryColor: {value: primaryColor.clone()},
        uAccentColor: {value: accentColor.clone()},
      },
      vertexShader: WRIST_CUFF_VERTEX,
      fragmentShader: WRIST_CUFF_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });

    const cuffMesh = new THREE.Mesh(this.cuffGeo, cuffMat);
    cuffMesh.xb = {pointerEvents: 'none'};
    cuffMesh.renderOrder = 25;
    root.add(cuffMesh);

    const ringMat = new THREE.ShaderMaterial({
      uniforms: {
        uPhase: {value: 0},
        uCharge: {value: 0},
        uOpacity: {value: 0},
        uPrimaryColor: {value: primaryColor.clone()},
        uAccentColor: {value: accentColor.clone()},
      },
      vertexShader: WRIST_RING_VERTEX,
      fragmentShader: WRIST_RING_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const distalRing = new THREE.Mesh(this.conduitRingGeo, ringMat);
    distalRing.position.y = 0.032;
    distalRing.xb = {pointerEvents: 'none'};
    distalRing.renderOrder = 26;

    const proximalRing = new THREE.Mesh(this.conduitRingGeo, ringMat);
    proximalRing.position.y = -0.032;
    proximalRing.scale.setScalar(1.08);
    proximalRing.xb = {pointerEvents: 'none'};
    proximalRing.renderOrder = 26;

    root.add(distalRing, proximalRing);

    const waveMat = new THREE.MeshBasicMaterial({
      color: primaryColor.clone(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const waveRing = new THREE.Mesh(this.waveRingGeo, waveMat);
    waveRing.xb = {pointerEvents: 'none'};
    waveRing.renderOrder = 27;
    root.add(waveRing);

    this.add(root);

    return {
      root,
      cuffMesh,
      cuffMat,
      distalRing,
      proximalRing,
      ringMat,
      waveRing,
      waveMat,
      phase: 0,
      smoothedFreqHz: 0.85,
      smoothedCharge: 0,
      smoothedOpacity: 0,
      primaryColor,
      accentColor,
    };
  }

  /**
   * Updates both wrist pulse conduits using tracked wrist joints + the live
   * SpellChargeState from GestureStateMachine.
   */
  update(
    dt: number,
    hands: Record<HandSide, TrackedHandFrame>,
    snapshot: StateMachineSnapshot,
    fallbackRight?: FallbackWristPose | null
  ): void {
    this.updateSide('left', dt, hands.left, snapshot.left.charge, null);
    this.updateSide(
      'right',
      dt,
      hands.right,
      snapshot.right.charge,
      fallbackRight ?? null
    );
  }

  private updateSide(
    side: HandSide,
    dt: number,
    hand: TrackedHandFrame,
    charge: SpellChargeState,
    fallback: FallbackWristPose | null
  ): void {
    const rig = this.rigs[side];
    const hasTrackedHand = hand.active;
    const useFallback = !hasTrackedHand && fallback !== null;
    const activeCharge = useFallback ? fallback.charge : charge;

    const targetVisible = hasTrackedHand || useFallback;
    const targetOpacity = !targetVisible
      ? 0
      : activeCharge.status === 'idle'
        ? 0.42
        : activeCharge.status === 'cooldown'
          ? 0.48
          : 0.96;

    rig.smoothedOpacity = THREE.MathUtils.damp(
      rig.smoothedOpacity,
      targetOpacity,
      10,
      dt
    );

    if (rig.smoothedOpacity < 0.015) {
      rig.root.visible = false;
      return;
    }
    rig.root.visible = true;

    // 1. Anchor & orient coaxially along the wrist-to-palm forearm axis
    if (hasTrackedHand) {
      const handedness =
        side === 'left' ? xb.Handedness.LEFT : xb.Handedness.RIGHT;
      const wristJoint = xb.core.user?.hands?.getWrist(handedness);
      if (wristJoint) {
        wristJoint.getWorldPosition(_wristPos);
      } else {
        _wristPos.copy(hand.wristPos);
      }

      _forearmAxis.subVectors(hand.palmCenter, _wristPos);
      if (_forearmAxis.lengthSq() > 1e-6) {
        _forearmAxis.normalize();
      } else {
        _forearmAxis.copy(hand.palmUp).normalize();
      }

      // Offset slightly proximally onto the wrist cuff area
      rig.root.position.copy(_wristPos).addScaledVector(_forearmAxis, 0.012);

      // Build orthonormal frame with +Y along wrist->palm axis
      _upAxis.copy(hand.palmNormal);
      if (Math.abs(_upAxis.dot(_forearmAxis)) > 0.95) {
        _upAxis.set(0, 1, 0);
      }
      _sideAxis.crossVectors(_upAxis, _forearmAxis).normalize();
      _upAxis.crossVectors(_forearmAxis, _sideAxis).normalize();
      _basisMat.makeBasis(_sideAxis, _forearmAxis, _upAxis);
      _targetQuat.setFromRotationMatrix(_basisMat);
      rig.root.quaternion.slerp(_targetQuat, 1 - Math.exp(-22 * dt));
    } else if (fallback) {
      _forearmAxis.copy(fallback.direction).normalize();
      rig.root.position
        .copy(fallback.position)
        .addScaledVector(_forearmAxis, -0.06);
      _upAxis.set(0, 1, 0);
      if (Math.abs(_upAxis.dot(_forearmAxis)) > 0.95) {
        _upAxis.set(1, 0, 0);
      }
      _sideAxis.crossVectors(_upAxis, _forearmAxis).normalize();
      _upAxis.crossVectors(_forearmAxis, _sideAxis).normalize();
      _basisMat.makeBasis(_sideAxis, _forearmAxis, _upAxis);
      _targetQuat.setFromRotationMatrix(_basisMat);
      rig.root.quaternion.slerp(_targetQuat, 1 - Math.exp(-22 * dt));
    }

    // 2. Smoothly damp frequency, charge intensity, and elemental colors
    rig.smoothedFreqHz = THREE.MathUtils.damp(
      rig.smoothedFreqHz,
      activeCharge.pulseFrequencyHz,
      7.5,
      dt
    );
    rig.smoothedCharge = THREE.MathUtils.damp(
      rig.smoothedCharge,
      activeCharge.chargeLevel,
      9.0,
      dt
    );

    _targetPrimary.set(activeCharge.colorHex);
    _targetAccent.set(activeCharge.accentHex);
    const colorLerp = 1 - Math.exp(-10 * dt);
    rig.primaryColor.lerp(_targetPrimary, colorLerp);
    rig.accentColor.lerp(_targetAccent, colorLerp);

    // 3. Integrate continuous phase so frequency transitions never pop/jump
    rig.phase = (rig.phase + dt * rig.smoothedFreqHz * TWO_PI) % (TWO_PI * 64);

    const occlusionAlert = activeCharge.status === 'occluded' ? 1.0 : 0.0;

    // 4. Push shader uniforms
    rig.cuffMat.uniforms.uPhase.value = rig.phase;
    rig.cuffMat.uniforms.uCharge.value = rig.smoothedCharge;
    rig.cuffMat.uniforms.uOpacity.value = rig.smoothedOpacity;
    rig.cuffMat.uniforms.uOcclusionAlert.value = occlusionAlert;
    (rig.cuffMat.uniforms.uPrimaryColor.value as THREE.Color).copy(
      rig.primaryColor
    );
    (rig.cuffMat.uniforms.uAccentColor.value as THREE.Color).copy(
      rig.accentColor
    );

    rig.ringMat.uniforms.uPhase.value = rig.phase;
    rig.ringMat.uniforms.uCharge.value = rig.smoothedCharge;
    rig.ringMat.uniforms.uOpacity.value = rig.smoothedOpacity;
    (rig.ringMat.uniforms.uPrimaryColor.value as THREE.Color).copy(
      rig.primaryColor
    );
    (rig.ringMat.uniforms.uAccentColor.value as THREE.Color).copy(
      rig.accentColor
    );

    // 5. Harmonic breathing on dual conduit rings + expanding radial pulse ring
    const beat = 0.5 + 0.5 * Math.sin(rig.phase);
    const ringBreath = 1.0 + beat * (0.04 + rig.smoothedCharge * 0.14);
    rig.distalRing.scale.set(ringBreath, 1, ringBreath);
    rig.proximalRing.scale.set(
      (1.08 + (1 - beat) * 0.06 * rig.smoothedCharge),
      1,
      (1.08 + (1 - beat) * 0.06 * rig.smoothedCharge)
    );

    // Expanding radial pulse wave synced to each cycle of rig.phase
    const cycleT = (rig.phase % TWO_PI) / TWO_PI; // 0 -> 1 per pulse beat
    const waveActive =
      rig.smoothedCharge > 0.14 || activeCharge.status === 'occluded';
    if (waveActive) {
      rig.waveRing.visible = true;
      const expandScale =
        1.0 + cycleT * (0.75 + rig.smoothedCharge * 1.15);
      rig.waveRing.scale.setScalar(expandScale);
      rig.waveRing.position.y = -0.02 + cycleT * 0.055;
      rig.waveMat.color
        .copy(rig.primaryColor)
        .lerp(rig.accentColor, cycleT * 0.7);
      rig.waveMat.opacity =
        Math.sin(cycleT * Math.PI) *
        (0.28 + rig.smoothedCharge * 0.6) *
        rig.smoothedOpacity;
    } else {
      rig.waveRing.visible = false;
    }
  }

  dispose(): void {
    this.cuffGeo.dispose();
    this.conduitRingGeo.dispose();
    this.waveRingGeo.dispose();
    for (const side of ['left', 'right'] as const) {
      const rig = this.rigs[side];
      rig.cuffMat.dispose();
      rig.ringMat.dispose();
      rig.waveMat.dispose();
    }
  }
}
