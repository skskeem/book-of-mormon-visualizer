/**
 * Manages the loading indicator display
 */
export class LoadingIndicator {
    constructor() {
        this.element = null;
        this.textElement = null;
        this.create();
    }

    create() {
        this.element = document.createElement('div');
        this.element.id = 'loading-indicator';
        this.element.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 30px 50px;
            border-radius: 8px;
            z-index: 10000;
            font-size: 18px;
            text-align: center;
            min-width: 200px;
        `;

        this.textElement = document.createElement('div');
        this.textElement.id = 'loading-text';
        this.textElement.textContent = 'Loading text...';
        this.element.appendChild(this.textElement);

        document.body.appendChild(this.element);
    }

    show() {
        if (this.element) {
            this.element.style.display = 'block';
        }
    }

    hide() {
        if (this.element) {
            this.element.style.display = 'none';
        }
    }

    updateText(text) {
        if (this.textElement) {
            this.textElement.textContent = text;
        }
    }

    destroy() {
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        this.element = null;
        this.textElement = null;
    }
}
