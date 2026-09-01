// "Lock to this panel" — a device preference that pins the app to whichever
// console (admin / doctor / reception / patient) the signed-in user locked.
// When set, opening the app jumps straight into that dashboard instead of the
// public marketing home page. Cleared when the user unlocks or logs out.
const KEY = 'hm_panel_lock';

export function isPanelLocked(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setPanelLock(locked: boolean) {
  try {
    if (locked) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    /* storage may be unavailable */
  }
}
