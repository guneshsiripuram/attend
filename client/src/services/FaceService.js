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
      .detectSingleFace(imageElement)
      .withFaceLandmarks()
      .withFaceDescriptor();

    return detection ? detection.descriptor : null;
  }

  async getDescriptorFromBase64(base64Image) {
    const img = new Image();
    img.src = base64Image;
    await new Promise(resolve => (img.onload = resolve));
    return this.getDescriptorFromImage(img);
  }

  // Helper to average descriptors for better accuracy during registration
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
