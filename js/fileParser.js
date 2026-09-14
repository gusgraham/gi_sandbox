/**
 * File Parser for InfoWorks ICM formats
 * Supports: .csv, .red (rainfall), .hyq (hydrograph)
 */

class FileParser {
    constructor() {
        this.supportedFormats = ['csv', 'red', 'hyq'];
    }

    /**
     * Parse uploaded file based on extension
     * @param {File} file - The uploaded file
     * @returns {Promise<{timestamps: Date[], columns: {name: string, data: number[]}[], timestepMinutes: number}>}
     */
    async parseFile(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        const content = await this.readFileContent(file);

        switch (ext) {
            case 'csv':
                return this.parseCSV(content);
            case 'red':
                return this.parseRED(content);
            case 'hyq':
                return this.parseHYQ(content);
            default:
                throw new Error(`Unsupported file format: .${ext}`);
        }
    }

    readFileContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    /**
     * Parse CSV format
     * Expected: DateTime column + one or more data columns
     */
    parseCSV(content) {
        const lines = content.trim().split(/\r?\n/);
        if (lines.length < 2) throw new Error('CSV file must have header and data rows');

        // Parse header
        const header = this.parseCSVLine(lines[0]);
        const columns = header.slice(1).map(name => ({ name: name.trim(), data: [] }));
        const timestamps = [];

        // Parse data rows
        for (let i = 1; i < lines.length; i++) {
            const values = this.parseCSVLine(lines[i]);
            if (values.length < 2) continue;

            // Parse timestamp
            const ts = this.parseTimestamp(values[0]);
            if (!ts) continue;
            timestamps.push(ts);

            // Parse data columns
            for (let j = 0; j < columns.length; j++) {
                const val = parseFloat(values[j + 1]);
                columns[j].data.push(isNaN(val) ? 0 : val);
            }
        }

        const timestepMinutes = this.detectTimestep(timestamps);
        return { timestamps, columns, timestepMinutes };
    }

    parseCSVLine(line) {
        // Handle quoted values with commas
        const result = [];
        let current = '';
        let inQuotes = false;

        for (const char of line) {
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim());
        return result;
    }

    /**
     * Parse InfoWorks .red (rainfall) format
     * Format varies but typically has header lines starting with special chars
     */
    parseRED(content) {
        const lines = content.trim().split(/\r?\n/);
        const timestamps = [];
        const rainfallData = [];

        let inData = false;
        let headerRow = null;

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            // Skip comment lines
            if (trimmed.startsWith('!') || trimmed.startsWith('#')) continue;

            // Look for data section
            if (!inData) {
                // Check if this looks like a data row (starts with date/number)
                if (/^\d{4}[-\/]|^\d{2}[-\/]/.test(trimmed)) {
                    inData = true;
                } else if (trimmed.toLowerCase().includes('date') || trimmed.toLowerCase().includes('time')) {
                    headerRow = trimmed;
                    continue;
                } else {
                    continue;
                }
            }

            if (inData) {
                // Parse data row - expect: datetime, value(s)
                const parts = trimmed.split(/[\t,\s]+/).filter(p => p);
                if (parts.length >= 2) {
                    // Try to parse datetime (might be date + time in separate columns)
                    let dateStr = parts[0];
                    let valueIdx = 1;

                    // Check if second column is time
                    if (parts.length >= 3 && /^\d{2}:\d{2}/.test(parts[1])) {
                        dateStr = parts[0] + ' ' + parts[1];
                        valueIdx = 2;
                    }

                    const ts = this.parseTimestamp(dateStr);
                    if (ts) {
                        timestamps.push(ts);
                        const val = parseFloat(parts[valueIdx]);
                        rainfallData.push(isNaN(val) ? 0 : val);
                    }
                }
            }
        }

        const timestepMinutes = this.detectTimestep(timestamps);
        return {
            timestamps,
            columns: [{ name: 'Rainfall', data: rainfallData }],
            timestepMinutes
        };
    }

    /**
     * Parse InfoWorks .hyq (hydrograph) format
     * Similar structure to .red but for flow data
     */
    parseHYQ(content) {
        const lines = content.trim().split(/\r?\n/);
        const timestamps = [];
        const flowData = [];

        let inData = false;

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            // Skip comment/header lines
            if (trimmed.startsWith('!') || trimmed.startsWith('#')) continue;
            if (trimmed.startsWith('[') || trimmed.startsWith('*')) continue;

            // Look for data rows
            if (!inData) {
                if (/^\d{4}[-\/]|^\d{2}[-\/]/.test(trimmed)) {
                    inData = true;
                } else {
                    continue;
                }
            }

            if (inData) {
                const parts = trimmed.split(/[\t,\s]+/).filter(p => p);
                if (parts.length >= 2) {
                    let dateStr = parts[0];
                    let valueIdx = 1;

                    if (parts.length >= 3 && /^\d{2}:\d{2}/.test(parts[1])) {
                        dateStr = parts[0] + ' ' + parts[1];
                        valueIdx = 2;
                    }

                    const ts = this.parseTimestamp(dateStr);
                    if (ts) {
                        timestamps.push(ts);
                        const val = parseFloat(parts[valueIdx]);
                        flowData.push(isNaN(val) ? 0 : val);
                    }
                }
            }
        }

        const timestepMinutes = this.detectTimestep(timestamps);
        return {
            timestamps,
            columns: [{ name: 'Flow', data: flowData }],
            timestepMinutes
        };
    }

    /**
     * Parse various timestamp formats
     */
    parseTimestamp(str) {
        if (!str) return null;
        str = str.trim().replace(/"/g, '');

        // Try common formats
        const formats = [
            // ISO format
            /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/,
            // UK format: DD/MM/YYYY HH:MM
            /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/,
            // US format: MM/DD/YYYY HH:MM
            /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/
        ];

        // Try ISO first
        let match = str.match(formats[0]);
        if (match) {
            return new Date(
                parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]),
                parseInt(match[4]), parseInt(match[5]), parseInt(match[6] || 0)
            );
        }

        // Try DD/MM/YYYY (UK - most common for InfoWorks)
        match = str.match(formats[1]);
        if (match) {
            return new Date(
                parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]),
                parseInt(match[4]), parseInt(match[5]), parseInt(match[6] || 0)
            );
        }

        // Fallback to Date.parse
        const parsed = Date.parse(str);
        return isNaN(parsed) ? null : new Date(parsed);
    }

    /**
     * Detect timestep from array of timestamps
     */
    detectTimestep(timestamps) {
        if (timestamps.length < 2) return 1; // Default 1 minute

        // Calculate differences between consecutive timestamps
        const diffs = [];
        for (let i = 1; i < Math.min(timestamps.length, 10); i++) {
            const diffMs = timestamps[i] - timestamps[i - 1];
            const diffMinutes = diffMs / (1000 * 60);
            if (diffMinutes > 0) diffs.push(diffMinutes);
        }

        if (diffs.length === 0) return 1;

        // Return median timestep
        diffs.sort((a, b) => a - b);
        return diffs[Math.floor(diffs.length / 2)];
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FileParser };
}
