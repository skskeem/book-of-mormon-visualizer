// Book definitions with colors - 15 books of the Book of Mormon
export const BOOK_DEFINITIONS = [
    { name: '1 Nephi', pattern: /^1 Nephi \d+:/, color: 0x3B82F6 },      // Blue
    { name: '2 Nephi', pattern: /^2 Nephi \d+:/, color: 0x8B5CF6 },      // Purple
    { name: 'Jacob', pattern: /^Jacob \d+:/, color: 0xEC4899 },          // Pink
    { name: 'Enos', pattern: /^Enos 1:/, color: 0xF97316 },              // Orange
    { name: 'Jarom', pattern: /^Jarom 1:/, color: 0xFB923C },            // Light Orange
    { name: 'Omni', pattern: /^Omni 1:/, color: 0xFBBF24 },              // Amber
    { name: 'Words of Mormon', pattern: /^Words of Mormon 1:/, color: 0xA3E635 }, // Lime
    { name: 'Mosiah', pattern: /^Mosiah \d+:/, color: 0x10B981 },        // Emerald
    { name: 'Alma', pattern: /^Alma \d+:/, color: 0xEF4444 },            // Red
    { name: 'Helaman', pattern: /^Helaman \d+:/, color: 0xF59E0B },      // Amber/Gold
    { name: '3 Nephi', pattern: /^3 Nephi \d+:/, color: 0x06B6D4 },      // Cyan
    { name: '4 Nephi', pattern: /^4 Nephi 1:/, color: 0x84CC16 },        // Lime Green
    { name: 'Mormon', pattern: /^Mormon \d+:/, color: 0x6366F1 },        // Indigo
    { name: 'Ether', pattern: /^Ether \d+:/, color: 0x14B8A6 },          // Teal
    { name: 'Moroni', pattern: /^Moroni \d+:/, color: 0xA855F7 },        // Violet
];

// Pattern to match verse references at the start of a line
// Matches: "1 Nephi 1:1", "Alma 32:21", "Words of Mormon 1:5", etc.
const VERSE_PATTERN = /^(1 Nephi|2 Nephi|3 Nephi|4 Nephi|Jacob|Enos|Jarom|Omni|Words of Mormon|Mosiah|Alma|Helaman|Mormon|Ether|Moroni) (\d+):(\d+)/;

// Pattern to match lines we should skip (chapter headers, book headers, etc.)
const SKIP_LINE_PATTERN = /^(1 Nephi|2 Nephi|3 Nephi|4 Nephi|Jacob|Enos|Jarom|Omni|Words of Mormon|Mosiah|Alma|Helaman|Mormon|Ether|Moroni)( \d+)?$|^Chapter \d+$/;

/**
 * Intelligently trim verse prefix to reduce redundancy:
 * - First verse of a book: Show full "Book Chapter:Verse"
 * - First verse of a new chapter: Show "Chapter:Verse"
 * - Subsequent verses in same chapter: Show just "Verse"
 */
function trimVersePrefix(verseText, ref, lastBook, lastChapter) {
    if (!ref) return { text: verseText, newLastBook: lastBook, newLastChapter: lastChapter };
    
    const fullPrefix = `${ref.book} ${ref.chapter}:${ref.verse}`;
    const chapterPrefix = `${ref.chapter}:${ref.verse}`;
    const verseOnly = ref.verse;
    
    // Remove the original full prefix from the text
    let textWithoutPrefix = verseText.replace(VERSE_PATTERN, '').trim();
    
    // Also remove duplicate verse number at the start of the text content
    // The source often has "Book Chapter:Verse Verse Text..." so we get "Verse Text..." after stripping
    const duplicateVersePattern = new RegExp(`^${ref.verse}\\s+`);
    textWithoutPrefix = textWithoutPrefix.replace(duplicateVersePattern, '');
    
    let newPrefix;
    let newLastBook = ref.book;
    let newLastChapter = ref.chapter;
    
    if (ref.book !== lastBook) {
        // New book - show full reference
        newPrefix = fullPrefix;
    } else if (ref.chapter !== lastChapter) {
        // Same book, new chapter - show chapter:verse
        newPrefix = chapterPrefix;
    } else {
        // Same book and chapter - just show verse number
        newPrefix = verseOnly;
    }
    
    return {
        text: `${newPrefix} ${textWithoutPrefix}`,
        newLastBook,
        newLastChapter
    };
}

// Load and parse the Book of Mormon text file
// filterBookIndex: if >= 0, only load verses from that specific book
export async function loadBookOfMormon(filterBookIndex = -1) {
    try {
        const response = await fetch('/bom.txt');
        const text = await response.text();
        
        // Optimized single-pass parsing
        const lines = text.split('\n');
        let foundStart = false;
        const verses = [];  // Each element is a complete verse
        const bookMarkers = []; // Track where each book starts { bookIndex, lineIndex }
        
        let currentBook = -1;
        let currentVerse = '';
        let currentVerseRef = null; // { book, chapter, verse }
        let shouldIncludeVerse = filterBookIndex < 0; // If no filter, include all
        
        // Track last displayed reference for smart trimming
        let lastDisplayedBook = '';
        let lastDisplayedChapter = '';
        
        // Single pass: find start, join lines into verses, track books
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Find start marker
            if (!foundStart && line === 'THE BOOK OF MORMON') {
                foundStart = true;
                continue;
            }
            
            // Only process after start is found
            if (foundStart && line.length > 0) {
                // Check if this line starts a new verse
                const verseMatch = line.match(VERSE_PATTERN);
                if (verseMatch) {
                    // Save the previous verse if it exists and matches filter
                    if (currentVerse.length > 0 && shouldIncludeVerse) {
                        // Apply smart prefix trimming
                        const trimmedVerse = trimVersePrefix(currentVerse, currentVerseRef, lastDisplayedBook, lastDisplayedChapter);
                        verses.push(trimmedVerse.text);
                        lastDisplayedBook = trimmedVerse.newLastBook;
                        lastDisplayedChapter = trimmedVerse.newLastChapter;
                        
                        // Check if the NEW verse is a chapter change - add blank line and chapter header
                        const isChapterChange = currentVerseRef && 
                            (verseMatch[1] !== currentVerseRef.book || verseMatch[2] !== currentVerseRef.chapter);
                        
                        if (isChapterChange) {
                            // Add a blank line to visually separate chapters
                            verses.push('');
                            // Add chapter header line
                            verses.push(`Chapter ${verseMatch[2]}`);
                        }
                    }
                    
                    // Parse the verse reference
                    currentVerseRef = {
                        book: verseMatch[1],
                        chapter: verseMatch[2],
                        verse: verseMatch[3]
                    };
                    
                    // Check if this verse starts a new book
                    for (let bookIdx = 0; bookIdx < BOOK_DEFINITIONS.length; bookIdx++) {
                        if (BOOK_DEFINITIONS[bookIdx].pattern.test(line)) {
                            if (bookIdx !== currentBook) {
                                currentBook = bookIdx;
                                // Update whether we should include verses
                                shouldIncludeVerse = filterBookIndex < 0 || bookIdx === filterBookIndex;
                                
                                // Reset display tracking for new book filter
                                if (filterBookIndex >= 0 && bookIdx === filterBookIndex) {
                                    lastDisplayedBook = '';
                                    lastDisplayedChapter = '';
                                }
                                
                                if (shouldIncludeVerse) {
                                    bookMarkers.push({
                                        bookIndex: bookIdx,
                                        lineIndex: verses.length  // Will be the index of this new verse
                                    });
                                }
                            }
                            break;
                        }
                    }
                    
                    // Start a new verse
                    currentVerse = line;
                } else if (currentVerse.length > 0 && !SKIP_LINE_PATTERN.test(line)) {
                    // Only continue if we're already in a verse and this isn't a header line
                    currentVerse += ' ' + line;
                }
            }
        }
        
        // Don't forget the last verse
        if (currentVerse.length > 0 && shouldIncludeVerse && currentVerseRef) {
            const trimmedVerse = trimVersePrefix(currentVerse, currentVerseRef, lastDisplayedBook, lastDisplayedChapter);
            verses.push(trimmedVerse.text);
        }
        
        console.log(`Parsed ${verses.length} verses${filterBookIndex >= 0 ? ` (filtered to ${BOOK_DEFINITIONS[filterBookIndex]?.name})` : ''}`);
        
        return {
            text: verses.join('\n'),
            bookMarkers: bookMarkers
        };
    } catch (error) {
        console.error('Error loading Book of Mormon text:', error);
        // Fallback to a sample text if file can't be loaded
        return {
            text: 'Error loading text. Please ensure bom.txt is in the public directory.',
            bookMarkers: []
        };
    }
}

