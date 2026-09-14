/**
 * GI Sandbox - Main Application Controller
 */

class GISandboxApp {
    constructor() {
        this.model = null;
        this.schematic = null;
        this.sceneView = null;
        this.calibration = null;
        this.activeView = 'scene'; // 'schematic' or 'scene'
        this.activeTab = 'sandbox'; // 'sandbox' or 'calibration'
        this.debounceTimer = null;

        // Parameter definitions with their element IDs and default values
        this.paramDefs = {
            // GI Parameters
            soilDepth: { slider: 'soilDepth', input: 'soilDepthValue', default: 0.5 },
            percolationCoeff: { slider: 'percolationCoeff', input: 'percolationCoeffValue', default: 0.1 },
            baseflowCoeff: { slider: 'baseflowCoeff', input: 'baseflowCoeffValue', default: 0.1 },
            infiltrationCoeff: { slider: 'infiltrationCoeff', input: 'infiltrationCoeffValue', default: 0.1 },
            percolationThreshold: { slider: 'percolationThreshold', input: 'percolationThresholdValue', default: 100 },
            percolationPctInfiltrating: { slider: 'percolationPctInfiltrating', input: 'percolationPctInfiltratingValue', default: 0 },
            soilPorosity: { slider: 'soilPorosity', input: 'soilPorosityValue', default: 5 },
            groundPorosity: { slider: 'groundPorosity', input: 'groundPorosityValue', default: 5 },
            baseflowThreshold: { slider: 'baseflowThreshold', input: 'baseflowThresholdValue', default: 1 },
            infiltrationThreshold: { slider: 'infiltrationThreshold', input: 'infiltrationThresholdValue', default: 1 },
            // Advanced Parameters (Infoworks Enhancements)
            evaporationRate: { slider: 'evaporationRate', input: 'evaporationRateValue', default: 5 },
            depressionStorage: { slider: 'depressionStorage', input: 'depressionStorageValue', default: 0.5 },
            nodeBackwaterLevel: { input: 'nodeBackwaterLevelValue', default: 0 },
            // Input Parameters
            rainfallDepth: { slider: 'rainfallDepth', input: 'rainfallDepthValue', default: 10 },
            subcatchmentArea: { slider: 'subcatchmentArea', input: 'subcatchmentAreaValue', default: 50 },
            percentageRunoff: { slider: 'percentageRunoff', input: 'percentageRunoffValue', default: 50 },
            estimatedPeakFlow: { slider: 'estimatedPeakFlow', input: 'estimatedPeakFlowValue', default: 0.1 },
            timeInterval: { slider: 'timeInterval', input: 'timeIntervalValue', default: 2 },
            initialSoilDepth: { slider: 'initialSoilDepth', input: 'initialSoilDepthValue', default: 0 },
            initialGWLevel: { input: 'initialGWLevelValue', default: 48.5 },
            coverLevel: { input: 'coverLevelValue', default: 50 }
        };

        this.init();
    }

    init() {
        // Initialize the schematic
        this.schematic = new GISchematic('schematic');

        // Initialize the scene view
        this.sceneView = new GISceneView();
        this.loadSceneBackground();

        // Initialize calibration controller
        this.calibration = new Calibration();
        this.calibration.init();

        // Set up event listeners
        this.setupEventListeners();
        this.setupMainTabListeners();

        // Run initial simulation
        this.runSimulation();
    }

    setupMainTabListeners() {
        // Main tab switching (Sandbox | Calibration)
        document.getElementById('tabSandbox')?.addEventListener('click', () => {
            this.switchMainTab('sandbox');
        });
        document.getElementById('tabCalibration')?.addEventListener('click', () => {
            this.switchMainTab('calibration');
        });
    }

    switchMainTab(tab) {
        this.activeTab = tab;

        // Update tab buttons
        document.querySelectorAll('.main-tab').forEach(btn => btn.classList.remove('active'));
        document.getElementById(tab === 'sandbox' ? 'tabSandbox' : 'tabCalibration')?.classList.add('active');

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        document.getElementById(tab === 'sandbox' ? 'sandboxContent' : 'calibrationContent')?.classList.add('active');
    }

    loadSceneBackground() {
        // SVG is inlined in HTML, just initialize the scene view
        if (this.sceneView) {
            this.sceneView.init();
        }
    }

    setupEventListeners() {
        // Set up slider/input pairs
        Object.entries(this.paramDefs).forEach(([paramName, def]) => {
            const slider = document.getElementById(def.slider);
            const input = document.getElementById(def.input);

            if (slider && input) {
                // Sync slider to input
                slider.addEventListener('input', (e) => {
                    input.value = e.target.value;
                    this.debouncedSimulation();
                });

                // Sync input to slider
                input.addEventListener('input', (e) => {
                    slider.value = e.target.value;
                    this.debouncedSimulation();
                });
            } else if (input) {
                // Input only - trigger simulation on change
                input.addEventListener('input', () => {
                    this.debouncedSimulation();
                });
            }

            // Run on enter key (for all inputs)
            if (input) {
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        if (slider) slider.value = input.value;
                        this.runSimulation();
                    }
                });
            }
        });

        // Reset buttons
        document.getElementById('resetDefaults')?.addEventListener('click', () => {
            this.resetToDefaults();
        });

        document.getElementById('setScWDefaults')?.addEventListener('click', () => {
            this.setScWDefaults();
        });

        // Export button
        document.getElementById('exportCSV')?.addEventListener('click', () => {
            this.exportCSV();
        });

        // View toggle buttons
        document.getElementById('viewSchematic')?.addEventListener('click', () => {
            this.switchView('schematic');
        });
        document.getElementById('viewScene')?.addEventListener('click', () => {
            this.switchView('scene');
        });
    }

    switchView(view) {
        this.activeView = view;
        const schematicView = document.getElementById('schematicView');
        const sceneView = document.getElementById('sceneView');
        const btnSchematic = document.getElementById('viewSchematic');
        const btnScene = document.getElementById('viewScene');

        if (view === 'schematic') {
            if (schematicView) schematicView.style.display = '';
            if (sceneView) sceneView.style.display = 'none';
            btnSchematic?.classList.add('active');
            btnScene?.classList.remove('active');
        } else {
            if (schematicView) schematicView.style.display = 'none';
            if (sceneView) sceneView.style.display = 'flex';
            btnSchematic?.classList.remove('active');
            btnScene?.classList.add('active');

            // Update scene view when switching to it
            if (this.lastResults && this.sceneView) {
                this.sceneView.update(this.lastResults, this.getParams());
            }
        }
    }

    /**
     * Debounce simulation to avoid excessive recalculation
     */
    debouncedSimulation() {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            this.runSimulation();
        }, 50);
    }

    /**
     * Get current parameter values from the UI
     */
    getParams() {
        const params = {};
        Object.entries(this.paramDefs).forEach(([paramName, def]) => {
            const input = document.getElementById(def.input);
            if (input) {
                params[paramName] = parseFloat(input.value);
            }
        });
        return params;
    }

    /**
     * Set parameter values in the UI
     */
    setParams(params) {
        Object.entries(params).forEach(([paramName, value]) => {
            const def = this.paramDefs[paramName];
            if (def) {
                const slider = document.getElementById(def.slider);
                const input = document.getElementById(def.input);
                if (slider) slider.value = value;
                if (input) input.value = value;
            }
        });
    }

    /**
     * Run the GI simulation and update displays
     */
    runSimulation() {
        const params = this.getParams();
        this.model = new GIModel(params);

        const results = this.model.runSimulation();

        // Update schematic with results and params (for elevation labels)
        this.schematic.update(results, params);

        // Update scene view if initialized
        if (this.sceneView) {
            this.sceneView.update(results, params);
        }

        // Update summary statistics
        this.updateSummary(results.summary);

        // Store results for export
        this.lastResults = results;
    }

    /**
     * Update the summary statistics panel
     */
    updateSummary(summary) {
        document.getElementById('statRainfallVol').textContent = `${summary.rainfallVolume.toLocaleString()} m³`;
        document.getElementById('statInitialVol').textContent = `${(summary.initialVsoil || 0).toLocaleString()} m³`;

        document.getElementById('statNetworkVol').textContent = `${summary.networkVolume.toLocaleString()} m³`;
        document.getElementById('statBaseflowVol').textContent = `${summary.baseflowVolume.toLocaleString()} m³`;
        document.getElementById('statEvaporationVol').textContent = `${summary.evaporationVolume.toLocaleString()} m³`;

        document.getElementById('statFinalDepressionVol').textContent = `${summary.finalVdepression.toLocaleString()} m³`;
        document.getElementById('statFinalSoilVol').textContent = `${summary.finalVsoil.toLocaleString()} m³`;
        document.getElementById('statFinalGroundVol').textContent = `${summary.finalVground.toLocaleString()} m³`;

        const contEl = document.getElementById('statContinuity');
        contEl.textContent = `${summary.continuityResidual.toLocaleString()} m³`;
        // Colour-code: within ±1% of rainfall = good, ±5% = warn, worse = error
        const pct = summary.rainfallVolume > 0
            ? Math.abs(summary.continuityResidual) / summary.rainfallVolume * 100 : 0;
        contEl.className = 'stat-value ' + (pct <= 1 ? 'continuity-good' : pct <= 5 ? 'continuity-warn' : 'continuity-error');
    }

    /**
     * Reset all parameters to defaults
     */
    resetToDefaults() {
        const defaults = {};
        Object.entries(this.paramDefs).forEach(([paramName, def]) => {
            defaults[paramName] = def.default;
        });
        this.setParams(defaults);
        this.runSimulation();
    }

    /**
     * Set Scottish Water default GI parameters
     */
    setScWDefaults() {
        const scwDefaults = GIModel.getScWDefaults();
        this.setParams(scwDefaults);
        this.runSimulation();
    }

    /**
     * Export results as CSV
     */
    exportCSV() {
        if (!this.lastResults) {
            alert('No results to export. Run a simulation first.');
            return;
        }

        const results = this.lastResults;
        const headers = ['Time(min)', 'Days', 'Qrain(m3/s)', 'Qrunoff(m3/s)', 'Qsoil(m3/s)',
            'Vsoil(m3)', 'SoilLevel(mAOD)', 'Qground(m3/s)', 'QsoilInf(m3/s)',
            'Vground(m3)', 'GroundLevel(mAOD)', 'Qbaseflow(m3/s)',
            'QgroundInf(m3/s)', 'Qnetwork(m3/s)'];

        let csv = headers.join(',') + '\n';

        for (let i = 0; i < results.time.length; i++) {
            const row = [
                results.time[i],
                results.days[i].toFixed(4),
                results.Qrain[i].toFixed(6),
                results.Qrunoff[i].toFixed(6),
                results.Qsoil[i].toFixed(6),
                results.Vsoil[i].toFixed(2),
                results.soilLevel[i].toFixed(4),
                results.Qground[i].toFixed(6),
                results.QsoilInf[i].toFixed(6),
                results.Vground[i].toFixed(2),
                results.groundLevel[i].toFixed(4),
                results.Qbaseflow[i].toFixed(6),
                results.QgroundInf[i].toFixed(6),
                results.Qnetwork[i].toFixed(6)
            ];
            csv += row.join(',') + '\n';
        }

        // Add summary at the end
        csv += '\n\nSummary\n';
        csv += `Rainfall Volume,${results.summary.rainfallVolume},m3\n`;
        csv += `Runoff Volume,${results.summary.runoffVolume},m3\n`;
        csv += `Network Volume,${results.summary.networkVolume},m3\n`;
        csv += `Baseflow Volume,${results.summary.baseflowVolume},m3\n`;
        csv += `Soil Infiltration Volume,${results.summary.soilInfVolume},m3\n`;
        csv += `Ground Infiltration Volume,${results.summary.groundInfVolume},m3\n`;
        csv += `Continuity Residual,${results.summary.continuityResidual},m3\n`;
        csv += `Time to Peak,${results.summary.timeToPeak},min\n`;

        // Download
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gi_sandbox_results_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new GISandboxApp();
});
