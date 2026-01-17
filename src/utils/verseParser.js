import { BOOK_DEFINITIONS } from '../bookDefinitions.js';

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

/**
 * Parse raw Book of Mormon text into display-ready verses and metadata.
 * @param {string} rawText - Full raw Book of Mormon text
 * @param {number} filterBookIndex - If >= 0, only include that book
 * @returns {{verses: string[], verseMeta: Array, bookMarkers: Array}}
 */
export function parseBookOfMormonText(rawText, filterBookIndex = -1) {
    const lines = rawText.split('\n');
    let foundStart = false;
    const verses = [];
    const verseMeta = [];
    const bookMarkers = [];

    let currentBook = -1;
    let currentVerse = '';
    let currentVerseRef = null; // { book, chapter, verse }
    let shouldIncludeVerse = filterBookIndex < 0;

    // Track last displayed reference for smart trimming
    let lastDisplayedBook = '';
    let lastDisplayedChapter = '';

    const pushVerse = (text, meta) => {
        verses.push(text);
        verseMeta.push(meta);
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (!foundStart && line === 'THE BOOK OF MORMON') {
            foundStart = true;
            continue;
        }

        if (foundStart && line.length > 0) {
            const verseMatch = line.match(VERSE_PATTERN);
            if (verseMatch) {
                if (currentVerse.length > 0 && shouldIncludeVerse) {
                    const trimmedVerse = trimVersePrefix(
                        currentVerse,
                        currentVerseRef,
                        lastDisplayedBook,
                        lastDisplayedChapter
                    );
                    pushVerse(trimmedVerse.text, {
                        kind: 'verse',
                        book: currentVerseRef.book,
                        chapter: currentVerseRef.chapter,
                        verse: currentVerseRef.verse
                    });
                    lastDisplayedBook = trimmedVerse.newLastBook;
                    lastDisplayedChapter = trimmedVerse.newLastChapter;

                    const isChapterChange = currentVerseRef &&
                        (verseMatch[1] !== currentVerseRef.book || verseMatch[2] !== currentVerseRef.chapter);

                    if (isChapterChange) {
                        pushVerse('', { kind: 'blank' });
                        pushVerse(`Chapter ${verseMatch[2]}`, {
                            kind: 'chapter',
                            book: verseMatch[1],
                            chapter: verseMatch[2]
                        });
                    }
                }

                currentVerseRef = {
                    book: verseMatch[1],
                    chapter: verseMatch[2],
                    verse: verseMatch[3]
                };

                for (let bookIdx = 0; bookIdx < BOOK_DEFINITIONS.length; bookIdx++) {
                    if (BOOK_DEFINITIONS[bookIdx].pattern.test(line)) {
                        if (bookIdx !== currentBook) {
                            currentBook = bookIdx;
                            shouldIncludeVerse = filterBookIndex < 0 || bookIdx === filterBookIndex;

                            if (filterBookIndex >= 0 && bookIdx === filterBookIndex) {
                                lastDisplayedBook = '';
                                lastDisplayedChapter = '';
                            }

                            if (shouldIncludeVerse) {
                                bookMarkers.push({
                                    bookIndex: bookIdx,
                                    lineIndex: verses.length
                                });
                            }
                        }
                        break;
                    }
                }

                currentVerse = line;
            } else if (currentVerse.length > 0 && !SKIP_LINE_PATTERN.test(line)) {
                currentVerse += ' ' + line;
            }
        }
    }

    if (currentVerse.length > 0 && shouldIncludeVerse && currentVerseRef) {
        const trimmedVerse = trimVersePrefix(currentVerse, currentVerseRef, lastDisplayedBook, lastDisplayedChapter);
        pushVerse(trimmedVerse.text, {
            kind: 'verse',
            book: currentVerseRef.book,
            chapter: currentVerseRef.chapter,
            verse: currentVerseRef.verse
        });
    }

    return { verses, verseMeta, bookMarkers };
}
