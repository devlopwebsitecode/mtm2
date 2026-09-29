# Changelog

All notable changes to the **MTM2 (Motion Tracker & Handball Talent Studio)** project will be documented in this file.

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
