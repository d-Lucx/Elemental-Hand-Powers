import * as THREE from 'three';
import * as xb from 'xrblocks';

import {ELEMENTAL_POWERS} from '../constants.ts';
import {PowerId} from '../types.ts';

export type GuideEntryId = PowerId | 'head-modifiers' | 'open-book';

export interface GuideTileSpec {
  id: GuideEntryId;
  title: string;
  gesture: string;
  colorHex: string;
  accentHex: string;
}

const GUIDE_TILES: readonly GuideTileSpec[] = [
  ...ELEMENTAL_POWERS.map((spec) => ({
    id: spec.id as GuideEntryId,
    title: spec.name,
    gesture: spec.gestureLabel,
    colorHex: spec.colorHex,
    accentHex: `#${spec.accentInt.toString(16).padStart(6, '0')}`,
  })),
  {
    id: 'head-modifiers',
    title: 'Empower / Dispel',
    gesture: 'Head Nod / Shake',
    colorHex: '#fde047',
    accentHex: '#94a3b8',
  },
];

function drawCapsuleFinger(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
  color: string,
  tipGlow?: string
): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();

  if (tipGlow) {
    ctx.fillStyle = tipGlow;
    ctx.beginPath();
    ctx.arc(x1, y1, width * 0.56, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawCurledKnuckle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r = 6
): void {
  ctx.save();
  ctx.fillStyle = 'rgba(148, 163, 184, 0.55)';
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawPalmBase(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w = 38,
  h = 34,
  fill = 'rgba(226, 232, 240, 0.85)'
): void {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, cy - h / 2, w, h, 12);
  ctx.fill();
  ctx.restore();
}

/**
 * Generates a crisp procedural vector-style CanvasTexture illustrating the exact
 * hand, bimanual, or head gesture silhouette for an elemental power.
 */
export function createGestureIllustrationTexture(
  tile: GuideTileSpec
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 180;
  canvas.height = 112;
  const ctx = canvas.getContext('2d')!;

  // Dark translucent card backdrop + subtle elemental radial aura
  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const glow = ctx.createRadialGradient(90, 54, 6, 90, 54, 68);
  glow.addColorStop(0, `${tile.colorHex}55`);
  glow.addColorStop(0.55, `${tile.colorHex}1c`);
  glow.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const extCol = '#f8fafc';
  const hiCol = tile.colorHex;
  const accCol = tile.accentHex;
  const cx = 90;
  const cy = 74;

  switch (tile.id) {
    case 'fireball': {
      // Open Palm: 5 extended fingers + ember sphere in palm
      drawPalmBase(ctx, cx, cy, 38, 32);
      drawCapsuleFinger(ctx, cx - 18, cy + 4, cx - 34, cy - 14, 8, extCol);
      drawCapsuleFinger(ctx, cx - 13, cy - 12, cx - 15, cy - 46, 8, extCol);
      drawCapsuleFinger(ctx, cx - 4, cy - 14, cx - 4, cy - 52, 8, extCol);
      drawCapsuleFinger(ctx, cx + 6, cy - 13, cx + 7, cy - 48, 8, extCol);
      drawCapsuleFinger(ctx, cx + 15, cy - 10, cx + 18, cy - 38, 7, extCol);
      const orb = ctx.createRadialGradient(cx, cy - 2, 2, cx, cy - 2, 16);
      orb.addColorStop(0, '#fffbeb');
      orb.addColorStop(0.5, accCol);
      orb.addColorStop(1, hiCol);
      ctx.fillStyle = orb;
      ctx.beginPath();
      ctx.arc(cx, cy - 2, 13, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'rainbow-ribbons': {
      // Peace Sign: index & middle extended in a V with twin colorful ribbons
      drawPalmBase(ctx, cx, cy + 2, 36, 30);
      drawCapsuleFinger(ctx, cx - 10, cy - 10, cx - 22, cy - 48, 8, extCol, hiCol);
      drawCapsuleFinger(ctx, cx + 2, cy - 10, cx + 14, cy - 48, 8, extCol, accCol);
      drawCurledKnuckle(ctx, cx + 12, cy - 4, 6);
      drawCurledKnuckle(ctx, cx + 17, cy + 3, 5.5);
      drawCurledKnuckle(ctx, cx - 14, cy + 4, 6);
      // Flowing ribbon arcs
      ctx.strokeStyle = hiCol;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - 22, cy - 48);
      ctx.quadraticCurveTo(cx - 48, cy - 58, cx - 58, cy - 26);
      ctx.stroke();
      ctx.strokeStyle = accCol;
      ctx.beginPath();
      ctx.moveTo(cx + 14, cy - 48);
      ctx.quadraticCurveTo(cx + 42, cy - 58, cx + 56, cy - 24);
      ctx.stroke();
      break;
    }

    case 'earth-shield': {
      // Closed Fist + faceted hexagonal barrier arc
      drawPalmBase(ctx, cx, cy + 4, 42, 34);
      for (const kx of [-13, -4, 5, 14]) {
        drawCurledKnuckle(ctx, cx + kx, cy - 11, 6.5);
      }
      drawCapsuleFinger(ctx, cx - 18, cy + 2, cx + 4, cy - 1, 8, '#cbd5e1');
      // Hex shield barrier above fist
      ctx.strokeStyle = accCol;
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(cx - 44, cy - 24);
      ctx.lineTo(cx - 20, cy - 42);
      ctx.lineTo(cx + 20, cy - 42);
      ctx.lineTo(cx + 44, cy - 24);
      ctx.stroke();
      break;
    }

    case 'frost-lance': {
      // Point: index extended straight + icy beam lance
      drawPalmBase(ctx, cx, cy + 4, 36, 30);
      drawCapsuleFinger(ctx, cx - 8, cy - 8, cx - 8, cy - 52, 8.5, extCol, accCol);
      drawCurledKnuckle(ctx, cx + 4, cy - 6, 6);
      drawCurledKnuckle(ctx, cx + 13, cy - 3, 5.5);
      drawCurledKnuckle(ctx, cx + 18, cy + 4, 5);
      drawCurledKnuckle(ctx, cx - 15, cy + 2, 6);
      // Crystalline shard stream
      ctx.strokeStyle = hiCol;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - 8, cy - 56);
      ctx.lineTo(cx - 8, cy - 68);
      ctx.moveTo(cx - 24, cy - 46);
      ctx.lineTo(cx - 38, cy - 54);
      ctx.moveTo(cx + 8, cy - 46);
      ctx.lineTo(cx + 22, cy - 54);
      ctx.stroke();
      break;
    }

    case 'lightning-tether': {
      // Pinch: thumb & index tips touching with electric spark ring
      drawPalmBase(ctx, cx + 4, cy + 4, 34, 30);
      drawCapsuleFinger(ctx, cx - 14, cy + 4, cx - 22, cy - 26, 8, extCol);
      drawCapsuleFinger(ctx, cx - 4, cy - 10, cx - 20, cy - 28, 8, extCol);
      drawCurledKnuckle(ctx, cx + 8, cy - 6, 5.5);
      drawCurledKnuckle(ctx, cx + 15, cy - 1, 5);
      drawCurledKnuckle(ctx, cx + 19, cy + 6, 4.5);
      // Electric pinch contact spark & tether bolt
      ctx.fillStyle = accCol;
      ctx.beginPath();
      ctx.arc(cx - 21, cy - 27, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = hiCol;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(cx - 26, cy - 30);
      ctx.lineTo(cx - 42, cy - 44);
      ctx.lineTo(cx - 36, cy - 52);
      ctx.lineTo(cx - 56, cy - 62);
      ctx.stroke();
      break;
    }

    case 'kinetic-gale': {
      // Finger Spread: 5 maximally splayed fingers + radial shockwave rings
      ctx.strokeStyle = `${hiCol}99`;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(cx, cy - 14, 46, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      ctx.setLineDash([]);

      drawPalmBase(ctx, cx, cy + 4, 36, 30);
      drawCapsuleFinger(ctx, cx - 16, cy + 4, cx - 46, cy - 12, 7.5, extCol, hiCol);
      drawCapsuleFinger(ctx, cx - 12, cy - 10, cx - 32, cy - 44, 7.5, extCol, hiCol);
      drawCapsuleFinger(ctx, cx, cy - 12, cx, cy - 52, 7.5, extCol, hiCol);
      drawCapsuleFinger(ctx, cx + 12, cy - 10, cx + 32, cy - 44, 7.5, extCol, hiCol);
      drawCapsuleFinger(ctx, cx + 16, cy - 2, cx + 46, cy - 22, 7, extCol, hiCol);
      break;
    }

    case 'sky-updraft': {
      // Thumbs-Up: compact curled fist + upright thumb + upward wind chevrons
      drawPalmBase(ctx, cx + 6, cy + 4, 38, 30);
      for (const ky of [-8, 0, 8, 15]) {
        drawCurledKnuckle(ctx, cx + 22, cy + ky, 5.2);
      }
      drawCapsuleFinger(ctx, cx - 10, cy - 6, cx - 12, cy - 46, 9, extCol, hiCol);
      // Updraft wind chevrons
      ctx.strokeStyle = hiCol;
      ctx.lineWidth = 2.6;
      for (const oy of [0, -14]) {
        ctx.beginPath();
        ctx.moveTo(cx - 38, cy - 20 + oy);
        ctx.lineTo(cx - 28, cy - 30 + oy);
        ctx.lineTo(cx - 18, cy - 20 + oy);
        ctx.stroke();
      }
      break;
    }

    case 'chain-lightning': {
      // Rock-On: index & pinky extended + jagged electric arc jumping between tips
      drawPalmBase(ctx, cx, cy + 4, 38, 30);
      drawCapsuleFinger(ctx, cx - 13, cy - 10, cx - 18, cy - 48, 8, extCol, hiCol);
      drawCurledKnuckle(ctx, cx - 2, cy - 6, 6);
      drawCurledKnuckle(ctx, cx + 8, cy - 6, 6);
      drawCapsuleFinger(ctx, cx + 16, cy - 8, cx + 24, cy - 44, 7.5, extCol, hiCol);
      drawCurledKnuckle(ctx, cx - 12, cy + 6, 5.5);
      // Jagged lightning arc between horns
      ctx.strokeStyle = accCol;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(cx - 18, cy - 48);
      ctx.lineTo(cx - 6, cy - 38);
      ctx.lineTo(cx + 2, cy - 52);
      ctx.lineTo(cx + 12, cy - 36);
      ctx.lineTo(cx + 24, cy - 44);
      ctx.stroke();
      break;
    }

    case 'tidal-vortex': {
      // Shaka: thumb & pinky extended wide + water cyclone swirl above wrist
      drawPalmBase(ctx, cx, cy + 4, 36, 28);
      drawCapsuleFinger(ctx, cx - 16, cy, cx - 44, cy - 24, 8.5, extCol, hiCol);
      drawCurledKnuckle(ctx, cx - 8, cy - 8, 5.5);
      drawCurledKnuckle(ctx, cx + 1, cy - 8, 5.5);
      drawCurledKnuckle(ctx, cx + 10, cy - 8, 5.5);
      drawCapsuleFinger(ctx, cx + 16, cy - 4, cx + 44, cy - 28, 7.5, extCol, hiCol);
      // Swirling tidal cyclone rings
      ctx.strokeStyle = hiCol;
      ctx.lineWidth = 2.4;
      for (const [ry, rx] of [
        [cy - 34, 24],
        [cy - 44, 17],
        [cy - 53, 10],
      ]) {
        ctx.beginPath();
        ctx.ellipse(cx, ry, rx, 5, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }

    case 'magma-bolt': {
      // Finger Gun: thumb up + index pointing forward (right) + molten tip
      drawPalmBase(ctx, cx - 8, cy + 4, 34, 30);
      drawCapsuleFinger(ctx, cx - 16, cy - 8, cx - 16, cy - 44, 8.5, extCol);
      drawCapsuleFinger(ctx, cx + 6, cy - 8, cx + 48, cy - 8, 8.5, extCol, hiCol);
      drawCurledKnuckle(ctx, cx + 2, cy + 5, 5.5);
      drawCurledKnuckle(ctx, cx - 4, cy + 12, 5.5);
      // Molten blast rays
      ctx.fillStyle = accCol;
      ctx.beginPath();
      ctx.arc(cx + 54, cy - 8, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = hiCol;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(cx + 30, cy - 26);
      ctx.lineTo(cx + 36, cy - 38);
      ctx.lineTo(cx + 42, cy - 26);
      ctx.stroke();
      break;
    }

    case 'verdant-flora': {
      // Palm-Up Cup: horizontal cupped hand + rising emerald crystal/vine
      ctx.save();
      ctx.strokeStyle = extCol;
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 38, cy + 4);
      ctx.quadraticCurveTo(cx, cy + 20, cx + 38, cy + 2);
      ctx.stroke();
      ctx.restore();
      // Rising helical vine & emerald crystal
      ctx.strokeStyle = hiCol;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy + 6);
      ctx.bezierCurveTo(cx - 16, cy - 12, cx + 16, cy - 26, cx, cy - 46);
      ctx.stroke();
      ctx.fillStyle = accCol;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 58);
      ctx.lineTo(cx + 9, cy - 42);
      ctx.lineTo(cx, cy - 32);
      ctx.lineTo(cx - 9, cy - 42);
      ctx.closePath();
      ctx.fill();
      break;
    }

    case 'plasma-core': {
      // Bimanual Double Palm Facing + radiant plasma star between hands
      // Left palm facing right
      ctx.strokeStyle = extCol;
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 46, cy + 12);
      ctx.quadraticCurveTo(cx - 54, cy - 16, cx - 38, cy - 44);
      ctx.stroke();
      // Right palm facing left
      ctx.beginPath();
      ctx.moveTo(cx + 46, cy + 12);
      ctx.quadraticCurveTo(cx + 54, cy - 16, cx + 38, cy - 44);
      ctx.stroke();
      // Pulsing fusion star in center
      const star = ctx.createRadialGradient(cx, cy - 16, 3, cx, cy - 16, 24);
      star.addColorStop(0, '#ffffff');
      star.addColorStop(0.4, accCol);
      star.addColorStop(0.85, hiCol);
      star.addColorStop(1, 'rgba(244,63,94,0)');
      ctx.fillStyle = star;
      ctx.beginPath();
      ctx.arc(cx, cy - 16, 24, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'void-dome': {
      // Bimanual Crossed Wrists forming an X inside arcane hexagonal dome
      ctx.strokeStyle = `${hiCol}cc`;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(cx, cy - 8, 46, Math.PI, 0);
      ctx.stroke();
      ctx.setLineDash([]);

      drawCapsuleFinger(ctx, cx - 34, cy + 16, cx + 22, cy - 34, 11, extCol, hiCol);
      drawCapsuleFinger(ctx, cx + 34, cy + 16, cx - 22, cy - 34, 11, '#cbd5e1', accCol);
      break;
    }

    case 'head-modifiers': {
      // Head silhouette with vertical Nod (Empower) + horizontal Shake (Dispel) arrows
      ctx.strokeStyle = extCol;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy - 18, 22, 0, Math.PI * 2);
      ctx.stroke();
      // XR visor band
      ctx.fillStyle = 'rgba(56, 189, 248, 0.45)';
      ctx.beginPath();
      ctx.roundRect(cx - 18, cy - 26, 36, 11, 5);
      ctx.fill();

      // Vertical Nod arrows (gold)
      ctx.strokeStyle = hiCol;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 58);
      ctx.lineTo(cx, cy - 44);
      ctx.moveTo(cx - 6, cy - 52);
      ctx.lineTo(cx, cy - 58);
      ctx.lineTo(cx + 6, cy - 52);
      ctx.moveTo(cx, cy + 10);
      ctx.lineTo(cx, cy + 22);
      ctx.moveTo(cx - 6, cy + 16);
      ctx.lineTo(cx, cy + 22);
      ctx.lineTo(cx + 6, cy + 16);
      ctx.stroke();

      // Horizontal Shake arrows (cool slate/cyan)
      ctx.strokeStyle = accCol;
      ctx.beginPath();
      ctx.moveTo(cx - 48, cy - 18);
      ctx.lineTo(cx - 30, cy - 18);
      ctx.moveTo(cx - 42, cy - 24);
      ctx.lineTo(cx - 48, cy - 18);
      ctx.lineTo(cx - 42, cy - 12);
      ctx.moveTo(cx + 30, cy - 18);
      ctx.lineTo(cx + 48, cy - 18);
      ctx.moveTo(cx + 42, cy - 24);
      ctx.lineTo(cx + 48, cy - 18);
      ctx.lineTo(cx + 42, cy - 12);
      ctx.stroke();
      break;
    }

    case 'open-book': {
      // Bimanual Open Book: both open palms side-by-side tilted upward with glowing tome pages
      ctx.save();
      ctx.strokeStyle = extCol;
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      // Left cupped palm tilted up
      ctx.beginPath();
      ctx.moveTo(cx - 56, cy - 6);
      ctx.quadraticCurveTo(cx - 32, cy + 16, cx - 6, cy + 8);
      ctx.stroke();
      // Right cupped palm tilted up
      ctx.beginPath();
      ctx.moveTo(cx + 6, cy + 8);
      ctx.quadraticCurveTo(cx + 32, cy + 16, cx + 56, cy - 6);
      ctx.stroke();

      // Luminous floating open-book pages above palms
      ctx.strokeStyle = hiCol;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 4);
      ctx.quadraticCurveTo(cx - 26, cy - 18, cx - 48, cy - 28);
      ctx.lineTo(cx - 42, cy - 52);
      ctx.quadraticCurveTo(cx - 18, cy - 44, cx, cy - 30);
      ctx.quadraticCurveTo(cx + 18, cy - 44, cx + 42, cy - 52);
      ctx.lineTo(cx + 48, cy - 28);
      ctx.quadraticCurveTo(cx + 26, cy - 18, cx, cy - 4);
      ctx.stroke();

      // Golden spine glow
      ctx.strokeStyle = accCol;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 4);
      ctx.lineTo(cx, cy - 30);
      ctx.stroke();
      ctx.restore();
      break;
    }
  }

  // Crisp subtle colored accent frame
  ctx.strokeStyle = `${tile.colorHex}88`;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

/**
 * Non-intrusive floating world-space XR Blocks panel that visually illustrates
 * the hand, bimanual, and head gestures for all 14 elemental powers.
 * Automatically appears via smooth VisibilityTransition only when the user is
 * idle inside an active XR / Simulator session, and hides the moment the user
 * raises a pose or interacts.
 */
export class IdleGestureGuidePanel extends THREE.Group {
  readonly card: xb.UICard;
  private readonly visibilityTransition: xb.VisibilityTransition;
  private readonly textures: THREE.CanvasTexture[] = [];

  private shown = false;

  constructor() {
    super();
    this.name = 'Idle Elemental Gesture Guide';

    const rows: xb.UIPanel[] = [];
    const colsPerRow = 4;

    for (let i = 0; i < GUIDE_TILES.length; i += colsPerRow) {
      const slice = GUIDE_TILES.slice(i, i + colsPerRow);
      const rowTiles: xb.UIPanel[] = slice.map((tile) => {
        const tex = createGestureIllustrationTexture(tile);
        this.textures.push(tex);

        return new xb.UIPanel({
          pointerEvents: 'none',
          style: {
            flexGrow: 1,
            flexBasis: 0,
            flexDirection: 'column',
            alignItems: 'center',
            gap: 3,
            padding: 6,
            borderRadius: 12,
            backgroundColor: 'rgba(15, 23, 42, 0.7)',
          },
          children: [
            new xb.UIImage({
              src: tex,
              ariaLabel: `${tile.title}: ${tile.gesture}`,
              pointerEvents: 'none',
              style: {
                width: '100%',
                height: 62,
                objectFit: 'contain',
                borderRadius: 8,
              },
            }),
            new xb.UIText({
              text: tile.title,
              pointerEvents: 'none',
              style: {
                width: '100%',
                fontSize: 12,
                fontWeight: 'bold',
                textAlign: 'center',
                color: tile.colorHex,
              },
            }),
            new xb.UIText({
              text: tile.gesture,
              pointerEvents: 'none',
              style: {
                width: '100%',
                fontSize: 10,
                textAlign: 'center',
                color: '#cbd5e1',
                opacity: 0.85,
              },
            }),
          ],
        });
      });

      // Pad final row cleanly if fewer than 4 tiles so tile widths stay uniform
      while (rowTiles.length < colsPerRow) {
        rowTiles.push(
          new xb.UIPanel({
            pointerEvents: 'none',
            style: {
              flexGrow: 1,
              flexBasis: 0,
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              padding: 8,
              borderRadius: 12,
              backgroundColor: 'rgba(15, 23, 42, 0.38)',
            },
            children: [
              new xb.UIText({
                text:
                  rowTiles.length === 2
                    ? 'HOLD & RELEASE'
                    : 'ANTI-MISFIRE',
                pointerEvents: 'none',
                style: {
                  fontSize: 10,
                  fontWeight: 'bold',
                  textAlign: 'center',
                  color: '#38bdf8',
                },
              }),
              new xb.UIText({
                text:
                  rowTiles.length === 2
                    ? 'Thrust Open Palm or flick Finger Gun to launch charged orbs.'
                    : 'Hold each pose steadily for ~50ms to lock through hysteresis.',
                pointerEvents: 'none',
                style: {
                  fontSize: 9,
                  lineHeight: 1.3,
                  textAlign: 'center',
                  color: '#94a3b8',
                },
              }),
            ],
          })
        );
      }

      rows.push(
        new xb.UIPanel({
          pointerEvents: 'none',
          style: {
            width: '100%',
            flexDirection: 'row',
            gap: 8,
            alignItems: 'stretch',
          },
          children: rowTiles,
        })
      );
    }

    const header = new xb.UIPanel({
      pointerEvents: 'none',
      style: {
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingLeft: 4,
        paddingRight: 4,
      },
      children: [
        new xb.UIText({
          text: 'ELEMENTAL GESTURE GUIDE',
          pointerEvents: 'none',
          style: {
            fontSize: 16,
            fontWeight: 'bold',
            color: '#f8fafc',
          },
        }),
        new xb.UIText({
          text: 'Idle Reference · Auto-hides on cast',
          pointerEvents: 'none',
          style: {
            fontSize: 11,
            color: '#94a3b8',
          },
        }),
      ],
    });

    this.card = new xb.UICard({
      size: {width: 0.72, height: 'auto'},
      pointerEvents: 'none',
      style: {
        flexDirection: 'column',
        gap: 8,
        padding: 14,
        borderRadius: 20,
        backgroundColor: 'rgba(11, 16, 32, 0.82)',
      },
      children: [header, ...rows],
    });
    this.card.name = 'Idle Gesture Reference Card';
    // Start hidden until the user is idle inside an active XR / Simulator session
    this.card.visible = false;

    this.visibilityTransition = new xb.VisibilityTransition({duration: 0.35});

    // Gently float in the peripheral right-front view so center playspace & left
    // Spellbook remain completely clear
    this.card.add(
      new xb.FollowHead({
        offset: new THREE.Vector3(0.46, -0.08, -1.25),
        smoothing: 0.06,
      }),
      new xb.FaceCamera({
        mode: 'capsule',
        capsuleHalfHeight: 0.28,
        smoothing: 0.08,
      }),
      this.visibilityTransition
    );

    this.add(this.card);
  }

  get isShown(): boolean {
    return this.shown;
  }

  setIdleVisible(visible: boolean): void {
    if (this.shown === visible) return;
    this.shown = visible;
    if (visible) {
      this.visibilityTransition.show();
    } else {
      this.visibilityTransition.hide();
    }
  }

  dispose(): void {
    for (const tex of this.textures) {
      tex.dispose();
    }
    this.textures.length = 0;
  }
}
