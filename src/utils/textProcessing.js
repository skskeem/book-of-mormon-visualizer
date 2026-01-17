import { VISUALIZATION_CONFIG } from '../config.js';

/**
 * Wraps verses into lines that fit within the specified column width
 * @param {string[]} verses - Array of verse strings
 * @param {number} lineWidth - Maximum characters per line
 * @param {Function} progressCallback - Optional callback for progress updates
 * @returns {{lines: string[], verseStartLines: number[]}} - Wrapped lines and verse start indices
 */
export async function wrapVerses(verses, lineWidth, progressCallback = null) {
    const lines = [];
    const verseStartLines = [];
    const versesLength = verses.length;
    const wordSplitRegex = VISUALIZATION_CONFIG.wordSplitRegex;
    const batchSize = VISUALIZATION_CONFIG.batchSize;

    for (let batchStart = 0; batchStart < versesLength; batchStart += batchSize) {
        const batchEnd = Math.min(batchStart + batchSize, versesLength);

        for (let v = batchStart; v < batchEnd; v++) {
            const verse = verses[v];

            // Always record the start line for this verse index (even if empty)
            verseStartLines.push(lines.length);

            if (verse.length === 0) continue;

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

    return { lines, verseStartLines };
}

/**
 * Calculates column layout based on number of lines
 * @param {number} totalLines - Total number of lines to display
 * @param {boolean} isSingleBookView - Whether viewing a single book
 * @returns {{numColumns: number, linesPerColumn: number, columnLines: string[][]}}
 */
export function calculateColumnLayout(lines, isSingleBookView) {
    const config = VISUALIZATION_CONFIG;
    const minLinesPerColumn = isSingleBookView 
        ? config.minLinesPerColumn.singleBook 
        : config.minLinesPerColumn.multiBook;
    const maxColumns = isSingleBookView 
        ? config.maxColumns.singleBook 
        : config.maxColumns.multiBook;

    const neededColumns = Math.ceil(lines.length / minLinesPerColumn);
    const numColumns = Math.min(Math.max(1, neededColumns), maxColumns);
    const linesPerColumn = Math.ceil(lines.length / numColumns);

    const columnLines = [];
    for (let i = 0; i < numColumns; i++) {
        columnLines.push(lines.slice(linesPerColumn * i, linesPerColumn * (i + 1)));
    }

    return { numColumns, linesPerColumn, columnLines };
}

/**
 * Maps lines to books based on book markers
 * @param {number} totalLines - Total number of lines
 * @param {Array} bookMarkers - Array of {bookIndex, lineIndex} where lineIndex is verse index
 * @param {number[]} verseStartLines - Maps verse index to first wrapped line index
 * @returns {number[]} - Array mapping line index to book index
 */
export function mapLinesToBooks(totalLines, bookMarkers, verseStartLines) {
    const lineToBook = new Array(totalLines).fill(0);
    
    if (bookMarkers.length === 0) {
        return lineToBook;
    }

    // Convert verse-based book markers to line-based
    const lineBasedMarkers = bookMarkers.map(marker => ({
        bookIndex: marker.bookIndex,
        lineIndex: verseStartLines[marker.lineIndex] ?? 0
    }));

    let markerIdx = 0;
    let currentBookIndex = lineBasedMarkers[0]?.bookIndex ?? 0;

    for (let i = 0; i < totalLines; i++) {
        // Check if we've reached the next book marker
        while (markerIdx < lineBasedMarkers.length && i >= lineBasedMarkers[markerIdx].lineIndex) {
            currentBookIndex = lineBasedMarkers[markerIdx].bookIndex;
            markerIdx++;
        }
        lineToBook[i] = currentBookIndex;
    }

    return lineToBook;
}

/**
 * Calculates book regions (contiguous ranges of lines for each book in each column)
 * @param {string[][]} columnLines - Lines organized by column
 * @param {number[]} lineToBook - Maps line index to book index
 * @param {number} linesPerColumn - Number of lines per column
 * @returns {Array} - Array of {bookIndex, startLine, endLine, column}
 */
export function calculateBookRegions(columnLines, lineToBook, linesPerColumn) {
    const bookRegions = [];
    const numColumns = columnLines.length;

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

    return bookRegions;
}
