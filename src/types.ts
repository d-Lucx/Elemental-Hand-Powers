import * as THREE from 'three';

export type HandSide = 'left' | 'right';
export type CastHandPreference = 'both' | 'left' | 'right';

export type PowerId =
  | 'fireball'
  | 'rainbow-ribbons'
  | 'earth-shield'
  | 'frost-lance'
  | 'lightning-tether'
  | 'kinetic-gale'
  | 'sky-updraft'
  | 'chain-lightning'
  | 'tidal-vortex'
  | 'magma-bolt'
  | 'verdant-flora'
  | 'plasma-core'
  | 'void-dome';

export type GestureName =
  | 'open-palm'
  | 'victory'
  | 'fist'
  | 'point'
  | 'pinch'
  | 'spread'
  | 'thumbs-up'
  | 'rock'
  | 'shaka'
  | 'finger-gun'
  | 'palm-up';

export type DetectionTier = 'Built-in' | 'Custom XRHand' | 'Bimanual';

export interface ElementalPowerSpec {
  id: PowerId;
  name: string;
  gestureLabel: string;
  gestureName?: GestureName;
  tier: DetectionTier;
  colorHex: string;
  colorInt: number;
  accentInt: number;
  icon: string;
  hotkey: string;
  summary: string;
  sustained: boolean;
}

export interface TrackedHandFrame {
  side: HandSide;
  active: boolean;
  lastSeenAt: number;
  palmCenter: THREE.Vector3;
  palmNormal: THREE.Vector3;
  palmUp: THREE.Vector3;
  wristPos: THREE.Vector3;
  wristVelocity: THREE.Vector3;
  indexTip: THREE.Vector3;
  indexDir: THREE.Vector3;
  middleTip: THREE.Vector3;
  thumbTip: THREE.Vector3;
  activeGesture: GestureName | null;
  confidence: number;
}

export interface BimanualState {
  plasmaActive: boolean;
  plasmaMidpoint: THREE.Vector3;
  plasmaSeparation: number;
  voidDomeActive: boolean;
  voidDomeCenter: THREE.Vector3;
}
