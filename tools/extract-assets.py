"""Split the original Figma page exports into standalone vector components."""
import collections
import json
import math
import re
import sys
from pathlib import Path
from xml.etree import ElementTree as ET

from fontTools.pens.boundsPen import BoundsPen
from fontTools.svgLib.path import parse_path

ROOT = Path(__file__).resolve().parents[1]
SVG = '{http://www.w3.org/2000/svg}'
ET.register_namespace('', SVG[1:-1])


def bbox(node):
    tag = node.tag.removeprefix(SVG)
    if tag == 'path':
        pen = BoundsPen(None)
        parse_path(node.attrib['d'], pen)
        return pen.bounds
    if tag == 'rect':
        x, y = (float(node.get(key, '0')) for key in ('x', 'y'))
        if transform := node.get('transform'):
            dx, dy = (float(number) for number in re.findall(r'-?[.\d]+', transform))
            x, y = x + dx, y + dy
        return x, y, x + float(node.get('width')), y + float(node.get('height'))
    if tag == 'line':
        x1, y1, x2, y2 = (float(node.get(key)) for key in ('x1', 'y1', 'x2', 'y2'))
        return min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2)
    if tag == 'g':
        return enclosing([bbox(child) for child in node])
    return None


def enclosing(boxes):
    boxes = [box for box in boxes if box is not None]
    return (min(box[0] for box in boxes), min(box[1] for box in boxes),
            max(box[2] for box in boxes), max(box[3] for box in boxes))


def records(size):
    root = ET.parse(ROOT / 'source-assets' / f'{size}.svg').getroot()
    return [(node, box) for node in list(root)[2:] if (box := bbox(node)) is not None]


def center(box):
    return (box[0] + box[2]) / 2, (box[1] + box[3]) / 2


OBJECTS = [
    ('book', 'Книга', 'книжка;книгу;book', 'чтение, знания, учеба, обзор, история, урок, образование, главы'),
    ('phone', 'Телефон', 'смартфон;мобильник;телефона;phone', 'приложение, цифра, технологии, экран, интерфейс, связь'),
    ('puzzles', 'Пазлы', 'пазл;головоломка;puzzle', 'выбор, сборка, кусочки, решение, логика, совместимость, части, составить'),
    ('coin', 'Монета', 'монету;монеты;coin', 'деньги, покупка, платеж, баланс, цена, финанс, монета, стоимость'),
    ('headphones', 'Наушники', 'гарнитура;headphones', 'музыка, звук, слушать, аудио, тихо, тишина, фокус'),
    ('lamp', 'Лампа', 'лампу;светильник;lamp', 'свет, идея, работа, фокус, внимание, концентрация, вдохновение'),
    ('flowers', 'Цветы', 'ваза;букет;тюльпаны;flowers', 'весна, подарок, забота, рост, уют, праздник, настроение'),
    ('wallet', 'Кошелёк', 'портмоне;кошелька;wallet', 'бюджет, финансы, сбережения, экономия, деньги, учет, банк'),
    ('folder', 'Папка', 'папку;файлы;папки;folder', 'документы, организация, архив, список, систематизация, учет, порядок'),
    ('pen', 'Карандаш', 'ручка;карандаша;pen;pencil', 'писать, заметки, черновик, дизайн, набросок, рисовать, редактура'),
]

# Empty gutters in the flattened Figma exports, measured in document units.
GRID = {
    'L': {
        'main': [(3650, 4490, [1940, 2890, 3800]), (4490, 5800, [1700, 2800, 3840]), (5900, 6860, [1700])],
        'background': [(7570, 8480, [1940, 2890, 3800]), (8480, 9875, [1700, 2790, 3830]), (9990, 10800, [1700])],
    },
    'S': {
        'main': [(2100, 2740, [1160, 1780, 2340]), (2770, 3600, [1080, 1730, 2340]), (3690, 4300, [1110])],
        'background': [(5100, 5840, [1160, 1780, 2340]), (5900, 6700, [1080, 1730, 2340]), (6740, 7410, [1110])],
    },
}
COLORS = {
    '#d7cdf5': 0, '#aa9bf0': 1, '#7864d7': 2, '#181817': 3, 'black': 3,
    '#f9ecb0': 4, '#f9a3aa': 5, '#ffe3e1': 6, 'white': 7,
}
BACKDROPS = {
    'L': [(289, 775, 1000), (1487, 775, 1000), (2684, 775, 1000)],
    'S': [(327, 216, 500), (1096, 216, 500), (1865, 216, 500)],
}
BACKDROP_COLORS = [
    COLORS,
    {'#fdd7b9': 0, '#fac896': 1, '#d27532': 2, 'black': 3, '#181817': 3, 'white': 7},
    {'#beebeb': 0, '#80dada': 1, '#5abebe': 2, 'black': 3, '#181817': 3, 'white': 7},
]


def serialize(node, colors):
    # Keep the original path data, transforms, and draw order. Palette slots are
    # substituted at render time into SVG attributes for compatibility with editors.
    markup = re.sub(r' xmlns="[^"]+"', '', ET.tostring(node, encoding='unicode'), count=1).strip()
    return re.sub(r'(fill|stroke)="([^"]+)"', lambda match: (
        f'{match[1]}="@@{colors[match[2].lower()]}@@"'
        if match[2].lower() in colors else match[0]
    ), markup)


def asset_fragment(items, colors=COLORS, view=None):
    if not items:
        raise ValueError('Empty original component.')
    if view is None:
        x, y, right, bottom = enclosing([box for _, box in items])
        x, y = math.floor(x - 1), math.floor(y - 1)
        view = x, y, math.ceil(right + 1 - x), math.ceil(bottom + 1 - y)
    return {'box': view, 'body': ''.join(serialize(node, colors) for node, _ in items), 'count': len(items)}


def build():
    catalog = [
        {'id': asset_id, 'label': label, 'aliases': aliases.split(';'), 'tags': tags.split(', '), 'variants': {}}
        for asset_id, label, aliases, tags in OBJECTS
    ]
    backdrops = {}
    for size, roles in GRID.items():
        data = records(size)
        for role, rows in roles.items():
            cells = []
            for ymin, ymax, limits in rows:
                bins = [[] for _ in range(len(limits) + 1)]
                for node, box in data:
                    x, y = center(box)
                    if ymin <= y < ymax:
                        bins[sum(x >= boundary for boundary in limits)].append((node, box))
                cells.extend(bins)
            for asset, items in zip(catalog, cells, strict=True):
                asset['variants'].setdefault(size, {})[role] = asset_fragment(items)
        backdrops[size] = {}
        for (name, colors), (x, y, side) in zip(
            zip(('iris', 'peach', 'laguna'), BACKDROP_COLORS, strict=True), BACKDROPS[size], strict=True
        ):
            items = [(node, box) for node, box in data if x <= center(box)[0] < x + side and y <= center(box)[1] < y + side]
            if name == 'peach':
                root = ET.parse(ROOT / 'source-assets' / f'{size}.svg').getroot()
                items += [(root.find(SVG + 'defs'), (x, y, x + side, y + side))]
            backdrops[size][name] = asset_fragment(items, colors, (x, y, side, side))
    for asset in catalog:
        print(asset['id'], {
            f'{size}/{role}': (variant['count'], variant['box'])
            for size, roles in asset['variants'].items() for role, variant in roles.items()
        })
    body = ('// Generated from original Figma SVG exports by tools/extract-assets.py.\n'
            + 'export const CATALOG = ' + json.dumps(catalog, ensure_ascii=False, separators=(',', ':')) + ';\n'
            + 'export const BACKDROPS = ' + json.dumps(backdrops, ensure_ascii=False, separators=(',', ':')) + ';\n')
    (ROOT / 'dist' / 'assets.mjs').write_text(body, encoding='utf-8')


if __name__ == '__main__' and '--diagnose' in sys.argv:
    for size in ('L', 'S'):
        data = records(size)
        buckets = collections.Counter((int(x // 250), int(y // 250)) for _, box in data for x, y in [center(box)])
        columns, rows = max(x for x, _ in buckets) + 1, max(y for _, y in buckets) + 1
        print(size, '250 source px per cell')
        print('     ' + ''.join(f'{i:<4}' for i in range(columns)))
        for row in range(rows):
            print(f'{row:>3}  ' + ''.join(f'{buckets[x,row]:<4}' if buckets[x,row] else '·   ' for x in range(columns)))
        print('Rectangles of the backgrounds:')
        for node, box in data:
            if node.tag == SVG + 'rect' and float(node.get('width', 0)) > 350:
                print(box, node.get('fill'), node.get('stroke'))
elif __name__ == '__main__':
    build()
