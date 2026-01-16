import { Container, Text, Graphics } from 'pixi.js';

export function createVisualization(text, app) {
    const container = new Container();
    app.stage.addChild(container);

    // Configuration
    const config = {
        fontSize: 10,
        lineHeight: 14,
        charWidth: 6,
        padding: 10,
        highlightColor: 0xffff00,
        textColor: 0xffffff,
        backgroundColor: 0x1a1a1a,
        columns: 3, // Number of columns for better layout
    };

    let zoom = 1;
    let offsetX = 0;
    let offsetY = 0;
    let searchMatches = [];
    let searchResultCount = 0;
    let initialZoom = 1;

    // Split text into words for better layout
    const words = text.split(/\s+/);
    const lines = [];
    
    // Calculate optimal line width for multi-column layout
    const columnWidth = Math.floor((app.screen.width - config.padding * (config.columns + 1)) / config.columns);
    const maxCharsPerLine = Math.floor(columnWidth / config.charWidth);
    const linesPerColumn = Math.ceil(words.length / (maxCharsPerLine * 10)); // Rough estimate

    // Create lines of text
    let currentLine = '';
    for (const word of words) {
        if ((currentLine + ' ' + word).length > maxCharsPerLine && currentLine.length > 0) {
            lines.push(currentLine);
            currentLine = word;
        } else {
            currentLine = currentLine ? currentLine + ' ' + word : word;
        }
    }
    if (currentLine) {
        lines.push(currentLine);
    }

    // Create text sprites
    const textSprites = [];
    const highlightGraphics = new Graphics();
    container.addChild(highlightGraphics);

    function renderText() {
        // Clear existing text sprites
        textSprites.forEach(sprite => {
            if (sprite.parent) {
                sprite.parent.removeChild(sprite);
            }
        });
        textSprites.length = 0;

        // Calculate column layout
        const linesPerColumn = Math.ceil(lines.length / config.columns);
        const columnWidth = (app.screen.width - config.padding * (config.columns + 1)) / config.columns;

        // Create text sprites for each line in columns
        lines.forEach((line, lineIndex) => {
            const columnIndex = Math.floor(lineIndex / linesPerColumn);
            const lineInColumn = lineIndex % linesPerColumn;
            
            const textSprite = new Text({
                text: line,
                style: {
                    fontFamily: 'monospace',
                    fontSize: config.fontSize,
                    fill: config.textColor,
                    wordWrap: true,
                    wordWrapWidth: columnWidth - 10,
                },
            });
            
            textSprite.x = config.padding + columnIndex * (columnWidth + config.padding);
            textSprite.y = config.padding + lineInColumn * config.lineHeight;
            
            container.addChild(textSprite);
            textSprites.push(textSprite);
        });
    }

    function updateHighlights() {
        highlightGraphics.clear();
        
        if (searchMatches.length === 0) {
            return;
        }

        // Highlight matching text
        searchMatches.forEach(match => {
            const { lineIndex, startChar, endChar, lineText } = match;
            const textSprite = textSprites[lineIndex];
            
            if (!textSprite) return;

            // Calculate position of the match within the line
            const beforeMatch = lineText.substring(0, startChar);
            const matchText = lineText.substring(startChar, endChar);
            
            // Approximate character positions (monospace font)
            const beforeWidth = beforeMatch.length * config.charWidth;
            const matchWidth = matchText.length * config.charWidth;
            
            highlightGraphics.rect(
                textSprite.x + beforeWidth,
                textSprite.y,
                matchWidth,
                config.lineHeight
            );
        });

        highlightGraphics.fill(0xffff00);
        highlightGraphics.alpha = 0.3;
    }

    function performSearch(term) {
        searchMatches = [];
        searchResultCount = 0;

        if (!term || term.length === 0) {
            updateHighlights();
            return;
        }

        const searchRegex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        
        lines.forEach((line, lineIndex) => {
            let match;
            const regex = new RegExp(searchRegex.source, 'g');
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

    // Initial render
    renderText();

    // Calculate total dimensions
    const linesPerColumn = Math.ceil(lines.length / config.columns);
    const columnWidth = (app.screen.width - config.padding * (config.columns + 1)) / config.columns;
    const totalWidth = config.columns * columnWidth + config.padding * (config.columns + 1);
    const totalHeight = linesPerColumn * config.lineHeight + config.padding * 2;

    // Calculate initial zoom to fit everything
    const scaleX = app.screen.width / totalWidth;
    const scaleY = app.screen.height / totalHeight;
    initialZoom = Math.min(scaleX, scaleY) * 0.95; // 95% to leave some margin
    zoom = initialZoom;

    // Center the view initially
    offsetX = (app.screen.width - totalWidth * zoom) / 2;
    offsetY = (app.screen.height - totalHeight * zoom) / 2;
    container.x = offsetX;
    container.y = offsetY;

    // Update transform on each frame
    function updateTransform() {
        container.scale.set(zoom);
        container.x = offsetX;
        container.y = offsetY;
    }

    app.ticker.add(updateTransform);

    return {
        setZoom(newZoom) {
            zoom = newZoom;
            updateTransform();
        },

        getInitialZoom() {
            return initialZoom;
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
        },

        getSearchResultCount() {
            return searchResultCount;
        },

        handleResize() {
            // Recalculate layout on resize
            renderText();
            const scaleX = app.screen.width / totalWidth;
            const scaleY = app.screen.height / totalHeight;
            const newInitialZoom = Math.min(scaleX, scaleY) * 0.95;
            if (zoom === initialZoom) {
                zoom = newInitialZoom;
            }
            initialZoom = newInitialZoom;
            this.resetView();
        },
    };
}

