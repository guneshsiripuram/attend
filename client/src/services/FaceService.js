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

  async analyzeBase64(base64Image) {
    if (!this.modelsLoaded) await this.loadModels();
    
    const img = new Image();
    img.src = base64Image;
    await new Promise(resolve => (img.onload = resolve));

    const detection = await faceapi
      .detectSingleFace(img)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) return { isGood: false, reason: 'No face detected' };

    return {
      isGood: true,
      descriptor: detection.descriptor,
      detection: detection
    };
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

    const openThreshold = 0.25;
    const closedThreshold = 0.21;
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
    const len = descriptors[0].length;
    const avg = new Float32Array(len);
    for (const desc of descriptors) {
      for (let i = 0; i < len; i++) avg[i] += desc[i];
    }
    for (let i = 0; i < len; i++) avg[i] /= descriptors.length;
    return Array.from(avg);
  }
}

export default new FaceService();
