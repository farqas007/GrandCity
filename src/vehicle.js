// GrandCity - vehicle system (M2).
// One procedurally built car plus the controller that drives it: arcade-style
// longitudinal physics, speed-dependent steering, a chase camera and lightweight
// two-circle collision against the city's building footprints. No external
// assets; every mesh is generated from primitives.

import * as THREE from 'three';
import { CONFIG, PALETTE } from './config.js';

const WHEEL_RADIUS = 0.34;
const WHEEL_WIDTH = 0.26;
const BODY_WIDTH = 1.9;
const BODY_LENGTH = 4.3;

// Build the car mesh. A handful of shared materials and one reused wheel
// geometry keep the whole model cheap (well under 1k triangles).
export function createVehicle(scene) {
  const group = new THREE.Group();
  group.name = 'vehicle';

  const matBody = new THREE.MeshLambertMaterial({ color: PALETTE.carBody });
  const matBodyDark = new THREE.MeshLambertMaterial({ color: PALETTE.carBodyDark });
  const matGlass = new THREE.MeshLambertMaterial({ color: PALETTE.carGlass });
  const matTrim = new THREE.MeshLambertMaterial({ color: PALETTE.carTrim });
  const matTire = new THREE.MeshLambertMaterial({ color: PALETTE.carTire });
  const matHub = new THREE.MeshLambertMaterial({ color: PALETTE.carHub });
  const matHead = new THREE.MeshBasicMaterial({ color: PALETTE.carHeadlight });
  const matTail = new THREE.MeshBasicMaterial({ color: PALETTE.carTaillight });

  // Lower chassis.
  const chassis = new THREE.Mesh(
    new THREE.BoxGeometry(BODY_WIDTH, 0.55, BODY_LENGTH),
    matBody
  );
  chassis.position.y = 0.62;
  group.add(chassis);

  // Slightly inset, darker skirt for a two-tone look.
  const skirt = new THREE.Mesh(
    new THREE.BoxGeometry(BODY_WIDTH + 0.06, 0.22, BODY_LENGTH - 0.5),
    matBodyDark
  );
  skirt.position.y = 0.4;
  group.add(skirt);

  // Cabin / greenhouse.
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(BODY_WIDTH - 0.24, 0.6, 2.0),
    matBody
  );
  cabin.position.set(0, 1.12, -0.15);
  group.add(cabin);

  // Glass band (front / rear / sides approximated with one darker box).
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(BODY_WIDTH - 0.16, 0.42, 1.86),
    matGlass
  );
  glass.position.set(0, 1.16, -0.15);
  group.add(glass);

  // Bonnet + boot lids add a little silhouette.
  const bonnet = new THREE.Mesh(new THREE.BoxGeometry(BODY_WIDTH - 0.3, 0.14, 1.1), matBody);
  bonnet.position.set(0, 0.92, -BODY_LENGTH / 2 + 0.75);
  group.add(bonnet);
  const boot = new THREE.Mesh(new THREE.BoxGeometry(BODY_WIDTH - 0.3, 0.14, 0.9), matBody);
  boot.position.set(0, 0.92, BODY_LENGTH / 2 - 0.65);
  group.add(boot);

  // Bumpers.
  const bumperGeo = new THREE.BoxGeometry(BODY_WIDTH + 0.02, 0.24, 0.3);
  const front = new THREE.Mesh(bumperGeo, matTrim);
  front.position.set(0, 0.5, -BODY_LENGTH / 2 - 0.02);
  group.add(front);
  const rear = new THREE.Mesh(bumperGeo, matTrim);
  rear.position.set(0, 0.5, BODY_LENGTH / 2 + 0.02);
  group.add(rear);

  // Lights. The car faces -Z at heading 0, so the headlights sit at -Z.
  const headGeo = new THREE.BoxGeometry(0.36, 0.18, 0.1);
  const headL = new THREE.Mesh(headGeo, matHead);
  headL.position.set(-0.6, 0.68, -BODY_LENGTH / 2 - 0.02);
  group.add(headL);
  const headR = new THREE.Mesh(headGeo, matHead);
  headR.position.set(0.6, 0.68, -BODY_LENGTH / 2 - 0.02);
  group.add(headR);
  const tailGeo = new THREE.BoxGeometry(0.34, 0.16, 0.1);
  const tailL = new THREE.Mesh(tailGeo, matTail);
  tailL.position.set(-0.62, 0.68, BODY_LENGTH / 2 + 0.02);
  group.add(tailL);
  const tailR = new THREE.Mesh(tailGeo, matTail);
  tailR.position.set(0.62, 0.68, BODY_LENGTH / 2 + 0.02);
  group.add(tailR);

  // Wheels. The cylinder axis is baked along X so steering (Y) and rolling (X)
  // can be applied to a single pivot with 'YXZ' rotation order.
  const wheelGeo = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_WIDTH, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(
    WHEEL_RADIUS * 0.5,
    WHEEL_RADIUS * 0.5,
    WHEEL_WIDTH + 0.02,
    10
  );
  hubGeo.rotateZ(Math.PI / 2);

  const wheels = [];
  const axleZ = [-1.25, 1.25]; // front (-Z), rear (+Z)
  const axleX = [-0.92, 0.92];
  for (let zi = 0; zi < 2; zi++) {
    for (let xi = 0; xi < 2; xi++) {
      const pivot = new THREE.Object3D();
      pivot.rotation.order = 'YXZ';
      pivot.position.set(axleX[xi], WHEEL_RADIUS, axleZ[zi]);
      pivot.add(new THREE.Mesh(wheelGeo, matTire));
      pivot.add(new THREE.Mesh(hubGeo, matHub));
      group.add(pivot);
      wheels.push({ pivot, steer: zi === 0 });
    }
  }

  if (CONFIG.graphics.shadows) {
    group.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
  }

  scene.add(group);
  return { group, wheels };
}

export class CarController {
  constructor(vehicle, world) {
    this.opt = CONFIG.vehicle;
    this.vehicle = vehicle.group;
    this.wheels = vehicle.wheels;
    this.world = world;

    this.position = new THREE.Vector3();
    this.heading = 0;
    this.speed = 0; // signed, metres / second along the heading
    this.steer = 0; // smoothed steering input in [-1, 1]
    this.wheelSpin = 0;
    this.driving = false;
    this.lookYaw = 0; // chase-camera orbit offset (radians)

    this._forwardX = 0;
    this._forwardZ = -1;
    this._desired = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._front = { x: 0, z: 0 };
    this._rear = { x: 0, z: 0 };

    this._onMouseMove = this._onMouseMove.bind(this);
    document.addEventListener('mousemove', this._onMouseMove);

    const spawn = this.opt.spawn;
    this.place(spawn.x, spawn.z, spawn.heading);
  }

  place(x, z, heading) {
    const y = this.world.groundHeightAt
      ? this.world.groundHeightAt(x, z)
      : -CONFIG.city.curbHeight;
    this.position.set(x, y, z);
    this.heading = heading || 0;
    this.speed = 0;
    this.steer = 0;
    this._sync();
  }

  _sync() {
    this.vehicle.position.copy(this.position);
    this.vehicle.rotation.y = this.heading;
  }

  distanceTo(x, z) {
    const dx = this.position.x - x;
    const dz = this.position.z - z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  getSpeedKmh() {
    return Math.abs(this.speed) * 3.6;
  }

  setSpeed(speed) {
    this.speed = speed || 0;
  }

  _onMouseMove(e) {
    if (!this.driving || !document.pointerLockElement) return;
    const o = this.opt.orbit;
    this.lookYaw -= e.movementX * o.sensitivity;
    if (this.lookYaw > o.maxYaw) this.lookYaw = o.maxYaw;
    else if (this.lookYaw < -o.maxYaw) this.lookYaw = -o.maxYaw;
  }

  update(dt, input, camera) {
    const o = this.opt;

    // Smooth the steering input so the car does not snap between directions.
    this.steer += (input.steer - this.steer) * Math.min(1, o.steerRate * dt);

    // Longitudinal: accelerate, brake / reverse, or coast to a stop.
    if (input.throttle > 0) {
      this.speed += o.accel * dt;
    } else if (input.throttle < 0) {
      if (this.speed > 0.4) this.speed -= o.brake * dt;
      else this.speed -= o.accel * 0.7 * dt;
    } else {
      const dec = o.rollFriction * dt;
      if (this.speed > dec) this.speed -= dec;
      else if (this.speed < -dec) this.speed += dec;
      else this.speed = 0;
    }
    if (this.speed > o.maxSpeed) this.speed = o.maxSpeed;
    else if (this.speed < -o.maxReverse) this.speed = -o.maxReverse;

    // Steering is only effective while moving and eases off slightly at the
    // top of the speed range; reversing inverts the turn direction.
    const sp = Math.abs(this.speed);
    const grip = Math.min(1, sp / o.turnSpeedRef);
    const damp = 1 - 0.35 * Math.min(1, sp / o.maxSpeed);
    const dir = this.speed >= 0 ? 1 : -1;
    this.heading += this.steer * o.turnRate * grip * damp * dir * dt;

    const fx = -Math.sin(this.heading);
    const fz = -Math.cos(this.heading);
    this._forwardX = fx;
    this._forwardZ = fz;

    this.position.x += fx * this.speed * dt;
    this.position.z += fz * this.speed * dt;

    this._resolveCollision(fx, fz);

    // Follow the road / sidewalk height (smoothed so kerbs are not jarring).
    const gy = this.world.groundHeightAt
      ? this.world.groundHeightAt(this.position.x, this.position.z)
      : -CONFIG.city.curbHeight;
    this.position.y += (gy - this.position.y) * Math.min(1, o.groundLerp * dt);

    this._sync();

    // Wheels: roll with speed, front pair follows the steering angle.
    this.wheelSpin += (this.speed * dt) / WHEEL_RADIUS;
    const steerAngle = this.steer * o.maxSteerAngle;
    for (let i = 0; i < this.wheels.length; i++) {
      const w = this.wheels[i];
      if (w.steer) w.pivot.rotation.y = steerAngle;
      w.pivot.rotation.x = -this.wheelSpin;
    }

    if (camera) this.followCamera(camera, dt);
  }

  // Approximate the car with two circles (front and rear) and push both out of
  // any building footprint, then translate the whole car by the correction.
  // Cheap, stable, and reuses the same collision data as the walking player.
  _resolveCollision(fx, fz) {
    const r = this.opt.collisionRadius;
    const off = this.opt.sampleOffset;
    const bx = this.position.x;
    const bz = this.position.z;

    const front = this._front;
    const rear = this._rear;
    front.x = bx + fx * off;
    front.z = bz + fz * off;
    rear.x = bx - fx * off;
    rear.z = bz - fz * off;

    const hitFront = this.world.resolveCollision(front, r);
    const hitRear = this.world.resolveCollision(rear, r);

    const nx = (front.x + rear.x) * 0.5;
    const nz = (front.z + rear.z) * 0.5;
    this.position.x = nx;
    this.position.z = nz;

    if (hitFront || hitRear) {
      const dx = nx - bx;
      const dz = nz - bz;
      if (dx * dx + dz * dz > 1e-4) this.speed *= 0.5; // bleed speed on impact
    }
  }

  followCamera(camera, dt) {
    const o = this.opt.camera;

    // Ease the look-around offset back to centre when the mouse is idle.
    this.lookYaw *= 1 - Math.min(1, this.opt.orbit.recenter * dt);

    const az = this.heading + this.lookYaw;
    const fx = -Math.sin(az);
    const fz = -Math.cos(az);

    this._desired.set(
      this.position.x - fx * o.back,
      this.position.y + o.up,
      this.position.z - fz * o.back
    );
    camera.position.lerp(this._desired, 1 - Math.exp(-o.posLerp * dt));

    this._look.set(
      this.position.x + this._forwardX * o.lookAhead,
      this.position.y + o.lookUp,
      this.position.z + this._forwardZ * o.lookAhead
    );
    camera.lookAt(this._look);
  }

  // A safe spot beside the car to drop the player on exit (pushed out of any
  // building footprint it happens to overlap).
  getExitPosition() {
    const fx = -Math.sin(this.heading);
    const fz = -Math.cos(this.heading);
    const rx = -fz; // right-hand vector
    const rz = fx;
    const dist = 2.8;
    const out = { x: this.position.x + rx * dist, z: this.position.z + rz * dist };
    if (this.world.resolveCollision) {
      this.world.resolveCollision(out, CONFIG.player.collisionRadius);
    }
    return out;
  }

  dispose() {
    document.removeEventListener('mousemove', this._onMouseMove);
  }
}
