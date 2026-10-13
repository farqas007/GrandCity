// GrandCity - first-person controls (M1).
// Uses the browser Pointer Lock API directly (no Three.js addon needed) and
// keeps all per-frame maths allocation-free.

import * as THREE from 'three';
import { CONFIG } from './config.js';

export class FirstPersonControls {
  constructor(camera, domElement, world) {
    this.camera = camera;
    this.dom = domElement;
    this.world = world;
    this.config = CONFIG.player;

    this.yaw = 0;
    this.pitch = 0;
    this.velocity = new THREE.Vector3();
    this.keys = new Set();
    this.locked = false;
    this.onLockChange = null;

    // Scratch vectors (reused every frame).
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._move = new THREE.Vector3();
    this._target = new THREE.Vector3();

    this.camera.rotation.order = 'YXZ';

    this._onMouseMove = this._onMouseMove.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onLockChange = this._onLockChange.bind(this);
    this._onLockError = this._onLockError.bind(this);
    this._onBlur = this._onBlur.bind(this);

    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('pointerlockchange', this._onLockChange);
    document.addEventListener('pointerlockerror', this._onLockError);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
  }

  requestLock() {
    if (!this.dom.requestPointerLock) {
      if (this.onLockChange) this.onLockChange(false, 'Pointer Lock is not supported.');
      return;
    }
    const result = this.dom.requestPointerLock();
    // Recent Chrome returns a Promise; swallow the rejection so it does not
    // surface as an unhandled promise rejection.
    if (result && typeof result.catch === 'function') result.catch(() => {});
  }

  _onLockChange() {
    this.locked = document.pointerLockElement === this.dom;
    if (!this.locked) this.keys.clear();
    if (this.onLockChange) this.onLockChange(this.locked);
  }

  _onLockError() {
    this.locked = false;
    if (this.onLockChange) this.onLockChange(false, 'Could not capture the mouse. Click again.');
  }

  _onMouseMove(e) {
    if (!this.locked) return;
    const sens = this.config.lookSensitivity;
    this.yaw -= e.movementX * sens;
    this.pitch -= e.movementY * sens;
    const lim = this.config.pitchLimit;
    if (this.pitch > lim) this.pitch = lim;
    else if (this.pitch < -lim) this.pitch = -lim;
  }

  _onKeyDown(e) {
    this.keys.add(e.code);
    if (
      this.locked &&
      (e.code === 'Space' ||
        e.code === 'ArrowUp' ||
        e.code === 'ArrowDown' ||
        e.code === 'ArrowLeft' ||
        e.code === 'ArrowRight')
    ) {
      e.preventDefault();
    }
  }

  _onKeyUp(e) {
    this.keys.delete(e.code);
  }

  _onBlur() {
    this.keys.clear();
  }

  update(dt) {
    const k = this.keys;
    const forward =
      (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) -
      (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const strafe =
      (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) -
      (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);

    const sprint = k.has('ShiftLeft') || k.has('ShiftRight');
    const speed = sprint ? this.config.sprintSpeed : this.config.walkSpeed;

    // Movement basis derived from yaw only (walking stays level).
    this._forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this._right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    this._move.set(0, 0, 0);
    if (forward) this._move.addScaledVector(this._forward, forward);
    if (strafe) this._move.addScaledVector(this._right, strafe);
    if (this._move.lengthSq() > 0) this._move.normalize();

    this._target.copy(this._move).multiplyScalar(speed);
    const t = Math.min(1, this.config.accel * dt);
    this.velocity.lerp(this._target, t);
    if (this.velocity.lengthSq() < 1e-6) this.velocity.set(0, 0, 0);

    const pos = this.camera.position;
    pos.x += this.velocity.x * dt;
    pos.z += this.velocity.z * dt;

    if (this.world && this.world.resolveCollision) {
      this.world.resolveCollision(pos, this.config.collisionRadius);
    }
    pos.y = this.config.eyeHeight;

    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }

  dispose() {
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('pointerlockchange', this._onLockChange);
    document.removeEventListener('pointerlockerror', this._onLockError);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
  }
}
