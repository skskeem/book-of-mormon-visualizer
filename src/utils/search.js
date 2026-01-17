/**
 * Search functionality for finding text matches in lines
 */
export class SearchManager {
    constructor() {
        this.searchMatches = [];
        this.matchesByLine = new Map();
        this.searchResultCount = 0;
        this.currentMatchIndex = -1;
    }

    /**
     * Performs a search across all lines
     * @param {string[]} lines - Lines to search
     * @param {string} term - Search term
     * @returns {number} - Number of matches found
     */
    performSearch(lines, term) {
        this.searchMatches = [];
        this.matchesByLine.clear();
        this.searchResultCount = 0;
        this.currentMatchIndex = -1;

        if (!term || term.length < 3) {
            return 0;
        }

        const searchRegex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');

        lines.forEach((line, lineIndex) => {
            let match;
            searchRegex.lastIndex = 0;
            while ((match = searchRegex.exec(line)) !== null) {
                this.searchMatches.push({
                    lineIndex,
                    startChar: match.index,
                    endChar: match.index + match[0].length,
                    lineText: line,
                });
                this.searchResultCount++;

                const matchIndex = this.searchMatches.length - 1;
                let lineMatches = this.matchesByLine.get(lineIndex);
                if (!lineMatches) {
                    lineMatches = [];
                    this.matchesByLine.set(lineIndex, lineMatches);
                }
                lineMatches.push(matchIndex);
            }
        });

        return this.searchResultCount;
    }

    /**
     * Sets matches directly (used for semantic search results)
     * @param {Array} matches - Array of match objects
     */
    setMatches(matches) {
        this.searchMatches = matches;
        this.matchesByLine.clear();
        this.searchResultCount = matches.length;
        this.currentMatchIndex = -1;

        matches.forEach((match, matchIndex) => {
            let lineMatches = this.matchesByLine.get(match.lineIndex);
            if (!lineMatches) {
                lineMatches = [];
                this.matchesByLine.set(match.lineIndex, lineMatches);
            }
            lineMatches.push(matchIndex);
        });
    }

    /**
     * Gets matches for a specific line
     * @param {number} lineIndex - Line index
     * @returns {number[]} - Array of match indices
     */
    getMatchesForLine(lineIndex) {
        return this.matchesByLine.get(lineIndex) || [];
    }

    /**
     * Gets a match by index
     * @param {number} matchIndex - Match index
     * @returns {Object|null} - Match object or null
     */
    getMatch(matchIndex) {
        return this.searchMatches[matchIndex] || null;
    }

    /**
     * Gets all matches
     * @returns {Array} - Array of all matches
     */
    getAllMatches() {
        return this.searchMatches;
    }

    /**
     * Gets total number of matches
     * @returns {number}
     */
    getResultCount() {
        return this.searchResultCount;
    }

    /**
     * Gets current match index
     * @returns {number}
     */
    getCurrentMatchIndex() {
        return this.currentMatchIndex;
    }

    /**
     * Sets current match index
     * @param {number} index
     */
    setCurrentMatchIndex(index) {
        this.currentMatchIndex = index;
    }

    /**
     * Moves to next match, wrapping around
     * @returns {number} - New match index
     */
    moveToNextMatch() {
        if (this.searchMatches.length === 0) {
            return -1;
        }
        this.currentMatchIndex = (this.currentMatchIndex + 1) % this.searchMatches.length;
        return this.currentMatchIndex;
    }

    /**
     * Clears all search results
     */
    clear() {
        this.searchMatches = [];
        this.matchesByLine.clear();
        this.searchResultCount = 0;
        this.currentMatchIndex = -1;
    }
}
