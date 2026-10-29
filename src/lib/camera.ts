// Shared camera helper so every capture screen opens the requested lens the
// same way — and reliably picks the *back* camera on phones.
//
// Why the fallback dance: `facingMode: 'environment'` is only a *soft* hint,
// so some mobile browsers keep using the front (selfie) camera when you ask
// for the back one. Asking with `{ exact: 'environment' }` forces the rear
// lens, but on laptops / single-camera devices that throws `OverconstrainedError`.
// So we try the strict constraint first and gracefully fall back to the soft
// one (and finally to bare video) so the camera always opens.
//
// Speed: resolving `facingMode` makes many Android browsers probe every lens,
// which can take several seconds for the back camera. Once a lens has opened we
// remember its deviceId and ask for it directly next time (near-instant). We
// also remember the last lens used so screens open straight on it instead of
// opening the front camera first and then switching.

export type Lens = 'user' | 'environment';

const DEVICE_KEY = 'hm-camera-device-';
const LENS_KEY = 'hm-camera-lens';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage blocked — just skip the speed-up */
  }
}

/** The lens the user last opened, or `fallback` if none is remembered. */
export function getPreferredLens(fallback: Lens): Lens {
  const v = read(LENS_KEY);
  return v === 'user' || v === 'environment' ? v : fallback;
}

export async function openCamera(mode: Lens): Promise<MediaStream> {
  const size = { width: { ideal: 1280 }, height: { ideal: 720 } };
  const cachedId = read(DEVICE_KEY + mode);

  const attempts: MediaStreamConstraints[] = [
    ...(cachedId ? [{ video: { ...size, deviceId: { exact: cachedId } } }] : []),
    { video: { ...size, facingMode: { exact: mode } } },
    { video: { ...size, facingMode: mode } },
    { video: size },
  ];

  let lastError: unknown;
  for (const constraints of attempts) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      remember(stream, mode);
      return stream;
    } catch (err) {
      lastError = err;
      // A stale cached device (camera unplugged, permissions reset) — forget it.
      if (cachedId && (constraints.video as MediaTrackConstraints).deviceId) {
        write(DEVICE_KEY + mode, null);
      }
      // No permission: every other attempt would fail the same way.
      if (err instanceof DOMException && err.name === 'NotAllowedError') break;
    }
  }
  throw lastError;
}

function remember(stream: MediaStream, mode: Lens) {
  write(LENS_KEY, mode);
  const settings = stream.getVideoTracks()[0]?.getSettings();
  // Only cache when the browser confirms this really is the requested lens, so
  // a laptop webcam is never stored as the "back" camera.
  if (settings?.deviceId && settings.facingMode === mode) {
    write(DEVICE_KEY + mode, settings.deviceId);
  }
}
