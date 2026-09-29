# Changelog

All notable changes to the **MTM2 (Motion Tracker & Handball Talent Studio)** project will be documented in this file.

## [v1.6.1] - 2026-09-29

### 🎥 Media Video & Photo Playback & Black Screen Resolution
- **Direct Canvas Frame Rendering**: The canvas engine now directly draws source video frames and photo bitmaps to canvas memory with aspect-ratio letterboxing. Completely eliminates black screen issues, z-index clashing, and element layering anomalies.
- **HTML5 Video Pipeline Fix**: Explicitly invoked `videoEl.load()` when swapping from live webcam `MediaStream` to local video blob URL, ensuring the video resource loader triggers properly across all Chromium and Safari versions.
- **Camera Stream Track Cleanup**: Active camera tracks are cleanly stopped upon loading external media, preventing webcam hardware locking.
- **Media Upload Trigger Fix**: Upgraded upload button to dedicated interactive button (`#btnUploadMedia`) that clears `fileInput.value` before triggering picker, ensuring `change` events fire every time even when re-selecting the same file.
- **Drag & Drop Media Loading**: Drop any video or photo directly into the camera quadrant (`#cameraStage` / `#quadCamera`) for immediate analysis.
- **Official Report Avatar Sync**: Report profile avatar (`#rptAthleteAvatar`) dynamically displays the athlete's photo with fallback and click-to-edit integration.

## [v1.6.0] - 2026-09-29

### 🕸️ Spider / Radar Chart (نمودار عنکبوتی شایستگی‌های حرکتی و بدنی)
- **Interactive Multi-Axis Biomechanical Radar**: Added an 8-axis high-resolution spider chart (`canvas#canvasReportRadar`) to the official talent report and PDF export.
- Evaluates:
  1. قد و قامت (Stature)
  2. شاخص دست و بالاتنه (Ape Index & Arm Span)
  3. انفجار پایین‌تنه (Vertical & Long Jump)
  4. شتاب و چابکی (Sprint Velocity)
  5. استقامت عضلانی (Plank & Push-ups)
  6. ثبات مفصلی و تعادل (Squat & Lunge Alignment)
  7. توده عضلانی (LBM & Body Composition)
  8. آنتروپومتری دست (Hand Span & Throwing Lever)
- Concentric polygon guidance grids, emerald/cyan gradient polygon fills, and percentage labels.

### 👤 Comprehensive Athlete Profile & Instant Photo Capture
- **New Demographic & Sporting Biometrics**:
  - National ID Code (کد ملی), Birth Date (تاریخ تولد), Gender (جنسیت پسر / دختر).
  - Contact Details: Mobile Phone (شماره موبایل), Email (ایمیل).
  - Training Context: School/Academy (مدرسه / آکادمی), City/Province (شهر / استان), Coach Name (نام مربی).
  - Lateral Dominance: Dominant Throwing Hand (دست برتر), Dominant Foot (پای برتر), Dominant Eye (چشم برتر).
- **Instant Webcam Snapshot (`📸 عکس فوری از وب‌کم`)**: One-click frame grab directly from live camera feed into the athlete's profile with instant crop and preview.
- **Photo File Upload (`📁 بارگذاری عکس`)**: Support for PNG, JPG, WEBP photo upload with local storage persistence and report embedding.

### 🏆 Multi-Athlete Management & Switcher
- **Multi-Player Database**: Add unlimited athletes via top navigation bar or profile modal.
- **Instant Athlete Switcher**: Dropdown in top header (`#selTopAthlete`) and modal (`#selAthleteModal`).
- Switching athlete dynamically swaps active profile, biometrics, field test records, test histories, and official report in real time.

### 🎯 AI Multi-Sport Talent Recommendation (اولویت‌بندی رشته‌های ورزشی)
- **Scientific Biomechanical Profiling Engine**: Evaluates ape index, hand span, stature, lower-body explosive power, and sprint velocity to rank suitable sports with percentage suitability and detailed coaching rationale:
  - **هندبال (Handball)**: Ape Index > 1.02, Hand Span > 21cm, Stature > 180cm, Sprint & Jump power.
  - **بسکتبال (Basketball)**: Extreme stature and wingspan leverage, vertical jumping competency.
  - **والیبال (Volleyball)**: High vertical jump, shoulder mobility, arm swing radius.
  - **دو و میدانی - سرعت و پرش‌ها (Track & Field)**: High horizontal sprint velocity and standing long jump.
  - **شنا (Swimming)**: High trunk-to-leg ratio (Cormic index), long torso, broad shoulder biacromial diameter.
- Displayed in live profile card, athlete modal, official talent report, and Excel/CSV exports.

### 📂 Test History Archive & Local Device Storage
- **Coach Verification & Archive Workflow (`💾 تایید مربی و بایگانی آزمون فعلی`)**:
  - Coach inspection modal (`#modalHistory`) with historical timeline cards.
  - Retains test timestamp, coach notes, snapshot thumbnail, all 10 anthro scores, and 8 field test kinematic metrics.
  - One-click historical session reload (`👁️ بازبینی سوابق`) to inspect or re-export past tests.
- **Custom Local Device Storage Path**:
  - Integrated File System Access API (`window.showDirectoryPicker()`) allowing coaches to select their preferred local device directory (e.g. `D:\MTM2_Archive\`).
  - Automatically structures folders per athlete (`/نام_کدملی/`) and writes full athlete profiles, PDF/HTML reports, CSV data, and session JSON files directly to local storage.
  - Automatic download fallback for mobile and restricted browsers.

### 🎥 Media File Picker Fix
- Converted video/photo upload trigger to native `<label for="mediaFileInput">`, guaranteeing instant, reliable file browser opening on all browsers and operating systems without synthetic event interception.

## [v1.4.0] - 2026-09-29

### 🪟 Advanced Studio Window Manager & Bug Fixes
- **Resolved Disappearing Window Bug**: Eliminated inline `style.display` modifications from mobile tab switching that corrupted desktop 4-quad layout when clicking "۱۰ شاخص" or "آزمون‌های میدانی".
- **Interactive Draggable Center Cross Splitter (`✛`)**: Drag the center intersection to smoothly resize column widths and row heights (`--col-split`, `--row-split` from 15% to 85%), with double-click reset to 50/50.
- **Full Studio Maximize / Focus (`⛶`)**: Expand any individual quadrant to 100% workspace size for deep analysis with instant restore (`❐`).
- **Header Minimize (`_`)**: Collapse any window down to its header bar (38px) with expand toggle (`🗖`).
- **Temporary Close (`✕`) & Dynamic Grid Rebalancing**: Hide any unused window; the remaining active windows automatically rebalance across the workspace.
- **Picture-in-Picture Floating Window (`🗗 PiP`)**: Native Windows floating PiP stream (`canvas.captureStream(30)`) rendering live webcam + skeleton + joint angles, allowing coaches to multitask across other apps.
- **Multi-Monitor / TV Projector Pop-Out (`↗ Popout`)**: Detach any quad into an independent browser window for dual-monitor setups, gym projectors, or secondary screens with 60 FPS mirrored canvas.
- **Top Navigation Window Manager**: Quick pinned toggles `[📷 دوربین]`, `[📐 ۱۰ شاخص]`, `[⚡ آزمون‌ها]`, `[👤 کارنامه]` to show/hide any window anytime, plus `[🔄 ریست ۲×۲]` to restore the standard layout.

## [v1.3.0] - 2026-09-29

### 🎨 Visual & Biomechanical HUD Overhaul (Aventuz Academy Style)
- **Minimalist Dark Angle Badges**: Replaced bulky on-joint text with sleek dark glass rounded capsules displaying bold white degree callouts (`131°`, `103°`, `175°`, `8°`, `106°`, `179°`, `127°`).
- **Leader Lines & Joint Indicators**: Connected each angle badge via clean, subtle leader lines to joint vertices with circular angle arc markers.
- **Torso Alignment Box**: Implemented emerald neon alignment box (`[L_Shoulder, R_Shoulder, R_Hip, L_Hip]`) with dashed vertical spinal posture guidelines.
- **Segmented Color Scheme**: Distinct color coding for upper limbs (amber/gold and coral), lower limbs (emerald and coral), and spinal posture.

### 🎛️ Live Analysis Controls Modal
- **Joint Radius Control (`Bolgrootte`)**: Interactive slider (2px to 10px).
- **Line Width Control (`Lijndikte`)**: Interactive slider (1px to 6px).
- **Complement Angle Toggle (`Toon hoek aan de andere kant`)**: Real-time switch for interior vs exterior / valgus angle evaluation.
- **Torso Box Toggle**: Quick switch to show/hide the trunk posture box.
- **Joint Target Angles & Tolerances**: Custom sliders for elbow target, squat knee depth, and lunge rear knee angle.

### 🏃‍♂️ Separated & New Field Tests
- **Standing Long Jump (`longJump`)**: Automatic baseline takeoff coordinate latch, knee flexion preparation tracking, flight phase detection, and horizontal distance calculation in centimeters ($cm$).
- **Plank Endurance Test (`plank`)**: Digital stopwatch timer with start/pause/reset controls, shoulder-hip-ankle line posture tracking, and real-time warnings for hip sagging (<165°) or piking (>192°).
- **Deep Squat (`squat`)**: Dedicated standalone squat depth evaluation (90° target) with real-time knee valgus deviation monitoring.
- **Lunge Analysis (`lunge`)**: Standalone lunge kinematics tracking front knee (90° target), rear knee (120°-135° target), and torso verticality.

### 📊 Reporting & Exports
- Integrated all 8 field tests into the official PDF talent report and Excel (CSV) export.
- Bumped Service Worker cache to `mtm2-cache-v1-3-0` for instant offline asset synchronization.
