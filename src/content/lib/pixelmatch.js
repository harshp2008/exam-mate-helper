/**
 * pixelmatch.js — Vendored from https://github.com/mapbox/pixelmatch
 * Modified to work as a global function for Chrome Extension content scripts.
 */

function pixelmatch(img1, img2, output, width, height, options = {}) {
    const {
        threshold = 0.1,
        includeAA = false,
        alpha = 0.1,
        aaColor = [255, 255, 0],
        diffColor = [255, 0, 0],
        diffColorAlt,
        diffMask = false
    } = options;

    if (!isPixelData(img1) || !isPixelData(img2) || (output && !isPixelData(output)))
        throw new Error('Image data: Uint8Array, Uint8ClampedArray or Buffer expected.');

    if (img1.length !== img2.length || (output && output.length !== img1.length))
        throw new Error('Image sizes do not match.');

    if (img1.length !== width * height * 4) 
        throw new Error('Image data size does not match width/height.');

    // check if images are identical
    const len = width * height;
    const a32 = new Uint32Array(img1.buffer, img1.byteOffset, len);
    const b32 = new Uint32Array(img2.buffer, img2.byteOffset, len);
    let identical = true;

    for (let i = 0; i < len; i++) {
        if (a32[i] !== b32[i]) { identical = false; break; }
    }
    if (identical) { // fast path if identical
        if (output && !diffMask) {
            for (let i = 0; i < len; i++) drawGrayPixel(img1, 4 * i, alpha, output);
        }
        return 0;
    }

    // maximum acceptable square distance between two colors;
    // 35215 is the maximum possible value for the YIQ difference metric
    const maxDelta = 35215 * threshold * threshold;
    const [aaR, aaG, aaB] = aaColor;
    const [diffR, diffG, diffB] = diffColor;
    const [altR, altG, altB] = diffColorAlt || diffColor;
    let diff = 0;

    // compare each pixel of one image against the other one
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {

            const i = y * width + x;
            const pos = i * 4;

            // squared YUV distance between colors at this pixel position, negative if the img2 pixel is darker
            const delta = a32[i] === b32[i] ? 0 : colorDelta(img1, img2, pos, pos, false);

            // the color difference is above the threshold
            if (Math.abs(delta) > maxDelta) {
                // check it's a real rendering difference or just anti-aliasing
                const isExcludedAA = !includeAA && (antialiased(img1, x, y, width, height, a32, b32) || antialiased(img2, x, y, width, height, b32, a32));
                if (isExcludedAA) {
                    // one of the pixels is anti-aliasing; draw as yellow and do not count as difference
                    if (output && !diffMask) drawPixel(output, pos, aaR, aaG, aaB);
                } else {
                    // found substantial difference not caused by anti-aliasing; draw it as such
                    if (output) {
                        if (delta < 0) {
                            drawPixel(output, pos, altR, altG, altB);
                        } else {
                            drawPixel(output, pos, diffR, diffG, diffB);
                        }
                    }
                    diff++;
                }
            } else if (output && !diffMask) {
                // pixels are similar; draw background as grayscale image blended with white
                drawGrayPixel(img1, pos, alpha, output);
            }
        }
    }

    // return the number of different pixels
    return diff;
}

function isPixelData(arr) {
    return ArrayBuffer.isView(arr) && arr.BYTES_PER_ELEMENT === 1;
}

function antialiased(img, x1, y1, width, height, a32, b32) {
    const x0 = Math.max(x1 - 1, 0);
    const y0 = Math.max(y1 - 1, 0);
    const x2 = Math.min(x1 + 1, width - 1);
    const y2 = Math.min(y1 + 1, height - 1);
    const pos = y1 * width + x1;
    let zeroes = x1 === x0 || x1 === x2 || y1 === y0 || y1 === y2 ? 1 : 0;
    let min = 0;
    let max = 0;
    let minX = 0;
    let minY = 0;
    let maxX = 0;
    let maxY = 0;

    for (let x = x0; x <= x2; x++) {
        for (let y = y0; y <= y2; y++) {
            if (x === x1 && y === y1) continue;
            const delta = colorDelta(img, img, pos * 4, (y * width + x) * 4, true);
            if (delta === 0) {
                zeroes++;
                if (zeroes > 2) return false;
            } else if (delta < min) {
                min = delta;
                minX = x;
                minY = y;
            } else if (delta > max) {
                max = delta;
                maxX = x;
                maxY = y;
            }
        }
    }

    if (min === 0 || max === 0) return false;

    return (hasManySiblings(a32, minX, minY, width, height) && hasManySiblings(b32, minX, minY, width, height)) ||
           (hasManySiblings(a32, maxX, maxY, width, height) && hasManySiblings(b32, maxX, maxY, width, height));
}

function hasManySiblings(img, x1, y1, width, height) {
    const x0 = Math.max(x1 - 1, 0);
    const y0 = Math.max(y1 - 1, 0);
    const x2 = Math.min(x1 + 1, width - 1);
    const y2 = Math.min(y1 + 1, height - 1);
    const val = img[y1 * width + x1];
    let zeroes = x1 === x0 || x1 === x2 || y1 === y0 || y1 === y2 ? 1 : 0;

    for (let x = x0; x <= x2; x++) {
        for (let y = y0; y <= y2; y++) {
            if (x === x1 && y === y1) continue;
            if (val === img[y * width + x]) zeroes++;
            if (zeroes > 2) return true;
        }
    }
    return false;
}

function colorDelta(img1, img2, k, m, yOnly) {
    const r1 = img1[k];
    const g1 = img1[k + 1];
    const b1 = img1[k + 2];
    const a1 = img1[k + 3];
    const r2 = img2[m];
    const g2 = img2[m + 1];
    const b2 = img2[m + 2];
    const a2 = img2[m + 3];

    let dr = r1 - r2;
    let dg = g1 - g2;
    let db = b1 - b2;
    const da = a1 - a2;

    if (!dr && !dg && !db && !da) return 0;

    if (a1 < 255 || a2 < 255) {
        const rb = 48 + 159 * (k % 2);
        const gb = 48 + 159 * ((k / 1.618033988749895 | 0) % 2);
        const bb = 48 + 159 * ((k / 2.618033988749895 | 0) % 2);
        dr = (r1 * a1 - r2 * a2 - rb * da) / 255;
        dg = (g1 * a1 - g2 * a2 - gb * da) / 255;
        db = (b1 * a1 - b2 * a2 - bb * da) / 255;
    }

    const y = dr * 0.29889531 + dg * 0.58662247 + db * 0.11448223;
    if (yOnly) return y;

    const i = dr * 0.59597799 - dg * 0.27417610 - db * 0.32180189;
    const q = dr * 0.21147017 - dg * 0.52261711 + db * 0.31114694;
    const delta = 0.5053 * y * y + 0.299 * i * i + 0.1957 * q * q;

    return y > 0 ? -delta : delta;
}

function drawPixel(output, pos, r, g, b) {
    output[pos + 0] = r;
    output[pos + 1] = g;
    output[pos + 2] = b;
    output[pos + 3] = 255;
}

function drawGrayPixel(img, i, alpha, output) {
    const val = 255 + (img[i] * 0.29889531 + img[i + 1] * 0.58662247 + img[i + 2] * 0.11448223 - 255) * alpha * img[i + 3] / 255;
    drawPixel(output, i, val, val, val);
}
export default pixelmatch;
