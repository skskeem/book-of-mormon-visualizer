/**
 * Manages search input and result display
 */
export class SearchControls {
    constructor(visualization) {
        this.visualization = visualization;
        this.searchInput = document.getElementById('search-input');
        this.searchResults = document.getElementById('search-results');
        this.nextMatchBtn = document.getElementById('next-match');
        this.searchTerm = '';

        this.setupEventListeners();
    }

    setupEventListeners() {
        // Search input
        this.searchInput.addEventListener('input', (e) => {
            this.handleSearchInput(e.target.value.trim());
        });

        // Next match button
        this.nextMatchBtn.addEventListener('click', () => {
            this.handleNextMatch();
        });
    }

    handleSearchInput(term) {
        this.searchTerm = term;

        if (!this.visualization) return;

        // Only search if at least 2 characters have been entered
        if (this.searchTerm.length >= 2) {
            this.visualization.search(this.searchTerm);
            this.updateSearchResults();
        } else {
            // Clear search if less than 2 characters
            this.visualization.search('');
            this.searchResults.textContent = this.searchTerm.length > 0 
                ? 'Enter at least 2 characters to search' 
                : '';
            this.nextMatchBtn.disabled = true;
        }
    }

    updateSearchResults() {
        const count = this.visualization.getSearchResultCount();
        if (count > 0) {
            const currentIndex = this.visualization.getCurrentMatchIndex();
            if (currentIndex >= 0) {
                this.searchResults.textContent = `Match ${currentIndex + 1} of ${count}`;
            } else {
                this.searchResults.textContent = `Found ${count} match${count !== 1 ? 'es' : ''}`;
            }
        } else {
            this.searchResults.textContent = 'No matches found';
        }
        this.nextMatchBtn.disabled = count === 0;
    }

    handleNextMatch() {
        if (this.visualization) {
            const success = this.visualization.jumpToNextMatch();
            if (success) {
                this.updateSearchResults();
            }
        }
    }

    clear() {
        this.searchInput.value = '';
        this.searchTerm = '';
        this.searchResults.textContent = '';
        this.nextMatchBtn.disabled = true;
        if (this.visualization) {
            this.visualization.search('');
        }
    }

    setVisualization(visualization) {
        this.visualization = visualization;
    }
}
