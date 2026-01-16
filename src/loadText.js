// Load and parse the Book of Mormon text file
export async function loadBookOfMormon() {
    try {
        const response = await fetch('/bom.txt');
        const text = await response.text();
        
        // Optimized single-pass parsing
        const lines = text.split('\n');
        let startIndex = 0;
        let foundStart = false;
        const cleanedLines = [];
        
        // Single pass: find start and clean in one loop
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Find start marker
            if (!foundStart && line === 'THE BOOK OF MORMON') {
                startIndex = i + 1;
                foundStart = true;
                continue;
            }
            
            // Only process after start is found
            if (foundStart && line.length > 0 && !line.startsWith('***') && !line.startsWith('[')) {
                cleanedLines.push(line);
            }
        }
        
        return cleanedLines.join('\n');
    } catch (error) {
        console.error('Error loading Book of Mormon text:', error);
        // Fallback to a sample text if file can't be loaded
        return 'Error loading text. Please ensure bom.txt is in the public directory.';
    }
}

