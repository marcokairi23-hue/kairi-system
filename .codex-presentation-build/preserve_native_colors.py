"""Transfer artifact-authored colors without reserializing verified native text."""
import re
import sys
from zipfile import ZipFile
from fix_rtl import transform

source, authored, target = sys.argv[1:]
pattern = re.compile(rb'(<a:srgbClr\b[^>]*\bval=")([0-9A-Fa-f]{6})(")')
try:
    original = ZipFile(source)
except PermissionError:
    # PowerPoint holds its open file exclusively. Reconstruct the identical RTL
    # correction from the unchanged pre-RTL source instead of disturbing the UI.
    original = ZipFile(source.replace('-hebrew-rtl.pptx', '-final.pptx'))
with original, ZipFile(authored) as new, ZipFile(target, 'w') as output:
    changed = []
    for entry in original.infolist():
        data = original.read(entry.filename)
        if re.fullmatch(r'ppt/(slides|notesSlides)/[^/]+\.xml', entry.filename):
            data = transform(data)
        if re.fullmatch(r'ppt/slides/slide[2-8]\.xml', entry.filename):
            rebuilt = new.read(entry.filename)
            original_colors = list(pattern.finditer(data))
            authored_colors = list(pattern.finditer(rebuilt))
            assert len(original_colors) == len(authored_colors), (entry.filename, len(original_colors), len(authored_colors))
            colors = iter(match.group(2) for match in authored_colors)
            recolored = pattern.sub(lambda match: match.group(1) + next(colors) + match.group(3), data)
            # No non-color XML, including direction, text and geometry, may change.
            assert pattern.sub(rb'COLOR', recolored) == pattern.sub(rb'COLOR', data)
            data = recolored
            changed.append(entry.filename)
        output.writestr(entry, data)
    assert len(changed) == 7
print('Preserved cover, RTL, content, notes, and geometry. Recolored seven slides.')
