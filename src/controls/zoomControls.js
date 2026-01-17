import { ZOOM_CONFIG } from '../config.js';

/**
 * Manages zoom controls and mouse interactions
 */
export class ZoomControls {
    constructor(app, visualization) {
        this.app = app;
        this.visualization = visualization;
        this.zoomInBtn = document.getElementById('zoom-in');
        this.zoomOutBtn = document.getElementById('zoom-out');
        this.resetZoomBtn = document.getElementById('reset-zoom');
        this.zoomLevelDisplay = document.getElementById('zoom-level');
        
        this.mouseX = 0;
        this.mouseY = 0;
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;

        this.setupEventListeners();
    }

    setupEventListeners() {
        // Zoom buttons
        this.zoomInBtn.addEventListener('click', () => this.handleZoomIn());
        this.zoomOutBtn.addEventListener('click', () => this.handleZoomOut());
        this.resetZoomBtn.addEventListener('click', () => this.handleResetZoom());

        // Mouse wheel zoom
        const canvas = this.app.canvas || this.app.view;
        canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        canvas.addEventListener('wheel', (e) => this.handleWheel(e));
        canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        canvas.addEventListener('mouseup', () => this.handleMouseUp());
        canvas.addEventListener('mouseleave', () => this.handleMouseUp());

        // Listen for zoom changes from highlight clicks
        window.addEventListener('visualization-zoom-changed', (e) => {
            this.updateZoomDisplay(e.detail.zoom);
        });
    }

    handleZoomIn() {
        if (!this.visualization) return;
        
        const currentZoom = this.visualization.getZoom();
        const newZoom = Math.min(currentZoom * ZOOM_CONFIG.step, ZOOM_CONFIG.max);
        this.visualization.setZoom(newZoom, this.mouseX || null, this.mouseY || null);
        this.updateZoomDisplay(newZoom);
    }

    handleZoomOut() {
        if (!this.visualization) return;
        
        const currentZoom = this.visualization.getZoom();
        const newZoom = Math.max(currentZoom / ZOOM_CONFIG.step, ZOOM_CONFIG.min);
        this.visualization.setZoom(newZoom, this.mouseX || null, this.mouseY || null);
        this.updateZoomDisplay(newZoom);
    }

    handleResetZoom() {
        if (!this.visualization) return;
        
        const initialZoom = this.visualization.getInitialZoom();
        this.visualization.setZoom(initialZoom);
        this.visualization.resetView();
        this.updateZoomDisplay(initialZoom);
    }

    handleMouseMove(e) {
        const canvas = this.app.canvas || this.app.view;
        const rect = canvas.getBoundingClientRect();
        this.mouseX = e.clientX - rect.left;
        this.mouseY = e.clientY - rect.top;

        if (this.isDragging && this.visualization) {
            const dx = e.clientX - this.lastMouseX;
            const dy = e.clientY - this.lastMouseY;
            this.visualization.pan(dx, dy);
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
        }
    }

    handleWheel(e) {
        e.preventDefault();
        
        if (!this.visualization) return;

        const canvas = this.app.canvas || this.app.view;
        const rect = canvas.getBoundingClientRect();
        const pointerX = e.clientX - rect.left;
        const pointerY = e.clientY - rect.top;

        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const currentZoom = this.visualization.getZoom();
        const newZoom = Math.max(
            ZOOM_CONFIG.min,
            Math.min(ZOOM_CONFIG.max, currentZoom * delta)
        );
        
        this.visualization.setZoom(newZoom, pointerX, pointerY);
        this.updateZoomDisplay(newZoom);
    }

    handleMouseDown(e) {
        this.isDragging = true;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;

        const canvas = this.app.canvas || this.app.view;
        const rect = canvas.getBoundingClientRect();
        this.mouseX = e.clientX - rect.left;
        this.mouseY = e.clientY - rect.top;
    }

    handleMouseUp() {
        this.isDragging = false;
    }

    updateZoomDisplay(zoom) {
        this.zoomLevelDisplay.textContent = `${Math.round(zoom * 100)}%`;
    }

    setVisualization(visualization) {
        this.visualization = visualization;
        if (visualization) {
            this.updateZoomDisplay(visualization.getZoom());
        }
    }
}
