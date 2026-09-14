/**
 * Scene View - Cross-section visualization with embedded charts
 */

class GISceneView {
    constructor() {
        this.container = document.getElementById('sceneView');
        this.results = null;
        this.params = null;

        // Chart dimensions (matching placeholder positions in SVG)
        // Main charts in the placeholder boxes
        this.charts = {
            qrain: { x: 355, y: 45, width: 150, height: 55, color: '#4da6ff' },
            soil: { x: 155, y: 205, width: 190, height: 60, color: '#00d4aa' },
            ground: { x: 155, y: 365, width: 190, height: 75, color: '#ff7eb3' },
            qnetwork: { x: 825, y: 410, width: 170, height: 60, color: '#7dffaf' }
        };

        // Small inline charts alongside flow arrows
        this.flowCharts = {
            qrunoff: { x: 530, y: 120, width: 100, height: 30, color: '#7c5cff', label: 'Qrunoff' },
            qsoil: { x: 200, y: 135, width: 90, height: 28, color: '#00d4aa', label: 'Qsoil' },
            qground: { x: 200, y: 290, width: 90, height: 28, color: '#ff7eb3', label: 'Qground' },
            qsoilinf: { x: 450, y: 220, width: 100, height: 30, color: '#00d4aa', label: 'QsoilInf' },
            qgroundinf: { x: 450, y: 350, width: 100, height: 30, color: '#ff7eb3', label: 'QgroundInf' },
            qbaseflow: { x: 450, y: 500, width: 100, height: 30, color: '#ffaa00', label: 'Qbaseflow' }
        };

        this.svgNS = 'http://www.w3.org/2000/svg';
        this.chartGroup = null;
    }

    init() {
        if (!this.container) return;

        // Get the SVG element
        this.svg = this.container.querySelector('#scene-svg');
        if (!this.svg) return;

        // Create a group for dynamic chart elements
        this.chartGroup = document.createElementNS(this.svgNS, 'g');
        this.chartGroup.setAttribute('id', 'scene-charts');
        this.svg.appendChild(this.chartGroup);

        // Create chart paths
        this.createChartPaths();
    }

    createChartPaths() {
        // Main charts
        this.qrainPath = this.createPath('scene-qrain-line', this.charts.qrain.color);
        this.qrainVolume = this.createVolumeLabel('scene-qrain-vol', this.charts.qrain);

        this.soilPath = this.createPath('scene-soil-line', this.charts.soil.color);
        this.soilThresholdLine = this.createThresholdLine('scene-soil-threshold', '#ffffff', 'perc thresh');

        this.groundPath = this.createPath('scene-ground-line', this.charts.ground.color);
        this.groundInfLine = this.createThresholdLine('scene-ground-inf', '#ff7eb3', 'inf thresh');
        this.groundBfLine = this.createThresholdLine('scene-ground-bf', '#ffaa00', 'bf thresh');

        this.qnetworkPath = this.createPath('scene-qnetwork-line', this.charts.qnetwork.color);
        this.qnetworkVolume = this.createVolumeLabel('scene-qnetwork-vol', this.charts.qnetwork);

        // Flow charts with backgrounds and labels
        this.flowChartPaths = {};
        Object.entries(this.flowCharts).forEach(([key, cfg]) => {
            this.flowChartPaths[key] = this.createFlowChart(key, cfg);
        });
    }

    createVolumeLabel(id, cfg) {
        const text = document.createElementNS(this.svgNS, 'text');
        text.setAttribute('id', id);
        text.setAttribute('x', cfg.x + cfg.width - 5);
        text.setAttribute('y', cfg.y + cfg.height - 5);
        text.setAttribute('fill', cfg.color);
        text.setAttribute('font-size', '10');
        text.setAttribute('font-weight', '600');
        text.setAttribute('text-anchor', 'end');
        text.setAttribute('opacity', '0.9');
        this.chartGroup.appendChild(text);
        return text;
    }

    createFlowChart(id, cfg) {
        const g = document.createElementNS(this.svgNS, 'g');
        g.setAttribute('id', `flow-chart-${id}`);

        // Background
        const bg = document.createElementNS(this.svgNS, 'rect');
        bg.setAttribute('x', cfg.x);
        bg.setAttribute('y', cfg.y);
        bg.setAttribute('width', cfg.width);
        bg.setAttribute('height', cfg.height);
        bg.setAttribute('fill', 'rgba(10,15,25,0.75)');
        bg.setAttribute('stroke', cfg.color);
        bg.setAttribute('stroke-width', '1');
        bg.setAttribute('rx', '3');
        bg.setAttribute('opacity', '0.9');
        g.appendChild(bg);

        // Label
        const label = document.createElementNS(this.svgNS, 'text');
        label.setAttribute('x', cfg.x + 3);
        label.setAttribute('y', cfg.y + 10);
        label.setAttribute('fill', cfg.color);
        label.setAttribute('font-size', '8');
        label.setAttribute('font-weight', '500');
        label.textContent = cfg.label;
        g.appendChild(label);

        // Volume label (right side)
        const volumeText = document.createElementNS(this.svgNS, 'text');
        volumeText.setAttribute('x', cfg.x + cfg.width - 3);
        volumeText.setAttribute('y', cfg.y + 10);
        volumeText.setAttribute('fill', cfg.color);
        volumeText.setAttribute('font-size', '8');
        volumeText.setAttribute('font-weight', '600');
        volumeText.setAttribute('text-anchor', 'end');
        volumeText.setAttribute('opacity', '0.9');
        g.appendChild(volumeText);

        // Path for the chart line
        const path = document.createElementNS(this.svgNS, 'path');
        path.setAttribute('id', `scene-${id}-line`);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', cfg.color);
        path.setAttribute('stroke-width', '1.5');
        path.setAttribute('d', '');
        g.appendChild(path);

        this.chartGroup.appendChild(g);
        return { group: g, path: path, bg: bg, volumeText: volumeText };
    }

    createPath(id, color) {
        const path = document.createElementNS(this.svgNS, 'path');
        path.setAttribute('id', id);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', color);
        path.setAttribute('stroke-width', '2');
        path.setAttribute('d', '');
        this.chartGroup.appendChild(path);
        return path;
    }

    createThresholdLine(id, color, label) {
        const g = document.createElementNS(this.svgNS, 'g');
        g.setAttribute('id', id);

        const line = document.createElementNS(this.svgNS, 'line');
        line.setAttribute('stroke', color);
        line.setAttribute('stroke-width', '1.5');
        line.setAttribute('stroke-dasharray', '4,3');
        line.setAttribute('opacity', '0.7');
        g.appendChild(line);

        const text = document.createElementNS(this.svgNS, 'text');
        text.setAttribute('fill', color);
        text.setAttribute('font-size', '9');
        text.setAttribute('opacity', '0.8');
        text.textContent = label;
        g.appendChild(text);

        this.chartGroup.appendChild(g);
        return { group: g, line: line, text: text };
    }

    update(results, params) {
        this.results = results;
        this.params = params;

        if (!this.chartGroup) {
            this.init();
        }

        if (!this.results || !this.chartGroup) return;

        // Update main charts
        this.updateQrainChart();
        this.updateSoilChart();
        this.updateGroundChart();
        this.updateQnetworkChart();

        // Update flow charts
        this.updateFlowCharts();
    }

    updateFlowCharts() {
        // Get max values for normalization (use same scale for related flows)
        const maxQrain = Math.max(...this.results.Qrain) || 1;
        const maxQnetwork = Math.max(...this.results.Qnetwork) || 1;

        // Qrunoff
        this.updateFlowChart('qrunoff', this.results.Qrunoff, 0, maxQrain);

        // Qsoil
        this.updateFlowChart('qsoil', this.results.Qsoil, 0, maxQrain);

        // Qground (percolation to ground store)
        const maxQground = Math.max(...this.results.Qground) || 0.001;
        this.updateFlowChart('qground', this.results.Qground, 0, maxQground);

        // QsoilInf
        const maxQsoilInf = Math.max(...this.results.QsoilInf) || 0.001;
        this.updateFlowChart('qsoilinf', this.results.QsoilInf, 0, Math.max(maxQsoilInf, maxQnetwork * 0.5));

        // QgroundInf
        const maxQgroundInf = Math.max(...this.results.QgroundInf) || 0.001;
        this.updateFlowChart('qgroundinf', this.results.QgroundInf, 0, Math.max(maxQgroundInf, maxQnetwork * 0.5));

        // Qbaseflow
        const maxQbaseflow = Math.max(...this.results.Qbaseflow) || 0.001;
        this.updateFlowChart('qbaseflow', this.results.Qbaseflow, 0, maxQbaseflow);
    }

    updateFlowChart(key, data, minVal, maxVal) {
        if (!this.flowChartPaths[key] || !data) return;

        const cfg = this.flowCharts[key];
        // Adjust for label space at top
        const chartCfg = {
            x: cfg.x + 2,
            y: cfg.y + 12,
            width: cfg.width - 4,
            height: cfg.height - 14
        };

        const d = this.buildLinePath(data, chartCfg, minVal, maxVal);
        this.flowChartPaths[key].path.setAttribute('d', d);

        // Update volume text
        const volume = this.calcVolume(data);
        this.flowChartPaths[key].volumeText.textContent = this.formatVolume(volume);
    }

    calcVolume(data) {
        // Sum of flow values * time interval (from params, in minutes -> seconds)
        if (!data || data.length < 2) return 0;
        const timeIntervalSeconds = (this.params.timeInterval || 2) * 60;
        return data.reduce((sum, val) => sum + val, 0) * timeIntervalSeconds;
    }

    formatVolume(volume) {
        if (volume >= 1000) {
            return (volume / 1000).toFixed(1) + 'k m³';
        } else if (volume >= 1) {
            return volume.toFixed(0) + ' m³';
        } else {
            return volume.toFixed(2) + ' m³';
        }
    }

    updateQrainChart() {
        const cfg = this.charts.qrain;
        const data = this.results.Qrain;
        const maxVal = Math.max(...data) || 1;

        const d = this.buildLinePath(data, cfg, 0, maxVal);
        this.qrainPath.setAttribute('d', d);

        // Update volume label
        const volume = this.calcVolume(data);
        this.qrainVolume.textContent = this.formatVolume(volume);
    }

    updateSoilChart() {
        const cfg = this.charts.soil;
        const data = this.results.soilLevel;

        if (!data || data.length < 2) return;

        const coverLevel = this.params.coverLevel || 46.74;
        const soilBase = coverLevel - (this.params.soilDepth || 0.01);

        const minVal = soilBase;
        const maxVal = coverLevel;

        const d = this.buildLinePath(data, cfg, minVal, maxVal);
        this.soilPath.setAttribute('d', d);

        // Update percolation threshold line
        const percThreshPct = this.params.percolationThreshold || 10;
        const percLevel = soilBase + ((percThreshPct / 100) * (this.params.soilDepth || 0.01));
        const y = this.valueToY(percLevel, cfg, minVal, maxVal);

        this.soilThresholdLine.line.setAttribute('x1', cfg.x);
        this.soilThresholdLine.line.setAttribute('x2', cfg.x + cfg.width);
        this.soilThresholdLine.line.setAttribute('y1', y);
        this.soilThresholdLine.line.setAttribute('y2', y);
        this.soilThresholdLine.text.setAttribute('x', cfg.x + cfg.width - 50);
        this.soilThresholdLine.text.setAttribute('y', y - 3);
    }

    updateGroundChart() {
        const cfg = this.charts.ground;
        const data = this.results.groundLevel;

        if (!data || data.length < 2) return;

        const coverLevel = this.params.coverLevel || 46.74;
        const soilBase = coverLevel - (this.params.soilDepth || 0.01);
        const initGWL = this.params.initialGWLevel || 45;

        const minVal = initGWL;
        const maxVal = soilBase;

        const d = this.buildLinePath(data, cfg, minVal, maxVal);
        this.groundPath.setAttribute('d', d);

        // Update infiltration threshold line
        const infThresh = this.params.infiltrationThreshold || 0.02;
        const infLevel = initGWL + infThresh;
        const yInf = this.valueToY(infLevel, cfg, minVal, maxVal);

        this.groundInfLine.line.setAttribute('x1', cfg.x);
        this.groundInfLine.line.setAttribute('x2', cfg.x + cfg.width);
        this.groundInfLine.line.setAttribute('y1', yInf);
        this.groundInfLine.line.setAttribute('y2', yInf);
        this.groundInfLine.text.setAttribute('x', cfg.x + cfg.width - 45);
        this.groundInfLine.text.setAttribute('y', yInf - 3);

        // Update baseflow threshold line
        const bfThresh = this.params.baseflowThreshold || 0;
        const bfLevel = initGWL + bfThresh;
        const yBf = this.valueToY(bfLevel, cfg, minVal, maxVal);

        this.groundBfLine.line.setAttribute('x1', cfg.x);
        this.groundBfLine.line.setAttribute('x2', cfg.x + cfg.width);
        this.groundBfLine.line.setAttribute('y1', yBf);
        this.groundBfLine.line.setAttribute('y2', yBf);
        this.groundBfLine.text.setAttribute('x', cfg.x + 5);
        this.groundBfLine.text.setAttribute('y', yBf - 3);
    }

    updateQnetworkChart() {
        const cfg = this.charts.qnetwork;
        const data = this.results.Qnetwork;
        const maxVal = Math.max(...data) || 1;

        const d = this.buildLinePath(data, cfg, 0, maxVal);
        this.qnetworkPath.setAttribute('d', d);

        // Update volume label
        const volume = this.calcVolume(data);
        this.qnetworkVolume.textContent = this.formatVolume(volume);
    }

    buildLinePath(data, cfg, minVal, maxVal) {
        if (!data || data.length < 2) return '';

        // Downsample for performance
        const maxPoints = 80;
        const step = Math.max(1, Math.floor(data.length / maxPoints));
        const sampled = data.filter((_, i) => i % step === 0 || i === data.length - 1);

        const range = maxVal - minVal || 1;
        let d = '';

        sampled.forEach((val, i) => {
            const x = cfg.x + (i / (sampled.length - 1)) * cfg.width;
            const y = cfg.y + cfg.height - ((val - minVal) / range) * cfg.height;
            d += (i === 0 ? 'M' : 'L') + `${x.toFixed(1)},${y.toFixed(1)}`;
        });

        return d;
    }

    valueToY(val, cfg, minVal, maxVal) {
        const range = maxVal - minVal || 1;
        return cfg.y + cfg.height - ((val - minVal) / range) * cfg.height;
    }

    show() {
        if (this.container) {
            this.container.style.display = 'flex';
        }
    }

    hide() {
        if (this.container) {
            this.container.style.display = 'none';
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GISceneView };
}
