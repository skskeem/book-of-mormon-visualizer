import { Container, Text, Graphics } from 'pixi.js';

export function createVisualization(text, app) {
    const container = new Container();
    app.stage.addChild(container);

    // Configuration
    const config = {
        fontSize: 12,
        lineHeight: 18,
        charWidth: 7,
        padding: 20,
        highlightColor: 0xffff00,
        textColor: 0xffffff,
        backgroundColor: 0x1a1a1a,
    };

    let zoom = 1;
    let offsetX = 0;
    let offsetY = 0;
    let searchMatches = [];
    let searchResultCount = 0;

    // Split text into words for better layout
    const words = text.split(/\s+/);
    const lines = [];
    let currentLine = '';
    const maxCharsPerLine = Math.floor((window.innerWidth - config.padding * 2) / config.charWidth);

    // Create lines of text
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

        // Create text sprites for each line
        lines.forEach((line, lineIndex) => {
            const textSprite = new Text({
                text: line,
                style: {
                    fontFamily: 'monospace',
                    fontSize: config.fontSize,
                    fill: config.textColor,
                },
            });
            
            textSprite.x = config.padding;
            textSprite.y = config.padding + lineIndex * config.lineHeight;
            
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
    const totalWidth = Math.max(...lines.map(line => line.length * config.charWidth)) + config.padding * 2;
    const totalHeight = lines.length * config.lineHeight + config.padding * 2;

    // Center the view initially
    offsetX = (app.screen.width - totalWidth) / 2;
    offsetY = (app.screen.height - totalHeight) / 2;
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
            // Optionally adjust layout on resize
            this.resetView();
        },
    };
}

