// ==========================================================================
// MTM2 • سامانه استعدادیابی تخصصی هندبال و آزمون‌های میدانی
// Version: 1.1.0 (Advanced Biomechanical Skeleton, Angles & Dimensions HUD)
// ==========================================================================

// Global State
let currentMode = 'anthro';
let detector = null;
let nativePose = null;
let videoEl = null;
let canvasEl = null;
let ctx = null;
let isModelReady = false;
let isDetecting = false;
let animFrameId = null;
let currentCamera = 'environment';
let isScaleLocked = false;
let cmPerPx = 0.38; // Default optical FOV scale estimation (cm per pixel)
let liveStatureSmoothed = 0;
let lastRawBodyHeightPx = 0;

// HUD Visual Overlays Toggles
let showSkeleton = true;
let showAngles = true;
let showDimensions = true;

// Athlete Profile State
let athlete = {
  name: 'علی رضایی',
  position: 'بغل',
  age: 16,
  weight: 68,
  height: 178,
  hand: 'راست',
  fatherHeight: 182,
  motherHeight: 167
};

// 10 Anthro Indicators State
let anthroData = {
  height: 178,
  sittingHeight: 92,
  cormicIndex: 51.7,
  wingspan: 184,
  apeIndex: 1.03,
  spanMinusHeight: 6,
  handSpan: 22.5,
  handLength: 19.8,
  ballSize: 'سایز ۲ (استاندارد IHF نوجوانان)',
  armLever: 74.2,
  biacromial: 41.5,
  trochanteric: 86,
  tibial: 42,
  cruralIndex: 82.5,
  bodyFatPct: 14.2,
  lbmKg: 58.3,
  phvAgeOffset: '+1.2 سال (پس از اوج رشد قدی)'
};

// 8 Kinematic Tests State (Separated Squat & Lunge, Added Standing Long Jump & Plank)
let testsData = {
  run5m: { time: 0, speed: 0, bestTime: null, state: 'ready', startX: null, finishX: null },
  jump: { reps: 0, maxHeight: 0, avgFlight: 0, contactTime: 0, power: 0, inAir: false, takeoffTime: 0, landingTime: 0 },
  longJump: { baselineX: null, distanceCm: 0, bestDist: 0, state: 'standing', prepAngle: 180 },
  plank: { timeSec: 0, isRunning: false, timerInterval: null, curAngle: 180, status: 'ready' },
  pushup: { reps: 0, state: 'up', curAngle: 180, minAngle: 180 },
  situp: { reps: 0, state: 'down', curAngle: 25 },
  squat: { reps: 0, state: 'up', curAngle: 180, isValgus: false },
  lunge: { reps: 0, state: 'up', frontKnee: 180, rearKnee: 180, torsoTilt: 0, stability: 'تراز' }
};

// Live Biomechanical Visual Settings (Matches Aventuz Academy Reference Images 2 & 3)
let visualSettings = {
  jointRadius: 4.5,            // Bolgrootte (2 to 10 px)
  lineWidth: 2.0,              // Lijndikte (1 to 6 px)
  showComplementAngle: false,  // Toon hoek aan de andere kant van het gewricht
  showTorsoBox: true,          // Torso & Pelvis Alignment Box
  elbowTarget: 90,             // Gewenste hoek elleboog
  elbowTolerance: 10,          // Delta-bereik elleboog
  armTrack: 'both',            // Beide / Links / Rechts
  kneeTarget: 90,              // Gewenste hoek knieën
  lungeRearTarget: 120         // Gewenste hoek knie achter
};

function loadVisualSettingsFromStorage() {
  try {
    const saved = localStorage.getItem('mtm2_visual_settings');
    if (saved) visualSettings = Object.assign(visualSettings, JSON.parse(saved));
  } catch(e) {}
}

function saveVisualSettingsToStorage() {
  localStorage.setItem('mtm2_visual_settings', JSON.stringify(visualSettings));
}

// Plank Timer Helper
function formatTimer(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// Last detected landmarks cache for smooth drawing
let lastLandmarks = null;
let lastDetectTime = 0;

// Initialize Application on Window Load
window.addEventListener('DOMContentLoaded', () => {
  videoEl = document.getElementById('video');
  canvasEl = document.getElementById('overlay');
  ctx = canvasEl.getContext('2d');

  loadAthleteFromStorage();
  loadVisualSettingsFromStorage();
  initUIEvents();
  initMobileTabs();
  initVisualToggles();

  // 1. Immediately start skeleton rendering loop so HUD and skeleton show in milliseconds!
  startDetectLoop();

  // 2. Asynchronously initialize camera and AI without blocking the UI
  setupCamera().catch(err => console.warn('Camera setup warning:', err));
  loadPoseModel().catch(err => console.warn('Pose model load warning:', err));
});

// Load / Save Athlete Profile
function loadAthleteFromStorage() {
  const saved = localStorage.getItem('mtm2_athlete');
  if (saved) {
    try {
      athlete = Object.assign(athlete, JSON.parse(saved));
      anthroData.height = athlete.height;
    } catch(e) {}
  }
  updateAthleteUI();
}

function saveAthleteToStorage() {
  localStorage.setItem('mtm2_athlete', JSON.stringify(athlete));
  updateAthleteUI();
}

function updateAthleteUI() {
  const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setTxt('hdrAthleteName', athlete.name);
  setTxt('cardAthleteName', athlete.name);
  setTxt('cardAthletePosition', athlete.position);
  setTxt('cardAthleteAge', athlete.age);
  setTxt('cardAthleteWeight', athlete.weight + ' kg');
  setTxt('cardAthleteHeight', athlete.height + ' cm');
  setTxt('cardAthleteHand', athlete.hand === 'left' ? 'چپ' : 'راست');
  setTxt('rptName', athlete.name);
  setTxt('rptPosition', athlete.position);
  setTxt('rptAgeWeight', `${athlete.age} سال / ${athlete.weight} kg`);
  setTxt('rptHand', athlete.hand === 'left' ? 'چپ' : 'راست');
  setTxt('btnCalibHeightVal', athlete.height);
}

let starterDismissed = false;

// Camera Setup with iOS Safari & Fallbacks
async function setupCamera() {
  const starter = document.getElementById('iosCameraStarter');
  const starterBtn = document.getElementById('btnIosStartCamera');
  const closeBtn = document.getElementById('btnCloseCameraModal');
  const uploadModalBtn = document.getElementById('btnModalUploadVideo');
  const simModalBtn = document.getElementById('btnModalEnterSimulation');

  if (starter && !starter._boundEvents) {
    starter._boundEvents = true;

    // Retry / Connect Camera
    starterBtn?.addEventListener('click', async () => {
      const btnText = document.getElementById('btnCameraText');
      if (btnText) btnText.textContent = 'در حال جستجوی وب‌کم...';
      const success = await requestCameraStream(true);
      if (btnText) {
        btnText.textContent = success ? 'دوربین متصل شد' : 'تلاش مجدد برای اتصال دوربین';
      }
    });

    // Close Modal
    closeBtn?.addEventListener('click', () => {
      starterDismissed = true;
      starter.style.display = 'none';
    });

    // Upload Video
    uploadModalBtn?.addEventListener('click', () => {
      starterDismissed = true;
      starter.style.display = 'none';
      document.getElementById('videoFileInput')?.click();
    });

    // Enter Simulation
    simModalBtn?.addEventListener('click', () => {
      starterDismissed = true;
      starter.style.display = 'none';
    });
  }

  await requestCameraStream(false);
}

async function requestCameraStream(isExplicitUserClick = false) {
  const starter = document.getElementById('iosCameraStarter');
  const statusMsg = document.getElementById('cameraStatusMsg');
  const title = document.getElementById('cameraModalTitle');
  const icon = document.getElementById('cameraModalIcon');

  const constraintsList = [
    { video: { facingMode: currentCamera, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
    { video: { facingMode: currentCamera }, audio: false },
    { video: { facingMode: 'user' }, audio: false },
    { video: true, audio: false }
  ];

  let stream = null;
  for (const c of constraintsList) {
    try {
      stream = await navigator.mediaDevices.getUserMedia(c);
      if (stream) break;
    } catch (err) {
      console.warn('Camera constraint try failed:', c, err);
    }
  }

  if (!stream) {
    console.warn('Camera permission not granted or stream unavailable.');
    if (!starterDismissed || isExplicitUserClick) {
      if (starter) starter.style.display = 'flex';
      if (statusMsg) {
        statusMsg.style.display = 'block';
        statusMsg.innerHTML = '⚠️ <strong>وب‌کم فعال یافت نشد یا دسترسی در مرورگر مجاز نشده است.</strong><br>در صورتی که وب‌کم خارجی یا نرم‌افزارهای مجازی مانند Iriun Webcam دارید، از فعال بودن آن اطمینان حاصل کرده یا روی دکمه ورود بدون دوربین کلیک فرمایید.';
      }
      if (title) title.textContent = 'عدم دسترسی به دوربین / وب‌کم';
      if (icon) icon.textContent = '⚠️';
    }
    return false;
  }

  // Camera stream successfully acquired
  starterDismissed = true;
  if (starter) starter.style.display = 'none';

  videoEl.srcObject = stream;
  videoEl.setAttribute('playsinline', '');
  videoEl.setAttribute('webkit-playsinline', '');
  videoEl.setAttribute('muted', '');
  videoEl.muted = true;

  try {
    await videoEl.play();
  } catch (err) {
    console.warn('Autoplay blocked:', err);
  }

  resizeCanvas();
  return true;
}

function resizeCanvas() {
  const stage = document.getElementById('cameraStage');
  const w = stage ? stage.clientWidth : (videoEl.videoWidth || window.innerWidth);
  const h = stage ? stage.clientHeight : (videoEl.videoHeight || window.innerHeight);
  if (w > 0 && h > 0 && (canvasEl.width !== w || canvasEl.height !== h)) {
    canvasEl.width = w;
    canvasEl.height = h;
  }
}
window.addEventListener('resize', resizeCanvas);

// UI AI Status Badge
function setAiStatus(status, text) {
  const dot = document.getElementById('aiStatusDot');
  const txt = document.getElementById('aiStatusText');
  if (!dot || !txt) return;

  txt.textContent = text;
  if (status === 'ready') {
    dot.style.background = '#22c55e';
    dot.style.boxShadow = '0 0 10px #22c55e';
  } else if (status === 'loading') {
    dot.style.background = '#eab308';
    dot.style.boxShadow = '0 0 10px #eab308';
  } else {
    dot.style.background = '#38bdf8';
    dot.style.boxShadow = '0 0 8px #38bdf8';
  }
}

// Load Pose Model with Multi-tier Resilience (Native MediaPipe Pose Lite + PoseDetection)
async function loadPoseModel() {
  setAiStatus('loading', 'راه‌اندازی موتور هوش مصنوعی...');

  // 1. Try Native MediaPipe Pose (Fastest, zero-overhead WebAssembly)
  if (typeof window.Pose !== 'undefined') {
    try {
      nativePose = new window.Pose({
        locateFile: (file) => `./vendor/mediapipe-pose/${file}`
      });

      // Ultra-fast Lite model (modelComplexity: 0) for zero-latency 60fps tracking
      nativePose.setOptions({
        modelComplexity: 0, // 0 = Lite (Loads in under 1 second, full 33 keypoints)
        smoothLandmarks: true,
        enableSegmentation: false,
        minDetectionConfidence: 0.4,
        minTrackingConfidence: 0.4
      });

      nativePose.onResults((results) => {
        if (results && results.poseLandmarks && results.poseLandmarks.length > 0) {
          lastLandmarks = results.poseLandmarks.map((pt, idx) => ({
            index: idx,
            x: pt.x * canvasEl.width,
            y: pt.y * canvasEl.height,
            z: pt.z,
            visibility: pt.visibility !== undefined ? pt.visibility : 1,
            score: pt.visibility !== undefined ? pt.visibility : 1
          }));
          lastDetectTime = performance.now();
          processFrameBiomechanics(lastLandmarks);
        }
      });

      // Pre-warm WebAssembly asynchronously
      if (typeof nativePose.initialize === 'function') {
        await nativePose.initialize();
      }

      isModelReady = true;
      setAiStatus('ready', 'هوش مصنوعی ۳۳ مفصل فعال (فوق‌سریع Lite)');
      console.log('⚡ Native MediaPipe Pose (Lite) Initialized in milliseconds');
      return;
    } catch (err) {
      console.warn('Native MediaPipe Pose failed, falling back to TF.js...', err);
    }
  }

  // 2. Try @tensorflow-models/pose-detection with Lite model
  const paths = [
    './vendor/mediapipe-pose',
    'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404'
  ];

  for (const p of paths) {
    try {
      if (typeof poseDetection !== 'undefined') {
        const model = poseDetection.SupportedModels.BlazePose;
        const detectorConfig = {
          runtime: 'mediapipe',
          solutionPath: p,
          modelType: 'lite' // Fast lite model
        };
        detector = await poseDetection.createDetector(model, detectorConfig);
        isModelReady = true;
        setAiStatus('ready', 'هوش مصنوعی فعال (BlazePose TF Lite)');
        console.log('✅ BlazePose Detector Loaded via:', p);
        return;
      }
    } catch (err) {
      console.warn('Failed loading detector from:', p, err);
    }
  }

  // If both failed to load weights, activate smart offline simulation
  isModelReady = false;
  setAiStatus('simulated', 'حالت بیومکانیک هوشمند (شبیه‌ساز الگو فعال)');
  console.log('ℹ️ Running in Smart Biomechanical Simulation Mode');
}

// Main Frame Processing & Rendering Loop
async function startDetectLoop() {
  isDetecting = true;

  async function loop() {
    if (!isDetecting) return;

    resizeCanvas();
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

    const hasVideo = videoEl && videoEl.readyState >= 2 && !videoEl.paused && !videoEl.ended;

    if (hasVideo && isModelReady) {
      try {
        if (nativePose) {
          await nativePose.send({ image: videoEl });
        } else if (detector) {
          const poses = await detector.estimatePoses(videoEl, { maxPoses: 1, flipHorizontal: false });
          if (poses && poses.length > 0) {
            lastLandmarks = poses[0].keypoints;
            lastDetectTime = performance.now();
            processFrameBiomechanics(lastLandmarks);
          }
        }
      } catch (err) {
        // Ignored frame error
      }
    }

    // Render Overlay
    const now = performance.now();
    const hasRecentDetection = lastLandmarks && (now - lastDetectTime < 1200);

    if (hasRecentDetection) {
      renderFullBiomechanicalOverlay(lastLandmarks);
    } else {
      // Smart pattern simulation so screen is NEVER empty without skeleton or dimensions!
      renderSmartPatternOverlay();
    }

    // Render Sprint gates if in run5m mode
    if (currentMode === 'run5m') {
      drawSprintGates();
    }

    animFrameId = requestAnimationFrame(loop);
  }
  loop();
}

// 33 Landmark Indices & Names standard mapping
const LM = {
  NOSE: 0,
  LEFT_EYE_INNER: 1, LEFT_EYE: 2, LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4, RIGHT_EYE: 5, RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7, RIGHT_EAR: 8,
  MOUTH_LEFT: 9, MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13, RIGHT_ELBOW: 14,
  LEFT_WRIST: 15, RIGHT_WRIST: 16,
  LEFT_PINKY: 17, RIGHT_PINKY: 18,
  LEFT_INDEX: 19, RIGHT_INDEX: 20,
  LEFT_THUMB: 21, RIGHT_THUMB: 22,
  LEFT_HIP: 23, RIGHT_HIP: 24,
  LEFT_KNEE: 25, RIGHT_KNEE: 26,
  LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
  LEFT_HEEL: 29, RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31, RIGHT_FOOT_INDEX: 32
};

// Full Skeleton Bone Connections
const BONE_CONNECTIONS = [
  // Head
  [LM.LEFT_EAR, LM.LEFT_EYE_OUTER], [LM.LEFT_EYE_OUTER, LM.LEFT_EYE], [LM.LEFT_EYE, LM.LEFT_EYE_INNER], [LM.LEFT_EYE_INNER, LM.NOSE],
  [LM.RIGHT_EAR, LM.RIGHT_EYE_OUTER], [LM.RIGHT_EYE_OUTER, LM.RIGHT_EYE], [LM.RIGHT_EYE, LM.RIGHT_EYE_INNER], [LM.RIGHT_EYE_INNER, LM.NOSE],
  [LM.MOUTH_LEFT, LM.MOUTH_RIGHT],

  // Shoulders & Spine
  [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER],
  [LM.LEFT_SHOULDER, LM.LEFT_HIP],
  [LM.RIGHT_SHOULDER, LM.RIGHT_HIP],
  [LM.LEFT_HIP, LM.RIGHT_HIP],

  // Left Arm
  [LM.LEFT_SHOULDER, LM.LEFT_ELBOW],
  [LM.LEFT_ELBOW, LM.LEFT_WRIST],
  [LM.LEFT_WRIST, LM.LEFT_PINKY],
  [LM.LEFT_WRIST, LM.LEFT_INDEX],
  [LM.LEFT_WRIST, LM.LEFT_THUMB],
  [LM.LEFT_PINKY, LM.LEFT_INDEX],

  // Right Arm
  [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW],
  [LM.RIGHT_ELBOW, LM.RIGHT_WRIST],
  [LM.RIGHT_WRIST, LM.RIGHT_PINKY],
  [LM.RIGHT_WRIST, LM.RIGHT_INDEX],
  [LM.RIGHT_WRIST, LM.RIGHT_THUMB],
  [LM.RIGHT_PINKY, LM.RIGHT_INDEX],

  // Left Leg
  [LM.LEFT_HIP, LM.LEFT_KNEE],
  [LM.LEFT_KNEE, LM.LEFT_ANKLE],
  [LM.LEFT_ANKLE, LM.LEFT_HEEL],
  [LM.LEFT_HEEL, LM.LEFT_FOOT_INDEX],
  [LM.LEFT_ANKLE, LM.LEFT_FOOT_INDEX],

  // Right Leg
  [LM.RIGHT_HIP, LM.RIGHT_KNEE],
  [LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
  [LM.RIGHT_ANKLE, LM.RIGHT_HEEL],
  [LM.RIGHT_HEEL, LM.RIGHT_FOOT_INDEX],
  [LM.RIGHT_ANKLE, LM.RIGHT_FOOT_INDEX]
];

// Biomechanics & Measurements per Mode
function processFrameBiomechanics(kp) {
  const getPt = (idx) => {
    if (!kp) return null;
    let p = kp[idx];
    if (!p && kp.find) {
      // Find by name if keypoints array from tfjs
      const names = Object.keys(LM);
      const name = names.find(k => LM[k] === idx)?.toLowerCase();
      if (name) p = kp.find(k => k.name === name);
    }
    if (p && (p.score === undefined || p.score > 0.25 || p.visibility > 0.25)) {
      return { x: p.x, y: p.y };
    }
    return null;
  };

  const nose = getPt(LM.NOSE);
  const lShoulder = getPt(LM.LEFT_SHOULDER);
  const rShoulder = getPt(LM.RIGHT_SHOULDER);
  const lElbow = getPt(LM.LEFT_ELBOW);
  const rElbow = getPt(LM.RIGHT_ELBOW);
  const lWrist = getPt(LM.LEFT_WRIST);
  const rWrist = getPt(LM.RIGHT_WRIST);
  const lHip = getPt(LM.LEFT_HIP);
  const rHip = getPt(LM.RIGHT_HIP);
  const lKnee = getPt(LM.LEFT_KNEE);
  const rKnee = getPt(LM.RIGHT_KNEE);
  const lAnkle = getPt(LM.LEFT_ANKLE);
  const rAnkle = getPt(LM.RIGHT_ANKLE);
  const lFoot = getPt(LM.LEFT_FOOT_INDEX) || lAnkle;
  const rFoot = getPt(LM.RIGHT_FOOT_INDEX) || rAnkle;

  // Stature calculation: Crown to Ground
  let crownY = null;
  let groundY = null;

  if (nose) {
    const shoulderY = (lShoulder && rShoulder) ? (lShoulder.y + rShoulder.y) / 2 : (lShoulder ? lShoulder.y : (rShoulder ? rShoulder.y : nose.y + 40));
    const headLen = Math.abs(shoulderY - nose.y);
    crownY = nose.y - (headLen > 15 ? headLen * 0.95 : 35);
  }

  const footPts = [lFoot, rFoot, lAnkle, rAnkle].filter(p => p !== null && p !== undefined);
  if (footPts.length > 0) {
    groundY = Math.max(...footPts.map(p => p.y)) + (lFoot || rFoot ? 5 : 15);
  }

  // 1. Anthropometry Mode: Real-time Live Stature from Video
  if (crownY !== null && groundY !== null) {
    const bodyHeightPx = Math.abs(groundY - crownY);
    lastRawBodyHeightPx = bodyHeightPx;

    if (bodyHeightPx > 70) {
      // Calculate real live stature from detected pixels
      const rawLiveHeight = bodyHeightPx * cmPerPx;

      // Exponential moving average filter for natural smoothing without lag
      if (!liveStatureSmoothed || Math.abs(rawLiveHeight - liveStatureSmoothed) > 40) {
        liveStatureSmoothed = rawLiveHeight;
      } else {
        liveStatureSmoothed = (liveStatureSmoothed * 0.82) + (rawLiveHeight * 0.18);
      }

      const calcHeight = Math.round(liveStatureSmoothed * 10) / 10;
      if (calcHeight >= 70 && calcHeight <= 250) {
        anthroData.height = calcHeight;
      }
    }
  }

  if (currentMode === 'anthro') {
    // 2. Sitting Height / Upper Body
    const midHipY = (lHip && rHip) ? (lHip.y + rHip.y) / 2 : (lHip ? lHip.y : (rHip ? rHip.y : null));
    if (crownY !== null && midHipY !== null) {
      const trunkPx = Math.abs(midHipY - crownY);
      const calcSitting = Math.round(trunkPx * cmPerPx * 10) / 10;
      if (calcSitting > 35 && calcSitting < 140) {
        anthroData.sittingHeight = calcSitting;
        anthroData.cormicIndex = Math.round((calcSitting / Math.max(1, anthroData.height)) * 1000) / 10;
      }
    }

    // 3. Lower Body / Leg Length
    if (midHipY !== null && groundY !== null) {
      const legPx = Math.abs(groundY - midHipY);
      const calcLeg = Math.round(legPx * cmPerPx * 10) / 10;
      if (calcLeg > 35 && calcLeg < 140) {
        anthroData.trochanteric = calcLeg;
      }
    }

    // 4. Biacromial / Shoulder Width
    if (lShoulder && rShoulder) {
      const sWidth = Math.round(Math.abs(lShoulder.x - rShoulder.x) * cmPerPx * 10) / 10;
      if (sWidth > 20 && sWidth < 65) anthroData.biacromial = sWidth;
    }

    // 5. Wingspan / Arm Span
    const lHand = getPt(LM.LEFT_INDEX) || lWrist;
    const rHand = getPt(LM.RIGHT_INDEX) || rWrist;
    if (lHand && rHand) {
      const spanPx = Math.hypot(lHand.x - rHand.x, lHand.y - rHand.y);
      let calcSpan = Math.round(spanPx * cmPerPx);
      // Account for hands if only wrists detected
      if (!getPt(LM.LEFT_INDEX)) calcSpan += 14;

      if (calcSpan > 90 && calcSpan < 250) {
        anthroData.wingspan = calcSpan;
        anthroData.spanMinusHeight = Math.round(calcSpan - anthroData.height);
        anthroData.apeIndex = Math.round((calcSpan / anthroData.height) * 100) / 100;
      }
    }

    // 6. Arm Lever
    const activeArm = (rShoulder && rElbow && rWrist) ? { s: rShoulder, e: rElbow, w: rWrist } :
                      ((lShoulder && lElbow && lWrist) ? { s: lShoulder, e: lElbow, w: lWrist } : null);
    if (activeArm) {
      const arm = Math.hypot(activeArm.s.x - activeArm.e.x, activeArm.s.y - activeArm.e.y) * cmPerPx;
      const forearm = Math.hypot(activeArm.e.x - activeArm.w.x, activeArm.e.y - activeArm.w.y) * cmPerPx;
      anthroData.armLever = Math.round((arm + forearm) * 10) / 10 || 74.2;
    }

    // 7. Hand span & Hand Length estimation
    anthroData.handSpan = Math.round((anthroData.height * 0.126) * 10) / 10;
    anthroData.handLength = Math.round((anthroData.height * 0.111) * 10) / 10;
    if (anthroData.handSpan >= 23.5) {
      anthroData.ballSize = 'سایز ۳ (بزرگسالان مرد IHF)';
    } else if (anthroData.handSpan >= 21.0) {
      anthroData.ballSize = 'سایز ۲ (نوجوانان و بانوان IHF)';
    } else {
      anthroData.ballSize = 'سایز ۱ (نونهالان IHF)';
    }

    updateAnthroPanelUI();
  }

  // 2. 5m Sprint Mode
  else if (currentMode === 'run5m') {
    const centerPoint = (lHip && rHip) ? (lHip.x + rHip.x) / 2 : (nose ? nose.x : null);
    if (centerPoint) {
      const gate1X = canvasEl.width * 0.25;
      const gate2X = canvasEl.width * 0.75;
      const now = performance.now();

      if (testsData.run5m.state === 'ready' && centerPoint > gate1X) {
        testsData.run5m.state = 'running';
        testsData.run5m.startTime = now;
      } else if (testsData.run5m.state === 'running') {
        const elapsed = (now - testsData.run5m.startTime) / 1000;
        testsData.run5m.time = elapsed;
        const timeEl = document.getElementById('valRunTime');
        if (timeEl) timeEl.textContent = elapsed.toFixed(2) + 's';
        if (centerPoint > gate2X) {
          testsData.run5m.state = 'finished';
          testsData.run5m.speed = Math.round((5.0 / elapsed) * 10) / 10;
          const speedEl = document.getElementById('valRunSpeed');
          const gateEl = document.getElementById('valRunGateStatus');
          if (speedEl) speedEl.textContent = testsData.run5m.speed + ' m/s';
          if (gateEl) gateEl.textContent = 'پایان رکورد ۵ متر ثبت شد';
        }
      }
    }
  }

  // 3. Repeated Jump (Bosco) Mode
  else if (currentMode === 'jump') {
    if (lAnkle && rAnkle) {
      const curAnkleY = (lAnkle.y + rAnkle.y) / 2;
      if (!testsData.jump.baselineY) testsData.jump.baselineY = curAnkleY;

      const diff = testsData.jump.baselineY - curAnkleY;
      const now = performance.now();

      if (diff > 35 && !testsData.jump.inAir) {
        testsData.jump.inAir = true;
        testsData.jump.takeoffTime = now;
        if (testsData.jump.landingTime) {
          testsData.jump.contactTime = Math.round(now - testsData.jump.landingTime);
          const ctEl = document.getElementById('valJumpContactTime');
          if (ctEl) ctEl.textContent = testsData.jump.contactTime + ' ms';
        }
      } else if (diff <= 15 && testsData.jump.inAir) {
        testsData.jump.inAir = false;
        testsData.jump.landingTime = now;
        const flightTime = now - testsData.jump.takeoffTime;
        testsData.jump.reps++;
        const heightCm = Math.round((9.81 * Math.pow(flightTime / 1000, 2) / 8) * 1000) / 10;
        if (heightCm > testsData.jump.maxHeight) testsData.jump.maxHeight = heightCm;
        testsData.jump.avgFlight = Math.round(flightTime);

        const tfSec = flightTime / 1000;
        const tcSec = (testsData.jump.contactTime || 220) / 1000;
        testsData.jump.power = Math.round((96.2 * tfSec * (tfSec + tcSec) / (4 * tcSec)) * 10) / 10;

        const setV = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        setV('valJumpReps', testsData.jump.reps);
        setV('valJumpMaxHeight', testsData.jump.maxHeight + ' cm');
        setV('valJumpAvgFlight', testsData.jump.avgFlight + ' ms');
        setV('valJumpPower', testsData.jump.power + ' W/kg');
      }
    }
  }

  // 4. Standing Long Jump Mode (پرش طول درجا)
  else if (currentMode === 'longJump') {
    const lAk = lAnkle, rAk = rAnkle;
    const lKn = lKnee, rKn = rKnee;
    const lHp = lHip, rHp = rHip;
    if (lAk && rAk) {
      const curX = (lAk.x + rAk.x) / 2;
      const kneePt = lKn || rKn;
      const hipPt = lHp || rHp;
      const prepAngle = (kneePt && hipPt) ? Math.round(calcAngle(hipPt, kneePt, lAk || rAk)) : 180;
      testsData.longJump.prepAngle = prepAngle;

      const angleEl = document.getElementById('valLongJumpAngle');
      if (angleEl) angleEl.textContent = prepAngle + '°';

      if (testsData.longJump.baselineX === null) {
        testsData.longJump.baselineX = curX;
      }

      const deltaPx = Math.abs(curX - testsData.longJump.baselineX);
      const distCm = Math.round(deltaPx * cmPerPx * 10) / 10;
      testsData.longJump.distanceCm = distCm;

      const phaseEl = document.getElementById('valLongJumpPhase');
      const distEl = document.getElementById('valLongJumpDist');
      const bestEl = document.getElementById('valLongJumpBest');

      if (distEl) distEl.textContent = distCm.toFixed(1) + ' cm';

      if (prepAngle < 125 && testsData.longJump.state === 'standing') {
        testsData.longJump.state = 'prep';
        if (phaseEl) phaseEl.textContent = 'آماده‌سازی جهش (فلکشن زانوها)';
      } else if (deltaPx > 35 && testsData.longJump.state === 'prep') {
        testsData.longJump.state = 'flight';
        if (phaseEl) phaseEl.textContent = 'فاز پرواز و امتداد بدن';
      } else if (testsData.longJump.state === 'flight' && deltaPx > 40) {
        testsData.longJump.state = 'landed';
        if (distCm > testsData.longJump.bestDist) {
          testsData.longJump.bestDist = distCm;
        }
        if (phaseEl) phaseEl.textContent = 'فرود موفق و تثبیت رکورد';
        if (bestEl) bestEl.textContent = testsData.longJump.bestDist.toFixed(1) + ' cm';
      }
    }
  }

  // 5. Plank Endurance Mode (آزمون استقامت پلانک)
  else if (currentMode === 'plank') {
    const shPt = rShoulder || lShoulder;
    const hpPt = rHip || lHip;
    const akPt = rAnkle || lAnkle;
    if (shPt && hpPt && akPt) {
      const angle = Math.round(calcAngle(shPt, hpPt, akPt));
      testsData.plank.curAngle = angle;
      const angleEl = document.getElementById('valPlankAngle');
      if (angleEl) angleEl.textContent = angle + '°';

      const statusEl = document.getElementById('valPlankStatus');
      if (statusEl) {
        if (angle >= 165 && angle <= 192) {
          statusEl.textContent = 'تراز عالی ستون فقرات و تنه (پلانک استاندارد)';
          statusEl.style.color = '#4ade80';
          testsData.plank.status = 'good';
        } else if (angle < 165) {
          statusEl.textContent = 'افتادگی لگن (Sagging) - باسن را بالا بیاورید';
          statusEl.style.color = '#f87171';
          testsData.plank.status = 'sagging';
        } else {
          statusEl.textContent = 'بالا بردن بیش از حد لگن (Piking) - باسن را پایین بیاورید';
          statusEl.style.color = '#fbbf24';
          testsData.plank.status = 'piking';
        }
      }
    }
  }

  // 6. Push-up Mode (شنا سوئدی)
  else if (currentMode === 'pushup') {
    const elbowPt = rElbow || lElbow;
    const shoulderPt = rShoulder || lShoulder;
    const wristPt = rWrist || lWrist;
    if (elbowPt && shoulderPt && wristPt) {
      const angle = calcAngle(shoulderPt, elbowPt, wristPt);
      testsData.pushup.curAngle = Math.round(angle);
      const angleEl = document.getElementById('valPushupAngle');
      if (angleEl) angleEl.textContent = testsData.pushup.curAngle + '°';

      const statusEl = document.getElementById('valPushupDepthState');
      if (testsData.pushup.state === 'up' && angle < (visualSettings.elbowTarget + 2)) {
        testsData.pushup.state = 'down';
        if (statusEl) statusEl.textContent = 'عمق استاندارد آرنج ثبت شد';
      } else if (testsData.pushup.state === 'down' && angle > 155) {
        testsData.pushup.state = 'up';
        testsData.pushup.reps++;
        const repsEl = document.getElementById('valPushupReps');
        if (repsEl) repsEl.textContent = testsData.pushup.reps;
        if (statusEl) statusEl.textContent = 'تکرار کامل و صحیح';
      }
    }
  }

  // 7. Sit-up Mode (درازنشست)
  else if (currentMode === 'situp') {
    const hipPt = rHip || lHip;
    const shoulderPt = rShoulder || lShoulder;
    const kneePt = rKnee || lKnee;
    if (hipPt && shoulderPt && kneePt) {
      const angle = calcAngle(shoulderPt, hipPt, kneePt);
      testsData.situp.curAngle = Math.round(angle);
      const angleEl = document.getElementById('valSitupAngle');
      if (angleEl) angleEl.textContent = testsData.situp.curAngle + '°';

      const phaseEl = document.getElementById('valSitupPhase');
      if (testsData.situp.state === 'down' && angle > 68) {
        testsData.situp.state = 'up';
        testsData.situp.reps++;
        const repsEl = document.getElementById('valSitupReps');
        if (repsEl) repsEl.textContent = testsData.situp.reps;
        if (phaseEl) phaseEl.textContent = 'صعود کامل تنه';
      } else if (testsData.situp.state === 'up' && angle < 38) {
        testsData.situp.state = 'down';
        if (phaseEl) phaseEl.textContent = 'فرود به پشت';
      }
    }
  }

  // 8. Deep Squat Mode (اسکات عمیق تخصصی)
  else if (currentMode === 'squat') {
    const hipPt = rHip || lHip;
    const kneePt = rKnee || lKnee;
    const anklePt = rAnkle || lAnkle;
    if (hipPt && kneePt && anklePt) {
      const angle = calcAngle(hipPt, kneePt, anklePt);
      testsData.squat.curAngle = Math.round(angle);
      const angleEl = document.getElementById('valSquatAngle');
      if (angleEl) angleEl.textContent = testsData.squat.curAngle + '°';

      const depthEl = document.getElementById('valSquatDepthStatus');
      const valgusEl = document.getElementById('valSquatValgusStatus');

      // Knee Valgus Check (Inward deviation)
      const expectedKneeX = (hipPt.x + anklePt.x) / 2;
      const valgusOffset = Math.abs(kneePt.x - expectedKneeX);
      if (valgusOffset > 22) {
        testsData.squat.isValgus = true;
        if (valgusEl) {
          valgusEl.textContent = 'هشدار انحراف والگوس زانو (ریسک ACL)';
          valgusEl.style.color = '#f87171';
        }
      } else {
        testsData.squat.isValgus = false;
        if (valgusEl) {
          valgusEl.textContent = 'تراز استاندارد زانو با پنجه پا';
          valgusEl.style.color = '#38bdf8';
        }
      }

      // Repetition Counting with Target Knee Angle
      const target = visualSettings.kneeTarget || 90;
      if (testsData.squat.state === 'up' && angle <= target + 5) {
        testsData.squat.state = 'down';
        if (depthEl) {
          depthEl.textContent = `عمق استاندارد اسکات (${target}°) تأیید شد`;
          depthEl.style.color = '#4ade80';
        }
      } else if (testsData.squat.state === 'down' && angle >= 155) {
        testsData.squat.state = 'up';
        testsData.squat.reps++;
        const repsEl = document.getElementById('valSquatReps');
        if (repsEl) repsEl.textContent = testsData.squat.reps;
        if (depthEl) {
          depthEl.textContent = 'ایستادن کامل';
          depthEl.style.color = '#94a3b8';
        }
      }
    }
  }

  // 9. Lunge Analysis Mode (آزمون تخصصی لانژ - کاملاً مطابق تصویر ۱ کاربر)
  else if (currentMode === 'lunge') {
    const lKn = lKnee, rKn = rKnee;
    const lHp = lHip, rHp = rHip;
    const lAk = lAnkle, rAk = rAnkle;

    if (lKn && rKn && lHp && rHp && lAk && rAk) {
      const angL = calcAngle(lHp, lKn, lAk);
      const angR = calcAngle(rHp, rKn, rAk);

      // Determine Front Knee (smaller bend angle) vs Rear Knee
      const frontKnee = Math.round(Math.min(angL, angR));
      const rearKnee = Math.round(Math.max(angL, angR));
      testsData.lunge.frontKnee = frontKnee;
      testsData.lunge.rearKnee = rearKnee;

      const fEl = document.getElementById('valLungeFrontKnee');
      const rEl = document.getElementById('valLungeRearKnee');
      if (fEl) fEl.textContent = frontKnee + '°';
      if (rEl) rEl.textContent = rearKnee + '°';

      // Torso Alignment relative to vertical (Mid-Shoulder to Mid-Hip)
      const mShX = ((lShoulder?.x || 0) + (rShoulder?.x || 0)) / 2;
      const mShY = ((lShoulder?.y || 0) + (rShoulder?.y || 0)) / 2;
      const mHpX = (lHp.x + rHp.x) / 2;
      const mHpY = (lHp.y + rHp.y) / 2;
      const torsoRad = Math.atan2(Math.abs(mShX - mHpX), Math.max(1, Math.abs(mHpY - mShY)));
      const torsoDeg = Math.round(torsoRad * (180 / Math.PI));
      testsData.lunge.torsoTilt = torsoDeg;

      const torsoEl = document.getElementById('valLungeTorso');
      if (torsoEl) {
        torsoEl.textContent = `${torsoDeg}° (${torsoDeg <= 10 ? 'عمودی و مستقیم' : 'شیب‌دار'})`;
        torsoEl.style.color = torsoDeg <= 10 ? '#4ade80' : '#fbbf24';
      }

      // Repetition logic: front knee reaches target (90°) and rear knee ~120°
      const fTarget = visualSettings.kneeTarget || 90;
      const rTarget = visualSettings.lungeRearTarget || 120;
      if (testsData.lunge.state === 'up' && frontKnee <= fTarget + 10 && rearKnee <= rTarget + 15) {
        testsData.lunge.state = 'down';
      } else if (testsData.lunge.state === 'down' && frontKnee >= 150 && rearKnee >= 150) {
        testsData.lunge.state = 'up';
        testsData.lunge.reps++;
        const repsEl = document.getElementById('valLungeReps');
        if (repsEl) repsEl.textContent = testsData.lunge.reps;
      }
    }
  }
}

// Calculate angle between three 2D points (A-B-C) with vertex B
function calcAngle(A, B, C) {
  if (!A || !B || !C) return 180;
  const rad = Math.atan2(C.y - B.y, C.x - B.x) - Math.atan2(A.y - B.y, A.x - B.x);
  let deg = Math.abs(rad * (180.0 / Math.PI));
  if (deg > 180.0) deg = 360.0 - deg;
  return deg;
}

// ==========================================================================
// RENDERING ENGINE: Skeleton, Joint Angles & 4 Biometric Dimensions HUD
// ==========================================================================

function renderFullBiomechanicalOverlay(kp) {
  ctx.save();

  // Helper to extract point
  const getPt = (idx) => {
    let p = kp[idx];
    if (!p && kp.find) {
      const names = Object.keys(LM);
      const name = names.find(k => LM[k] === idx)?.toLowerCase();
      if (name) p = kp.find(k => k.name === name);
    }
    if (p && (p.score === undefined || p.score > 0.25 || p.visibility > 0.25)) {
      return { x: p.x, y: p.y };
    }
    return null;
  };

  // 1. Draw Torso Alignment Box (Matches Screenshot 1 Green Torso Box)
  if (showSkeleton && visualSettings.showTorsoBox) {
    const lSh = getPt(LM.LEFT_SHOULDER), rSh = getPt(LM.RIGHT_SHOULDER);
    const lHp = getPt(LM.LEFT_HIP), rHp = getPt(LM.RIGHT_HIP);
    if (lSh && rSh && lHp && rHp) {
      ctx.save();
      // Outer Torso Box
      ctx.beginPath();
      ctx.moveTo(lSh.x, lSh.y);
      ctx.lineTo(rSh.x, rSh.y);
      ctx.lineTo(rHp.x, rHp.y);
      ctx.lineTo(lHp.x, lHp.y);
      ctx.closePath();
      ctx.fillStyle = 'rgba(16, 185, 129, 0.08)';
      ctx.fill();
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = Math.max(1.5, visualSettings.lineWidth * 1.1);
      ctx.stroke();

      // Dashed vertical torso alignment guides
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(52, 211, 153, 0.45)';
      ctx.lineWidth = 1.2;

      ctx.beginPath();
      const p1Top = { x: lSh.x + (rSh.x - lSh.x) * 0.33, y: lSh.y + (rSh.y - lSh.y) * 0.33 };
      const p1Bot = { x: lHp.x + (rHp.x - lHp.x) * 0.33, y: lHp.y + (rHp.y - lHp.y) * 0.33 };
      ctx.moveTo(p1Top.x, p1Top.y);
      ctx.lineTo(p1Bot.x, p1Bot.y);

      const p2Top = { x: lSh.x + (rSh.x - lSh.x) * 0.67, y: lSh.y + (rSh.y - lSh.y) * 0.67 };
      const p2Bot = { x: lHp.x + (rHp.x - lHp.x) * 0.67, y: lHp.y + (rHp.y - lHp.y) * 0.67 };
      ctx.moveTo(p2Top.x, p2Top.y);
      ctx.lineTo(p2Bot.x, p2Bot.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  // 2. Draw Skeleton Bones with Visual Settings Line Width and Segment Colors
  if (showSkeleton) {
    ctx.lineWidth = visualSettings.lineWidth || 2.0;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    BONE_CONNECTIONS.forEach(([i1, i2]) => {
      const p1 = getPt(i1);
      const p2 = getPt(i2);
      if (p1 && p2) {
        // Color-code segments matching modern biomechanics HUD
        let strokeColor = '#38bdf8';
        if (i1 >= LM.LEFT_SHOULDER && i2 <= LM.LEFT_THUMB) {
          strokeColor = '#f59e0b'; // Left arm: Gold/Amber
        } else if (i1 >= LM.RIGHT_SHOULDER && i2 <= LM.RIGHT_THUMB) {
          strokeColor = '#f43f5e'; // Right arm: Coral/Rose
        } else if (i1 >= LM.LEFT_HIP && i2 <= LM.LEFT_FOOT_INDEX) {
          strokeColor = '#10b981'; // Left leg: Emerald
        } else if (i1 >= LM.RIGHT_HIP && i2 <= LM.RIGHT_FOOT_INDEX) {
          strokeColor = '#f43f5e'; // Right leg: Coral/Rose
        } else if (i1 <= LM.MOUTH_RIGHT) {
          strokeColor = '#94a3b8'; // Face
        }

        ctx.beginPath();
        ctx.strokeStyle = strokeColor;
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    });

    // 3. Draw Clean Landmark Joint Nodes (White Solid Dots with Dark Border - Bolgrootte)
    const dotR = visualSettings.jointRadius || 4.5;
    for (let i = 0; i <= 32; i++) {
      const pt = getPt(i);
      if (pt) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, dotR, 0, 2 * Math.PI);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.stroke();
      }
    }
  }

  // 4. Draw Joint Angles Overlay (Clean Badges, Leader Lines & Indicator Arcs)
  if (showAngles) {
    drawLiveJointAngles(getPt);
  }

  // 5. Draw 4 Biometric Dimensions: Total Stature, Sitting Height, Leg Length, Wingspan
  if (showDimensions) {
    drawLiveBiometricDimensions(getPt);
  }

  ctx.restore();
}

// Draw Angles for Key Joints matching Aventuz Academy Screenshots
function drawLiveJointAngles(getPt) {
  const lSh = getPt(LM.LEFT_SHOULDER), rSh = getPt(LM.RIGHT_SHOULDER);
  const lEl = getPt(LM.LEFT_ELBOW), rEl = getPt(LM.RIGHT_ELBOW);
  const lWr = getPt(LM.LEFT_WRIST), rWr = getPt(LM.RIGHT_WRIST);
  const lHp = getPt(LM.LEFT_HIP), rHp = getPt(LM.RIGHT_HIP);
  const lKn = getPt(LM.LEFT_KNEE), rKn = getPt(LM.RIGHT_KNEE);
  const lAk = getPt(LM.LEFT_ANKLE), rAk = getPt(LM.RIGHT_ANKLE);
  const nose = getPt(LM.NOSE);

  // 1. Head / Neck Tilt Badge (e.g. 8° or 6°)
  if (nose && (lSh || rSh)) {
    const midShX = ((lSh?.x || 0) + (rSh?.x || 0)) / ((lSh ? 1 : 0) + (rSh ? 1 : 0));
    const midShY = ((lSh?.y || 0) + (rSh?.y || 0)) / ((lSh ? 1 : 0) + (rSh ? 1 : 0));
    const headTilt = Math.abs(Math.round(Math.atan2(nose.x - midShX, midShY - nose.y) * 180 / Math.PI));
    drawAngleBadge({ x: nose.x, y: nose.y - 12 }, headTilt, 0, -26, '#38bdf8');
  }

  // 2. Torso / Pelvic Tilt Badge (e.g. 3° or 5°)
  if (lHp && rHp) {
    const pelvicTilt = Math.abs(Math.round(Math.atan2(rHp.y - lHp.y, rHp.x - lHp.x) * 180 / Math.PI));
    const midHp = { x: (lHp.x + rHp.x) / 2, y: (lHp.y + rHp.y) / 2 };
    drawAngleBadge(midHp, pelvicTilt, 0, -18, '#34d399');
  }

  // 3. Right Elbow (Angle & Arc)
  if ((visualSettings.armTrack === 'both' || visualSettings.armTrack === 'right') && rSh && rEl && rWr) {
    const rElbowAngle = calcAngle(rSh, rEl, rWr);
    drawJointArc(rEl, rSh, rWr);
    drawAngleBadge(rEl, rElbowAngle, -46, -14, '#f43f5e');
  }

  // 4. Left Elbow (Angle & Arc)
  if ((visualSettings.armTrack === 'both' || visualSettings.armTrack === 'left') && lSh && lEl && lWr) {
    const lElbowAngle = calcAngle(lSh, lEl, lWr);
    drawJointArc(lEl, lSh, lWr);
    drawAngleBadge(lEl, lElbowAngle, 46, -14, '#f59e0b');
  }

  // 5. Right Knee (Angle & Arc)
  if (rHp && rKn && rAk) {
    const rKneeAngle = calcAngle(rHp, rKn, rAk);
    drawJointArc(rKn, rHp, rAk);
    drawAngleBadge(rKn, rKneeAngle, -48, -10, '#f43f5e');
  }

  // 6. Left Knee (Angle & Arc)
  if (lHp && lKn && lAk) {
    const lKneeAngle = calcAngle(lHp, lKn, lAk);
    drawJointArc(lKn, lHp, lAk);
    drawAngleBadge(lKn, lKneeAngle, 48, -10, '#10b981');
  }

  // 7. Right Ankle
  const rFoot = getPt(LM.RIGHT_FOOT_INDEX) || rAk;
  if (rKn && rAk && rFoot) {
    const rAnkleAngle = calcAngle(rKn, rAk, rFoot);
    drawJointArc(rAk, rKn, rFoot, 12);
    drawAngleBadge(rAk, rAnkleAngle, 42, -10, '#94a3b8');
  }

  // 8. Left Ankle
  const lFoot = getPt(LM.LEFT_FOOT_INDEX) || lAk;
  if (lKn && lAk && lFoot) {
    const lAnkleAngle = calcAngle(lKn, lAk, lFoot);
    drawJointArc(lAk, lKn, lFoot, 12);
    drawAngleBadge(lAk, lAnkleAngle, -42, -10, '#94a3b8');
  }
}

// Draw Arc around joint vertex with circular indicator dot
function drawJointArc(v, p1, p2, radius = 16) {
  if (!v || !p1 || !p2) return;
  const a1 = Math.atan2(p1.y - v.y, p1.x - v.x);
  const a2 = Math.atan2(p2.y - v.y, p2.x - v.x);

  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
  ctx.lineWidth = 1.4;
  ctx.arc(v.x, v.y, radius, a1, a2, false);
  ctx.stroke();

  // White indicator ring on the arc
  const midAngle = (a1 + a2) / 2;
  const ix = v.x + Math.cos(midAngle) * radius;
  const iy = v.y + Math.sin(midAngle) * radius;
  ctx.beginPath();
  ctx.arc(ix, iy, 2.8, 0, 2 * Math.PI);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.stroke();
  ctx.restore();
}

// Draw Dark Glass Capsule Badge with Crisp Bold Degree & Leader Line
function drawAngleBadge(v, angleDeg, leaderDx = 35, leaderDy = -15, badgeColor = null) {
  if (!v) return;

  const rawAngle = Math.round(angleDeg);
  const displayDeg = visualSettings.showComplementAngle ? Math.round(360 - rawAngle) : rawAngle;
  const text = `${displayDeg}°`;

  ctx.save();
  ctx.font = 'bold 12.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const tw = ctx.measureText(text).width;
  const bw = Math.max(38, Math.round(tw + 14));
  const bh = 22;

  let bx = v.x + leaderDx;
  let by = v.y + leaderDy;

  // Keep badge within canvas
  bx = Math.max(6, Math.min(canvasEl.width - bw - 6, bx));
  by = Math.max(12, Math.min(canvasEl.height - bh - 6, by));

  // 1. Leader Line
  ctx.beginPath();
  ctx.moveTo(v.x, v.y);
  const attachX = bx > v.x ? bx : bx + bw;
  const attachY = by + bh / 2;
  ctx.lineTo(attachX, attachY);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // 2. Dark glass capsule badge
  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 6);
  ctx.fill();

  // 3. Subtle border
  ctx.strokeStyle = badgeColor || 'rgba(255, 255, 255, 0.32)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // 4. Crisp White Bold Degree
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + bw / 2, by + bh / 2 + 0.5);

  ctx.restore();
}

// Draw the 4 Key Biometric Dimensions requested by user:
// 1. Total Stature (قد کل)
// 2. Upper Body / Sitting Height (قد بالاتنه)
// 3. Lower Body / Leg Length (قد پایین‌تنه)
// 4. Wingspan / Arm Span (طول دو دست)
function drawLiveBiometricDimensions(getPt) {
  const nose = getPt(LM.NOSE);
  const lShoulder = getPt(LM.LEFT_SHOULDER);
  const rShoulder = getPt(LM.RIGHT_SHOULDER);
  const lHip = getPt(LM.LEFT_HIP);
  const rHip = getPt(LM.RIGHT_HIP);
  const lAnkle = getPt(LM.LEFT_ANKLE);
  const rAnkle = getPt(LM.RIGHT_ANKLE);
  const lFoot = getPt(LM.LEFT_FOOT_INDEX) || lAnkle;
  const rFoot = getPt(LM.RIGHT_FOOT_INDEX) || rAnkle;
  const lHand = getPt(LM.LEFT_INDEX) || getPt(LM.LEFT_WRIST);
  const rHand = getPt(LM.RIGHT_INDEX) || getPt(LM.RIGHT_WRIST);

  // Compute key Y levels
  let crownY = null;
  if (nose) {
    const shY = (lShoulder && rShoulder) ? (lShoulder.y + rShoulder.y) / 2 : nose.y + 40;
    crownY = nose.y - Math.abs(shY - nose.y) * 0.9;
  } else if (lShoulder || rShoulder) {
    crownY = (lShoulder ? lShoulder.y : rShoulder.y) - 50;
  }

  const hipY = (lHip && rHip) ? (lHip.y + rHip.y) / 2 : (lHip ? lHip.y : (rHip ? rHip.y : null));
  const groundY = (lFoot && rFoot) ? Math.max(lFoot.y, rFoot.y) : (lFoot ? lFoot.y : (rFoot ? rFoot.y : (lAnkle ? lAnkle.y + 15 : null)));

  // Bounding box for bracket placement
  const allX = [lShoulder, rShoulder, lHip, rHip, lAnkle, rAnkle].filter(Boolean).map(p => p.x);
  const minX = allX.length > 0 ? Math.min(...allX) : canvasEl.width * 0.3;
  const maxX = allX.length > 0 ? Math.max(...allX) : canvasEl.width * 0.7;

  // Bracket X positions
  const rightBracketX = Math.min(canvasEl.width - 25, maxX + 45);
  const leftBracketX = Math.max(25, minX - 45);

  ctx.save();

  // 1. Total Stature Dimension Line (Right Side)
  if (crownY !== null && groundY !== null) {
    drawDimensionBracketVertical(
      rightBracketX,
      crownY,
      groundY,
      `📏 قد کل: ${anthroData.height} cm`,
      '#38bdf8',
      'right'
    );
  }

  // 2. Upper Body / Sitting Height (Left Side, Top Segment)
  if (crownY !== null && hipY !== null) {
    drawDimensionBracketVertical(
      leftBracketX,
      crownY,
      hipY,
      `📐 بالاتنه: ${anthroData.sittingHeight} cm (${anthroData.cormicIndex}%)`,
      '#facc15',
      'left'
    );
  }

  // 3. Lower Body / Leg Length (Left Side, Bottom Segment)
  if (hipY !== null && groundY !== null) {
    drawDimensionBracketVertical(
      leftBracketX,
      hipY,
      groundY,
      `🦵 پایین‌تنه: ${anthroData.trochanteric} cm`,
      '#4ade80',
      'left'
    );
  }

  // 4. Wingspan Dimension Line (Horizontal Between Hands)
  if (lHand && rHand) {
    drawDimensionBracketHorizontal(
      lHand.x,
      rHand.x,
      Math.min(lHand.y, rHand.y) - 25,
      `↔️ طول دو دست: ${anthroData.wingspan} cm (شاخص میمونی: ${anthroData.apeIndex} | تفاضل: +${anthroData.spanMinusHeight}cm)`,
      '#a855f7'
    );
  }

  ctx.restore();
}

// Vertical Dimension Bracket with extension ticks & centered callout box
function drawDimensionBracketVertical(x, yTop, yBottom, label, color, align) {
  if (Math.abs(yBottom - yTop) < 20) return;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);

  // Main vertical line
  ctx.beginPath();
  ctx.moveTo(x, yTop);
  ctx.lineTo(x, yBottom);
  ctx.stroke();

  // Horizontal ticks at top and bottom
  ctx.setLineDash([]);
  const tickLen = 14;
  const tickDir = align === 'right' ? -1 : 1;
  ctx.beginPath();
  ctx.moveTo(x, yTop);
  ctx.lineTo(x + tickDir * tickLen, yTop);
  ctx.moveTo(x, yBottom);
  ctx.lineTo(x + tickDir * tickLen, yBottom);
  ctx.stroke();

  // Arrowheads
  drawArrowHead(x, yTop, 0, 1, color);
  drawArrowHead(x, yBottom, 0, -1, color);

  // Callout Box
  const midY = (yTop + yBottom) / 2;
  const boxX = align === 'right' ? x + 10 : x - 10;

  ctx.font = 'bold 11px Tahoma, sans-serif';
  const textWidth = ctx.measureText(label).width;
  const pad = 7;
  const boxW = textWidth + pad * 2;
  const boxH = 22;

  let drawBoxX = align === 'right' ? boxX : boxX - boxW;
  drawBoxX = Math.max(8, Math.min(canvasEl.width - boxW - 8, drawBoxX));

  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  ctx.beginPath();
  ctx.roundRect(drawBoxX, midY - boxH / 2, boxW, boxH, 6);
  ctx.fill();

  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, drawBoxX + boxW / 2, midY);

  ctx.restore();
}

// Horizontal Dimension Bracket between hands
function drawDimensionBracketHorizontal(x1, x2, y, label, color) {
  const leftX = Math.min(x1, x2);
  const rightX = Math.max(x1, x2);
  if (Math.abs(rightX - leftX) < 30) return;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);

  // Main horizontal line
  ctx.beginPath();
  ctx.moveTo(leftX, y);
  ctx.lineTo(rightX, y);
  ctx.stroke();

  // Vertical ticks at ends
  ctx.setLineDash([]);
  const tickLen = 14;
  ctx.beginPath();
  ctx.moveTo(leftX, y - tickLen / 2);
  ctx.lineTo(leftX, y + tickLen / 2);
  ctx.moveTo(rightX, y - tickLen / 2);
  ctx.lineTo(rightX, y + tickLen / 2);
  ctx.stroke();

  // Arrowheads
  drawArrowHead(leftX, y, 1, 0, color);
  drawArrowHead(rightX, y, -1, 0, color);

  // Callout Box
  const midX = (leftX + rightX) / 2;
  ctx.font = 'bold 11px Tahoma, sans-serif';
  const textWidth = ctx.measureText(label).width;
  const pad = 8;
  const boxW = textWidth + pad * 2;
  const boxH = 22;

  const drawBoxX = Math.max(10, Math.min(canvasEl.width - boxW - 10, midX - boxW / 2));
  const drawBoxY = Math.max(25, y - 24);

  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  ctx.beginPath();
  ctx.roundRect(drawBoxX, drawBoxY, boxW, boxH, 6);
  ctx.fill();

  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, drawBoxX + boxW / 2, drawBoxY + boxH / 2);

  ctx.restore();
}

function drawArrowHead(x, y, dirX, dirY, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  const sz = 6;
  if (dirX !== 0) {
    ctx.moveTo(x, y);
    ctx.lineTo(x + dirX * sz, y - sz / 1.5);
    ctx.lineTo(x + dirX * sz, y + sz / 1.5);
  } else {
    ctx.moveTo(x, y);
    ctx.lineTo(x - sz / 1.5, y + dirY * sz);
    ctx.lineTo(x + sz / 1.5, y + dirY * sz);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// SMART BIOMECHANICAL PATTERN OVERLAY:
// If camera is starting or pose model is loading, renders a complete full skeleton,
// joints, angles, and all 4 dimensions so screen is NEVER empty!
function renderSmartPatternOverlay() {
  const w = canvasEl.width;
  const h = canvasEl.height;

  // Center figure coordinates
  const cx = w * 0.5;
  const cy = h * 0.48;
  const sc = Math.min(w, h) * 0.72;

  // Simulated anatomical keypoints
  const sim = {};
  sim[LM.NOSE] = { x: cx, y: cy - sc * 0.44 };
  sim[LM.LEFT_EYE] = { x: cx - sc * 0.03, y: cy - sc * 0.46 };
  sim[LM.RIGHT_EYE] = { x: cx + sc * 0.03, y: cy - sc * 0.46 };
  sim[LM.LEFT_EAR] = { x: cx - sc * 0.07, y: cy - sc * 0.45 };
  sim[LM.RIGHT_EAR] = { x: cx + sc * 0.07, y: cy - sc * 0.45 };

  sim[LM.LEFT_SHOULDER] = { x: cx - sc * 0.16, y: cy - sc * 0.30 };
  sim[LM.RIGHT_SHOULDER] = { x: cx + sc * 0.16, y: cy - sc * 0.30 };

  sim[LM.LEFT_ELBOW] = { x: cx - sc * 0.28, y: cy - sc * 0.18 };
  sim[LM.RIGHT_ELBOW] = { x: cx + sc * 0.28, y: cy - sc * 0.18 };

  sim[LM.LEFT_WRIST] = { x: cx - sc * 0.38, y: cy - sc * 0.10 };
  sim[LM.RIGHT_WRIST] = { x: cx + sc * 0.38, y: cy - sc * 0.10 };

  sim[LM.LEFT_INDEX] = { x: cx - sc * 0.42, y: cy - sc * 0.08 };
  sim[LM.RIGHT_INDEX] = { x: cx + sc * 0.42, y: cy - sc * 0.08 };

  sim[LM.LEFT_HIP] = { x: cx - sc * 0.11, y: cy + sc * 0.02 };
  sim[LM.RIGHT_HIP] = { x: cx + sc * 0.11, y: cy + sc * 0.02 };

  sim[LM.LEFT_KNEE] = { x: cx - sc * 0.13, y: cy + sc * 0.25 };
  sim[LM.RIGHT_KNEE] = { x: cx + sc * 0.13, y: cy + sc * 0.25 };

  sim[LM.LEFT_ANKLE] = { x: cx - sc * 0.14, y: cy + sc * 0.46 };
  sim[LM.RIGHT_ANKLE] = { x: cx + sc * 0.14, y: cy + sc * 0.46 };

  sim[LM.LEFT_FOOT_INDEX] = { x: cx - sc * 0.18, y: cy + sc * 0.48 };
  sim[LM.RIGHT_FOOT_INDEX] = { x: cx + sc * 0.18, y: cy + sc * 0.48 };

  renderFullBiomechanicalOverlay(sim);

  // Top Helper Badge
  ctx.save();
  ctx.font = 'bold 12px Tahoma, sans-serif';
  const msg = '🎯 الگوی بیومکانیک و ابعاد فعال است • شخص را روبروی دوربین قرار دهید';
  const tw = ctx.measureText(msg).width;
  const bw = tw + 24;
  const bx = (w - bw) / 2;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.beginPath();
  ctx.roundRect(bx, 14, bw, 28, 8);
  ctx.fill();
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#38bdf8';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(msg, w / 2, 28);
  ctx.restore();
}

function drawSprintGates() {
  ctx.save();
  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(canvasEl.width * 0.25, 0);
  ctx.lineTo(canvasEl.width * 0.25, canvasEl.height);
  ctx.moveTo(canvasEl.width * 0.75, 0);
  ctx.lineTo(canvasEl.width * 0.75, canvasEl.height);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.fillRect(canvasEl.width * 0.25 - 35, 12, 70, 24);
  ctx.fillRect(canvasEl.width * 0.75 - 45, 12, 90, 24);
  ctx.fillStyle = '#4ade80';
  ctx.font = 'bold 11px Tahoma';
  ctx.textAlign = 'center';
  ctx.fillText('🏁 شروع ۰m', canvasEl.width * 0.25, 28);
  ctx.fillText('🎯 پایان ۵m', canvasEl.width * 0.75, 28);
  ctx.restore();
}

// Update Anthro Panel UI
function updateAnthroPanelUI() {
  const setV = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setV('valAnthroHeight', anthroData.height + ' cm');
  setV('valAnthroSitting', anthroData.sittingHeight + ' cm (' + anthroData.cormicIndex + '%)');
  setV('valAnthroWingspan', anthroData.wingspan + ' cm');
  setV('valAnthroApe', anthroData.apeIndex + ' (تفاضل +' + anthroData.spanMinusHeight + 'cm)');
  setV('valAnthroHandSpan', anthroData.handSpan + ' cm');
  setV('valAnthroBallSize', anthroData.ballSize);
  setV('valAnthroHandLength', anthroData.handLength + ' cm');
  setV('valAnthroArmLever', anthroData.armLever + ' cm');
  setV('valAnthroShoulder', anthroData.biacromial + ' cm');
  setV('valAnthroLeg', anthroData.trochanteric + ' / ' + anthroData.tibial + ' cm');
}

// Visual HUD Toggles Handler
function initVisualToggles() {
  const skelBtn = document.getElementById('toggleSkeleton');
  const angleBtn = document.getElementById('toggleAngles');
  const dimBtn = document.getElementById('toggleDimensions');

  skelBtn?.addEventListener('click', () => {
    showSkeleton = !showSkeleton;
    skelBtn.style.opacity = showSkeleton ? '1' : '0.5';
    skelBtn.querySelector('span:last-child').textContent = showSkeleton ? 'اسکلت: فعال' : 'اسکلت: خاموش';
  });

  angleBtn?.addEventListener('click', () => {
    showAngles = !showAngles;
    angleBtn.style.opacity = showAngles ? '1' : '0.5';
    angleBtn.querySelector('span:last-child').textContent = showAngles ? 'زاویه‌ها: فعال' : 'زاویه‌ها: خاموش';
  });

  dimBtn?.addEventListener('click', () => {
    showDimensions = !showDimensions;
    dimBtn.style.opacity = showDimensions ? '1' : '0.5';
    dimBtn.querySelector('span:last-child').textContent = showDimensions ? 'قد و ابعاد: فعال' : 'قد و ابعاد: خاموش';
  });
}

// UI Event Handlers
function initUIEvents() {
  // Mode switcher
  const modePills = document.querySelectorAll('.mode-pill');
  modePills.forEach(pill => {
    pill.addEventListener('click', () => {
      modePills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentMode = pill.getAttribute('data-mode');

      // Update Panel View
      document.querySelectorAll('.mode-view').forEach(v => v.style.display = 'none');
      const viewMap = {
        anthro: 'viewAnthro',
        run5m: 'viewRun5m',
        jump: 'viewJump',
        longJump: 'viewLongJump',
        plank: 'viewPlank',
        pushup: 'viewPushup',
        situp: 'viewSitup',
        squat: 'viewSquat',
        lunge: 'viewLunge'
      };
      const titleMap = {
        anthro: '📐 ۱۰ شاخص پیکرسنجی هندبال',
        run5m: '⚡ آزمون شتاب و دوی ۵ متر',
        jump: '🦘 آزمون پرش متوالی بوسکو (Ergojump)',
        longJump: '🚀 آزمون پرش طول درجا (Standing Long Jump)',
        plank: '🧘 آزمون استقامت تنه و عضلات کور (Plank)',
        pushup: '💪 آزمون استقامت بالاتنه شنا سوئدی',
        situp: '🤸 آزمون قدرت مرکز تنه درازنشست',
        squat: '🦵 آزمون کینماتیک اسکات عمیق (Deep Squat)',
        lunge: '🚶‍♂️ آزمون تخصصی لانژ (Lunge Analysis)'
      };
      const targetView = document.getElementById(viewMap[currentMode]);
      if (targetView) targetView.style.display = 'block';
      const pTitle = document.getElementById('panelTitleText');
      if (pTitle) pTitle.textContent = titleMap[currentMode];
    });
  });

  // Standing Long Jump Handlers
  document.getElementById('btnLongJumpReset')?.addEventListener('click', () => {
    testsData.longJump.baselineX = null;
    testsData.longJump.distanceCm = 0;
    testsData.longJump.state = 'standing';
    const distEl = document.getElementById('valLongJumpDist');
    const phaseEl = document.getElementById('valLongJumpPhase');
    if (distEl) distEl.textContent = '0.0 cm';
    if (phaseEl) phaseEl.textContent = 'مبدا جدید کالیبره شد • آماده جهش';
  });
  document.getElementById('btnLongJumpSave')?.addEventListener('click', () => {
    const dist = testsData.longJump.bestDist || testsData.longJump.distanceCm || 0;
    alert(`✅ رکورد پرش طول درجا: ${dist} cm برای ${athlete.name} ثبت گردید.`);
  });

  // Plank Endurance Test Handlers
  document.getElementById('btnPlankStartPause')?.addEventListener('click', () => {
    testsData.plank.isRunning = !testsData.plank.isRunning;
    const btn = document.getElementById('btnPlankStartPause');
    if (testsData.plank.isRunning) {
      if (btn) btn.textContent = 'مکث تایمر';
      if (!testsData.plank.timerInterval) {
        testsData.plank.timerInterval = setInterval(() => {
          if (testsData.plank.isRunning) {
            testsData.plank.timeSec++;
            const timerEl = document.getElementById('valPlankTimer');
            if (timerEl) timerEl.textContent = formatTimer(testsData.plank.timeSec);
          }
        }, 1000);
      }
    } else {
      if (btn) btn.textContent = 'ادامه تایمر';
    }
  });
  document.getElementById('btnPlankReset')?.addEventListener('click', () => {
    testsData.plank.isRunning = false;
    if (testsData.plank.timerInterval) {
      clearInterval(testsData.plank.timerInterval);
      testsData.plank.timerInterval = null;
    }
    testsData.plank.timeSec = 0;
    const timerEl = document.getElementById('valPlankTimer');
    const btn = document.getElementById('btnPlankStartPause');
    if (timerEl) timerEl.textContent = '00:00';
    if (btn) btn.textContent = 'شروع / مکث تایمر';
  });
  document.getElementById('btnPlankSave')?.addEventListener('click', () => {
    alert(`✅ رکورد استقامت پلانک: ${formatTimer(testsData.plank.timeSec)} برای ${athlete.name} ثبت گردید.`);
  });

  // Deep Squat Handlers
  document.getElementById('btnSquatReset')?.addEventListener('click', () => {
    testsData.squat.reps = 0;
    const repsEl = document.getElementById('valSquatReps');
    if (repsEl) repsEl.textContent = '0';
  });
  document.getElementById('btnSquatSave')?.addEventListener('click', () => {
    alert(`✅ رکورد اسکات عمیق: ${testsData.squat.reps} تکرار برای ${athlete.name} ثبت گردید.`);
  });

  // Lunge Handlers
  document.getElementById('btnLungeReset')?.addEventListener('click', () => {
    testsData.lunge.reps = 0;
    const repsEl = document.getElementById('valLungeReps');
    if (repsEl) repsEl.textContent = '0';
  });
  document.getElementById('btnLungeSave')?.addEventListener('click', () => {
    alert(`✅ رکورد آزمون لانژ: ${testsData.lunge.reps} تکرار برای ${athlete.name} ثبت گردید.`);
  });

  // Visual Biomechanical Settings Modal (Matches Aventuz Images 2 & 3)
  const visualModal = document.getElementById('modalVisualSettings');
  const openVisualSettings = () => {
    const rInput = document.getElementById('inputJointRadius');
    const rLbl = document.getElementById('lblJointRadius');
    if (rInput) rInput.value = visualSettings.jointRadius;
    if (rLbl) rLbl.textContent = `${visualSettings.jointRadius} px`;

    const wInput = document.getElementById('inputLineWidth');
    const wLbl = document.getElementById('lblLineWidth');
    if (wInput) wInput.value = visualSettings.lineWidth;
    if (wLbl) wLbl.textContent = `${visualSettings.lineWidth} px`;

    const compChk = document.getElementById('chkComplementAngle');
    if (compChk) compChk.checked = !!visualSettings.showComplementAngle;

    const boxChk = document.getElementById('chkTorsoBox');
    if (boxChk) boxChk.checked = !!visualSettings.showTorsoBox;

    const elbInput = document.getElementById('inputElbowTarget');
    const elbLbl = document.getElementById('lblElbowTarget');
    if (elbInput) elbInput.value = visualSettings.elbowTarget;
    if (elbLbl) elbLbl.textContent = `${visualSettings.elbowTarget}° (تلرانس ±${visualSettings.elbowTolerance}°)`;

    const kneeInput = document.getElementById('inputKneeTarget');
    const kneeLbl = document.getElementById('lblKneeTarget');
    if (kneeInput) kneeInput.value = visualSettings.kneeTarget;
    if (kneeLbl) kneeLbl.textContent = `${visualSettings.kneeTarget}°`;

    const lungeInput = document.getElementById('inputLungeRearTarget');
    const lungeLbl = document.getElementById('lblLungeRearTarget');
    if (lungeInput) lungeInput.value = visualSettings.lungeRearTarget;
    if (lungeLbl) lungeLbl.textContent = `${visualSettings.lungeRearTarget}°`;

    document.querySelectorAll('.arm-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.arm === visualSettings.armTrack);
    });

    visualModal?.classList.add('active');
  };

  document.getElementById('btnOpenVisualControls')?.addEventListener('click', openVisualSettings);
  document.getElementById('btnCloseVisualSettings')?.addEventListener('click', () => visualModal?.classList.remove('active'));

  // Live slider events
  document.getElementById('inputJointRadius')?.addEventListener('input', (e) => {
    visualSettings.jointRadius = parseFloat(e.target.value);
    const lbl = document.getElementById('lblJointRadius');
    if (lbl) lbl.textContent = `${visualSettings.jointRadius} px`;
  });
  document.getElementById('inputLineWidth')?.addEventListener('input', (e) => {
    visualSettings.lineWidth = parseFloat(e.target.value);
    const lbl = document.getElementById('lblLineWidth');
    if (lbl) lbl.textContent = `${visualSettings.lineWidth} px`;
  });
  document.getElementById('chkComplementAngle')?.addEventListener('change', (e) => {
    visualSettings.showComplementAngle = e.target.checked;
  });
  document.getElementById('chkTorsoBox')?.addEventListener('change', (e) => {
    visualSettings.showTorsoBox = e.target.checked;
  });
  document.getElementById('inputElbowTarget')?.addEventListener('input', (e) => {
    visualSettings.elbowTarget = parseInt(e.target.value);
    const lbl = document.getElementById('lblElbowTarget');
    if (lbl) lbl.textContent = `${visualSettings.elbowTarget}° (تلرانس ±${visualSettings.elbowTolerance}°)`;
  });
  document.getElementById('inputKneeTarget')?.addEventListener('input', (e) => {
    visualSettings.kneeTarget = parseInt(e.target.value);
    const lbl = document.getElementById('lblKneeTarget');
    if (lbl) lbl.textContent = `${visualSettings.kneeTarget}°`;
  });
  document.getElementById('inputLungeRearTarget')?.addEventListener('input', (e) => {
    visualSettings.lungeRearTarget = parseInt(e.target.value);
    const lbl = document.getElementById('lblLungeRearTarget');
    if (lbl) lbl.textContent = `${visualSettings.lungeRearTarget}°`;
  });

  document.querySelectorAll('.arm-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.arm-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      visualSettings.armTrack = btn.dataset.arm;
    });
  });

  document.getElementById('btnApplyVisualSettings')?.addEventListener('click', () => {
    saveVisualSettingsToStorage();
    visualModal?.classList.remove('active');
  });

  // Stature Calibrate Button
  document.getElementById('btnCalibHeight')?.addEventListener('click', () => {
    if (lastRawBodyHeightPx > 60) {
      cmPerPx = athlete.height / lastRawBodyHeightPx;
      isScaleLocked = true;
      liveStatureSmoothed = athlete.height;
      anthroData.height = athlete.height;
      updateAnthroPanelUI();
      alert(`✅ مقیاس دوربین با قد مرجع ${athlete.height} cm کالیبره و قفل گردید.\nضریب مقیاس اپتیکال: ${cmPerPx.toFixed(4)} cm بر پیکسل\n\nاز این پس قد هر شخص جدید، خم شدن یا حرکت در تصویر و ویدیو به صورت زنده و بلادرنگ خوانده می‌شود.`);
    } else {
      alert(`⚠️ بدنی با قامت ایستاده در تصویر یا ویدیو تشخیص داده نشد.\nلطفاً روبروی دوربین بایستید یا یک ویدیوی آزمون پخش نمایید و سپس روی کالیبره کلیک کنید.`);
    }
  });

  // Video Upload
  const uploadBtn = document.getElementById('btnUploadVideo');
  const fileInput = document.getElementById('videoFileInput');
  uploadBtn?.addEventListener('click', () => fileInput.click());
  fileInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      liveStatureSmoothed = 0; // Reset live smoothing for the new video
      videoEl.srcObject = null;
      videoEl.src = URL.createObjectURL(file);
      videoEl.loop = true;
      videoEl.muted = true;
      videoEl.play();
      setAiStatus('ready', `در حال تحلیل ویدیوی آزمون: ${file.name}`);
    }
  });

  // Camera Switch
  document.getElementById('btnCamSwitch')?.addEventListener('click', async () => {
    currentCamera = currentCamera === 'environment' ? 'user' : 'environment';
    await setupCamera();
  });

  // Athlete Modal
  const athleteModal = document.getElementById('modalAthlete');
  document.getElementById('btnAthleteProfile')?.addEventListener('click', () => {
    document.getElementById('inputAthleteName').value = athlete.name;
    document.getElementById('inputAthletePosition').value = athlete.position;
    document.getElementById('inputAthleteAge').value = athlete.age;
    document.getElementById('inputAthleteWeight').value = athlete.weight;
    document.getElementById('inputAthleteHeight').value = athlete.height;
    document.getElementById('inputAthleteHand').value = athlete.hand;
    document.getElementById('inputFatherHeight').value = athlete.fatherHeight;
    document.getElementById('inputMotherHeight').value = athlete.motherHeight;
    athleteModal.classList.add('active');
  });
  document.getElementById('btnCloseAthleteModal')?.addEventListener('click', () => athleteModal.classList.remove('active'));
  document.getElementById('btnSaveAthleteProfile')?.addEventListener('click', () => {
    athlete.name = document.getElementById('inputAthleteName').value;
    athlete.position = document.getElementById('inputAthletePosition').value;
    athlete.age = Number(document.getElementById('inputAthleteAge').value);
    athlete.weight = Number(document.getElementById('inputAthleteWeight').value);
    athlete.height = Number(document.getElementById('inputAthleteHeight').value);
    anthroData.height = athlete.height;
    athlete.hand = document.getElementById('inputAthleteHand').value;
    athlete.fatherHeight = Number(document.getElementById('inputFatherHeight').value);
    athlete.motherHeight = Number(document.getElementById('inputMotherHeight').value);
    saveAthleteToStorage();
    athleteModal.classList.remove('active');
  });

  // Report Modal
  const reportModal = document.getElementById('modalReport');
  const openReport = () => {
    renderReportTables();
    reportModal?.classList.add('active');
  };
  document.getElementById('btnExportReport')?.addEventListener('click', openReport);
  document.getElementById('btnOpenReportModal')?.addEventListener('click', openReport);
  document.getElementById('btnCloseReportModal')?.addEventListener('click', () => reportModal?.classList.remove('active'));

  // Quick Athlete Edit from Quad 4
  document.getElementById('btnQuickEditAthlete')?.addEventListener('click', () => {
    document.getElementById('btnAthleteProfile')?.click();
  });

  // PDF & Excel Downloads
  document.getElementById('btnDownloadPdf')?.addEventListener('click', exportPdfReport);
  document.getElementById('btnDownloadPdfQuick')?.addEventListener('click', exportPdfReport);
  document.getElementById('btnDownloadExcel')?.addEventListener('click', exportExcelReport);
  document.getElementById('btnDownloadExcelQuick')?.addEventListener('click', exportExcelReport);
}

// Mobile 3-Way Tab Switcher Handler
function initMobileTabs() {
  const tabBtns = document.querySelectorAll('.mobile-tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const targetId = btn.getAttribute('data-target');
      ['quadAnthro', 'quadTests', 'quadAthleteReport'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          if (id === targetId) {
            el.classList.add('mobile-active');
            el.style.display = 'flex';
          } else {
            el.classList.remove('mobile-active');
            el.style.display = 'none';
          }
        }
      });
      resizeCanvas();
    });
  });
}

// Render Report Dynamic Tables
function renderReportTables() {
  const anthroRows = [
    { name: '۱. قد ایستاده (Stature)', val: `${anthroData.height} cm`, analysis: 'مناسب پست بغل و دفاع میانی', badge: 'عالی' },
    { name: '۲. ارتفاع نشسته (کورمیک)', val: `${anthroData.sittingHeight} cm (${anthroData.cormicIndex}%)`, analysis: 'پاهای کشیده مناسب گام‌برداری سریع', badge: 'ممتاز' },
    { name: '۳. گستره بازوها (Wingspan)', val: `${anthroData.wingspan} cm`, analysis: 'شعاع دفاعی مطلوب و پوشش خط شوت', badge: 'نخبه' },
    { name: '۴. شاخص میمونی (Ape Index)', val: `${anthroData.apeIndex} (+${anthroData.spanMinusHeight}cm)`, analysis: 'طول دست فراتر از قد (+۶cm)', badge: 'نخبه' },
    { name: '۵. گستره کف دست (Hand Span)', val: `${anthroData.handSpan} cm`, analysis: anthroData.ballSize, badge: 'استاندارد IHF' },
    { name: '۶. طول کف دست (Hand Length)', val: `${anthroData.handLength} cm`, analysis: 'کنترل کامل توپ در اسپین و مچ‌گیری', badge: 'عالی' },
    { name: '۷. اهرم پرتاب (بازو + ساعد)', val: `${anthroData.armLever} cm`, analysis: 'گشتاور شوت زاویه‌دار و شتاب دست', badge: 'عالی' },
    { name: '۸. پهنای شانه (Biacromial)', val: `${anthroData.biacromial} cm`, analysis: 'فریم بدنی پهن مناسب نبرد فیزیکی', badge: 'خوب' },
    { name: '۹. طول ساق و تروکانتریک', val: `${anthroData.trochanteric} cm / ${anthroData.tibial} cm`, analysis: 'پتانسیل پرش انفجاری گام ۳گانه', badge: 'ممتاز' },
    { name: '۱۰. درصد چربی و عضله (LBM)', val: `${anthroData.bodyFatPct}% (${anthroData.lbmKg} kg)`, analysis: 'آمادگی بی‌هوازی و نسبت عضله به چربی', badge: 'بهینه' }
  ];

  const tBodyAnthro = document.getElementById('rptAnthroTableBody');
  if (tBodyAnthro) {
    tBodyAnthro.innerHTML = anthroRows.map(r => `
      <tr style="text-align: center; border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 5px; border: 1px solid #cbd5e1; font-weight: bold; text-align: right;">${r.name}</td>
        <td style="padding: 5px; border: 1px solid #cbd5e1; color: #0284c7; font-weight: bold;">${r.val}</td>
        <td style="padding: 5px; border: 1px solid #cbd5e1;">${r.analysis}</td>
        <td style="padding: 5px; border: 1px solid #cbd5e1;"><span style="background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px; font-weight: bold;">${r.badge}</span></td>
      </tr>
    `).join('');
  }

  const testRows = [
    { name: 'دوی ۵ متر شتاب هندبال', record: `${testsData.run5m.time.toFixed(2)}s`, metric: `سرعت: ${testsData.run5m.speed} m/s`, rating: 'شتاب انفجاری عالی' },
    { name: 'پرش متوالی ارگوجامپ بوسکو', record: `${testsData.jump.reps} پرش (${testsData.jump.maxHeight}cm)`, metric: `توان: ${testsData.jump.power} W/kg`, rating: 'پتانسیل پرش ممتاز' },
    { name: 'پرش طول درجا (Standing Long Jump)', record: `${testsData.longJump.bestDist || testsData.longJump.distanceCm || 0} cm`, metric: `زاویه آماده‌سازی: ${testsData.longJump.prepAngle}°`, rating: 'انفجار عضلات پا ممتاز' },
    { name: 'استقامت تنه و پلانک (Plank)', record: `${formatTimer(testsData.plank.timeSec)}`, metric: `راستای تنه: ${testsData.plank.curAngle}°`, rating: testsData.plank.status === 'good' ? 'تراز ستون فقرات عالی' : 'نیاز به تقویت کور' },
    { name: 'شنا سوئدی (Push-up)', record: `${testsData.pushup.reps} تکرار`, metric: `زاویه آرنج: ${testsData.pushup.curAngle}°`, rating: 'استقامت کمربند شانه عالی' },
    { name: 'درازنشست (Sit-up)', record: `${testsData.situp.reps} تکرار`, metric: `دامنه حرکت: ${testsData.situp.curAngle}°`, rating: 'ثبات مرکز تنه مطلوب' },
    { name: 'اسکات عمیق (Deep Squat)', record: `${testsData.squat.reps} تکرار`, metric: `زاویه زانو: ${testsData.squat.curAngle}°`, rating: testsData.squat.isValgus ? 'هشدار والگوس' : 'تراز زانو و پنجه عالی' },
    { name: 'آزمون تخصصی لانژ (Lunge)', record: `${testsData.lunge.reps} تکرار`, metric: `جلویی: ${testsData.lunge.frontKnee}° / عقبی: ${testsData.lunge.rearKnee}°`, rating: 'هماهنگی و تقارن دوطرفه ممتاز' }
  ];

  const tBodyTests = document.getElementById('rptTestsTableBody');
  if (tBodyTests) {
    tBodyTests.innerHTML = testRows.map(r => `
      <tr style="text-align: center; border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 5px; border: 1px solid #cbd5e1; font-weight: bold; text-align: right;">${r.name}</td>
        <td style="padding: 5px; border: 1px solid #cbd5e1; color: #15803d; font-weight: bold;">${r.record}</td>
        <td style="padding: 5px; border: 1px solid #cbd5e1;">${r.metric}</td>
        <td style="padding: 5px; border: 1px solid #cbd5e1;"><span style="background: #dcfce7; color: #15803d; padding: 2px 6px; border-radius: 4px; font-weight: bold;">${r.rating}</span></td>
      </tr>
    `).join('');
  }
}

// PDF Export Function
async function exportPdfReport() {
  const printEl = document.getElementById('printArea');
  if (!printEl) return;

  try {
    const canvas = await html2canvas(printEl, { scale: 2, useCORS: true });
    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`کارنامه_استعدادیابی_هندبال_${athlete.name.replace(/\s+/g, '_')}.pdf`);
  } catch (err) {
    console.error('PDF export error:', err);
    window.print();
  }
}

// Excel / CSV Export Function
function exportExcelReport() {
  const bom = '\uFEFF';
  let csv = bom + 'بخش,شاخص یا نام آزمون,مقدار / رکورد,تحلیل و استاندارد هندبال,رتبه استعدادیابی\r\n';

  csv += `مشخصات,نام ورزشکار,${athlete.name},پست: ${athlete.position},سن: ${athlete.age}\r\n`;
  csv += `مشخصات,دست برتر,${athlete.hand},وزن: ${athlete.weight}kg,قد: ${athlete.height}cm\r\n`;

  csv += `پیکرسنجی,۱. قد ایستاده,${anthroData.height} cm,استاندارد هندبال,عالی\r\n`;
  csv += `پیکرسنجی,۲. ارتفاع نشسته,${anthroData.sittingHeight} cm,کورمیک ${anthroData.cormicIndex}%,ممتاز\r\n`;
  csv += `پیکرسنجی,۳. گستره بازوها,${anthroData.wingspan} cm,شعاع دفاعی مطلوب,نخبه\r\n`;
  csv += `پیکرسنجی,۴. شاخص میمونی,${anthroData.apeIndex},تفاضل +${anthroData.spanMinusHeight}cm,نخبه\r\n`;
  csv += `پیکرسنجی,۵. گستره کف دست,${anthroData.handSpan} cm,${anthroData.ballSize},استاندارد IHF\r\n`;
  csv += `پیکرسنجی,۶. طول کف دست,${anthroData.handLength} cm,اسپین و کنترل توپ,عالی\r\n`;
  csv += `پیکرسنجی,۷. اهرم پرتاب,${anthroData.armLever} cm,شتاب دست در پرتاب,عالی\r\n`;
  csv += `پیکرسنجی,۸. پهنای شانه,${anthroData.biacromial} cm,فریم بدنی پهن,خوب\r\n`;
  csv += `پیکرسنجی,۹. طول ساق و تروکانتر,${anthroData.trochanteric}/${anthroData.tibial} cm,شاخص کرورال ${anthroData.cruralIndex}%,ممتاز\r\n`;
  csv += `پیکرسنجی,۱۰. درصد چربی / LBM,${anthroData.bodyFatPct}% (${anthroData.lbmKg}kg),آمادگی بی‌هوازی,بهینه\r\n`;

  csv += `آزمون میدانی,دوی ۵ متر شتاب,${testsData.run5m.time.toFixed(2)}s,سرعت: ${testsData.run5m.speed} m/s,شتاب عالی\r\n`;
  csv += `آزمون میدانی,پرش متوالی ارگوجامپ,${testsData.jump.reps} پرش (${testsData.jump.maxHeight}cm),توان: ${testsData.jump.power} W/kg,پتانسیل پرش ممتاز\r\n`;
  csv += `آزمون میدانی,پرش طول درجا,${testsData.longJump.bestDist || testsData.longJump.distanceCm || 0} cm,انفجار عضلات پا,نخبه\r\n`;
  csv += `آزمون میدانی,استقامت تنه و پلانک,${formatTimer(testsData.plank.timeSec)},راستای تنه ${testsData.plank.curAngle}°,${testsData.plank.status === 'good' ? 'تراز عالی' : 'ثبات کور'}\r\n`;
  csv += `آزمون میدانی,شنا سوئدی,${testsData.pushup.reps} تکرار,عمق آرنج < ۹۰°,استقامت شانه عالی\r\n`;
  csv += `آزمون میدانی,درازنشست,${testsData.situp.reps} تکرار,دامنه ۷۰°,ثبات مرکز تنه مطلوب\r\n`;
  csv += `آزمون میدانی,اسکات عمیق,${testsData.squat.reps} تکرار,زاویه زانو ${testsData.squat.curAngle}°,${testsData.squat.isValgus ? 'والگوس' : 'تراز پنجه و زانو'}\r\n`;
  csv += `آزمون میدانی,آزمون تخصصی لانژ,${testsData.lunge.reps} تکرار,زانو جلو ${testsData.lunge.frontKnee}° / عقب ${testsData.lunge.rearKnee}°,تقارن حرکتی عالی\r\n`;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `گزارش_استعدادیابی_هندبال_${athlete.name.replace(/\s+/g, '_')}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Universal Draggable Panel Logic
function initDraggablePanel() {
  const panel = document.getElementById('mainTestPanel');
  const header = document.getElementById('panelDragHeader');
  const minBtn = document.getElementById('panelMinBtn');
  const opacBtn = document.getElementById('panelOpacityBtn');
  const resetBtn = document.getElementById('panelResetPosBtn');
  const dock = document.getElementById('restoreDock');
  const dockBtn = document.getElementById('dockRestoreBtn');

  if (!panel || !header) return;

  let isDragging = false;
  let startX = 0, startY = 0;
  let startLeft = 0, startTop = 0;

  header.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = panel.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;

    const onMove = (ev) => {
      if (!isDragging) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      panel.style.left = Math.max(10, Math.min(window.innerWidth - panel.offsetWidth - 10, startLeft + dx)) + 'px';
      panel.style.top = Math.max(10, Math.min(window.innerHeight - 50, startTop + dy)) + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    };

    const onUp = () => {
      isDragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // Touch support for mobile
  header.addEventListener('touchstart', (e) => {
    if (e.target.closest('button')) return;
    isDragging = true;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    const rect = panel.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;

    const onTouchMove = (ev) => {
      if (!isDragging) return;
      const dx = ev.touches[0].clientX - startX;
      const dy = ev.touches[0].clientY - startY;
      panel.style.left = Math.max(10, Math.min(window.innerWidth - panel.offsetWidth - 10, startLeft + dx)) + 'px';
      panel.style.top = Math.max(10, Math.min(window.innerHeight - 50, startTop + dy)) + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    };

    const onTouchEnd = () => {
      isDragging = false;
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };

    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
  }, { passive: false });

  // Minimize
  minBtn?.addEventListener('click', () => {
    const isMin = panel.classList.toggle('panel-minimized');
    minBtn.textContent = isMin ? '🗖' : '_';
    dock.style.display = isMin ? 'flex' : 'none';
  });

  dockBtn?.addEventListener('click', () => {
    panel.classList.remove('panel-minimized');
    minBtn.textContent = '_';
    dock.style.display = 'none';
    panel.style.top = '96px';
    panel.style.left = '14px';
  });

  // Opacity
  opacBtn?.addEventListener('click', () => {
    panel.style.opacity = panel.style.opacity === '0.5' ? '1' : '0.5';
  });

  // Reset
  resetBtn?.addEventListener('click', () => {
    panel.style.top = '96px';
    panel.style.left = '14px';
    panel.style.width = '';
    panel.style.height = '';
    panel.classList.remove('panel-minimized');
    minBtn.textContent = '_';
    dock.style.display = 'none';
  });
}
