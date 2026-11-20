import os
import fitz  # PyMuPDF
from PIL import Image, ImageDraw

def render_svg_to_image(svg_path, size):
    doc = fitz.open(svg_path)
    page = doc[0]
    scale = size / page.rect.width
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=True)
    img = Image.frombytes("RGBA", [pix.width, pix.height], pix.samples)
    return img

def create_adaptive_foreground(emblem_img, canvas_size):
    # Adaptive icon: 108dp canvas, ~66% safe zone centered (72dp)
    fg = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    emblem_size = int(canvas_size * 0.62)
    resized_emblem = emblem_img.resize((emblem_size, emblem_size), Image.Resampling.LANCZOS)
    offset = ((canvas_size - emblem_size) // 2, (canvas_size - emblem_size) // 2)
    fg.paste(resized_emblem, offset, resized_emblem)
    return fg

def create_legacy_icon(emblem_img, size, round_icon=False):
    icon = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(icon)
    if round_icon:
        draw.ellipse([(0, 0), (size - 1, size - 1)], fill=(255, 255, 255, 255))
    else:
        # Rounded rectangle
        corner_r = int(size * 0.22)
        draw.rounded_rectangle([(0, 0), (size - 1, size - 1)], radius=corner_r, fill=(255, 255, 255, 255))
    
    # Emblem inside
    emblem_size = int(size * 0.72)
    resized_emblem = emblem_img.resize((emblem_size, emblem_size), Image.Resampling.LANCZOS)
    offset = ((size - emblem_size) // 2, (size - emblem_size) // 2)
    icon.paste(resized_emblem, offset, resized_emblem)
    return icon

def create_splash_screen(emblem_img, width, height):
    # Clean background matching app theme (#e5e9f0 or pure white #ffffff)
    splash = Image.new("RGBA", (width, height), (229, 233, 240, 255))  # #e5e9f0
    
    # Scale emblem appropriately (around 22-28% of shortest dimension, max 240px)
    short_dim = min(width, height)
    emblem_size = min(int(short_dim * 0.32), 240)
    resized_emblem = emblem_img.resize((emblem_size, emblem_size), Image.Resampling.LANCZOS)
    
    offset_x = (width - emblem_size) // 2
    offset_y = (height - emblem_size) // 2
    splash.paste(resized_emblem, (offset_x, offset_y), resized_emblem)
    return splash.convert("RGB")

def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    svg_path = os.path.join(root, 'public', 'assets', 'elevate-icon.svg')
    res_dir = os.path.join(root, 'android', 'app', 'src', 'main', 'res')
    
    # High-resolution emblem render (1024x1024)
    base_emblem = render_svg_to_image(svg_path, 1024)
    print("Rendered base Elevate vector emblem (1024x1024)")
    
    # Mipmap densities and sizes
    # (density, launcher_size, foreground_size)
    densities = [
        ('mdpi', 48, 108),
        ('hdpi', 72, 162),
        ('xhdpi', 96, 216),
        ('xxhdpi', 144, 324),
        ('xxxhdpi', 192, 432),
    ]
    
    for density, l_size, fg_size in densities:
        d_dir = os.path.join(res_dir, f'mipmap-{density}')
        os.makedirs(d_dir, exist_ok=True)
        
        # 1. Adaptive foreground
        fg = create_adaptive_foreground(base_emblem, fg_size)
        fg.save(os.path.join(d_dir, 'ic_launcher_foreground.png'), 'PNG')
        
        # 2. Legacy launcher icon
        icon = create_legacy_icon(base_emblem, l_size, round_icon=False)
        icon.save(os.path.join(d_dir, 'ic_launcher.png'), 'PNG')
        
        # 3. Round launcher icon
        round_icon = create_legacy_icon(base_emblem, l_size, round_icon=True)
        round_icon.save(os.path.join(d_dir, 'ic_launcher_round.png'), 'PNG')
        
        print(f"Generated {density} icons (launcher: {l_size}px, fg: {fg_size}px)")
        
    # Splash screens
    splash_targets = [
        ('drawable', 480, 320),
        ('drawable-land-mdpi', 480, 320),
        ('drawable-land-hdpi', 800, 480),
        ('drawable-land-xhdpi', 1280, 720),
        ('drawable-land-xxhdpi', 1600, 960),
        ('drawable-land-xxxhdpi', 1920, 1280),
        ('drawable-port-mdpi', 320, 480),
        ('drawable-port-hdpi', 480, 800),
        ('drawable-port-xhdpi', 720, 1280),
        ('drawable-port-xxhdpi', 960, 1600),
        ('drawable-port-xxxhdpi', 1280, 1920),
    ]
    
    for folder, w, h in splash_targets:
        s_dir = os.path.join(res_dir, folder)
        os.makedirs(s_dir, exist_ok=True)
        splash_img = create_splash_screen(base_emblem, w, h)
        splash_img.save(os.path.join(s_dir, 'splash.png'), 'PNG')
        print(f"Generated splash for {folder} ({w}x{h})")

    print("Successfully generated all official Elevate Android launcher icons and splash screens!")

if __name__ == '__main__':
    main()
