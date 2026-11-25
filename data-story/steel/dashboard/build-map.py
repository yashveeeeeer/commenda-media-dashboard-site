"""Build the Natural Earth 50m map. Requires Shapely 2.1+ with GEOS 3.12+.

Run with no arguments to fetch the pinned release, or pass its local GeoJSON.
All country fills, the land underlay and the boundary mesh share one coverage.
"""

import hashlib
import json
import math
import sys
from collections import Counter
from pathlib import Path
from urllib.request import urlopen

import shapely
from shapely.geometry import MultiLineString, shape

SOURCE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_admin_0_countries.geojson"
SHA256 = "3e458fc036ad0a66411f2c1e6cac49c5d7bfb81cb1123bc513b22511a2b7fdeb"
OUTPUT = Path(__file__).with_name("countries.json")


def project(lon, lat):
    """Mollweide equal-area, unit sphere in degrees, SVG y down."""
    phi = math.radians(lat)
    theta = phi
    if abs(lat) < 90:
        target = math.pi * math.sin(phi)
        for _ in range(16):
            delta = (2*theta + math.sin(2*theta) - target) / (2 + 2*math.cos(2*theta))
            theta -= delta
            if abs(delta) < 1e-12:
                break
    return 2*math.sqrt(2)/math.pi * lon * math.cos(theta), -math.degrees(math.sqrt(2)*math.sin(theta))


def number(value):
    return f"{value:.4f}".rstrip("0").rstrip(".")


def line_path(coordinates):
    return "M" + " ".join(f"{number(x)},{number(y)}" for x, y in coordinates)


def polygons(geometry):
    return geometry.geoms if geometry.geom_type == "MultiPolygon" else [geometry]


def rings(geometry):
    for polygon in polygons(geometry):
        yield polygon.exterior
        yield from polygon.interiors


def area_path(geometry):
    return "".join(line_path(ring.coords[:-1]) + "Z" for ring in rings(geometry))


def boundary_path(geometries):
    # Each shared segment occurs twice. Removing the duplicate before drawing
    # avoids double-width borders, including around enclaves.
    segments = Counter()
    for geometry in geometries:
        for ring in rings(geometry):
            coords = ring.coords
            for a, b in zip(coords, coords[1:]):
                segments[tuple(sorted((a, b)))] += 1
    if max(segments.values()) != 2:
        raise ValueError("Unexpected boundary multiplicity")
    shared = MultiLineString([edge for edge, count in segments.items() if count == 2])
    mesh = shapely.line_merge(shared)
    return "".join(line_path(line.coords) for line in mesh.geoms)


def build(features):
    features = [f for f in features if f["properties"]["ADM0_A3"] != "ATA"]
    source = [shape(f["geometry"]) for f in features]
    if not shapely.coverage_is_valid(source):
        raise ValueError("The pinned source must have matching country borders")
    # Simplify adjacent countries as a collection. Independent simplification
    # can move opposite sides of a border in different directions.
    countries = shapely.coverage_simplify(source, tolerance=0.065)
    # Subdivide long parallels and meridians before bending them in Mollweide.
    countries = shapely.segmentize(countries, max_segment_length=1.0)
    def project_arrays(x, y):
        return tuple(zip(*(project(lon, lat) for lon, lat in zip(x, y))))
    projected = shapely.transform(countries, project_arrays, interleaved=False)
    # Quantize once before deriving the three SVG layers. The written vertices
    # and the vertices checked by GEOS must coincide, including along coasts.
    projected = shapely.set_precision(projected, 0.0001)
    if not shapely.coverage_is_valid(projected) or not all(shapely.is_valid(projected)):
        raise ValueError("The projected country coverage has mismatched edges")
    land = shapely.coverage_union_all(projected)
    records = []
    for feature, geometry in zip(features, projected):
        f = feature["properties"]
        # A regional focus uses the largest contiguous part plus visible sites.
        mainland = max(polygons(geometry), key=lambda polygon: polygon.area)
        records.append({
            "adm0": f["ADM0_A3"],
            "iso3": f["ISO_A3_EH"] if f["ISO_A3_EH"] != "-99" else None,
            "name": f["NAME_EN"],
            "label": [round(f["LABEL_X"], 4), round(f["LABEL_Y"], 4)],
            "focus": [round(value, 4) for value in mainland.bounds],
            "d": area_path(geometry),
        })
    graticule = []
    for lon in range(-180, 181, 60):
        graticule.append(line_path(project(lon, lat) for lat in range(-60, 91, 2)))
    for lat in range(-60, 61, 30):
        graticule.append(line_path([project(-180, lat), project(180, lat)]))
    return {
        "source": SOURCE,
        "crosswalk": "Natural Earth ADM0_A3 to ISO_A3_EH. Null means no ISO match.",
        "projection": "Mollweide (World Mollweide), unit sphere, degrees, north up",
        "land": area_path(land),
        "borders": boundary_path(projected),
        "graticule": "".join(graticule),
        "countries": records,
    }


if __name__ == "__main__":
    if len(sys.argv) > 1:
        raw = Path(sys.argv[1]).read_bytes()
    else:
        with urlopen(SOURCE, timeout=60) as response:
            raw = response.read()
    if hashlib.sha256(raw).hexdigest() != SHA256:
        raise ValueError("Source checksum differs from the pinned Natural Earth release")
    data = build(json.loads(raw)["features"])
    OUTPUT.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False) + "\n",
                      encoding="utf-8", newline="\n")
