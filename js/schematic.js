/**
 * Interactive Schematic Diagram
 * SVG-based visualization with mini-charts and animated arrows
 */

class GISchematic {
    constructor(svgId) {
        this.svg = document.getElementById(svgId);
        this.results = null;
        this.nodes = {};
        this.sparklines = {};
        this.params = null; // Store current params for elevation display

        this.init();
    }

    init() {
        // Clear existing content
        this.svg.innerHTML = '';

        // Add defs for gradients and markers
        this.addDefs();

        // Create the schematic layout
        this.createLayout();
    }

    addDefs() {
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');

        // Gradients and color-matched arrowhead markers
        defs.innerHTML = `
            <linearGradient id="arrowGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" style="stop-color:#0095ff;stop-opacity:0.8" />
                <stop offset="100%" style="stop-color:#00d4aa;stop-opacity:1" />
            </linearGradient>
            <linearGradient id="waterGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style="stop-color:#0095ff;stop-opacity:0.6" />
                <stop offset="100%" style="stop-color:#0066aa;stop-opacity:0.8" />
            </linearGradient>
            
            <!-- Color-matched arrowheads -->
            <marker id="arrow-blue" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#0095ff" />
            </marker>
            <marker id="arrow-purple" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#7c5cff" />
            </marker>
            <marker id="arrow-green" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#00d4aa" />
            </marker>
            <marker id="arrow-pink" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#ff7eb3" />
            </marker>
            <marker id="arrow-orange" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
                <polygon points="0 0, 10 4, 0 8" fill="#ffaa00" />
            </marker>
            <marker id="arrow-lime" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#7dffaf" />
            </marker>
        `;

        this.svg.appendChild(defs);
    }

    createLayout() {
        // Node positions - Scaled up for larger graphs
        // Left Column: Rain (20)
        // Mid-Left Column: Inputs to stores (200)
        // Center Column: Stores (380)
        // Right Column: Outputs (650)
        const nodes = [
            { id: 'rainfall', x: 20, y: 50, label: 'Rainfall', color: '#0095ff' },
            // Qrunoff moved to output column (top right)
            { id: 'qrunoff', x: 650, y: 40, label: 'Qrunoff', color: '#7c5cff' },
            // Qsoil aligned with Soil Store input
            { id: 'qsoil', x: 200, y: 160, label: 'Qsoil', color: '#00d4aa' },
            // Qground aligned with Ground Store input (left side)
            { id: 'qground', x: 200, y: 350, label: 'Qground', color: '#ff7eb3' },

            { id: 'qsoilinf', x: 650, y: 170, label: 'QsoilInf', color: '#00d4aa' },
            { id: 'qgroundinf', x: 650, y: 295, label: 'QgroundInf', color: '#ff7eb3' },
            { id: 'qbaseflow', x: 650, y: 440, label: 'Qbaseflow', color: '#ffaa00' },
            { id: 'qnetwork', x: 880, y: 190, label: 'Qnetwork', color: '#7dffaf' }
        ];

        // Create nodes
        nodes.forEach(node => {
            this.createNode(node);
        });

        // Create central store visualization
        this.createStoreVisualization();

        // Create flow arrows (smooth curved paths)
        this.createArrows();

        // Create summation node for network
        this.createSummationNode(820, 230); // Network sum

        // Create "lost to environment" indicator for baseflow
        this.createLostIndicator();

        // Create tooltip element
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'schematic-tooltip';
        this.svg.parentElement.appendChild(this.tooltip);
        // Ensure parent is relative for absolute positioning
        if (getComputedStyle(this.svg.parentElement).position === 'static') {
            this.svg.parentElement.style.position = 'relative';
        }
    }

    createNode(config) {
        const { id, x, y, label, color } = config;

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', `schematic-node node-${id}`); // Add distinct class
        g.setAttribute('transform', `translate(${x}, ${y})`);

        // Node background - Scaled Up (120x85)
        // Use classes instead of IDs for internal elements
        g.innerHTML = `
            <rect class="node-box" x="0" y="0" width="120" height="85" rx="6"/>
            <rect class="node-chart-bg" x="5" y="5" width="110" height="50" rx="4"/>
            <path class="chart-line sparkline-${id}" d="" stroke="${color}" fill="none" stroke-width="1.5"/>
            <text class="node-label" x="60" y="70" text-anchor="middle">${label}</text>
            <text class="node-value value-${id}" x="60" y="82" text-anchor="middle">0 m³</text>
        `;

        // Add hover listeners for breakdown tooltips
        if (id === 'rainfall' || id === 'qnetwork') {
            g.addEventListener('mouseenter', (e) => this.showTooltip(e, id));
            g.addEventListener('mousemove', (e) => this.moveTooltip(e));
            g.addEventListener('mouseleave', () => this.hideTooltip());
        }

        this.svg.appendChild(g);
        this.nodes[id] = g;
    }

    showTooltip(e, id) {
        if (!this.results || !this.results.summary) return;

        const s = this.results.summary;
        let content = '';

        if (id === 'rainfall') {
            content = `Rainfall Summary:\n` +
                `• Total Depth: ${(s.rainfallDepth || 0).toFixed(1)} mm\n` +
                `• Total Volume: ${this.formatNumber(s.rainfallVolume)} m³`;
        } else if (id === 'qnetwork') {
            content = `Network Breakdown:\n` +
                `• Runoff: ${this.formatNumber(s.runoffVolume)} m³\n` +
                `• Soil Inf: ${this.formatNumber(s.soilInfVolume)} m³\n` +
                `• Ground Inf: ${this.formatNumber(s.groundInfVolume)} m³`;
        }

        if (content) {
            this.tooltip.textContent = content;
            this.tooltip.classList.add('visible');
            this.moveTooltip(e);
        }
    }

    moveTooltip(e) {
        // Position relative to the container
        const rect = this.svg.parentElement.getBoundingClientRect();
        const x = e.clientX - rect.left + 15;
        const y = e.clientY - rect.top + 15;
        this.tooltip.style.left = `${x}px`;
        this.tooltip.style.top = `${y}px`;
    }

    hideTooltip() {
        this.tooltip.classList.remove('visible');
    }

    createStoreVisualization() {
        // Create TWO separate store boxes: Soil Store and Ground Store
        // Scaled up dimensions

        // === SOIL STORE (upper, green) ===
        const soilStore = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        soilStore.setAttribute('class', 'soil-store-viz');
        soilStore.setAttribute('transform', 'translate(380, 140)');

        const soilWidth = 180;
        const soilHeight = 130;
        const soilChartHeight = 85;

        // Use classes instead of IDs
        soilStore.innerHTML = `
            <!-- Soil store container -->
            <rect class="store-container" x="0" y="0" width="${soilWidth}" height="${soilHeight}" rx="4" 
                  fill="rgba(0, 212, 170, 0.15)" stroke="#00d4aa" stroke-width="1.5"/>
            
            <!-- Title -->
            <text x="${soilWidth / 2}" y="-8" text-anchor="middle" fill="#00d4aa" font-size="11" font-weight="600">SOIL STORE</text>
            
            <!-- Sparkline chart background -->
            <rect x="5" y="25" width="${soilWidth - 10}" height="${soilChartHeight}" fill="rgba(0,0,0,0.2)" rx="2"/>
            
            <!-- Threshold lines ON THE CHART -->
            <!-- Percolation Threshold (dashed) -->
            <line class="sparkline-soil-perc-line" x1="5" x2="${soilWidth - 5}" stroke="#ffffff" stroke-dasharray="2,2" stroke-opacity="0.6"/>
            
            <!-- Sparkline path for soil level -->
            <path class="sparkline-soil-level" fill="none" stroke="#00d4aa" stroke-width="2"/>
            
            <!-- Store boundaries text -->
            <text class="label-soil-cover" x="8" y="20" fill="#a0aec0" font-size="10">Cover</text>
            <text class="label-soil-base" x="8" y="${25 + soilChartHeight + 12}" fill="#00d4aa" font-size="10">Soil Base</text>
        `;

        this.svg.appendChild(soilStore);

        // === GROUND STORE (lower, pink) ===
        const groundStore = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        groundStore.setAttribute('class', 'ground-store-viz');
        groundStore.setAttribute('transform', 'translate(380, 310)');

        const groundWidth = 180;
        const groundHeight = 150;
        const groundChartHeight = 100;

        groundStore.innerHTML = `
            <!-- Ground store container -->
            <rect class="store-container" x="0" y="0" width="${groundWidth}" height="${groundHeight}" rx="4"
                  fill="rgba(255, 126, 179, 0.12)" stroke="#ff7eb3" stroke-width="1.5"/>
            
            <!-- Title -->
            <text x="${groundWidth / 2}" y="-8" text-anchor="middle" fill="#ff7eb3" font-size="11" font-weight="600">GROUND STORE</text>
            
            <!-- Sparkline chart background -->
            <rect x="5" y="25" width="${groundWidth - 10}" height="${groundChartHeight}" fill="rgba(0,0,0,0.2)" rx="2"/>
            
            <!-- Threshold lines ON THE CHART -->
            <!-- Infiltration Threshold (dashed pink) -->
            <line class="sparkline-ground-inf-line" x1="5" x2="${groundWidth - 5}" stroke="#ff7eb3" stroke-dasharray="3,2"/>
            
            <!-- Baseflow Threshold (dashed orange) -->
            <line class="sparkline-ground-bf-line" x1="5" x2="${groundWidth - 5}" stroke="#ffaa00" stroke-dasharray="3,2"/>
            
            <!-- Sparkline path for ground level -->
            <path class="sparkline-ground-level" fill="none" stroke="#ff7eb3" stroke-width="2"/>
            
            <!-- Store boundaries text -->
            <text class="label-ground-soil-base" x="8" y="20" fill="#00d4aa" font-size="10">Soil Base</text>
            <text class="label-ground-init-gwl" x="8" y="${25 + groundChartHeight + 12}" fill="#0095ff" font-size="10">Init GWL</text>
        `;

        this.svg.appendChild(groundStore);

        // Store constants for positioning calculations
        this.soilStoreWidth = soilWidth;
        this.soilStoreHeight = soilHeight;
        // Chart dimensions
        this.soilChartY = 25;
        this.soilChartHeight = soilChartHeight;

        this.groundStoreWidth = groundWidth;
        this.groundStoreHeight = groundHeight;
        // Chart dimensions
        this.groundChartY = 25;
        this.groundChartHeight = groundChartHeight;
    }

    createArrows() {
        // Updated arrow paths for large scale layout
        const arrows = [
            // Qrain arrows removed as requested

            // Qsoil to Soil Store (Straight)
            { d: 'M 320 200 L 375 200', color: '#00d4aa', marker: 'arrow-green' },

            // Soil Store to Qground (Curve out bottom-left)
            { d: 'M 380 250 Q 320 280, 320 380', color: '#ff7eb3', marker: 'arrow-pink' },

            // Qground to Ground Store (Straight)
            { d: 'M 320 390 L 375 390', color: '#ff7eb3', marker: 'arrow-pink' },

            // Soil Store to QsoilInf (Right side out) - green
            { d: 'M 560 200 Q 600 195, 645 203', color: '#00d4aa', marker: 'arrow-green' },

            // Ground Store to QgroundInf (Right side out) - pink
            { d: 'M 560 370 Q 600 355, 645 340', color: '#ff7eb3', marker: 'arrow-pink' },

            // Ground Store to Qbaseflow (Right side out, lower) - orange
            { d: 'M 560 420 Q 600 460, 645 475', color: '#ffaa00', marker: 'arrow-orange' },

            // Qrunoff to Sum (Curve down-right)
            { d: 'M 770 90 Q 800 120, 815 225', color: '#7c5cff', marker: 'arrow-purple' },

            // QsoilInf to Sum (Straight) - green
            { d: 'M 770 205 L 815 240', color: '#00d4aa', marker: 'arrow-green' },

            // QgroundInf to Sum (Curve up) - pink
            { d: 'M 770 340 Q 800 300, 815 250', color: '#ff7eb3', marker: 'arrow-pink' },

            // Sum to Qnetwork (Straight) - lime
            { d: 'M 850 245 L 875 235', color: '#7dffaf', marker: 'arrow-lime' }
        ];

        arrows.forEach((arrow, i) => {
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', arrow.d);
            path.setAttribute('stroke', arrow.color);
            path.setAttribute('stroke-width', '2.5');
            path.setAttribute('fill', 'none');
            path.setAttribute('marker-end', `url(#${arrow.marker})`);
            path.setAttribute('class', 'flow-arrow');
            path.setAttribute('id', `arrow-${i}`);
            this.svg.appendChild(path);
        });
    }

    createLostIndicator() {
        // Add "lost to environment" label near baseflow - styled consistently
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('transform', 'translate(775, 485)');

        g.innerHTML = `
            <text fill="#ffaa00" font-size="11" font-weight="500">→ lost to env</text>
        `;

        this.svg.appendChild(g);
    }

    createSummationNode(x, y) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('transform', `translate(${x}, ${y})`);

        g.innerHTML = `
            <circle cx="15" cy="15" r="10" fill="#243044" stroke="#00d4aa" stroke-width="1.5"/>
            <text x="15" y="19" text-anchor="middle" fill="#00d4aa" font-size="14" font-weight="bold">+</text>
        `;

        this.svg.appendChild(g);
    }

    /**
     * Update the schematic with new simulation results and params
     */
    update(results, params = null) {
        this.results = results;
        if (params) this.params = params;

        // Calculate global max across all flow components for consistent y-axis
        const allFlows = [
            results.Qrain, results.Qsoil, results.Qrunoff, results.Qground,
            results.QsoilInf, results.Qbaseflow, results.QgroundInf, results.Qnetwork
        ];

        // Find max value safely avoiding stack overflow with spread
        let globalMax = 0;
        for (const flow of allFlows) {
            if (!flow) continue;
            for (const val of flow) {
                if (typeof val === 'number' && !isNaN(val) && val > globalMax) {
                    globalMax = val;
                }
            }
        }
        globalMax = globalMax || 1;

        // Update sparklines with shared y-axis scale
        // Update sparklines with shared y-axis scale
        // Rainfall uses its own scale (intensity mm/hr)
        const maxRain = Math.max(...(results.rainfall || [])) || 1;
        this.updateSparkline('rainfall', results.rainfall, '#0095ff', maxRain);

        this.updateSparkline('qsoil', results.Qsoil, '#00d4aa', globalMax);
        this.updateSparkline('qrunoff', results.Qrunoff, '#7c5cff', globalMax);
        this.updateSparkline('qground', results.Qground, '#ff7eb3', globalMax);
        this.updateSparkline('qsoilinf', results.QsoilInf, '#00d4aa', globalMax);
        this.updateSparkline('qbaseflow', results.Qbaseflow, '#ffaa00', globalMax);
        this.updateSparkline('qgroundinf', results.QgroundInf, '#ff7eb3', globalMax);

        // Update value labels
        // For rainfall, show depth in mm
        const rainValEl = this.svg.querySelector('.value-rainfall');
        if (rainValEl && results.summary.rainfallDepth !== undefined) {
            rainValEl.textContent = `${results.summary.rainfallDepth.toFixed(1)} mm`;
        }

        this.updateValue('qrunoff', results.summary.runoffVolume);
        this.updateValue('qground', results.summary.groundVolume);
        this.updateValue('qsoilinf', results.summary.soilInfVolume);
        this.updateValue('qbaseflow', results.summary.baseflowVolume);
        this.updateValue('qgroundinf', results.summary.groundInfVolume);
        this.updateValue('qnetwork', results.summary.networkVolume);

        // Update store visualization with elevations
        this.updateStoreVisualization(results);
    }

    updateSparkline(id, data, color, maxVal = null) {
        // Find sparkline by class
        const path = this.svg.querySelector(`.sparkline-${id}`);
        if (!path || !data || data.length === 0) return;

        const width = 100;
        const height = 40;
        const offsetX = 10;
        const offsetY = 10;

        // Use provided maxVal or calculate from data
        const yMax = maxVal || Math.max(...data) || 1;
        const step = width / (data.length - 1 || 1);

        let d = '';
        data.forEach((val, i) => {
            const x = offsetX + i * step;
            const y = offsetY + height - (val / yMax) * height;
            d += (i === 0 ? 'M' : 'L') + `${x.toFixed(1)},${y.toFixed(1)}`;
        });

        path.setAttribute('d', d);
    }

    updateValue(id, value) {
        // Find value text by class
        const el = this.svg.querySelector(`.value-${id}`);
        if (el) {
            el.textContent = `${this.formatNumber(value)} m³`;
        }
    }

    updateStoreVisualization(results) {
        if (!this.params || !results) return;

        // Get elevation parameters
        const coverLevel = this.params.coverLevel || 46.74;
        const initialGWL = this.params.initialGWLevel || 45;
        const soilDepth = this.params.soilDepth || 0.01;
        const bfThreshold = this.params.baseflowThreshold || 0;
        const infThreshold = this.params.infiltrationThreshold || 0.02;
        const percThresholdPct = this.params.percolationThreshold || 10;

        // Calculate derived elevations
        const soilBaseLevel = coverLevel - soilDepth;

        // Calculate Threshold Levels (mAOD)
        const bfLevel = initialGWL + bfThreshold;
        const infLevel = initialGWL + infThreshold;
        const percLevel = soilBaseLevel + ((percThresholdPct / 100) * soilDepth);

        // Get current/peak levels from results
        const soilLevels = results.soilLevel || [];
        const groundLevels = results.groundLevel || [];
        const maxSoilLevel = soilLevels.length > 0 ? Math.max(...soilLevels) : soilBaseLevel;
        const maxGroundLevel = groundLevels.length > 0 ? Math.max(...groundLevels) : initialGWL;

        // Helper: Convert elevation to Chart Y (relative to chart top)
        const getChartY = (elev, minElev, maxElev, height) => {
            if (maxElev <= minElev) return height;
            const range = maxElev - minElev;
            const fraction = (elev - minElev) / range;
            return height - (fraction * height);
        };

        // === UPDATE SOIL STORE ===
        const soilWidth = this.soilStoreWidth || 150;
        const soilChartHeight = this.soilChartHeight || 60;
        const soilChartY = this.soilChartY || 20;

        // Update boundary labels with elevations (SCOPED)
        const soilCoverEl = this.svg.querySelector('.label-soil-cover');
        if (soilCoverEl) soilCoverEl.textContent = `Cover (${coverLevel.toFixed(2)})`;

        const soilBaseEl = this.svg.querySelector('.label-soil-base');
        if (soilBaseEl) soilBaseEl.textContent = `Soil Base (${soilBaseLevel.toFixed(2)})`;

        // Position Percolation Threshold Line (SCOPED)
        const percY = getChartY(percLevel, soilBaseLevel, coverLevel, soilChartHeight);
        const percLine = this.svg.querySelector('.sparkline-soil-perc-line');
        if (percLine) {
            const y = Math.max(0, Math.min(soilChartHeight, percY));
            const finalY = (soilChartY + y).toFixed(1);
            percLine.setAttribute('y1', finalY);
            percLine.setAttribute('y2', finalY);
        }

        // Update soil sparkline chart
        this.updateStoreSparkline('.sparkline-soil-level', soilLevels, {
            x: 5, y: soilChartY, width: soilWidth - 10, height: soilChartHeight,
            minVal: soilBaseLevel, maxVal: coverLevel
        });

        // === UPDATE GROUND STORE ===
        const groundWidth = this.groundStoreWidth || 150;
        const groundChartHeight = this.groundChartHeight || 80;
        const groundChartY = this.groundChartY || 20;

        // Update boundary labels with elevations (SCOPED)
        const groundBaseEl = this.svg.querySelector('.label-ground-soil-base');
        if (groundBaseEl) groundBaseEl.textContent = `Soil Base (${soilBaseLevel.toFixed(2)})`;

        const groundInitEl = this.svg.querySelector('.label-ground-init-gwl');
        if (groundInitEl) groundInitEl.textContent = `Init GWL (${initialGWL.toFixed(2)})`;

        // Position Infiltration Threshold Line (SCOPED)
        const infY = getChartY(infLevel, initialGWL, soilBaseLevel, groundChartHeight);
        const infLine = this.svg.querySelector('.sparkline-ground-inf-line');
        if (infLine) {
            const y = Math.max(0, Math.min(groundChartHeight, infY));
            const finalY = (groundChartY + y).toFixed(1);
            infLine.setAttribute('y1', finalY);
            infLine.setAttribute('y2', finalY);
        }

        // Position Baseflow Threshold Line (SCOPED)
        const bfY = getChartY(bfLevel, initialGWL, soilBaseLevel, groundChartHeight);
        const bfLine = this.svg.querySelector('.sparkline-ground-bf-line');
        if (bfLine) {
            const y = Math.max(0, Math.min(groundChartHeight, bfY));
            const finalY = (groundChartY + y).toFixed(1);
            bfLine.setAttribute('y1', finalY);
            bfLine.setAttribute('y2', finalY);
        }

        // Update ground sparkline chart
        this.updateStoreSparkline('.sparkline-ground-level', groundLevels, {
            x: 5, y: groundChartY, width: groundWidth - 10, height: groundChartHeight,
            minVal: initialGWL, maxVal: soilBaseLevel
        });
    }

    updateStoreSparkline(selector, data, bounds) {
        const path = this.svg.querySelector(selector);
        if (!path || !data || data.length < 2) return;

        const { x, y, width, height, minVal, maxVal } = bounds;
        const range = maxVal - minVal || 1;
        const padding = 2;

        // Downsample if too many points
        const maxPoints = 80;
        const step = Math.max(1, Math.floor(data.length / maxPoints));
        const sampledData = data.filter((_, i) => i % step === 0 || i === data.length - 1);

        // Build path
        let d = '';
        sampledData.forEach((val, i) => {
            const px = x + padding + (i / (sampledData.length - 1)) * (width - padding * 2);
            const py = y + height - padding - ((val - minVal) / range) * (height - padding * 2);
            d += (i === 0 ? 'M' : 'L') + `${px.toFixed(1)},${py.toFixed(1)}`;
        });

        path.setAttribute('d', d);
    }

    setLineY(id, y) {
        // Deprecated but kept for safety, updated to use querySelector
        const el = this.svg.querySelector(id.startsWith('#') || id.startsWith('.') ? id : '.' + id);
        if (el) {
            el.setAttribute('y1', y);
            el.setAttribute('y2', y);
        }
    }

    setLabelY(id, y, text) {
        const el = this.svg.querySelector(id.startsWith('#') || id.startsWith('.') ? id : '.' + id);
        if (el) {
            el.setAttribute('y', y);
            if (text) el.textContent = text;
        }
    }

    updateLabel(id, text) {
        const el = this.svg.querySelector(id.startsWith('#') || id.startsWith('.') ? id : '.' + id);
        if (el) el.textContent = text;
    }

    formatNumber(num) {
        if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'k';
        }
        return Math.round(num).toString();
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GISchematic };
}
