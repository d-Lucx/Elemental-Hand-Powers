import * as THREE from 'three';
import * as xb from 'xrblocks';

import {ALL_SINGLE_HAND_GESTURES} from './GestureStateMachine.ts';

const _worldUp = new THREE.Vector3(0, 1, 0);

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Unified XRHand 25-joint pose classifier implementing XR Blocks'
 * GestureRecognizer interface. Scores all 11 single-hand elemental poses
 * from finger straightness, curl, inter-finger abduction spread, pinch
 * proximity, and palm orientation. Temporal hysteresis, dwell timers,
 * velocity gating, and occlusion handling live in ElementalGestureStateMachine.
 */
export class ElementalGestureRecognizer implements xb.GestureRecognizer {
  getGestureConfigurations(): Record<string, xb.GestureConfiguration> {
    const configs: Record<string, xb.GestureConfiguration> = {};
    for (const name of ALL_SINGLE_HAND_GESTURES) {
      configs[name] = {enabled: true, threshold: 0.6};
    }
    return configs;
  }

  recognize(context: xb.HandContext): xb.GestureScoreMap {
    const scores: xb.GestureScoreMap = {};
    for (const name of ALL_SINGLE_HAND_GESTURES) {
      scores[name] = {confidence: 0};
    }

    const indexStraight = xb.getFingerStraightness(context, 'index');
    const middleStraight = xb.getFingerStraightness(context, 'middle');
    const ringStraight = xb.getFingerStraightness(context, 'ring');
    const pinkyStraight = xb.getFingerStraightness(context, 'pinky');
    const thumbStraight = xb.getThumbStraightness(context);

    const indexCurl = xb.getFingerCurl(context, 'index');
    const middleCurl = xb.getFingerCurl(context, 'middle');
    const ringCurl = xb.getFingerCurl(context, 'ring');
    const pinkyCurl = xb.getFingerCurl(context, 'pinky');
    const thumbCurl = xb.getThumbCurl(context);

    const thumbUpDot = xb.getThumbVerticalDirection(context);
    const palmNormal = xb.getPalmNormal(context);
    const spreads = xb.getAdjacentFingerSpreads(context);
    const handScale = Math.max(0.06, xb.estimateHandScale(context));
    const pinchDist = xb.getFingertipDistance(context, 'thumb', 'index');

    const indexExt = clamp01((indexStraight - 0.52) / 0.35);
    const middleExt = clamp01((middleStraight - 0.52) / 0.35);
    const ringExt = clamp01((ringStraight - 0.5) / 0.35);
    const pinkyExt = clamp01((pinkyStraight - 0.48) / 0.35);
    const thumbExt = clamp01((thumbStraight - 0.48) / 0.35);

    const indexBent = clamp01((indexCurl - 0.38) / 0.38);
    const middleBent = clamp01((middleCurl - 0.38) / 0.38);
    const ringBent = clamp01((ringCurl - 0.38) / 0.38);
    const pinkyBent = clamp01((pinkyCurl - 0.36) / 0.38);
    const thumbBent = clamp01((thumbCurl - 0.32) / 0.38);

    // 1. Pinch: thumb tip and index tip within scaled proximity threshold
    if (pinchDist !== null) {
      const normalizedPinch = pinchDist / handScale;
      scores['pinch'] = {confidence: clamp01((0.36 - normalizedPinch) / 0.22)};
    }

    // 2. Closed Fist: all four fingers curled, thumb not raised
    scores['fist'] = {
      confidence:
        Math.min(indexBent, middleBent, ringBent, pinkyBent) *
        (thumbUpDot > 0.45 ? 0.35 : 1.0),
    };

    // 3. Thumbs-Up: thumb extended upward + four fingers curled
    const thumbUpAlign = clamp01((thumbUpDot - 0.32) / 0.45);
    scores['thumbs-up'] = {
      confidence:
        Math.min(thumbExt, indexBent, middleBent, ringBent, pinkyBent) *
        thumbUpAlign,
    };

    // 4. Peace Sign ("Yeah" / Victory): index & middle extended; ring & pinky curled
    const vSpread = clamp01((spreads.indexMiddle - 0.08) / 0.22);
    scores['victory'] = {
      confidence:
        Math.min(indexExt, middleExt, ringBent, pinkyBent) *
        (0.7 + 0.3 * vSpread),
    };

    // 5. Rock-On (Horns): index & pinky extended; middle & ring curled
    scores['rock'] = {
      confidence: Math.min(indexExt, pinkyExt, middleBent, ringBent),
    };

    // 6. Shaka (Hang Loose): thumb & pinky extended; middle three fingers curled
    scores['shaka'] = {
      confidence: Math.min(
        thumbExt,
        pinkyExt,
        indexBent,
        middleBent,
        ringBent
      ),
    };

    // 7. Finger Gun vs Point: index extended, middle/ring/pinky curled
    const indexOnlyBase = Math.min(indexExt, middleBent, ringBent, pinkyBent);
    const gunThumb = thumbExt * clamp01((thumbUpDot - 0.22) / 0.45);
    scores['finger-gun'] = {confidence: indexOnlyBase * gunThumb};
    scores['point'] = {
      confidence: indexOnlyBase * Math.max(thumbBent, 1 - gunThumb * 0.85),
    };

    // 8. Open-Hand Family: Palm-Up Cup vs Finger Spread vs Forward Open Palm
    const allOpen = Math.min(indexExt, middleExt, ringExt, pinkyExt);
    const avgSpread =
      (spreads.indexMiddle + spreads.middleRing + spreads.ringPinky) / 3;
    const spreadFactor = clamp01((avgSpread - 0.24) / 0.16);
    const palmUpAlignment = palmNormal ? palmNormal.dot(_worldUp) : 0;
    const isPalmUp = clamp01((palmUpAlignment - 0.55) / 0.3);

    scores['palm-up'] = {confidence: allOpen * isPalmUp};
    scores['spread'] = {
      confidence: allOpen * (1 - isPalmUp * 0.7) * spreadFactor,
    };
    scores['open-palm'] = {
      confidence:
        allOpen * (1 - isPalmUp * 0.85) * (1 - spreadFactor * 0.75),
    };

    return scores;
  }
}
