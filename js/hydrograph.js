/**
 * H.R. Malcolm SWM Hydrograph Generator
 * Generates a unit hydrograph based on volume and peak flow
 */

/**
 * Generate the Malcolm SWM hydrograph
 * @param {number} volume - Total rainfall volume in m³
 * @param {number} peakFlow - Estimated peak flow in m³/s
 * @param {number} timeInterval - Time step in minutes
 * @param {number} numSteps - Number of time steps to calculate
 * @returns {Array<{time: number, flow: number}>} Array of time/flow pairs
 */
function generateHydrograph(volume, peakFlow, timeInterval, numSteps) {
    // Tp = V / (1.39·Qp) — official SWM coefficient
    // 1.39 is the integral of the SWM shape: cosine (0→1.25Tp) + exponential (>1.25Tp)
    const timeToPeak = (volume / (1.39 * peakFlow)) / 60; // in minutes
    const cosEndTime = timeToPeak * 1.25; // cosine limb ends here; exponential begins

    const hydrograph = [];

    for (let step = 0; step < numSteps; step++) {
        const t = step * timeInterval; // time in minutes
        let flow = 0;

        if (t <= cosEndTime) {
            // Rising + transition: Q = (Qp/2)[1 - cos(π·t/Tp)]
            flow = (peakFlow / 2) * (1 - Math.cos(Math.PI * t / timeToPeak));
        } else {
            // Exponential recession: Q = 4.34·Qp·e^(−1.3·t/Tp)
            flow = 4.34 * peakFlow * Math.exp(-1.3 * t / timeToPeak);
        }

        hydrograph.push({
            time: t,
            flow: flow
        });
    }

    return hydrograph;
}

/**
 * Calculate the time to peak for given volume and peak flow
 * @param {number} volume - Total volume in m³
 * @param {number} peakFlow - Peak flow in m³/s
 * @returns {number} Time to peak in minutes
 */
function calculateTimeToPeak(volume, peakFlow) {
    return (volume / (1.39 * peakFlow)) / 60;
}

/**
 * Calculate the number of steps needed to complete the hydrograph
 * @param {number} volume - Total volume in m³
 * @param {number} peakFlow - Peak flow in m³/s
 * @param {number} timeInterval - Time step in minutes
 * @param {number} multiplier - How many times Tp * 1.25 to extend (default 3 for full recession)
 * @returns {number} Number of time steps
 */
function calculateRequiredSteps(volume, peakFlow, timeInterval, multiplier = 3) {
    const timeToPeak = calculateTimeToPeak(volume, peakFlow);
    const totalTime = timeToPeak * 1.25 * multiplier;
    return Math.ceil(totalTime / timeInterval) + 1;
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { generateHydrograph, calculateTimeToPeak, calculateRequiredSteps };
}
