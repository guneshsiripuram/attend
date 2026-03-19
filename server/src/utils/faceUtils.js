/**
 * Calculates the Euclidean distance between two face descriptors (numeric arrays).
 * A distance below 0.6 usually indicates a match.
 */
const compareDescriptors = (desc1, desc2) => {
  if (!desc1 || !desc2 || desc1.length !== desc2.length) {
    return 1.0; // No match
  }

  let sum = 0;
  for (let i = 0; i < desc1.length; i++) {
    const diff = desc1[i] - desc2[i];
    sum += diff * diff;
  }
  
  return Math.sqrt(sum);
};

module.exports = { compareDescriptors };
