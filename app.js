// app.js (type=module)
// Uses MediaPipe Holistic + Camera + Drawing utils
// Place this file in same folder as index.html

import { Holistic } from 'https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5/holistic.js';
import { Camera } from 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.4/camera_utils.js';
import { drawConnectors, drawLandmarks } from 'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils@0.4/drawing_utils.js';
import { POSE_CONNECTIONS } from 'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/pose.js';
import { HAND_CONNECTIONS } from 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/hands.js';
import { FACEMESH_TESSELATION } from 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/face_mesh.js';

// DOM
const video = document.getElementById('video');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d', { alpha: true });
const fpsLabel = document.getElementById('fps');
const switchBtn = document.getElementById('btnSwitch');
const nameLabel = document.getElementById('name');

let cameraInstance = null;
let holistic = null;
let lastFpsTime = performance.now();
let frames = 0;
let currentFacing = 'environment'; // default use back camera
let mirrorBackCamera = true; // per request: mirror back camera

// Resize canvas to match video pixel size (we will draw in video coordinates)
function resizeCanvas() {
  const vw = video.videoWidth || window.innerWidth;
  const vh = video.videoHeight || window.innerHeight;
  canvas.width = vw;
  canvas.height = vh;
}

// Draw results from Holistic
function onResults(results) {
  // Ensure canvas size
  resizeCanvas();

  // Clear and prepare
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Mirror logic: if we want to mirror the preview for camera
  // If camera is mirrored, we flip horizontally
  const shouldMirror = (currentFacing === 'user') ? true : mirrorBackCamera;
  if (shouldMirror) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }

  // Draw face mesh (optional, light)
  if (results.faceLandmarks) {
    drawConnectors(ctx, results.faceLandmarks, FACEMESH_TESSELATION, { lineWidth: 0.5, color: 'rgba(255,255,255,0.08)' });
  }

  // Draw pose (body) connections + landmarks
  if (results.poseLandmarks) {
    drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, { color: 'rgba(0,200,255,0.9)', lineWidth: Math.max(2, canvas.width * 0.002) });
    drawLandmarks(ctx, results.poseLandmarks, { color: 'white', lineWidth: 1, radius: Math.max(2, canvas.width * 0.006) });
  }

  // Draw left & right hands with detailed fingers (21 landmarks)
  if (results.leftHandLandmarks) {
    drawConnectors(ctx, results.leftHandLandmarks, HAND_CONNECTIONS, { color: 'rgba(255,100,100,0.95)', lineWidth: Math.max(2, canvas.width * 0.004) });
    drawLandmarks(ctx, results.leftHandLandmarks, { color: 'white', lineWidth: 1, radius: Math.max(2, canvas.width * 0.007) });
  }
  if (results.rightHandLandmarks) {
    drawConnectors(ctx, results.rightHandLandmarks, HAND_CONNECTIONS, { color: 'rgba(100,255,100,0.95)', lineWidth: Math.max(2, canvas.width * 0.004) });
    drawLandmarks(ctx, results.rightHandLandmarks, { color: 'white', lineWidth: 1, radius: Math.max(2, canvas.width * 0.007) });
  }

  // Optional: highlight palm area by connecting certain hand points (visual)
  // (the drawConnectors above already draws full fingers so palm lines visible)

  ctx.restore();

  // FPS
  frames++;
  const now = performance.now();
  if (now - lastFpsTime >= 1000) {
    fpsLabel.textContent = `FPS: ${frames}`;
    frames = 0;
    lastFpsTime = now;
  }
}

// Initialize MediapPipe Holistic + Camera
async function initHolistic() {
  holistic = new Holistic({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5/${file}`
  });

  holistic.setOptions({
    modelComplexity: 1,      // 0..2 higher = slower, more accurate
    smoothLandmarks: true,
    enableSegmentation: false,
    refineFaceLandmarks: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });

  holistic.onResults(onResults);

  // Start camera with facingMode
  await startCamera(currentFacing);
}

// Start camera using MediaDevices + MediaPipe Camera helper
async function startCamera(facingMode) {
  // Stop previous camera if exists
  if (cameraInstance) {
    try {
      cameraInstance.stop();
    } catch (e) {}
    cameraInstance = null;
  }
  // Stop any tracks on video element
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(t => t.stop());
    video.srcObject = null;
  }

  // Request media with ideal facingMode
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });

    // attach stream to video for fallback / preview (camera util uses video internally)
    video.srcObject = stream;
    await video.play();
    resizeCanvas();

    // Create MediaPipe Camera that repeatedly sends frames to holistic
    cameraInstance = new Camera(video, {
      onFrame: async () => {
        await holistic.send({ image: video });
      },
      width: video.videoWidth || 1280,
      height: video.videoHeight || 720
    });

    cameraInstance.start();

    // set mirror behavior visually: we draw mirrored inside onResults based on currentFacing
    // but also keep video element mirrored if you want to view it (video is hidden though)
    if (currentFacing === 'user') {
      video.style.transform = 'scaleX(-1)';
    } else {
      // If user wants back camera mirrored, also mirror video element
      video.style.transform = mirrorBackCamera ? 'scaleX(-1)' : '';
    }

  } catch (err) {
    console.error('Gagal mengakses kamera:', err);
    alert('Gagal mengakses kamera. Periksa izin kamera di browser / gunakan HTTPS atau localhost. \nDetail: ' + (err && err.message ? err.message : err));
  }
}

// Switch camera button handler
switchBtn.addEventListener('click', async () => {
  currentFacing = currentFacing === 'environment' ? 'user' : 'environment';
  // restart camera with new facing
  await startCamera(currentFacing);
});

// Kick off
initHolistic().catch(err => {
  console.error('Init error', err);
  alert('Init error: ' + (err && err.message ? err.message : err));
});

// Resize canvas on window resize to keep aspect fit
window.addEventListener('resize', () => {
  resizeCanvas();
});
