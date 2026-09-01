import zlib
import struct
import os

def create_png(width, height, output_path):
    # RGBA pixel buffer
    raw_data = bytearray()
    
    # Create smooth radial / linear gradient from blue (#3b82f6) to purple (#8b5cf6)
    # with a central sparkling star
    c1 = (59, 130, 246)  # #3b82f6
    c2 = (139, 92, 246)  # #8b5cf6
    
    cx, cy = width / 2.0, height / 2.0
    r_max = width / 2.0
    
    for y in range(height):
        raw_data.append(0)  # Filter type: None
        for x in range(width):
            # Normalized position
            t = (x + y) / float(width + height)
            r = int(c1[0] * (1 - t) + c2[0] * t)
            g = int(c1[1] * (1 - t) + c2[1] * t)
            b = int(c1[2] * (1 - t) + c2[2] * t)
            a = 255
            
            # Rounded corner mask
            dx = abs(x - cx + 0.5)
            dy = abs(y - cy + 0.5)
            corner_r = width * 0.2
            corner_dist_x = max(0.0, dx - (cx - corner_r))
            corner_dist_y = max(0.0, dy - (cy - corner_r))
            corner_dist = (corner_dist_x**2 + corner_dist_y**2)**0.5
            if corner_dist > corner_r:
                a = 0
            
            # Sparkle star in center
            dist_center = ((x - cx)**2 + (y - cy)**2)**0.5
            axis_dist = min(abs(x - cx), abs(y - cy))
            if dist_center < width * 0.35 and axis_dist < width * 0.08 and a > 0:
                # White sparkle
                r, g, b = 255, 255, 255
            elif dist_center < width * 0.15 and a > 0:
                r, g, b = 255, 255, 255

            raw_data.extend([r, g, b, a])

    def png_chunk(chunk_type, data):
        return (
            struct.pack(">I", len(data)) +
            chunk_type +
            data +
            struct.pack(">I", zlib.crc32(chunk_type + data) & 0xFFFFFFFF)
        )

    # PNG Signature
    png = b"\x89PNG\r\n\x1a\n"
    # IHDR
    ihdr_data = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    png += png_chunk(b"IHDR", ihdr_data)
    # IDAT
    compressed = zlib.compress(bytes(raw_data), 9)
    png += png_chunk(b"IDAT", compressed)
    # IEND
    png += png_chunk(b"IEND", b"")

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "wb") as f:
        f.write(png)
    print(f"Generated {output_path} ({width}x{height})")

if __name__ == "__main__":
    out_dir = os.path.abspath("extension/icons")
    create_png(16, 16, os.path.join(out_dir, "icon16.png"))
    create_png(48, 48, os.path.join(out_dir, "icon48.png"))
    create_png(128, 128, os.path.join(out_dir, "icon128.png"))
