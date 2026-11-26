import type RAPIER from '@dimforge/rapier3d-simd-compat';
import * as THREE from 'three';
import * as xb from 'xrblocks';

type RapierModule = typeof RAPIER;

export interface StaticBoxColliderSpec {
  pos: [number, number, number];
  halfExtents: [number, number, number];
}

/**
 * Procedural architectural Office Environment with composite multi-part PBR
 * furniture (executive desk, dual monitors, bookshelves, credenza, desk lamp,
 * potted plant, framed wall art, hardwood floor, and perimeter walls) plus
 * matching Rapier 3D static colliders so elemental projectiles and crystals
 * physically collide and bounce off office surfaces.
 */
export class OfficeEnvironment extends THREE.Group {
  private RAPIER: RapierModule | null = null;
  private world: RAPIER.World | null = null;
  private colliders: RAPIER.Collider[] = [];
  private colliderSpecs: StaticBoxColliderSpec[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];
  private textures: THREE.Texture[] = [];

  private _enabled = true;

  constructor() {
    super();
    this.name = 'Office Environment';
    this.xb = {pointerEvents: 'none'};
    this.buildOffice();
  }

  get enabled(): boolean {
    return this._enabled;
  }

  getColliderBounds(): readonly StaticBoxColliderSpec[] {
    return this._enabled ? this.colliderSpecs : [];
  }

  setEnabled(enabled: boolean): void {
    if (this._enabled === enabled) return;
    this._enabled = enabled;
    this.visible = enabled;
    if (enabled) {
      this.attachColliders();
    } else {
      this.detachColliders();
    }
  }

  initPhysics(physics: xb.Physics): void {
    this.RAPIER = physics.RAPIER as unknown as RapierModule;
    this.world = physics.blendedWorld as unknown as RAPIER.World;
    if (this._enabled) {
      this.attachColliders();
    }
  }

  private trackGeo<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.push(g);
    return g;
  }

  private trackMat<T extends THREE.Material>(m: T): T {
    this.materials.push(m);
    return m;
  }

  private createWoodTexture(
    repeatX = 4,
    repeatY = 3.2,
    baseHex = '#5a4030'
  ): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = baseHex;
    ctx.fillRect(0, 0, 512, 512);

    // Subtle oak plank grain with staggered joints
    for (let p = 0; p < 8; p++) {
      const y = p * 64;
      const shade = 84 + (p % 3) * 9;
      ctx.fillStyle = `rgb(${shade + 16}, ${shade - 4}, ${shade - 18})`;
      ctx.fillRect(0, y, 512, 62);
      ctx.fillStyle = 'rgba(24, 15, 10, 0.38)';
      ctx.fillRect(0, y + 62, 512, 2);

      // Vertical plank end-seam staggered per row
      const seamX = ((p * 173) % 440) + 36;
      ctx.fillStyle = 'rgba(24, 15, 10, 0.32)';
      ctx.fillRect(seamX, y, 2, 62);

      for (let g = 0; g < 18; g++) {
        ctx.strokeStyle = `rgba(38, 24, 15, ${0.08 + Math.random() * 0.1})`;
        ctx.lineWidth = 1 + Math.random() * 1.5;
        ctx.beginPath();
        const gy = y + 4 + Math.random() * 54;
        ctx.moveTo(0, gy);
        ctx.bezierCurveTo(
          170,
          gy + (Math.random() - 0.5) * 6,
          340,
          gy + (Math.random() - 0.5) * 6,
          512,
          gy
        );
        ctx.stroke();
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.anisotropy = 8;
    this.textures.push(tex);
    return tex;
  }

  private createCeilingTileTexture(
    repeatX = 6,
    repeatY = 4.5
  ): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    // Architectural acoustic plaster tile base
    ctx.fillStyle = '#cfd7e3';
    ctx.fillRect(0, 0, 512, 512);

    // 2x2 suspended acoustic panels per tile with subtle recessed bevel
    const half = 256;
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        const x0 = c * half;
        const y0 = r * half;

        // Soft interior panel gradient
        const panelGrad = ctx.createLinearGradient(
          x0,
          y0,
          x0 + half,
          y0 + half
        );
        panelGrad.addColorStop(0, '#d8e0eb');
        panelGrad.addColorStop(1, '#c3ccd9');
        ctx.fillStyle = panelGrad;
        ctx.fillRect(x0 + 5, y0 + 5, half - 10, half - 10);

        // Recessed shadow-gap grid lines
        ctx.strokeStyle = 'rgba(51, 65, 85, 0.45)';
        ctx.lineWidth = 4;
        ctx.strokeRect(x0 + 2, y0 + 2, half - 4, half - 4);

        // Subtle inner highlight bevel
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x0 + 6, y0 + 6, half - 12, half - 12);
      }
    }

    // Fine acoustic micro-texture stipple
    for (let i = 0; i < 1400; i++) {
      const px = Math.random() * 512;
      const py = Math.random() * 512;
      ctx.fillStyle =
        i % 3 === 0
          ? 'rgba(71, 85, 105, 0.09)'
          : 'rgba(255, 255, 255, 0.08)';
      ctx.fillRect(px, py, 2, 2);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.anisotropy = 8;
    this.textures.push(tex);
    return tex;
  }

  private createWallPlasterTexture(
    repeatX: number,
    repeatY: number,
    baseColor: string,
    seamColor: string
  ): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, 512, 512);

    // Subtle matte architectural plaster grain
    for (let i = 0; i < 2200; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const w = 1 + Math.random() * 3;
      const h = 1 + Math.random() * 2;
      ctx.fillStyle =
        i % 2 === 0
          ? 'rgba(255, 255, 255, 0.025)'
          : 'rgba(0, 0, 0, 0.04)';
      ctx.fillRect(x, y, w, h);
    }

    // Subtle architectural panel reveal seams
    ctx.strokeStyle = seamColor;
    ctx.lineWidth = 2;
    for (const x of [0, 256]) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 512);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.anisotropy = 8;
    this.textures.push(tex);
    return tex;
  }

  private createRugTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#334155';
    ctx.fillRect(0, 0, 512, 512);

    // Woven cross-hatch texture
    ctx.fillStyle = 'rgba(148, 163, 184, 0.08)';
    for (let y = 0; y < 512; y += 4) {
      ctx.fillRect(0, y, 512, 1);
    }
    ctx.fillStyle = 'rgba(15, 23, 42, 0.14)';
    for (let x = 0; x < 512; x += 6) {
      ctx.fillRect(x, 0, 2, 512);
    }

    // Subtle double stitched perimeter border
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
    ctx.lineWidth = 6;
    ctx.strokeRect(18, 18, 476, 476);
    ctx.strokeStyle = 'rgba(203, 213, 225, 0.16)';
    ctx.lineWidth = 2;
    ctx.strokeRect(30, 30, 452, 452);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    this.textures.push(tex);
    return tex;
  }

  private createScreenTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    const grad = ctx.createLinearGradient(0, 0, 512, 256);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(1, '#1e293b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 256);

    // Subtle workspace UI wireframe lines on office monitor
    ctx.fillStyle = 'rgba(56, 189, 248, 0.16)';
    ctx.fillRect(24, 24, 140, 208);
    ctx.fillStyle = 'rgba(148, 163, 184, 0.14)';
    ctx.fillRect(184, 24, 304, 110);
    ctx.fillRect(184, 150, 144, 82);
    ctx.fillRect(344, 150, 144, 82);

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const x = 198 + i * 25;
      const y = 95 - Math.sin(i * 0.7) * 24 - i * 1.6;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    this.textures.push(tex);
    return tex;
  }

  private buildOffice(): void {
    // Watertight room interior dimensions:
    // X: [-4.1, +4.1] (width 8.2m)
    // Z: [-3.55, +2.65] (depth 6.2m, center z = -0.45m)
    // Y: [0.0, 3.20] (height 3.2m)
    const roomW = 8.2;
    const roomD = 6.2;
    const roomH = 3.2;
    const roomCenterZ = -0.45;
    const backWallZ = roomCenterZ - roomD / 2; // -3.55
    const rearWallZ = roomCenterZ + roomD / 2; // +2.65
    const halfW = roomW / 2; // 4.1

    const floorWoodTex = this.createWoodTexture(4.2, 3.2, '#5a4030');
    const deskWoodTex = this.createWoodTexture(2.0, 1.0, '#6a4a35');
    const ceilingTex = this.createCeilingTileTexture(6, 4.5);
    const backWallTex = this.createWallPlasterTexture(
      4.1,
      1.6,
      '#222938',
      'rgba(10, 15, 25, 0.35)'
    );
    const sideWallTex = this.createWallPlasterTexture(
      3.1,
      1.6,
      '#2c3444',
      'rgba(15, 23, 42, 0.28)'
    );
    const rugTex = this.createRugTexture();
    const screenTex = this.createScreenTexture();

    const floorMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: floorWoodTex,
        roughness: 0.58,
        metalness: 0.06,
      })
    );
    const subfloorMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x151922,
        roughness: 0.95,
      })
    );
    const ceilingMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: ceilingTex,
        emissiveMap: ceilingTex,
        emissive: 0x3b485c,
        emissiveIntensity: 0.42,
        roughness: 0.88,
        metalness: 0.02,
      })
    );
    const roofCapMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x1b2230,
        roughness: 0.92,
      })
    );
    const wallMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: sideWallTex,
        roughness: 0.88,
        metalness: 0.04,
      })
    );
    const accentWallMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: backWallTex,
        roughness: 0.84,
        metalness: 0.06,
      })
    );
    const trimMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x181e29,
        roughness: 0.55,
        metalness: 0.12,
      })
    );
    const deskWoodMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: deskWoodTex,
        roughness: 0.48,
        metalness: 0.08,
      })
    );
    const darkMetalMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x1f242c,
        roughness: 0.34,
        metalness: 0.82,
      })
    );
    const brushedAluminumMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        roughness: 0.25,
        metalness: 0.88,
      })
    );
    const screenMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: screenTex,
        emissiveMap: screenTex,
        emissive: 0x38bdf8,
        emissiveIntensity: 0.35,
        roughness: 0.15,
        metalness: 0.1,
      })
    );
    const ceramicMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        roughness: 0.25,
        metalness: 0.05,
      })
    );
    const rugMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: rugTex,
        roughness: 0.94,
        metalness: 0.0,
      })
    );
    const lampGlowMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfef3c7,
        emissive: 0xfbbf24,
        emissiveIntensity: 1.4,
        roughness: 0.2,
      })
    );
    const ceilingLedMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xfff7e6,
        emissiveIntensity: 1.5,
        roughness: 0.18,
        metalness: 0.05,
      })
    );
    const plantLeafMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x2d6a4f,
        roughness: 0.65,
        metalness: 0.02,
      })
    );

    // 1. Hardwood Floor (clean UV-mapped top plane + solid subfloor + woven area rug)
    const floorSurface = new THREE.Mesh(
      this.trackGeo(new THREE.PlaneGeometry(roomW, roomD)),
      floorMat
    );
    floorSurface.rotation.x = -Math.PI / 2;
    floorSurface.position.set(0, 0, roomCenterZ);
    floorSurface.receiveShadow = true;
    this.add(floorSurface);

    const subfloor = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(roomW + 0.24, 0.08, roomD + 0.24)),
      subfloorMat
    );
    subfloor.position.set(0, -0.045, roomCenterZ);
    this.add(subfloor);

    const rug = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(3.4, 0.016, 2.5)),
      rugMat
    );
    rug.position.set(0, 0.008, -1.1);
    rug.receiveShadow = true;
    this.add(rug);

    // 2. Complete 4-Wall Enclosure (Back, Rear, Left, Right) with world-scaled UVs
    const wallThick = 0.16;

    const backWall = new THREE.Mesh(
      this.trackGeo(new THREE.PlaneGeometry(roomW, roomH)),
      accentWallMat
    );
    backWall.position.set(0, roomH / 2, backWallZ);
    backWall.receiveShadow = true;
    this.add(backWall);
    this.colliderSpecs.push({
      pos: [0, roomH / 2, backWallZ - wallThick / 2],
      halfExtents: [halfW + 0.12, roomH / 2, wallThick / 2],
    });

    const rearWall = new THREE.Mesh(
      this.trackGeo(new THREE.PlaneGeometry(roomW, roomH)),
      accentWallMat
    );
    rearWall.rotation.y = Math.PI;
    rearWall.position.set(0, roomH / 2, rearWallZ);
    rearWall.receiveShadow = true;
    this.add(rearWall);
    this.colliderSpecs.push({
      pos: [0, roomH / 2, rearWallZ + wallThick / 2],
      halfExtents: [halfW + 0.12, roomH / 2, wallThick / 2],
    });

    const leftWall = new THREE.Mesh(
      this.trackGeo(new THREE.PlaneGeometry(roomD, roomH)),
      wallMat
    );
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-halfW, roomH / 2, roomCenterZ);
    leftWall.receiveShadow = true;
    this.add(leftWall);
    this.colliderSpecs.push({
      pos: [-halfW - wallThick / 2, roomH / 2, roomCenterZ],
      halfExtents: [wallThick / 2, roomH / 2, roomD / 2 + 0.12],
    });

    const rightWall = new THREE.Mesh(
      this.trackGeo(new THREE.PlaneGeometry(roomD, roomH)),
      wallMat
    );
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(halfW, roomH / 2, roomCenterZ);
    rightWall.receiveShadow = true;
    this.add(rightWall);
    this.colliderSpecs.push({
      pos: [halfW + wallThick / 2, roomH / 2, roomCenterZ],
      halfExtents: [wallThick / 2, roomH / 2, roomD / 2 + 0.12],
    });

    // Subtle slatted architectural wood panels on back wall
    const slatGeo = this.trackGeo(new THREE.BoxGeometry(0.06, 2.86, 0.03));
    for (let i = -8; i <= 8; i++) {
      const slat = new THREE.Mesh(slatGeo, deskWoodMat);
      slat.position.set(i * 0.18, 1.56, backWallZ + 0.02);
      slat.receiveShadow = true;
      this.add(slat);
    }

    // 2b. Watertight Roof / Ceiling with Acoustic Tile Texture, Timber Beams & Recessed LED Troffers
    // castShadow = false ensures the studio directional key light illuminates the interior cleanly
    const ceilingSurface = new THREE.Mesh(
      this.trackGeo(new THREE.PlaneGeometry(roomW, roomD)),
      ceilingMat
    );
    ceilingSurface.rotation.x = Math.PI / 2;
    ceilingSurface.position.set(0, roomH, roomCenterZ);
    ceilingSurface.receiveShadow = true;
    ceilingSurface.castShadow = false;
    this.add(ceilingSurface);

    // Exterior roof cap slab sealing the top perimeter cleanly
    const roofCap = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(roomW + 0.24, 0.12, roomD + 0.24)),
      roofCapMat
    );
    roofCap.position.set(0, roomH + 0.065, roomCenterZ);
    roofCap.castShadow = false;
    this.add(roofCap);
    this.colliderSpecs.push({
      pos: [0, roomH + 0.065, roomCenterZ],
      halfExtents: [halfW + 0.12, 0.065, roomD / 2 + 0.12],
    });

    // Exposed walnut architectural ceiling beams
    const beamGeo = this.trackGeo(new THREE.BoxGeometry(roomW - 0.02, 0.11, 0.13));
    const bracketGeo = this.trackGeo(new THREE.BoxGeometry(0.08, 0.13, 0.15));
    for (const bz of [-2.45, -1.1, 0.25, 1.6]) {
      const beam = new THREE.Mesh(beamGeo, deskWoodMat);
      beam.position.set(0, roomH - 0.055, bz);
      beam.receiveShadow = true;
      beam.castShadow = false;
      this.add(beam);

      for (const sx of [-halfW + 0.04, halfW - 0.04]) {
        const bracket = new THREE.Mesh(bracketGeo, darkMetalMat);
        bracket.position.set(sx, roomH - 0.055, bz);
        this.add(bracket);
      }
    }

    // Recessed architectural LED light panels centered in the ceiling bays
    const ledFrameGeo = this.trackGeo(new THREE.BoxGeometry(1.42, 0.014, 0.44));
    const ledDiffuserGeo = this.trackGeo(new THREE.PlaneGeometry(1.34, 0.36));
    for (const lz of [-1.78, -0.42, 0.92]) {
      for (const lx of [-1.85, 1.85]) {
        const frame = new THREE.Mesh(ledFrameGeo, brushedAluminumMat);
        frame.position.set(lx, roomH - 0.008, lz);
        this.add(frame);

        const diffuser = new THREE.Mesh(ledDiffuserGeo, ceilingLedMat);
        diffuser.rotation.x = Math.PI / 2;
        diffuser.position.set(lx, roomH - 0.016, lz);
        this.add(diffuser);
      }
    }

    // Perimeter crown molding (ceiling seam) & baseboards (floor seam) for crisp corner seals
    const longTrimGeo = this.trackGeo(new THREE.BoxGeometry(roomW, 0.08, 0.04));
    const sideTrimGeo = this.trackGeo(new THREE.BoxGeometry(0.04, 0.08, roomD));
    for (const yPos of [0.04, roomH - 0.04]) {
      const backTrim = new THREE.Mesh(longTrimGeo, trimMat);
      backTrim.position.set(0, yPos, backWallZ + 0.02);
      const rearTrim = new THREE.Mesh(longTrimGeo, trimMat);
      rearTrim.position.set(0, yPos, rearWallZ - 0.02);
      const leftTrim = new THREE.Mesh(sideTrimGeo, trimMat);
      leftTrim.position.set(-halfW + 0.02, yPos, roomCenterZ);
      const rightTrim = new THREE.Mesh(sideTrimGeo, trimMat);
      rightTrim.position.set(halfW - 0.02, yPos, roomCenterZ);
      this.add(backTrim, rearTrim, leftTrim, rightTrim);
    }

    // Warm indoor bounce light so the ceiling tiles, beams, and upper walls are cleanly illuminated
    const indoorBounceLight = new THREE.PointLight(0xfff4e0, 1.4, 11, 1.35);
    indoorBounceLight.position.set(0, 2.55, -0.75);
    this.add(indoorBounceLight);

    // 3. Executive Office Desk (Composite multi-part group at z = -2.45m, tabletop y = 0.76m)
    const deskGroup = new THREE.Group();
    deskGroup.position.set(0, 0, -2.45);

    const desktop = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(2.1, 0.055, 0.88)),
      deskWoodMat
    );
    desktop.position.y = 0.76;
    desktop.castShadow = true;
    desktop.receiveShadow = true;
    deskGroup.add(desktop);

    const legGeo = this.trackGeo(new THREE.BoxGeometry(0.06, 0.73, 0.74));
    for (const sx of [-0.94, 0.94]) {
      const leg = new THREE.Mesh(legGeo, darkMetalMat);
      leg.position.set(sx, 0.365, 0);
      leg.castShadow = true;
      deskGroup.add(leg);
    }
    const modesty = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(1.82, 0.36, 0.03)),
      darkMetalMat
    );
    modesty.position.set(0, 0.54, -0.34);
    deskGroup.add(modesty);

    // Ultrawide Office Monitor on brushed aluminum stand
    const standBase = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(0.26, 0.016, 0.18)),
      brushedAluminumMat
    );
    standBase.position.set(0, 0.795, -0.22);
    deskGroup.add(standBase);

    const standNeck = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(0.045, 0.22, 0.03)),
      brushedAluminumMat
    );
    standNeck.position.set(0, 0.9, -0.26);
    deskGroup.add(standNeck);

    const monitorChassis = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(0.84, 0.38, 0.032)),
      darkMetalMat
    );
    monitorChassis.position.set(0, 1.08, -0.23);
    monitorChassis.castShadow = true;
    deskGroup.add(monitorChassis);

    const monitorScreen = new THREE.Mesh(
      this.trackGeo(new THREE.PlaneGeometry(0.8, 0.34)),
      screenMat
    );
    monitorScreen.position.set(0, 1.08, -0.212);
    deskGroup.add(monitorScreen);

    // Keyboard & Coffee Mug
    const keyboard = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(0.36, 0.014, 0.13)),
      darkMetalMat
    );
    keyboard.position.set(-0.04, 0.795, 0.12);
    deskGroup.add(keyboard);

    const mug = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.038, 0.034, 0.095, 16)),
      ceramicMat
    );
    mug.position.set(0.56, 0.835, 0.14);
    mug.castShadow = true;
    deskGroup.add(mug);

    // Articulated Architect Desk Lamp
    const lampBase = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.08, 0.09, 0.02, 16)),
      darkMetalMat
    );
    lampBase.position.set(-0.78, 0.798, -0.18);
    deskGroup.add(lampBase);

    const lampStem = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 10)),
      brushedAluminumMat
    );
    lampStem.position.set(-0.78, 1.0, -0.18);
    lampStem.rotation.z = -0.15;
    deskGroup.add(lampStem);

    const lampShade = new THREE.Mesh(
      this.trackGeo(new THREE.ConeGeometry(0.095, 0.12, 16)),
      darkMetalMat
    );
    lampShade.position.set(-0.69, 1.2, -0.14);
    lampShade.rotation.z = -0.55;
    deskGroup.add(lampShade);

    const lampBulb = new THREE.Mesh(
      this.trackGeo(new THREE.SphereGeometry(0.036, 12, 10)),
      lampGlowMat
    );
    lampBulb.position.set(-0.67, 1.16, -0.14);
    deskGroup.add(lampBulb);

    this.add(deskGroup);
    // Desk tabletop + monitor colliders
    this.colliderSpecs.push({
      pos: [0, 0.76, -2.45],
      halfExtents: [1.05, 0.03, 0.44],
    });
    this.colliderSpecs.push({
      pos: [0, 1.08, -2.68],
      halfExtents: [0.43, 0.2, 0.04],
    });

    // 4. Side Credenzas / Bookshelves flanking the desk (matches crystal pedestals!)
    this.addOfficeShelf(-2.15, -2.15, 0.35, deskWoodMat, darkMetalMat);
    this.addOfficeShelf(2.15, -2.15, -0.35, deskWoodMat, darkMetalMat);

    // 5. Potted Monstera / Office Plant in corner
    const plantGroup = new THREE.Group();
    plantGroup.position.set(-2.95, 0, -2.8);
    const pot = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.22, 0.16, 0.42, 14)),
      ceramicMat
    );
    pot.position.y = 0.21;
    pot.castShadow = true;
    plantGroup.add(pot);

    const leafGeo = this.trackGeo(new THREE.ConeGeometry(0.16, 0.52, 6));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const leaf = new THREE.Mesh(leafGeo, plantLeafMat);
      leaf.position.set(
        Math.cos(a) * 0.14,
        0.62 + (i % 2) * 0.12,
        Math.sin(a) * 0.14
      );
      leaf.rotation.z = -Math.cos(a) * 0.5;
      leaf.rotation.x = Math.sin(a) * 0.5;
      leaf.castShadow = true;
      plantGroup.add(leaf);
    }
    this.add(plantGroup);
  }

  private addOfficeShelf(
    x: number,
    z: number,
    rotY: number,
    woodMat: THREE.Material,
    metalMat: THREE.Material
  ): void {
    const shelf = new THREE.Group();
    shelf.position.set(x, 0, z);
    shelf.rotation.y = rotY;

    const frameGeo = this.trackGeo(new THREE.BoxGeometry(0.04, 1.56, 0.04));
    for (const sx of [-0.52, 0.52]) {
      for (const sz of [-0.2, 0.2]) {
        const post = new THREE.Mesh(frameGeo, metalMat);
        post.position.set(sx, 0.78, sz);
        post.castShadow = true;
        shelf.add(post);
      }
    }

    const plankGeo = this.trackGeo(new THREE.BoxGeometry(1.08, 0.035, 0.44));
    for (const sy of [0.18, 0.62, 1.06, 1.52]) {
      const plank = new THREE.Mesh(plankGeo, woodMat);
      plank.position.y = sy;
      plank.castShadow = true;
      plank.receiveShadow = true;
      shelf.add(plank);
    }

    this.add(shelf);
    this.colliderSpecs.push({
      pos: [x, 0.78, z],
      halfExtents: [0.56, 0.78, 0.24],
    });
  }

  private attachColliders(): void {
    if (!this.RAPIER || !this.world || this.colliders.length > 0) return;
    for (const spec of this.colliderSpecs) {
      const desc = this.RAPIER.ColliderDesc.cuboid(
        spec.halfExtents[0],
        spec.halfExtents[1],
        spec.halfExtents[2]
      )
        .setTranslation(spec.pos[0], spec.pos[1], spec.pos[2])
        .setRestitution(0.68);
      this.colliders.push(this.world.createCollider(desc));
    }
  }

  private detachColliders(): void {
    if (!this.world) return;
    for (const col of this.colliders) {
      this.world.removeCollider(col, true);
    }
    this.colliders.length = 0;
  }

  dispose(): void {
    this.detachColliders();
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
    this.geometries.length = 0;
    this.materials.length = 0;
    this.textures.length = 0;
  }
}
