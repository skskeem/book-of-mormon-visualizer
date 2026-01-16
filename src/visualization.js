import { Container, Text, Graphics, TextStyle } from 'pixi.js';
import { BOOK_DEFINITIONS } from './loadText.js';

export async function createVisualization(text, app, progressCallback = null, bookMarkers = []) {
    const container = new Container();
    app.stage.addChild(container);

    // Configuration
    const config = {
        fontSize: 9, // Slightly larger for better clarity
        lineHeight: 11, // Adjusted for new font size
        charWidth: 5.4, // Adjusted for new font size
        padding: 20,
        columnGap: 40, // Space between columns
        highlightColor: 0xffff00,
        textColor: 0xffffff,
        backgroundColor: 0x1a1a1a,
        lineWidth: 180, // Characters per line - wider columns
    };

    let zoom = 1;
    let offsetX = 0;
    let offsetY = 0;
    let searchMatches = [];
    let matchesByLine = new Map();
    let searchResultCount = 0;
    let initialZoom = 1;
    let currentMatchIndex = -1; // Track which match is currently in view
    const MAX_TEXT_RESOLUTION = 3;
    let currentTextResolution = 1;

    // Process verses and wrap them to fit within column width
    if (progressCallback) progressCallback('Processing verses...');
    const verses = text.split('\n');
    const lines = [];
    const verseStartLines = []; // Track which line index each verse starts at
    const lineWidth = config.lineWidth;
    const versesLength = verses.length;
    
    // Pre-compile regex for word splitting
    const wordSplitRegex = /\s+/;
    
    // Process verses in batches for better performance
    const BATCH_SIZE = 500;
    for (let batchStart = 0; batchStart < versesLength; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE, versesLength);
        
        for (let v = batchStart; v < batchEnd; v++) {
            const verse = verses[v];
            if (verse.length === 0) continue;
            
            verseStartLines.push(lines.length);
            
            // Fast path: if verse fits in one line, no need to split
            if (verse.length <= lineWidth) {
                lines.push(verse);
                continue;
            }
            
            // Wrap this verse
            const words = verse.split(wordSplitRegex);
            let currentLine = '';
            let currentLen = 0;
            
            for (let w = 0; w < words.length; w++) {
                const word = words[w];
                const wordLen = word.length;
                const newLen = currentLen === 0 ? wordLen : currentLen + 1 + wordLen;
                
                if (newLen > lineWidth && currentLen > 0) {
                    lines.push(currentLine);
                    currentLine = word;
                    currentLen = wordLen;
                } else {
                    currentLine = currentLen === 0 ? word : currentLine + ' ' + word;
                    currentLen = newLen;
                }
            }
            
            if (currentLen > 0) {
                lines.push(currentLine);
            }
        }
        
        // Yield to browser after each batch
        if (progressCallback) {
            const percent = Math.floor((batchEnd / versesLength) * 100);
            progressCallback(`Processing verses... ${percent}%`);
        }
        await new Promise(resolve => setTimeout(resolve, 0));
    }

    if (progressCallback) progressCallback('Finalizing...');

    console.log('Created', lines.length, 'wrapped lines from', verses.length, 'verses');

    // Calculate columns dynamically based on content
    // Set a minimum column height so small books don't spread too thin
    const MIN_LINES_PER_COLUMN = 300; // Minimum lines before flowing to next column
    const MAX_COLUMNS = 8;
    
    // Calculate how many columns we actually need
    const neededColumns = Math.ceil(lines.length / MIN_LINES_PER_COLUMN);
    const numColumns = Math.min(Math.max(1, neededColumns), MAX_COLUMNS);
    const linesPerColumn = Math.ceil(lines.length / numColumns);
    
    console.log(`Using ${numColumns} columns with ~${linesPerColumn} lines each`);
    
    const columnLines = [];
    for (let i = 0; i < numColumns; i++) {
        columnLines.push(lines.slice(linesPerColumn * i, linesPerColumn * (i + 1)));
    }
    
    // Pre-calculate frequently used values
    const columnWidth = config.lineWidth * config.charWidth;
    const cachedColumnXPositions = [];
    for (let i = 0; i < numColumns; i++) {
        cachedColumnXPositions.push(config.padding + i * (columnWidth + config.columnGap));
    }
    const maxColumnLength = Math.max(...columnLines.map(col => col.length));

    // Map each wrapped line to its book using bookMarkers and verseStartLines
    // bookMarkers contains { bookIndex, lineIndex } where lineIndex is the verse index
    // verseStartLines maps verse index -> first wrapped line index for that verse
    const lineToBook = new Array(lines.length).fill(0);
    if (bookMarkers.length > 0) {
        // Convert verse-based book markers to line-based
        // bookMarkers[i].lineIndex is a verse index, convert it to wrapped line index
        const lineBasedMarkers = bookMarkers.map(marker => ({
            bookIndex: marker.bookIndex,
            lineIndex: verseStartLines[marker.lineIndex] ?? 0
        }));
        
        let markerIdx = 0;
        let currentBookIndex = lineBasedMarkers[0]?.bookIndex ?? 0;
        
        for (let i = 0; i < lines.length; i++) {
            // Check if we've reached the next book marker
            while (markerIdx < lineBasedMarkers.length && i >= lineBasedMarkers[markerIdx].lineIndex) {
                currentBookIndex = lineBasedMarkers[markerIdx].bookIndex;
                markerIdx++;
            }
            lineToBook[i] = currentBookIndex;
        }
    }
    
    // Calculate book regions (contiguous ranges of lines for each book in each column)
    // Each region: { bookIndex, startLine, endLine, column }
    const bookRegions = [];
    
    for (let col = 0; col < numColumns; col++) {
        const colLines = columnLines[col];
        const colOffset = col * linesPerColumn;
        
        if (colLines.length === 0) continue;
        
        let currentRegionBook = lineToBook[colOffset];
        let regionStart = 0;
        
        for (let i = 0; i < colLines.length; i++) {
            const globalLineIndex = colOffset + i;
            const bookIdx = lineToBook[globalLineIndex] ?? currentRegionBook;
            
            if (bookIdx !== currentRegionBook) {
                // Close the previous region
                bookRegions.push({
                    bookIndex: currentRegionBook,
                    startLine: regionStart,
                    endLine: i - 1,
                    column: col
                });
                // Start a new region
                currentRegionBook = bookIdx;
                regionStart = i;
            }
        }
        // Close the final region for this column
        bookRegions.push({
            bookIndex: currentRegionBook,
            startLine: regionStart,
            endLine: colLines.length - 1,
            column: col
        });
    }
    
    console.log('Created', bookRegions.length, 'book regions across columns');

    // Create background graphics layer for book colors (rendered behind text)
    const bookBackgroundGraphics = new Graphics();
    container.addChild(bookBackgroundGraphics);

    // Performance optimizations: viewport culling and sprite pooling
    const textSprites = new Map(); // Map of originalIndex -> sprite entry
    const spritePool = []; // Pool of reusable sprites
    const highlightGraphics = new Graphics(); // Keep for backward compatibility, but we'll use individual Graphics
    const highlightSprites = new Map(); // Map of matchIndex -> Graphics object for clickable highlights
    container.addChild(highlightGraphics);

    // Create TextStyle objects for reuse with improved clarity
    const textStyle = new TextStyle({
        fontFamily: 'monospace',
        fontSize: config.fontSize,
        fill: config.textColor,
        letterSpacing: 0, // Tighter letter spacing for clarity
        textBaseline: 'alphabetic', // Better baseline alignment
    });

    // Get a sprite from pool or create new one
    function getSprite() {
        if (spritePool.length > 0) {
            return spritePool.pop();
        }
        return new Text('', textStyle);
    }

    // Return sprite to pool
    function returnSprite(sprite) {
        if (sprite && sprite.parent) {
            sprite.parent.removeChild(sprite);
        }
        sprite.text = '';
        sprite.visible = false;
        spritePool.push(sprite);
    }

    function getTextResolutionForZoom() {
        if (zoom >= 2.5) return Math.min(3, MAX_TEXT_RESOLUTION);
        if (zoom >= 1.35) return Math.min(2, MAX_TEXT_RESOLUTION);
        return 1;
    }

    function applyTextResolution(sprite, resolution) {
        if (sprite.resolution !== resolution) {
            sprite.resolution = resolution;
            if (typeof sprite.updateText === 'function') {
                sprite.updateText();
            }
        }
    }

    // Calculate visible line range based on viewport
    // Reuse object to avoid GC pressure
    const visibleRangeResult = { start: 0, end: 0 };
    const SCROLL_PADDING = 50;
    
    function getVisibleLineRange() {
        // Calculate viewport bounds in world coordinates
        const invZoom = 1 / zoom;
        const worldTop = -offsetY * invZoom;
        const worldBottom = (app.screen.height - offsetY) * invZoom;

        visibleRangeResult.start = Math.max(0, ((worldTop - config.padding - SCROLL_PADDING) / config.lineHeight) | 0);
        visibleRangeResult.end = Math.min(
            maxColumnLength,
            Math.ceil((worldBottom - config.padding + SCROLL_PADDING) / config.lineHeight)
        );

        return visibleRangeResult;
    }

    // Render only visible text (viewport culling)
    // Reuse Set to avoid allocation
    const visibleIndicesSet = new Set();
    
    function renderVisibleText() {
        const visibleRange = getVisibleLineRange();
        
        // Clear and reuse the set
        visibleIndicesSet.clear();
        const visibleIndices = visibleIndicesSet;

        const textResolution = currentTextResolution;

        // Render visible lines from all columns
        for (let col = 0; col < numColumns; col++) {
            const colLines = columnLines[col];
            const colX = cachedColumnXPositions[col];
            const colLinesLen = colLines.length;
            const rangeEnd = visibleRange.end;
            
            for (let lineIndex = visibleRange.start; lineIndex < rangeEnd && lineIndex < colLinesLen; lineIndex++) {
                const originalIndex = linesPerColumn * col + lineIndex;
                visibleIndices.add(originalIndex);

                let entry = textSprites.get(originalIndex);
                if (!entry) {
                    const sprite = getSprite();
                    entry = { sprite, column: col, lineIndex, originalIndex };
                    textSprites.set(originalIndex, entry);
                }

                const sprite = entry.sprite;
                applyTextResolution(sprite, textResolution);
                
                // Only update text if changed
                const lineText = colLines[lineIndex];
                if (sprite.text !== lineText) {
                    sprite.text = lineText;
                }
                sprite.x = colX;
                sprite.y = config.padding + lineIndex * config.lineHeight;
                sprite.visible = true;

                if (!sprite.parent) {
                    container.addChild(sprite);
                }
            }
        }

        // Remove sprites that are no longer visible
        for (const [index, entry] of textSprites.entries()) {
            if (!visibleIndices.has(index)) {
                returnSprite(entry.sprite);
                textSprites.delete(index);
            }
        }
    }

    // Render colored background bands for each book
    function renderBookBackgrounds() {
        bookBackgroundGraphics.clear();
        
        if (bookRegions.length === 0) return;
        
        // Calculate opacity based on zoom level - more visible when zoomed out
        const opacity = zoom < 0.1 ? 0.35 : (zoom < 0.3 ? 0.25 : 0.15);
        
        // Get visible range to only render what's needed
        const visibleRange = getVisibleLineRange();
        const rangeStart = visibleRange.start;
        const rangeEnd = visibleRange.end;
        const regionsLen = bookRegions.length;
        
        for (let r = 0; r < regionsLen; r++) {
            const region = bookRegions[r];
            const { bookIndex, startLine, endLine, column } = region;
            
            // Skip if region is outside visible range
            if (endLine < rangeStart || startLine > rangeEnd) continue;
            
            // Clip to visible range
            const visibleStart = startLine > rangeStart ? startLine : rangeStart;
            const visibleEnd = endLine < rangeEnd ? endLine : rangeEnd;
            
            const color = BOOK_DEFINITIONS[bookIndex]?.color ?? 0x666666;
            const x = cachedColumnXPositions[column] - 2;
            const y = config.padding + visibleStart * config.lineHeight - 1;
            const width = columnWidth + 4;
            const height = (visibleEnd - visibleStart + 1) * config.lineHeight + 2;
            
            bookBackgroundGraphics.beginFill(color, opacity);
            bookBackgroundGraphics.drawRect(x, y, width, height);
            bookBackgroundGraphics.endFill();
        }
    }

    function updateHighlights() {
        // Clear old highlight graphics
        highlightGraphics.clear();
        
        // Remove old clickable highlight sprites that are no longer visible
        const visibleMatchIndices = new Set();
        
        if (searchMatches.length === 0) {
            // Remove all highlight sprites if no matches
            highlightSprites.forEach((graphics) => {
                if (graphics.parent) {
                    graphics.parent.removeChild(graphics);
                }
            });
            highlightSprites.clear();
            return;
        }

        // Calculate zoom-based styling for maximum visibility at low zoom levels
        const isVeryZoomedOut = zoom < 0.2;
        
        // Dynamic styling based on zoom level
        let fillColor, fillOpacity, borderColor, borderWidth, padding;
        
        if (isVeryZoomedOut) {
            // Very zoomed out: high visibility (used for both very and extremely zoomed out)
            fillColor = 0xff6b00; // Bright orange-red
            fillOpacity = 0.85;
            borderColor = 0xffff00; // Bright yellow border
            borderWidth = Math.max(2, 3 / zoom);
            padding = Math.max(1, 2 / zoom);
        } else {
            // Normal zoom: standard highlighting
            fillColor = 0xffeb3b; // Bright yellow
            fillOpacity = 0.75;
            borderColor = 0xffc107; // Amber border
            borderWidth = 1.5;
            padding = 0;
        }

        // Create clickable highlights for currently rendered lines only
        for (const [originalIndex, textEntry] of textSprites.entries()) {
            if (!textEntry || !textEntry.sprite.visible) continue;

            const lineMatches = matchesByLine.get(originalIndex);
            if (!lineMatches || lineMatches.length === 0) continue;

            const textSprite = textEntry.sprite;

            for (const matchIndex of lineMatches) {
                const match = searchMatches[matchIndex];
                if (!match) continue;

                const { startChar, endChar, lineText } = match;

                visibleMatchIndices.add(matchIndex);

                // Calculate position of the match within the line
                const beforeMatch = lineText.substring(0, startChar);
                const matchText = lineText.substring(startChar, endChar);
                
                // Approximate character positions (monospace font)
                const beforeWidth = beforeMatch.length * config.charWidth;
                const matchWidth = matchText.length * config.charWidth;
                
                // Apply padding to make highlights larger at low zoom
                const x = textSprite.x + beforeWidth - padding;
                const y = textSprite.y - padding;
                const width = matchWidth + padding * 2;
                const height = config.lineHeight + padding * 2;
                
                // Get or create a Graphics object for this highlight
                let highlightGraphic = highlightSprites.get(matchIndex);
                if (!highlightGraphic) {
                    highlightGraphic = new Graphics();
                    highlightGraphic.eventMode = 'static'; // PixiJS v7: makes it interactive
                    highlightGraphic.cursor = 'pointer'; // Show pointer cursor on hover
                    
                    // Store match index for click handler
                    highlightGraphic.matchIndex = matchIndex;
                    
                    // Add click handler to zoom and center on this match
                    highlightGraphic.on('pointerdown', () => {
                        jumpToMatchAndZoom(matchIndex);
                    });
                    
                    container.addChild(highlightGraphic);
                    highlightSprites.set(matchIndex, highlightGraphic);
                }
                
                // Update the highlight graphics
                highlightGraphic.clear();
                highlightGraphic.x = x;
                highlightGraphic.y = y;
                
                // Draw fill
                highlightGraphic.beginFill(fillColor, fillOpacity);
                highlightGraphic.drawRect(0, 0, width, height);
                highlightGraphic.endFill();
                
                // Draw border
                highlightGraphic.lineStyle(borderWidth, borderColor, 1.0);
                highlightGraphic.drawRect(0, 0, width, height);
                highlightGraphic.lineStyle(0);
                
                // Also draw to the main highlightGraphics for backward compatibility
                highlightGraphics.beginFill(fillColor, fillOpacity);
                highlightGraphics.drawRect(x, y, width, height);
                highlightGraphics.endFill();
                highlightGraphics.lineStyle(borderWidth, borderColor, 1.0);
                highlightGraphics.drawRect(x, y, width, height);
                highlightGraphics.lineStyle(0);
            }
        }
        
        // Remove highlight sprites that are no longer visible
        highlightSprites.forEach((graphic, matchIndex) => {
            if (!visibleMatchIndices.has(matchIndex)) {
                if (graphic.parent) {
                    graphic.parent.removeChild(graphic);
                }
                highlightSprites.delete(matchIndex);
            }
        });
    }
    
    function jumpToMatchAndZoom(matchIndex) {
        if (searchMatches.length === 0 || matchIndex < 0 || matchIndex >= searchMatches.length) {
            return false;
        }

        const match = searchMatches[matchIndex];
        const { lineIndex, startChar, lineText } = match;
        
        // Determine which column this line is in
        const columnIndex = Math.min(Math.floor(lineIndex / linesPerColumn), numColumns - 1);
        const columnLineIndex = lineIndex - (columnIndex * linesPerColumn);
        
        // Calculate position of the match in world coordinates
        const columnWidth = config.lineWidth * config.charWidth;
        const matchColumnX = config.padding + columnIndex * (columnWidth + config.columnGap);
        
        const beforeMatch = lineText.substring(0, startChar);
        const beforeWidth = beforeMatch.length * config.charWidth;
        
        // World coordinates of the match (before zoom/transform)
        const matchWorldX = matchColumnX + beforeWidth;
        const matchWorldY = config.padding + columnLineIndex * config.lineHeight;
        
        // Calculate center of screen in world coordinates for zoom focal point
        const centerScreenX = app.screen.width / 2;
        const centerScreenY = app.screen.height / 2;
        
        // Zoom in to a readable level - zoom in more aggressively
        // Zoom in by 5x, with a minimum of 1.0 (100%) and maximum of 3.0 (300%)
        const targetZoom = Math.max(1.0, Math.min(3.0, zoom * 5));
        
        // Use setZoom with the match position as focal point to center it
        // First set the zoom, then adjust offset to center the match
        zoom = targetZoom;
        
        // Calculate what the screen position would be with new zoom
        const matchScreenX = matchWorldX * zoom;
        const matchScreenY = matchWorldY * zoom;
        
        // Calculate offset to center the match in the viewport
        offsetX = centerScreenX - matchScreenX;
        offsetY = centerScreenY - matchScreenY;
        
        // Update the transform and render
        updateTransform();
        renderVisibleText();
        updateHighlights();
        
        currentMatchIndex = matchIndex;
        
        // Trigger a custom event so main.js can update the zoom display
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('visualization-zoom-changed', { 
                detail: { zoom: targetZoom } 
            }));
        }
        
        return true;
    }

    function performSearch(term) {
        searchMatches = [];
        matchesByLine.clear();
        searchResultCount = 0;
        currentMatchIndex = -1; // Reset match index when searching

        if (!term || term.length < 3) {
            updateHighlights();
            return;
        }

        const searchRegex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        
        lines.forEach((line, lineIndex) => {
            let match;
            const regex = new RegExp(searchRegex.source, 'gi');
            while ((match = regex.exec(line)) !== null) {
                searchMatches.push({
                    lineIndex,
                    startChar: match.index,
                    endChar: match.index + match[0].length,
                    lineText: line,
                });
                searchResultCount++;

                const matchIndex = searchMatches.length - 1;
                let lineMatches = matchesByLine.get(lineIndex);
                if (!lineMatches) {
                    lineMatches = [];
                    matchesByLine.set(lineIndex, lineMatches);
                }
                lineMatches.push(matchIndex);
            }
        });

        updateHighlights();
    }

    function jumpToMatch(matchIndex) {
        if (searchMatches.length === 0 || matchIndex < 0 || matchIndex >= searchMatches.length) {
            return false;
        }

        const match = searchMatches[matchIndex];
        const { lineIndex, startChar, lineText } = match;
        
        // Determine which column this line is in
        const columnIndex = Math.min(Math.floor(lineIndex / linesPerColumn), numColumns - 1);
        const columnLineIndex = lineIndex - (columnIndex * linesPerColumn);
        
        // Calculate position of the match in world coordinates
        const columnWidth = config.lineWidth * config.charWidth;
        const matchColumnX = config.padding + columnIndex * (columnWidth + config.columnGap);
        
        const beforeMatch = lineText.substring(0, startChar);
        const beforeWidth = beforeMatch.length * config.charWidth;
        
        // World coordinates of the match (before zoom/transform)
        const matchWorldX = matchColumnX + beforeWidth;
        const matchWorldY = config.padding + columnLineIndex * config.lineHeight;
        
        // Calculate what the screen position would be with current zoom
        const matchScreenX = matchWorldX * zoom;
        const matchScreenY = matchWorldY * zoom;
        
        // Calculate offset to center the match in the viewport
        // offsetX/Y are applied to the container, so we need to account for that
        offsetX = app.screen.width / 2 - matchScreenX;
        offsetY = app.screen.height / 2 - matchScreenY;
        
        // Update the transform and render
        updateTransform();
        renderVisibleText();
        updateHighlights();
        
        currentMatchIndex = matchIndex;
        return true;
    }

    function jumpToNextMatchInternal() {
        if (searchMatches.length === 0) {
            return false;
        }
        
        // Move to next match, wrapping around
        currentMatchIndex = (currentMatchIndex + 1) % searchMatches.length;
        return jumpToMatchAndZoom(currentMatchIndex);
    }

    // Initial render with viewport culling - show content immediately
    renderBookBackgrounds();
    renderVisibleText();
    console.log('Text rendering optimized with viewport culling');
    
    // Force immediate render to show content right away
    app.renderer.render(app.stage);

    // Calculate total dimensions (columnWidth already computed above)
    const totalWidth = columnWidth * numColumns + config.columnGap * (numColumns - 1) + config.padding * 2;
    const totalHeight = maxColumnLength * config.lineHeight + config.padding * 2;
    console.log('Total dimensions:', totalWidth, 'x', totalHeight);

    // Calculate initial zoom to fit everything
    const scaleX = app.screen.width / totalWidth;
    const scaleY = app.screen.height / totalHeight;
    let calculatedZoom = Math.min(scaleX, scaleY) * 0.95; // 95% to leave some margin
    
    // Set a minimum zoom level so text is actually visible (at least 2%)
    // If the calculated zoom is too small, use a fixed minimum that shows a readable portion
    const MIN_VISIBLE_ZOOM = 0.02; // 2% minimum for better readability
    const useMinimumZoom = calculatedZoom < MIN_VISIBLE_ZOOM;
    initialZoom = useMinimumZoom ? MIN_VISIBLE_ZOOM : calculatedZoom;
    zoom = initialZoom;
    console.log('Initial zoom calculated:', initialZoom, 'Screen:', app.screen.width, 'x', app.screen.height);

    // Center the view initially (or position at top if zoom is at minimum)
    offsetX = (app.screen.width - totalWidth * zoom) / 2;
    if (useMinimumZoom) {
        // If using minimum zoom, start at the top so user can see the beginning
        offsetY = config.padding;
    } else {
        // Only center vertically if we're actually fitting everything
    offsetY = (app.screen.height - totalHeight * zoom) / 2;
    }
    container.x = offsetX;
    container.y = offsetY;

    // Update transform and viewport with throttling
    let lastOffsetX = offsetX;
    let lastOffsetY = offsetY;
    let lastZoom = zoom;
    let needsRender = true;
    
    function updateTransform() {
        container.scale.set(zoom);
        container.x = offsetX;
        container.y = offsetY;
        
        // Check if viewport actually changed (faster than string comparison)
        const offsetChanged = Math.abs(offsetX - lastOffsetX) > 25 || Math.abs(offsetY - lastOffsetY) > 25;
        const zoomChanged = Math.abs(zoom - lastZoom) > 0.001;
        
        const nextResolution = getTextResolutionForZoom();
        const resolutionChanged = nextResolution !== currentTextResolution;
        if (resolutionChanged) {
            currentTextResolution = nextResolution;
        }
        
        if (offsetChanged || zoomChanged || resolutionChanged || needsRender) {
            lastOffsetX = offsetX;
            lastOffsetY = offsetY;
            lastZoom = zoom;
            needsRender = false;
            
            renderBookBackgrounds();
            renderVisibleText();
            if (searchMatches.length > 0) {
                updateHighlights();
            }
        }
    }

    // Initial transform update (no ticker - render on demand only)
    updateTransform();

    return {
        setZoom(newZoom, focalPointX = null, focalPointY = null) {
            // If focal point is provided, zoom towards that point (mouse position)
            if (focalPointX !== null && focalPointY !== null) {
                const oldZoom = zoom;
                zoom = newZoom;
                
                // Calculate the world position under the focal point before zoom
                const worldX = (focalPointX - offsetX) / oldZoom;
                const worldY = (focalPointY - offsetY) / oldZoom;
                
                // Adjust offset to keep the same world point under the focal point after zoom
                offsetX = focalPointX - worldX * zoom;
                offsetY = focalPointY - worldY * zoom;
            } else {
                // Center zoom (for button controls)
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
            performSearch(term);
            // Force immediate highlight update after search
            updateHighlights();
        },

        getSearchResultCount() {
            return searchResultCount;
        },

        getCurrentMatchIndex() {
            return currentMatchIndex;
        },

        jumpToNextMatch() {
            return jumpToNextMatchInternal();
        },

        handleResize() {
            // Recalculate zoom on resize
            const scaleX = app.screen.width / totalWidth;
            const scaleY = app.screen.height / totalHeight;
            const newInitialZoom = Math.min(scaleX, scaleY) * 0.95;
            if (Math.abs(zoom - initialZoom) < 0.001) {
                zoom = newInitialZoom;
            }
            initialZoom = newInitialZoom;
            this.resetView();
        },

        destroy() {
            // Clear all children and remove container from stage
            container.removeChildren();
            if (container.parent) {
                container.parent.removeChild(container);
            }
            container.destroy({ children: true, texture: true, baseTexture: true });
            
            // Clear data structures
            searchMatches.length = 0;
            matchesByLine.clear();
            lines.length = 0;
            verseStartLines.length = 0;
        },
    };
}

