// ==========================================================================
// MTM2 • سامانه استعدادیابی تخصصی هندبال و آزمون‌های میدانی
// Version: 1.1.0 (Advanced Biomechanical Skeleton, Angles & Dimensions HUD)
// ==========================================================================

// Global State
let currentMode = 'anthro';
let detector = null;
let nativePose = null;
let videoEl = null;
let imageEl = null;
let canvasEl = null;
let ctx = null;
let mediaControlBar = null;
let currentMediaSource = 'camera'; // 'camera' | 'video' | 'image'
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

// Athlete Profile State & Multi-Athlete Database
let athletesDB = [];
let currentAthleteId = 'ath_1';
let currentStorageDirHandle = null;

let athlete = {
  id: 'ath_1',
  name: 'علی رضایی',
  nationalCode: '0012345678',
  birthDate: '1388/05/14',
  gender: 'پسر',
  phone: '09123456789',
  email: 'ali.rezaei@example.com',
  school: 'دبیرستان استعدادهای درخشان شهید بهشتی',
  city: 'تهران',
  coach: 'استاد مرادی',
  sport: 'هندبال (نوجوانان)',
  position: 'بغل',
  dominantHand: 'راست',
  dominantFoot: 'راست',
  dominantEye: 'راست',
  hand: 'راست',
  age: 16,
  weight: 68,
  height: 178,
  fatherHeight: 182,
  motherHeight: 167,
  photoUrl: '',
  testSessions: []
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
  imageEl = document.getElementById('stillImage');
  canvasEl = document.getElementById('overlay');
  ctx = canvasEl.getContext('2d');
  mediaControlBar = document.getElementById('mediaControlBar');

  loadAthleteFromStorage();
  loadVisualSettingsFromStorage();
  initUIEvents();
  initWindowManager();
  initAthleteManager();
  initHistoryArchive();
  initMobileTabs();
  initVisualToggles();
  initMediaControllers();

  // 1. Immediately start skeleton rendering loop so HUD and skeleton show in milliseconds!
  startDetectLoop();

  // 2. Asynchronously initialize camera and AI without blocking the UI
  setupCamera().catch(err => console.warn('Camera setup warning:', err));
  loadPoseModel().catch(err => console.warn('Pose model load warning:', err));
});

// Load / Save Athlete Profile & Multi-Athlete Database
function loadAthleteFromStorage() {
  try {
    const savedList = localStorage.getItem('mtm2_athletes_v2');
    if (savedList) {
      athletesDB = JSON.parse(savedList);
    }
  } catch(e) {}

  if (!athletesDB || !Array.isArray(athletesDB) || athletesDB.length === 0) {
    const oldSaved = localStorage.getItem('mtm2_athlete');
    let base = Object.assign({}, athlete);
    if (oldSaved) {
      try { base = Object.assign(base, JSON.parse(oldSaved)); } catch(e) {}
    }
    base.id = 'ath_default_1';
    base.anthroData = JSON.parse(JSON.stringify(anthroData));
    base.testsData = JSON.parse(JSON.stringify(testsData));
    base.testSessions = [];
    athletesDB = [base];
  }

  const activeId = localStorage.getItem('mtm2_active_athlete_id');
  const found = athletesDB.find(a => a.id === activeId);
  athlete = found || athletesDB[0];
  currentAthleteId = athlete.id;

  if (athlete.anthroData) anthroData = Object.assign(anthroData, athlete.anthroData);
  if (athlete.testsData) testsData = Object.assign(testsData, athlete.testsData);
  if (!athlete.testSessions) athlete.testSessions = [];

  updateAthleteUI();
  updateAthleteDropdowns();
}

function saveAthleteToStorage() {
  if (!athlete.id) athlete.id = 'ath_' + Date.now();
  athlete.anthroData = JSON.parse(JSON.stringify(anthroData));
  athlete.testsData = JSON.parse(JSON.stringify(testsData));

  const idx = athletesDB.findIndex(a => a.id === athlete.id);
  if (idx >= 0) {
    athletesDB[idx] = JSON.parse(JSON.stringify(athlete));
  } else {
    athletesDB.push(JSON.parse(JSON.stringify(athlete)));
  }

  localStorage.setItem('mtm2_athletes_v2', JSON.stringify(athletesDB));
  localStorage.setItem('mtm2_active_athlete_id', athlete.id);
  localStorage.setItem('mtm2_athlete', JSON.stringify(athlete));

  updateAthleteUI();
  updateAthleteDropdowns();
}

function updateAthleteDropdowns() {
  const topSel = document.getElementById('selTopAthlete');
  const modalSel = document.getElementById('selAthleteModal');
  const histSel = document.getElementById('selHistoryAthleteFilter');

  const optionsHtml = athletesDB.map(a => 
    `<option value="${a.id}" ${a.id === athlete.id ? 'selected' : ''}>${a.name} (${a.position || 'ورزشکار'})</option>`
  ).join('');

  if (topSel) topSel.innerHTML = optionsHtml;
  if (modalSel) modalSel.innerHTML = optionsHtml;
  if (histSel) histSel.innerHTML = optionsHtml;
}

function switchAthlete(newId) {
  const target = athletesDB.find(a => a.id === newId);
  if (!target) return;

  saveAthleteToStorage();

  athlete = target;
  currentAthleteId = athlete.id;
  localStorage.setItem('mtm2_active_athlete_id', athlete.id);

  if (athlete.anthroData) anthroData = Object.assign(anthroData, athlete.anthroData);
  if (athlete.testsData) testsData = Object.assign(testsData, athlete.testsData);
  if (!athlete.testSessions) athlete.testSessions = [];

  updateAthleteUI();
  updateAnthroPanelUI();
  updateAthleteDropdowns();
  populateAthleteModalInputs();
  if (typeof renderHistorySessions === 'function') renderHistorySessions();
}

function updateAthleteUI() {
  const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setTxt('hdrAthleteName', athlete.name);
  setTxt('cardAthleteName', athlete.name);
  setTxt('cardAthletePosition', athlete.position || 'بغل');
  setTxt('cardAthleteAge', athlete.age || 16);
  setTxt('cardAthleteWeight', (athlete.weight || 68) + ' kg');
  setTxt('cardAthleteHeight', (athlete.height || 178) + ' cm');
  setTxt('cardAthleteHand', athlete.dominantHand || (athlete.hand === 'left' ? 'چپ' : 'راست'));
  setTxt('btnCalibHeightVal', athlete.height || 178);

  const avatarSrc = athlete.photoUrl || 'icon.svg';
  const imgCard = document.getElementById('cardAthletePhoto');
  if (imgCard) imgCard.src = avatarSrc;
  const imgPreview = document.getElementById('imgAthleteAvatarPreview');
  if (imgPreview) imgPreview.src = avatarSrc;
  const imgRpt = document.getElementById('rptAthleteAvatar');
  if (imgRpt) imgRpt.src = avatarSrc;

  // Recommendations preview in Quad 4
  const recs = calculateSportRecommendations(athlete, anthroData, testsData);
  const recTextEl = document.getElementById('quickSportRecText');
  if (recTextEl && recs && recs.length >= 3) {
    recTextEl.innerHTML = `رشته‌های مستعد: <strong style="color: #38bdf8;">۱. ${recs[0].sport} (${recs[0].score}٪)</strong> • ۲. ${recs[1].sport} (${recs[1].score}٪) • ۳. ${recs[2].sport} (${recs[2].score}٪)`;
  }
}

// Sport Talent Recommendation Engine
function calculateSportRecommendations(ath, anthro, tests) {
  const height = Number(anthro.height) || Number(ath.height) || 178;
  const wingspan = Number(anthro.wingspan) || 184;
  const apeDiff = Number(anthro.spanMinusHeight) || (wingspan - height);
  const armLever = Number(anthro.armLever) || 74;
  const jumpHeight = Number(tests.jump.maxHeight) || 35;
  const longJump = Number(tests.longJump.bestDist || tests.longJump.distanceCm) || 180;
  const run5m = Number(tests.run5m.time) || 1.45;
  const plank = Number(tests.plank.timeSec) || 45;
  const pushup = Number(tests.pushup.reps) || 15;

  let hbScore = 82;
  if (height >= 176) hbScore += 5;
  if (apeDiff >= 4) hbScore += 5;
  if (armLever >= 72) hbScore += 4;
  if (run5m > 0 && run5m <= 1.4) hbScore += 4;
  if (ath.dominantHand === 'چپ' || ath.hand === 'left' || ath.hand === 'چپ') hbScore += 3;
  hbScore = Math.min(98, Math.max(70, hbScore));

  let bbScore = 75;
  if (height >= 180) bbScore += 9;
  if (apeDiff >= 5) bbScore += 8;
  if (jumpHeight >= 40) bbScore += 5;
  bbScore = Math.min(97, Math.max(68, bbScore));

  let vbScore = 74;
  if (jumpHeight >= 38 || longJump >= 200) vbScore += 10;
  if (height >= 178) vbScore += 7;
  if (apeDiff >= 3) vbScore += 4;
  vbScore = Math.min(96, Math.max(65, vbScore));

  let athScore = 72;
  if (run5m > 0 && run5m <= 1.35) athScore += 10;
  if (longJump >= 210) athScore += 10;
  if (plank >= 60) athScore += 4;
  athScore = Math.min(95, Math.max(65, athScore));

  let swimScore = 70;
  if (apeDiff >= 5) swimScore += 11;
  if (anthro.cormicIndex >= 52) swimScore += 6;
  if (pushup >= 20) swimScore += 5;
  swimScore = Math.min(94, Math.max(60, swimScore));

  const list = [
    {
      sport: 'هندبال تخصصی (Handball)',
      score: hbScore,
      bestPosition: (ath.dominantHand === 'چپ' || ath.hand === 'left') ? 'بغل راست / گوش راست (طلایی چپ‌دست)' : (height >= 184 ? 'بغل / خط‌زن دفاعی' : 'بغل شوت‌زن / بازی‌ساز'),
      reasons: `اهرم پرتاب (${armLever}cm)، شاخص میمونی (${apeDiff >= 0 ? '+' : ''}${apeDiff}cm)، تناسب دست با توپ هندبال`,
      badgeColor: '#0284c7'
    },
    {
      sport: 'بسکتبال (Basketball)',
      score: bbScore,
      bestPosition: height >= 182 ? 'فوروارد قدرتی' : 'پوینت گارد / شوتینگ گارد',
      reasons: `گستره کشیده بازوها (${wingspan}cm فراتر از قد) و چابکی گام‌برداری`,
      badgeColor: '#ea580c'
    },
    {
      sport: 'والیبال (Volleyball)',
      score: vbScore,
      bestPosition: 'اسپکر قدرتی / پشت خط‌زن',
      reasons: `توان انفجاری پرش (${jumpHeight}cm) و فریم کمربند شانه`,
      badgeColor: '#16a34a'
    },
    {
      sport: 'دو و میدانی - پرش و سرعت (Athletics)',
      score: athScore,
      bestPosition: 'پرش طول درجا / دو سرعت ۶۰ و ۱۰۰ متر',
      reasons: `شتاب انفجاری استارت ۵ متر (${run5m}s) و رکورد پرش طول`,
      badgeColor: '#7c3aed'
    },
    {
      sport: 'شنای مسافت و سرعتی (Swimming)',
      score: swimScore,
      bestPosition: 'کرال سینه / شنای پروانه',
      reasons: `گستره دست بالا و شاخص میمونی مثبت برای پیش‌رانش هیدرودینامیک`,
      badgeColor: '#0891b2'
    }
  ];

  list.sort((a, b) => b.score - a.score);
  return list;
}

// Draw Spider / Radar Chart on Canvas
function drawRadarChart(canvas, ath, anthro, tests) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const width = 340;
  const height = 250;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, width, height);

  const cx = width / 2;
  const cy = height / 2 + 5;
  const radius = 80;

  const metrics = [
    { label: 'قد و استخوان‌بندی', val: Math.min(100, Math.max(30, (anthro.height / 190) * 100)) },
    { label: 'گستره بازوها', val: Math.min(100, Math.max(30, (anthro.wingspan / 195) * 100)) },
    { label: 'اهرم پرتاب', val: Math.min(100, Math.max(30, (anthro.armLever / 80) * 100)) },
    { label: 'توان پرش', val: Math.min(100, Math.max(30, ((tests.jump.maxHeight || 30) / 55) * 100)) },
    { label: 'شتاب ۵ متر', val: Math.min(100, Math.max(30, tests.run5m.time > 0 ? (1.7 / tests.run5m.time) * 80 : 78)) },
    { label: 'استقامت تنه', val: Math.min(100, Math.max(30, ((tests.plank.timeSec || 30) / 90) * 100)) },
    { label: 'استقامت شانه', val: Math.min(100, Math.max(30, ((tests.pushup.reps || 10) / 30) * 100)) },
    { label: 'ثبات کینماتیک', val: 88 }
  ];

  const totalAxes = metrics.length;
  const angleStep = (Math.PI * 2) / totalAxes;

  // 1. Draw 5 concentric polygon rings
  const levels = [0.2, 0.4, 0.6, 0.8, 1.0];
  levels.forEach(lvl => {
    ctx.beginPath();
    for (let i = 0; i < totalAxes; i++) {
      const angle = i * angleStep - Math.PI / 2;
      const x = cx + Math.cos(angle) * (radius * lvl);
      const y = cy + Math.sin(angle) * (radius * lvl);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = lvl === 1.0 ? '#cbd5e1' : '#e2e8f0';
    ctx.lineWidth = lvl === 1.0 ? 1.5 : 1;
    ctx.stroke();
  });

  // 2. Draw radial spokes
  for (let i = 0; i < totalAxes; i++) {
    const angle = i * angleStep - Math.PI / 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // 3. Draw athlete data polygon
  ctx.beginPath();
  for (let i = 0; i < totalAxes; i++) {
    const angle = i * angleStep - Math.PI / 2;
    const r = (metrics[i].val / 100) * radius;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(2, 132, 199, 0.35)';
  ctx.fill();
  ctx.strokeStyle = '#0284c7';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // 4. Draw node dots & labels
  ctx.font = 'bold 8.5px Tahoma, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < totalAxes; i++) {
    const angle = i * angleStep - Math.PI / 2;
    const r = (metrics[i].val / 100) * radius;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;

    // Dot
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#38bdf8';
    ctx.fill();
    ctx.strokeStyle = '#0369a1';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Text Label outside
    const lx = cx + Math.cos(angle) * (radius + 18);
    const ly = cy + Math.sin(angle) * (radius + 18);
    ctx.fillStyle = '#1e293b';
    ctx.fillText(`${metrics[i].label} (${Math.round(metrics[i].val)}%)`, lx, ly);
  }
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

    // Upload Video / Image
    uploadModalBtn?.addEventListener('click', () => {
      starterDismissed = true;
      starter.style.display = 'none';
      (document.getElementById('mediaFileInput') || document.getElementById('videoFileInput'))?.click();
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
  let w = stage ? stage.clientWidth : window.innerWidth;
  let h = stage ? stage.clientHeight : window.innerHeight;

  if (currentMediaSource === 'image' && imageEl && imageEl.naturalWidth > 0) {
    w = stage ? stage.clientWidth : imageEl.naturalWidth;
    h = stage ? stage.clientHeight : imageEl.naturalHeight;
  } else if (currentMediaSource === 'video' && videoEl && videoEl.videoWidth > 0) {
    w = stage ? stage.clientWidth : videoEl.videoWidth;
    h = stage ? stage.clientHeight : videoEl.videoHeight;
  } else if (videoEl && videoEl.videoWidth > 0) {
    w = stage ? stage.clientWidth : videoEl.videoWidth;
    h = stage ? stage.clientHeight : videoEl.videoHeight;
  }

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
          lastLandmarks = results.poseLandmarks.map((pt, idx) => {
            const mapped = mapNormalizedToCanvas(pt, canvasEl.width, canvasEl.height);
            return {
              index: idx,
              x: mapped.x,
              y: mapped.y,
              z: pt.z,
              visibility: pt.visibility !== undefined ? pt.visibility : 1,
              score: pt.visibility !== undefined ? pt.visibility : 1
            };
          });
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

// Media aspect-ratio scaling and direct canvas rendering helpers
function getActiveMediaDimensions() {
  if (currentMediaSource === 'image' && imageEl && imageEl.naturalWidth > 0) {
    return { sw: imageEl.naturalWidth, sh: imageEl.naturalHeight };
  }
  if (currentMediaSource === 'video' && videoEl && videoEl.videoWidth > 0) {
    return { sw: videoEl.videoWidth, sh: videoEl.videoHeight };
  }
  return { sw: 0, sh: 0 };
}

function mapNormalizedToCanvas(pt, canvasW, canvasH) {
  const { sw, sh } = getActiveMediaDimensions();
  if (sw > 0 && sh > 0) {
    const ratio = Math.min(canvasW / sw, canvasH / sh);
    const dw = sw * ratio;
    const dh = sh * ratio;
    const dx = (canvasW - dw) / 2;
    const dy = (canvasH - dh) / 2;
    return {
      x: dx + (pt.x * dw),
      y: dy + (pt.y * dh)
    };
  }
  return {
    x: pt.x * canvasW,
    y: pt.y * canvasH
  };
}

function drawMediaToCanvas(targetCtx, media, targetW, targetH) {
  if (!media) return;
  const sw = media.videoWidth || media.naturalWidth || media.width;
  const sh = media.videoHeight || media.naturalHeight || media.height;
  if (!sw || !sh) return;

  const hRatio = targetW / sw;
  const vRatio = targetH / sh;
  const ratio = Math.min(hRatio, vRatio);
  const dw = sw * ratio;
  const dh = sh * ratio;
  const dx = (targetW - dw) / 2;
  const dy = (targetH - dh) / 2;

  // Letterbox background
  targetCtx.fillStyle = '#070a13';
  targetCtx.fillRect(0, 0, targetW, targetH);
  try {
    targetCtx.drawImage(media, 0, 0, sw, sh, dx, dy, dw, dh);
  } catch(e) {}
}

// Main Frame Processing & Rendering Loop
async function startDetectLoop() {
  isDetecting = true;

  async function loop() {
    if (!isDetecting) return;

    resizeCanvas();
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

    // Render source media directly on canvas (100% immune to black screen / layering issues)
    if (currentMediaSource === 'image' && imageEl && imageEl.complete && imageEl.naturalWidth > 0) {
      drawMediaToCanvas(ctx, imageEl, canvasEl.width, canvasEl.height);
    } else if (currentMediaSource === 'video' && videoEl && videoEl.readyState >= 2) {
      drawMediaToCanvas(ctx, videoEl, canvasEl.width, canvasEl.height);
    }

    if (isModelReady) {
      if (currentMediaSource === 'image' && imageEl && imageEl.naturalWidth > 0 && !imageEl._analyzed) {
        imageEl._analyzed = true;
        try {
          if (nativePose) {
            await nativePose.send({ image: imageEl });
          } else if (detector) {
            const poses = await detector.estimatePoses(imageEl, { maxPoses: 1, flipHorizontal: false });
            if (poses && poses.length > 0) {
              lastLandmarks = poses[0].keypoints;
              lastDetectTime = performance.now();
              processFrameBiomechanics(lastLandmarks);
            }
          }
        } catch (err) {
          console.warn('Image detection error:', err);
        }
      } else if (currentMediaSource === 'video' && videoEl && videoEl.readyState >= 2) {
        const shouldDetect = !videoEl.paused || videoEl._needDetect;
        if (shouldDetect) {
          videoEl._needDetect = false;
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
          } catch (err) {}
        }
      } else if (currentMediaSource === 'camera' && videoEl && videoEl.readyState >= 2 && !videoEl.paused) {
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
        } catch (err) {}
      }
    }

    // Render Overlay
    const now = performance.now();
    const hasRecentDetection = (currentMediaSource !== 'camera' && lastLandmarks) || (lastLandmarks && (now - lastDetectTime < 1200));

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

// ==========================================================================
// MEDIA CONTROLLERS: Video & Photo Playback, Frame-by-Frame, Slow-Mo & Snapshots
// ==========================================================================
function initMediaControllers() {
  const uploadBtn = document.getElementById('btnUploadMedia') || document.getElementById('lblUploadMedia') || document.getElementById('btnUploadVideo');
  const fileInput = document.getElementById('mediaFileInput') || document.getElementById('videoFileInput');
  const playPauseBtn = document.getElementById('btnMediaPlayPause');
  const playPauseIcon = document.getElementById('iconMediaPlayPause');
  const stepBackBtn = document.getElementById('btnMediaStepBack');
  const stepFwdBtn = document.getElementById('btnMediaStepForward');
  const scrubber = document.getElementById('inputMediaScrubber');
  const timeLbl = document.getElementById('lblMediaTime');
  const speedSel = document.getElementById('selMediaSpeed');
  const loopChk = document.getElementById('chkMediaLoop');
  const liveBtn = document.getElementById('btnReturnToLiveCamera');
  const snapshotBtn = document.getElementById('btnSnapshotFrame');
  const loopContainer = document.getElementById('lblLoopContainer');
  const videoControlsRow = document.getElementById('mediaVideoControlsRow');

  // Trigger file selection with reset so re-selecting same file fires change
  uploadBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    if (fileInput) {
      fileInput.value = '';
      fileInput.click();
    }
  });

  // Universal Media Loader Function (Video / Photo)
  window.loadMediaFile = function(file) {
    if (!file) return;

    const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|webm|avi|mkv|m4v|3gp|wmv|flv)$/i.test(file.name);
    const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp|bmp|gif|svg)$/i.test(file.name);

    liveStatureSmoothed = 0; // Reset live stature smoothing for new media

    if (isVideo) {
      currentMediaSource = 'video';

      // 1. Release live camera stream tracks
      if (videoEl && videoEl.srcObject) {
        try {
          const tracks = videoEl.srcObject.getTracks ? videoEl.srcObject.getTracks() : [];
          tracks.forEach(t => t.stop());
        } catch(e) {}
        videoEl.srcObject = null;
      }

      if (imageEl) {
        imageEl.style.display = 'none';
        imageEl.src = '';
      }

      if (videoEl) {
        videoEl.style.display = 'block';
        if (videoEl._blobUrl) {
          try { URL.revokeObjectURL(videoEl._blobUrl); } catch(e) {}
        }
        const blobUrl = URL.createObjectURL(file);
        videoEl._blobUrl = blobUrl;
        videoEl.src = blobUrl;
        videoEl.muted = true;
        videoEl.setAttribute('playsinline', '');
        videoEl.setAttribute('webkit-playsinline', '');
        videoEl.loop = loopChk ? loopChk.checked : true;
        videoEl.playbackRate = speedSel ? parseFloat(speedSel.value) : 1.0;

        // Essential: call load() to initiate media pipeline
        videoEl.load();

        videoEl.onloadeddata = () => {
          resizeCanvas();
          videoEl._needDetect = true;
        };

        videoEl.onloadedmetadata = () => {
          resizeCanvas();
          if (timeLbl && videoEl.duration) {
            timeLbl.textContent = `00:00 / ${formatTimer(videoEl.duration)}`;
          }
        };

        videoEl.play().then(() => {
          if (playPauseIcon) playPauseIcon.textContent = '❚❚';
        }).catch(err => {
          console.warn('Video autoplay warning:', err);
          if (playPauseIcon) playPauseIcon.textContent = '►';
        });

        videoEl._needDetect = true;
      }

      if (mediaControlBar) {
        mediaControlBar.style.display = 'flex';
        mediaControlBar.style.visibility = 'visible';
      }
      if (videoControlsRow) videoControlsRow.style.display = 'flex';
      if (loopContainer) loopContainer.style.display = 'flex';
      if (timeLbl) timeLbl.textContent = `🎬 ${file.name}`;
      setAiStatus('ready', `در حال آنالیز ویدیوی: ${file.name}`);

    } else if (isImage) {
      currentMediaSource = 'image';

      // 1. Pause & release video/camera
      if (videoEl) {
        try {
          videoEl.pause();
          if (videoEl.srcObject) {
            const tracks = videoEl.srcObject.getTracks ? videoEl.srcObject.getTracks() : [];
            tracks.forEach(t => t.stop());
            videoEl.srcObject = null;
          }
        } catch(e) {}
        videoEl.style.display = 'none';
      }

      if (imageEl) {
        imageEl.style.display = 'block';
        imageEl._analyzed = false;
        if (imageEl._blobUrl) {
          try { URL.revokeObjectURL(imageEl._blobUrl); } catch(e) {}
        }
        const blobUrl = URL.createObjectURL(file);
        imageEl._blobUrl = blobUrl;
        imageEl.src = blobUrl;

        imageEl.onload = () => {
          resizeCanvas();
          imageEl._analyzed = false;
          // Trigger instant AI detection on the photo
          if (isModelReady) {
            if (nativePose) {
              nativePose.send({ image: imageEl });
            } else if (detector) {
              detector.estimatePoses(imageEl, { maxPoses: 1, flipHorizontal: false }).then(poses => {
                if (poses && poses.length > 0) {
                  lastLandmarks = poses[0].keypoints;
                  lastDetectTime = performance.now();
                  processFrameBiomechanics(lastLandmarks);
                }
              });
            }
          }
        };
      }

      if (mediaControlBar) {
        mediaControlBar.style.display = 'flex';
        mediaControlBar.style.visibility = 'visible';
      }
      if (videoControlsRow) videoControlsRow.style.display = 'none'; // Still image doesn't need video scrubber
      if (loopContainer) loopContainer.style.display = 'none';
      if (timeLbl) timeLbl.textContent = `🖼️ عکس: ${file.name}`;
      setAiStatus('ready', `در حال آنالیز تصویر: ${file.name}`);
    }
  };

  // File Input Change Listener
  fileInput?.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      window.loadMediaFile(file);
    }
  });

  // Drag and Drop support on Camera Stage and Quad 1
  const dropTargets = [document.getElementById('cameraStage'), document.getElementById('quadCamera')];
  dropTargets.forEach(tgt => {
    if (!tgt) return;
    tgt.addEventListener('dragover', (e) => {
      e.preventDefault();
      tgt.style.boxShadow = 'inset 0 0 0 2px #38bdf8';
    });
    tgt.addEventListener('dragleave', () => {
      tgt.style.boxShadow = 'none';
    });
    tgt.addEventListener('drop', (e) => {
      e.preventDefault();
      tgt.style.boxShadow = 'none';
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        window.loadMediaFile(e.dataTransfer.files[0]);
      }
    });
  });

  // Play / Pause Toggle
  playPauseBtn?.addEventListener('click', () => {
    if (!videoEl) return;
    if (videoEl.paused) {
      videoEl.play();
      if (playPauseIcon) playPauseIcon.textContent = '❚❚';
    } else {
      videoEl.pause();
      if (playPauseIcon) playPauseIcon.textContent = '►';
    }
  });

  // Stepping 1 frame (0.04s) backward
  stepBackBtn?.addEventListener('click', () => {
    if (!videoEl) return;
    videoEl.pause();
    if (playPauseIcon) playPauseIcon.textContent = '►';
    videoEl.currentTime = Math.max(0, videoEl.currentTime - 0.04);
    videoEl._needDetect = true;
  });

  // Stepping 1 frame (0.04s) forward
  stepFwdBtn?.addEventListener('click', () => {
    if (!videoEl) return;
    videoEl.pause();
    if (playPauseIcon) playPauseIcon.textContent = '►';
    videoEl.currentTime = Math.min(videoEl.duration || 9999, videoEl.currentTime + 0.04);
    videoEl._needDetect = true;
  });

  // Timeline Scrubber
  scrubber?.addEventListener('input', () => {
    if (!videoEl || !videoEl.duration) return;
    videoEl.currentTime = (scrubber.value / 100) * videoEl.duration;
    videoEl._needDetect = true;
  });

  // Video Time Update
  videoEl?.addEventListener('timeupdate', () => {
    if (currentMediaSource !== 'video' || !videoEl.duration) return;
    if (scrubber && document.activeElement !== scrubber) {
      scrubber.value = (videoEl.currentTime / videoEl.duration) * 100;
    }
    if (timeLbl) {
      timeLbl.textContent = `${formatTimer(videoEl.currentTime)} / ${formatTimer(videoEl.duration)}`;
    }
  });

  videoEl?.addEventListener('ended', () => {
    if (playPauseIcon) playPauseIcon.textContent = '►';
  });

  // Playback Speed
  speedSel?.addEventListener('change', () => {
    if (videoEl) videoEl.playbackRate = parseFloat(speedSel.value);
  });

  // Loop toggle
  loopChk?.addEventListener('change', () => {
    if (videoEl) videoEl.loop = loopChk.checked;
  });

  // Return to Live Camera
  liveBtn?.addEventListener('click', async () => {
    currentMediaSource = 'camera';
    if (imageEl) { imageEl.style.display = 'none'; imageEl.src = ''; }
    if (videoEl) {
      videoEl.style.display = 'block';
      videoEl.pause();
      videoEl.src = '';
    }
    if (mediaControlBar) mediaControlBar.style.display = 'none';
    setAiStatus('loading', 'اتصال مجدد به وب‌کم زنده...');
    await setupCamera();
  });

  // Snapshot Analyzed Frame (Merge source video/image + canvas overlay)
  snapshotBtn?.addEventListener('click', () => {
    try {
      const snapCanvas = document.createElement('canvas');
      snapCanvas.width = canvasEl.width;
      snapCanvas.height = canvasEl.height;
      const sCtx = snapCanvas.getContext('2d');

      // 1. Draw source video or image
      if (currentMediaSource === 'image' && imageEl && imageEl.style.display !== 'none') {
        sCtx.drawImage(imageEl, 0, 0, snapCanvas.width, snapCanvas.height);
      } else if (videoEl && videoEl.style.display !== 'none') {
        sCtx.drawImage(videoEl, 0, 0, snapCanvas.width, snapCanvas.height);
      }

      // 2. Draw overlay skeleton, angles, badges & dimensions
      sCtx.drawImage(canvasEl, 0, 0);

      // 3. Add timestamp and branding badge in corner
      sCtx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      sCtx.fillRect(10, snapCanvas.height - 30, 240, 22);
      sCtx.fillStyle = '#38bdf8';
      sCtx.font = 'bold 11px Tahoma, sans-serif';
      sCtx.fillText(`حرکت‌سنج ۲ • آنالیز بیومکانیک (${athlete.name})`, 16, snapCanvas.height - 15);

      const a = document.createElement('a');
      a.download = `MTM2_Analysis_${athlete.name.replace(/\s+/g, '_')}_${Date.now()}.png`;
      a.href = snapCanvas.toDataURL('image/png');
      a.click();
    } catch (err) {
      alert('خطا در ذخیره تصویر آنالیز: ' + err.message);
    }
  });
}

  // Camera Switch
  document.getElementById('btnCamSwitch')?.addEventListener('click', async () => {
    currentCamera = currentCamera === 'environment' ? 'user' : 'environment';
    await setupCamera();
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

  // Clicking avatar container in Report opens profile to snap/upload photo
  document.getElementById('rptAvatarContainer')?.addEventListener('click', () => {
    reportModal?.classList.remove('active');
    document.getElementById('btnAthleteProfile')?.click();
  });

  // Quick Athlete Edit from Quad 4
  document.getElementById('btnQuickEditAthlete')?.addEventListener('click', () => {
    document.getElementById('btnAthleteProfile')?.click();
  });

  // PDF & Excel Downloads
  document.getElementById('btnDownloadPdf')?.addEventListener('click', exportPdfReport);
  document.getElementById('btnDownloadPdfQuick')?.addEventListener('click', exportPdfReport);
  document.getElementById('btnDownloadExcel')?.addEventListener('click', exportExcelReport);
  document.getElementById('btnDownloadExcelQuick')?.addEventListener('click', exportExcelReport);
  document.getElementById('btnSaveArchiveToFolder')?.addEventListener('click', saveAthleteArchiveToDevice);
}


// ==========================================================================
// WINDOW MANAGER: Resizing Splitters, Minimize, Maximize, Close, PiP & Multi-Monitor Popouts
// ==========================================================================
const activePopouts = {};
let pipVideoEl = null;

function initWindowManager() {
  const studio = document.getElementById('studioQuads');
  const splitter = document.getElementById('studioCenterSplitter');

  // 1. Draggable Center Splitter (Cross Splitter for Custom Sizing)
  if (splitter && studio) {
    let isSplitterDragging = false;

    const onPointerMove = (e) => {
      if (!isSplitterDragging) return;
      const rect = studio.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const colPct = Math.max(15, Math.min(85, ((e.clientX - rect.left) / rect.width) * 100));
      const rowPct = Math.max(15, Math.min(85, ((e.clientY - rect.top) / rect.height) * 100));

      studio.style.setProperty('--col-split', `${colPct}%`);
      studio.style.setProperty('--row-split', `${rowPct}%`);
      resizeCanvas();
    };

    const onPointerUp = (e) => {
      if (isSplitterDragging) {
        isSplitterDragging = false;
        try { splitter.releasePointerCapture(e.pointerId); } catch(err) {}
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        resizeCanvas();
      }
    };

    splitter.addEventListener('pointerdown', (e) => {
      isSplitterDragging = true;
      try { splitter.setPointerCapture(e.pointerId); } catch(err) {}
      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
      e.preventDefault();
    });

    // Double-click to instantly reset to 50/50
    splitter.addEventListener('dblclick', () => {
      studio.style.setProperty('--col-split', '50%');
      studio.style.setProperty('--row-split', '50%');
      resizeCanvas();
    });
  }

  // 2. Quad Window Header Controls (Popout, Maximize, Minimize, Close)
  document.querySelectorAll('.btn-quad-tool').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetId = btn.getAttribute('data-target');

      if (btn.classList.contains('max')) {
        toggleQuadMaximize(targetId);
      } else if (btn.classList.contains('min')) {
        toggleQuadMinimize(targetId);
      } else if (btn.classList.contains('close')) {
        closeQuad(targetId);
      } else if (btn.classList.contains('popout')) {
        openPopoutWindow(targetId);
      }
    });
  });

  // 3. Picture-in-Picture Floating Window
  document.getElementById('btnPipCamera')?.addEventListener('click', () => {
    togglePictureInPicture();
  });

  // 4. Top Navigation Window Manager Toggles
  document.querySelectorAll('.btn-win-toggle[data-quad]').forEach(btn => {
    btn.addEventListener('click', () => {
      const quadId = btn.getAttribute('data-quad');
      const quad = document.getElementById(quadId);
      if (!quad) return;

      if (quad.classList.contains('quad-closed')) {
        restoreQuad(quadId);
      } else if (quad.classList.contains('quad-minimized')) {
        toggleQuadMinimize(quadId);
      } else {
        closeQuad(quadId);
      }
    });
  });

  // 5. Reset 2x2 Layout Button
  document.getElementById('btnResetLayout')?.addEventListener('click', () => {
    resetStudioLayout();
  });

  // 6. Window Resize Handler to Prevent Style Bleed Between Mobile and Desktop
  window.addEventListener('resize', () => {
    if (window.innerWidth >= 1024) {
      ['quadCamera', 'quadAnthro', 'quadTests', 'quadAthleteReport'].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.classList.contains('quad-closed')) {
          el.style.display = '';
        }
      });
    }
    resizeCanvas();
  });
}

function toggleQuadMaximize(quadId) {
  const quad = document.getElementById(quadId);
  if (!quad) return;

  const isMax = quad.classList.toggle('quad-maximized');
  if (isMax) quad.classList.remove('quad-minimized');

  const maxBtn = quad.querySelector('.btn-quad-tool.max');
  if (maxBtn) {
    maxBtn.textContent = isMax ? '❐' : '⛶';
    maxBtn.title = isMax ? 'بازگشت به چیدمان شبکه (❐)' : 'تمام‌صفحه / فوکوس (⛶)';
  }
  resizeCanvas();
}

function toggleQuadMinimize(quadId) {
  const quad = document.getElementById(quadId);
  if (!quad) return;

  const isMin = quad.classList.toggle('quad-minimized');
  if (isMin) quad.classList.remove('quad-maximized');

  const minBtn = quad.querySelector('.btn-quad-tool.min');
  if (minBtn) {
    minBtn.textContent = isMin ? '🗖' : '_';
    minBtn.title = isMin ? 'بزرگ‌کردن مجدد (🗖)' : 'کوچک‌کردن (_)';
  }
  resizeCanvas();
}

function closeQuad(quadId) {
  const quad = document.getElementById(quadId);
  if (!quad) return;

  quad.classList.remove('quad-maximized', 'quad-minimized');
  quad.classList.add('quad-closed');

  const toggleBtn = document.querySelector(`.btn-win-toggle[data-quad="${quadId}"]`);
  if (toggleBtn) toggleBtn.classList.remove('active');

  rebalanceStudioGrid();
  resizeCanvas();
}

function restoreQuad(quadId) {
  const quad = document.getElementById(quadId);
  if (!quad) return;

  quad.classList.remove('quad-closed', 'quad-minimized', 'quad-maximized');
  quad.style.display = '';

  const maxBtn = quad.querySelector('.btn-quad-tool.max');
  if (maxBtn) { maxBtn.textContent = '⛶'; maxBtn.title = 'تمام‌صفحه / فوکوس (⛶)'; }
  const minBtn = quad.querySelector('.btn-quad-tool.min');
  if (minBtn) { minBtn.textContent = '_'; minBtn.title = 'کوچک‌کردن (_)'; }

  const toggleBtn = document.querySelector(`.btn-win-toggle[data-quad="${quadId}"]`);
  if (toggleBtn) toggleBtn.classList.add('active');

  rebalanceStudioGrid();
  resizeCanvas();
}

function rebalanceStudioGrid() {
  const studio = document.getElementById('studioQuads');
  const splitter = document.getElementById('studioCenterSplitter');
  if (!studio) return;

  const quads = ['quadCamera', 'quadAnthro', 'quadTests', 'quadAthleteReport'];
  const openQuads = quads.filter(id => {
    const el = document.getElementById(id);
    return el && !el.classList.contains('quad-closed');
  });

  if (openQuads.length === 4) {
    studio.style.gridTemplateColumns = 'var(--col-split, 50%) calc(100% - var(--col-split, 50%) - 10px)';
    studio.style.gridTemplateRows = 'var(--row-split, 50%) calc(100% - var(--row-split, 50%) - 10px)';
    if (splitter) splitter.style.display = 'flex';
  } else if (openQuads.length === 1) {
    studio.style.gridTemplateColumns = '1fr';
    studio.style.gridTemplateRows = '1fr';
    if (splitter) splitter.style.display = 'none';
  } else if (openQuads.length === 2) {
    studio.style.gridTemplateColumns = '1fr 1fr';
    studio.style.gridTemplateRows = '1fr';
    if (splitter) splitter.style.display = 'none';
  } else if (openQuads.length === 3) {
    studio.style.gridTemplateColumns = '1fr 1fr';
    studio.style.gridTemplateRows = '1fr 1fr';
    if (splitter) splitter.style.display = 'none';
  } else if (openQuads.length === 0) {
    restoreQuad('quadCamera');
  }
}

function resetStudioLayout() {
  const studio = document.getElementById('studioQuads');
  ['quadCamera', 'quadAnthro', 'quadTests', 'quadAthleteReport'].forEach(id => {
    const q = document.getElementById(id);
    if (q) {
      q.classList.remove('quad-closed', 'quad-minimized', 'quad-maximized');
      q.style.display = '';
      const maxBtn = q.querySelector('.btn-quad-tool.max');
      if (maxBtn) { maxBtn.textContent = '⛶'; maxBtn.title = 'تمام‌صفحه / فوکوس (⛶)'; }
      const minBtn = q.querySelector('.btn-quad-tool.min');
      if (minBtn) { minBtn.textContent = '_'; minBtn.title = 'کوچک‌کردن (_)'; }
    }
    const toggleBtn = document.querySelector(`.btn-win-toggle[data-quad="${id}"]`);
    if (toggleBtn) toggleBtn.classList.add('active');
  });

  if (studio) {
    studio.style.setProperty('--col-split', '50%');
    studio.style.setProperty('--row-split', '50%');
  }
  rebalanceStudioGrid();
  resizeCanvas();
}

async function togglePictureInPicture() {
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
      return;
    }

    if (!pipVideoEl) {
      pipVideoEl = document.createElement('video');
      pipVideoEl.muted = true;
      pipVideoEl.playsInline = true;
      pipVideoEl.style.position = 'fixed';
      pipVideoEl.style.width = '1px';
      pipVideoEl.style.height = '1px';
      pipVideoEl.style.opacity = '0.001';
      pipVideoEl.style.pointerEvents = 'none';
      document.body.appendChild(pipVideoEl);
    }

    if (canvasEl && typeof canvasEl.captureStream === 'function') {
      const stream = canvasEl.captureStream(30);
      pipVideoEl.srcObject = stream;
      await pipVideoEl.play();
      await pipVideoEl.requestPictureInPicture();
    } else if (videoEl && typeof videoEl.requestPictureInPicture === 'function') {
      await videoEl.requestPictureInPicture();
    } else {
      alert('قابلیت تصویر در تصویر (Picture-in-Picture) توسط این مرورگر پشتیبانی نمی‌شود.');
    }
  } catch (err) {
    console.warn('PiP notice:', err);
    if (videoEl && typeof videoEl.requestPictureInPicture === 'function') {
      try {
        await videoEl.requestPictureInPicture();
      } catch (e2) {
        alert('امکان فعال‌سازی Picture-in-Picture: ' + (e2.message || err.message));
      }
    } else {
      alert('امکان فعال‌سازی Picture-in-Picture: ' + err.message);
    }
  }
}

function openPopoutWindow(quadId) {
  const quad = document.getElementById(quadId);
  if (!quad) return;

  const titleMap = {
    quadCamera: 'دوربین و هوش مصنوعی بیومکانیک (پروژکتور / مانیتور دوم)',
    quadAnthro: '۱۰ شاخص پیکرسنجی هندبال (ISAK & IHF)',
    quadTests: 'آزمون‌های حرکتی و کینماتیک بیومکانیک',
    quadAthleteReport: 'مشخصات ورزشکار & کارنامه استعدادیابی'
  };
  const winTitle = titleMap[quadId] || 'حرکت‌سنج ۲';

  if (activePopouts[quadId] && !activePopouts[quadId].closed) {
    activePopouts[quadId].focus();
    return;
  }

  const pop = window.open('', `MTM2_${quadId}`, 'width=1100,height=750,menubar=no,toolbar=no,location=no,status=no,resizable=yes');
  if (!pop) {
    alert('پنجره پاپ‌آپ توسط مرورگر مسدود شد! لطفاً باز شدن پنجره‌های پاپ‌آپ را در نوار آدرس مجاز بفرمایید.');
    return;
  }
  activePopouts[quadId] = pop;

  pop.document.write(`
    <!DOCTYPE html>
    <html lang="fa" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>${winTitle} • حرکت‌سنج ۲</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: Tahoma, Segoe UI, sans-serif; }
        body { background: #090d16; color: #f8fafc; height: 100vh; display: flex; flex-direction: column; overflow: hidden; padding: 10px; }
        .pop-hdr { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: rgba(15, 23, 42, 0.95); border: 1px solid #334155; border-radius: 8px; margin-bottom: 8px; }
        .pop-ttl { font-size: 13px; font-weight: bold; color: #38bdf8; display: flex; align-items: center; gap: 8px; }
        .pop-btn { background: #0284c7; border: 1px solid #38bdf8; color: #fff; padding: 5px 12px; border-radius: 6px; font-size: 11px; cursor: pointer; font-weight: bold; transition: all 0.15s; }
        .pop-btn:hover { background: #0ea5e9; }
        .pop-box { flex: 1; position: relative; background: #0b1120; border: 1px solid #1e293b; border-radius: 10px; overflow: auto; padding: 12px; display: flex; flex-direction: column; }
        canvas { width: 100%; height: 100%; object-fit: contain; background: #000; border-radius: 8px; }
      </style>
    </head>
    <body>
      <div class="pop-hdr">
        <div class="pop-ttl">🤾‍♂️ ${winTitle}</div>
        <button class="pop-btn" onclick="document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()">⛶ تمام‌صفحه پروژکتور سالن</button>
      </div>
      <div class="pop-box" id="popContentArea"></div>
    </body>
    </html>
  `);
  pop.document.close();

  const area = pop.document.getElementById('popContentArea');

  if (quadId === 'quadCamera') {
    const popCanvas = pop.document.createElement('canvas');
    popCanvas.width = canvasEl.width || 1280;
    popCanvas.height = canvasEl.height || 720;
    area.appendChild(popCanvas);
    const popCtx = popCanvas.getContext('2d');

    let popAnimId = null;
    const renderPop = () => {
      if (pop.closed) {
        cancelAnimationFrame(popAnimId);
        delete activePopouts[quadId];
        return;
      }
      if (canvasEl && popCanvas) {
        if (popCanvas.width !== canvasEl.width || popCanvas.height !== canvasEl.height) {
          popCanvas.width = canvasEl.width;
          popCanvas.height = canvasEl.height;
        }
        popCtx.clearRect(0, 0, popCanvas.width, popCanvas.height);
        popCtx.drawImage(canvasEl, 0, 0);
      }
      popAnimId = pop.requestAnimationFrame(renderPop);
    };
    popAnimId = pop.requestAnimationFrame(renderPop);
  } else {
    const styleSheets = Array.from(document.styleSheets);
    styleSheets.forEach(sheet => {
      try {
        if (sheet.href) {
          const l = pop.document.createElement('link');
          l.rel = 'stylesheet';
          l.href = sheet.href;
          pop.document.head.appendChild(l);
        } else if (sheet.cssRules) {
          const s = pop.document.createElement('style');
          Array.from(sheet.cssRules).forEach(r => s.appendChild(pop.document.createTextNode(r.cssText)));
          pop.document.head.appendChild(s);
        }
      } catch(e) {}
    });

    const bodyContent = quad.querySelector('.quad-body');
    if (bodyContent) {
      area.appendChild(bodyContent.cloneNode(true));
      const syncInterval = setInterval(() => {
        if (pop.closed) {
          clearInterval(syncInterval);
          delete activePopouts[quadId];
          return;
        }
        const currentBody = quad.querySelector('.quad-body');
        if (currentBody && area) {
          area.innerHTML = '';
          area.appendChild(currentBody.cloneNode(true));
        }
      }, 500);
    }
  }
}

// Mobile 3-Way Tab Switcher Handler (Fixed: Isolates Mobile and Never Corrupts Desktop Layout)
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
          } else {
            el.classList.remove('mobile-active');
          }
          if (window.innerWidth < 1024) {
            el.style.display = (id === targetId) ? 'flex' : 'none';
          } else {
            el.style.display = '';
          }
        }
      });
      resizeCanvas();
    });
  });
}


// Render Report Dynamic Tables, Radar Chart & Sport Priority
function renderReportTables() {
  const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val !== undefined ? val : ''; };
  setTxt('rptName', athlete.name);
  setTxt('rptNationalCode', athlete.nationalCode || '---');
  setTxt('rptBirthAge', `${athlete.birthDate || '---'} (${athlete.age || 16} سال)`);
  setTxt('rptGender', athlete.gender || 'پسر');
  setTxt('rptPosition', athlete.position || 'بغل');
  setTxt('rptHand', athlete.dominantHand || (athlete.hand === 'left' ? 'چپ' : 'راست'));
  setTxt('rptFoot', athlete.dominantFoot || 'راست');
  setTxt('rptEye', athlete.dominantEye || 'راست');
  setTxt('rptHeightWeight', `${anthroData.height}cm / ${athlete.weight || 68}kg`);
  setTxt('rptCoach', athlete.coach || 'استاد مرادی');
  setTxt('rptSchool', athlete.school || 'شهید بهشتی');
  setTxt('rptCity', athlete.city || 'تهران');
  setTxt('rptAthleteId', athlete.id ? `MTM2-${athlete.id.slice(-4)}` : 'MTM2-8841');
  setTxt('rptDateDisplay', `تاریخ ارزیابی: ${new Date().toLocaleDateString('fa-IR')}`);

  const avatarSrc = athlete.photoUrl || 'icon.svg';
  const rptAvatar = document.getElementById('rptAthleteAvatar');
  if (rptAvatar) rptAvatar.src = avatarSrc;

  // 1. Draw Spider / Radar Chart
  const radarCanvas = document.getElementById('canvasReportRadar');
  if (radarCanvas) {
    drawRadarChart(radarCanvas, athlete, anthroData, testsData);
  }

  // 2. Render Sport Recommendations List in Report
  const recs = calculateSportRecommendations(athlete, anthroData, testsData);
  const rptRecsEl = document.getElementById('rptSportRecommendationsList');
  if (rptRecsEl) {
    rptRecsEl.innerHTML = recs.map((r, idx) => `
      <div style="background: #fff; border: 1px solid #e2e8f0; border-right: 3px solid ${r.badgeColor}; border-radius: 4px; padding: 4px 6px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: bold; color: ${r.badgeColor};">رتبه ${idx + 1}: ${r.sport}</span>
          <strong style="color: #0284c7;">${r.score}٪ تطابق</strong>
        </div>
        <div style="color: #64748b; font-size: 9px; margin-top: 2px;">پست بهینه: <strong>${r.bestPosition}</strong> • ${r.reasons}</div>
      </div>
    `).join('');
  }

  // 3. Render 10 Anthro Indicators Table
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

  // 4. Render 8 Kinematic Field Tests Table
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
    pdf.save(`کارنامه_استعدادیابی_${athlete.name.replace(/\s+/g, '_')}_${athlete.nationalCode || 'MTM2'}.pdf`);
  } catch (err) {
    console.error('PDF export error:', err);
    window.print();
  }
}

// Excel / CSV Export Function
function exportExcelReport() {
  const bom = '\uFEFF';
  let csv = bom + 'بخش,شاخص یا مشخصه,مقدار / رکورد,تحلیل و استاندارد هندبال,رتبه استعدادیابی\r\n';

  csv += `هویتی,نام و نام خانوادگی,${athlete.name},پست: ${athlete.position},سن: ${athlete.age}\r\n`;
  csv += `هویتی,کد ملی,${athlete.nationalCode || '---'},تاریخ تولد: ${athlete.birthDate || '---'},جنسیت: ${athlete.gender || 'پسر'}\r\n`;
  csv += `هویتی,شماره تماس,${athlete.phone || '---'},ایمیل: ${athlete.email || '---'},مربی: ${athlete.coach || '---'}\r\n`;
  csv += `هویتی,مدرسه و شهر,${athlete.school || '---'} - ${athlete.city || '---'},رشته ورزشی: ${athlete.sport || 'هندبال'},دست برتر: ${athlete.dominantHand || 'راست'}\r\n`;
  csv += `هویتی,پای برتر و چشم برتر,پا: ${athlete.dominantFoot || 'راست'} / چشم: ${athlete.dominantEye || 'راست'},وزن: ${athlete.weight}kg,قد: ${anthroData.height}cm\r\n`;

  const recs = calculateSportRecommendations(athlete, anthroData, testsData);
  recs.forEach((r, idx) => {
    csv += `پیشنهاد هوش مصنوعی,اولویت ${idx + 1} رشته ورزشی,${r.sport},تطابق: ${r.score}%,${r.bestPosition} - ${r.reasons}\r\n`;
  });

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
  a.download = `پرونده_استعدادیابی_${athlete.name.replace(/\s+/g, '_')}_${athlete.nationalCode || 'MTM2'}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Populate Athlete Profile Modal Fields
function populateAthleteModalInputs() {
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val !== undefined ? val : ''; };
  setVal('inputAthleteName', athlete.name);
  setVal('inputAthleteNationalCode', athlete.nationalCode || '');
  setVal('inputAthleteBirthDate', athlete.birthDate || '');
  setVal('inputAthleteGender', athlete.gender || 'پسر');
  setVal('inputAthletePhone', athlete.phone || '');
  setVal('inputAthleteEmail', athlete.email || '');
  setVal('inputAthleteSchool', athlete.school || '');
  setVal('inputAthleteCity', athlete.city || '');
  setVal('inputAthleteCoach', athlete.coach || '');
  setVal('inputAthleteSport', athlete.sport || 'هندبال');
  setVal('inputAthletePosition', athlete.position || 'بغل');
  setVal('inputAthleteHand', athlete.dominantHand || (athlete.hand === 'left' ? 'چپ' : 'راست'));
  setVal('inputAthleteFoot', athlete.dominantFoot || 'راست');
  setVal('inputAthleteEye', athlete.dominantEye || 'راست');
  setVal('inputAthleteAge', athlete.age || 16);
  setVal('inputAthleteWeight', athlete.weight || 68);
  setVal('inputAthleteHeight', athlete.height || 178);
  setVal('inputFatherHeight', athlete.fatherHeight || 182);
  setVal('inputMotherHeight', athlete.motherHeight || 167);

  const imgPrev = document.getElementById('imgAthleteAvatarPreview');
  if (imgPrev) imgPrev.src = athlete.photoUrl || 'icon.svg';

  const recs = calculateSportRecommendations(athlete, anthroData, testsData);
  const boxRec = document.getElementById('boxSportRecommendationsModal');
  if (boxRec) {
    boxRec.innerHTML = recs.map((r, idx) => `
      <div style="background: rgba(30, 41, 59, 0.7); border: 1px solid #334155; border-radius: 6px; padding: 6px 10px; display: flex; align-items: center; justify-content: space-between; font-size: 11px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="background: ${r.badgeColor}; color: #fff; padding: 2px 7px; border-radius: 4px; font-weight: bold; font-size: 10px;">رتبه ${idx + 1}</span>
          <strong style="color: #f8fafc;">${r.sport}</strong>
          <span style="color: #94a3b8; font-size: 10px;">(پست برتر: ${r.bestPosition})</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="color: #94a3b8; font-size: 9.5px;">${r.reasons}</span>
          <span style="font-weight: bold; color: #38bdf8; font-size: 12px;">${r.score}٪</span>
        </div>
      </div>
    `).join('');
  }
}

// Instant Webcam Avatar Capture
function captureWebcamPhoto() {
  try {
    const snapCanvas = document.createElement('canvas');
    snapCanvas.width = 240;
    snapCanvas.height = 240;
    const sCtx = snapCanvas.getContext('2d');

    const src = (videoEl && videoEl.videoWidth > 0) ? videoEl : ((imageEl && imageEl.src) ? imageEl : canvasEl);
    if (!src) {
      alert('تصویر یا دوربینی در حال حاضر فعال نیست.');
      return;
    }

    const sw = src.videoWidth || src.naturalWidth || src.width;
    const sh = src.videoHeight || src.naturalHeight || src.height;
    const minDim = Math.min(sw, sh);
    const sx = (sw - minDim) / 2;
    const sy = (sh - minDim) / 2;

    sCtx.drawImage(src, sx, sy, minDim, minDim, 0, 0, 240, 240);
    const dataUrl = snapCanvas.toDataURL('image/jpeg', 0.9);
    athlete.photoUrl = dataUrl;
    saveAthleteToStorage();

    const imgPrev = document.getElementById('imgAthleteAvatarPreview');
    if (imgPrev) imgPrev.src = dataUrl;
    const imgCard = document.getElementById('cardAthletePhoto');
    if (imgCard) imgCard.src = dataUrl;
    const imgRpt = document.getElementById('rptAthleteAvatar');
    if (imgRpt) imgRpt.src = dataUrl;

    alert('✅ عکس چهره ورزشکار با موفقیت از تصویر جاری ضبط و در پرونده ثبت شد.');
  } catch(err) {
    alert('خطا در عکس‌برداری از وب‌کم: ' + err.message);
  }
}

// Athlete Profile Manager Controller
function initAthleteManager() {
  const athleteModal = document.getElementById('modalAthlete');

  const openAthleteModal = () => {
    populateAthleteModalInputs();
    athleteModal?.classList.add('active');
  };
  document.getElementById('btnAthleteProfile')?.addEventListener('click', openAthleteModal);
  document.getElementById('btnQuickEditAthlete')?.addEventListener('click', openAthleteModal);
  document.getElementById('btnCloseAthleteModal')?.addEventListener('click', () => athleteModal?.classList.remove('active'));

  document.getElementById('btnSaveAthleteProfile')?.addEventListener('click', () => {
    const getVal = (id, def) => { const el = document.getElementById(id); return el ? el.value.trim() : def; };
    athlete.name = getVal('inputAthleteName', 'ورزشکار');
    athlete.nationalCode = getVal('inputAthleteNationalCode', '');
    athlete.birthDate = getVal('inputAthleteBirthDate', '');
    athlete.gender = getVal('inputAthleteGender', 'پسر');
    athlete.phone = getVal('inputAthletePhone', '');
    athlete.email = getVal('inputAthleteEmail', '');
    athlete.school = getVal('inputAthleteSchool', '');
    athlete.city = getVal('inputAthleteCity', '');
    athlete.coach = getVal('inputAthleteCoach', '');
    athlete.sport = getVal('inputAthleteSport', 'هندبال');
    athlete.position = getVal('inputAthletePosition', 'بغل');
    athlete.dominantHand = getVal('inputAthleteHand', 'راست');
    athlete.hand = athlete.dominantHand === 'چپ' ? 'left' : 'right';
    athlete.dominantFoot = getVal('inputAthleteFoot', 'راست');
    athlete.dominantEye = getVal('inputAthleteEye', 'راست');
    athlete.age = Number(getVal('inputAthleteAge', 16));
    athlete.weight = Number(getVal('inputAthleteWeight', 68));
    athlete.height = Number(getVal('inputAthleteHeight', 178));
    anthroData.height = athlete.height;
    athlete.fatherHeight = Number(getVal('inputFatherHeight', 182));
    athlete.motherHeight = Number(getVal('inputMotherHeight', 167));

    saveAthleteToStorage();
    athleteModal?.classList.remove('active');
    alert(`✅ پرونده بیومتریک ${athlete.name} با موفقیت ذخیره و به‌روزرسانی شد.`);
  });

  // Switch Athlete Listeners
  document.getElementById('selTopAthlete')?.addEventListener('change', (e) => switchAthlete(e.target.value));
  document.getElementById('selAthleteModal')?.addEventListener('change', (e) => switchAthlete(e.target.value));

  // Add New Athlete
  const addNew = () => {
    const newName = prompt('لطفاً نام و نام خانوادگی ورزشکار جدید را وارد نمایید:', 'ورزشکار جدید');
    if (!newName || !newName.trim()) return;

    const newId = 'ath_' + Date.now();
    const newAthlete = {
      id: newId,
      name: newName.trim(),
      nationalCode: '',
      birthDate: '',
      gender: 'پسر',
      phone: '',
      email: '',
      school: '',
      city: 'تهران',
      coach: athlete.coach || 'استاد مرادی',
      sport: 'هندبال',
      position: 'بغل',
      dominantHand: 'راست',
      dominantFoot: 'راست',
      dominantEye: 'راست',
      hand: 'راست',
      age: 16,
      weight: 68,
      height: 178,
      fatherHeight: 182,
      motherHeight: 167,
      photoUrl: '',
      anthroData: JSON.parse(JSON.stringify(anthroData)),
      testsData: JSON.parse(JSON.stringify(testsData)),
      testSessions: []
    };

    athletesDB.push(newAthlete);
    switchAthlete(newId);
    openAthleteModal();
  };
  document.getElementById('btnTopAddAthlete')?.addEventListener('click', addNew);
  document.getElementById('btnModalAddAthlete')?.addEventListener('click', addNew);

  // Delete Current Athlete
  document.getElementById('btnModalDeleteAthlete')?.addEventListener('click', () => {
    if (athletesDB.length <= 1) {
      alert('حداقل یک ورزشکار باید در سامانه ثبت باشد.');
      return;
    }
    if (confirm(`آیا از حذف پرونده "${athlete.name}" اطمینان دارید؟`)) {
      athletesDB = athletesDB.filter(a => a.id !== athlete.id);
      switchAthlete(athletesDB[0].id);
    }
  });

  // Instant Webcam Photo Capture
  document.getElementById('btnCapturePhotoWebcam')?.addEventListener('click', () => {
    captureWebcamPhoto();
  });

  // Photo File Upload
  document.getElementById('inputAthletePhotoUpload')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      athlete.photoUrl = ev.target.result;
      saveAthleteToStorage();
      const imgPrev = document.getElementById('imgAthleteAvatarPreview');
      if (imgPrev) imgPrev.src = athlete.photoUrl;
      const imgCard = document.getElementById('cardAthletePhoto');
      if (imgCard) imgCard.src = athlete.photoUrl;
      const imgRpt = document.getElementById('rptAthleteAvatar');
      if (imgRpt) imgRpt.src = athlete.photoUrl;
    };
    reader.readAsDataURL(file);
  });

  // Remove Photo
  document.getElementById('btnRemovePhoto')?.addEventListener('click', () => {
    athlete.photoUrl = '';
    saveAthleteToStorage();
    const imgPrev = document.getElementById('imgAthleteAvatarPreview');
    if (imgPrev) imgPrev.src = 'icon.svg';
    const imgCard = document.getElementById('cardAthletePhoto');
    if (imgCard) imgCard.src = 'icon.svg';
    const imgRpt = document.getElementById('rptAthleteAvatar');
    if (imgRpt) imgRpt.src = 'icon.svg';
  });

  // Storage Directory Picker
  document.getElementById('btnPickStorageFolder')?.addEventListener('click', () => {
    pickStorageFolder();
  });
}

// History & Archive System
function initHistoryArchive() {
  const historyModal = document.getElementById('modalHistory');

  const openHistory = () => {
    renderHistorySessions();
    historyModal?.classList.add('active');
  };

  document.getElementById('btnTestHistory')?.addEventListener('click', openHistory);
  document.getElementById('btnQuickHistory')?.addEventListener('click', openHistory);
  document.getElementById('btnCloseHistoryModal')?.addEventListener('click', () => historyModal?.classList.remove('active'));

  document.getElementById('selHistoryAthleteFilter')?.addEventListener('change', (e) => {
    switchAthlete(e.target.value);
  });

  const archiveCurrent = () => {
    archiveCurrentTestSession();
  };
  document.getElementById('btnSaveCurrentSessionArchive')?.addEventListener('click', archiveCurrent);
  document.getElementById('btnQuickArchiveSession')?.addEventListener('click', archiveCurrent);
}

function archiveCurrentTestSession() {
  try {
    let snapUrl = '';
    try {
      const snapCanvas = document.createElement('canvas');
      snapCanvas.width = canvasEl.width;
      snapCanvas.height = canvasEl.height;
      const sCtx = snapCanvas.getContext('2d');
      if (currentMediaSource === 'image' && imageEl && imageEl.style.display !== 'none') {
        sCtx.drawImage(imageEl, 0, 0, snapCanvas.width, snapCanvas.height);
      } else if (videoEl && videoEl.style.display !== 'none') {
        sCtx.drawImage(videoEl, 0, 0, snapCanvas.width, snapCanvas.height);
      }
      sCtx.drawImage(canvasEl, 0, 0);
      snapUrl = snapCanvas.toDataURL('image/jpeg', 0.85);
    } catch(e) {}

    const now = new Date();
    const session = {
      id: 'sess_' + Date.now(),
      dateStr: now.toLocaleDateString('fa-IR'),
      timeStr: now.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
      timestamp: Date.now(),
      athleteId: athlete.id,
      athleteName: athlete.name,
      anthro: JSON.parse(JSON.stringify(anthroData)),
      tests: JSON.parse(JSON.stringify(testsData)),
      recommendations: calculateSportRecommendations(athlete, anthroData, testsData),
      snapshot: snapUrl
    };

    if (!athlete.testSessions) athlete.testSessions = [];
    athlete.testSessions.unshift(session);
    saveAthleteToStorage();
    renderHistorySessions();

    alert(`✅ جلسه ارزیابی مورخ ${session.dateStr} با موفقیت توسط مربی تایید و در بایگانی پرونده ${athlete.name} ذخیره گردید.`);
  } catch(err) {
    alert('خطا در بایگانی آزمون: ' + err.message);
  }
}

function renderHistorySessions() {
  const container = document.getElementById('historySessionsList');
  if (!container) return;

  const sessions = athlete.testSessions || [];
  if (sessions.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 24px; color: #94a3b8; font-size: 11.5px; background: rgba(30, 41, 59, 0.4); border: 1px dashed #334155; border-radius: 8px;">
        ℹ️ هنوز هیچ جلسه آزمونی برای <strong>${athlete.name}</strong> بایگانی نشده است.<br>
        جهت ثبت اولین ارزیابی، روی دکمه "💾 تایید مربی و بایگانی آزمون فعلی" کلیک فرمایید.
      </div>
    `;
    return;
  }

  container.innerHTML = sessions.map((sess, idx) => `
    <div style="background: rgba(15, 23, 42, 0.85); border: 1px solid #334155; border-radius: 8px; padding: 10px; display: flex; gap: 10px; align-items: center; justify-content: space-between;">
      <div style="display: flex; gap: 10px; align-items: center;">
        <div style="width: 60px; height: 45px; border-radius: 6px; overflow: hidden; background: #000; border: 1px solid #475569; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
          ${sess.snapshot ? `<img src="${sess.snapshot}" alt="فریم" style="width: 100%; height: 100%; object-fit: cover;">` : `<span style="font-size: 16px;">📷</span>`}
        </div>
        <div>
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 3px;">
            <strong style="color: #38bdf8; font-size: 12px;">جلسه ${sessions.length - idx} • ${sess.dateStr} (${sess.timeStr})</strong>
            <span style="font-size: 9px; background: rgba(34, 197, 94, 0.2); color: #4ade80; padding: 1px 5px; border-radius: 4px; font-weight: bold;">تایید مربی ✓</span>
          </div>
          <div style="font-size: 10.5px; color: #cbd5e1; display: flex; gap: 8px; flex-wrap: wrap;">
            <span>قد: <strong>${sess.anthro.height}cm</strong></span>
            <span>Wingspan: <strong>${sess.anthro.wingspan}cm</strong></span>
            <span>پرش: <strong>${sess.tests.jump.maxHeight || 0}cm</strong></span>
            <span>دوی ۵متر: <strong>${sess.tests.run5m.time ? sess.tests.run5m.time.toFixed(2) + 's' : '--'}</strong></span>
            <span>پلانک: <strong>${formatTimer(sess.tests.plank.timeSec || 0)}</strong></span>
          </div>
        </div>
      </div>
      <div style="display: flex; gap: 5px;">
        <button type="button" class="btn-ctrl-action" onclick="restoreHistoricalSession('${sess.id}')" title="بارگذاری این مقادیر در استودیو">
          <span>👁️ بازبینی</span>
        </button>
        <button type="button" class="btn-ctrl-action" style="color: #f87171;" onclick="deleteHistoricalSession('${sess.id}')" title="حذف این رکورد">
          <span>✕</span>
        </button>
      </div>
    </div>
  `).join('');
}

window.restoreHistoricalSession = function(sessId) {
  const sess = (athlete.testSessions || []).find(s => s.id === sessId);
  if (!sess) return;
  if (confirm(`آیا می‌خواهید رکوردهای جلسه مورخ ${sess.dateStr} در سامانه بارگذاری و بازبینی شوند؟`)) {
    anthroData = Object.assign(anthroData, sess.anthro);
    testsData = Object.assign(testsData, sess.tests);
    updateAnthroPanelUI();
    document.getElementById('modalHistory')?.classList.remove('active');
    document.getElementById('btnExportReport')?.click();
  }
};

window.deleteHistoricalSession = function(sessId) {
  if (confirm('آیا از حذف این جلسه ارزیابی از بایگانی اطمینان دارید؟')) {
    athlete.testSessions = (athlete.testSessions || []).filter(s => s.id !== sessId);
    saveAthleteToStorage();
    renderHistorySessions();
  }
};

// Device Storage Picker
async function pickStorageFolder() {
  if (typeof window.showDirectoryPicker === 'function') {
    try {
      currentStorageDirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      const pathLbl = document.getElementById('lblCurrentStoragePath');
      if (pathLbl) {
        pathLbl.textContent = `📁 پوشه متصل: ${currentStorageDirHandle.name} (ذخیره‌سازی مستقیم روی هارد)`;
        pathLbl.style.color = '#4ade80';
      }
      alert(`✅ پوشه "${currentStorageDirHandle.name}" به عنوان مسیر ذخیره‌سازی دستگاه انتخاب شد.\nاز این پس پرونده، کارنامه، تصاویر و فایل‌های اکسل در این پوشه آرشیو می‌شوند.`);
    } catch(err) {
      if (err.name !== 'AbortError') alert('خطا در انتخاب پوشه: ' + err.message);
    }
  } else {
    alert('مرورگر شما از انتخاب دایرکتوری مستقیم پشتیبانی نمی‌کند؛ فایل‌ها مستقیماً در پوشه Downloads دستگاه بارگیری می‌شوند.');
  }
}

// Save Full Archive to Local Hard Drive Folder or Download
async function saveAthleteArchiveToDevice() {
  const now = new Date();
  const dateStr = now.toLocaleDateString('fa-IR').replace(/\//g, '-');
  const safeName = athlete.name.replace(/\s+/g, '_');
  const folderName = `${safeName}_${athlete.nationalCode || 'archive'}`;

  let csv = '\uFEFFشناسه ورزشکار,نام,کد ملی,تاریخ ارزیابی,شاخص یا آزمون,مقدار\r\n';
  csv += `${athlete.id},${athlete.name},${athlete.nationalCode || ''},${dateStr},قد ایستاده,${anthroData.height} cm\r\n`;
  csv += `${athlete.id},${athlete.name},${athlete.nationalCode || ''},${dateStr},گستره بازوها,${anthroData.wingspan} cm\r\n`;
  csv += `${athlete.id},${athlete.name},${athlete.nationalCode || ''},${dateStr},شاخص میمونی,${anthroData.apeIndex}\r\n`;
  csv += `${athlete.id},${athlete.name},${athlete.nationalCode || ''},${dateStr},اهرم پرتاب,${anthroData.armLever} cm\r\n`;
  csv += `${athlete.id},${athlete.name},${athlete.nationalCode || ''},${dateStr},دوی ۵ متر,${testsData.run5m.time.toFixed(2)}s\r\n`;
  csv += `${athlete.id},${athlete.name},${athlete.nationalCode || ''},${dateStr},پرش عمودی,${testsData.jump.maxHeight} cm\r\n`;
  csv += `${athlete.id},${athlete.name},${athlete.nationalCode || ''},${dateStr},پرش طول درجا,${testsData.longJump.bestDist || testsData.longJump.distanceCm || 0} cm\r\n`;
  csv += `${athlete.id},${athlete.name},${athlete.nationalCode || ''},${dateStr},پلانک,${formatTimer(testsData.plank.timeSec)}\r\n`;
  csv += `${athlete.id},${athlete.name},${athlete.nationalCode || ''},${dateStr},شنا سوئدی,${testsData.pushup.reps}\r\n`;
  csv += `${athlete.id},${athlete.name},${athlete.nationalCode || ''},${dateStr},اسکات عمیق,${testsData.squat.reps}\r\n`;
  csv += `${athlete.id},${athlete.name},${athlete.nationalCode || ''},${dateStr},لانژ,${testsData.lunge.reps}\r\n`;

  if (currentStorageDirHandle) {
    try {
      const athleteSubDir = await currentStorageDirHandle.getDirectoryHandle(folderName, { create: true });

      const csvFile = await athleteSubDir.getFileHandle(`سوابق_${safeName}_${dateStr}.csv`, { create: true });
      const csvWritable = await csvFile.createWritable();
      await csvWritable.write(csv);
      await csvWritable.close();

      const jsonFile = await athleteSubDir.getFileHandle(`پرونده_${safeName}.json`, { create: true });
      const jsonWritable = await jsonFile.createWritable();
      await jsonWritable.write(JSON.stringify(athlete, null, 2));
      await jsonWritable.close();

      alert(`✅ پرونده کامل، سوابق و اکسل با موفقیت در پوشه ذخیره شد:\n${currentStorageDirHandle.name} / ${folderName}`);
      return;
    } catch(err) {
      console.warn('Direct file write error, fallback to export:', err);
    }
  }

  exportExcelReport();
  exportPdfReport();
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
