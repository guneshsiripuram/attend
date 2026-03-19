/**
 * Utility functions for file and image processing
 */

/**
 * Converts a base64 string to a Buffer
 * @param {string} base64Data - The base64 image string
 * @returns {Buffer} - The resulting buffer
 */
const base64ToBuffer = (base64Data) => {
    const cleanData = base64Data.replace(/^data:image\/\w+;base64,/, '');
    return Buffer.from(cleanData, 'base64');
};

module.exports = {
    base64ToBuffer
};
