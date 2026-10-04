from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
HEBREW = re.compile(r'[\u0590-\u05ff]')

def tag(name):
    return '{' + A + '}' + name

def transform(data):
    # Preserve the existing namespace prefixes and XML structure verbatim.
    text = data.decode('utf-8')
    def body(match):
        block = match.group(0)
        if not HEBREW.search(block):
            return block
        block = re.sub(r'<a:(pPr|defPPr|lvl[1-9]pPr)\b([^>]*?)(/?)>',
            lambda m: '<a:' + m.group(1) + re.sub(r'\s+rtl="[^"]*"', '', m.group(2)) + ' rtl="1"' + m.group(3) + '>', block)
        def paragraph(m):
            p = m.group(0)
            if not HEBREW.search(p):
                return p
            if not re.search(r'<a:pPr\b', p):
                p = re.sub(r'(<a:p\b[^>]*>)', r'\1<a:pPr rtl="1"/>', p, count=1)
            p = re.sub(r'<a:(rPr|defRPr|endParaRPr)\b([^>]*?)(/?)>',
                lambda n: '<a:' + n.group(1) + re.sub(r'\s+(?:lang|altLang)="[^"]*"', '', n.group(2)) + ' lang="he-IL" altLang="en-US"' + n.group(3) + '>', p)
            return p
        return re.sub(r'<a:p\b[^>]*>.*?</a:p>', paragraph, block, flags=re.S)
    text = re.sub(r'<p:txBody\b[^>]*>.*?</p:txBody>', body, text, flags=re.S)
    return text.encode('utf-8')

for style in (('nature', 'modern') if __name__ == '__main__' else ()):
    source = ROOT / 'presentation_output' / f'kinesiology-practical-{style}-final.pptx'
    target = ROOT / 'presentation_output' / f'kinesiology-practical-{style}-hebrew-rtl.pptx'
    changed = 0
    with ZipFile(source) as zin, ZipFile(target, 'w', ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if re.match(r'ppt/(slides|notesSlides)/[^/]+\.xml$', item.filename):
                patched = transform(data)
                if patched != data:
                    changed += 1
                # All logical text must stay exactly identical.
                old = [e.text for e in ET.fromstring(data).iter(tag('t'))]
                new = [e.text for e in ET.fromstring(patched).iter(tag('t'))]
                assert old == new, item.filename
                for p in ET.fromstring(patched).iter(tag('p')):
                    content = ''.join(p.itertext())
                    if HEBREW.search(content):
                        assert p.find(tag('pPr')).get('rtl') == '1', item.filename
                data = patched
            zout.writestr(item, data)
    print(f'{target}: {changed} XML parts corrected; logical text preserved; Hebrew paragraphs RTL')
