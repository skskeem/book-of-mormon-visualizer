// Load and parse the Book of Mormon text file
export async function loadBookOfMormon() {
    try {
        const response = await fetch('/bom.txt');
        const text = await response.text();
        
        // Parse the text - skip Project Gutenberg header
        // The actual text starts around line 263 with "THE BOOK OF MORMON"
        const lines = text.split('\n');
        
        // Find where the actual content starts (after Project Gutenberg header)
        let startIndex = 0;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim() === 'THE BOOK OF MORMON') {
                startIndex = i + 1;
                break;
            }
        }
        
        // Extract the actual text content
        const contentLines = lines.slice(startIndex);
        
        // Clean up the text - remove empty lines and normalize
        const cleanedLines = contentLines
            .map(line => line.trim())
            .filter(line => line.length > 0 && !line.startsWith('***') && !line.startsWith('['));
        
        return cleanedLines.join('\n');
    } catch (error) {
        console.error('Error loading Book of Mormon text:', error);
        // Fallback to a sample text if file can't be loaded
        return 'Error loading text. Please ensure bom.txt is in the public directory.';
    }
}

