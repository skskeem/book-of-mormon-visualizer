/**
 * Manages search input and result display
 */
export class SearchControls {
    constructor(visualization) {
        this.visualization = visualization;
        this.searchInput = document.getElementById('search-input');
        this.searchResults = document.getElementById('search-results');
        this.nextMatchBtn = document.getElementById('next-match');
        this.semanticToggle = document.getElementById('semantic-toggle');
        this.semanticStatus = document.getElementById('semantic-status');
        this.semanticThresholdContainer = document.getElementById('semantic-threshold-container');
        this.semanticThreshold = document.getElementById('semantic-threshold');
        this.searchTerm = '';
        this.semanticSearchTimer = null;

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

        if (this.semanticToggle) {
            this.semanticToggle.addEventListener('change', () => {
                this.handleSemanticToggle();
            });
        }

        if (this.semanticThreshold) {
            this.semanticThreshold.addEventListener('input', () => {
                if (this.isSemanticEnabled() && this.searchTerm.length >= 2) {
                    this.handleSemanticSearchInput();
                }
            });
        }
    }

    handleSearchInput(term) {
        this.searchTerm = term;

        if (!this.visualization) return;

        if (this.isSemanticEnabled()) {
            this.handleSemanticSearchInput();
            return;
        }

        // Only search if at least 2 characters have been entered
        if (this.searchTerm.length >= 2) {
            this.visualization.search(this.searchTerm);
            this.updateSearchResults();
        } else {
            // Clear search if less than 2 characters
            this.visualization.clearSearch();
            this.searchResults.textContent = this.searchTerm.length > 0
                ? 'Enter at least 2 characters to search'
                : '';
            this.nextMatchBtn.disabled = true;
        }
    }

    updateSearchResults() {
        if (this.isSemanticEnabled()) {
            const count = this.visualization.getSemanticResultCount();
            if (count > 0) {
                const scores = this.visualization.getSemanticScores();
                const currentMatchIndex = this.visualization.getCurrentMatchIndex();
                
                if (scores.length > 0) {
                    // Show score range
                    const sortedScores = scores.map(s => s.score).sort((a, b) => b - a);
                    const maxScore = sortedScores[0];
                    const minScore = sortedScores[sortedScores.length - 1];
                    const avgScore = sortedScores.reduce((a, b) => a + b, 0) / sortedScores.length;
                    
                    // Try to get current match score
                    let currentScoreText = '';
                    if (currentMatchIndex >= 0) {
                        const match = this.visualization.getSearchManager()?.getMatch(currentMatchIndex);
                        if (match) {
                            // Try to get score from match object first, then from verseIndex
                            let score = match.score;
                            if (score === undefined && match.verseIndex !== undefined) {
                                score = this.visualization.getSemanticScoreForVerse(match.verseIndex);
                            }
                            if (score !== null && score !== undefined) {
                                const matchNum = this.visualization.getSemanticResultCount() > 0 
                                    ? this.visualization.getCurrentSemanticMatchIndex() + 1 
                                    : currentMatchIndex + 1;
                                currentScoreText = `<div style="font-size: 11px; color: #4a9eff; margin-top: 2px;">Match ${matchNum}: ${score.toFixed(3)}</div>`;
                            }
                        }
                    }
                    
                    this.searchResults.innerHTML = `
                        <div>Top ${count} semantic match${count !== 1 ? 'es' : ''}</div>
                        <div style="font-size: 11px; color: #888; margin-top: 4px;">
                            Scores: ${maxScore.toFixed(3)} (max) / ${avgScore.toFixed(3)} (avg) / ${minScore.toFixed(3)} (min)
                        </div>
                        ${currentScoreText}
                    `;
                } else {
                    this.searchResults.textContent = `Top ${count} semantic match${count !== 1 ? 'es' : ''}`;
                }
            } else {
                this.searchResults.textContent = 'No semantic matches found';
            }
            this.nextMatchBtn.disabled = count === 0;
            return;
        }

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
            const success = this.isSemanticEnabled()
                ? this.visualization.jumpToNextSemanticMatch()
                : this.visualization.jumpToNextMatch();
            if (success) {
                this.updateSearchResults();
            }
        }
    }

    handleSemanticToggle() {
        this.updateSemanticAvailability();
        this.visualization?.clearSearch();
        this.searchResults.textContent = this.searchTerm.length > 0
            ? 'Enter at least 2 characters to search'
            : '';
        this.nextMatchBtn.disabled = true;
        if (this.isSemanticEnabled() && this.searchTerm.length >= 2) {
            this.handleSemanticSearchInput();
        }
        this.updateSemanticStatus();
        
        // Show/hide threshold input
        if (this.semanticThresholdContainer) {
            this.semanticThresholdContainer.style.display = this.isSemanticEnabled() ? 'block' : 'none';
        }
    }

    handleSemanticSearchInput() {
        if (this.semanticSearchTimer) {
            clearTimeout(this.semanticSearchTimer);
        }

        if (this.searchTerm.length < 2) {
            this.visualization?.clearSearch();
            this.searchResults.textContent = this.searchTerm.length > 0
                ? 'Enter at least 2 characters to search'
                : '';
            this.nextMatchBtn.disabled = true;
            this.updateSemanticStatus();
            return;
        }

        this.searchResults.textContent = 'Searching...';
        this.nextMatchBtn.disabled = true;

        this.semanticSearchTimer = setTimeout(async () => {
            const thresholdValue = this.semanticThreshold?.value;
            const minScore = thresholdValue && thresholdValue !== '' ? parseFloat(thresholdValue) : null;
            const result = await this.visualization.searchSemantic(this.searchTerm, 50, minScore);
            if (result?.status && result.status !== 'ready') {
                this.searchResults.textContent = result.message || 'Semantic search unavailable';
                this.nextMatchBtn.disabled = true;
                this.updateSemanticStatus();
                return;
            }
            this.updateSemanticStatus();
            this.updateSearchResults();
        }, 300);
    }

    clear() {
        this.searchInput.value = '';
        this.searchTerm = '';
        this.searchResults.textContent = '';
        this.nextMatchBtn.disabled = true;
        if (this.semanticSearchTimer) {
            clearTimeout(this.semanticSearchTimer);
        }
        if (this.visualization) {
            this.visualization.clearSearch();
        }
        this.updateSemanticStatus();
    }

    setVisualization(visualization) {
        this.visualization = visualization;
        this.updateSemanticAvailability();
        this.updateSemanticStatus();
    }

    isSemanticEnabled() {
        return !!this.semanticToggle?.checked;
    }

    updateSemanticAvailability() {
        if (!this.semanticToggle || !this.visualization) return;
        const supported = this.visualization.isSemanticSearchSupported();
        this.semanticToggle.disabled = !supported;
        if (!supported) {
            this.semanticToggle.checked = false;
            this.semanticStatus.textContent = 'Semantic search is only available in All Books view.';
            if (this.semanticThresholdContainer) {
                this.semanticThresholdContainer.style.display = 'none';
            }
        } else {
            // Show/hide threshold based on toggle state
            if (this.semanticThresholdContainer) {
                this.semanticThresholdContainer.style.display = this.isSemanticEnabled() ? 'block' : 'none';
            }
        }
    }

    updateSemanticStatus() {
        if (!this.semanticStatus || !this.visualization) return;
        if (!this.isSemanticEnabled()) {
            this.semanticStatus.textContent = '';
            return;
        }
        const status = this.visualization.getSemanticStatus();
        if (status?.message) {
            this.semanticStatus.textContent = status.message;
        }
    }
}
