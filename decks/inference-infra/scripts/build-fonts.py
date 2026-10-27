"""Build local web fonts from the user's installed LXGW WenKai fonts.

Run: uv run --with fonttools --with brotli python scripts/build-fonts.py
"""
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont

source = Path.home() / 'Library' / 'Fonts'
output = Path(__file__).resolve().parents[1] / 'public' / 'fonts'
output.mkdir(parents=True, exist_ok=True)
# Keep common Chinese characters, Latin, punctuation, arrows, and math symbols.
# This covers future Chinese slides without regenerating for every text edit.
ranges = [(0x0000, 0x024F), (0x2000, 0x22FF), (0x2E80, 0x303F),
          (0x31C0, 0x31EF), (0x3400, 0x9FFF), (0xFE00, 0xFE0F),
          (0xFF00, 0xFFEF)]
unicodes = {cp for lo, hi in ranges for cp in range(lo, hi + 1)}
for weight in ('Regular', 'Medium'):
    font = TTFont(source / f'LXGWWenKai-{weight}.ttf')
    options = subset.Options()
    options.flavor = 'woff2'
    options.name_IDs = ['*']
    options.name_legacy = True
    options.name_languages = ['*']
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=unicodes)
    subsetter.subset(font)
    font.flavor = 'woff2'
    target = output / f'lxgw-wenkai-{weight.lower()}.woff2'
    font.save(target)
    print(f'{target.name}: {target.stat().st_size / 1024 / 1024:.2f} MiB')
