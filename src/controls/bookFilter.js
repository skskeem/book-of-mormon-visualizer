import { BOOK_DEFINITIONS } from '../loadText.js';

/**
 * Manages book filter dropdown
 */
export class BookFilter {
    constructor(onFilterChange) {
        this.bookFilter = document.getElementById('book-filter');
        this.onFilterChange = onFilterChange;
        this.currentFilter = -1;

        this.initializeDropdown();
        this.setupEventListeners();
    }

    initializeDropdown() {
        // Clear existing options except "All Books"
        this.bookFilter.innerHTML = '<option value="-1">All Books</option>';

        // Add options for each book
        BOOK_DEFINITIONS.forEach((book, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = book.name;
            this.bookFilter.appendChild(option);
        });
    }

    setupEventListeners() {
        this.bookFilter.addEventListener('change', async (e) => {
            const selectedValue = parseInt(e.target.value, 10);
            this.currentFilter = selectedValue;
            
            if (this.onFilterChange) {
                await this.onFilterChange(selectedValue);
            }
        });
    }

    getCurrentFilter() {
        return this.currentFilter;
    }

    setCurrentFilter(index) {
        this.currentFilter = index;
        this.bookFilter.value = index;
    }
}
