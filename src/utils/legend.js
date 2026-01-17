import { BOOK_DEFINITIONS } from '../loadText.js';

/**
 * Generates and manages the book legend
 */
export class BookLegend {
    constructor() {
        this.legendContainer = document.getElementById('book-legend');
        this.generateLegend();
    }

    generateLegend() {
        // Find the h3 element or create it
        let titleElement = this.legendContainer.querySelector('h3');
        if (!titleElement) {
            titleElement = document.createElement('h3');
            titleElement.textContent = '📖 Books';
            this.legendContainer.insertBefore(titleElement, this.legendContainer.firstChild);
        }

        // Clear existing legend items (but keep the title)
        const existingItems = this.legendContainer.querySelectorAll('.legend-item');
        existingItems.forEach(item => item.remove());

        // Generate legend items for each book
        BOOK_DEFINITIONS.forEach((book) => {
            const item = document.createElement('div');
            item.className = 'legend-item';

            const colorBox = document.createElement('div');
            colorBox.className = 'legend-color';
            colorBox.style.background = `#${book.color.toString(16).padStart(6, '0').toUpperCase()}`;

            const label = document.createTextNode(book.name);

            item.appendChild(colorBox);
            item.appendChild(label);
            this.legendContainer.appendChild(item);
        });
    }

    updateVisibility(filterBookIndex) {
        const legendItems = this.legendContainer.querySelectorAll('.legend-item');
        legendItems.forEach((item, index) => {
            if (filterBookIndex < 0) {
                // Show all legend items
                item.style.display = 'flex';
            } else {
                // Only show the selected book's legend item
                item.style.display = index === filterBookIndex ? 'flex' : 'none';
            }
        });
    }
}
