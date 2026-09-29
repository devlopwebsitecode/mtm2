# Changelog

All notable changes to the **MTM2 (Motion Tracker & Handball Talent Studio)** project will be documented in this file.

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
