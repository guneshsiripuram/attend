/**
 * Face matching utilities.
 *
 * Uses COSINE distance (1 - cosine similarity) which is the recommended metric
 * for face-api.js (ResNet-50) embeddings and is scale-invariant.
 *
 * All thresholds live here so enrollment dedup and the verification gate can
 * never drift apart again.
 */

// A match is accepted when cosine distance <= FACE_DISTANCE_THRESHOLD
// (equivalently similarity >= FACE_SIMILARITY_THRESHOLD).
const FACE_SIMILARITY_THRESHOLD = 0.58;
const FACE_DISTANCE_THRESHOLD = 1 - FACE_SIMILARITY_THRESHOLD; // 0.42

/**
 * Cosine distance between two descriptor arrays. Range 0 (identical direction)
 * to 2 (opposite). Returns 1.0 for malformed/zero inputs.
 */
const cosineDistance = (a, b) => {
  if (!a || !b || a.length !== b.length) return 1.0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const va = Number(a[i]) || 0;
    const vb = Number(b[i]) || 0;
    dot += va * vb;
    na += va * va;
    nb += vb * vb;
  }
  if (na === 0 || nb === 0) return 1.0;
  return 1 - dot / (Math.sqrt(na) * Math.sqrt(nb));
};

/**
 * Compares a probe descriptor (verified now) against a set of gallery
 * descriptors (stored). Returns the BEST (minimum) cosine distance found.
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
      const dist = cosineDistance(g, p);
      if (Number.isFinite(dist) && dist < minDistance) minDistance = dist;
    }
  }

  return minDistance;
};

/**
 * Returns true when a face descriptor is usable (finite, non-zero, correct dim).
 */
const isValidDescriptor = (desc) =>
  Array.isArray(desc) &&
  desc.length === 128 &&
  desc.every((v) => Number.isFinite(v)) &&
  desc.some((v) => v !== 0);

module.exports = { compareDescriptors, cosineDistance, isValidDescriptor, FACE_DISTANCE_THRESHOLD, FACE_SIMILARITY_THRESHOLD };
