#!/usr/bin/env python3
"""Generate placeholder PNG icons for the Chrome extension."""
import struct, zlib, os

def make_png(size, color=(24, 95, 165)):
    """Create a minimal valid PNG of given size with a solid color."""
    def chunk(name, data):
        c = zlib.crc32(name + data) & 0xffffffff
        return struct.pack('>I', len(data)) + name + data + struct.pack('>I', c)

    signature = b'\x89PNG\r\n\x1a\n'
    ihdr_data = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    ihdr = chunk(b'IHDR', ihdr_data)

    raw_rows = []
    for _ in range(size):
        row = b'\x00'
        for _ in range(size):
            row += bytes(color)
        raw_rows.append(row)

    raw_data = b''.join(raw_rows)
    compressed = zlib.compress(raw_data)
    idat = chunk(b'IDAT', compressed)
    iend = chunk(b'IEND', b'')

    return signature + ihdr + idat + iend

os.makedirs('icons', exist_ok=True)
for sz in [16, 48, 128]:
    with open(f'icons/icon{sz}.png', 'wb') as f:
        f.write(make_png(sz))
    print(f'Created icons/icon{sz}.png')

print('Icons generated.')
