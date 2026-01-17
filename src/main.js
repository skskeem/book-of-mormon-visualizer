import { Application } from 'pixi.js';
import { loadBookOfMormon } from './loadText.js';
import { BOOK_DEFINITIONS } from './bookDefinitions.js';
import { createVisualization } from './visualization.js';
import { SearchControls } from './controls/searchControls.js';
import { ZoomControls } from './controls/zoomControls.js';
import { BookFilter } from './controls/bookFilter.js';
import { LoadingIndicator } from './utils/loadingIndicator.js';
import { BookLegend } from './utils/legend.js';

let app;
let visualization;
let searchControls;
let zoomControls;
let bookFilter;
let loadingIndicator;
let bookLegend;

async function loadAndCreateVisualization(filterBookIndex = -1) {
    // Show loading indicator
    if (!loadingIndicator) {
        loadingIndicator = new LoadingIndicator();
    }
    loadingIndicator.show();

    const updateLoadingText = (text) => {
        loadingIndicator.updateText(text);
    };

    // Destroy previous visualization if exists
    if (visualization) {
        visualization.destroy();
        visualization = null;
    }

    // Load Book of Mormon text with filter
    updateLoadingText(filterBookIndex >= 0 
        ? `Loading ${BOOK_DEFINITIONS[filterBookIndex].name}...` 
        : 'Loading text file...');
    
    const loadStart = performance.now();
    const { text, bookMarkers, verses, verseMeta } = await loadBookOfMormon(filterBookIndex);
    const loadTime = performance.now() - loadStart;
    console.log(`Text loaded in ${loadTime.toFixed(2)}ms, length:`, text.length);
    console.log(`Found ${bookMarkers.length} book markers`);

    if (!text || text.length === 0) {
        console.error('No text loaded!');
        loadingIndicator.hide();
        return null;
    }

    // Update loading message
    updateLoadingText('Processing text...');

    // Create visualization
    const processStart = performance.now();
    visualization = await createVisualization(text, app, updateLoadingText, bookMarkers, verses, verseMeta);
    const processTime = performance.now() - processStart;
    console.log(`Visualization created in ${processTime.toFixed(2)}ms`);

    // Remove loading indicator
    loadingIndicator.hide();

    // Set initial zoom level
    const initialZoom = visualization.getInitialZoom();
    console.log('Initial zoom level:', initialZoom);
    zoomControls.setVisualization(visualization);

    // Update book legend visibility based on filter
    if (bookLegend) {
        bookLegend.updateVisibility(filterBookIndex);
    }

    // Update controls with new visualization
    searchControls.setVisualization(visualization);

    return visualization;
}

async function init() {
    try {
        // Create PixiJS application
        app = new Application({
            width: window.innerWidth,
            height: window.innerHeight,
            backgroundColor: 0x1a1a1a,
            antialias: true,
            resolution: window.devicePixelRatio || 1,
            autoDensity: true,
        });

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

        // Initialize controls
        searchControls = new SearchControls(null);
        zoomControls = new ZoomControls(app, null);
        bookFilter = new BookFilter(async (filterIndex) => {
            // Clear search when changing books
            searchControls.clear();

            // Reload visualization with new filter
            await loadAndCreateVisualization(filterIndex);
        });
        bookLegend = new BookLegend();

        // Load and create visualization
        await loadAndCreateVisualization(bookFilter.getCurrentFilter());

        // Handle window resize
        window.addEventListener('resize', () => {
            app.renderer.resize(window.innerWidth, window.innerHeight);
            if (visualization) {
                visualization.handleResize();
            }
        });
    } catch (error) {
        console.error('Error initializing application:', error);
    }
}

init().catch(console.error);
