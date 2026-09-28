/**
 * ErgoAI relationship engine — the core new feature (spec §17).
 *
 * The clinical/posture engine (`ergoEngine.ts`) answers "is this person's posture
 * risky?". This engine answers the ergonomic question the posture score can't:
 * "is this workstation appropriately configured for THIS person?" — by comparing
 * the human's pose landmarks against the detected objects' positions.
 *
 * Design rules (spec §18/§19/§27):
 *  - Every finding is structured: object + observed + criterion + relationship +
 *    risk + confidence + recommendation. Never a bare "good/bad".
 *  - We NEVER fabricate. A relationship is only judged when the driving object was
 *    confidently detected AND the driving landmarks were visible; otherwise the
 *    finding says "not confidently detected" and asks for a manual measurement.
 *  - Centimetre values only appear when user-measured or calibrated. Everything
 *    else is qualitative ("appears high") with an explicit low/medium confidence.
 *
 * All geometry is in normalised frame coordinates (0–1, origin top-left, y down),
 * matching both the pose landmarks and the object boxes.
 */

import { Landmark } from '@/lib/poseDetection';
import {
  DetectedObject,
  ErgoObjectType,
  ErgoObjectInputs,
  ErgoCalibration,
  ErgoFinding,
  ErgoMeasurement,
  FindingConfidence,
  ErgoAngles,
  MeasurementMode,
} from './ergoTypes';
import { distanceMode, pxToCm } from './calibration';

// MediaPipe landmark indices we reference here.
const LM = {
  nose: 0,
  leftEye: 2,
  rightEye: 5,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftFoot: 31,
  rightFoot: 32,
} as const;

const vis = (l?: Landmark) => l?.visibility ?? 0;

/** Mean of the two sides for a landmark pair, preferring whichever is visible. */
function pick(lm: Landmark[], left: number, right: number): Landmark | null {
  const a = lm[left];
  const b = lm[right];
  if (vis(a) > 0.3 && vis(b) > 0.3) {
    return {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      z: 0,
      visibility: Math.min(vis(a), vis(b)),
    };
  }
  if (vis(a) > 0.3) return a;
  if (vis(b) > 0.3) return b;
  return null;
}

/** Highest-scoring detected object of a given type, if any. */
function best(objects: DetectedObject[], type: ErgoObjectType): DetectedObject | null {
  let out: DetectedObject | null = null;
  for (const o of objects) if (o.type === type && (!out || o.score > out.score)) out = o;
  return out;
}

const boxCenterX = (o: DetectedObject) => o.box.x + o.box.w / 2;
const boxCenterY = (o: DetectedObject) => o.box.y + o.box.h / 2;
const boxTop = (o: DetectedObject) => o.box.y;

/**
 * Fold a detector score + landmark visibility (+ any hard measurement) into one
 * confidence label. A user measurement or calibration lifts the ceiling; poor
 * detection or invisible joints drags it down.
 */
function combineConfidence(
  detScore: number,
  lmVisibility: number,
  hardMeasure: boolean
): FindingConfidence {
  if (detScore <= 0 || lmVisibility <= 0) return 'unable';
  const base = Math.min(detScore, lmVisibility);
  if (hardMeasure && base >= 0.4) return 'high';
  if (base >= 0.6) return 'high';
  if (base >= 0.4) return 'medium';
  return 'low';
}

/** A finding for an object we could not confidently detect (spec §27). */
function notDetected(
  object: ErgoObjectType,
  title: string,
  askFor: string
): ErgoFinding {
  return {
    object,
    title,
    observed: `${title} not confidently detected in the workstation frame.`,
    criterion: 'Requires a clear view of the object, or a manual measurement.',
    relationship: 'Unable to evaluate the human ↔ object relationship.',
    band: 'negligible',
    confidence: 'unable',
    measurementMode: 'unknown',
    measurements: [],
    recommendation: `Reframe so the ${title.toLowerCase()} is fully visible, or enter ${askFor} manually to assess this relationship.`,
  };
}

/**
 * Assess the human ↔ workplace relationships for one side-on workstation frame.
 * `landmarks` and `angles` come from the pose run on that same frame; `objects`
 * from the object detector; `inputs`/`calibration` are the optional manual layer.
 */
export function assessRelationships(
  landmarks: Landmark[] | null,
  angles: ErgoAngles | null,
  objects: DetectedObject[],
  inputs: ErgoObjectInputs,
  calibration: ErgoCalibration | null
): ErgoFinding[] {
  const findings: ErgoFinding[] = [];
  const lm = landmarks ?? [];

  const shoulder = pick(lm, LM.leftShoulder, LM.rightShoulder);
  const elbow = pick(lm, LM.leftElbow, LM.rightElbow);
  const wrist = pick(lm, LM.leftWrist, LM.rightWrist);
  const eye = pick(lm, LM.leftEye, LM.rightEye) ?? lm[LM.nose] ?? null;
  const ankle = pick(lm, LM.leftAnkle, LM.rightAnkle);

  // ---- CHAIR: seat height ↔ feet support / knee angle -----------------------
  {
    const chair = best(objects, 'chair');
    const knee = angles?.kneeAngle ?? null; // flexion from straight; ~90 = seated neutral
    const userSeat = inputs.chairSeatHeightCm;
    if (!chair && userSeat == null) {
      findings.push(notDetected('chair', 'Chair', 'the seat height'));
    } else {
      const measurements: ErgoMeasurement[] = [];
      if (userSeat != null)
        measurements.push({ key: 'seatHeight', label: 'Seat height', valueCm: userSeat, mode: 'user-measured' });

      let observed: string;
      let relationship: string;
      let band: ErgoFinding['band'] = 'low';
      let recommendation: string;

      if (knee != null && knee < 70) {
        observed = 'Lower leg appears extended (knee opening wide) for a seated posture.';
        relationship = 'Seat appears high relative to the lower-leg length — feet may be poorly supported.';
        band = 'medium';
        recommendation = 'Lower the chair until feet rest flat, or add a footrest. Confirm with the actual seat height.';
      } else if (knee != null && knee > 120) {
        observed = 'Knees appear high (deep knee flexion) for a seated posture.';
        relationship = 'Seat appears low — hips may sit below knee level, increasing thigh/trunk load.';
        band = 'medium';
        recommendation = 'Raise the chair so hips are level with or slightly above the knees. Confirm with the actual seat height.';
      } else if (knee != null) {
        observed = 'Knee angle is within a typical seated range.';
        relationship = 'Seat height appears approximately appropriate for this person.';
        band = 'low';
        recommendation = 'Maintain a supported, roughly 90–110° knee angle with feet flat.';
      } else {
        observed = 'Chair detected but the legs were not clearly visible to judge fit.';
        relationship = 'Seat-to-leg relationship could not be evaluated from pose alone.';
        band = 'negligible';
        recommendation = 'Capture the legs in frame, or enter the actual seat height to assess fit.';
      }

      findings.push({
        object: 'chair',
        title: 'Chair height',
        observed,
        criterion: 'Seated knee angle ≈ 90–110° with feet supported (neutral seated posture).',
        relationship,
        band,
        confidence: combineConfidence(chair?.score ?? 0.5, knee != null ? 0.7 : 0.2, userSeat != null),
        measurementMode: userSeat != null ? 'user-measured' : 'estimated',
        measurements,
        recommendation,
      });
    }
  }

  // ---- DESK: surface height ↔ elbow height ---------------------------------
  {
    const desk = best(objects, 'desk');
    const userDesk = inputs.deskHeightCm;
    if (!desk && userDesk == null) {
      findings.push(notDetected('desk', 'Desk', 'the work-surface height'));
    } else {
      const measurements: ErgoMeasurement[] = [];
      if (userDesk != null)
        measurements.push({ key: 'deskHeight', label: 'Desk height', valueCm: userDesk, mode: 'user-measured' });

      let observed: string;
      let relationship: string;
      let band: ErgoFinding['band'] = 'low';
      let recommendation: string;

      // Compare the desk's top edge to the seated elbow height. y grows downward,
      // so a SMALLER y means the surface sits HIGHER than the elbow.
      if (desk && elbow) {
        const deltaY = boxTop(desk) - elbow.y; // negative → desk above elbow
        if (deltaY < -0.05 || angles?.shoulderRaised) {
          observed = 'Work surface appears above the seated elbow height' + (angles?.shoulderRaised ? ', and the shoulder looks raised.' : '.');
          relationship = 'Desk too high relative to the elbow — forces shoulder elevation / wrist extension.';
          band = 'medium';
          recommendation = 'Lower the desk or raise the chair (add a footrest if feet then dangle) so forearms rest near horizontal.';
        } else if (deltaY > 0.10 || (angles?.trunkFlexion ?? 0) > 20) {
          observed = 'Work surface appears below the seated elbow height' + ((angles?.trunkFlexion ?? 0) > 20 ? ', and the trunk is leaning forward.' : '.');
          relationship = 'Desk too low relative to the elbow — encourages forward trunk flexion.';
          band = 'medium';
          recommendation = 'Raise the work surface so elbows stay at roughly 90° with the trunk upright.';
        } else {
          observed = 'Work surface height is close to the seated elbow height.';
          relationship = 'Desk height appears approximately appropriate.';
          band = 'low';
          recommendation = 'Keep forearms roughly horizontal with elbows at ~90°.';
        }
      } else {
        observed = 'Desk detected but the elbow was not clearly visible to compare heights.';
        relationship = 'Desk-to-elbow relationship could not be evaluated from pose alone.';
        band = 'negligible';
        recommendation = 'Capture the seated arm in frame, or enter the actual desk height to assess fit.';
      }

      findings.push({
        object: 'desk',
        title: 'Desk height',
        observed,
        criterion: 'Work surface ≈ seated elbow height; forearms roughly horizontal (~90° elbow).',
        relationship,
        band,
        confidence: combineConfidence(desk?.score ?? 0.5, elbow ? vis(elbow) : 0.2, userDesk != null),
        measurementMode: userDesk != null ? 'user-measured' : 'estimated',
        measurements,
        recommendation,
      });
    }
  }

  // ---- MONITOR / LAPTOP: screen height ↔ eyes; distance --------------------
  {
    const monitor = best(objects, 'monitor') ?? best(objects, 'laptop');
    const userDist = inputs.monitorDistanceCm;
    if (!monitor && userDist == null) {
      findings.push(notDetected('monitor', 'Monitor', 'the eye-to-screen distance'));
    } else {
      const isLaptop = monitor?.type === 'laptop';
      const measurements: ErgoMeasurement[] = [];

      // Height relationship: top of the screen ≈ eye level is ideal.
      let observed: string;
      let relationship: string;
      let band: ErgoFinding['band'] = 'low';
      let recommendation: string;
      if (monitor && eye) {
        const screenTop = boxTop(monitor);
        const deltaY = screenTop - eye.y; // positive → screen top below eyes
        if (deltaY > 0.06 || (angles?.neckFlexion ?? 0) > 15) {
          observed = 'Top of the screen appears below eye level' + ((angles?.neckFlexion ?? 0) > 15 ? ', and the neck is flexed downward.' : '.');
          relationship = 'Screen too low — head tilts down, increasing neck flexion.';
          band = 'medium';
          recommendation = isLaptop
            ? 'Raise the laptop on a stand and use an external keyboard/mouse so the screen top reaches eye level.'
            : 'Raise the monitor (or its stand) so the top of the screen is at or just below eye level.';
        } else if (deltaY < -0.10) {
          observed = 'Top of the screen appears well above eye level.';
          relationship = 'Screen too high — encourages neck extension / eye strain.';
          band = 'medium';
          recommendation = 'Lower the monitor so the top of the screen is at or just below eye level.';
        } else {
          observed = 'Screen top is close to eye level.';
          relationship = 'Screen height appears approximately appropriate.';
          band = 'low';
          recommendation = 'Keep the top of the screen at or just below eye level.';
        }
      } else {
        observed = 'Screen detected but the eyes were not clearly visible to compare heights.';
        relationship = 'Screen-to-eye height relationship could not be evaluated from pose alone.';
        band = 'negligible';
        recommendation = 'Capture the head in frame, or judge the height manually against eye level.';
      }

      // Distance relationship (separate measurement line).
      let distMode: MeasurementMode = distanceMode(userDist, calibration);
      let distValue: number | null = userDist;
      if (userDist == null && monitor && shoulder && calibration?.pixelsPerCm) {
        const dxPx = Math.abs(boxCenterX(monitor) - shoulder.x); // normalised — approximate
        // Convert using calibration: pixelsPerCm was derived on the full-res frame,
        // so scale the normalised delta by an assumed 1280px frame width for a
        // rough centimetre figure. This stays an explicit "calibrated estimate".
        const cm = pxToCm(dxPx * 1280, calibration);
        distValue = cm != null ? Math.round(cm) : null;
      }
      if (distValue != null) {
        measurements.push({ key: 'monitorDistance', label: 'Eye-to-screen distance', valueCm: distValue, mode: distMode });
      }
      let distNote = '';
      if (distValue != null) {
        if (distValue < 45) distNote = ` Distance ≈ ${distValue} cm (${distMode.replace('-', ' ')}) — potentially too close.`;
        else if (distValue > 80) distNote = ` Distance ≈ ${distValue} cm (${distMode.replace('-', ' ')}) — potentially too far.`;
        else distNote = ` Distance ≈ ${distValue} cm (${distMode.replace('-', ' ')}) — within a typical arm's-length range.`;
      }

      findings.push({
        object: 'monitor',
        title: isLaptop ? 'Laptop screen' : 'Monitor',
        observed: observed + distNote,
        criterion: 'Top of screen ≈ eye level; screen ~50–70 cm (arm’s length) away.',
        relationship,
        band,
        confidence: combineConfidence(monitor?.score ?? 0.5, eye ? vis(eye) : 0.2, userDist != null),
        measurementMode: userDist != null ? 'user-measured' : calibration?.pixelsPerCm ? 'calibrated' : 'estimated',
        measurements,
        recommendation,
      });
    }
  }

  // ---- KEYBOARD / MOUSE: reach ---------------------------------------------
  {
    const keyboard = best(objects, 'keyboard');
    const mouse = best(objects, 'mouse');
    if (!keyboard && !mouse) {
      findings.push(notDetected('keyboard', 'Keyboard / mouse', 'their position relative to the user'));
    } else {
      const target = mouse ?? keyboard!;
      let observed: string;
      let relationship: string;
      let band: ErgoFinding['band'] = 'low';
      let recommendation: string;
      const elbowAngle = angles?.lowerArmAngle ?? null; // flexion from straight; ~90 ideal at desk

      if (wrist) {
        const dx = Math.abs(boxCenterX(target) - wrist.x);
        if (dx > 0.22) {
          observed = `${mouse ? 'Mouse' : 'Keyboard'} appears offset well to the side of the hand.`;
          relationship = 'Lateral reach — sustained shoulder abduction / arm extension.';
          band = 'medium';
          recommendation = 'Bring the keyboard and mouse in line with the shoulders, close to the body edge of the desk.';
        } else if (elbowAngle != null && elbowAngle < 60) {
          observed = 'The forearm looks extended toward the input devices.';
          relationship = 'Devices sit too far forward — elbow opens beyond ~90°.';
          band = 'medium';
          recommendation = 'Pull the keyboard/mouse closer so elbows stay near 90° and wrists straight.';
        } else {
          observed = 'Input devices appear within comfortable reach.';
          relationship = 'Keyboard/mouse position appears approximately appropriate.';
          band = 'low';
          recommendation = 'Keep wrists straight and elbows near 90° while typing/pointing.';
        }
      } else {
        observed = 'Keyboard/mouse detected but the hand was not clearly visible to judge reach.';
        relationship = 'Reach distance could not be evaluated from pose alone.';
        band = 'negligible';
        recommendation = 'Capture the hand in frame to assess reach.';
      }

      findings.push({
        object: mouse ? 'mouse' : 'keyboard',
        title: 'Keyboard & mouse reach',
        observed,
        criterion: 'Devices in line with the shoulders; elbows ~90°, wrists straight, minimal reach.',
        relationship,
        band,
        confidence: combineConfidence(target.score, wrist ? vis(wrist) : 0.2, false),
        measurementMode: 'estimated',
        measurements: [],
        recommendation,
      });
    }
  }

  // ---- FEET / FOOTREST ------------------------------------------------------
  {
    const footrest = best(objects, 'footrest'); // COCO won't emit this; kept for future models
    const present = inputs.footrestPresent === true || !!footrest;
    const knee = angles?.kneeAngle ?? null;
    const seatLikelyHigh = knee != null && knee < 70;
    let observed: string;
    let relationship: string;
    let band: ErgoFinding['band'] = 'low';
    let recommendation: string;

    if (present) {
      observed = 'A footrest is present / confirmed.';
      relationship = 'Feet can be supported even if the chair is high.';
      band = 'low';
      recommendation = 'Ensure the whole foot rests on the support with the ankle relaxed.';
    } else if (seatLikelyHigh) {
      observed = 'No footrest confirmed and the seat appears high for the lower-leg length.';
      relationship = 'Feet may be unsupported — dangling feet increase thigh pressure.';
      band = 'medium';
      recommendation = 'Lower the chair so feet rest flat, or add a footrest.';
    } else if (ankle) {
      observed = 'Feet appear to reach a supporting surface.';
      relationship = 'Foot support appears adequate.';
      band = 'low';
      recommendation = 'Keep feet flat and supported with the ankle relaxed.';
    } else {
      observed = 'Foot support could not be assessed from the frame.';
      relationship = 'Not enough information to evaluate foot support.';
      band = 'negligible';
      recommendation = 'Capture the feet in frame, or confirm whether a footrest is used.';
    }

    findings.push({
      object: 'footrest',
      title: 'Foot support',
      observed,
      criterion: 'Feet flat on the floor or a footrest; ankle relaxed, thighs supported.',
      relationship,
      band,
      confidence: combineConfidence(footrest?.score ?? 0.5, ankle ? vis(ankle) : 0.3, inputs.footrestPresent != null),
      measurementMode: inputs.footrestPresent != null ? 'user-measured' : 'estimated',
      measurements: [],
      recommendation,
    });
  }

  return findings;
}

/** Dominant measurement provenance across findings (best mode present). */
export function dominantMode(findings: ErgoFinding[]): MeasurementMode {
  const order: MeasurementMode[] = ['user-measured', 'calibrated', 'estimated', 'unknown'];
  for (const m of order) if (findings.some((f) => f.measurementMode === m)) return m;
  return 'unknown';
}
