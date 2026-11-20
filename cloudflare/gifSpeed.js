/**
 * Pure-JS binary GIF87a/GIF89a header dimension reader and lossless frame-delay speed scaler.
 */

export function readGifDimensionsFromBytes(bytes) {
  if (!bytes || bytes.length < 10) return null;
  const sig = String.fromCharCode(
    bytes[0],
    bytes[1],
    bytes[2],
    bytes[3],
    bytes[4],
    bytes[5],
  );
  if (sig !== 'GIF87a' && sig !== 'GIF89a') return null;
  const width = bytes[6] | (bytes[7] << 8);
  const height = bytes[8] | (bytes[9] << 8);
  if (width < 1 || height < 1 || width > 20000 || height > 20000) return null;
  return { width, height };
}

export function scaleGifBytesSpeed(rawBytes, playbackSpeed) {
  try {
    if (!rawBytes || rawBytes.length < 14) return null;
    const sig = String.fromCharCode(
      rawBytes[0],
      rawBytes[1],
      rawBytes[2],
      rawBytes[3],
      rawBytes[4],
      rawBytes[5],
    );
    if (sig !== 'GIF87a' && sig !== 'GIF89a') return null;
    const out = new Uint8Array(rawBytes);
    let pos = 10;
    const lsdPacked = out[pos];
    pos += 3;
    if (lsdPacked & 0x80) {
      pos += 3 * (1 << ((lsdPacked & 0x07) + 1));
    }

    const skipSubBlocks = () => {
      while (pos < out.length) {
        const len = out[pos++];
        if (len === 0) break;
        pos += len;
      }
    };

    let patchedFrames = 0;
    while (pos < out.length) {
      const intro = out[pos++];
      if (intro === 0x3b) break;
      if (intro === 0x21) {
        if (pos >= out.length) break;
        const label = out[pos++];
        if (label === 0xf9 && pos + 5 < out.length && out[pos] === 0x04) {
          const delayPos = pos + 2;
          const origDelay = out[delayPos] | (out[delayPos + 1] << 8);
          const effectiveOrig = origDelay > 0 ? origDelay : 10;
          const scaled = Math.max(2, Math.min(65535, Math.round(effectiveOrig / playbackSpeed)));
          out[delayPos] = scaled & 0xff;
          out[delayPos + 1] = (scaled >> 8) & 0xff;
          patchedFrames += 1;
          pos += 6;
        } else {
          skipSubBlocks();
        }
      } else if (intro === 0x2c) {
        if (pos + 9 >= out.length) break;
        const imgPacked = out[pos + 8];
        pos += 9;
        if (imgPacked & 0x80) {
          pos += 3 * (1 << ((imgPacked & 0x07) + 1));
        }
        pos += 1;
        skipSubBlocks();
      } else {
        break;
      }
    }

    return patchedFrames > 0 ? out : null;
  } catch {
    return null;
  }
}
