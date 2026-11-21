import type RAPIER from '@dimforge/rapier3d-simd-compat';
import * as THREE from 'three';
import * as xb from 'xrblocks';

type RapierModule = typeof RAPIER;

export interface ElementalTarget {
  id: number;
  group: THREE.Group;
  crystalMeshes: THREE.Mesh[];
  homePosition: THREE.Vector3;
  color: number;
  hp: number;
  maxHp: number;
  shattered: boolean;
  respawnTimer: number;
  body: RAPIER.RigidBody | null;
  collider: RAPIER.Collider | null;
  frozen: boolean;
  hoverPhase: number;
}

export interface IncomingOrb {
  mesh: THREE.Mesh;
  body: RAPIER.RigidBody | null;
  collider: RAPIER.Collider | null;
  velocity: THREE.Vector3;
  age: number;
  deflected: boolean;
  frozen: boolean;
}

const CRYSTAL_PALETTES = [
  {main: 0xff6b2b, accent: 0xffd166}, // Ember
  {main: 0x38bdf8, accent: 0xe0f2fe}, // Frost
  {main: 0x34d399, accent: 0xa7f3d0}, // Verdant
  {main: 0xa855f7, accent: 0xe9d5ff}, // Arcane
  {main: 0xfbbf24, accent: 0xfef3c7}, // Solar
  {main: 0xf43f5e, accent: 0xfecdd3}, // Plasma
];

/**
 * Manages the physical room's breakable composite Elemental Target Crystals
 * (arranged around tabletops/walls while keeping center playspace clear),
 * safety floor collider, and optional deflectable Practice Barrage orbs.
 */
export class ElementalArena extends THREE.Group {
  readonly targets: ElementalTarget[] = [];
  readonly incomingOrbs: IncomingOrb[] = [];

  private RAPIER: RapierModule | null = null;
  private world: RAPIER.World | null = null;
  private floorCollider: RAPIER.Collider | null = null;

  private sharedPedestalGeo: THREE.CylinderGeometry;
  private sharedRingGeo: THREE.TorusGeometry;
  private sharedSpireGeo: THREE.CylinderGeometry;
  private sharedSideShardGeo: THREE.ConeGeometry;
  private sharedOrbGeo: THREE.IcosahedronGeometry;

  private pedestalMat: THREE.MeshStandardMaterial;
  private brassTrimMat: THREE.MeshStandardMaterial;
  private orbMat: THREE.MeshStandardMaterial;

  barrageEnabled = false;
  private barrageTimer = 1.6;
  shatteredCount = 0;

  constructor() {
    super();
    this.name = 'Elemental Arena';

    this.sharedPedestalGeo = new THREE.CylinderGeometry(0.11, 0.14, 0.08, 7);
    this.sharedRingGeo = new THREE.TorusGeometry(0.115, 0.01, 8, 20);
    this.sharedSpireGeo = new THREE.CylinderGeometry(0.015, 0.062, 0.28, 6);
    this.sharedSideShardGeo = new THREE.ConeGeometry(0.036, 0.17, 5);
    this.sharedOrbGeo = new THREE.IcosahedronGeometry(0.07, 1);

    this.pedestalMat = new THREE.MeshStandardMaterial({
      color: 0x2b2d34,
      roughness: 0.85,
      metalness: 0.18,
      flatShading: true,
    });
    this.brassTrimMat = new THREE.MeshStandardMaterial({
      color: 0xc8a46b,
      roughness: 0.28,
      metalness: 0.88,
    });
    this.orbMat = new THREE.MeshStandardMaterial({
      color: 0xf43f5e,
      emissive: 0xbe123c,
      emissiveIntensity: 1.4,
      roughness: 0.2,
      metalness: 0.6,
      flatShading: true,
    });

    this.buildInitialTargets();
  }

  private buildInitialTargets(): void {
    // Arranged in an ergonomic semicircle (1.8m–2.6m away) at tabletop & shelf heights,
    // leaving the center playspace completely open for arm swings.
    const placements: Array<[number, number, number]> = [
      [-1.35, 1.05, -2.05],
      [-0.7, 1.38, -2.35],
      [0.0, 1.12, -2.5],
      [0.72, 1.42, -2.32],
      [1.38, 1.02, -2.02],
      [-1.8, 1.55, -1.45],
      [1.82, 1.52, -1.42],
      [0.0, 1.82, -2.25],
    ];

    placements.forEach(([x, y, z], index) => {
      const palette = CRYSTAL_PALETTES[index % CRYSTAL_PALETTES.length];
      const group = new THREE.Group();
      group.name = `Elemental crystal ${index + 1}`;
      group.position.set(x, y, z);

      // Composite 6-part procedural crystal cluster (bottom-center grounded)
      const pedestal = new THREE.Mesh(this.sharedPedestalGeo, this.pedestalMat);
      pedestal.position.y = 0.04;
      pedestal.castShadow = true;
      pedestal.receiveShadow = true;
      group.add(pedestal);

      const trimRing = new THREE.Mesh(this.sharedRingGeo, this.brassTrimMat);
      trimRing.rotation.x = Math.PI / 2;
      trimRing.position.y = 0.08;
      group.add(trimRing);

      const crystalMat = new THREE.MeshStandardMaterial({
        color: palette.main,
        emissive: palette.main,
        emissiveIntensity: 0.42,
        roughness: 0.16,
        metalness: 0.25,
        flatShading: true,
      });

      const crystalMeshes: THREE.Mesh[] = [];

      // Primary central spire
      const mainSpire = new THREE.Mesh(this.sharedSpireGeo, crystalMat);
      mainSpire.position.y = 0.21;
      mainSpire.castShadow = true;
      group.add(mainSpire);
      crystalMeshes.push(mainSpire);

      // 3 angled secondary cluster shards
      for (let s = 0; s < 3; s++) {
        const angle = (s * Math.PI * 2) / 3 + index * 0.4;
        const shard = new THREE.Mesh(this.sharedSideShardGeo, crystalMat);
        shard.position.set(Math.cos(angle) * 0.055, 0.15, Math.sin(angle) * 0.055);
        shard.rotation.z = -Math.cos(angle) * 0.36;
        shard.rotation.x = Math.sin(angle) * 0.36;
        shard.scale.setScalar(0.82 + (s % 2) * 0.24);
        shard.castShadow = true;
        group.add(shard);
        crystalMeshes.push(shard);
      }

      this.add(group);
      this.targets.push({
        id: index,
        group,
        crystalMeshes,
        homePosition: new THREE.Vector3(x, y, z),
        color: palette.main,
        hp: 100,
        maxHp: 100,
        shattered: false,
        respawnTimer: 0,
        body: null,
        collider: null,
        frozen: false,
        hoverPhase: index * 0.9,
      });
    });
  }

  initPhysics(physics: xb.Physics): void {
    this.RAPIER = physics.RAPIER as unknown as RapierModule;
    this.world = physics.blendedWorld as unknown as RAPIER.World;

    // Safety floor plane at y = 0 so bounced fireballs & dislodged crystals always collide cleanly
    const floorDesc = this.RAPIER.ColliderDesc.cuboid(12, 0.05, 12).setTranslation(
      0,
      -0.05,
      0
    );
    this.floorCollider = this.world.createCollider(floorDesc);

    for (const target of this.targets) {
      this.createTargetRigidBody(target);
    }
  }

  private createTargetRigidBody(target: ElementalTarget): void {
    if (!this.RAPIER || !this.world) return;
    if (target.body) {
      this.world.removeRigidBody(target.body);
      target.body = null;
      target.collider = null;
    }
    const desc = this.RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(
        target.homePosition.x,
        target.homePosition.y,
        target.homePosition.z
      )
      .setGravityScale(0.08) // Gently buoyant elemental crystals until struck
      .setLinearDamping(1.1)
      .setAngularDamping(1.2);

    const body = this.world.createRigidBody(desc);
    const colDesc = this.RAPIER.ColliderDesc.cylinder(0.16, 0.13)
      .setRestitution(0.65)
      .setDensity(1.4);
    const collider = this.world.createCollider(colDesc, body);
    target.body = body;
    target.collider = collider;
  }

  applyImpulseToTarget(
    target: ElementalTarget,
    impulse: THREE.Vector3,
    damage: number,
    onShatter?: (pos: THREE.Vector3, color: number) => void
  ): void {
    if (target.shattered) return;
    if (target.body) {
      target.body.setGravityScale(0.75, true);
      target.body.applyImpulse({x: impulse.x, y: impulse.y, z: impulse.z}, true);
    }
    target.hp -= damage;
    if (target.hp <= 0) {
      this.shatterTarget(target, onShatter);
    }
  }

  shatterTarget(
    target: ElementalTarget,
    onShatter?: (pos: THREE.Vector3, color: number) => void
  ): void {
    if (target.shattered) return;
    target.shattered = true;
    target.respawnTimer = 6.5;
    target.group.visible = false;
    this.shatteredCount++;
    const shatterPos = target.group.position.clone();
    shatterPos.y += 0.16;

    if (target.body && this.world) {
      this.world.removeRigidBody(target.body);
      target.body = null;
      target.collider = null;
    }
    onShatter?.(shatterPos, target.color);
  }

  resetAll(): void {
    this.shatteredCount = 0;
    for (const target of this.targets) {
      target.shattered = false;
      target.hp = target.maxHp;
      target.respawnTimer = 0;
      target.frozen = false;
      target.group.visible = true;
      target.group.position.copy(target.homePosition);
      target.group.quaternion.identity();
      if (this.RAPIER && this.world) {
        this.createTargetRigidBody(target);
      }
    }
    this.clearIncomingOrbs();
  }

  clearIncomingOrbs(): void {
    for (const orb of this.incomingOrbs) {
      this.remove(orb.mesh);
      if (orb.body && this.world) {
        this.world.removeRigidBody(orb.body);
      }
    }
    this.incomingOrbs.length = 0;
  }

  spawnIncomingOrb(playerPosition: THREE.Vector3): void {
    const angle = (Math.random() - 0.5) * 1.1;
    const dist = 2.8 + Math.random() * 0.6;
    const spawnPos = new THREE.Vector3(
      playerPosition.x + Math.sin(angle) * dist,
      playerPosition.y - 0.1 + (Math.random() - 0.5) * 0.45,
      playerPosition.z - Math.cos(angle) * dist
    );
    const aimTarget = playerPosition
      .clone()
      .add(new THREE.Vector3((Math.random() - 0.5) * 0.25, -0.15, 0));
    const velocity = aimTarget.sub(spawnPos).normalize().multiplyScalar(1.35);

    const mesh = new THREE.Mesh(this.sharedOrbGeo, this.orbMat);
    mesh.position.copy(spawnPos);
    mesh.castShadow = true;
    this.add(mesh);

    let body: RAPIER.RigidBody | null = null;
    let collider: RAPIER.Collider | null = null;
    if (this.RAPIER && this.world) {
      const desc = this.RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(spawnPos.x, spawnPos.y, spawnPos.z)
        .setLinvel(velocity.x, velocity.y, velocity.z)
        .setGravityScale(0.0);
      body = this.world.createRigidBody(desc);
      const colDesc = this.RAPIER.ColliderDesc.ball(0.075).setRestitution(1.1);
      collider = this.world.createCollider(colDesc, body);
    }

    this.incomingOrbs.push({
      mesh,
      body,
      collider,
      velocity,
      age: 0,
      deflected: false,
      frozen: false,
    });
  }

  update(
    dt: number,
    elapsed: number,
    playerPosition: THREE.Vector3,
    voidDomeActive: boolean,
    voidDomeCenter: THREE.Vector3,
    voidDomeRadius: number,
    shieldPositions: Array<{pos: THREE.Vector3; normal: THREE.Vector3; radius: number}>,
    onDeflect?: (pos: THREE.Vector3) => void
  ): void {
    // Sync targets from Rapier + gentle hover & respawn
    for (const target of this.targets) {
      if (target.shattered) {
        target.respawnTimer -= dt;
        if (target.respawnTimer <= 0) {
          target.shattered = false;
          target.hp = target.maxHp;
          target.group.visible = true;
          target.group.position.copy(target.homePosition);
          target.group.quaternion.identity();
          this.createTargetRigidBody(target);
        }
        continue;
      }

      if (target.body) {
        const t = target.body.translation();
        const r = target.body.rotation();
        target.group.position.set(t.x, t.y, t.z);
        target.group.quaternion.set(r.x, r.y, r.z, r.w);

        // Respawn if knocked far away
        if (target.group.position.distanceTo(target.homePosition) > 6.5) {
          this.createTargetRigidBody(target);
        }
      } else {
        target.group.position.y =
          target.homePosition.y + Math.sin(elapsed * 1.6 + target.hoverPhase) * 0.03;
      }

      // Pulse emissive subtly based on remaining HP
      const dmgRatio = 1 - target.hp / target.maxHp;
      const mat = target.crystalMeshes[0]?.material as THREE.MeshStandardMaterial;
      if (mat) {
        mat.emissiveIntensity =
          0.4 + dmgRatio * 1.1 + Math.sin(elapsed * 2.5 + target.hoverPhase) * 0.08;
      }
    }

    // Practice barrage spawner for testing Earth Shield & Void Barrier Dome
    if (this.barrageEnabled) {
      this.barrageTimer -= dt;
      if (this.barrageTimer <= 0 && this.incomingOrbs.length < 4) {
        this.spawnIncomingOrb(playerPosition);
        this.barrageTimer = 2.4;
      }
    }

    // Update incoming orbs
    for (let i = this.incomingOrbs.length - 1; i >= 0; i--) {
      const orb = this.incomingOrbs[i];
      orb.age += dt;
      orb.mesh.rotation.x += dt * 3.2;
      orb.mesh.rotation.y += dt * 2.5;

      const pos = orb.mesh.position;
      const insideVoid =
        voidDomeActive && pos.distanceTo(voidDomeCenter) <= voidDomeRadius + 0.15;

      if (insideVoid) {
        orb.frozen = true;
        if (orb.body) {
          orb.body.setLinvel({x: 0, y: 0, z: 0}, true);
        }
      } else {
        if (orb.frozen && orb.body) {
          orb.frozen = false;
          orb.body.setLinvel(
            {x: orb.velocity.x, y: orb.velocity.y, z: orb.velocity.z},
            true
          );
        }
        if (orb.body) {
          const t = orb.body.translation();
          pos.set(t.x, t.y, t.z);
        } else {
          pos.addScaledVector(orb.velocity, dt);
        }
      }

      // Check shield deflection
      if (!orb.deflected && !orb.frozen) {
        for (const shield of shieldPositions) {
          if (pos.distanceTo(shield.pos) < shield.radius + 0.12) {
            orb.deflected = true;
            orb.velocity.copy(shield.normal).multiplyScalar(4.8);
            orb.velocity.y += 1.2;
            if (orb.body) {
              orb.body.setGravityScale(0.6, true);
              orb.body.setLinvel(
                {x: orb.velocity.x, y: orb.velocity.y, z: orb.velocity.z},
                true
              );
            }
            onDeflect?.(pos.clone());
            break;
          }
        }
      }

      // Expire old or passed orbs
      if (orb.age > 6.5 || pos.distanceTo(playerPosition) < 0.25) {
        this.remove(orb.mesh);
        if (orb.body && this.world) {
          this.world.removeRigidBody(orb.body);
        }
        this.incomingOrbs.splice(i, 1);
      }
    }
  }

  dispose(): void {
    this.clearIncomingOrbs();
    if (this.world) {
      if (this.floorCollider) {
        this.world.removeCollider(this.floorCollider, true);
      }
      for (const target of this.targets) {
        if (target.body) this.world.removeRigidBody(target.body);
      }
    }
    for (const target of this.targets) {
      const mat = target.crystalMeshes[0]?.material as THREE.Material | undefined;
      mat?.dispose();
    }
    this.sharedPedestalGeo.dispose();
    this.sharedRingGeo.dispose();
    this.sharedSpireGeo.dispose();
    this.sharedSideShardGeo.dispose();
    this.sharedOrbGeo.dispose();
    this.pedestalMat.dispose();
    this.brassTrimMat.dispose();
    this.orbMat.dispose();
  }
}
