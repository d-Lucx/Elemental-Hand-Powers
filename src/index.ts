import RAPIER from '@dimforge/rapier3d-simd-compat';
import * as xb from 'xrblocks';

import {ElementalSandbox} from './ElementalSandbox.ts';
import {ElementalGestureRecognizer} from './gestures/ElementalGestureRecognizer.ts';

function ensureProceduralOfficeSimulatorEnvironment(
  options: xb.Options
): void {
  const officeManifest = {
    name: 'Office',
    objects: [],
  };
  const officeManifestUrl = `data:application/json,${encodeURIComponent(
    JSON.stringify(officeManifest)
  )}`;

  const envs = [...options.simulator.environments];
  const existingIdx = envs.findIndex(
    (env) => env.name?.toLowerCase() === 'office'
  );

  if (existingIdx >= 0) {
    envs[existingIdx] = {
      name: 'Office',
      manifestPath: officeManifestUrl,
    };
    options.simulator.environments = envs;
    options.simulator.activeEnvironmentIndex = existingIdx;
  } else {
    envs.push({
      name: 'Office',
      manifestPath: officeManifestUrl,
    });
    options.simulator.environments = envs;
    options.simulator.activeEnvironmentIndex = envs.length - 1;
  }
}

async function start(): Promise<void> {
  const recognizer = new ElementalGestureRecognizer();
  const options = new xb.Options();

  options.setAppTitle('Elemental Hand Powers');
  options.setAppDescription(
    'Wield 14 elemental hand and head powers with a hysteresis gesture state machine, Rapier 3D physics, and spatial audio.'
  );

  // Enable WebXR hand tracking, custom 25-joint gesture recognition, and head gestures
  options.enableGestures();
  options.enableHeadGestures();
  options.enableReticles();
  options.gestures.setGestureRecognizer(recognizer);
  options.hands.visualization = true;
  options.hands.visualizeMeshes = true;
  options.hands.visualizeJoints = false;

  // Enable depth-aware Rapier 3D physics collisions against room surfaces
  options.depth = new xb.DepthOptions(xb.xrDepthMeshPhysicsOptions);
  options.depth.depthMesh.colliderUpdateFps = 5;
  options.depth.matchDepthView = false;
  options.physics.RAPIER = RAPIER;

  // Guarantee the Office simulator environment always exists and loads cleanly
  ensureProceduralOfficeSimulatorEnvironment(options);

  // Hand-gesture-centric demo: launch simulator in Hand Pose mode for instant pose testing
  options.simulator.defaultMode = xb.SimulatorMode.POSE;
  options.xrButton.showEnterSimulatorButton = true;

  xb.add(new ElementalSandbox(recognizer));
  await xb.init(options);
}

document.addEventListener('DOMContentLoaded', () => {
  void start();
});
