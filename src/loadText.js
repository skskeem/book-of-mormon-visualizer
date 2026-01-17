import { BOOK_DEFINITIONS } from './bookDefinitions.js';
import { parseBookOfMormonText } from './utils/verseParser.js';

// Load and parse the Book of Mormon text file
// filterBookIndex: if >= 0, only load verses from that specific book
export async function loadBookOfMormon(filterBookIndex = -1) {
    try {
        const response = await fetch('/bom.txt');
        const text = await response.text();

        const { verses, verseMeta, bookMarkers } = parseBookOfMormonText(text, filterBookIndex);

        console.log(
            `Parsed ${verses.length} verses${filterBookIndex >= 0 ? ` (filtered to ${BOOK_DEFINITIONS[filterBookIndex]?.name})` : ''}`
        );

        return {
            text: verses.join('\n'),
            verses,
            verseMeta,
            bookMarkers
        };
    } catch (error) {
        console.error('Error loading Book of Mormon text:', error);
        // Fallback to a sample text if file can't be loaded
        return {
            text: 'Error loading text. Please ensure bom.txt is in the public directory.',
            verses: ['Error loading text. Please ensure bom.txt is in the public directory.'],
            verseMeta: [{ kind: 'verse' }],
            bookMarkers: []
        };
    }
}

