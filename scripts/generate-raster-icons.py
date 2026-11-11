import os
import fitz  # PyMuPDF
from PIL import Image

def render_svg_to_png(svg_path, out_png_path, size):
    doc = fitz.open(svg_path)
    page = doc[0]
    scale = size / page.rect.width
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=True)
    pix.save(out_png_path)
    print(f"Generated {out_png_path} ({size}x{size})")

def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    public_dir = os.path.join(root, 'public')
    assets_dir = os.path.join(public_dir, 'assets')
    icon_svg = os.path.join(assets_dir, 'preplens-icon.svg')
    maskable_svg = os.path.join(public_dir, 'icon-maskable.svg')

    # Standard PWA and App Icons (Circular Badge with pure white fill)
    render_svg_to_png(icon_svg, os.path.join(public_dir, 'icon-512.png'), 512)
    render_svg_to_png(icon_svg, os.path.join(public_dir, 'icon-192.png'), 192)
    render_svg_to_png(icon_svg, os.path.join(public_dir, 'apple-touch-icon.png'), 192)
    render_svg_to_png(icon_svg, os.path.join(assets_dir, 'preplens-icon.png'), 512)
    render_svg_to_png(icon_svg, os.path.join(assets_dir, 'preplens-full-logo.png'), 512)
    render_svg_to_png(icon_svg, os.path.join(assets_dir, 'preplens-full-logo-transparent.png'), 512)

    # Maskable PWA Icons (Solid white viewport background)
    render_svg_to_png(maskable_svg, os.path.join(public_dir, 'icon-maskable-512.png'), 512)
    render_svg_to_png(maskable_svg, os.path.join(public_dir, 'icon-maskable-192.png'), 192)

    # Favicon.ico (Multi-size standard ICO format)
    ico_path = os.path.join(public_dir, 'favicon.ico')
    img_512 = Image.open(os.path.join(public_dir, 'icon-512.png'))
    img_512.save(
        ico_path,
        format='ICO',
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    )
    print(f"Generated {ico_path} (multi-size ICO)")

if __name__ == '__main__':
    main()
