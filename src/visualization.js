import { Container, Text, Graphics, TextStyle } from 'pixi.js';

export async function createVisualization(text, app, progressCallback = null) {
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
    let searchResultCount = 0;
    let initialZoom = 1;
    let currentMatchIndex = -1; // Track which match is currently in view

    // Optimized: Split text into words and create lines in chunks - process in larger batches
    if (progressCallback) progressCallback('Splitting text into words...');
    const words = text.split(/\s+/);
    const lines = [];
    let currentLine = '';
    const lineWidth = config.lineWidth;
    const totalWords = words.length;
    const chunkSize = 20000; // Process 20k words at a time for better performance
    
    // Process words in larger chunks
    for (let chunkStart = 0; chunkStart < words.length; chunkStart += chunkSize) {
        const chunkEnd = Math.min(chunkStart + chunkSize, words.length);
        
        for (let i = chunkStart; i < chunkEnd; i++) {
            const word = words[i];
            const testLine = currentLine ? currentLine + ' ' + word : word;
            
            if (testLine.length > lineWidth && currentLine.length > 0) {
                lines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        }
        
        // Yield to browser after each chunk
        if (progressCallback) {
            const percent = Math.floor((chunkEnd / totalWords) * 100);
            progressCallback(`Processing text... ${percent}%`);
        }
        await new Promise(resolve => setTimeout(resolve, 0));
    }
    
    if (currentLine) {
        lines.push(currentLine);
    }

    // Identify book headers and assign book indices - optimized with pre-compiled regex
    if (progressCallback) progressCallback('Identifying books...');
    const bookNames = [
        '1 Nephi', '2 Nephi', 'Jacob', 'Enos', 'Jarom', 'Omni', 
        'Words of Mormon', 'Mosiah', 'Alma', 'Helaman', 
        '3 Nephi', '4 Nephi', 'Mormon', 'Ether', 'Moroni'
    ];
    
    // Pre-compile regex patterns for better performance
    const bookPatterns = bookNames.map(name => ({
        name,
        exact: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
        withChapter: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+\\d+$`)
    }));
    
    const lineMetadata = [];
    let currentBookIndex = 0;
    const bookColors = [
        0x1a1a1a, 0x1f1f1f, 0x1a1a1a, 0x1f1f1f, 0x1a1a1a, 0x1f1f1f,
        0x1a1a1a, 0x1f1f1f, 0x1a1a1a, 0x1f1f1f, 0x1a1a1a, 0x1f1f1f,
        0x1a1a1a, 0x1f1f1f, 0x1a1a1a
    ];
    
    // Process metadata in chunks for better performance
    const metadataChunkSize = 25000; // Larger chunks for metadata processing
    for (let chunkStart = 0; chunkStart < lines.length; chunkStart += metadataChunkSize) {
        const chunkEnd = Math.min(chunkStart + metadataChunkSize, lines.length);
        
        for (let i = chunkStart; i < chunkEnd; i++) {
            const line = lines[i].trim();
            let isBookHeader = false;
            
            // Check if this line is a book header using pre-compiled patterns
            for (const pattern of bookPatterns) {
                if (pattern.exact.test(line) || pattern.withChapter.test(line)) {
                    isBookHeader = true;
                    currentBookIndex = bookNames.indexOf(pattern.name);
                    break;
                }
            }
            
            lineMetadata.push({
                isBookHeader,
                bookIndex: currentBookIndex,
                bookColor: bookColors[currentBookIndex % bookColors.length]
            });
        }
        
        // Yield periodically
        if (chunkStart % (metadataChunkSize * 5) === 0 && progressCallback) {
            const percent = Math.floor((chunkEnd / lines.length) * 100);
            progressCallback(`Identifying books... ${percent}%`);
        }
        await new Promise(resolve => setTimeout(resolve, 0));
    }
    
    if (progressCallback) progressCallback('Finalizing...');

    console.log('Created', lines.length, 'lines of text');

    // Split lines into six columns
    const linesPerColumn = Math.ceil(lines.length / 6);
    const column1Lines = lines.slice(0, linesPerColumn);
    const column2Lines = lines.slice(linesPerColumn, linesPerColumn * 2);
    const column3Lines = lines.slice(linesPerColumn * 2, linesPerColumn * 3);
    const column4Lines = lines.slice(linesPerColumn * 3, linesPerColumn * 4);
    const column5Lines = lines.slice(linesPerColumn * 4, linesPerColumn * 5);
    const column6Lines = lines.slice(linesPerColumn * 5);

    // Performance optimizations: viewport culling and sprite pooling
    const textSprites = new Map(); // Map of originalIndex -> sprite entry
    const spritePool = []; // Pool of reusable sprites
    const highlightGraphics = new Graphics(); // Keep for backward compatibility, but we'll use individual Graphics
    const highlightSprites = new Map(); // Map of matchIndex -> Graphics object for clickable highlights
    const bookBackgroundGraphics = new Graphics();
    container.addChild(bookBackgroundGraphics);
    container.addChild(highlightGraphics);

    // Create TextStyle objects for reuse with improved clarity
    const textStyle = new TextStyle({
        fontFamily: 'monospace',
        fontSize: config.fontSize,
        fill: config.textColor,
        letterSpacing: 0, // Tighter letter spacing for clarity
        textBaseline: 'alphabetic', // Better baseline alignment
    });
    
    const bookHeaderStyle = new TextStyle({
        fontFamily: 'monospace',
        fontSize: config.fontSize + 3,
        fill: 0x4a9eff, // Blue color for book headers
        fontWeight: 'bold',
        letterSpacing: 0,
        textBaseline: 'alphabetic',
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

    // Calculate visible line range based on viewport
    function getVisibleLineRange() {
        // Calculate viewport bounds in world coordinates
        const worldTop = (-offsetY) / zoom;
        const worldBottom = (app.screen.height - offsetY) / zoom;
        const worldLeft = (-offsetX) / zoom;
        const worldRight = (app.screen.width - offsetX) / zoom;

        // Add padding for smooth scrolling (render extra lines)
        const padding = 50;
        const visibleTop = Math.max(0, Math.floor((worldTop - config.padding - padding) / config.lineHeight));
        const visibleBottom = Math.min(
            Math.max(column1Lines.length, column2Lines.length, column3Lines.length, column4Lines.length, column5Lines.length, column6Lines.length),
            Math.ceil((worldBottom - config.padding + padding) / config.lineHeight)
        );

        return { start: visibleTop, end: visibleBottom };
    }

    // Render only visible text (viewport culling)
    function renderVisibleText() {
        const visibleRange = getVisibleLineRange();
        const columnWidth = config.lineWidth * config.charWidth;
        const column1X = config.padding;
        const column2X = column1X + columnWidth + config.columnGap;
        const column3X = column2X + columnWidth + config.columnGap;
        const column4X = column3X + columnWidth + config.columnGap;
        const column5X = column4X + columnWidth + config.columnGap;
        const column6X = column5X + columnWidth + config.columnGap;

        // Track which sprites are still visible
        const visibleIndices = new Set();

        // Render visible lines from column 1
        for (let lineIndex = visibleRange.start; lineIndex < visibleRange.end && lineIndex < column1Lines.length; lineIndex++) {
            const originalIndex = lineIndex;
            visibleIndices.add(originalIndex);
            const metadata = lineMetadata[originalIndex];

            let entry = textSprites.get(originalIndex);
            if (!entry) {
                const sprite = metadata?.isBookHeader ? new Text('', bookHeaderStyle) : getSprite();
                entry = { sprite, column: 0, lineIndex, originalIndex };
                textSprites.set(originalIndex, entry);
            }

            entry.sprite.text = column1Lines[lineIndex];
            entry.sprite.x = column1X;
            entry.sprite.y = config.padding + lineIndex * config.lineHeight;
            entry.sprite.visible = true;

            if (!entry.sprite.parent) {
                container.addChild(entry.sprite);
            }
        }

        // Render visible lines from column 2
        for (let lineIndex = visibleRange.start; lineIndex < visibleRange.end && lineIndex < column2Lines.length; lineIndex++) {
            const originalIndex = linesPerColumn + lineIndex;
            visibleIndices.add(originalIndex);
            const metadata = lineMetadata[originalIndex];

            let entry = textSprites.get(originalIndex);
            if (!entry) {
                const sprite = metadata?.isBookHeader ? new Text('', bookHeaderStyle) : getSprite();
                entry = { sprite, column: 1, lineIndex, originalIndex };
                textSprites.set(originalIndex, entry);
            }

            entry.sprite.text = column2Lines[lineIndex];
            entry.sprite.x = column2X;
            entry.sprite.y = config.padding + lineIndex * config.lineHeight;
            entry.sprite.visible = true;

            if (!entry.sprite.parent) {
                container.addChild(entry.sprite);
            }
        }

        // Render visible lines from column 3
        for (let lineIndex = visibleRange.start; lineIndex < visibleRange.end && lineIndex < column3Lines.length; lineIndex++) {
            const originalIndex = linesPerColumn * 2 + lineIndex;
            visibleIndices.add(originalIndex);
            const metadata = lineMetadata[originalIndex];

            let entry = textSprites.get(originalIndex);
            if (!entry) {
                const sprite = metadata?.isBookHeader ? new Text('', bookHeaderStyle) : getSprite();
                entry = { sprite, column: 2, lineIndex, originalIndex };
                textSprites.set(originalIndex, entry);
            }

            entry.sprite.text = column3Lines[lineIndex];
            entry.sprite.x = column3X;
            entry.sprite.y = config.padding + lineIndex * config.lineHeight;
            entry.sprite.visible = true;

            if (!entry.sprite.parent) {
                container.addChild(entry.sprite);
            }
        }

        // Render visible lines from column 4
        for (let lineIndex = visibleRange.start; lineIndex < visibleRange.end && lineIndex < column4Lines.length; lineIndex++) {
            const originalIndex = linesPerColumn * 3 + lineIndex;
            visibleIndices.add(originalIndex);
            const metadata = lineMetadata[originalIndex];

            let entry = textSprites.get(originalIndex);
            if (!entry) {
                const sprite = metadata?.isBookHeader ? new Text('', bookHeaderStyle) : getSprite();
                entry = { sprite, column: 3, lineIndex, originalIndex };
                textSprites.set(originalIndex, entry);
            }

            entry.sprite.text = column4Lines[lineIndex];
            entry.sprite.x = column4X;
            entry.sprite.y = config.padding + lineIndex * config.lineHeight;
            entry.sprite.visible = true;

            if (!entry.sprite.parent) {
                container.addChild(entry.sprite);
            }
        }

        // Render visible lines from column 5
        for (let lineIndex = visibleRange.start; lineIndex < visibleRange.end && lineIndex < column5Lines.length; lineIndex++) {
            const originalIndex = linesPerColumn * 4 + lineIndex;
            visibleIndices.add(originalIndex);
            const metadata = lineMetadata[originalIndex];

            let entry = textSprites.get(originalIndex);
            if (!entry) {
                const sprite = metadata?.isBookHeader ? new Text('', bookHeaderStyle) : getSprite();
                entry = { sprite, column: 4, lineIndex, originalIndex };
                textSprites.set(originalIndex, entry);
            }

            entry.sprite.text = column5Lines[lineIndex];
            entry.sprite.x = column5X;
            entry.sprite.y = config.padding + lineIndex * config.lineHeight;
            entry.sprite.visible = true;

            if (!entry.sprite.parent) {
                container.addChild(entry.sprite);
            }
        }

        // Render visible lines from column 6
        for (let lineIndex = visibleRange.start; lineIndex < visibleRange.end && lineIndex < column6Lines.length; lineIndex++) {
            const originalIndex = linesPerColumn * 5 + lineIndex;
            visibleIndices.add(originalIndex);
            const metadata = lineMetadata[originalIndex];

            let entry = textSprites.get(originalIndex);
            if (!entry) {
                const sprite = metadata?.isBookHeader ? new Text('', bookHeaderStyle) : getSprite();
                entry = { sprite, column: 5, lineIndex, originalIndex };
                textSprites.set(originalIndex, entry);
            }

            entry.sprite.text = column6Lines[lineIndex];
            entry.sprite.x = column6X;
            entry.sprite.y = config.padding + lineIndex * config.lineHeight;
            entry.sprite.visible = true;

            if (!entry.sprite.parent) {
                container.addChild(entry.sprite);
            }
        }
        
        // Render book backgrounds after text
        renderBookBackgrounds();

        // Remove sprites that are no longer visible
        for (const [index, entry] of textSprites.entries()) {
            if (!visibleIndices.has(index)) {
                returnSprite(entry.sprite);
                textSprites.delete(index);
            }
        }
    }
    
    // Render book backgrounds for visible sections
    function renderBookBackgrounds() {
        bookBackgroundGraphics.clear();
        const visibleRange = getVisibleLineRange();
        const columnWidth = config.lineWidth * config.charWidth;
        const totalWidth = columnWidth * 6 + config.columnGap * 5;
        const column1X = config.padding;
        
        // Track current book section
        let currentBookStart = visibleRange.start;
        let currentBookIndex = lineMetadata[visibleRange.start]?.bookIndex ?? 0;
        
        // Draw backgrounds for visible book sections
        for (let i = visibleRange.start; i <= visibleRange.end && i < lines.length; i++) {
            const metadata = lineMetadata[i];
            if (!metadata) continue;
            
            // New book section detected
            if (metadata.bookIndex !== currentBookIndex || metadata.isBookHeader) {
                // Draw background for previous book section
                if (i > currentBookStart) {
                    const startY = config.padding + currentBookStart * config.lineHeight;
                    const height = (i - currentBookStart) * config.lineHeight;
                    const color = lineMetadata[currentBookStart]?.bookColor ?? 0x1a1a1a;
                    
                    bookBackgroundGraphics.beginFill(color, 0.2);
                    bookBackgroundGraphics.drawRect(column1X - 5, startY, totalWidth + 10, height);
                    bookBackgroundGraphics.endFill();
                    
                    // Draw border between books
                    if (metadata.isBookHeader && i > visibleRange.start) {
                        bookBackgroundGraphics.lineStyle(2, 0x4a9eff, 0.6);
                        bookBackgroundGraphics.moveTo(column1X - 5, startY);
                        bookBackgroundGraphics.lineTo(column1X + totalWidth + 5, startY);
                        bookBackgroundGraphics.lineStyle(0);
                    }
                }
                
                currentBookStart = i;
                currentBookIndex = metadata.bookIndex;
            }
        }
        
        // Draw background for last visible section
        if (visibleRange.end > currentBookStart) {
            const startY = config.padding + currentBookStart * config.lineHeight;
            const endY = config.padding + Math.min(visibleRange.end, lines.length) * config.lineHeight;
            const height = endY - startY;
            const color = lineMetadata[currentBookStart]?.bookColor ?? 0x1a1a1a;
            
            bookBackgroundGraphics.beginFill(color, 0.2);
            bookBackgroundGraphics.drawRect(column1X - 5, startY, totalWidth + 10, height);
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

        // Create clickable highlights for visible matches
        searchMatches.forEach((match, matchIndex) => {
            const { lineIndex, startChar, endChar, lineText } = match;
            
            // Find the text sprite for this line (only if it's currently rendered)
            const textEntry = textSprites.get(lineIndex);
            if (!textEntry || !textEntry.sprite.visible) return;
            
            visibleMatchIndices.add(matchIndex);
            
            const textSprite = textEntry.sprite;

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
        });
        
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
        
        // Determine which column this line is in (6 columns)
        let columnIndex = 0;
        let columnLineIndex = lineIndex;
        if (lineIndex >= linesPerColumn * 5) {
            columnIndex = 5;
            columnLineIndex = lineIndex - linesPerColumn * 5;
        } else if (lineIndex >= linesPerColumn * 4) {
            columnIndex = 4;
            columnLineIndex = lineIndex - linesPerColumn * 4;
        } else if (lineIndex >= linesPerColumn * 3) {
            columnIndex = 3;
            columnLineIndex = lineIndex - linesPerColumn * 3;
        } else if (lineIndex >= linesPerColumn * 2) {
            columnIndex = 2;
            columnLineIndex = lineIndex - linesPerColumn * 2;
        } else if (lineIndex >= linesPerColumn) {
            columnIndex = 1;
            columnLineIndex = lineIndex - linesPerColumn;
        }
        
        // Calculate position of the match in world coordinates
        const columnWidth = config.lineWidth * config.charWidth;
        const column1X = config.padding;
        const column2X = column1X + columnWidth + config.columnGap;
        const column3X = column2X + columnWidth + config.columnGap;
        const column4X = column3X + columnWidth + config.columnGap;
        const column5X = column4X + columnWidth + config.columnGap;
        const column6X = column5X + columnWidth + config.columnGap;
        const columnXPositions = [column1X, column2X, column3X, column4X, column5X, column6X];
        
        const beforeMatch = lineText.substring(0, startChar);
        const beforeWidth = beforeMatch.length * config.charWidth;
        
        // World coordinates of the match (before zoom/transform)
        const matchWorldX = columnXPositions[columnIndex] + beforeWidth;
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
        searchResultCount = 0;
        currentMatchIndex = -1; // Reset match index when searching

        if (!term || term.length === 0 || term.length < 2) {
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
        
        // Determine which column this line is in (6 columns)
        let columnIndex = 0;
        let columnLineIndex = lineIndex;
        if (lineIndex >= linesPerColumn * 5) {
            columnIndex = 5;
            columnLineIndex = lineIndex - linesPerColumn * 5;
        } else if (lineIndex >= linesPerColumn * 4) {
            columnIndex = 4;
            columnLineIndex = lineIndex - linesPerColumn * 4;
        } else if (lineIndex >= linesPerColumn * 3) {
            columnIndex = 3;
            columnLineIndex = lineIndex - linesPerColumn * 3;
        } else if (lineIndex >= linesPerColumn * 2) {
            columnIndex = 2;
            columnLineIndex = lineIndex - linesPerColumn * 2;
        } else if (lineIndex >= linesPerColumn) {
            columnIndex = 1;
            columnLineIndex = lineIndex - linesPerColumn;
        }
        
        // Calculate position of the match in world coordinates
        const columnWidth = config.lineWidth * config.charWidth;
        const column1X = config.padding;
        const column2X = column1X + columnWidth + config.columnGap;
        const column3X = column2X + columnWidth + config.columnGap;
        const column4X = column3X + columnWidth + config.columnGap;
        const column5X = column4X + columnWidth + config.columnGap;
        const column6X = column5X + columnWidth + config.columnGap;
        const columnXPositions = [column1X, column2X, column3X, column4X, column5X, column6X];
        
        const beforeMatch = lineText.substring(0, startChar);
        const beforeWidth = beforeMatch.length * config.charWidth;
        
        // World coordinates of the match (before zoom/transform)
        const matchWorldX = columnXPositions[columnIndex] + beforeWidth;
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
        return jumpToMatch(currentMatchIndex);
    }

    // Initial render with viewport culling - show content immediately
    renderVisibleText();
    console.log('Text rendering optimized with viewport culling');
    
    // Force immediate render to show content right away
    app.renderer.render(app.stage);

    // Calculate total dimensions (two columns side by side)
    const columnWidth = config.lineWidth * config.charWidth;
    const totalWidth = columnWidth * 6 + config.columnGap * 5 + config.padding * 2;
    const totalHeight = Math.max(column1Lines.length, column2Lines.length, column3Lines.length, column4Lines.length, column5Lines.length, column6Lines.length) * config.lineHeight + config.padding * 2;
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
    let lastViewportHash = '';
    let frameCount = 0;
    
    function updateTransform() {
        container.scale.set(zoom);
        container.x = offsetX;
        container.y = offsetY;
        
        // Throttle viewport updates - only update every few frames and when viewport changes
        frameCount++;
        const viewportHash = `${Math.floor(offsetX / 50)}_${Math.floor(offsetY / 50)}_${zoom.toFixed(2)}`;
        
        if (viewportHash !== lastViewportHash && frameCount % 2 === 0) {
            lastViewportHash = viewportHash;
            renderVisibleText();
            if (searchMatches.length > 0) {
                updateHighlights();
            }
        }
    }

    app.ticker.add(updateTransform);

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
    };
}

