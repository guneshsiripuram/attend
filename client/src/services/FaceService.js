import * as faceapi from 'face-api.js';

const MODEL_URL = '/models';
const DETECTION_OPTIONS = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.6 });

const QUALITY_THRESHOLDS = {
  minConfidence: 0.78,
  minFaceWidthRatio: 0.18,
  minFaceHeightRatio: 0.22,
  maxHorizontalOffsetRatio: 0.22,
  maxVerticalOffsetRatio: 0.25,
  maxEyeTiltDegrees: 12,
  maxYawRatio: 0.18,
  minBrightness: 50,
  maxBrightness: 215,
  minSharpness: 7
};

// Shared canvas reused for brightness/sharpness analysis (browser only).
const qualityCanvas = () => {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  return c;
};

const centerOf = (points) => {
  let x = 0, y = 0;
  for (const p of points) { x += p.x; y += p.y; }
  return { x: x / points.length, y: y / points.length };
};

class FaceService {
  constructor() {
    this.modelsLoaded = false;
    this.modelsLoading = false;
    this.loadingPromise = null;
    this.loadProgress = 0;
    this.onProgress = null;
  }

  async loadModels() {
    if (this.modelsLoaded) return true;
    if (this.modelsLoading && this.loadingPromise) return this.loadingPromise;

    this.modelsLoading = true;
    this.loadProgress = 0.05;
    this.loadingPromise = (async () => {
      try {
        // Load sequentially so the UI can show meaningful progress.
        await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
        this.setProgress(0.4);
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
        this.setProgress(0.7);
        await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
        this.setProgress(1);
        this.modelsLoaded = true;
        return true;
      } catch (error) {
        this.modelsLoaded = false;
        this.loadingPromise = null;
        throw error;
      } finally {
        this.modelsLoading = false;
      }
    })();

    return this.loadingPromise;
  }

  setProgress(value) {
    this.loadProgress = value;
    if (typeof this.onProgress === 'function') {
      this.onProgress(value);
    }
  }

  /**
   * Downscaled grayscale + variance-of-Laplacian sharpness and mean brightness.
   * Cheap enough to run per-frame during liveness checks.
   */
  analyzeImageStats(img) {
    if (typeof document === 'undefined') return { brightness: 127, sharpness: 99 };
    const canvas = qualityCanvas();
    const maxDim = 200;
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const w = canvas.width, h = canvas.height;
    const gray = new Float32Array(w * h);
    let sum = 0;
    for (let i = 0; i < gray.length; i++) {
      gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
      sum += gray[i];
    }
    const brightness = sum / gray.length;
    let s = 0, sSq = 0, n = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        const lap = gray[idx - 1] + gray[idx + 1] + gray[idx - w] + gray[idx + w] - 4 * gray[idx];
        s += lap; sSq += lap * lap; n++;
      }
    }
    const mean = n ? s / n : 0;
    const sharpness = n ? Math.sqrt(Math.max(0, sSq / n - mean * mean)) : 0;
    return { brightness, sharpness };
  }

  /**
   * Applies the quality gates. Returns an array of human-readable problems;
   * empty array means the frame passed.
   */
  evaluateQuality(img, detection) {
    const reasons = [];
    const iw = img.width, ih = img.height;
    if (!iw || !ih) return ['Frame unavailable'];

    const box = detection.box;
    if (detection.score < QUALITY_THRESHOLDS.minConfidence) reasons.push('low confidence');
    if (box.width / iw < QUALITY_THRESHOLDS.minFaceWidthRatio) reasons.push('face too small');
    if (box.height / ih < QUALITY_THRESHOLDS.minFaceHeightRatio) reasons.push('face too small');

    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const hOff = Math.abs(cx - iw / 2) / iw;
    const vOff = Math.abs(cy - ih / 2) / ih;
    if (hOff > QUALITY_THRESHOLDS.maxHorizontalOffsetRatio) reasons.push('face not centered horizontally');
    if (vOff > QUALITY_THRESHOLDS.maxVerticalOffsetRatio) reasons.push('face not centered vertically');

    if (detection.landmarks) {
      const left = centerOf(detection.landmarks.getLeftEye());
      const right = centerOf(detection.landmarks.getRightEye());
      const tilt = Math.abs((Math.atan2(right.y - left.y, right.x - left.x) * 180) / Math.PI);
      if (tilt > QUALITY_THRESHOLDS.maxEyeTiltDegrees) reasons.push('head tilted');

      const nose = detection.landmarks.getNose()[0];
      if (nose && box.width > 0) {
        const yaw = Math.abs(nose.x - cx) / box.width;
        if (yaw > QUALITY_THRESHOLDS.maxYawRatio) reasons.push('face turned sideways');
      }
    }

    const { brightness, sharpness } = this.analyzeImageStats(img);
    if (brightness < QUALITY_THRESHOLDS.minBrightness || brightness > QUALITY_THRESHOLDS.maxBrightness) reasons.push('poor lighting');
    if (sharpness < QUALITY_THRESHOLDS.minSharpness) reasons.push('blurry image');

    return reasons;
  }

  async analyzeBase64(base64Image, options = { isEnrollment: false }) {
    if (!base64Image) return { isGood: false, reason: 'Empty image' };
    if (!this.modelsLoaded) await this.loadModels();
    
    try {
      const img = new Image();
      img.src = base64Image;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('Image decode failed'));
      });

      const detectionOptions = options.isEnrollment 
        ? new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }) 
        : DETECTION_OPTIONS;

      const detection = await faceapi
        .detectSingleFace(img, detectionOptions)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) return { isGood: false, reason: 'No face detected. Please face the light source (avoid bright backgrounds).' };

      const problems = this.evaluateQuality(img, detection);
      if (problems.length > 0) {
        return { isGood: false, reason: 'Improve frame: ' + problems.join(', '), detection };
      }

      return {
        isGood: true,
        descriptor: Array.from(detection.descriptor),
        detection: detection
      };
    } catch (err) {
      return { isGood: false, reason: err.message };
    }
  }

  detectBlinkSequence(frameResults) {
    if (!frameResults || frameResults.length < 5) return false;

    const ears = frameResults
      .map(frame => {
        if (!frame?.detection?.landmarks) return null;
        return this.calculateEAR(frame.detection.landmarks);
      })
      .filter(val => typeof val === 'number' && !Number.isNaN(val));

    if (ears.length < 5) return false;

    // Fix Bug 5: Dynamic relative EAR threshold calculation
    // Assume the user starts with open eyes, so max EAR is baseline
    const baselineEAR = Math.max(...ears.slice(0, 3));
    
    // A blink is typically a 20-25% drop in EAR from baseline
    const openThreshold = baselineEAR * 0.90;
    const closedThreshold = baselineEAR * 0.75;
    
    let closedIndex = -1;

    for (let i = 0; i < ears.length; i++) {
      if (ears[i] < closedThreshold) {
        closedIndex = i;
        break;
      }
    }

    if (closedIndex === -1) return false;

    const openBefore = ears.slice(0, closedIndex).some(val => val > openThreshold);
    const openAfter = ears.slice(closedIndex + 1).some(val => val > openThreshold);

    return openBefore && openAfter;
  }

  calculateEAR(landmarks) {
    const leftEye = landmarks.getLeftEye();
    const rightEye = landmarks.getRightEye();

    const getEAR = (eye) => {
      const verticalOne = this.getDistance(eye[1], eye[5]);
      const verticalTwo = this.getDistance(eye[2], eye[4]);
      const horizontal = this.getDistance(eye[0], eye[3]);
      if (!horizontal) return 0;
      return (verticalOne + verticalTwo) / (2 * horizontal);
    };

    return (getEAR(leftEye) + getEAR(rightEye)) / 2;
  }

  getDistance(pointA, pointB) {
    return Math.sqrt(((pointA.x - pointB.x) ** 2) + ((pointA.y - pointB.y) ** 2));
  }

  averageDescriptors(descriptors) {
    if (!descriptors || descriptors.length === 0) return null;
    const valid = descriptors.filter(d => Array.isArray(d) || d instanceof Float32Array);
    if (valid.length === 0) return null;

    const len = valid[0].length;
    const avg = new Float32Array(len);
    for (const desc of valid) {
      for (let i = 0; i < len; i++) avg[i] += desc[i];
    }
    for (let i = 0; i < len; i++) avg[i] /= valid.length;
    return Array.from(avg);
  }
}

export default new FaceService();
