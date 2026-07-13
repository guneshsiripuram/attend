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

class FaceService {
  constructor() {
    this.modelsLoaded = false;
    this.modelsLoading = false;
    this.loadingPromise = null;
  }

  async loadModels() {
    if (this.modelsLoaded) return true;
    if (this.modelsLoading && this.loadingPromise) return this.loadingPromise;

    this.modelsLoading = true;
    this.loadingPromise = (async () => {
      try {
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
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
        ? new faceapi.SsdMobilenetv1Options({ minConfidence: 0.25 }) 
        : DETECTION_OPTIONS;

      const detection = await faceapi
        .detectSingleFace(img, detectionOptions)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) return { isGood: false, reason: 'No face detected. Please face the light source (avoid bright backgrounds).' };

      // Optional: Add quality checks here if needed
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
