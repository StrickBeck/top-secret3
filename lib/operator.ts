import * as THREE from "three";

// A camera operator's rig, separate from the film's animated cameras.
//   Left drag    pan and tilt on the spot (a tripod head)
//   Right drag   orbit around the point in front of the lens
//   Middle drag  truck and pedestal (slide sideways and up)
//   Wheel        dolly forward and back along the lens (the depth axis)
//   W / S        move forward and back where the lens points, A / D sideways
//   Q / E        down and up, Shift is four times faster
export class OperatorRig {
  enabled = false;
  private yaw = 0;
  private pitch = 0;
  private focus = 4; // metres to the orbit point
  private drag: { button: number; x: number; y: number } | null = null;
  private keys = new Set<string>();
  private vel = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(readonly camera: THREE.PerspectiveCamera, private el: HTMLElement) {
    el.addEventListener("pointerdown", this.onDown);
    window.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerup", this.onUp);
    el.addEventListener("wheel", this.onWheel, { passive: false });
    el.addEventListener("contextmenu", this.onContext);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
  }

  // Take over from a film camera without a jump.
  takeOver(from: THREE.PerspectiveCamera, focus: number) {
    from.updateMatrixWorld();
    this.camera.position.setFromMatrixPosition(from.matrixWorld);
    const q = new THREE.Quaternion().setFromRotationMatrix(from.matrixWorld);
    const e = new THREE.Euler().setFromQuaternion(q, "YXZ");
    this.yaw = e.y;
    this.pitch = e.x;
    this.focus = focus;
    this.camera.fov = from.fov;
    this.camera.updateProjectionMatrix();
    this.vel.set(0, 0, 0);
    this.apply();
  }

  private apply() {
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.55, 1.55);
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, "YXZ"));
    this.camera.updateMatrixWorld();
  }

  private forward() { return new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion); }
  private right() { return new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion); }
  private camUp() { return new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion); }

  private onContext = (e: Event) => { if (this.enabled) e.preventDefault(); };

  private onDown = (e: PointerEvent) => {
    if (!this.enabled) return;
    this.drag = { button: e.button, x: e.clientX, y: e.clientY };
    this.el.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };

  private onMove = (e: PointerEvent) => {
    if (!this.enabled || !this.drag) return;
    const dx = e.clientX - this.drag.x;
    const dy = e.clientY - this.drag.y;
    this.drag.x = e.clientX;
    this.drag.y = e.clientY;
    const h = this.el.clientHeight || 600;
    const fovRad = THREE.MathUtils.degToRad(this.camera.fov);
    const perPx = fovRad / h; // the image follows the cursor at any lens
    if (this.drag.button === 0 && !e.altKey) {
      this.yaw += dx * perPx;
      this.pitch += dy * perPx;
      this.apply();
    } else if (this.drag.button === 2 || (this.drag.button === 0 && e.altKey)) {
      const pivot = this.camera.position.clone().addScaledVector(this.forward(), this.focus);
      this.yaw -= dx * 0.005;
      this.pitch -= dy * 0.005;
      this.apply();
      this.camera.position.copy(pivot).addScaledVector(this.forward(), -this.focus);
      this.camera.updateMatrixWorld();
    } else if (this.drag.button === 1) {
      const k = (2 * Math.tan(fovRad / 2) * this.focus) / h;
      this.camera.position.addScaledVector(this.right(), -dx * k).addScaledVector(this.camUp(), dy * k);
      this.camera.updateMatrixWorld();
    }
  };

  private onUp = () => { this.drag = null; };

  private onWheel = (e: WheelEvent) => {
    if (!this.enabled) return;
    e.preventDefault();
    const step = (e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY) * -0.004 * Math.max(0.6, this.focus * 0.35);
    this.camera.position.addScaledVector(this.forward(), step);
    this.camera.updateMatrixWorld();
  };

  private onKeyDown = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    this.keys.add(e.code);
  };
  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.code); };
  private onBlur = () => { this.keys.clear(); this.drag = null; };

  update(dt: number) {
    if (!this.enabled) return;
    const k = this.keys;
    const want = new THREE.Vector3();
    if (k.has("KeyW")) want.add(this.forward());
    if (k.has("KeyS")) want.sub(this.forward());
    if (k.has("KeyD")) want.add(this.right());
    if (k.has("KeyA")) want.sub(this.right());
    if (k.has("KeyE")) want.add(this.up);
    if (k.has("KeyQ")) want.sub(this.up);
    const speed = k.has("ShiftLeft") || k.has("ShiftRight") ? 12 : 3;
    if (want.lengthSq() > 0) want.normalize().multiplyScalar(speed);
    // Ease in and out like a dolly on rails.
    this.vel.lerp(want, 1 - Math.exp(-dt * 8));
    if (this.vel.lengthSq() > 1e-6) {
      this.camera.position.addScaledVector(this.vel, dt);
      this.camera.updateMatrixWorld();
    }
  }

  dispose() {
    this.el.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerup", this.onUp);
    this.el.removeEventListener("wheel", this.onWheel);
    this.el.removeEventListener("contextmenu", this.onContext);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
  }
}
