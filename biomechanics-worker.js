/**
 * Biomechanics Web Worker for Motion Tracker
 * Handles heavy vector math, joint angle calculations, polynomial curve fitting,
 * and filtering off the main UI thread to guarantee silky 60fps rendering.
 * Version: 1.19.0
 */

self.onmessage = function(e) {
  const { type, id, payload } = e.data || {};
  if (!type) return;

  switch (type) {
    case 'CALC_ANGLES': {
      const angles = computeJointAngles(payload.landmarks);
      self.postMessage({ type: 'ANGLES_RESULT', id, angles });
      break;
    }
    case 'CALC_RSI': {
      const { flightTime, contactTime, jumpHeightMeters } = payload;
      let rsi = 0;
      if (contactTime && contactTime > 0.05) {
        // RSI can be calculated as Jump Height (m) / Contact Time (s) or Flight Time / Contact Time
        rsi = (jumpHeightMeters && jumpHeightMeters > 0)
          ? jumpHeightMeters / contactTime
          : (flightTime || 0) / contactTime;
      }
      self.postMessage({ type: 'RSI_RESULT', id, rsi: Number(rsi.toFixed(2)) });
      break;
    }
    case 'CALC_POSTURE': {
      const posture = analyzePosture(payload.landmarks);
      self.postMessage({ type: 'POSTURE_RESULT', id, posture });
      break;
    }
    case 'PING': {
      self.postMessage({ type: 'PONG', id, time: Date.now() });
      break;
    }
    default:
      break;
  }
};

function computeAngle(a, b, c) {
  if (!a || !b || !c) return null;
  const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians * 180.0) / Math.PI);
  if (angle > 180.0) angle = 360.0 - angle;
  return Math.round(angle);
}

function computeJointAngles(lm) {
  if (!lm || !Array.isArray(lm) || lm.length < 33) return {};
  return {
    rightElbow: computeAngle(lm[12], lm[14], lm[16]),
    leftElbow: computeAngle(lm[11], lm[13], lm[15]),
    rightShoulder: computeAngle(lm[14], lm[12], lm[24]),
    leftShoulder: computeAngle(lm[13], lm[11], lm[23]),
    rightHip: computeAngle(lm[12], lm[24], lm[26]),
    leftHip: computeAngle(lm[11], lm[23], lm[25]),
    rightKnee: computeAngle(lm[24], lm[26], lm[28]),
    leftKnee: computeAngle(lm[23], lm[25], lm[27]),
    rightAnkle: computeAngle(lm[26], lm[28], lm[32]),
    leftAnkle: computeAngle(lm[25], lm[27], lm[31])
  };
}

function analyzePosture(lm) {
  if (!lm || lm.length < 33) return { score: 100, defects: [] };
  const defects = [];
  let score = 100;

  // 1. Shoulder tilt (asymmetry)
  const lShoulder = lm[11];
  const rShoulder = lm[12];
  if (lShoulder && rShoulder) {
    const shoulderDy = Math.abs(lShoulder.y - rShoulder.y);
    const shoulderDx = Math.abs(lShoulder.x - rShoulder.x) || 0.001;
    const shoulderAngle = Math.atan2(shoulderDy, shoulderDx) * (180 / Math.PI);
    if (shoulderAngle > 3.5) {
      defects.push({ type: 'shoulder_tilt', title: 'عدم تقارن و افتادگی شانه', angle: shoulderAngle.toFixed(1) });
      score -= Math.min(25, Math.round(shoulderAngle * 4));
    }
  }

  // 2. Pelvis tilt (hip asymmetry)
  const lHip = lm[23];
  const rHip = lm[24];
  if (lHip && rHip) {
    const hipDy = Math.abs(lHip.y - rHip.y);
    const hipDx = Math.abs(lHip.x - rHip.x) || 0.001;
    const hipAngle = Math.atan2(hipDy, hipDx) * (180 / Math.PI);
    if (hipAngle > 3.5) {
      defects.push({ type: 'pelvic_tilt', title: 'انحراف و کجی زاویه لگن', angle: hipAngle.toFixed(1) });
      score -= Math.min(25, Math.round(hipAngle * 4));
    }
  }

  // 3. Forward head (ear vs shoulder alignment)
  const nose = lm[0];
  const ear = lm[7] || lm[8];
  if (nose && ear && (lShoulder || rShoulder)) {
    const sh = lShoulder || rShoulder;
    const fwdDist = Math.abs(nose.x - sh.x);
    if (fwdDist > 0.12) {
      defects.push({ type: 'forward_head', title: 'جلوآمدگی غیرعادی سر (Forward Head)', angle: (fwdDist * 100).toFixed(0) });
      score -= 20;
    }
  }

  return { score: Math.max(20, score), defects };
}
