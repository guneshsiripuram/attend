/**
 * Calculates the Euclidean distance between two face descriptors (numeric arrays).
 */
const calculateDistance = (desc1, desc2) => {
  if (!desc1 || !desc2 || desc1.length !== desc2.length) return 1.0;
  let sum = 0;
  for (let i = 0; i < desc1.length; i++) {
    const diff = desc1[i] - desc2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
};

/**
 * Compares a probe descriptor (verified now) against a set of gallery descriptors (stored).
 * Returns the BEST (minimum) distance found.
 */
const compareDescriptors = (gallery, probe) => {
  if (!gallery || !probe) return 1.0;

  // Handle probe being a single descriptor or an array of burst frames
  const probeSet = Array.isArray(probe[0]) ? probe : [probe];
  // Handle gallery being a single descriptor or an array of enrolled samples
  const gallerySet = Array.isArray(gallery[0]) ? gallery : [gallery];

  let minDistance = 1.0;

  for (const p of probeSet) {
    for (const g of gallerySet) {
      const dist = calculateDistance(g, p);
      if (dist < minDistance) minDistance = dist;
    }
  }

  return minDistance;
};

module.exports = { compareDescriptors };
