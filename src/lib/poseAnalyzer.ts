import { Landmark, calculateAngle, calculateDistance, calculateAngle2D } from '@/lib/poseDetection';

export interface PostureIssue {
  type: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  recommendation: string;
}

interface KeyPoints {
  nose: Landmark;
  leftEye: Landmark;
  rightEye: Landmark;
  leftEar: Landmark;
  rightEar: Landmark;
  leftShoulder: Landmark;
  rightShoulder: Landmark;
  leftElbow: Landmark;
  rightElbow: Landmark;
  leftWrist: Landmark;
  rightWrist: Landmark;
  leftHip: Landmark;
  rightHip: Landmark;
  leftKnee: Landmark;
  rightKnee: Landmark;
  leftAnkle: Landmark;
  rightAnkle: Landmark;
}

function extractKeyPoints(landmarks: Landmark[]): KeyPoints | null {
  if (landmarks.length < 33) return null;

  const getVisible = (idx: number): Landmark => {
    const l = landmarks[idx];
    return l && (l.visibility ?? 0) > 0.5 ? l : { x: 0, y: 0, z: 0, visibility: 0 };
  };

  return {
    nose: getVisible(0),
    leftEye: getVisible(1),
    rightEye: getVisible(5),
    leftEar: getVisible(7),
    rightEar: getVisible(8),
    leftShoulder: getVisible(11),
    rightShoulder: getVisible(12),
    leftElbow: getVisible(13),
    rightElbow: getVisible(14),
    leftWrist: getVisible(15),
    rightWrist: getVisible(16),
    leftHip: getVisible(23),
    rightHip: getVisible(24),
    leftKnee: getVisible(25),
    rightKnee: getVisible(26),
    leftAnkle: getVisible(27),
    rightAnkle: getVisible(28),
  };
}

function detectForwardHead(keyPoints: KeyPoints): PostureIssue | null {
  const shoulderMid = {
    x: (keyPoints.leftShoulder.x + keyPoints.rightShoulder.x) / 2,
    y: (keyPoints.leftShoulder.y + keyPoints.rightShoulder.y) / 2,
    z: (keyPoints.leftShoulder.z + keyPoints.rightShoulder.z) / 2,
  };

  const noseToShoulder = {
    x: keyPoints.nose.x - shoulderMid.x,
    y: keyPoints.nose.y - shoulderMid.y,
    z: keyPoints.nose.z - shoulderMid.z,
  };

  const distance = Math.sqrt(noseToShoulder.x ** 2 + noseToShoulder.y ** 2);
  const shoulderWidth = calculateDistance(keyPoints.leftShoulder, keyPoints.rightShoulder);

  if (shoulderWidth > 0 && distance / shoulderWidth > 0.25) {
    return {
      type: 'forward_head',
      severity: 'high',
      description: 'Forward head posture detected - Head is positioned too far forward',
      recommendation: 'Strengthen neck and upper back. Practice chin tucks and postural exercises daily.',
    };
  }

  return null;
}

function detectRoundedShoulders(keyPoints: KeyPoints): PostureIssue | null {
  const leftShoulderElbowAngle = calculateAngle2D(
    keyPoints.leftWrist,
    keyPoints.leftElbow,
    keyPoints.leftShoulder
  );

  const rightShoulderElbowAngle = calculateAngle2D(
    keyPoints.rightWrist,
    keyPoints.rightElbow,
    keyPoints.rightShoulder
  );

  const avgAngle = (leftShoulderElbowAngle + rightShoulderElbowAngle) / 2;

  if (avgAngle < 100) {
    return {
      type: 'rounded_shoulders',
      severity: 'medium',
      description: 'Rounded shoulders detected - Shoulders are hunched forward',
      recommendation: 'Practice shoulder blade squeezes, chest opening exercises, and wall angels.',
    };
  }

  return null;
}

function detectShoulderImbalance(keyPoints: KeyPoints): PostureIssue | null {
  const leftHeight = keyPoints.leftShoulder.y;
  const rightHeight = keyPoints.rightShoulder.y;
  const heightDiff = Math.abs(leftHeight - rightHeight);

  if (heightDiff > 0.08) {
    const lowerSide = leftHeight > rightHeight ? 'left' : 'right';
    return {
      type: 'shoulder_imbalance',
      severity: 'medium',
      description: `Shoulder imbalance detected - ${lowerSide} shoulder is lower`,
      recommendation: 'Perform lateral stretches and targeted strengthening exercises for the lower shoulder.',
    };
  }

  return null;
}

function detectHipTilt(keyPoints: KeyPoints): PostureIssue | null {
  const hipTilt = Math.abs(keyPoints.leftHip.y - keyPoints.rightHip.y);

  if (hipTilt > 0.1) {
    return {
      type: 'hip_tilt',
      severity: 'medium',
      description: 'Hip tilt detected - Hips are not level',
      recommendation: 'Work on core stability and glute activation exercises.',
    };
  }

  return null;
}

function detectKneePositioning(keyPoints: KeyPoints): PostureIssue | null {
  const leftKneeX = keyPoints.leftKnee.x;
  const leftAnkleX = keyPoints.leftAnkle.x;
  const rightKneeX = keyPoints.rightKnee.x;
  const rightAnkleX = keyPoints.rightAnkle.x;

  const leftKneeOverAnkle = Math.abs(leftKneeX - leftAnkleX) < 0.05;
  const rightKneeOverAnkle = Math.abs(rightKneeX - rightAnkleX) < 0.05;

  if (!leftKneeOverAnkle || !rightKneeOverAnkle) {
    return {
      type: 'knee_alignment',
      severity: 'medium',
      description: 'Knee alignment needs improvement',
      recommendation: 'Keep knees tracking over ankles. Practice squats with proper form.',
    };
  }

  return null;
}

function calculatePostureScore(issues: PostureIssue[]): number {
  let score = 100;
  for (const issue of issues) {
    if (issue.severity === 'high') score -= 25;
    else if (issue.severity === 'medium') score -= 12;
    else score -= 5;
  }
  return Math.max(0, Math.min(100, score));
}

export function analyzePosture(landmarks: Landmark[]): {
  issues: PostureIssue[];
  score: number;
  confidence: number;
} {
  const keyPoints = extractKeyPoints(landmarks);
  if (!keyPoints) {
    return { issues: [], score: 0, confidence: 0 };
  }

  const issues: PostureIssue[] = [];
  let detectionCount = 0;

  const forwardHead = detectForwardHead(keyPoints);
  if (forwardHead) {
    issues.push(forwardHead);
    detectionCount++;
  }

  const roundedShoulders = detectRoundedShoulders(keyPoints);
  if (roundedShoulders) {
    issues.push(roundedShoulders);
    detectionCount++;
  }

  const shoulderImbalance = detectShoulderImbalance(keyPoints);
  if (shoulderImbalance) {
    issues.push(shoulderImbalance);
    detectionCount++;
  }

  const hipTilt = detectHipTilt(keyPoints);
  if (hipTilt) {
    issues.push(hipTilt);
    detectionCount++;
  }

  const kneePositioning = detectKneePositioning(keyPoints);
  if (kneePositioning) {
    issues.push(kneePositioning);
    detectionCount++;
  }

  const score = calculatePostureScore(issues);
  const confidence = Math.min(100, landmarks.filter((l) => (l.visibility ?? 0) > 0.5).length * 3.3);

  return { issues, score, confidence };
}

export function analyzeSquat(landmarks: Landmark[]): {
  issues: PostureIssue[];
  score: number;
  confidence: number;
} {
  const keyPoints = extractKeyPoints(landmarks);
  if (!keyPoints) {
    return { issues: [], score: 0, confidence: 0 };
  }

  const issues: PostureIssue[] = [];

  // Knee angle during squat
  const leftKneeAngle = calculateAngle(keyPoints.leftHip, keyPoints.leftKnee, keyPoints.leftAnkle);
  const rightKneeAngle = calculateAngle(keyPoints.rightHip, keyPoints.rightKnee, keyPoints.rightAnkle);

  if (leftKneeAngle > 100 || rightKneeAngle > 100) {
    issues.push({
      type: 'shallow_squat',
      severity: 'medium',
      description: 'Squat depth is insufficient',
      recommendation: 'Go deeper into your squat. Aim for knees at least at 90 degrees.',
    });
  }

  // Back angle during squat
  const spineAngle = calculateAngle(keyPoints.nose, keyPoints.leftShoulder, keyPoints.leftHip);
  if (spineAngle < 70) {
    issues.push({
      type: 'forward_lean',
      severity: 'high',
      description: 'Excessive forward lean detected',
      recommendation: 'Keep your chest upright. Maintain a neutral spine throughout the squat.',
    });
  }

  // Knee alignment
  const leftKneeAlignment = Math.abs(keyPoints.leftKnee.x - keyPoints.leftAnkle.x);
  const rightKneeAlignment = Math.abs(keyPoints.rightKnee.x - keyPoints.rightAnkle.x);

  if (leftKneeAlignment > 0.1 || rightKneeAlignment > 0.1) {
    issues.push({
      type: 'knee_valgus',
      severity: 'high',
      description: 'Knees caving inward detected',
      recommendation: 'Push knees outward. Keep them aligned over your toes.',
    });
  }

  // Hip-Knee-Ankle alignment
  const leftHKAAngle = calculateAngle2D(keyPoints.leftHip, keyPoints.leftKnee, keyPoints.leftAnkle);
  const rightHKAAngle = calculateAngle2D(keyPoints.rightHip, keyPoints.rightKnee, keyPoints.rightAnkle);

  if (leftHKAAngle < 70 || rightHKAAngle < 70) {
    issues.push({
      type: 'excessive_knee_valgus',
      severity: 'high',
      description: 'Excessive inward knee movement',
      recommendation: 'Strengthen glutes and hips. Practice clamshells and single-leg work.',
    });
  }

  const score = calculatePostureScore(issues);
  const confidence = Math.min(100, landmarks.filter((l) => (l.visibility ?? 0) > 0.5).length * 3.3);

  return { issues, score, confidence };
}

export function calculateMobilityScore(landmarks: Landmark[]): number {
  const keyPoints = extractKeyPoints(landmarks);
  if (!keyPoints) return 0;

  const leftElbowAngle = calculateAngle(keyPoints.leftShoulder, keyPoints.leftElbow, keyPoints.leftWrist);
  const rightElbowAngle = calculateAngle(keyPoints.rightShoulder, keyPoints.rightElbow, keyPoints.rightWrist);
  const hipAngle = calculateAngle(keyPoints.leftShoulder, keyPoints.leftHip, keyPoints.leftKnee);

  const avgAngle = (leftElbowAngle + rightElbowAngle + hipAngle) / 3;
  return Math.min(100, Math.max(0, (avgAngle / 180) * 100));
}

export function calculateStabilityScore(landmarks: Landmark[]): number {
  const keyPoints = extractKeyPoints(landmarks);
  if (!keyPoints) return 0;

  const hipBalance = 100 - Math.abs(keyPoints.leftHip.y - keyPoints.rightHip.y) * 500;
  const shoulderBalance = 100 - Math.abs(keyPoints.leftShoulder.y - keyPoints.rightShoulder.y) * 500;
  const ankleBalance = 100 - Math.abs(keyPoints.leftAnkle.x - keyPoints.rightAnkle.x) * 500;

  const avgBalance = (hipBalance + shoulderBalance + ankleBalance) / 3;
  return Math.max(0, Math.min(100, avgBalance));
}
