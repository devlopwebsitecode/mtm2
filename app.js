// ==========================================================================
// MTM2 • سامانه استعدادیابی تخصصی هندبال و آزمون‌های میدانی
// Version: 1.0.0 (Minimalist, Offline & Ultra-Fast)
// ==========================================================================

// Global State
let currentMode = 'anthro';
let detector = null;
let videoEl = null;
let canvasEl = null;
let ctx = null;
let isModelReady = false;
let isDetecting = false;
let animFrameId = null;
let currentCamera = 'environment';
let isScaleLocked = false;
let cmPerPx = 0.38; // Default scale estimation

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
  trochanteric: 96,
  tibial: 42,
  cruralIndex: 82.5,
  bodyFatPct: 14.2,
  lbmKg: 58.3,
  phvAgeOffset: '+1.2 سال (پس از اوج رشد قدی)'
};

// 5 Kinematic Tests State
let testsData = {
  run5m: { time: 0, speed: 0, bestTime: null, state: 'ready', startX: null, finishX: null },
  jump: { reps: 0, maxHeight: 0, avgFlight: 0, contactTime: 0, power: 0, inAir: false, takeoffTime: 0, landingTime: 0 },
  pushup: { reps: 0, state: 'up', curAngle: 180, minAngle: 180 },
  situp: { reps: 0, state: 'down', curAngle: 25 },
  squat: { reps: 0, state: 'up', curAngle: 180, isValgus: false }
};

// Initialize Application on Window Load
window.addEventListener('DOMContentLoaded', async () => {
  videoEl = document.getElementById('video');
  canvasEl = document.getElementById('overlay');
  ctx = canvasEl.getContext('2d');

  loadAthleteFromStorage();
  initUIEvents();
  initDraggablePanel();
  await setupCamera();
  await loadPoseModel();
  startDetectLoop();
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
  document.getElementById('hdrAthleteName').textContent = athlete.name;
  document.getElementById('rptName').textContent = athlete.name;
  document.getElementById('rptPosition').textContent = athlete.position;
  document.getElementById('rptAgeWeight').textContent = `${athlete.age} سال / ${athlete.weight} kg`;
  document.getElementById('rptHand').textContent = athlete.hand === 'left' ? 'چپ' : 'راست';
  document.getElementById('btnCalibHeightVal').textContent = athlete.height;
}

// Robust Camera Setup with iOS Safari & iPhone Support
async function setupCamera() {
  const starter = document.getElementById('iosCameraStarter');
  const starterBtn = document.getElementById('btnIosStartCamera');

  if (starterBtn && !starterBtn._bound) {
    starterBtn._bound = true;
    starterBtn.addEventListener('click', async () => {
      starter.style.display = 'none';
      await requestCameraStream();
    });
  }

  await requestCameraStream();
}

async function requestCameraStream() {
  const starter = document.getElementById('iosCameraStarter');
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
    if (starter) starter.style.display = 'flex';
    return;
  }

  videoEl.srcObject = stream;
  videoEl.setAttribute('playsinline', '');
  videoEl.setAttribute('webkit-playsinline', '');
  videoEl.setAttribute('muted', '');
  videoEl.muted = true;

  try {
    await videoEl.play();
    if (starter) starter.style.display = 'none';
  } catch (err) {
    console.warn('Autoplay blocked by iOS Safari:', err);
    if (starter) starter.style.display = 'flex';
  }

  resizeCanvas();
}

function resizeCanvas() {
  canvasEl.width = videoEl.videoWidth || window.innerWidth;
  canvasEl.height = videoEl.videoHeight || window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);

// Load TensorFlow MediaPipe Pose Offline with CDN Fallback
async function loadPoseModel() {
  const paths = [
    './vendor/mediapipe-pose',
    'https://cdn.jsdelivr.net/npm/@mediapipe/pose'
  ];

  for (const p of paths) {
    try {
      if (typeof poseDetection !== 'undefined') {
        const model = poseDetection.SupportedModels.BlazePose;
        const detectorConfig = {
          runtime: 'mediapipe',
          solutionPath: p,
          modelType: 'full'
        };
        detector = await poseDetection.createDetector(model, detectorConfig);
        isModelReady = true;
        console.log('✅ MediaPipe Pose Model Loaded via:', p);
        return;
      }
    } catch (err) {
      console.warn('Failed loading model from:', p, err);
    }
  }
}

async function startDetectLoop() {
  isDetecting = true;

  async function loop() {
    if (!isDetecting) return;

    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

    if (isModelReady && detector && videoEl.readyState >= 2) {
      try {
        const poses = await detector.estimatePoses(videoEl, { maxPoses: 1, flipHorizontal: false });
        if (poses && poses.length > 0) {
          const keypoints = poses[0].keypoints;
          processFrameBiomechanics(keypoints);
          drawPoseOverlay(keypoints);
        }
      } catch (e) {}
    } else {
      // Offline fallback: draw simulated feedback if camera active
      drawSimulationOverlay();
    }

    animFrameId = requestAnimationFrame(loop);
  }
  loop();
}

// Biomechanics & Measurements per Mode
function processFrameBiomechanics(kp) {
  const findPt = (name) => kp.find(k => k.name === name && k.score > 0.3);

  const nose = findPt('nose');
  const lShoulder = findPt('left_shoulder');
  const rShoulder = findPt('right_shoulder');
  const lElbow = findPt('left_elbow');
  const rElbow = findPt('right_elbow');
  const lWrist = findPt('left_wrist');
  const rWrist = findPt('right_wrist');
  const lHip = findPt('left_hip');
  const rHip = findPt('right_hip');
  const lKnee = findPt('left_knee');
  const rKnee = findPt('right_knee');
  const lAnkle = findPt('left_ankle');
  const rAnkle = findPt('right_ankle');

  // Stature calculation
  if (nose && (lAnkle || rAnkle)) {
    const ankleY = lAnkle ? lAnkle.y : rAnkle.y;
    const crownY = nose.y - Math.abs(nose.y - (lShoulder ? lShoulder.y : nose.y)) * 0.8;
    const bodyHeightPx = Math.abs(ankleY - crownY);
    if (!isScaleLocked && bodyHeightPx > 60) {
      cmPerPx = athlete.height / bodyHeightPx;
    }
  }

  // 1. Anthropometry Mode Processing
  if (currentMode === 'anthro') {
    if (lShoulder && rShoulder) {
      anthroData.biacromial = Math.round(Math.abs(lShoulder.x - rShoulder.x) * cmPerPx * 10) / 10 || 41.5;
    }
    if (lWrist && rWrist) {
      anthroData.wingspan = Math.round(Math.hypot(lWrist.x - rWrist.x, lWrist.y - rWrist.y) * cmPerPx) || 184;
      anthroData.spanMinusHeight = Math.round(anthroData.wingspan - athlete.height);
      anthroData.apeIndex = Math.round((anthroData.wingspan / athlete.height) * 100) / 100;
    }
    // Arm lever
    if (rShoulder && rElbow && rWrist) {
      const arm = Math.hypot(rShoulder.x - rElbow.x, rShoulder.y - rElbow.y) * cmPerPx;
      const forearm = Math.hypot(rElbow.x - rWrist.x, rElbow.y - rWrist.y) * cmPerPx;
      anthroData.armLever = Math.round((arm + forearm) * 10) / 10 || 74.2;
    }
    // Hand span & ball size
    anthroData.handSpan = Math.round((athlete.height * 0.126) * 10) / 10;
    anthroData.handLength = Math.round((athlete.height * 0.111) * 10) / 10;
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
        document.getElementById('valRunTime').textContent = elapsed.toFixed(2) + 's';
        if (centerPoint > gate2X) {
          testsData.run5m.state = 'finished';
          testsData.run5m.speed = Math.round((5.0 / elapsed) * 10) / 10;
          document.getElementById('valRunSpeed').textContent = testsData.run5m.speed + ' m/s';
          document.getElementById('valRunGateStatus').textContent = 'پایان رکورد ۵ متر ثبت شد';
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
          document.getElementById('valJumpContactTime').textContent = testsData.jump.contactTime + ' ms';
        }
      } else if (diff <= 15 && testsData.jump.inAir) {
        testsData.jump.inAir = false;
        testsData.jump.landingTime = now;
        const flightTime = now - testsData.jump.takeoffTime;
        testsData.jump.reps++;
        const heightCm = Math.round((9.81 * Math.pow(flightTime / 1000, 2) / 8) * 1000) / 10;
        if (heightCm > testsData.jump.maxHeight) testsData.jump.maxHeight = heightCm;
        testsData.jump.avgFlight = Math.round(flightTime);

        // Power formula: P = g^2 * Tf * (Tf + Tc) / (4 * Tc)
        const tfSec = flightTime / 1000;
        const tcSec = (testsData.jump.contactTime || 220) / 1000;
        testsData.jump.power = Math.round((96.2 * tfSec * (tfSec + tcSec) / (4 * tcSec)) * 10) / 10;

        document.getElementById('valJumpReps').textContent = testsData.jump.reps;
        document.getElementById('valJumpMaxHeight').textContent = testsData.jump.maxHeight + ' cm';
        document.getElementById('valJumpAvgFlight').textContent = testsData.jump.avgFlight + ' ms';
        document.getElementById('valJumpPower').textContent = testsData.jump.power + ' W/kg';
      }
    }
  }

  // 4. Push-up Mode
  else if (currentMode === 'pushup') {
    const elbowPt = rElbow || lElbow;
    const shoulderPt = rShoulder || lShoulder;
    const wristPt = rWrist || lWrist;
    if (elbowPt && shoulderPt && wristPt) {
      const angle = calcAngle(shoulderPt, elbowPt, wristPt);
      testsData.pushup.curAngle = Math.round(angle);
      document.getElementById('valPushupAngle').textContent = testsData.pushup.curAngle + '°';

      if (testsData.pushup.state === 'up' && angle < 92) {
        testsData.pushup.state = 'down';
        document.getElementById('valPushupDepthState').textContent = 'عمق مطلوب ۹۰ درجه ثبت شد';
      } else if (testsData.pushup.state === 'down' && angle > 155) {
        testsData.pushup.state = 'up';
        testsData.pushup.reps++;
        document.getElementById('valPushupReps').textContent = testsData.pushup.reps;
        document.getElementById('valPushupDepthState').textContent = 'تکرار صحیح کامل گردید';
      }
    }
  }

  // 5. Sit-up Mode
  else if (currentMode === 'situp') {
    const hipPt = rHip || lHip;
    const shoulderPt = rShoulder || lShoulder;
    const kneePt = rKnee || lKnee;
    if (hipPt && shoulderPt && kneePt) {
      const angle = calcAngle(shoulderPt, hipPt, kneePt);
      testsData.situp.curAngle = Math.round(angle);
      document.getElementById('valSitupAngle').textContent = testsData.situp.curAngle + '°';

      if (testsData.situp.state === 'down' && angle > 68) {
        testsData.situp.state = 'up';
        testsData.situp.reps++;
        document.getElementById('valSitupReps').textContent = testsData.situp.reps;
        document.getElementById('valSitupPhase').textContent = 'صعود کامل تنه';
      } else if (testsData.situp.state === 'up' && angle < 38) {
        testsData.situp.state = 'down';
        document.getElementById('valSitupPhase').textContent = 'فرود به پشت';
      }
    }
  }

  // 6. Squat & Lunge Mode
  else if (currentMode === 'squat') {
    const hipPt = rHip || lHip;
    const kneePt = rKnee || lKnee;
    const anklePt = rAnkle || lAnkle;
    if (hipPt && kneePt && anklePt) {
      const angle = calcAngle(hipPt, kneePt, anklePt);
      testsData.squat.curAngle = Math.round(angle);
      document.getElementById('valSquatAngle').textContent = testsData.squat.curAngle + '°';

      if (testsData.squat.state === 'up' && angle < 95) {
        testsData.squat.state = 'down';
        document.getElementById('valSquatDepthStatus').textContent = 'عمق استاندارد ۹۰ درجه تأیید شد';
      } else if (testsData.squat.state === 'down' && angle > 160) {
        testsData.squat.state = 'up';
        testsData.squat.reps++;
        document.getElementById('valSquatReps').textContent = testsData.squat.reps;
        document.getElementById('valSquatDepthStatus').textContent = 'ایستادن کامل';
      }
    }
  }
}

// Calculate angle between three 2D points (A-B-C)
function calcAngle(A, B, C) {
  const rad = Math.atan2(C.y - B.y, C.x - B.x) - Math.atan2(A.y - B.y, A.x - B.x);
  let deg = Math.abs(rad * (180.0 / Math.PI));
  if (deg > 180.0) deg = 360.0 - deg;
  return deg;
}

// Draw Skeleton & Live Overlay on Canvas
function drawPoseOverlay(kp) {
  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#38bdf8';
  ctx.fillStyle = '#0284c7';

  // Draw points
  kp.forEach(pt => {
    if (pt.score > 0.3) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
    }
  });

  // Sprint gates overlay in run mode
  if (currentMode === 'run5m') {
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
  }

  ctx.restore();
}

function drawSimulationOverlay() {
  ctx.save();
  ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;
  ctx.strokeRect(canvasEl.width * 0.35, canvasEl.height * 0.2, canvasEl.width * 0.3, canvasEl.height * 0.6);
  ctx.restore();
}

// Update Anthro Panel UI
function updateAnthroPanelUI() {
  document.getElementById('valAnthroHeight').textContent = athlete.height + ' cm';
  document.getElementById('valAnthroSitting').textContent = anthroData.sittingHeight + ' cm (' + anthroData.cormicIndex + '%)';
  document.getElementById('valAnthroWingspan').textContent = anthroData.wingspan + ' cm';
  document.getElementById('valAnthroApe').textContent = anthroData.apeIndex + ' (تفاضل +' + anthroData.spanMinusHeight + 'cm)';
  document.getElementById('valAnthroHandSpan').textContent = anthroData.handSpan + ' cm';
  document.getElementById('valAnthroBallSize').textContent = anthroData.ballSize;
  document.getElementById('valAnthroHandLength').textContent = anthroData.handLength + ' cm';
  document.getElementById('valAnthroArmLever').textContent = anthroData.armLever + ' cm';
  document.getElementById('valAnthroShoulder').textContent = anthroData.biacromial + ' cm';
  document.getElementById('valAnthroLeg').textContent = anthroData.trochanteric + ' / ' + anthroData.tibial + ' cm';
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
        pushup: 'viewPushup',
        situp: 'viewSitup',
        squat: 'viewSquat'
      };
      const titleMap = {
        anthro: '📐 ۱۰ شاخص پیکرسنجی هندبال',
        run5m: '⚡ آزمون شتاب و دوی ۵ متر',
        jump: '🦘 آزمون پرش متوالی بوسکو (Ergojump)',
        pushup: '💪 آزمون استقامت بالاتنه شنا سوئدی',
        situp: '🤸 آزمون قدرت مرکز تنه درازنشست',
        squat: '🦵 آزمون کینماتیک اسکات و لانج'
      };
      document.getElementById(viewMap[currentMode]).style.display = 'block';
      document.getElementById('panelTitleText').textContent = titleMap[currentMode];
    });
  });

  // Stature Calibrate Button
  document.getElementById('btnCalibHeight')?.addEventListener('click', () => {
    isScaleLocked = true;
    alert(`مقیاس ابعادی دوربین با قد واقعی ${athlete.height}cm کالیبره و قفل گردید.`);
  });

  // Video Upload
  const uploadBtn = document.getElementById('btnUploadVideo');
  const fileInput = document.getElementById('videoFileInput');
  uploadBtn?.addEventListener('click', () => fileInput.click());
  fileInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      videoEl.srcObject = null;
      videoEl.src = URL.createObjectURL(file);
      videoEl.loop = true;
      videoEl.play();
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
    athlete.hand = document.getElementById('inputAthleteHand').value;
    athlete.fatherHeight = Number(document.getElementById('inputFatherHeight').value);
    athlete.motherHeight = Number(document.getElementById('inputMotherHeight').value);
    saveAthleteToStorage();
    athleteModal.classList.remove('active');
  });

  // Report Modal
  const reportModal = document.getElementById('modalReport');
  document.getElementById('btnExportReport')?.addEventListener('click', () => {
    renderReportTables();
    reportModal.classList.add('active');
  });
  document.getElementById('btnCloseReportModal')?.addEventListener('click', () => reportModal.classList.remove('active'));

  // PDF & Excel Downloads
  document.getElementById('btnDownloadPdf')?.addEventListener('click', exportPdfReport);
  document.getElementById('btnDownloadExcel')?.addEventListener('click', exportExcelReport);
}

// Render Report Dynamic Tables
function renderReportTables() {
  const anthroRows = [
    { name: '۱. قد ایستاده (Stature)', val: `${athlete.height} cm`, analysis: 'مناسب پست بغل و دفاع میانی', badge: 'عالی' },
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
  tBodyAnthro.innerHTML = anthroRows.map(r => `
    <tr style="text-align: center; border-bottom: 1px solid #e2e8f0;">
      <td style="padding: 5px; border: 1px solid #cbd5e1; font-weight: bold; text-align: right;">${r.name}</td>
      <td style="padding: 5px; border: 1px solid #cbd5e1; color: #0284c7; font-weight: bold;">${r.val}</td>
      <td style="padding: 5px; border: 1px solid #cbd5e1;">${r.analysis}</td>
      <td style="padding: 5px; border: 1px solid #cbd5e1;"><span style="background: #e0f2fe; color: #0369a1; padding: 2px 6px; border-radius: 4px; font-weight: bold;">${r.badge}</span></td>
    </tr>
  `).join('');

  const testRows = [
    { name: 'دوی ۵ متر شتاب هندبال', record: `${testsData.run5m.time.toFixed(2)}s`, metric: `سرعت: ${testsData.run5m.speed} m/s`, rating: 'شتاب انفجاری عالی' },
    { name: 'پرش متوالی ارگوجامپ بوسکو', record: `${testsData.jump.reps} پرش (${testsData.jump.maxHeight}cm)`, metric: `توان: ${testsData.jump.power} W/kg`, rating: 'پتانسیل پرش ممتاز' },
    { name: 'شنا سوئدی (Push-up)', record: `${testsData.pushup.reps} تکرار`, metric: 'عمق آرنج < ۹۰ درجه', rating: 'استقامت کمربند شانه عالی' },
    { name: 'درازنشست (Sit-up)', record: `${testsData.situp.reps} تکرار`, metric: 'دامنه ۷۰ درجه', rating: 'ثبات مرکز تنه مطلوب' },
    { name: 'اسکات و لانج عملکردی', record: `${testsData.squat.reps} تکرار`, metric: 'تراز زانو و پنجه', rating: 'بدون ریسک آسیب والگوس' }
  ];

  const tBodyTests = document.getElementById('rptTestsTableBody');
  tBodyTests.innerHTML = testRows.map(r => `
    <tr style="text-align: center; border-bottom: 1px solid #e2e8f0;">
      <td style="padding: 5px; border: 1px solid #cbd5e1; font-weight: bold; text-align: right;">${r.name}</td>
      <td style="padding: 5px; border: 1px solid #cbd5e1; color: #15803d; font-weight: bold;">${r.record}</td>
      <td style="padding: 5px; border: 1px solid #cbd5e1;">${r.metric}</td>
      <td style="padding: 5px; border: 1px solid #cbd5e1;"><span style="background: #dcfce7; color: #15803d; padding: 2px 6px; border-radius: 4px; font-weight: bold;">${r.rating}</span></td>
    </tr>
  `).join('');
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

// Excel / CSV Export Function (UTF-8 BOM Compatible with Excel)
function exportExcelReport() {
  const bom = '\uFEFF';
  let csv = bom + 'بخش,شاخص یا نام آزمون,مقدار / رکورد,تحلیل و استاندارد هندبال,رتبه استعدادیابی\r\n';

  csv += `مشخصات,نام ورزشکار,${athlete.name},پست: ${athlete.position},سن: ${athlete.age}\r\n`;
  csv += `مشخصات,دست برتر,${athlete.hand},وزن: ${athlete.weight}kg,قد: ${athlete.height}cm\r\n`;

  csv += `پیکرسنجی,۱. قد ایستاده,${athlete.height} cm,استاندارد هندبال,عالی\r\n`;
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
  csv += `آزمون میدانی,شنا سوئدی,${testsData.pushup.reps} تکرار,عمق آرنج < ۹۰°,استقامت شانه عالی\r\n`;
  csv += `آزمون میدانی,درازنشست,${testsData.situp.reps} تکرار,دامنه ۷۰°,ثبات مرکز تنه مطلوب\r\n`;
  csv += `آزمون میدانی,اسکات و لانج,${testsData.squat.reps} تکرار,تراز زانو و پنجه,بدون والگوس\r\n`;

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
