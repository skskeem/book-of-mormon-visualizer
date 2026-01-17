import { Text, Graphics, TextStyle } from 'pixi.js';
import { BOOK_DEFINITIONS } from '../loadText.js';
import { VISUALIZATION_CONFIG, HIGHLIGHT_CONFIG, BOOK_BACKGROUND_OPACITY } from '../config.js';

/**
 * Manages text sprite rendering with viewport culling
 */
export class TextRenderer {
    constructor(container, config, textStyle) {
        this.container = container;
        this.config = config;
        this.textStyle = textStyle;
        this.textSprites = new Map();
        this.spritePool = [];
        this.visibleIndicesSet = new Set();
    }

    /**
     * Gets a sprite from pool or creates a new one
     */
    getSprite() {
        if (this.spritePool.length > 0) {
            return this.spritePool.pop();
        }
        return new Text('', this.textStyle);
    }

    /**
     * Returns a sprite to the pool
     */
    returnSprite(sprite) {
        if (sprite && sprite.parent) {
            sprite.parent.removeChild(sprite);
        }
        sprite.text = '';
        sprite.visible = false;
        this.spritePool.push(sprite);
    }

    /**
     * Applies text resolution to a sprite
     */
    applyTextResolution(sprite, resolution) {
        if (sprite.resolution !== resolution) {
            sprite.resolution = resolution;
            if (typeof sprite.updateText === 'function') {
                sprite.updateText();
            }
        }
    }

    /**
     * Renders visible text sprites based on viewport
     */
    renderVisibleText(columnLines, cachedColumnXPositions, linesPerColumn, visibleRange, textResolution) {
        const visibleIndicesSet = this.visibleIndicesSet;
        visibleIndicesSet.clear();

        // Render visible lines from all columns
        for (let col = 0; col < columnLines.length; col++) {
            const colLines = columnLines[col];
            const colX = cachedColumnXPositions[col];
            const colLinesLen = colLines.length;
            const rangeEnd = visibleRange.end;

            for (let lineIndex = visibleRange.start; lineIndex < rangeEnd && lineIndex < colLinesLen; lineIndex++) {
                const originalIndex = linesPerColumn * col + lineIndex;
                visibleIndicesSet.add(originalIndex);

                let entry = this.textSprites.get(originalIndex);
                if (!entry) {
                    const sprite = this.getSprite();
                    entry = { sprite, column: col, lineIndex, originalIndex };
                    this.textSprites.set(originalIndex, entry);
                }

                const sprite = entry.sprite;
                this.applyTextResolution(sprite, textResolution);

                // Only update text if changed
                const lineText = colLines[lineIndex];
                if (sprite.text !== lineText) {
                    sprite.text = lineText;
                }
                sprite.x = colX;
                sprite.y = this.config.padding + lineIndex * this.config.lineHeight;
                sprite.visible = true;

                if (!sprite.parent) {
                    this.container.addChild(sprite);
                }
            }
        }

        // Remove sprites that are no longer visible
        for (const [index, entry] of this.textSprites.entries()) {
            if (!visibleIndicesSet.has(index)) {
                this.returnSprite(entry.sprite);
                this.textSprites.delete(index);
            }
        }

        return visibleIndicesSet;
    }

    /**
     * Gets visible text sprites (for highlight rendering)
     */
    getVisibleTextSprites() {
        return this.textSprites;
    }

    /**
     * Cleans up all sprites
     */
    destroy() {
        for (const [index, entry] of this.textSprites.entries()) {
            this.returnSprite(entry.sprite);
        }
        this.textSprites.clear();
    }
}

/**
 * Manages book background rendering
 */
export class BookBackgroundRenderer {
    constructor(container, config) {
        this.container = container;
        this.config = config;
        this.graphics = new Graphics();
        container.addChild(this.graphics);
    }

    /**
     * Renders book background bands
     */
    render(bookRegions, cachedColumnXPositions, columnWidth, zoom, visibleRange) {
        this.graphics.clear();

        if (bookRegions.length === 0) return;

        // Calculate opacity based on zoom level
        const opacity = this._calculateOpacity(zoom);
        const rangeStart = visibleRange.start;
        const rangeEnd = visibleRange.end;

        for (const region of bookRegions) {
            const { bookIndex, startLine, endLine, column } = region;

            // Skip if region is outside visible range
            if (endLine < rangeStart || startLine > rangeEnd) continue;

            // Clip to visible range
            const visibleStart = startLine > rangeStart ? startLine : rangeStart;
            const visibleEnd = endLine < rangeEnd ? endLine : rangeEnd;

            const color = BOOK_DEFINITIONS[bookIndex]?.color ?? 0x666666;
            const x = cachedColumnXPositions[column] - 2;
            const y = this.config.padding + visibleStart * this.config.lineHeight - 1;
            const width = columnWidth + 4;
            const height = (visibleEnd - visibleStart + 1) * this.config.lineHeight + 2;

            this.graphics.beginFill(color, opacity);
            this.graphics.drawRect(x, y, width, height);
            this.graphics.endFill();
        }
    }

    _calculateOpacity(zoom) {
        if (zoom < BOOK_BACKGROUND_OPACITY.veryZoomedOutThreshold) {
            return BOOK_BACKGROUND_OPACITY.veryZoomedOut;
        }
        if (zoom < BOOK_BACKGROUND_OPACITY.zoomedOutThreshold) {
            return BOOK_BACKGROUND_OPACITY.zoomedOut;
        }
        return BOOK_BACKGROUND_OPACITY.normal;
    }

    destroy() {
        if (this.graphics.parent) {
            this.graphics.parent.removeChild(this.graphics);
        }
        this.graphics.destroy();
    }
}

/**
 * Manages highlight rendering for search matches
 */
export class HighlightRenderer {
    constructor(container, config) {
        this.container = container;
        this.config = config;
        this.highlightGraphics = new Graphics();
        this.highlightSprites = new Map();
        this.visibleMatchIndices = new Set();
        container.addChild(this.highlightGraphics);
    }

    /**
     * Updates highlights based on search matches
     */
    updateHighlights(searchManager, textSprites, zoom, jumpToMatchCallback) {
        // Clear old highlight graphics
        this.highlightGraphics.clear();

        const searchMatches = searchManager.getAllMatches();
        if (searchMatches.length === 0) {
            this._removeAllHighlights();
            return;
        }

        const visibleMatchIndices = this.visibleMatchIndices;
        visibleMatchIndices.clear();
        const highlightStyle = this._getHighlightStyle(zoom);

        // Create clickable highlights for currently rendered lines only
        for (const [originalIndex, textEntry] of textSprites.entries()) {
            if (!textEntry || !textEntry.sprite.visible) continue;

            const lineMatches = searchManager.getMatchesForLine(originalIndex);
            if (!lineMatches || lineMatches.length === 0) continue;

            const textSprite = textEntry.sprite;

            for (const matchIndex of lineMatches) {
                const match = searchManager.getMatch(matchIndex);
                if (!match) continue;

                visibleMatchIndices.add(matchIndex);

                const { startChar, endChar, lineText } = match;

                // Calculate position of the match within the line
                const beforeMatch = lineText.substring(0, startChar);
                // Approximate character positions (monospace font)
                const beforeWidth = beforeMatch.length * this.config.charWidth;
                const matchWidth = (endChar - startChar) * this.config.charWidth;

                // Apply padding to make highlights larger at low zoom
                const x = textSprite.x + beforeWidth - highlightStyle.padding;
                const y = textSprite.y - highlightStyle.padding;
                const width = matchWidth + highlightStyle.padding * 2;
                const height = this.config.lineHeight + highlightStyle.padding * 2;

                // Get or create a Graphics object for this highlight
                let highlightGraphic = this.highlightSprites.get(matchIndex);
                if (!highlightGraphic) {
                    highlightGraphic = new Graphics();
                    highlightGraphic.eventMode = 'static';
                    highlightGraphic.cursor = 'pointer';
                    highlightGraphic.matchIndex = matchIndex;

                    highlightGraphic.on('pointerdown', () => {
                        if (jumpToMatchCallback) {
                            jumpToMatchCallback(matchIndex);
                        }
                    });

                    this.container.addChild(highlightGraphic);
                    this.highlightSprites.set(matchIndex, highlightGraphic);
                }

                // Update the highlight graphics
                highlightGraphic.clear();
                highlightGraphic.x = x;
                highlightGraphic.y = y;

                // Draw fill
                highlightGraphic.beginFill(highlightStyle.fillColor, highlightStyle.fillOpacity);
                highlightGraphic.drawRect(0, 0, width, height);
                highlightGraphic.endFill();

                // Draw border
                highlightGraphic.lineStyle(highlightStyle.borderWidth, highlightStyle.borderColor, 1.0);
                highlightGraphic.drawRect(0, 0, width, height);
                highlightGraphic.lineStyle(0);

                // Also draw to the main highlightGraphics for backward compatibility
                this.highlightGraphics.beginFill(highlightStyle.fillColor, highlightStyle.fillOpacity);
                this.highlightGraphics.drawRect(x, y, width, height);
                this.highlightGraphics.endFill();
                this.highlightGraphics.lineStyle(highlightStyle.borderWidth, highlightStyle.borderColor, 1.0);
                this.highlightGraphics.drawRect(x, y, width, height);
                this.highlightGraphics.lineStyle(0);
            }
        }

        // Remove highlight sprites that are no longer visible
        for (const [matchIndex, graphic] of this.highlightSprites.entries()) {
            if (!visibleMatchIndices.has(matchIndex)) {
                if (graphic.parent) {
                    graphic.parent.removeChild(graphic);
                }
                this.highlightSprites.delete(matchIndex);
            }
        }
    }

    _getHighlightStyle(zoom) {
        const isVeryZoomedOut = zoom < HIGHLIGHT_CONFIG.zoomedOut.zoomThreshold;
        
        if (isVeryZoomedOut) {
            const style = HIGHLIGHT_CONFIG.zoomedOut;
            return {
                ...style,
                borderWidth: Math.max(2, style.borderWidth / zoom),
                padding: Math.max(1, style.padding / zoom)
            };
        }
        
        return HIGHLIGHT_CONFIG.normal;
    }

    _removeAllHighlights() {
        this.highlightSprites.forEach((graphic) => {
            if (graphic.parent) {
                graphic.parent.removeChild(graphic);
            }
        });
        this.highlightSprites.clear();
    }

    destroy() {
        this._removeAllHighlights();
        if (this.highlightGraphics.parent) {
            this.highlightGraphics.parent.removeChild(this.highlightGraphics);
        }
        this.highlightGraphics.destroy();
    }
}
