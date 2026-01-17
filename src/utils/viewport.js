import { VISUALIZATION_CONFIG } from '../config.js';

/**
 * Manages viewport calculations and visible range detection
 */
export class ViewportManager {
    constructor(config, app, maxColumnLength) {
        this.config = config;
        this.app = app;
        this.maxColumnLength = maxColumnLength;
        this.visibleRangeResult = { start: 0, end: 0 };
    }

    /**
     * Calculates which lines are currently visible in the viewport
     * @param {number} zoom - Current zoom level
     * @param {number} offsetY - Current Y offset
     * @returns {{start: number, end: number}} - Visible line range
     */
    getVisibleLineRange(zoom, offsetY) {
        const invZoom = 1 / zoom;
        const worldTop = -offsetY * invZoom;
        const worldBottom = (this.app.screen.height - offsetY) * invZoom;
        const scrollPadding = VISUALIZATION_CONFIG.scrollPadding;

        this.visibleRangeResult.start = Math.max(
            0,
            ((worldTop - this.config.padding - scrollPadding) / this.config.lineHeight) | 0
        );
        this.visibleRangeResult.end = Math.min(
            this.maxColumnLength,
            Math.ceil((worldBottom - this.config.padding + scrollPadding) / this.config.lineHeight)
        );

        return this.visibleRangeResult;
    }

    /**
     * Calculates initial zoom to fit content
     * @param {number} totalWidth - Total content width
     * @param {number} totalHeight - Total content height
     * @returns {number} - Initial zoom level
     */
    calculateInitialZoom(totalWidth, totalHeight) {
        const scaleX = this.app.screen.width / totalWidth;
        const scaleY = this.app.screen.height / totalHeight;
        const calculatedZoom = Math.min(scaleX, scaleY) * 0.95; // 95% to leave some margin

        const minVisibleZoom = VISUALIZATION_CONFIG.minVisibleZoom;
        return calculatedZoom < minVisibleZoom ? minVisibleZoom : calculatedZoom;
    }

    /**
     * Calculates initial offset to center or position content
     * @param {number} totalWidth - Total content width
     * @param {number} totalHeight - Total content height
     * @param {number} zoom - Current zoom level
     * @param {boolean} useMinimumZoom - Whether minimum zoom is being used
     * @returns {{offsetX: number, offsetY: number}} - Initial offsets
     */
    calculateInitialOffset(totalWidth, totalHeight, zoom, useMinimumZoom) {
        const offsetX = (this.app.screen.width - totalWidth * zoom) / 2;
        let offsetY;

        if (useMinimumZoom) {
            // If using minimum zoom, start at the top so user can see the beginning
            offsetY = this.config.padding;
        } else {
            // Center vertically if we're actually fitting everything
            offsetY = (this.app.screen.height - totalHeight * zoom) / 2;
        }

        return { offsetX, offsetY };
    }

    /**
     * Gets text resolution based on zoom level
     * @param {number} zoom - Current zoom level
     * @param {number} maxResolution - Maximum text resolution
     * @returns {number} - Text resolution (1, 2, or 3)
     */
    getTextResolutionForZoom(zoom, maxResolution) {
        if (zoom >= 2.5) return Math.min(3, maxResolution);
        if (zoom >= 1.35) return Math.min(2, maxResolution);
        return 1;
    }
}
