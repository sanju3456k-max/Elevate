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

def create_splash_screen(emblem_img, width, height, dark_mode=False):
    # Pure white #ffffff for light mode, rich dark #0b0c10 for dark mode
    bg_color = (11, 12, 16, 255) if dark_mode else (255, 255, 255, 255)
    splash = Image.new("RGBA", (width, height), bg_color)
    
    # Scale emblem to match WelcomeSplash visual scale (around 35% of shortest dimension)
    short_dim = min(width, height)
    emblem_size = int(short_dim * 0.35)
    resized_emblem = emblem_img.resize((emblem_size, emblem_size), Image.Resampling.LANCZOS)
    
    offset_x = (width - emblem_size) // 2
    offset_y = (height - emblem_size) // 2
    splash.paste(resized_emblem, (offset_x, offset_y), resized_emblem)
    return splash.convert("RGB")

def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    svg_path = os.path.join(root, 'public', 'assets', 'elevate-icon.svg')
    res_dir = os.path.join(root, 'android', 'app', 'src', 'main', 'res')
    
    # High-resolution emblem render (2048x2048) for Light and Dark modes
    with open(svg_path, 'r', encoding='utf-8') as f:
        svg_content = f.read()

    doc_light = fitz.open(stream=svg_content.encode('utf-8'), filetype='svg')
    pix_light = doc_light[0].get_pixmap(matrix=fitz.Matrix(2.0, 2.0), alpha=True)
    base_emblem = Image.frombytes("RGBA", [pix_light.width, pix_light.height], pix_light.samples)

    # Dark emblem tinted in vibrant light blue #a8c7fa for high-contrast dark splash screen
    svg_dark_content = svg_content.replace('#0247c6', '#a8c7fa')
    doc_dark = fitz.open(stream=svg_dark_content.encode('utf-8'), filetype='svg')
    pix_dark = doc_dark[0].get_pixmap(matrix=fitz.Matrix(2.0, 2.0), alpha=True)
    base_emblem_dark = Image.frombytes("RGBA", [pix_dark.width, pix_dark.height], pix_dark.samples)

    print("Rendered base Elevate vector emblems for light and dark modes (2048x2048)")
    
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

    # Generate status bar & notification icons
    notif_densities = [
        ('mdpi', 24, 2.4),
        ('hdpi', 36, 3.6),
        ('xhdpi', 48, 4.8),
        ('xxhdpi', 72, 7.2),
        ('xxxhdpi', 96, 9.6),
    ]
    for density, n_size, stroke in notif_densities:
        nd_dir = os.path.join(res_dir, f'drawable-{density}')
        os.makedirs(nd_dir, exist_ok=True)
        n_img = Image.new('RGBA', (n_size, n_size), (0, 0, 0, 0))
        n_draw = ImageDraw.Draw(n_img)
        scale = n_size / 24.0
        pts = [
            (18 * scale, 5.5 * scale),
            (6 * scale, 5.5 * scale),
            (12.5 * scale, 12 * scale),
            (6 * scale, 18.5 * scale),
            (18 * scale, 18.5 * scale),
        ]
        n_draw.line(pts, fill=(255, 255, 255, 255), width=max(1, int(round(stroke))), joint='round')
        n_img.save(os.path.join(nd_dir, 'ic_notification.png'), 'PNG')

    print("Generated ic_notification raster assets across all densities")
        
    # High-Definition Modern Splash screens
    splash_targets = [
        ('drawable', 'drawable-night', 1080, 2400),
        ('drawable-land-mdpi', 'drawable-land-night-mdpi', 800, 480),
        ('drawable-land-hdpi', 'drawable-land-night-hdpi', 1280, 720),
        ('drawable-land-xhdpi', 'drawable-land-night-xhdpi', 1920, 1080),
        ('drawable-land-xxhdpi', 'drawable-land-night-xxhdpi', 2400, 1080),
        ('drawable-land-xxxhdpi', 'drawable-land-night-xxxhdpi', 3200, 1440),
        ('drawable-port-mdpi', 'drawable-port-night-mdpi', 480, 800),
        ('drawable-port-hdpi', 'drawable-port-night-hdpi', 720, 1280),
        ('drawable-port-xhdpi', 'drawable-port-night-xhdpi', 1080, 1920),
        ('drawable-port-xxhdpi', 'drawable-port-night-xxhdpi', 1080, 2400),
        ('drawable-port-xxxhdpi', 'drawable-port-night-xxxhdpi', 1440, 3200),
    ]
    
    for light_folder, dark_folder, w, h in splash_targets:
        # Light mode splash (pure white #ffffff with brand blue emblem)
        s_dir = os.path.join(res_dir, light_folder)
        os.makedirs(s_dir, exist_ok=True)
        splash_img = create_splash_screen(base_emblem, w, h, dark_mode=False)
        splash_img.save(os.path.join(s_dir, 'splash.png'), 'PNG')

        # Dark mode splash (deep dark #0b0c10 with vibrant light blue emblem)
        s_dark_dir = os.path.join(res_dir, dark_folder)
        os.makedirs(s_dark_dir, exist_ok=True)
        splash_dark_img = create_splash_screen(base_emblem_dark, w, h, dark_mode=True)
        splash_dark_img.save(os.path.join(s_dark_dir, 'splash.png'), 'PNG')
        print(f"Generated light & dark splash for {light_folder} / {dark_folder} ({w}x{h})")

    print("Successfully generated all official Elevate Android launcher icons and splash screens!")

if __name__ == '__main__':
    main()
