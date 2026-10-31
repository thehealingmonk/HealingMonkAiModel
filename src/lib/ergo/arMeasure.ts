/**
 * ErgoAI AR measure — real-world height × width with the phone's AR tracking.
 *
 * A plain camera can't know distance, so sizes from it are guesses. AR
 * (WebXR + ARCore on Android Chrome) tracks the phone in 3D and finds real
 * surfaces, so two points placed on the world are a true distance apart —
 * typically within ±1–2 cm at arm's length. This file holds the support check
 * and the small bits of 3D maths; ErgoArMeasure.tsx is the UI.
 */

export type Vec3 = { x: number; y: number; z: number };

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;

let supportPromise: Promise<boolean> | null = null;

/** Does this browser/device support AR sessions (Android Chrome + ARCore)? */
export function isArSupported(): Promise<boolean> {
  if (!supportPromise) {
    const xr = typeof navigator !== 'undefined' ? navigator.xr : undefined;
    supportPromise = xr
      ? xr.isSessionSupported('immersive-ar').catch(() => false)
      : Promise.resolve(false);
  }
  return supportPromise;
}

/** Position + forward direction of a pose from its column-major matrix. */
export function rayFromMatrix(m: Float32Array): { origin: Vec3; dir: Vec3 } {
  const origin = { x: m[12], y: m[13], z: m[14] };
  const f = { x: -m[8], y: -m[9], z: -m[10] };
  const len = Math.hypot(f.x, f.y, f.z) || 1;
  return { origin, dir: { x: f.x / len, y: f.y / len, z: f.z / len } };
}

/**
 * Height mode: the point on the vertical line through `base` that is closest
 * to the camera's centre ray. Lets the user "raise" the line to the top of a
 * bottle or chair back without needing a surface there. Returns the height in
 * metres (signed) or null when the ray is parallel to the line.
 */
export function verticalPointOnRay(base: Vec3, origin: Vec3, dir: Vec3): { point: Vec3; heightM: number } | null {
  const up = { x: 0, y: 1, z: 0 };
  const w0 = sub(base, origin);
  const b = dot(up, dir);
  const c = dot(dir, dir);
  const d = dot(up, w0);
  const e = dot(dir, w0);
  const denom = c - b * b;
  if (denom < 1e-6) return null;
  const s = (b * e - c * d) / denom;
  return { point: { x: base.x, y: base.y + s, z: base.z }, heightM: s };
}

/**
 * Width mode: where the centre ray meets the horizontal plane through `base`
 * (the table top / floor the object stands on). Null if looking away from it.
 */
export function rayOnHorizontalPlane(base: Vec3, origin: Vec3, dir: Vec3): Vec3 | null {
  if (Math.abs(dir.y) < 1e-3) return null;
  const t = (base.y - origin.y) / dir.y;
  if (t <= 0 || t > 20) return null;
  return { x: origin.x + dir.x * t, y: base.y, z: origin.z + dir.z * t };
}

/** Straight-line distance in metres. */
export function distM(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Horizontal (floor-plane) distance in metres. */
export function horizontalDistM(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/**
 * World point → CSS pixel on screen, via the view's projection and inverse
 * transform (both column-major). Null when behind the camera.
 */
export function projectToScreen(
  p: Vec3,
  proj: Float32Array,
  viewInv: Float32Array,
  w: number,
  h: number
): { x: number; y: number } | null {
  const v = [p.x, p.y, p.z, 1];
  const mul = (m: Float32Array, a: number[]) => [0, 1, 2, 3].map(
    (r) => m[r] * a[0] + m[4 + r] * a[1] + m[8 + r] * a[2] + m[12 + r] * a[3]
  );
  const clip = mul(proj, mul(viewInv, v));
  if (clip[3] <= 0) return null;
  return { x: ((clip[0] / clip[3] + 1) / 2) * w, y: ((1 - clip[1] / clip[3]) / 2) * h };
}

/** Typical ARCore error: ~1 cm plus ~1 % of the length. */
export const arErrCm = (cm: number) => Math.round((1 + cm * 0.01) * 10) / 10;
