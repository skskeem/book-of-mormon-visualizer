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
        this.semanticResultsContainer = document.getElementById('semantic-results-container');
        this.semanticResultsStatus = document.getElementById('semantic-results-status');
        this.semanticResultsList = document.getElementById('semantic-results-list');
        this.crossRefContainer = document.getElementById('crossref-container');
        this.crossRefStatus = document.getElementById('crossref-status');
        this.crossRefList = document.getElementById('crossref-list');
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

        if (this.crossRefList) {
            this.crossRefList.addEventListener('click', (event) => {
                const target = event.target.closest('[data-verse-index]');
                if (!target || !this.visualization) return;
                const verseIndex = Number(target.getAttribute('data-verse-index'));
                if (Number.isFinite(verseIndex)) {
                    this.visualization.jumpToVerse(verseIndex);
                }
            });
        }

        if (this.semanticResultsList) {
            this.semanticResultsList.addEventListener('click', (event) => {
                const target = event.target.closest('[data-verse-index]');
                if (!target || !this.visualization) return;
                const verseIndex = Number(target.getAttribute('data-verse-index'));
                if (Number.isFinite(verseIndex)) {
                    this.visualization.jumpToVerse(verseIndex);
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
                        <div>Showing ${count} semantic match${count !== 1 ? 'es' : ''}</div>
                        <div style="font-size: 11px; color: #888; margin-top: 4px;">
                            Scores: ${maxScore.toFixed(3)} (max) / ${avgScore.toFixed(3)} (avg) / ${minScore.toFixed(3)} (min)
                        </div>
                        ${currentScoreText}
                    `;
                } else {
                    this.searchResults.textContent = `Showing ${count} semantic match${count !== 1 ? 'es' : ''}`;
                }
            } else {
                this.searchResults.textContent = 'No semantic matches found';
            }
            this.nextMatchBtn.disabled = count === 0;
            this.updateSemanticResultsList();
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
        this.updateCrossRefs();
        this.updateCrossRefs();
        this.updateSemanticResultsList();
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
        this.updateCrossRefs();
        this.updateSemanticResultsList();
        
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
            const result = await this.visualization.searchSemantic(this.searchTerm, null, minScore);
            if (result?.status && result.status !== 'ready') {
                this.searchResults.textContent = result.message || 'Semantic search unavailable';
                this.nextMatchBtn.disabled = true;
                this.updateSemanticStatus();
                this.updateCrossRefs();
                this.updateSemanticResultsList();
                return;
            }
            this.updateSemanticStatus();
            this.updateSearchResults();
            this.updateSemanticResultsList();
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
        this.clearCrossRefs();
        this.clearSemanticResults();
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

    clearCrossRefs() {
        if (this.crossRefStatus) {
            this.crossRefStatus.textContent = '';
        }
        if (this.crossRefList) {
            this.crossRefList.innerHTML = '';
        }
    }

    clearSemanticResults() {
        if (this.semanticResultsStatus) {
            this.semanticResultsStatus.textContent = '';
        }
        if (this.semanticResultsList) {
            this.semanticResultsList.innerHTML = '';
        }
    }

    updateSemanticResultsList() {
        if (!this.semanticResultsContainer || !this.visualization) return;

        if (!this.isSemanticEnabled()) {
            this.clearSemanticResults();
            return;
        }

        const scores = this.visualization.getSemanticScores();
        if (!scores || scores.length === 0) {
            this.clearSemanticResults();
            if (this.semanticResultsStatus) {
                this.semanticResultsStatus.textContent = 'No semantic results yet.';
            }
            return;
        }

        const sorted = scores
            .slice()
            .sort((a, b) => b.score - a.score);

        if (this.semanticResultsStatus) {
            this.semanticResultsStatus.textContent = `Showing ${sorted.length} semantic result${sorted.length !== 1 ? 's' : ''}`;
        }

        if (this.semanticResultsList) {
            this.semanticResultsList.innerHTML = sorted.map((entry) => {
                const verseInfo = this.visualization.getVerseInfo(entry.verseIndex);
                const safeText = verseInfo.text ? verseInfo.text.replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
                return `
                    <div class="semantic-result-item" data-verse-index="${entry.verseIndex}">
                        <div>
                            <span class="semantic-result-ref">${verseInfo.reference}</span>
                            <span class="semantic-result-score">${entry.score.toFixed(3)}</span>
                        </div>
                        <div class="semantic-result-text">${safeText}</div>
                    </div>
                `;
            }).join('');
        }
    }

    async updateCrossRefs() {
        if (!this.visualization || !this.crossRefContainer) return;

        const totalMatches = this.isSemanticEnabled()
            ? this.visualization.getSemanticResultCount()
            : this.visualization.getSearchResultCount();

        if (totalMatches === 0) {
            this.clearCrossRefs();
            if (this.crossRefStatus) {
                this.crossRefStatus.textContent = 'Run a search to see cross-references.';
            }
            return;
        }

        const currentMatchIndex = this.visualization.getCurrentMatchIndex();
        const matchIndex = currentMatchIndex >= 0 ? currentMatchIndex : 0;
        const thresholdValue = this.semanticThreshold?.value;
        const minScore = thresholdValue && thresholdValue !== '' ? parseFloat(thresholdValue) : 0.25;

        if (this.crossRefStatus) {
            this.crossRefStatus.textContent = 'Finding related verses...';
        }

        const result = await this.visualization.getAutoCrossRefsForMatch(matchIndex, minScore, 10);
        if (!result || result.status !== 'ready') {
            if (this.crossRefStatus) {
                this.crossRefStatus.textContent = result?.message || 'Cross-references unavailable.';
            }
            if (this.crossRefList) {
                this.crossRefList.innerHTML = '';
            }
            return;
        }

        const refs = result.refs || [];
        if (this.crossRefStatus) {
            this.crossRefStatus.textContent = refs.length > 0
                ? `Top ${refs.length} related verses`
                : 'No cross-references above threshold.';
        }

        if (this.crossRefList) {
            if (refs.length === 0) {
                this.crossRefList.innerHTML = '';
                return;
            }

            this.crossRefList.innerHTML = refs.map((ref) => {
                const safeText = ref.text ? ref.text.replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
                return `
                    <div class="crossref-item" data-verse-index="${ref.verseIndex}">
                        <div>
                            <span class="crossref-ref">${ref.reference}</span>
                            <span class="crossref-score">${ref.score.toFixed(3)}</span>
                        </div>
                        <div class="crossref-text">${safeText}</div>
                    </div>
                `;
            }).join('');
        }
    }
}
