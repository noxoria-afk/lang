// app.js
// Pastikan file ini dipanggil setelah DOM ready (index.html memanggil di akhir body)

const video = document.getElementById('video');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d', { alpha: true });
const fpsLabel = document.getElementById('fps');
const switchBtn = document.getElementById('btnSwitch');

let detector = null;
let running = false;

// prefer environment (back) then user
let currentFacing = 'environment'; // 'user' = front, 'environment' = back
let mirrorForUser = true; // mirror when front camera

// FPS calc
let frames = 0;
let lastFpsTime = performance.now();

// model config
const modelConfig = {
  modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING
};

// helper: start camera with facingMode
async function startCamera(facingMode) {
  try {
    if (video.srcObject) {
      video.srcObject.getTracks().forEach(t => t.stop());
    }

    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;

    // detect actual facing (some devices ignore facingMode)
    const track = stream.getVideoTracks()[0];
    const settings = track.getSettings();
    // In some browsers, facingMode exists on track settings
    if (settings && settings.facingMode) {
      if (settings.facingMode === 'user') mirrorForUser = true;
      else mirrorForUser = false;
    } else {
      // fallback keep mirror when requested user camera
      mirrorForUser = (facingMode === 'user');
    }

    // show video element (hidden by CSS earlier) only if needed
    video.style.display = 'block';

    await video.play();
    resizeCanvasToDisplaySize();
  } catch (err) {
    console.error('Gagal mengakses kamera:', err);
    alert('Gagal mengakses kamera. Pastikan izinkan kamera pada browser.');
  }
}

// size canvas to display pixel size of video
function resizeCanvasToDisplaySize() {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;
  // set canvas pixel dimensions to match video resolution for accurate overlay
  canvas.width = vw;
  canvas.height = vh;
  // fit canvas to viewport (CSS handles object-fit:cover), but drawing uses canvas pixels
  // we rely on CSS to scale canvas to full screen while drawing in video coordinate space
}

// draw keypoints+lines with styling similar to sample (menempel ke tubuh)
function drawPose(keypoints) {
  if (!keypoints) return;
  // clear
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // If canvas is scaled with CSS to viewport, we draw in video coordinates.
  // Mirror horizontally if front camera and we want mirrored preview.
  ctx.save();
  if (mirrorForUser) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }

  // draw semi-transparent fill for palm (example: connect specific points)
  // We'll draw lines between adjacent pairs (MoveNet adjacency) and bigger circles on joints.
  ctx.lineWidth = Math.max(2, Math.round(Math.min(canvas.width, canvas.height) * 0.003));
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // draw skeleton edges
  const adjacentPairs = poseDetection.util.getAdjacentPairs(poseDetection.SupportedModels.MoveNet);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.globalCompositeOperation = 'source-over';
  for (const [i, j] of adjacentPairs) {
    const a = keypoints[i];
    const b = keypoints[j];
    if (a.score > 0.35 && b.score > 0.35) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  // draw joints
  for (const kp of keypoints) {
    if (kp.score > 0.35) {
      ctx.beginPath();
      // circle radius relative to canvas size
      const r = Math.max(3, Math.round(Math.min(canvas.width, canvas.height) * 0.008));
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1;
      ctx.arc(kp.x, kp.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  // Example: draw a filled palm polygon if we have a hand keypoints set (MoveNet includes wrists only).
  // If you need detailed finger joints, consider using HandPose/MediaPipe Hands model separately and overlay them.
  ctx.restore();
}

// main loop
async function renderLoop() {
  if (!detector || !video || video.readyState < 2) {
    requestAnimationFrame(renderLoop);
    return;
  }

  // maintain canvas size if video changes
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    resizeCanvasToDisplaySize();
  }

  try {
    const poses = await detector.estimatePoses(video, { maxPoses: 1, flipHorizontal: false });
    if (poses && poses.length > 0) {
      const pose = poses[0];
      // pose.keypoints have {x,y,score,name}
      drawPose(pose.keypoints);
    } else {
      // clear if no pose detected
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  } catch (err) {
    console.error('Estimator error', err);
  }

  // fps counting
  frames++;
  const now = performance.now();
  if (now - lastFpsTime >= 1000) {
    fpsLabel.textContent = `FPS: ${frames}`;
    frames = 0;
    lastFpsTime = now;
  }

  requestAnimationFrame(renderLoop);
}

// init detector + camera
async function init() {
  // set backend
  await tf.setBackend('webgl');
  await tf.ready();

  // create detector (MoveNet)
  detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, modelConfig);

  // start camera with currentFacing
  await startCamera(currentFacing);

  // start loop
  if (!running) {
    running = true;
    renderLoop();
  }
}

// handle switch camera
switchBtn.addEventListener('click', async () => {
  // toggle
  currentFacing = currentFacing === 'environment' ? 'user' : 'environment';
  await startCamera(currentFacing);
});

// start everything
init().catch(err => {
  console.error('Init error', err);
  alert('Terjadi kesalahan saat inisialisasi: ' + err.message);
});