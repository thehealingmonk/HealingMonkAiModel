import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

/**
 * Interactive 3D girl hero.
 *
 * Loads a rigged female VRM avatar (`public/girl.vrm`) with three.js, lets the
 * user DRAG to orbit her 360° (auto-spins when idle), and pins the 33 MediaPipe
 * pose landmarks onto her actual skeleton bones — so the dots stay accurately on
 * the body from every angle and a glowing scan-skeleton connects them.
 */

// MediaPipe landmark -> VRM humanoid bone, with a small local offset (metres).
// The dot is added as a child of that bone, so it follows the body exactly.
type Map33 = { bone: string; off?: [number, number, number] };
const LANDMARKS: Map33[] = [
  { bone: 'head', off: [0, 0.06, 0.12] },     // 0 nose
  { bone: 'leftEye', off: [0, 0, 0.02] },      // 1 left eye inner
  { bone: 'leftEye', off: [0.02, 0, 0.02] },   // 2 left eye
  { bone: 'leftEye', off: [0.035, 0, 0.01] },  // 3 left eye outer
  { bone: 'rightEye', off: [0, 0, 0.02] },     // 4 right eye inner
  { bone: 'rightEye', off: [-0.02, 0, 0.02] }, // 5 right eye
  { bone: 'rightEye', off: [-0.035, 0, 0.01] },// 6 right eye outer
  { bone: 'head', off: [0.08, 0.04, 0] },      // 7 left ear
  { bone: 'head', off: [-0.08, 0.04, 0] },     // 8 right ear
  { bone: 'head', off: [0.03, -0.02, 0.11] },  // 9 mouth left
  { bone: 'head', off: [-0.03, -0.02, 0.11] }, // 10 mouth right
  { bone: 'leftUpperArm' },                     // 11 left shoulder
  { bone: 'rightUpperArm' },                    // 12 right shoulder
  { bone: 'leftLowerArm' },                     // 13 left elbow
  { bone: 'rightLowerArm' },                    // 14 right elbow
  { bone: 'leftHand' },                         // 15 left wrist
  { bone: 'rightHand' },                        // 16 right wrist
  { bone: 'leftLittleProximal', off: [0, 0, 0] },  // 17 left pinky
  { bone: 'rightLittleProximal', off: [0, 0, 0] }, // 18 right pinky
  { bone: 'leftIndexProximal', off: [0, 0, 0] },   // 19 left index
  { bone: 'rightIndexProximal', off: [0, 0, 0] },  // 20 right index
  { bone: 'leftThumbProximal', off: [0, 0, 0] },   // 21 left thumb
  { bone: 'rightThumbProximal', off: [0, 0, 0] },  // 22 right thumb
  { bone: 'leftUpperLeg' },                     // 23 left hip
  { bone: 'rightUpperLeg' },                    // 24 right hip
  { bone: 'leftLowerLeg' },                     // 25 left knee
  { bone: 'rightLowerLeg' },                    // 26 right knee
  { bone: 'leftFoot' },                         // 27 left ankle
  { bone: 'rightFoot' },                        // 28 right ankle
  { bone: 'leftFoot', off: [0, 0.02, -0.06] },  // 29 left heel
  { bone: 'rightFoot', off: [0, 0.02, -0.06] }, // 30 right heel
  { bone: 'leftToes' },                         // 31 left foot index
  { bone: 'rightToes' },                        // 32 right foot index
];

// Skeleton connections between landmark indices (the glowing overlay).
const CONNECTIONS: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 31], [27, 29],
  [24, 26], [26, 28], [28, 32], [28, 30],
];

const KEY = new Set([0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]);

export default function BodyVRMHero({ className }: { className?: string }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.style.cursor = 'grab';

    // Lighting — soft, flattering, matches the light theme.
    scene.add(new THREE.HemisphereLight(0xffffff, 0xdbeafe, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(1, 2, 2);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x6ee7b7, 0.6);
    rim.position.set(-2, 1, -2);
    scene.add(rim);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.autoRotate = false; // no auto-spin — user rotates by dragging
    controls.minPolarAngle = Math.PI * 0.28;
    controls.maxPolarAngle = Math.PI * 0.6;

    const dotMeshes: THREE.Mesh[] = new Array(33);

    // Skeleton line overlay — positions updated every frame from dot world pos.
    const lineGeom = new THREE.BufferGeometry();
    const linePos = new Float32Array(CONNECTIONS.length * 2 * 3);
    lineGeom.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.9,
      depthTest: false,  // always draw the skeleton ON TOP of the body/dress
      depthWrite: false,
    });
    const skeleton = new THREE.LineSegments(lineGeom, lineMat);
    skeleton.frustumCulled = false;
    skeleton.renderOrder = 2;
    scene.add(skeleton);

    let vrm: any = null;
    // Arm bones we drop as the view turns to the side (filled after load).
    // `rot` is the fully-turned target euler [x, y, z] (radians), scaled by t.
    let poseBones: { node: THREE.Object3D; rot: [number, number, number] }[] = [];
    // Plumb line kept locked to the body centre (hips) every frame.
    let hips: THREE.Object3D | null = null;
    let plumbPos: Float32Array | null = null;
    let plumbGeomRef: THREE.BufferGeometry | null = null;
    let plumbLineRef: THREE.Line | null = null;
    let raf = 0;
    const clock = new THREE.Clock();
    const tmp = new THREE.Vector3();

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    loader.load(
      '/girl.vrm',
      (gltf) => {
        vrm = gltf.userData.vrm;
        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.combineSkeletons?.(gltf.scene);
        // VRM0 avatars face -Z; rotate so she faces the camera (+Z).
        VRMUtils.rotateVRM0(vrm);
        scene.add(vrm.scene);

        // Attach a glowing dot sphere to each mapped bone.
        const dotGeoKey = new THREE.SphereGeometry(0.022, 16, 16);
        const dotGeo = new THREE.SphereGeometry(0.014, 12, 12);
        LANDMARKS.forEach((m, i) => {
          const isKey = KEY.has(i);
          const bone =
            vrm.humanoid?.getRawBoneNode?.(m.bone) ??
            vrm.humanoid?.getNormalizedBoneNode?.(m.bone) ??
            null;
          if (!bone) return;
          const mat = new THREE.MeshBasicMaterial({
            color: isKey ? 0x34d399 : 0x7dd3fc,
            transparent: true,
            opacity: 0.95,
            depthTest: false,  // dot always visible on top — never hidden behind the dress
            depthWrite: false,
          });
          const dot = new THREE.Mesh(isKey ? dotGeoKey : dotGeo, mat);
          if (m.off) dot.position.set(m.off[0], m.off[1], m.off[2]);
          dot.renderOrder = 3;
          bone.add(dot);
          dotMeshes[i] = dot;
        });

        // Capture the arm bones so we can lower them DYNAMICALLY by view angle:
        // facing front/back → arms stay out (rest pose); rotated to the left/right
        // side → arms drop down along the body. Driven every frame in animate().
        poseBones = [
          // Keep the arms STRAIGHT (no elbow bend) and raise them UP as the view
          // turns to the side. Front → rest pose; side/back → arms lifted up.
          { node: vrm.humanoid?.getNormalizedBoneNode?.('leftUpperArm'), rot: [0, 0, 0.9] },
          { node: vrm.humanoid?.getNormalizedBoneNode?.('rightUpperArm'), rot: [0, 0, -0.9] },
        ].filter((p) => p.node) as { node: THREE.Object3D; rot: [number, number, number] }[];

        // Frame the camera so the WHOLE body fits (head + feet) with a margin.
        const box = new THREE.Box3().setFromObject(vrm.scene);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        controls.target.set(center.x, center.y, center.z);
        // Distance needed to fit the full height inside the vertical FOV.
        const vFov = (camera.fov * Math.PI) / 180;
        const margin = 1.18; // a little breathing room top & bottom
        const dist = (size.y * 0.5 * margin) / Math.tan(vFov / 2);
        camera.position.set(center.x, center.y, center.z + dist);
        camera.near = dist / 50;
        camera.far = dist * 50;
        camera.updateProjectionMatrix();
        controls.update();

        // Plumb line — a vertical gravity/posture reference through the body centre,
        // exactly like the alignment line the AI draws during a real pose scan. Its
        // x/z are re-centred on the hips every frame (see animate) so it stays dead
        // centre through the body from EVERY angle, including the left/right sides.
        hips =
          vrm.humanoid?.getNormalizedBoneNode?.('hips') ??
          vrm.humanoid?.getRawBoneNode?.('hips') ??
          null;
        plumbPos = new Float32Array([
          center.x, box.max.y + 0.08, center.z,
          center.x, box.min.y - 0.02, center.z,
        ]);
        const plumbGeom = new THREE.BufferGeometry();
        plumbGeom.setAttribute('position', new THREE.BufferAttribute(plumbPos, 3));
        const plumbMat = new THREE.LineDashedMaterial({
          color: 0xf59e0b,
          transparent: true,
          opacity: 0.7,
          dashSize: 0.05,
          gapSize: 0.03,
          depthTest: false,
          depthWrite: false,
        });
        const plumb = new THREE.Line(plumbGeom, plumbMat);
        plumb.computeLineDistances();
        plumb.renderOrder = 1;
        plumb.frustumCulled = false;
        scene.add(plumb);
        plumbGeomRef = plumbGeom;
        plumbLineRef = plumb;

        setStatus('ready');
      },
      undefined,
      (err) => {
        console.error('VRM load failed', err);
        setStatus('error');
      },
    );

    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const dt = clock.getDelta();
      controls.update();
      // Drop the arms as soon as the view turns away from the front, and keep them
      // down through the side AND back views (only the front shows the arms out).
      // 1 - cos(azimuth) is 0 at front (0) and rises to 1 at the sides and stays
      // capped at 1 through the back — so arms never pop back up while rotating.
      const t = Math.min(1, 1 - Math.cos(controls.getAzimuthalAngle()));
      for (let i = 0; i < poseBones.length; i++) {
        const r = poseBones[i].rot;
        poseBones[i].node.rotation.set(r[0] * t, r[1] * t, r[2] * t);
      }
      if (vrm) vrm.update(dt);

      // Keep the plumb line locked to the body centre (hips x/z) so it stays dead
      // centre through the body from every angle, while remaining world-vertical.
      if (hips && plumbPos && plumbGeomRef) {
        hips.getWorldPosition(tmp);
        plumbPos[0] = tmp.x; plumbPos[2] = tmp.z;
        plumbPos[3] = tmp.x; plumbPos[5] = tmp.z;
        (plumbGeomRef.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        plumbLineRef?.computeLineDistances();
      }

      // Update the skeleton overlay from current dot world positions.
      let ok = true;
      for (let c = 0; c < CONNECTIONS.length; c++) {
        const a = dotMeshes[CONNECTIONS[c][0]];
        const b = dotMeshes[CONNECTIONS[c][1]];
        if (!a || !b) { ok = false; continue; }
        a.getWorldPosition(tmp);
        linePos.set([tmp.x, tmp.y, tmp.z], c * 6);
        b.getWorldPosition(tmp);
        linePos.set([tmp.x, tmp.y, tmp.z], c * 6 + 3);
      }
      if (ok) (lineGeom.attributes.position as THREE.BufferAttribute).needsUpdate = true;

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      if (vrm) VRMUtils.deepDispose(vrm.scene);
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className={`relative mx-auto w-full max-w-md ${className ?? ''}`}>
      <div className="scan-halo pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] bg-[radial-gradient(circle_at_50%_40%,rgba(45,212,191,0.28),transparent_65%)] blur-2xl" />

      <div className="glass-light relative overflow-hidden rounded-3xl p-4 shadow-2xl shadow-sky-900/10">
        <div className="mb-3 flex items-center justify-between text-[11px]">
          <span className="inline-flex items-center gap-1.5 font-medium text-emerald-600">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Live 3D pose scan
          </span>
          <span className="font-mono text-sky-500/80">33 / 33 landmarks</span>
        </div>

        <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-gradient-to-br from-slate-50 via-white to-sky-100 ring-1 ring-slate-900/5">
          <div ref={mountRef} className="absolute inset-0 h-full w-full" />

          {status === 'loading' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-9 w-9 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-500" />
            </div>
          )}
          {status === 'error' && (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
              <p className="text-xs font-medium text-slate-400">Could not load 3D model (<span className="font-mono">public/girl.vrm</span>)</p>
            </div>
          )}

          <Brackets />

          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <span className="rounded-full border border-slate-900/10 bg-white/80 px-3 py-1 text-[10px] font-medium text-slate-500 backdrop-blur">
              Drag to rotate · 360° view
            </span>
          </div>

          <div className="pointer-events-none absolute left-3 top-3 rounded-xl border border-white/60 bg-white/80 px-3 py-2 backdrop-blur">
            <p className="text-[9px] uppercase tracking-widest text-slate-500">Overall</p>
            <p className="glow-text text-2xl font-bold leading-none">84</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2.5">
          <Metric label="Posture" value={86} delay />
          <Metric label="Mobility" value={74} />
          <Metric label="Stability" value={91} delay />
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, delay }: { label: string; value: number; delay?: boolean }) {
  return (
    <div className={`rounded-xl border border-slate-900/5 bg-white/70 p-3 shadow-sm ${delay ? 'scan-float-delayed' : 'scan-float'}`}>
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className="hm-num mt-0.5 text-lg font-semibold text-slate-900">{value}</p>
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-sky-400" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function Brackets() {
  const c = 'absolute h-5 w-5 border-emerald-300/70';
  return (
    <>
      <span className={`${c} left-2 top-2 rounded-tl-md border-l-2 border-t-2`} />
      <span className={`${c} right-2 top-2 rounded-tr-md border-r-2 border-t-2`} />
      <span className={`${c} bottom-2 left-2 rounded-bl-md border-b-2 border-l-2`} />
      <span className={`${c} bottom-2 right-2 rounded-br-md border-b-2 border-r-2`} />
    </>
  );
}
