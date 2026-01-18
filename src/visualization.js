import { Container, TextStyle } from 'pixi.js';
import { SemanticSearchIndex } from './utils/semanticSearch.js';
import { VISUALIZATION_CONFIG, ZOOM_CONFIG } from './config.js';
import { wrapVerses, calculateColumnLayout, mapLinesToBooks, calculateBookRegions } from './utils/textProcessing.js';
import { ViewportManager } from './utils/viewport.js';
import { SearchManager } from './utils/search.js';
import { TextRenderer, BookBackgroundRenderer, HighlightRenderer } from './utils/rendering.js';

export async function createVisualization(text, app, progressCallback = null, bookMarkers = [], verses = null, verseMeta = null) {
    const container = new Container();
    container.sortableChildren = true;
    app.stage.addChild(container);

    // Detect if viewing a single book
    const isSingleBookView = bookMarkers.length === 1;

    // Build configuration based on view type
    const config = {
        fontSize: VISUALIZATION_CONFIG.fontSize,
        lineHeight: VISUALIZATION_CONFIG.lineHeight,
        charWidth: VISUALIZATION_CONFIG.charWidth,
        padding: VISUALIZATION_CONFIG.padding,
        columnGap: isSingleBookView 
            ? VISUALIZATION_CONFIG.columnGap.singleBook 
            : VISUALIZATION_CONFIG.columnGap.multiBook,
        highlightColor: VISUALIZATION_CONFIG.highlightColor,
        textColor: VISUALIZATION_CONFIG.textColor,
        backgroundColor: VISUALIZATION_CONFIG.backgroundColor,
        lineWidth: isSingleBookView 
            ? VISUALIZATION_CONFIG.lineWidth.singleBook 
            : VISUALIZATION_CONFIG.lineWidth.multiBook,
    };

    // State management
    let zoom = 1;
    let offsetX = 0;
    let offsetY = 0;
    let initialZoom = 1;
    let currentTextResolution = 1;
    const maxTextResolution = VISUALIZATION_CONFIG.maxTextResolution;

    // Process verses and wrap them
    if (progressCallback) progressCallback('Processing verses...');
    const verseList = verses ?? text.split('\n');
    const verseMetaList = verseMeta ?? verseList.map((entry) => ({ kind: entry.length === 0 ? 'blank' : 'verse' }));
    const { lines, verseStartLines } = await wrapVerses(verseList, config.lineWidth, progressCallback);

    const lineToVerseIndex = new Array(lines.length).fill(-1);
    for (let verseIndex = 0; verseIndex < verseStartLines.length; verseIndex++) {
        const startLine = verseStartLines[verseIndex];
        if (startLine === undefined) continue;
        const endLine = verseIndex + 1 < verseStartLines.length
            ? verseStartLines[verseIndex + 1] - 1
            : lines.length - 1;
        for (let lineIndex = startLine; lineIndex <= endLine; lineIndex++) {
            lineToVerseIndex[lineIndex] = verseIndex;
        }
    }

    if (progressCallback) progressCallback('Finalizing...');

    console.log('Created', lines.length, 'wrapped lines from', verseList.length, 'verses');

    // Calculate column layout
    const { numColumns, linesPerColumn, columnLines } = calculateColumnLayout(lines, isSingleBookView);
    console.log(`Using ${numColumns} columns with ~${linesPerColumn} lines each`);

    // Pre-calculate column positions
    const columnWidth = config.lineWidth * config.charWidth;
    const cachedColumnXPositions = [];
    for (let i = 0; i < numColumns; i++) {
        cachedColumnXPositions.push(config.padding + i * (columnWidth + config.columnGap));
    }
    const maxColumnLength = Math.max(...columnLines.map(col => col.length));

    // Map lines to books
    const lineToBook = mapLinesToBooks(lines.length, bookMarkers, verseStartLines);

    // Calculate book regions
    const bookRegions = calculateBookRegions(columnLines, lineToBook, linesPerColumn);
    console.log('Created', bookRegions.length, 'book regions across columns');

    // Initialize managers and renderers
    const viewportManager = new ViewportManager(config, app, maxColumnLength);
    const searchManager = new SearchManager();
    const semanticState = {
        status: 'idle',
        message: ''
    };
    const semanticSupported = true;
    let semanticIndex = null;
    let semanticMatchOrder = [];
    let semanticMatchCursor = -1;
    let semanticResultCount = 0;
    let semanticScores = new Map(); // Map verseIndex -> score

    // Create text style
    const textStyle = new TextStyle({
        fontFamily: 'monospace',
        fontSize: config.fontSize,
        fill: config.textColor,
        letterSpacing: 0,
        textBaseline: 'alphabetic',
    });

    // Initialize renderers
    const textRenderer = new TextRenderer(container, config, textStyle);
    const bookBackgroundRenderer = new BookBackgroundRenderer(container, config);
    const highlightRenderer = new HighlightRenderer(container, config);

    // Calculate total dimensions
    const totalWidth = columnWidth * numColumns + config.columnGap * (numColumns - 1) + config.padding * 2;
    const totalHeight = maxColumnLength * config.lineHeight + config.padding * 2;
    console.log('Total dimensions:', totalWidth, 'x', totalHeight);

    // Calculate initial zoom
    const calculatedZoom = viewportManager.calculateInitialZoom(totalWidth, totalHeight);
    const useMinimumZoom = calculatedZoom < VISUALIZATION_CONFIG.minVisibleZoom;
    initialZoom = useMinimumZoom ? calculatedZoom : calculatedZoom;
    zoom = initialZoom;
    console.log('Initial zoom calculated:', initialZoom);

    // Calculate initial offset
    const { offsetX: initOffsetX, offsetY: initOffsetY } = viewportManager.calculateInitialOffset(
        totalWidth, totalHeight, zoom, useMinimumZoom
    );
    offsetX = initOffsetX;
    offsetY = initOffsetY;
    container.x = offsetX;
    container.y = offsetY;

    // Update transform and viewport
    let lastOffsetX = offsetX;
    let lastOffsetY = offsetY;
    let lastZoom = zoom;
    let needsRender = true;

    function updateTransform() {
        container.scale.set(zoom);
        container.x = offsetX;
        container.y = offsetY;

        // Check if viewport actually changed
        const offsetChanged = Math.abs(offsetX - lastOffsetX) > 25 || Math.abs(offsetY - lastOffsetY) > 25;
        const zoomChanged = Math.abs(zoom - lastZoom) > 0.001;

        const nextResolution = viewportManager.getTextResolutionForZoom(zoom, maxTextResolution);
        const resolutionChanged = nextResolution !== currentTextResolution;
        if (resolutionChanged) {
            currentTextResolution = nextResolution;
        }

        if (offsetChanged || zoomChanged || resolutionChanged || needsRender) {
            lastOffsetX = offsetX;
            lastOffsetY = offsetY;
            lastZoom = zoom;
            needsRender = false;

            const visibleRange = viewportManager.getVisibleLineRange(zoom, offsetY);
            bookBackgroundRenderer.render(bookRegions, cachedColumnXPositions, columnWidth, zoom, visibleRange);
            textRenderer.renderVisibleText(columnLines, cachedColumnXPositions, linesPerColumn, visibleRange, currentTextResolution);
            
            if (searchManager.getResultCount() > 0) {
                highlightRenderer.updateHighlights(
                    searchManager,
                    textRenderer.getVisibleTextSprites(),
                    zoom,
                    jumpToMatchAndZoom
                );
            }
        }
    }

    // Initial render
    const initialVisibleRange = viewportManager.getVisibleLineRange(zoom, offsetY);
    bookBackgroundRenderer.render(bookRegions, cachedColumnXPositions, columnWidth, zoom, initialVisibleRange);
    textRenderer.renderVisibleText(columnLines, cachedColumnXPositions, linesPerColumn, initialVisibleRange, currentTextResolution);
    console.log('Text rendering optimized with viewport culling');
    app.renderer.render(app.stage);

    async function prepareSemanticSearch() {
        if (semanticState.status === 'ready') {
            return semanticState;
        }

        semanticState.status = 'loading';
        semanticState.message = 'Loading semantic index...';

        try {
            semanticIndex = new SemanticSearchIndex();
            await semanticIndex.init();
            semanticState.status = 'ready';
            semanticState.message = 'Semantic index ready.';
        } catch (error) {
            if (error?.code === 'missing') {
                semanticState.status = 'missing';
                semanticState.message = 'Semantic index missing. Run the embeddings script.';
            } else {
                semanticState.status = 'error';
                semanticState.message = 'Failed to load semantic index.';
            }
            console.error('Semantic search init error:', error);
        }

        return semanticState;
    }

    function clearSearchState() {
        searchManager.clear();
        semanticMatchOrder = [];
        semanticMatchCursor = -1;
        semanticResultCount = 0;
        semanticScores.clear();
        needsRender = true;
        updateTransform();
    }

    function buildSemanticMatches(results) {
        const matches = [];
        semanticMatchOrder = [];
        semanticMatchCursor = -1;
        semanticResultCount = 0;
        semanticScores.clear();

        for (const result of results) {
            const verseIndex = result.verseIndex;
            const score = result.score;
            const meta = verseMetaList[verseIndex];
            if (!meta || meta.kind !== 'verse') {
                continue;
            }

            const startLine = verseStartLines[verseIndex];
            const endLine = verseIndex + 1 < verseStartLines.length
                ? verseStartLines[verseIndex + 1] - 1
                : lines.length - 1;

            if (startLine === undefined || endLine < startLine) {
                continue;
            }

            const firstMatchIndex = matches.length;
            for (let lineIndex = startLine; lineIndex <= endLine; lineIndex++) {
                const lineText = lines[lineIndex];
                if (!lineText) continue;
                matches.push({
                    lineIndex,
                    startChar: 0,
                    endChar: lineText.length,
                    lineText,
                    verseIndex, // Store verse index for score lookup
                    score // Store score on each match
                });
            }

            if (matches.length > firstMatchIndex) {
                semanticMatchOrder.push(firstMatchIndex);
                semanticScores.set(verseIndex, score);
                semanticResultCount++;
            }
        }

        searchManager.setMatches(matches);
        needsRender = true;
        updateTransform();
    }

    // Match navigation functions
    function calculateMatchPosition(matchIndex) {
        const match = searchManager.getMatch(matchIndex);
        if (!match) return null;

        const { lineIndex, startChar, lineText } = match;

        // Determine which column this line is in
        const columnIndex = Math.min(Math.floor(lineIndex / linesPerColumn), numColumns - 1);
        const columnLineIndex = lineIndex - (columnIndex * linesPerColumn);

        // Calculate position of the match in world coordinates
        const matchColumnX = config.padding + columnIndex * (columnWidth + config.columnGap);
        const beforeMatch = lineText.substring(0, startChar);
        const beforeWidth = beforeMatch.length * config.charWidth;

        const matchWorldX = matchColumnX + beforeWidth;
        const matchWorldY = config.padding + columnLineIndex * config.lineHeight;

        return { matchWorldX, matchWorldY };
    }

    function calculateLinePosition(lineIndex, startChar = 0) {
        if (lineIndex < 0 || lineIndex >= lines.length) return null;

        const columnIndex = Math.min(Math.floor(lineIndex / linesPerColumn), numColumns - 1);
        const columnLineIndex = lineIndex - (columnIndex * linesPerColumn);
        const matchColumnX = config.padding + columnIndex * (columnWidth + config.columnGap);
        const lineText = lines[lineIndex] || '';
        const beforeMatch = lineText.substring(0, startChar);
        const beforeWidth = beforeMatch.length * config.charWidth;
        const matchWorldX = matchColumnX + beforeWidth;
        const matchWorldY = config.padding + columnLineIndex * config.lineHeight;

        return { matchWorldX, matchWorldY };
    }

    function jumpToLineAndZoom(lineIndex) {
        const position = calculateLinePosition(lineIndex, 0);
        if (!position) return false;

        const { matchWorldX, matchWorldY } = position;
        const centerScreenX = app.screen.width / 2;
        const centerScreenY = app.screen.height / 2;

        const targetZoom = Math.max(
            ZOOM_CONFIG.clickZoomMin,
            Math.min(ZOOM_CONFIG.clickZoomMax, zoom * ZOOM_CONFIG.clickZoomMultiplier)
        );

        zoom = targetZoom;
        const matchScreenX = matchWorldX * zoom;
        const matchScreenY = matchWorldY * zoom;
        offsetX = centerScreenX - matchScreenX;
        offsetY = centerScreenY - matchScreenY;

        updateTransform();

        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('visualization-zoom-changed', {
                detail: { zoom: targetZoom }
            }));
        }

        return true;
    }

    function jumpToMatchAndZoom(matchIndex) {
        if (searchManager.getResultCount() === 0 || matchIndex < 0 || matchIndex >= searchManager.getResultCount()) {
            return false;
        }

        const position = calculateMatchPosition(matchIndex);
        if (!position) return false;

        const { matchWorldX, matchWorldY } = position;

        // Calculate center of screen
        const centerScreenX = app.screen.width / 2;
        const centerScreenY = app.screen.height / 2;

        // Zoom in aggressively
        const targetZoom = Math.max(
            ZOOM_CONFIG.clickZoomMin,
            Math.min(ZOOM_CONFIG.clickZoomMax, zoom * ZOOM_CONFIG.clickZoomMultiplier)
        );

        zoom = targetZoom;

        // Calculate offset to center the match
        const matchScreenX = matchWorldX * zoom;
        const matchScreenY = matchWorldY * zoom;
        offsetX = centerScreenX - matchScreenX;
        offsetY = centerScreenY - matchScreenY;

        searchManager.setCurrentMatchIndex(matchIndex);
        updateTransform();

        // Trigger zoom change event
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('visualization-zoom-changed', {
                detail: { zoom: targetZoom }
            }));
        }

        return true;
    }

    function jumpToMatch(matchIndex) {
        if (searchManager.getResultCount() === 0 || matchIndex < 0 || matchIndex >= searchManager.getResultCount()) {
            return false;
        }

        const position = calculateMatchPosition(matchIndex);
        if (!position) return false;

        const { matchWorldX, matchWorldY } = position;
        const matchScreenX = matchWorldX * zoom;
        const matchScreenY = matchWorldY * zoom;

        offsetX = app.screen.width / 2 - matchScreenX;
        offsetY = app.screen.height / 2 - matchScreenY;

        searchManager.setCurrentMatchIndex(matchIndex);
        updateTransform();

        return true;
    }

    function jumpToNextMatchInternal() {
        if (searchManager.getResultCount() === 0) {
            return false;
        }
        const nextIndex = searchManager.moveToNextMatch();
        return jumpToMatchAndZoom(nextIndex);
    }

    function jumpToNextSemanticMatchInternal() {
        if (semanticMatchOrder.length === 0) {
            return false;
        }
        semanticMatchCursor = (semanticMatchCursor + 1) % semanticMatchOrder.length;
        const matchIndex = semanticMatchOrder[semanticMatchCursor];
        return jumpToMatchAndZoom(matchIndex);
    }

    function getVerseIndexForLine(lineIndex) {
        if (lineIndex < 0 || lineIndex >= lineToVerseIndex.length) return -1;
        return lineToVerseIndex[lineIndex] ?? -1;
    }

    function formatVerseReference(verseIndex) {
        const meta = verseMetaList[verseIndex];
        if (!meta || meta.kind !== 'verse') return null;
        return `${meta.book} ${meta.chapter}:${meta.verse}`;
    }

    // Public API
    return {
        setZoom(newZoom, focalPointX = null, focalPointY = null) {
            if (focalPointX !== null && focalPointY !== null) {
                const oldZoom = zoom;
                zoom = newZoom;

                const worldX = (focalPointX - offsetX) / oldZoom;
                const worldY = (focalPointY - offsetY) / oldZoom;

                offsetX = focalPointX - worldX * zoom;
                offsetY = focalPointY - worldY * zoom;
            } else {
                zoom = newZoom;
            }
            updateTransform();
        },

        getInitialZoom() {
            return initialZoom;
        },

        getZoom() {
            return zoom;
        },

        pan(dx, dy) {
            offsetX += dx;
            offsetY += dy;
            updateTransform();
        },

        resetView() {
            offsetX = (app.screen.width - totalWidth * zoom) / 2;
            offsetY = (app.screen.height - totalHeight * zoom) / 2;
            updateTransform();
        },

        search(term) {
            semanticMatchOrder = [];
            semanticMatchCursor = -1;
            semanticResultCount = 0;
            semanticScores.clear();
            searchManager.performSearch(lines, term);
            needsRender = true;
            updateTransform();
        },

        async searchSemantic(term, topK = null, minScore = null) {
            if (!term || term.length < 2) {
                clearSearchState();
                return { status: 'cleared', count: 0 };
            }

            await prepareSemanticSearch();
            if (semanticState.status !== 'ready') {
                clearSearchState();
                return { status: semanticState.status, message: semanticState.message, count: 0 };
            }

            // Get more results than requested, then filter by threshold if provided
            const fetchCount = topK === null ? null : (minScore !== null ? Math.max(topK, 100) : topK);
            let results = await semanticIndex.searchText(term, fetchCount);
            
            // Filter by minimum score threshold if provided
            if (minScore !== null && minScore > 0) {
                results = results.filter(r => r.score >= minScore);
                // Limit to topK after filtering (if a cap is provided)
                if (topK !== null && results.length > topK) {
                    results = results.slice(0, topK);
                }
            }
            
            buildSemanticMatches(results);
            return { 
                status: semanticState.status, 
                count: semanticResultCount,
                scores: Array.from(semanticScores.entries()).map(([idx, score]) => ({ verseIndex: idx, score }))
            };
        },

        getSearchResultCount() {
            return searchManager.getResultCount();
        },

        getSemanticResultCount() {
            return semanticResultCount;
        },

        getCurrentMatchIndex() {
            return searchManager.getCurrentMatchIndex();
        },

        getCurrentSemanticMatchIndex() {
            return semanticMatchCursor;
        },

        jumpToNextMatch() {
            return jumpToNextMatchInternal();
        },

        jumpToNextSemanticMatch() {
            return jumpToNextSemanticMatchInternal();
        },

        clearSearch() {
            clearSearchState();
        },

        isSemanticSearchSupported() {
            return semanticSupported;
        },

        getSemanticStatus() {
            return { ...semanticState };
        },

        getSemanticScores() {
            return Array.from(semanticScores.entries()).map(([verseIndex, score]) => ({
                verseIndex,
                score
            }));
        },

        getSemanticScoreForVerse(verseIndex) {
            return semanticScores.get(verseIndex) ?? null;
        },

        getVerseInfo(verseIndex) {
            const reference = formatVerseReference(verseIndex) || 'Unknown';
            const text = verseList[verseIndex] || '';
            return { reference, text };
        },

        getSearchManager() {
            return searchManager;
        },

        async getAutoCrossRefsForMatch(matchIndex, minScore = 0.25, limit = 10) {
            const match = searchManager.getMatch(matchIndex);
            if (!match) {
                return { status: 'no-match', message: 'No match selected.', refs: [] };
            }

            let verseIndex = match.verseIndex;
            if (verseIndex === undefined || verseIndex === null) {
                verseIndex = getVerseIndexForLine(match.lineIndex);
            }

            if (verseIndex === undefined || verseIndex === null || verseIndex < 0) {
                return { status: 'no-verse', message: 'No verse found for this match.', refs: [] };
            }

            await prepareSemanticSearch();
            if (semanticState.status !== 'ready') {
                return { status: semanticState.status, message: semanticState.message, refs: [] };
            }

            const results = await semanticIndex.searchByVerseIndex(verseIndex, limit, minScore);
            const refs = results.map((result) => ({
                verseIndex: result.verseIndex,
                score: result.score,
                reference: formatVerseReference(result.verseIndex) || 'Unknown',
                text: verseList[result.verseIndex] || ''
            }));

            return { status: 'ready', verseIndex, refs };
        },

        jumpToVerse(verseIndex) {
            const startLine = verseStartLines[verseIndex];
            if (startLine === undefined) return false;
            return jumpToLineAndZoom(startLine);
        },

        handleResize() {
            const newInitialZoom = viewportManager.calculateInitialZoom(totalWidth, totalHeight);
            if (Math.abs(zoom - initialZoom) < 0.001) {
                zoom = newInitialZoom;
            }
            initialZoom = newInitialZoom;
            this.resetView();
        },

        destroy() {
            textRenderer.destroy();
            bookBackgroundRenderer.destroy();
            highlightRenderer.destroy();
            
            container.removeChildren();
            if (container.parent) {
                container.parent.removeChild(container);
            }
            container.destroy({ children: true, texture: true, baseTexture: true });
            
            searchManager.clear();
        },
    };
}
