/**
 * GI Model - Ground Infiltration Calculation Engine
 * Translates the Excel Calcs sheet formulas to JavaScript
 */

class GIModel {
    constructor(params = {}) {
        // GI Parameters (B column in Excel)
        this.soilDepth = params.soilDepth ?? 0.01;                    // m
        this.percolationCoeff = params.percolationCoeff ?? 0.01;      // days
        this.baseflowCoeff = params.baseflowCoeff ?? 10;              // days
        this.infiltrationCoeff = params.infiltrationCoeff ?? 0.1;     // days
        this.percolationThreshold = params.percolationThreshold ?? 10; // %
        this.percolationPctInfiltrating = params.percolationPctInfiltrating ?? 0; // %
        this.soilPorosity = params.soilPorosity ?? 20;                // %
        this.groundPorosity = params.groundPorosity ?? 20;            // %
        this.baseflowThreshold = params.baseflowThreshold ?? 0;       // m
        this.infiltrationThreshold = params.infiltrationThreshold ?? 0.02; // m

        // NEW: Infoworks model enhancements
        this.evaporationRate = params.evaporationRate ?? 0;           // mm/day - soil evaporation
        this.depressionStorage = params.depressionStorage ?? 0;       // mm - initial loss
        this.nodeBackwaterLevel = params.nodeBackwaterLevel ?? 0;     // mAOD - node water level

        // Input Parameters (F column in Excel)
        this.rainfallDepth = params.rainfallDepth ?? 10;              // mm
        this.subcatchmentArea = params.subcatchmentArea ?? 50;        // Ha
        this.percentageRunoff = params.percentageRunoff ?? 0;         // %
        this.estimatedPeakFlow = params.estimatedPeakFlow ?? 0.1;     // m³/s
        this.timeInterval = params.timeInterval ?? 2;                 // minutes
        this.initialSoilDepth = params.initialSoilDepth ?? 10;        // %
        this.initialGWLevel = params.initialGWLevel ?? 45;            // mAOD
        this.coverLevel = params.coverLevel ?? 46.74;                 // mAOD
    }

    /**
     * AA1: Calculate total rainfall volume
     * = (Area * 10000) * (RainfallDepth * 0.001)
     */
    getRainfallVolume() {
        return (this.subcatchmentArea * 10000) * (this.rainfallDepth * 0.001);
    }

    /**
     * AA2: Calculate time to peak
     * = (RainfallVolume / (1.39 * PeakFlow)) / 60
     * 1.39 is derived from mass balance of the official SWM shape:
     *   ∫ rising cosine (0→Tp) + ∫ transition cosine (Tp→1.25Tp)
     *   + ∫ exponential recession (1.25Tp→∞) ≈ 1.39 · Qp · Tp
     */
    getTimeToPeak() {
        const volume = this.getRainfallVolume();
        return (volume / (1.39 * this.estimatedPeakFlow)) / 60; // minutes
    }

    /**
     * AA3: Calculate soil store capacity
     * = SoilDepth * (SoilPorosity/100) * (Area * 10000)
     */
    getSoilStoreCapacity() {
        return this.soilDepth * (this.soilPorosity / 100) * (this.subcatchmentArea * 10000);
    }

    /**
     * AA4: Ground store depth
     * = CoverLevel - SoilDepth
     */
    getGroundStoreDepth() {
        return this.coverLevel - this.soilDepth;
    }

    /**
     * AA5: Ground store capacity
     * = (GroundStoreDepth - InitialGWLevel) * (Area * 10000) * (GroundPorosity/100)
     */
    getGroundStoreCapacity() {
        const groundDepth = this.getGroundStoreDepth();
        return (groundDepth - this.initialGWLevel) * (this.subcatchmentArea * 10000) * (this.groundPorosity / 100);
    }

    /**
     * Run the full GI simulation
     * @param {number} numSteps - Number of timesteps to simulate
     * @returns {Object} Simulation results with time series for all components
     */
    runSimulation() {
        const volume = this.getRainfallVolume();
        const timeToPeak = this.getTimeToPeak();
        const soilCapacity = this.getSoilStoreCapacity();
        const groundCapacity = this.getGroundStoreCapacity();
        const groundDepth = this.getGroundStoreDepth();

        // Dynamic simulation: will run until stores are drained
        // Set an initial estimate and max cap
        const maxSteps = 10000; // Absolute maximum to prevent infinite loops

        const timeIntervalSec = this.timeInterval * 60; // Convert to seconds
        const percolationCoeffSec = this.percolationCoeff * 24 * 60 * 60;
        const baseflowCoeffSec = this.baseflowCoeff * 24 * 60 * 60;
        const infiltrationCoeffSec = this.infiltrationCoeff * 24 * 60 * 60;

        // Results arrays
        const results = {
            time: [],           // Time in minutes
            days: [],           // Time in days
            Qrain: [],          // Rain flow (m³/s)
            Qrunoff: [],        // Direct runoff (m³/s)
            Qsoil: [],          // Flow to soil (m³/s)
            Vsoil: [],          // Soil store volume (m³)
            Dsoil: [],          // Soil depth (m)
            soilLevel: [],      // Soil store level (mAOD)
            Vsoil_perc: [],     // Volume available for percolation
            QsoilInf: [],       // Soil infiltration flow (m³/s)
            Qground: [],        // Flow to ground (m³/s)
            Qpercolation: [],   // Total percolation flow (m³/s)
            Vperc: [],          // Percolation volume (placeholder — Vperc is tracked externally)
            Vground: [],        // Ground store volume (m³)
            Dground: [],        // Ground depth (m)
            groundLevel: [],    // Ground store level (mAOD)
            Vground_bf: [],     // Baseflow volume
            Qbaseflow: [],      // Baseflow (m³/s)
            Vground_inf: [],    // Ground infiltration volume
            QgroundInf: [],     // Ground infiltration flow (m³/s)
            Qnetwork: []        // Total network flow (m³/s)
        };

        // Initial conditions
        let Vsoil = (this.initialSoilDepth / 100) * soilCapacity;
        let Vperc = 0;
        let Vground = 0;

        // NEW: Depression storage tracking (fills before runoff/infiltration)
        const depressionCapacity = (this.depressionStorage / 1000) * (this.subcatchmentArea * 10000); // m³
        let Vdepression = 0; // Current depression volume

        // NEW: Evaporation rate in m³/s (convert from mm/day)
        const evapRateM3perSec = (this.evaporationRate / 1000) * (this.subcatchmentArea * 10000) / (24 * 60 * 60);

        // Track peak store volumes to determine when to stop
        let peakVsoil = Vsoil;
        let peakVground = 0;
        let rainEnded = false;
        // cosEndTime: cosine limb (rising + transition) ends at 1.25·Tp; exponential begins after
        const cosEndTime = timeToPeak * 1.25;

        // Threshold for considering stores "drained" (0.1% of volume)
        const drainThreshold = volume * 0.001;

        // Track total actual evaporation
        let totalEvaporation = 0;

        let step = 0;
        while (step < maxSteps) {
            const t = step * this.timeInterval;
            const tDays = t / (60 * 24);

            // D: Qrain - Malcolm SWM hydrograph (official SWM equations)
            // Rising + transition (t ≤ 1.25·Tp): qi = (Qp/2)[1 - cos(π·t/Tp)]
            // Exponential recession  (t > 1.25·Tp): qi = 4.34·Qp·e^(−1.3·t/Tp)
            let Qrain = 0;
            if (t <= cosEndTime) {
                Qrain = (this.estimatedPeakFlow / 2) * (1 - Math.cos(Math.PI * t / timeToPeak));
            } else {
                Qrain = 4.34 * this.estimatedPeakFlow * Math.exp(-1.3 * t / timeToPeak);
            }
            Qrain = Math.round(Qrain * 1e6) / 1e6; // Round like Excel

            // Once past the cosine section we are in the exponential tail
            if (!rainEnded && t > cosEndTime) {
                rainEnded = true;
            }

            // NEW: Depression storage - fills before any runoff/infiltration
            let Qeffective = Qrain; // Rain available after depression storage
            if (depressionCapacity > 0 && Vdepression < depressionCapacity) {
                const depFillRate = Math.min(Qrain, (depressionCapacity - Vdepression) / timeIntervalSec);
                Vdepression = Math.min(depressionCapacity, Vdepression + depFillRate * timeIntervalSec);
                Qeffective = Qrain - depFillRate;
            }

            // E: Qrunoff = effective rain * (PercentageRunoff / 100)
            let Qrunoff = Qeffective * (this.percentageRunoff / 100);

            // F: Qsoil = effective rain - Qrunoff
            let Qsoil = Qeffective - Qrunoff;

            // Get previous values for averaging
            const prevQsoil = step > 0 ? results.Qsoil[step - 1] : 0;
            const prevVsoil = step > 0 ? results.Vsoil[step - 1] : Vsoil;

            // G: Update soil store volume
            // Vsoil = previous + (average inflow * dt) - outflow - evaporation
            if (step > 0) {
                const avgQsoil = (prevQsoil + Qsoil) / 2;
                const prevQsoilInf = results.QsoilInf[step - 1];
                const prevQground = results.Qground[step - 1];

                // NEW: Evaporation loss (proportional to soil saturation)
                const saturation = prevVsoil / soilCapacity;
                const evapLoss = evapRateM3perSec * saturation * timeIntervalSec;
                totalEvaporation += evapLoss;

                let newVsoil = prevVsoil + (avgQsoil * timeIntervalSec) -
                    ((prevQsoilInf + prevQground) * timeIntervalSec) - evapLoss;

                // Check for saturation excess (overflow)
                if (newVsoil > soilCapacity) {
                    const excessVol = newVsoil - soilCapacity;
                    const excessFlow = excessVol / timeIntervalSec;

                    // Redirect excess to runoff (Saturation Excess Runoff)
                    Qrunoff += excessFlow;
                    Qsoil -= excessFlow;

                    newVsoil = soilCapacity;
                }

                // Clamp to 0 (underflow handled by max(0))
                newVsoil = Math.max(0, newVsoil);
                Vsoil = newVsoil;
            }

            // Track peak soil volume
            peakVsoil = Math.max(peakVsoil, Vsoil);

            // H: Dsoil = soil depth based on volume
            const Dsoil = (Vsoil / soilCapacity) * this.soilDepth;

            // I: Soil store level = (CoverLevel - SoilDepth) + Dsoil
            const soilLevel = (this.coverLevel - this.soilDepth) + Dsoil;

            // J: Vsoil_perc - volume available for percolation (above threshold)
            const thresholdVolume = (this.percolationThreshold / 100) * soilCapacity;
            const Vsoil_perc = Dsoil > this.soilDepth * (this.percolationThreshold / 100)
                ? Vsoil - thresholdVolume
                : 0;

            // K: QsoilInf - direct infiltration from soil
            // = (Vsoil_perc * (PercolationPct / 100)) / PercolationCoeff
            const QsoilInf = (Vsoil_perc * (this.percolationPctInfiltrating / 100)) / percolationCoeffSec;

            // L: Qground - flow to ground store
            // = (Vsoil_perc * ((100 - PercolationPct) / 100)) / PercolationCoeff
            const Qground = (Vsoil_perc * ((100 - this.percolationPctInfiltrating) / 100)) / percolationCoeffSec;

            // M: Qpercolation = QsoilInf + Qground
            const Qpercolation = QsoilInf + Qground;

            // Get previous ground store values
            const prevVground = step > 0 ? results.Vground[step - 1] : 0;
            const prevQbaseflow = step > 0 ? results.Qbaseflow[step - 1] : 0;
            const prevQgroundInf = step > 0 ? results.QgroundInf[step - 1] : 0;

            // P: Update ground store volume
            if (step > 0) {
                const prevQground = results.Qground[step - 1];
                const avgQground = (prevQground + Qground) / 2;
                const Vout = ((prevQbaseflow + prevQgroundInf) * timeIntervalSec);

                let newVground = prevVground + (avgQground * timeIntervalSec) - Vout;
                newVground = Math.max(0, newVground);
                Vground = newVground;
            }

            // Track peak ground volume
            peakVground = Math.max(peakVground, Vground);

            // Q: Dground = ground depth based on volume
            const Dground = groundCapacity > 0
                ? (Vground / groundCapacity) * (groundDepth - this.initialGWLevel)
                : 0;

            // R: Ground store level = InitialGWLevel + Dground
            const groundLevel = this.initialGWLevel + Dground;

            // S: Vground_bf - volume above baseflow threshold
            const Vground_bf = groundLevel > this.initialGWLevel + this.baseflowThreshold
                ? Vground - ((this.baseflowThreshold / (groundDepth - this.initialGWLevel)) * groundCapacity)
                : 0;

            // T: Qbaseflow = Vground_bf / BaseflowCoeff
            const Qbaseflow = Math.round((Vground_bf / baseflowCoeffSec) * 1e6) / 1e6;

            // U: Vground_inf - volume above infiltration threshold
            const Vground_inf = groundLevel > this.initialGWLevel + this.infiltrationThreshold
                ? Vground - ((this.infiltrationThreshold / (groundDepth - this.initialGWLevel)) * groundCapacity)
                : 0;

            // V: QgroundInf = sqrt(Vground_inf - Hnode effect) / InfiltrationCoeff
            // NEW: Node backwater reduces effective head for infiltration
            const nodeDepth = Math.max(0, this.nodeBackwaterLevel - this.initialGWLevel);
            const effectiveHead = Math.max(0, groundLevel - this.initialGWLevel - this.infiltrationThreshold - nodeDepth);
            const QgroundInf = effectiveHead > 0
                ? Math.sqrt(effectiveHead * (this.subcatchmentArea * 10000)) / infiltrationCoeffSec
                : 0;

            // X: Qnetwork = QgroundInf + QsoilInf + Qrunoff
            const Qnetwork = QgroundInf + QsoilInf + Qrunoff;

            // Store results
            results.time.push(t);
            results.days.push(tDays);
            results.Qrain.push(Qrain);
            results.Qrunoff.push(Qrunoff);
            results.Qsoil.push(Qsoil);
            results.Vsoil.push(Vsoil);
            results.Dsoil.push(Dsoil);
            results.soilLevel.push(soilLevel);
            results.Vsoil_perc.push(Vsoil_perc);
            results.QsoilInf.push(QsoilInf);
            results.Qground.push(Qground);
            results.Qpercolation.push(Qpercolation);
            results.Vperc.push(Vperc);
            results.Vground.push(Vground);
            results.Dground.push(Dground);
            results.groundLevel.push(groundLevel);
            results.Vground_bf.push(Vground_bf);
            results.Qbaseflow.push(Qbaseflow);
            results.Vground_inf.push(Vground_inf);
            results.QgroundInf.push(QgroundInf);
            results.Qnetwork.push(Qnetwork);

            step++;

            // Check if we can stop: rain has ended AND both stores are nearly drained
            if (rainEnded && step > 10) {
                const storesEmpty = (Vsoil < drainThreshold) && (Vground < drainThreshold);
                const flowsStopped = (Qnetwork < 1e-9) && (Qbaseflow < 1e-9);

                if (storesEmpty || flowsStopped) {
                    break;
                }
            }
        }

        // Add extra tracking to results for summary
        results.totalEvaporation = totalEvaporation;
        results.finalVdepression = Vdepression;
        results.initialVsoil = (this.initialSoilDepth / 100) * soilCapacity;

        // Calculate summary volumes
        results.summary = this.calculateSummary(results);

        return results;
    }

    /**
     * Calculate summary statistics from results
     */
    calculateSummary(results) {
        const dt = this.timeInterval * 60; // seconds

        const sumFlow = (arr) => arr.reduce((sum, q, i) => {
            if (i === 0) return sum;
            return sum + ((arr[i - 1] + q) / 2) * dt;
        }, 0);

        const rainfallVolume = this.getRainfallVolume();
        const runoffVolume = sumFlow(results.Qrunoff);
        const soilVolume = sumFlow(results.Qsoil);
        const groundVolume = sumFlow(results.Qground);
        const baseflowVolume = sumFlow(results.Qbaseflow);
        const soilInfVolume = sumFlow(results.QsoilInf);
        const groundInfVolume = sumFlow(results.QgroundInf);
        const networkVolume = sumFlow(results.Qnetwork);

        // Store Volumes
        const finalVsoil = results.Vsoil[results.Vsoil.length - 1] || 0;
        const finalVground = results.Vground[results.Vground.length - 1] || 0;
        const finalVdepression = results.finalVdepression || 0;
        const initialVsoil = results.initialVsoil || 0;
        const evaporationVol = results.totalEvaporation || 0;

        // Continuity Residual Calculation (Mass Balance)
        // Inputs: Rain + Initial Stores
        const totalInputs = rainfallVolume + initialVsoil; // Initial Ground/Depression assumed 0/0

        // Outputs: Network + Baseflow + Evap + Final Stores
        const totalOutputs = networkVolume + baseflowVolume + evaporationVol + finalVsoil + finalVground + finalVdepression;

        const continuityResidual = totalInputs - totalOutputs;

        return {
            rainfallVolume: Math.round(rainfallVolume),
            initialVsoil: Math.round(initialVsoil),
            runoffVolume: Math.round(runoffVolume),
            soilVolume: Math.round(soilVolume),
            groundVolume: Math.round(groundVolume),
            baseflowVolume: Math.round(baseflowVolume),
            soilInfVolume: Math.round(soilInfVolume),
            groundInfVolume: Math.round(groundInfVolume),
            networkVolume: Math.round(networkVolume),
            evaporationVolume: Math.round(evaporationVol),
            finalVsoil: Math.round(finalVsoil),
            finalVground: Math.round(finalVground),
            finalVdepression: Math.round(finalVdepression),
            continuityResidual: Math.round(continuityResidual),
            timeToPeak: Math.round(this.getTimeToPeak() * 10) / 10,
            peakQrain: Math.max(...results.Qrain),
            peakQnetwork: Math.max(...results.Qnetwork)
        };
    }

    /**
     * Run the GI store routing using externally-supplied inflow data.
     * Used by the Calibration tab so both tabs share identical physics.
     *
     * @param {number[]} QsoilInput - Array of inflow rates to soil store (m³/s)
     * @param {number}   timestepMinutes - Timestep of the input data (minutes)
     * @returns {Object} Results arrays: QsoilInf, Qground, QgroundInf, Qbaseflow,
     *                   Qnetwork, soilLevel, groundLevel, Vsoil, Vground
     */
    runWithExternalInput(QsoilInput, timestepMinutes) {
        const n = QsoilInput.length;
        const timeIntervalSec = timestepMinutes * 60;
        const percolationCoeffSec = this.percolationCoeff * 24 * 60 * 60;
        const baseflowCoeffSec    = this.baseflowCoeff    * 24 * 60 * 60;
        const infiltrationCoeffSec = this.infiltrationCoeff * 24 * 60 * 60;

        const soilCapacity  = this.getSoilStoreCapacity();
        const groundCapacity = this.getGroundStoreCapacity();
        const groundDepth   = this.getGroundStoreDepth();

        let Vsoil   = (this.initialSoilDepth / 100) * soilCapacity;
        let Vground = 0;

        const evapRateM3perSec = (this.evaporationRate / 1000) *
            (this.subcatchmentArea * 10000) / (24 * 60 * 60);

        const results = {
            QsoilInf:    [],
            Qground:     [],
            QgroundInf:  [],
            Qbaseflow:   [],
            Qnetwork:    [],
            soilLevel:   [],
            groundLevel: [],
            Vsoil:       [],
            Vground:     []
        };

        for (let i = 0; i < n; i++) {
            const Qsoil     = QsoilInput[i];
            const prevQsoil = i > 0 ? QsoilInput[i - 1] : 0;

            // Update soil store (trapezoidal)
            if (i > 0) {
                const avgQsoil    = (prevQsoil + Qsoil) / 2;
                const prevQsoilInf = results.QsoilInf[i - 1];
                const prevQground  = results.Qground[i - 1];
                const prevVsoil    = results.Vsoil[i - 1];

                const saturation = soilCapacity > 0 ? prevVsoil / soilCapacity : 0;
                const evapLoss   = evapRateM3perSec * saturation * timeIntervalSec;

                let newVsoil = prevVsoil
                    + (avgQsoil * timeIntervalSec)
                    - ((prevQsoilInf + prevQground) * timeIntervalSec)
                    - evapLoss;
                Vsoil = Math.max(0, Math.min(newVsoil, soilCapacity));
            }

            // Soil level
            const Dsoil     = soilCapacity > 0 ? (Vsoil / soilCapacity) * this.soilDepth : 0;
            const soilLevel = (this.coverLevel - this.soilDepth) + Dsoil;

            // Percolation (above threshold)
            const thresholdVolume = (this.percolationThreshold / 100) * soilCapacity;
            const Vsoil_perc = Dsoil > this.soilDepth * (this.percolationThreshold / 100)
                ? Vsoil - thresholdVolume : 0;

            const QsoilInf = (Vsoil_perc * (this.percolationPctInfiltrating / 100))
                / percolationCoeffSec;
            const Qground  = (Vsoil_perc * ((100 - this.percolationPctInfiltrating) / 100))
                / percolationCoeffSec;

            // Update ground store (trapezoidal)
            if (i > 0) {
                const prevQgroundPrev = results.Qground[i - 1];
                const avgQground      = (prevQgroundPrev + Qground) / 2;
                const prevQbaseflow   = results.Qbaseflow[i - 1];
                const prevQgroundInf  = results.QgroundInf[i - 1];
                const prevVground     = results.Vground[i - 1];

                let newVground = prevVground
                    + (avgQground * timeIntervalSec)
                    - ((prevQbaseflow + prevQgroundInf) * timeIntervalSec);
                Vground = Math.max(0, Math.min(newVground, groundCapacity > 0 ? groundCapacity : Infinity));
            }

            // Ground level
            const Dground     = groundCapacity > 0
                ? (Vground / groundCapacity) * (groundDepth - this.initialGWLevel) : 0;
            const groundLevel = this.initialGWLevel + Dground;

            // Baseflow
            const Vground_bf = groundLevel > this.initialGWLevel + this.baseflowThreshold
                ? Vground - ((this.baseflowThreshold / (groundDepth - this.initialGWLevel)) * groundCapacity)
                : 0;
            const Qbaseflow = Math.max(0, Vground_bf / baseflowCoeffSec);

            // Ground infiltration — same sqrt formulation as runSimulation
            const nodeDepth      = Math.max(0, this.nodeBackwaterLevel - this.initialGWLevel);
            const effectiveHead  = Math.max(0,
                groundLevel - this.initialGWLevel - this.infiltrationThreshold - nodeDepth);
            const QgroundInf = effectiveHead > 0
                ? Math.sqrt(effectiveHead * (this.subcatchmentArea * 10000)) / infiltrationCoeffSec
                : 0;

            const Qnetwork = QsoilInf + QgroundInf;

            results.QsoilInf.push(QsoilInf);
            results.Qground.push(Qground);
            results.QgroundInf.push(QgroundInf);
            results.Qbaseflow.push(Qbaseflow);
            results.Qnetwork.push(Qnetwork);
            results.soilLevel.push(soilLevel);
            results.groundLevel.push(groundLevel);
            results.Vsoil.push(Vsoil);
            results.Vground.push(Vground);
        }

        return results;
    }

    /**
     * Get Scottish Water default parameters
     */
    static getScWDefaults() {
        return {
            soilDepth: 0.01,
            percolationCoeff: 0.01,
            baseflowCoeff: 10,
            infiltrationCoeff: 0.1,
            percolationThreshold: 10,
            percolationPctInfiltrating: 0,
            soilPorosity: 20,
            groundPorosity: 20,
            baseflowThreshold: 0,
            infiltrationThreshold: 0.02
        };
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GIModel };
}
