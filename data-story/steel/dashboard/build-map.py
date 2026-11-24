"""Rebuild the compact map and ISO crosswalk with Python and shapely."""

import json
import math
from pathlib import Path
from urllib.request import urlopen

from shapely.geometry import shape

SOURCE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_admin_0_countries.geojson"
OUTPUT = Path(__file__).with_name("countries.json")


def mercator(latitude):
    return math.degrees(math.asinh(math.tan(math.radians(latitude))))


def ring_path(ring):
    points = [(round(x, 2), round(-mercator(y), 2)) for x, y in ring.coords[:-1]]
    return "M" + " ".join(f"{x:g},{y:g}" for x, y in points) + "Z"


def make_country(feature):
    fields = feature["properties"]
    geometry = shape(feature["geometry"]).simplify(0.18, preserve_topology=True)
    polygons = geometry.geoms if geometry.geom_type == "MultiPolygon" else [geometry]
    paths = [ring_path(ring) for polygon in polygons for ring in [polygon.exterior, *polygon.interiors]]
    iso = fields["ISO_A3_EH"] if fields["ISO_A3_EH"] != "-99" else None
    return {
        "adm0": fields["ADM0_A3"],
        "iso3": iso,
        "name": fields["NAME_EN"],
        "label": [round(fields["LABEL_X"], 4), round(fields["LABEL_Y"], 4)],
        "d": "".join(paths),
    }


if __name__ == "__main__":
    with urlopen(SOURCE, timeout=60) as result:
        features = json.load(result)["features"]
    countries = [make_country(f) for f in features if f["properties"]["ADM0_A3"] != "ATA"]
    data = {"source": SOURCE, "crosswalk": "Natural Earth ADM0_A3 to ISO_A3_EH. Null means no ISO match.", "countries": countries}
    OUTPUT.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False) + "\n", encoding="utf-8")
