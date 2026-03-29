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

  async getDescriptorFromImage(imageElement) {
    const analysis = await this.analyzeImage(imageElement);
    return analysis.isGood ? analysis.descriptor : null;
  }

  async getDescriptorFromBase64(base64Image) {
    const analysis = await this.analyzeBase64(base64Image);
    return analysis.isGood ? analysis.descriptor : null;
  }

  async analyzeBase64(base64Image) {
    if (!base64Image) {
      return this.buildFailure('Empty image payload');
    }

    let imageElement;
    try {
      imageElement = await this.loadImageFromBase64(base64Image);
    } catch (error) {
      return this.buildFailure('Image decode error', { error: error.message });
    }

    try {
      return await this.analyzeImage(imageElement);
    } catch (error) {
      return this.buildFailure('Face analysis failed', { error: error.message });
    }
  }

  async analyzeImage(imageElement) {
    if (!this.modelsLoaded) {
      await this.loadModels();
    }

    const dimensions = this.getMediaDimensions(imageElement);
    if (!dimensions.width || !dimensions.height) {
      return this.buildFailure('Invalid image dimensions');
    }

    const detections = await faceapi
      .detectAllFaces(imageElement, DETECTION_OPTIONS)
      .withFaceLandmarks()
      .withFaceDescriptors();

    if (detections.length === 0) {
      return this.buildFailure('No face detected');
    }

    if (detections.length > 1) {
      return this.buildFailure('Multiple faces detected', { faceCount: detections.length });
    }

    const primaryDetection = detections[0];
    const quality = this.getFaceQuality(primaryDetection, imageElement, dimensions);

    return {
      isGood: quality.isGood,
      reason: quality.reason,
      faceCount: 1,
      descriptor: Array.from(primaryDetection.descriptor),
      confidence: primaryDetection.detection.score,
      qualityMetrics: quality.metrics,
      detection: primaryDetection
    };
  }

  async analyzeFrames(base64Frames, options = {}) {
    const minimumAccepted = options.minimumAccepted ?? 5;
    const acceptedFrames = [];
    const rejectedFrames = [];

    for (const frame of base64Frames || []) {
      const analysis = await this.analyzeBase64(frame);
      if (analysis.isGood && analysis.descriptor) {
        acceptedFrames.push(analysis);
      } else {
        rejectedFrames.push(analysis);
      }
    }

    const descriptor =
      acceptedFrames.length >= minimumAccepted
        ? this.averageDescriptors(acceptedFrames.map((frame) => frame.descriptor))
        : null;

    const livenessDetected = this.detectBlinkSequence(acceptedFrames);

    return {
      isGood: acceptedFrames.length >= minimumAccepted,
      reason:
        acceptedFrames.length >= minimumAccepted
          ? null
          : `Need at least ${minimumAccepted} good frames`,
      acceptedCount: acceptedFrames.length,
      rejectedCount: rejectedFrames.length,
      descriptor,
      livenessDetected,
      acceptedFrames,
      rejectedFrames
    };
  }

  getFaceQuality(detection, mediaElement, dimensions) {
    if (!detection || !detection.detection || !detection.landmarks) {
      return {
        isGood: false,
        reason: 'Incomplete face landmarks',
        metrics: null
      };
    }

    const { box, score } = detection.detection;
    const faceWidthRatio = box.width / dimensions.width;
    const faceHeightRatio = box.height / dimensions.height;

    if (faceWidthRatio < QUALITY_THRESHOLDS.minFaceWidthRatio) {
      return {
        isGood: false,
        reason: 'Face too far away',
        metrics: { faceWidthRatio, faceHeightRatio, score }
      };
    }

    if (faceHeightRatio < QUALITY_THRESHOLDS.minFaceHeightRatio) {
      return {
        isGood: false,
        reason: 'Face not large enough',
        metrics: { faceWidthRatio, faceHeightRatio, score }
      };
    }

    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    const horizontalOffsetRatio = Math.abs(centerX - dimensions.width / 2) / dimensions.width;
    const verticalOffsetRatio = Math.abs(centerY - dimensions.height / 2) / dimensions.height;

    if (horizontalOffsetRatio > QUALITY_THRESHOLDS.maxHorizontalOffsetRatio) {
      return {
        isGood: false,
        reason: 'Face not centered horizontally',
        metrics: { faceWidthRatio, faceHeightRatio, horizontalOffsetRatio, verticalOffsetRatio, score }
      };
    }

    if (verticalOffsetRatio > QUALITY_THRESHOLDS.maxVerticalOffsetRatio) {
      return {
        isGood: false,
        reason: 'Face not centered vertically',
        metrics: { faceWidthRatio, faceHeightRatio, horizontalOffsetRatio, verticalOffsetRatio, score }
      };
    }

    if (score < QUALITY_THRESHOLDS.minConfidence) {
      return {
        isGood: false,
        reason: 'Low detection confidence',
        metrics: { faceWidthRatio, faceHeightRatio, horizontalOffsetRatio, verticalOffsetRatio, score }
      };
    }

    const poseMetrics = this.getPoseMetrics(detection.landmarks);
    if (poseMetrics.eyeTiltDegrees > QUALITY_THRESHOLDS.maxEyeTiltDegrees) {
      return {
        isGood: false,
        reason: 'Head tilt too high',
        metrics: { ...poseMetrics, faceWidthRatio, faceHeightRatio, score }
      };
    }

    if (poseMetrics.yawRatio > QUALITY_THRESHOLDS.maxYawRatio) {
      return {
        isGood: false,
        reason: 'Face angle too large',
        metrics: { ...poseMetrics, faceWidthRatio, faceHeightRatio, score }
      };
    }

    const imageMetrics = this.getImageMetrics(mediaElement, dimensions, box);
    if (imageMetrics.brightness < QUALITY_THRESHOLDS.minBrightness) {
      return {
        isGood: false,
        reason: 'Image too dark',
        metrics: { ...poseMetrics, ...imageMetrics, faceWidthRatio, faceHeightRatio, score }
      };
    }

    if (imageMetrics.brightness > QUALITY_THRESHOLDS.maxBrightness) {
      return {
        isGood: false,
        reason: 'Image too bright',
        metrics: { ...poseMetrics, ...imageMetrics, faceWidthRatio, faceHeightRatio, score }
      };
    }

    if (imageMetrics.sharpness < QUALITY_THRESHOLDS.minSharpness) {
      return {
        isGood: false,
        reason: 'Image too blurry',
        metrics: { ...poseMetrics, ...imageMetrics, faceWidthRatio, faceHeightRatio, score }
      };
    }

    return {
      isGood: true,
      reason: null,
      metrics: {
        ...poseMetrics,
        ...imageMetrics,
        faceWidthRatio,
        faceHeightRatio,
        horizontalOffsetRatio,
        verticalOffsetRatio,
        score
      }
    };
  }

  getPoseMetrics(landmarks) {
    const leftEye = this.getCenterPoint(landmarks.getLeftEye());
    const rightEye = this.getCenterPoint(landmarks.getRightEye());
    const nose = landmarks.getNose()[3] || landmarks.getNose()[0];

    const eyeDx = rightEye.x - leftEye.x;
    const eyeDy = rightEye.y - leftEye.y;
    const interEyeDistance = Math.max(Math.sqrt((eyeDx ** 2) + (eyeDy ** 2)), 1);
    const eyeTiltDegrees = Math.abs((Math.atan2(eyeDy, eyeDx) * 180) / Math.PI);
    const eyeMidpointX = (leftEye.x + rightEye.x) / 2;
    const yawRatio = Math.abs(nose.x - eyeMidpointX) / interEyeDistance;

    return {
      eyeTiltDegrees,
      yawRatio
    };
  }

  getImageMetrics(mediaElement, dimensions, faceBox) {
    const canvas = document.createElement('canvas');
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;

    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      return { brightness: 0, sharpness: 0 };
    }

    context.drawImage(mediaElement, 0, 0, dimensions.width, dimensions.height);

    const cropX = Math.max(0, Math.floor(faceBox.x));
    const cropY = Math.max(0, Math.floor(faceBox.y));
    const cropWidth = Math.max(1, Math.min(dimensions.width - cropX, Math.floor(faceBox.width)));
    const cropHeight = Math.max(1, Math.min(dimensions.height - cropY, Math.floor(faceBox.height)));

    const imageData = context.getImageData(cropX, cropY, cropWidth, cropHeight).data;

    let brightnessTotal = 0;
    let pixelCount = 0;
    let sharpnessTotal = 0;

    const grayscale = [];
    for (let i = 0; i < imageData.length; i += 4) {
      const gray =
        (0.299 * imageData[i]) +
        (0.587 * imageData[i + 1]) +
        (0.114 * imageData[i + 2]);

      grayscale.push(gray);
      brightnessTotal += gray;
      pixelCount += 1;
    }

    const width = cropWidth;
    const height = cropHeight;
    const step = Math.max(1, Math.floor(Math.min(width, height) / 40));

    for (let y = step; y < height; y += step) {
      for (let x = step; x < width; x += step) {
        const index = (y * width) + x;
        const left = grayscale[index - step];
        const top = grayscale[index - (step * width)];
        const current = grayscale[index];
        sharpnessTotal += Math.abs(current - left) + Math.abs(current - top);
      }
    }

    const brightness = pixelCount > 0 ? brightnessTotal / pixelCount : 0;
    const samples = Math.max(1, Math.floor((height / step) * (width / step)));
    const sharpness = sharpnessTotal / samples;

    return {
      brightness,
      sharpness
    };
  }

  detectBlinkSequence(frameResults) {
    if (!frameResults || frameResults.length < 5) {
      return false;
    }

    const ears = frameResults
      .map((frame) => {
        if (!frame?.detection?.landmarks) {
          return null;
        }
        return this.calculateEAR(frame.detection.landmarks);
      })
      .filter((value) => typeof value === 'number' && !Number.isNaN(value));

    if (ears.length < 5) {
      return false;
    }

    const openThreshold = 0.26;
    const closedThreshold = 0.20;
    let closedStartIndex = -1;

    for (let i = 0; i < ears.length - 1; i += 1) {
      if (ears[i] < closedThreshold && ears[i + 1] < closedThreshold) {
        closedStartIndex = i;
        break;
      }
    }

    if (closedStartIndex === -1) {
      return false;
    }

    const openBefore = ears.slice(0, closedStartIndex).some((value) => value > openThreshold);
    const openAfter = ears.slice(closedStartIndex + 2).some((value) => value > openThreshold);

    return openBefore && openAfter;
  }

  calculateEAR(landmarks) {
    const leftEye = landmarks.getLeftEye();
    const rightEye = landmarks.getRightEye();

    const getEAR = (eye) => {
      const verticalOne = this.getDistance(eye[1], eye[5]);
      const verticalTwo = this.getDistance(eye[2], eye[4]);
      const horizontal = this.getDistance(eye[0], eye[3]);

      if (!horizontal) {
        return 0;
      }

      return (verticalOne + verticalTwo) / (2 * horizontal);
    };

    return (getEAR(leftEye) + getEAR(rightEye)) / 2;
  }

  averageDescriptors(descriptors) {
    if (!descriptors || descriptors.length === 0) {
      return null;
    }

    const validDescriptors = descriptors.filter(
      (descriptor) => Array.isArray(descriptor) || descriptor instanceof Float32Array
    );

    if (validDescriptors.length === 0) {
      return null;
    }

    const vectorLength = validDescriptors[0].length;
    const average = new Float32Array(vectorLength);

    for (const descriptor of validDescriptors) {
      if (descriptor.length !== vectorLength) {
        continue;
      }

      for (let i = 0; i < vectorLength; i += 1) {
        average[i] += descriptor[i];
      }
    }

    for (let i = 0; i < vectorLength; i += 1) {
      average[i] /= validDescriptors.length;
    }

    return Array.from(average);
  }

  loadImageFromBase64(base64Image) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Failed to decode image'));
      image.src = base64Image;
    });
  }

  getMediaDimensions(mediaElement) {
    return {
      width:
        mediaElement?.videoWidth ||
        mediaElement?.naturalWidth ||
        mediaElement?.width ||
        0,
      height:
        mediaElement?.videoHeight ||
        mediaElement?.naturalHeight ||
        mediaElement?.height ||
        0
    };
  }

  getCenterPoint(points) {
    const total = points.reduce(
      (accumulator, point) => {
        accumulator.x += point.x;
        accumulator.y += point.y;
        return accumulator;
      },
      { x: 0, y: 0 }
    );

    return {
      x: total.x / points.length,
      y: total.y / points.length
    };
  }

  getDistance(pointA, pointB) {
    return Math.sqrt(((pointA.x - pointB.x) ** 2) + ((pointA.y - pointB.y) ** 2));
  }

  buildFailure(reason, extra = {}) {
    return {
      isGood: false,
      reason,
      faceCount: 0,
      descriptor: null,
      confidence: 0,
      qualityMetrics: null,
      detection: null,
      ...extra
    };
  }
}

export default new FaceService();
