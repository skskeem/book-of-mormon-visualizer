// Configuration constants for the visualization

export const VISUALIZATION_CONFIG = {
    fontSize: 9,
    lineHeight: 11,
    charWidth: 5.4,
    padding: 20,
    columnGap: {
        singleBook: 20,
        multiBook: 40
    },
    lineWidth: {
        singleBook: 90,
        multiBook: 180
    },
    highlightColor: 0xffff00,
    textColor: 0xffffff,
    backgroundColor: 0x1a1a1a,
    minLinesPerColumn: {
        singleBook: 225,
        multiBook: 300
    },
    maxColumns: {
        singleBook: 16,
        multiBook: 8
    },
    maxTextResolution: 3,
    minVisibleZoom: 0.02,
    scrollPadding: 50,
    batchSize: 500,
    wordSplitRegex: /\s+/
};

export const ZOOM_CONFIG = {
    min: 0.01,
    max: 10,
    step: 1.5,
    clickZoomMultiplier: 5,
    clickZoomMin: 1.0,
    clickZoomMax: 3.0
};

export const HIGHLIGHT_CONFIG = {
    normal: {
        fillColor: 0xffeb3b,
        fillOpacity: 0.75,
        borderColor: 0xffc107,
        borderWidth: 1.5,
        padding: 0
    },
    zoomedOut: {
        fillColor: 0xff6b00,
        fillOpacity: 0.85,
        borderColor: 0xffff00,
        borderWidth: 3,
        padding: 2,
        zoomThreshold: 0.2
    }
};

export const BOOK_BACKGROUND_OPACITY = {
    veryZoomedOut: 0.35,
    zoomedOut: 0.25,
    normal: 0.15,
    veryZoomedOutThreshold: 0.1,
    zoomedOutThreshold: 0.3
};
