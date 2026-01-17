# Book of Mormon Visualizer

An interactive WebGL-based visualization of the entire Book of Mormon text using PixiJS. Zoom out to see the entire text at once, search for specific terms, and navigate with mouse controls.

## Features

- **Full Text Display**: View the entire Book of Mormon text in a single canvas
- **Zoom Controls**: Zoom in/out with buttons, mouse wheel, or programmatically
- **Search & Highlight**: Search for any text and see all matches highlighted
- **Pan & Navigate**: Click and drag to pan around the visualization
- **Responsive**: Adapts to window resizing

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open your browser to the URL shown in the terminal (typically `http://localhost:5173`)

### Building for Production

```bash
npm run build
```

The built files will be in the `dist/` directory.

## Usage

- **Search**: Type in the search box to find and highlight matching text
- **Zoom In/Out**: Use the buttons or mouse wheel to zoom
- **Pan**: Click and drag to move around the canvas
- **Reset**: Click the "Reset" button to return to the default view

### Semantic Search (Vector Embeddings)

This project supports semantic search using a local embedding model. To enable it:

1. Generate embeddings (one-time):
```bash
npm run generate-embeddings
```
This writes `public/embeddings.json`.

2. Start the app and toggle **Semantic search** in the UI.

Notes:
- Semantic search is only available in the **All Books** view.
- The first semantic query loads the model and may take a moment.

## Technology Stack

- **PixiJS**: WebGL rendering engine
- **Vite**: Build tool and dev server
- **Vanilla JavaScript**: No framework dependencies

## Project Structure

```
book-of-mormon-visualizer/
├── public/
│   └── bom.txt          # Book of Mormon text file
├── src/
│   ├── main.js          # Application entry point
│   ├── loadText.js      # Text loading and parsing
│   └── visualization.js # PixiJS visualization logic
├── index.html           # Main HTML file
├── package.json         # Dependencies and scripts
└── README.md           # This file
```

## License

This project uses the Project Gutenberg edition of the Book of Mormon, which is in the public domain.

