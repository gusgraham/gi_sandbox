/**
 * Calibration Controller
 * Manages file uploads, data processing, and calibration simulation
 */

class Calibration {
    constructor() {
        this.fileParser = new FileParser();
        this.data = null;  // Parsed data from files
        this.timestepMinutes = 2;
        this.columnMapping = {
            rainfall: null,
            observedFlow: null,
            predictedFlow: null
        };

        // Calibration-specific parameters
        this.params = {
            giArea: 0.01,  // hectares
            depressionStorage: 0,
            evaporationRate: 0,
            coverLevel: 50,
            nodeBackwaterLevel: 0,
            initialSoilDepth: 0,  // percentage
            initialGWLevel: 48.5,
            // GI parameters (matching sandbox defaults)
            soilDepth: 0.01,  // m
            soilPorosity: 20, // %
            percolationThreshold: 10, // %
            percolationPctInfiltrating: 0, // %
            percolationCoeff: 0.01, // days
            groundPorosity: 20, // %
            infiltrationThreshold: 0.02, // m
            infiltrationCoeff: 0.1, // days
            baseflowThreshold: 0, // m
            baseflowCoeff: 10  // days
        };

        this.results = null;
        this.debounceTimer = null;
        this.chart = null;  // Chart.js instance
        this.schematic = null;  // GI Schematic instance for calibration
        this.storeViewMode = 'all'; // Track active store plot filter
    }

    init() {
        this.setupEventListeners();

        // Initialize calibration schematic
        this.schematic = new GISchematic('calibrationSchematic');

        // Setup view tab switching
        this.setupViewTabs();
    }

    setupViewTabs() {
        const tabs = document.querySelectorAll('.cal-view-tab');
        const panes = document.querySelectorAll('.cal-view-pane');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                // Deactivate all
                tabs.forEach(t => t.classList.remove('active'));
                panes.forEach(p => {
                    p.classList.remove('active');
                    p.style.display = 'none';
                });

                // Activate selected
                tab.classList.add('active');
                const targetId = tab.id === 'calTabSchematic' ? 'calViewSchematic' : 'calViewChart';
                const targetPane = document.getElementById(targetId);
                targetPane.classList.add('active');
                targetPane.style.display = '';

                // Resize chart if switching to chart view
                if (tab.id === 'calTabChart' && this.chart) {
                    this.chart.resize();
                }
            });
        });

        // Reset zoom button
        document.getElementById('calResetZoom').addEventListener('click', () => {
            this.resetAllZooms();
        });

        // Double-click to reset zoom
        document.getElementById('calibrationChart').addEventListener('dblclick', () => {
            this.resetAllZooms();
        });

        // Double-click on store chart to reset zoom
        document.getElementById('storeChart').addEventListener('dblclick', () => {
            this.resetAllZooms();
        });
    }

    // Debounced run for auto-updating on parameter changes
    debouncedRun() {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            this.runCalibration();
        }, 150);
    }

    setupEventListeners() {
        // File drop zone
        const dropzone = document.getElementById('calibrationDropzone');
        if (dropzone) {
            dropzone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropzone.classList.add('dragover');
            });
            dropzone.addEventListener('dragleave', () => {
                dropzone.classList.remove('dragover');
            });
            dropzone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropzone.classList.remove('dragover');
                this.handleFileDrop(e.dataTransfer.files);
            });
            dropzone.addEventListener('click', () => {
                document.getElementById('calibrationFileInput').click();
            });
        }

        // File input
        const fileInput = document.getElementById('calibrationFileInput');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                this.handleFileDrop(e.target.files);
            });
        }

        // Run calibration button
        const runBtn = document.getElementById('runCalibrationBtn');
        if (runBtn) {
            runBtn.addEventListener('click', () => this.runCalibration());
        }

        // Export calibration CSV
        const exportBtn = document.getElementById('exportCalibrationCSV');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportCSV());
        }

        // Column mapping dropdowns - auto-run on change
        ['rainfallColumn', 'observedFlowColumn', 'predictedFlowColumn'].forEach(id => {
            const select = document.getElementById(id);
            if (select) {
                select.addEventListener('change', (e) => {
                    const key = id.replace('Column', '');
                    this.columnMapping[key] = e.target.value;
                    this.debouncedRun();
                });
            }
        });

        // Store Plot Checkbox
        const storeCheckbox = document.getElementById('showStorePlot');
        if (storeCheckbox) {
            storeCheckbox.addEventListener('change', () => {
                this.updateStackedCharts();
            });
        }

        // Store Plot Toggles
        ['calToggleAll', 'calToggleSoil', 'calToggleGround'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.addEventListener('click', (e) => {
                    // Update active state
                    ['calToggleAll', 'calToggleSoil', 'calToggleGround'].forEach(b =>
                        document.getElementById(b).classList.remove('active'));
                    e.target.classList.add('active');

                    // Apply filter
                    const mode = id.replace('calToggle', '').toLowerCase(); // all, soil, ground
                    this.toggleStoreDatasets(mode);
                });
            }
        });

        // Parameter inputs
        this.setupParamInputs();
    }

    setupParamInputs() {
        const paramIds = [
            'calGiArea', 'calDepressionStorage', 'calEvaporationRate',
            'calCoverLevel', 'calNodeBackwaterLevel',
            'calInitialSoilDepth', 'calInitialGWLevel',
            'calSoilDepth', 'calSoilPorosity', 'calPercolationThreshold',
            'calPercolationPctInfiltrating', 'calPercolationCoeff',
            'calGroundPorosity', 'calInfiltrationThreshold', 'calInfiltrationCoeff',
            'calBaseflowThreshold', 'calBaseflowCoeff'
        ];

        paramIds.forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                // Map camelCase param name
                const paramName = id.replace('cal', '').replace(/^[A-Z]/, c => c.toLowerCase());
                input.addEventListener('change', (e) => {
                    this.params[paramName] = parseFloat(e.target.value) || 0;
                    this.debouncedRun();
                });
                input.addEventListener('input', (e) => {
                    this.params[paramName] = parseFloat(e.target.value) || 0;
                    this.debouncedRun();
                });
            }
        });
    }

    async handleFileDrop(files) {
        if (files.length === 0) return;

        if (files.length > 1) {
            const statusEl = document.getElementById('calibrationStatus');
            statusEl.textContent = `Note: only the first file (${files[0].name}) will be loaded. All columns should be in a single file.`;
            statusEl.className = 'status-warning';
        }

        const file = files[0];
        const statusEl = document.getElementById('calibrationStatus');

        try {
            statusEl.textContent = `Parsing ${file.name}...`;
            statusEl.className = 'status-loading';

            this.data = await this.fileParser.parseFile(file);
            this.timestepMinutes = this.data.timestepMinutes;

            // Update UI
            document.getElementById('detectedTimestep').textContent =
                `${this.timestepMinutes} min`;

            this.populateColumnDropdowns();
            this.showDataPreview();

            statusEl.textContent = `Loaded ${this.data.timestamps.length} rows from ${file.name}`;
            statusEl.className = 'status-success';

            document.getElementById('calibrationControls').style.display = 'block';

        } catch (error) {
            statusEl.textContent = `Error: ${error.message}`;
            statusEl.className = 'status-error';
            console.error('File parsing error:', error);
        }
    }

    populateColumnDropdowns() {
        const columns = this.data.columns.map(c => c.name);

        ['rainfallColumn', 'observedFlowColumn', 'predictedFlowColumn'].forEach(id => {
            const select = document.getElementById(id);
            if (!select) return;

            select.innerHTML = '<option value="">-- Select --</option>';
            columns.forEach(col => {
                const option = document.createElement('option');
                option.value = col;
                option.textContent = col;
                select.appendChild(option);
            });

            // Auto-select based on common names
            const lowerColumns = columns.map(c => c.toLowerCase());
            if (id === 'rainfallColumn') {
                const idx = lowerColumns.findIndex(c =>
                    c.includes('rain') || c.includes('precip'));
                if (idx >= 0) select.value = columns[idx];
            } else if (id === 'observedFlowColumn') {
                const idx = lowerColumns.findIndex(c =>
                    c.includes('observed') || c.includes('measured') || c.includes('actual'));
                if (idx >= 0) select.value = columns[idx];
            } else if (id === 'predictedFlowColumn') {
                const idx = lowerColumns.findIndex(c =>
                    c.includes('predict') || c.includes('model') || c.includes('simul'));
                if (idx >= 0) select.value = columns[idx];
            }

            // Trigger change to set mapping
            select.dispatchEvent(new Event('change'));
        });
    }

    showDataPreview() {
        const tbody = document.getElementById('dataPreviewBody');
        if (!tbody) return;

        tbody.innerHTML = '';
        const maxRows = Math.min(10, this.data.timestamps.length);

        for (let i = 0; i < maxRows; i++) {
            const tr = document.createElement('tr');

            // Timestamp cell
            const tdTime = document.createElement('td');
            tdTime.textContent = this.formatTimestamp(this.data.timestamps[i]);
            tr.appendChild(tdTime);

            // Data columns
            this.data.columns.forEach(col => {
                const td = document.createElement('td');
                td.textContent = col.data[i]?.toFixed(4) || '0';
                tr.appendChild(td);
            });

            tbody.appendChild(tr);
        }

        // Update header
        const thead = document.getElementById('dataPreviewHead');
        if (thead) {
            thead.innerHTML = '<th>Time</th>' +
                this.data.columns.map(c => `<th>${c.name}</th>`).join('');
        }
    }

    formatTimestamp(date) {
        if (!date) return '';
        const pad = n => n.toString().padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
            `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    runCalibration() {
        // Silently return if data not ready (since this is auto-triggered)
        if (!this.data) return;

        // Get selected columns
        const rainfallCol = this.data.columns.find(c => c.name === this.columnMapping.rainfall);
        const observedCol = this.data.columns.find(c => c.name === this.columnMapping.observedFlow);
        const predictedCol = this.data.columns.find(c => c.name === this.columnMapping.predictedFlow);

        // Silently return if columns not all mapped yet
        if (!rainfallCol || !observedCol || !predictedCol) return;

        // Derive Qsoil from rainfall
        // Qsoil = Rainfall (mm/hr) × Area (ha) × 10 (conversion to m³/hr) / 3600 (to m³/s)
        // Actually: mm/hr over 1 ha = 10 m³/hr = 0.00278 m³/s per mm/hr
        const conversionFactor = this.params.giArea * 10 / 3600; // mm/hr to m³/s
        const Qsoil = rainfallCol.data.map(r => r * conversionFactor);

        // Run GI simulation with external Qsoil
        this.results = this.simulateGI(Qsoil);

        // Calculate Qnetwork + predicted = total simulated
        this.results.totalSimulated = this.results.Qnetwork.map((q, i) =>
            q + (predictedCol.data[i] || 0));
        this.results.observedFlow = observedCol.data;
        this.results.predictedFlow = predictedCol.data;
        this.results.rainfall = rainfallCol.data;
        this.results.Qsoil = Qsoil;

        // Add Qrain and Qrunoff (for schematic compatibility)
        this.results.Qrain = Qsoil.map((q, i) => q + (predictedCol.data[i] || 0)); // Rain input now includes baseline source
        this.results.Qrunoff = predictedCol.data; // Runoff is now the baseline flow

        // Calculate summary volumes for schematic display
        const dt = this.timestepMinutes * 60; // seconds
        const conversionToDepth = this.timestepMinutes / 60; // hr

        this.results.summary = {
            rainfallDepth: rainfallCol.data.reduce((sum, r) => sum + r * conversionToDepth, 0), // Total depth in mm if input is mm/hr
            rainfallVolume: this.results.Qrain.reduce((sum, q) => sum + q * dt, 0),
            soilVolume: Qsoil.reduce((sum, q) => sum + q * dt, 0),
            runoffVolume: this.results.Qrunoff.reduce((sum, q) => sum + q * dt, 0),
            groundVolume: this.results.Qground.reduce((sum, q) => sum + q * dt, 0),
            soilInfVolume: this.results.QsoilInf.reduce((sum, q) => sum + q * dt, 0),
            baseflowVolume: this.results.Qbaseflow.reduce((sum, q) => sum + q * dt, 0),
            groundInfVolume: this.results.QgroundInf.reduce((sum, q) => sum + q * dt, 0),
            networkVolume: this.results.totalSimulated.reduce((sum, q) => sum + q * dt, 0)
        };

        // Ensure Qnetwork for sparkline matches total simulated
        this.results.Qnetwork = this.results.totalSimulated;

        // Update the comparison chart
        this.updateChart();

        // Update charts
        this.updateStackedCharts();

        // Update stats
        this.updateStats();

        // Update the schematic view with calibration results
        if (this.schematic) {
            this.schematic.update(this.results, this.params);
        }

        document.getElementById('calibrationStatus').textContent = 'Calibration complete';
        document.getElementById('calibrationStatus').className = 'status-success';
    }

    getChartLabels() {
        return this.data.timestamps.map(t => {
            if (!t) return '';
            const pad = n => n.toString().padStart(2, '0');
            return `${pad(t.getDate())}/${pad(t.getMonth() + 1)} ${pad(t.getHours())}:${pad(t.getMinutes())}`;
        });
    }

    updateChart() {
        const ctx = document.getElementById('calibrationChart');
        if (!ctx) return;

        const labels = this.getChartLabels();

        if (this.chart) {
            // Update existing chart data
            this.chart.data.labels = labels;
            this.chart.data.datasets[0].data = this.results.observedFlow;
            this.chart.data.datasets[1].data = this.results.totalSimulated;
            this.chart.data.datasets[2].data = this.results.predictedFlow;

            // Update without animation to preserve zoom state
            // Explicitly persist current zoom state to options, as chart.update() uses options
            if (this.chart.scales.x) {
                this.chart.options.scales.x.min = this.chart.scales.x.min;
                this.chart.options.scales.x.max = this.chart.scales.x.max;
            }
            this.chart.update('none');
        } else {
            // Create new chart
            this.chart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Observed Flow',
                            data: this.results.observedFlow,
                            borderColor: '#00d4aa',
                            backgroundColor: 'rgba(0, 212, 170, 0.1)',
                            borderWidth: 2,
                            fill: false,
                            tension: 0.1,
                            pointRadius: 0
                        },
                        {
                            label: 'Simulated (Predicted + GI)',
                            data: this.results.totalSimulated,
                            borderColor: '#ff7eb3',
                            backgroundColor: 'rgba(255, 126, 179, 0.1)',
                            borderWidth: 2,
                            fill: false,
                            tension: 0.1,
                            pointRadius: 0
                        },
                        {
                            label: 'Predicted (no GI)',
                            data: this.results.predictedFlow,
                            borderColor: '#7c5cff',
                            backgroundColor: 'rgba(124, 92, 255, 0.1)',
                            borderWidth: 1,
                            borderDash: [5, 5],
                            fill: false,
                            tension: 0.1,
                            pointRadius: 0
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        intersect: false,
                        mode: 'index'
                    },
                    plugins: {
                        legend: {
                            labels: { color: '#a0aec0' }
                        },
                        zoom: {
                            zoom: {
                                drag: {
                                    enabled: true,
                                    backgroundColor: 'rgba(0, 149, 255, 0.15)',
                                    borderColor: 'rgba(0, 149, 255, 0.5)',
                                    borderWidth: 1
                                },
                                mode: 'x',
                                onZoom: ({ chart }) => this.syncZoom(chart)
                            },
                            limits: {
                                x: { minRange: 5 }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                title: (items) => items[0]?.label || ''
                            }
                        }
                    },
                    scales: {
                        x: {
                            ticks: { color: '#64748b', maxTicksLimit: 12 },
                            grid: { color: 'rgba(255,255,255,0.05)' }
                        },
                        y: {
                            title: { display: true, text: 'Flow (m³/s)', color: '#a0aec0' },
                            ticks: { color: '#64748b' },
                            grid: { color: 'rgba(255,255,255,0.05)' }
                        }
                    }
                }
            });
        }
    }

    updateStackedCharts() {
        if (!this.results) return;

        const showStore = document.getElementById('showStorePlot').checked;
        const storeWrapper = document.getElementById('storeChartWrapper');

        if (showStore) {
            storeWrapper.style.display = 'block';
            document.getElementById('storePlotControls').style.display = 'flex';
            this.renderStoreChart();
        } else {
            storeWrapper.style.display = 'none';
            document.getElementById('storePlotControls').style.display = 'none';
        }

        // Always update main chart
        this.updateChart();

        // Sync zoom from main chart to store chart if needed
        if (this.chart && this.storeChart && showStore) {
            this.syncZoom(this.chart);
        }
    }

    // Add syncZoom helper
    syncZoom(sourceChart) {
        // Find all active charts
        const charts = [this.chart];
        if (this.storeChart && document.getElementById('showStorePlot').checked) charts.push(this.storeChart);

        const { min, max } = sourceChart.scales.x;

        charts.forEach(chart => {
            if (chart && chart !== sourceChart) {
                if (chart.scales.x) {
                    // Update scale instance directly for immediate effect
                    chart.options.scales.x.min = min;
                    chart.options.scales.x.max = max;
                    chart.update('none');
                }
            }
        });
    }

    resetAllZooms() {
        const charts = [this.chart];
        if (this.storeChart) charts.push(this.storeChart);

        charts.forEach(chart => {
            if (chart) {
                // chart.resetZoom() triggers an update/animation which is slow and redundant
                // since we are manually clearing the limits anyway.
                // explicitly clearing min/max forces Chart.js to auto-scale to data.
                delete chart.options.scales.x.min;
                delete chart.options.scales.x.max;

                chart.update();
            }
        });
    }

    renderStoreChart() {
        const ctx = document.getElementById('storeChart');
        if (!ctx) return;

        let datasets = [];
        let yTitle = 'Level (mAOD)';

        const labels = this.getChartLabels();

        // Soil Data
        const soilLevel = this.results.soilLevel;
        const bedLevel = this.params.coverLevel - this.params.soilDepth;
        const percThreshold = bedLevel + (this.params.percolationThreshold / 100) * this.params.soilDepth;

        // Ground Data
        const groundLevel = this.results.groundLevel;
        const initialGW = this.params.initialGWLevel;
        const groundDepth = this.params.coverLevel - this.params.soilDepth;
        const infLevel = initialGW + this.params.infiltrationThreshold;
        const bfLevel = initialGW + this.params.baseflowThreshold;

        datasets = [
            // Soil Datasets
            {
                label: 'Soil Water Level',
                data: soilLevel,
                borderColor: '#00d4aa',
                backgroundColor: 'rgba(0, 212, 170, 0.1)',
                borderWidth: 2,
                fill: true,
                pointRadius: 0
            },
            {
                label: 'Percolation Threshold',
                data: new Array(soilLevel.length).fill(percThreshold),
                borderColor: '#ffffff',
                borderWidth: 1,
                borderDash: [5, 5],
                pointRadius: 0
            },
            {
                label: 'Cover Level',
                data: new Array(soilLevel.length).fill(this.params.coverLevel),
                borderColor: '#a0aec0',
                borderWidth: 1,
                pointRadius: 0
            },
            // Ground Datasets
            {
                label: 'Ground Water Level',
                data: groundLevel,
                borderColor: '#ff7eb3',
                backgroundColor: 'rgba(255, 126, 179, 0.1)',
                borderWidth: 2,
                fill: true,
                pointRadius: 0
            },
            {
                label: 'Infiltration Threshold',
                data: new Array(groundLevel.length).fill(infLevel),
                borderColor: '#ffaa00', // Warning color
                borderWidth: 1,
                borderDash: [5, 5],
                pointRadius: 0
            },
            {
                label: 'Baseflow Threshold',
                data: new Array(groundLevel.length).fill(bfLevel),
                borderColor: '#7c5cff',
                borderWidth: 1,
                borderDash: [2, 2],
                pointRadius: 0
            },
            {
                label: 'Initial GW',
                data: new Array(groundLevel.length).fill(initialGW),
                borderColor: '#64748b',
                borderWidth: 1,
                pointRadius: 0
            },
            {
                label: 'Soil Bed',
                data: new Array(groundLevel.length).fill(groundDepth),
                borderColor: '#8a7b6c',
                borderWidth: 1,
                borderDash: [5, 5],
                pointRadius: 0
            }
        ];

        if (this.storeChart) {
            // Persist zoom state
            if (this.storeChart.scales.x) {
                this.storeChart.options.scales.x.min = this.storeChart.scales.x.min;
                this.storeChart.options.scales.x.max = this.storeChart.scales.x.max;
            }

            this.storeChart.data.labels = labels;
            this.storeChart.data.datasets = datasets;
            this.storeChart.options.scales.y.title.text = yTitle;

            // Re-apply visibility filter
            this.toggleStoreDatasets(this.storeViewMode);
            // Note: toggleStoreDatasets calls update('none') so we don't need to call it here again
            // BUT toggleStoreDatasets checks for this.storeChart. check if that causes issues. 
            // Actually toggleStoreDatasets calls update('none'). 
            // If we don't call it, we rely on toggleStoreDatasets. 
            // Safer to call it once. 
            // toggleStoreDatasets updates 'hidden' props.

            // We'll let toggleStoreDatasets handle the update.
        } else {
            this.storeChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        intersect: false,
                        mode: 'index'
                    },
                    plugins: {
                        legend: { labels: { color: '#a0aec0', boxWidth: 10 } },
                        zoom: {
                            zoom: {
                                drag: {
                                    enabled: true,
                                    backgroundColor: 'rgba(0, 149, 255, 0.15)',
                                    borderColor: 'rgba(0, 149, 255, 0.5)',
                                    borderWidth: 1
                                },
                                mode: 'x',
                                onZoom: ({ chart }) => this.syncZoom(chart)
                            },
                            limits: { x: { minRange: 5 } }
                        }
                    },
                    scales: {
                        x: {
                            display: false,
                            grid: { display: false }
                        },
                        y: {
                            title: { display: true, text: yTitle, color: '#a0aec0' },
                            ticks: { color: '#64748b' },
                            grid: { color: 'rgba(255,255,255,0.05)' }
                        }
                    }
                }
            });
        }
    }

    toggleStoreDatasets(mode) {
        if (!this.storeChart) return;

        this.storeViewMode = mode; // Save state

        const soilLabels = ['Soil Water Level', 'Percolation Threshold', 'Cover Level', 'Soil Bed'];
        const groundLabels = ['Ground Water Level', 'Infiltration Threshold', 'Baseflow Threshold', 'Initial GW', 'Soil Bed']; // Soil Bed is shared visual context

        this.storeChart.data.datasets.forEach(dataset => {
            let shouldShow = false;
            if (mode === 'all') {
                shouldShow = true;
            } else if (mode === 'soil') {
                shouldShow = soilLabels.includes(dataset.label);
            } else if (mode === 'ground') {
                shouldShow = groundLabels.includes(dataset.label);
            }
            // Chart.js uses 'hidden' property which is true if hidden (so inverse of shouldShow)
            // But 'hidden' can also be null/undefined (visible).
            // Explicitly setting it.
            dataset.hidden = !shouldShow;
        });

        this.storeChart.update('none');
    }

    updateStats() {
        const dt = this.timestepMinutes * 60; // seconds

        // Calculate peaks
        const peakObs = Math.max(...this.results.observedFlow);
        const peakSim = Math.max(...this.results.totalSimulated);

        // Calculate volumes
        const volObs = this.results.observedFlow.reduce((sum, v) => sum + v, 0) * dt;
        const volSim = this.results.totalSimulated.reduce((sum, v) => sum + v, 0) * dt;
        const volPred = this.results.predictedFlow.reduce((sum, v) => sum + v, 0) * dt;
        // GI contribution = difference between total simulated and baseline predicted
        const volGi = volSim - volPred;

        // Calculate KGE between observed and total simulated
        const kgeResult = this.calculateKGE(this.results.observedFlow, this.results.totalSimulated);

        // Update UI - peaks and volumes
        document.getElementById('calStatPeakObs').textContent = peakObs.toFixed(4) + ' m³/s';
        document.getElementById('calStatPeakSim').textContent = peakSim.toFixed(4) + ' m³/s';
        document.getElementById('calStatVolObs').textContent = this.formatVolume(volObs);
        document.getElementById('calStatVolSim').textContent = this.formatVolume(volSim);
        document.getElementById('calStatGiContrib').textContent = this.formatVolume(volGi);

        // Update KGE stats
        const kgeEl = document.getElementById('calStatKGE');
        if (kgeEl) {
            const kgeVal = isNaN(kgeResult.kge) ? '--' : kgeResult.kge.toFixed(3);
            kgeEl.textContent = kgeVal;
            // Colour-code: green ≥ 0.75, amber ≥ 0.5, red < 0.5
            kgeEl.className = 'stat-value kge-value ' + this.kgeClass(kgeResult.kge);
        }
        const rEl = document.getElementById('calStatKGE_r');
        if (rEl) rEl.textContent = isNaN(kgeResult.r) ? '--' : kgeResult.r.toFixed(3);

        const alphaEl = document.getElementById('calStatKGE_alpha');
        if (alphaEl) alphaEl.textContent = isNaN(kgeResult.alpha) ? '--' : kgeResult.alpha.toFixed(3);

        const betaEl = document.getElementById('calStatKGE_beta');
        if (betaEl) betaEl.textContent = isNaN(kgeResult.beta) ? '--' : kgeResult.beta.toFixed(3);
    }

    /**
     * Kling-Gupta Efficiency (Gupta et al. 2009)
     * KGE = 1 - sqrt((r-1)² + (α-1)² + (β-1)²)
     *   r     = Pearson correlation coefficient  [timing / shape]
     *   α     = σ_sim / σ_obs                   [variability ratio]
     *   β     = μ_sim / μ_obs                   [bias ratio]
     * KGE = 1 is perfect; > 0.75 good; > 0.5 acceptable; < 0 worse than mean
     */
    calculateKGE(obs, sim) {
        const n = obs.length;
        if (n < 2) return { kge: NaN, r: NaN, alpha: NaN, beta: NaN };

        const meanObs = obs.reduce((s, v) => s + v, 0) / n;
        const meanSim = sim.reduce((s, v) => s + v, 0) / n;

        if (meanObs === 0) return { kge: NaN, r: NaN, alpha: NaN, beta: NaN };

        const stdObs = Math.sqrt(obs.reduce((s, v) => s + (v - meanObs) ** 2, 0) / n);
        const stdSim = Math.sqrt(sim.reduce((s, v) => s + (v - meanSim) ** 2, 0) / n);

        let covSum = 0;
        for (let i = 0; i < n; i++) {
            covSum += (obs[i] - meanObs) * (sim[i] - meanSim);
        }

        const r = (stdObs > 0 && stdSim > 0) ? covSum / (n * stdObs * stdSim) : 0;
        const alpha = stdObs > 0 ? stdSim / stdObs : NaN;
        const beta = meanSim / meanObs;
        const kge = 1 - Math.sqrt((r - 1) ** 2 + (alpha - 1) ** 2 + (beta - 1) ** 2);

        return { kge, r, alpha, beta };
    }

    kgeClass(kge) {
        if (isNaN(kge)) return '';
        if (kge >= 0.75) return 'kge-good';
        if (kge >= 0.5) return 'kge-ok';
        return 'kge-poor';
    }

    formatVolume(vol) {
        if (vol >= 1000) return (vol / 1000).toFixed(1) + ' k m³';
        return vol.toFixed(1) + ' m³';
    }

    exportCSV() {
        if (!this.results) {
            alert('Run calibration first before exporting.');
            return;
        }

        const dt = this.timestepMinutes * 60;
        const kge = this.calculateKGE(this.results.observedFlow, this.results.totalSimulated);

        const headers = ['Timestamp', 'Rainfall(mm/hr)',
            'Observed_Flow(m3/s)', 'Predicted_NoGI(m3/s)',
            'GI_Qnetwork(m3/s)', 'Total_Simulated(m3/s)'];

        let csv = headers.join(',') + '\n';

        for (let i = 0; i < this.data.timestamps.length; i++) {
            const pad = n => n.toString().padStart(2, '0');
            const t = this.data.timestamps[i];
            const ts = t
                ? `${t.getFullYear()}-${pad(t.getMonth()+1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}`
                : '';
            const rain  = (this.results.rainfall?.[i] ?? 0).toFixed(4);
            const obs   = (this.results.observedFlow?.[i] ?? 0).toFixed(6);
            const pred  = (this.results.predictedFlow?.[i] ?? 0).toFixed(6);
            // GI contribution = totalSimulated - predicted
            const gi    = ((this.results.totalSimulated?.[i] ?? 0) - (this.results.predictedFlow?.[i] ?? 0)).toFixed(6);
            const sim   = (this.results.totalSimulated?.[i] ?? 0).toFixed(6);
            csv += `${ts},${rain},${obs},${pred},${gi},${sim}\n`;
        }

        csv += '\n\nCalibration Summary\n';
        csv += `KGE,${isNaN(kge.kge) ? '' : kge.kge.toFixed(4)}\n`;
        csv += `r (timing),${isNaN(kge.r) ? '' : kge.r.toFixed(4)}\n`;
        csv += `alpha (variability),${isNaN(kge.alpha) ? '' : kge.alpha.toFixed(4)}\n`;
        csv += `beta (bias),${isNaN(kge.beta) ? '' : kge.beta.toFixed(4)}\n`;

        const volObs = this.results.observedFlow.reduce((s, v) => s + v, 0) * dt;
        const volSim = this.results.totalSimulated.reduce((s, v) => s + v, 0) * dt;
        csv += `Peak Observed (m3/s),${Math.max(...this.results.observedFlow).toFixed(4)}\n`;
        csv += `Peak Simulated (m3/s),${Math.max(...this.results.totalSimulated).toFixed(4)}\n`;
        csv += `Total Observed Volume (m3),${volObs.toFixed(1)}\n`;
        csv += `Total Simulated Volume (m3),${volSim.toFixed(1)}\n`;

        csv += '\nGI Parameters\n';
        Object.entries(this.params).forEach(([k, v]) => { csv += `${k},${v}\n`; });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `gi_calibration_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    simulateGI(Qsoil) {
        // Delegate to GIModel so both tabs use identical physics
        const model = new GIModel({
            subcatchmentArea:           this.params.giArea,
            evaporationRate:            this.params.evaporationRate,
            depressionStorage:          this.params.depressionStorage,
            coverLevel:                 this.params.coverLevel,
            nodeBackwaterLevel:         this.params.nodeBackwaterLevel,
            initialSoilDepth:           this.params.initialSoilDepth,
            initialGWLevel:             this.params.initialGWLevel,
            soilDepth:                  this.params.soilDepth,
            soilPorosity:               this.params.soilPorosity,
            percolationThreshold:       this.params.percolationThreshold,
            percolationPctInfiltrating: this.params.percolationPctInfiltrating,
            percolationCoeff:           this.params.percolationCoeff,
            groundPorosity:             this.params.groundPorosity,
            infiltrationThreshold:      this.params.infiltrationThreshold,
            infiltrationCoeff:          this.params.infiltrationCoeff,
            baseflowThreshold:          this.params.baseflowThreshold,
            baseflowCoeff:              this.params.baseflowCoeff
        });
        return model.runWithExternalInput(Qsoil, this.timestepMinutes);
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Calibration };
}
