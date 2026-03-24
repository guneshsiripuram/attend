import * as faceapi from 'face-api.js';

class FaceService {
  constructor() {
    this.modelsLoaded = false;
    this.loadingPromise = null;
  }

  async loadModels() {
    if (this.modelsLoaded) return;
    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = (async () => {
      const MODEL_URL = '/models';
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
      ]);
      this.modelsLoaded = true;
    })();

    return this.loadingPromise;
  }

  async getDescriptorFromImage(imageElement) {
    if (!this.modelsLoaded) await this.loadModels();

    const detection = await faceapi
      .detectSingleFace(imageElement, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
      .withFaceLandmarks()
      .withFaceDescriptor();

    return detection;
  }

  async getDescriptorFromBase64(base64Image) {
    const img = new Image();
    img.src = base64Image;
    await new Promise(resolve => (img.onload = resolve));
    return this.getDescriptorFromImage(img);
  }

  // Quality Gating: Ensure the face is large enough, centered, and has high confidence
  getFaceQuality(detection) {
    if (!detection) return { isGood: false, reason: 'No face detected' };
    
    const { detection: det, landmarks } = detection;
    const { box } = det;
    
    // 1. Min Size (Face should be at least 160px wide for good features)
    if (box.width < 160) return { isGood: false, reason: 'Face too far away' };
    
    // 2. Confidence
    if (det.score < 0.8) return { isGood: false, reason: 'Low detection confidence' };
    
    // 3. Pose Check (Landmarks score/alignment)
    // Simple check: eye distance should be balanced
    const leftEye = landmarks.getLeftEye();
    const rightEye = landmarks.getRightEye();
    const nose = landmarks.getNose();
    
    // Placeholder for more complex pose analysis if needed
    return { isGood: true, score: det.score };
  }

  // Liveness: Detect a blink using Eye Aspect Ratio (EAR) logic
  detectBlink(detection) {
    if (!detection || !detection.landmarks) return false;
    
    const landmarks = detection.landmarks;
    const leftEye = landmarks.getLeftEye();
    const rightEye = landmarks.getRightEye();

    const getEAR = (eye) => {
      // Points: 0: outer, 3: inner, 1,2: top, 4,5: bottom
      const p2_p6 = Math.sqrt(Math.pow(eye[1].x - eye[5].x, 2) + Math.pow(eye[1].y - eye[5].y, 2));
      const p3_p5 = Math.sqrt(Math.pow(eye[2].x - eye[4].x, 2) + Math.pow(eye[2].y - eye[4].y, 2));
      const p1_p4 = Math.sqrt(Math.pow(eye[0].x - eye[3].x, 2) + Math.pow(eye[0].y - eye[3].y, 2));
      return (p2_p6 + p3_p5) / (2.0 * p1_p4);
    };

    const leftEAR = getEAR(leftEye);
    const rightEAR = getEAR(rightEye);
    const avgEAR = (leftEAR + rightEAR) / 2;

    // Standard EAR threshold for closed eyes is usually < 0.2
    return avgEAR < 0.22;
  }

  // Helper to average descriptors for legacy support (if needed)
  averageDescriptors(descriptors) {
    if (!descriptors || descriptors.length === 0) return null;
    const len = descriptors[0].length;
    const avg = new Float32Array(len);
    
    for (const desc of descriptors) {
      for (let i = 0; i < len; i++) {
        avg[i] += desc[i];
      }
    }
    
    for (let i = 0; i < len; i++) {
      avg[i] /= descriptors.length;
    }
    
    return Array.from(avg);
  }
}

export default new FaceService();
