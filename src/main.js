import { Application, Graphics, Text, Container } from 'pixi.js';
import { loadBookOfMormon } from './loadText.js';
import { createVisualization } from './visualization.js';

let app;
let visualization;
let searchTerm = '';
let zoomLevel = 0.01; // Will be set to initial zoom after visualization is created

async function init() {
    // Create PixiJS application
    app = new Application();
    await app.init({
        width: window.innerWidth,
        height: window.innerHeight,
        backgroundColor: 0x1a1a1a,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
    });

    document.getElementById('canvas-container').appendChild(app.canvas);

    // Load Book of Mormon text
    const text = await loadBookOfMormon();
    
    // Create visualization
    visualization = createVisualization(text, app);
    
    // Set initial zoom level
    zoomLevel = visualization.getInitialZoom();
    document.getElementById('zoom-level').textContent = `${Math.round(zoomLevel * 100)}%`;
    
    // Setup controls
    setupControls();
    
    // Handle window resize
    window.addEventListener('resize', () => {
        app.renderer.resize(window.innerWidth, window.innerHeight);
        if (visualization) {
            visualization.handleResize();
        }
    });
}

function setupControls() {
    const searchInput = document.getElementById('search-input');
    const zoomInBtn = document.getElementById('zoom-in');
    const zoomOutBtn = document.getElementById('zoom-out');
    const resetZoomBtn = document.getElementById('reset-zoom');
    const zoomLevelDisplay = document.getElementById('zoom-level');
    const searchResults = document.getElementById('search-results');

    // Search functionality
    searchInput.addEventListener('input', (e) => {
        searchTerm = e.target.value.trim();
        if (visualization) {
            visualization.search(searchTerm);
            const count = visualization.getSearchResultCount();
            if (searchTerm) {
                searchResults.textContent = count > 0 
                    ? `Found ${count} match${count !== 1 ? 'es' : ''}`
                    : 'No matches found';
            } else {
                searchResults.textContent = '';
            }
        }
    });

    // Zoom controls
    zoomInBtn.addEventListener('click', () => {
        zoomLevel = Math.min(zoomLevel * 1.5, 10);
        if (visualization) {
            visualization.setZoom(zoomLevel);
            zoomLevelDisplay.textContent = `${Math.round(zoomLevel * 100)}%`;
        }
    });

    zoomOutBtn.addEventListener('click', () => {
        zoomLevel = Math.max(zoomLevel / 1.5, 0.01);
        if (visualization) {
            visualization.setZoom(zoomLevel);
            zoomLevelDisplay.textContent = `${Math.round(zoomLevel * 100)}%`;
        }
    });

    resetZoomBtn.addEventListener('click', () => {
        if (visualization) {
            const initialZoom = visualization.getInitialZoom();
            zoomLevel = initialZoom;
            visualization.setZoom(zoomLevel);
            visualization.resetView();
            zoomLevelDisplay.textContent = `${Math.round(zoomLevel * 100)}%`;
        }
    });

    // Mouse wheel zoom
    app.canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        zoomLevel = Math.max(0.01, Math.min(10, zoomLevel * delta));
        if (visualization) {
            visualization.setZoom(zoomLevel);
            zoomLevelDisplay.textContent = `${Math.round(zoomLevel * 100)}%`;
        }
    });

    // Pan with mouse drag
    let isDragging = false;
    let lastMouseX = 0;
    let lastMouseY = 0;

    app.canvas.addEventListener('mousedown', (e) => {
        isDragging = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    });

    app.canvas.addEventListener('mousemove', (e) => {
        if (isDragging && visualization) {
            const dx = e.clientX - lastMouseX;
            const dy = e.clientY - lastMouseY;
            visualization.pan(dx, dy);
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
        }
    });

    app.canvas.addEventListener('mouseup', () => {
        isDragging = false;
    });

    app.canvas.addEventListener('mouseleave', () => {
        isDragging = false;
    });
}

init().catch(console.error);

