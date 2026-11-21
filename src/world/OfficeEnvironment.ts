import type RAPIER from '@dimforge/rapier3d-simd-compat';
import * as THREE from 'three';
import * as xb from 'xrblocks';

type RapierModule = typeof RAPIER;

interface StaticBoxColliderSpec {
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

  private createWoodTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#5a4030';
    ctx.fillRect(0, 0, 512, 512);

    // Subtle oak plank grain
    for (let p = 0; p < 8; p++) {
      const y = p * 64;
      const shade = 78 + (p % 3) * 9;
      ctx.fillStyle = `rgb(${shade + 14}, ${shade - 4}, ${shade - 18})`;
      ctx.fillRect(0, y, 512, 62);
      ctx.fillStyle = 'rgba(28, 18, 12, 0.35)';
      ctx.fillRect(0, y + 62, 512, 2);

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
    tex.repeat.set(4, 4);
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
    this.textures.push(tex);
    return tex;
  }

  private buildOffice(): void {
    const woodTex = this.createWoodTexture();
    const screenTex = this.createScreenTexture();

    const floorMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: woodTex,
        roughness: 0.62,
        metalness: 0.06,
      })
    );
    const wallMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x262b36,
        roughness: 0.9,
        metalness: 0.04,
      })
    );
    const accentWallMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x1e2430,
        roughness: 0.85,
        metalness: 0.08,
      })
    );
    const deskWoodMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x6f4e37,
        roughness: 0.52,
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
        color: 0x334155,
        roughness: 0.95,
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
    const plantLeafMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x2d6a4f,
        roughness: 0.65,
        metalness: 0.02,
      })
    );

    // 1. Hardwood Floor + Center Area Rug (offset +0.008m to prevent Z-fighting)
    const floor = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(8.4, 0.08, 7.6)),
      floorMat
    );
    floor.position.set(0, -0.04, -1.2);
    floor.receiveShadow = true;
    this.add(floor);

    const rug = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(3.4, 0.014, 2.5)),
      rugMat
    );
    rug.position.set(0, 0.007, -1.1);
    rug.receiveShadow = true;
    this.add(rug);

    // 2. Architectural Perimeter Walls (Back, Left, Right + Ceiling trim beams)
    const backWall = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(8.4, 3.2, 0.16)),
      accentWallMat
    );
    backWall.position.set(0, 1.6, -3.55);
    backWall.receiveShadow = true;
    this.add(backWall);
    this.colliderSpecs.push({pos: [0, 1.6, -3.55], halfExtents: [4.2, 1.6, 0.08]});

    // Subtle slatted architectural wood panels on back wall
    const slatGeo = this.trackGeo(new THREE.BoxGeometry(0.06, 2.8, 0.03));
    for (let i = -8; i <= 8; i++) {
      const slat = new THREE.Mesh(slatGeo, deskWoodMat);
      slat.position.set(i * 0.18, 1.55, -3.45);
      slat.receiveShadow = true;
      this.add(slat);
    }

    const leftWall = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(0.16, 3.2, 7.6)),
      wallMat
    );
    leftWall.position.set(-4.1, 1.6, -1.2);
    leftWall.receiveShadow = true;
    this.add(leftWall);
    this.colliderSpecs.push({pos: [-4.1, 1.6, -1.2], halfExtents: [0.08, 1.6, 3.8]});

    const rightWall = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(0.16, 3.2, 7.6)),
      wallMat
    );
    rightWall.position.set(4.1, 1.6, -1.2);
    rightWall.receiveShadow = true;
    this.add(rightWall);
    this.colliderSpecs.push({pos: [4.1, 1.6, -1.2], halfExtents: [0.08, 1.6, 3.8]});

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
      leaf.position.set(Math.cos(a) * 0.14, 0.62 + (i % 2) * 0.12, Math.sin(a) * 0.14);
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
