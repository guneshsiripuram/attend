const faceapi = require('face-api.js');
const canvas = require('canvas');
const path = require('path');

const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

let isLoaded = false;

const loadModels = async () => {
    if (isLoaded) return;
    const modelPath = path.join(__dirname, '../../models');
    await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath);
    await faceapi.nets.faceLandmark68Net.loadFromDisk(modelPath);
    await faceapi.nets.faceRecognitionNet.loadFromDisk(modelPath);
    isLoaded = true;
    console.log('Face verification models loaded');
};

const getEmbedding = async (imageBuffer) => {
    console.log('getEmbedding: Loading models...');
    await loadModels();
    console.log('getEmbedding: Loading image...');
    const img = await canvas.loadImage(imageBuffer);
    console.log('getEmbedding: Detecting face (SSD Optimized)...');
    const detection = await faceapi.detectSingleFace(img, new faceapi.SsdMobilenetv1Options({ 
        minConfidence: 0.3, // Lowered from 0.5 to improve detection rate
        inputSize: 320
    }))
        .withFaceLandmarks()
        .withFaceDescriptor();
    
    console.log('getEmbedding: Detection finished', detection ? 'Face found' : 'No face found');
    if (!detection) return null;

    // Liveness pose check (Very simplified head-turn detection)
    const landmarks = detection.landmarks.positions;
    const nose = landmarks[30];      // Nose tip
    const leftEdge = landmarks[0];   // Top of left jaw line (near ear)
    const rightEdge = landmarks[16]; // Top of right jaw line (near ear)

    const distToLeft = Math.abs(nose.x - leftEdge.x);
    const distToRight = Math.abs(nose.x - rightEdge.x);
    const ratio = distToLeft / distToRight;
    
    let pose = 'unknown';
    if (ratio > 0.6 && ratio < 1.6) {
        pose = 'straight';
    } else if (ratio <= 0.6) {
        pose = 'left';  // Nose is much closer to left edge
    } else if (ratio >= 1.6) {
        pose = 'right'; // Nose is much closer to right edge
    }

    console.log(`[DEBUG] Liveness Pose check: Ratio=${ratio.toFixed(2)}, Pose=${pose}`);

    return {
        descriptor: Array.from(detection.descriptor),
        pose
    };
};

const compareEmbeddings = (storedEmbedding, liveEmbedding) => {
    // Euclidean distance
    const distance = faceapi.euclideanDistance(storedEmbedding, liveEmbedding);
    // Similarity score (0 to 1, where 1 is identical)
    // Threshold usually around 0.6 for face-api
    return 1 - distance; 
};

const getMultipleEmbeddings = async (buffers) => {
    await loadModels();
    console.log(`Processing ${buffers.length} images for robust embedding...`);
    
    const descriptors = [];
    for (const buffer of buffers) {
        const img = await canvas.loadImage(buffer);
        const detection = await faceapi.detectSingleFace(img, new faceapi.SsdMobilenetv1Options({ 
            minConfidence: 0.3, // Lowered for better frame coverage
            inputSize: 320
        }))
            .withFaceLandmarks()
            .withFaceDescriptor();
        
        if (detection) {
            descriptors.push(detection.descriptor);
        }
    }
    
    if (descriptors.length === 0) return null;
    
    // Average the descriptors
    const avgDescriptor = new Float32Array(128).fill(0);
    for (const desc of descriptors) {
        for (let i = 0; i < 128; i++) {
            avgDescriptor[i] += desc[i];
        }
    }
    
    for (let i = 0; i < 128; i++) {
        avgDescriptor[i] /= descriptors.length;
    }
    
    return Array.from(avgDescriptor);
};

// Pre-load models at startup
loadModels().catch(err => console.error('Failed to pre-load models:', err));

module.exports = { getEmbedding, compareEmbeddings, getMultipleEmbeddings };
