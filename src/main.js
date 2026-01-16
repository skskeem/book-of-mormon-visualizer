import { Application, Graphics, Text, Container } from 'pixi.js';
import { loadBookOfMormon } from './loadText.js';
import { createVisualization } from './visualization.js';

let app;
let visualization;
let searchTerm = '';
let zoomLevel = 0.01; // Will be set to initial zoom after visualization is created

async function init() {
    try {
        // Create PixiJS application - in v7, constructor accepts options directly
        app = new Application({
            width: window.innerWidth,
            height: window.innerHeight,
            backgroundColor: 0x1a1a1a,
            antialias: true,
            resolution: window.devicePixelRatio || 1, // Use device pixel ratio for optimal performance
            autoDensity: true,
        });
        
        // In PixiJS v7, the canvas is accessed via app.canvas or app.view
        const canvas = app.canvas || app.view;
        if (!canvas) {
            console.error('Canvas not found on app object:', app);
            return;
        }
        console.log('Canvas element:', canvas);
        const container = document.getElementById('canvas-container');
        container.appendChild(canvas);
        console.log('Canvas added to DOM');
        
        // Ensure canvas is visible
        canvas.style.display = 'block';
        canvas.style.width = '100%';
        canvas.style.height = '100%';

        // Show loading indicator with progress
        const loadingIndicator = document.createElement('div');
        loadingIndicator.id = 'loading-indicator';
        loadingIndicator.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 30px 50px;
            border-radius: 8px;
            z-index: 10000;
            font-size: 18px;
            text-align: center;
            min-width: 200px;
        `;
        const loadingText = document.createElement('div');
        loadingText.textContent = 'Loading text...';
        loadingIndicator.appendChild(loadingText);
        document.body.appendChild(loadingIndicator);
        
        const updateLoadingText = (text) => {
            loadingText.textContent = text;
        };

        // Load Book of Mormon text
        updateLoadingText('Loading text file...');
        const loadStart = performance.now();
        const text = await loadBookOfMormon();
        const loadTime = performance.now() - loadStart;
        console.log(`Text loaded in ${loadTime.toFixed(2)}ms, length:`, text.length);
        
        if (!text || text.length === 0) {
            console.error('No text loaded!');
            loadingIndicator.remove();
            return;
        }
        
        // Update loading message
        updateLoadingText('Processing text...');
        
        // Create visualization (now async) - pass progress callback
        const processStart = performance.now();
        visualization = await createVisualization(text, app, updateLoadingText);
        const processTime = performance.now() - processStart;
        console.log(`Visualization created in ${processTime.toFixed(2)}ms`);
        
        // Remove loading indicator - content should already be visible
        loadingIndicator.remove();
        
        // Set initial zoom level
        zoomLevel = visualization.getInitialZoom();
        console.log('Initial zoom level:', zoomLevel);
        document.getElementById('zoom-level').textContent = `${Math.round(zoomLevel * 100)}%`;
        
        // Setup controls
        setupControls();
        
        // Listen for zoom changes from highlight clicks
        window.addEventListener('visualization-zoom-changed', (e) => {
            const newZoom = e.detail.zoom;
            zoomLevel = newZoom;
            document.getElementById('zoom-level').textContent = `${Math.round(zoomLevel * 100)}%`;
        });
    } catch (error) {
        console.error('Error initializing application:', error);
    }
    
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
    const nextMatchBtn = document.getElementById('next-match');

    // Search functionality
    searchInput.addEventListener('input', (e) => {
        searchTerm = e.target.value.trim();
        if (visualization) {
            // Only search if at least 2 characters have been entered
            if (searchTerm.length >= 2) {
                visualization.search(searchTerm);
                const count = visualization.getSearchResultCount();
                if (count > 0) {
                    const currentIndex = visualization.getCurrentMatchIndex();
                    if (currentIndex >= 0) {
                        searchResults.textContent = `Match ${currentIndex + 1} of ${count}`;
                    } else {
                        searchResults.textContent = `Found ${count} match${count !== 1 ? 'es' : ''}`;
                    }
                } else {
                    searchResults.textContent = 'No matches found';
                }
                // Update next match button state
                nextMatchBtn.disabled = count === 0;
            } else {
                // Clear search if less than 2 characters
                visualization.search('');
                searchResults.textContent = searchTerm.length > 0 ? 'Enter at least 2 characters to search' : '';
                nextMatchBtn.disabled = true;
            }
        }
    });

    // Next match button
    nextMatchBtn.addEventListener('click', () => {
        if (visualization) {
            const success = visualization.jumpToNextMatch();
            if (success) {
                const currentIndex = visualization.getCurrentMatchIndex();
                const totalCount = visualization.getSearchResultCount();
                searchResults.textContent = `Match ${currentIndex + 1} of ${totalCount}`;
            }
        }
    });

    // Zoom controls - use mouse position if available, otherwise center
    zoomInBtn.addEventListener('click', () => {
        zoomLevel = Math.min(zoomLevel * 1.5, 10);
        if (visualization) {
            // Use last known mouse position if available, otherwise zoom to center
            visualization.setZoom(zoomLevel, mouseX || null, mouseY || null);
            zoomLevelDisplay.textContent = `${Math.round(zoomLevel * 100)}%`;
        }
    });

    zoomOutBtn.addEventListener('click', () => {
        zoomLevel = Math.max(zoomLevel / 1.5, 0.01);
        if (visualization) {
            // Use last known mouse position if available, otherwise zoom to center
            visualization.setZoom(zoomLevel, mouseX || null, mouseY || null);
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

    // Mouse wheel zoom - zoom towards mouse position
    const canvas = app.canvas || app.view;
    let mouseX = 0;
    let mouseY = 0;
    
    // Track mouse position
    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;
    });
    
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        
        // Get mouse position relative to canvas
        const rect = canvas.getBoundingClientRect();
        const pointerX = e.clientX - rect.left;
        const pointerY = e.clientY - rect.top;
        
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        zoomLevel = Math.max(0.01, Math.min(10, zoomLevel * delta));
        if (visualization) {
            // Zoom towards the mouse pointer position
            visualization.setZoom(zoomLevel, pointerX, pointerY);
            zoomLevelDisplay.textContent = `${Math.round(zoomLevel * 100)}%`;
        }
    });

    // Pan with mouse drag
    let isDragging = false;
    let lastMouseX = 0;
    let lastMouseY = 0;

    canvas.addEventListener('mousedown', (e) => {
        isDragging = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        
        // Update tracked mouse position
        const rect = canvas.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;
    });

    canvas.addEventListener('mousemove', (e) => {
        if (isDragging && visualization) {
            const dx = e.clientX - lastMouseX;
            const dy = e.clientY - lastMouseY;
            visualization.pan(dx, dy);
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
        }
    });

    canvas.addEventListener('mouseup', () => {
        isDragging = false;
    });

    canvas.addEventListener('mouseleave', () => {
        isDragging = false;
    });
}

init().catch(console.error);

