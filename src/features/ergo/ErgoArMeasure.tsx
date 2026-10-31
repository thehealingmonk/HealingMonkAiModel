import { useEffect, useRef, useState } from 'react';
import { X, Ruler, Undo2, Check, Plus, MoveVertical, MoveHorizontal } from 'lucide-react';
import type { MeasuredItem } from '@/lib/ergo/ergoTypes';
import {
  Vec3, rayFromMatrix, verticalPointOnRay, rayOnHorizontalPlane, horizontalDistM,
  projectToScreen, arErrCm,
} from '@/lib/ergo/arMeasure';

interface Props {
  /** Called with everything measured (may be empty) when the user leaves. */
  onClose: (items: MeasuredItem[]) => void;
}

type Axis = 'height' | 'width';

const LABELS = ['Chair', 'Desk', 'Monitor', 'Bottle', 'Laptop', 'Table', 'Person', 'Other'];

/**
 * Full-screen AR tape measure (Android Chrome + ARCore).
 *  Height: tap the base on the floor/table, then point at the top — the line
 *          stays perfectly vertical, so the top doesn't need a surface.
 *  Width:  tap one bottom edge, then the other — measured along the surface.
 */
export default function ErgoArMeasure({ onClose }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<XRSession | null>(null);

  // Live AR state — refs, read every frame without re-rendering.
  const reticle = useRef<Vec3 | null>(null);
  const live = useRef<Vec3 | null>(null);
  const liveCm = useRef<number | null>(null);
  const base = useRef<Vec3 | null>(null);
  const axisRef = useRef<Axis>('height');

  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [axis, setAxis] = useState<Axis>('height');
  const [hasSurface, setHasSurface] = useState(false);
  const [placing, setPlacing] = useState(false); // base placed, waiting for end
  const [readout, setReadout] = useState<number | null>(null);
  const [heightCm, setHeightCm] = useState<number | null>(null);
  const [widthCm, setWidthCm] = useState<number | null>(null);
  const [label, setLabel] = useState('Chair');
  const [customLabel, setCustomLabel] = useState('');
  const [saved, setSaved] = useState<MeasuredItem[]>([]);
  const savedRef = useRef(saved);
  savedRef.current = saved;
  axisRef.current = axis;

  useEffect(() => () => { sessionRef.current?.end().catch(() => {}); }, []);

  const start = async () => {
    setError('');
    const xr = navigator.xr;
    if (!xr || !overlayRef.current) {
      setError('AR is not available on this device.');
      return;
    }
    try {
      const session = await xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test', 'local'],
        optionalFeatures: ['dom-overlay'],
        domOverlay: { root: overlayRef.current },
      });
      sessionRef.current = session;

      const glCanvas = document.createElement('canvas');
      const gl = glCanvas.getContext('webgl', { xrCompatible: true, alpha: true }) as WebGLRenderingContext | null;
      if (!gl) throw new Error('WebGL unavailable');
      await session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl) });

      const refSpace = await session.requestReferenceSpace('local');
      const viewerSpace = await session.requestReferenceSpace('viewer');
      const hitSource = await session.requestHitTestSource?.({ space: viewerSpace });
      if (!hitSource) throw new Error('Hit test unavailable');

      session.addEventListener('end', () => {
        hitSource.cancel();
        sessionRef.current = null;
        setRunning(false);
        base.current = null;
        setPlacing(false);
      });

      let lastUi = 0;
      const onFrame: XRFrameRequestCallback = (time, frame) => {
        session.requestAnimationFrame(onFrame);
        const layer = session.renderState.baseLayer!;
        gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        const pose = frame.getViewerPose(refSpace);
        if (!pose) return;
        const hits = frame.getHitTestResults(hitSource);
        const hp = hits[0]?.getPose(refSpace)?.transform.position;
        reticle.current = hp ? { x: hp.x, y: hp.y, z: hp.z } : null;

        // Where the second point currently is, from the screen-centre ray.
        const { origin, dir } = rayFromMatrix(pose.transform.matrix);
        live.current = null;
        liveCm.current = null;
        if (base.current) {
          if (axisRef.current === 'height') {
            const v = verticalPointOnRay(base.current, origin, dir);
            if (v) {
              live.current = v.point;
              liveCm.current = Math.abs(v.heightM) * 100;
            }
          } else {
            const p = rayOnHorizontalPlane(base.current, origin, dir) ?? reticle.current;
            if (p) {
              live.current = p;
              liveCm.current = horizontalDistM(base.current, p) * 100;
            }
          }
        }

        draw(pose.views[0]);
        if (time - lastUi > 100) {
          lastUi = time;
          setHasSurface(!!reticle.current);
          setReadout(liveCm.current != null ? Math.round(liveCm.current * 10) / 10 : null);
        }
      };
      session.requestAnimationFrame(onFrame);
      setRunning(true);
    } catch (err) {
      console.error('AR session failed', err);
      sessionRef.current?.end().catch(() => {});
      setError('Could not start AR. Use Chrome on an ARCore-supported Android phone and allow camera access.');
    }
  };

  const draw = (view: XRView) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
    if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const proj = view.projectionMatrix;
    const inv = view.transform.inverse.matrix;
    const toScreen = (p: Vec3) => projectToScreen(p, proj, inv, w, h);

    // Centre crosshair.
    const onSurface = !!reticle.current || !!base.current;
    ctx.strokeStyle = onSurface ? '#34d399' : 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 14, 0, Math.PI * 2);
    ctx.moveTo(w / 2 - 6, h / 2);
    ctx.lineTo(w / 2 + 6, h / 2);
    ctx.moveTo(w / 2, h / 2 - 6);
    ctx.lineTo(w / 2, h / 2 + 6);
    ctx.stroke();

    // Reticle dot on the surface.
    if (reticle.current && !base.current) {
      const s = toScreen(reticle.current);
      if (s) {
        ctx.fillStyle = '#34d399';
        ctx.beginPath();
        ctx.arc(s.x, s.y, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Base point + live line + value.
    if (base.current) {
      const a = toScreen(base.current);
      const b = live.current ? toScreen(live.current) : null;
      if (a) {
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(a.x, a.y, 8, 0, Math.PI * 2);
        ctx.fill();
      }
      if (a && b && liveCm.current != null) {
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(b.x, b.y, 7, 0, Math.PI * 2);
        ctx.fill();
        const text = `${liveCm.current.toFixed(1)} cm`;
        ctx.font = '700 20px system-ui, sans-serif';
        const tw = ctx.measureText(text).width;
        const mx = (a.x + b.x) / 2 + 14;
        const my = (a.y + b.y) / 2;
        ctx.fillStyle = 'rgba(15,23,42,0.85)';
        ctx.fillRect(mx - 6, my - 20, tw + 12, 30);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(text, mx, my + 2);
      }
    }
  };

  const placePoint = () => {
    if (!base.current) {
      if (!reticle.current) return;
      base.current = { ...reticle.current };
      setPlacing(true);
      return;
    }
    if (liveCm.current == null) return;
    const cm = Math.round(liveCm.current * 10) / 10;
    if (axisRef.current === 'height') setHeightCm(cm);
    else setWidthCm(cm);
    base.current = null;
    setPlacing(false);
    // After the height, go straight on to the width.
    if (axisRef.current === 'height') setAxis('width');
  };

  const undo = () => {
    if (base.current) {
      base.current = null;
      setPlacing(false);
    } else if (axis === 'width' && widthCm != null) setWidthCm(null);
    else if (heightCm != null) setHeightCm(null);
  };

  const saveItem = () => {
    if (heightCm == null && widthCm == null) return;
    const name = label === 'Other' ? customLabel.trim() || 'Object' : label;
    const item: MeasuredItem = {
      id: `${name.toLowerCase()}-ar-${Date.now()}`,
      label: name,
      heightCm,
      widthCm,
      errCm: arErrCm(Math.max(heightCm ?? 0, widthCm ?? 0)),
      mode: 'user-measured',
    };
    setSaved((p) => [...p, item]);
    setHeightCm(null);
    setWidthCm(null);
    setAxis('height');
  };

  const finish = () => {
    sessionRef.current?.end().catch(() => {});
    onClose(savedRef.current);
  };

  const instruction = !hasSurface && !placing
    ? 'Move the phone slowly over the floor / table until the circle turns green.'
    : axis === 'height'
      ? placing
        ? 'Now point the circle at the TOP of the object, then tap "Set top".'
        : 'Aim at the BOTTOM of the object (where it touches the floor/table) and tap "Set base".'
      : placing
        ? 'Point at the OTHER edge, then tap "Set end".'
        : 'Aim at one bottom EDGE of the object and tap "Set start".';

  const placeLabel = axis === 'height' ? (placing ? 'Set top' : 'Set base') : placing ? 'Set end' : 'Set start';

  return (
    <div className="fixed inset-0 z-50 bg-black text-white">
      {/* Shown before AR starts */}
      {!running && (
        <div className="h-full overflow-y-auto p-6 max-w-md mx-auto flex flex-col justify-center">
          <Ruler className="w-10 h-10 text-emerald-400 mb-3" />
          <h2 className="text-2xl font-bold">AR exact measure</h2>
          <p className="text-gray-300 text-sm mt-2">
            Uses your phone's AR tracking to measure real height and width — typically within ±1–2 cm.
          </p>
          <ol className="text-gray-300 text-sm mt-4 space-y-1.5 list-decimal list-inside">
            <li>Point at the floor or table and move the phone slowly.</li>
            <li><b>Height:</b> set the base, then point at the top.</li>
            <li><b>Width:</b> set one edge, then the other edge.</li>
            <li>Name it and save. Measure as many objects as you like.</li>
          </ol>
          {error && <p className="mt-4 text-sm text-red-300">{error}</p>}
          {saved.length > 0 && (
            <p className="mt-4 text-sm text-emerald-300">{saved.length} object(s) measured.</p>
          )}
          <button onClick={start} className="mt-6 w-full bg-emerald-600 hover:bg-emerald-700 font-bold py-4 rounded-xl">
            {saved.length ? 'Measure more' : 'Start AR'}
          </button>
          <button onClick={finish} className="mt-3 w-full bg-white/10 hover:bg-white/20 font-semibold py-3 rounded-xl">
            {saved.length ? 'Done' : 'Cancel'}
          </button>
        </div>
      )}

      {/* AR DOM overlay — becomes the full-screen layer over the camera */}
      <div ref={overlayRef} className={running ? 'fixed inset-0' : 'hidden'} style={{ background: 'transparent' }}>
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

        <div className="absolute top-0 inset-x-0 p-4 bg-gradient-to-b from-black/80 to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              {(['height', 'width'] as Axis[]).map((a) => (
                <button
                  key={a}
                  onClick={() => { base.current = null; setPlacing(false); setAxis(a); }}
                  className={`text-sm font-semibold px-3 py-1.5 rounded-full flex items-center gap-1 ${
                    axis === a ? 'bg-emerald-600' : 'bg-white/15'
                  }`}
                >
                  {a === 'height' ? <MoveVertical className="w-4 h-4" /> : <MoveHorizontal className="w-4 h-4" />}
                  {a === 'height' ? 'Height' : 'Width'}
                </button>
              ))}
            </div>
            <button onClick={finish} className="bg-white/15 rounded-full p-2" title="Done">
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="mt-3 text-sm text-gray-100">{instruction}</p>
          <div className="mt-2 flex gap-3 text-sm">
            <span className="bg-black/60 rounded-lg px-2.5 py-1">H: <b>{heightCm != null ? `${heightCm} cm` : '—'}</b></span>
            <span className="bg-black/60 rounded-lg px-2.5 py-1">W: <b>{widthCm != null ? `${widthCm} cm` : '—'}</b></span>
            {placing && readout != null && (
              <span className="bg-amber-500/90 text-black rounded-lg px-2.5 py-1 font-bold">{readout} cm</span>
            )}
          </div>
        </div>

        <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/85 to-transparent space-y-3">
          {(heightCm != null || widthCm != null) && !placing && (
            <div className="flex gap-2 items-center">
              <select
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="bg-white/15 rounded-lg px-2 py-2 text-sm text-white"
              >
                {LABELS.map((l) => <option key={l} value={l} className="text-black">{l}</option>)}
              </select>
              {label === 'Other' && (
                <input
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  placeholder="Name"
                  className="flex-1 min-w-0 bg-white/15 rounded-lg px-2 py-2 text-sm text-white placeholder:text-gray-400"
                />
              )}
              <button onClick={saveItem} className="ml-auto bg-sky-600 rounded-lg px-3 py-2 text-sm font-semibold flex items-center gap-1">
                <Plus className="w-4 h-4" /> Save
              </button>
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={undo} className="bg-white/15 rounded-xl px-4 py-4" title="Undo">
              <Undo2 className="w-5 h-5" />
            </button>
            <button
              onClick={placePoint}
              disabled={placing ? readout == null : !hasSurface}
              className="flex-1 bg-emerald-600 disabled:bg-gray-600 font-bold py-4 rounded-xl text-lg flex items-center justify-center gap-2"
            >
              <Check className="w-5 h-5" /> {placeLabel}
            </button>
          </div>
          {saved.length > 0 && (
            <p className="text-xs text-gray-300">
              Saved: {saved.map((s) => `${s.label} ${s.heightCm ?? '—'}×${s.widthCm ?? '—'} cm`).join(' · ')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
