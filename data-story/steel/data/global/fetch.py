"""Freeze worldwide GEM September-map construction steel and public API evidence.

Run from repository root:
  python data-story/steel/data/global/fetch.py --map --entities --graphs --units

Each stage caches after every API response and can be resumed. The map remains
the fixed September 2026 source; API entity/graph/unit records are live checks.
"""

import argparse
import hashlib
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


HERE = Path(__file__).resolve().parent
MAP_URL = "https://publicgemdata.nyc3.cdn.digitaloceanspaces.com/Current_maps/gist/gist_map_2026-09.geojson"
API = "https://api.globalenergymonitor.org"
STEEL_METHODS = {"BOF", "EAF", "IF", "OHF", "Other/unspecified steel"}
API_CATEGORIES = ("bof", "eaf", "induction", "open_hearth", "unknown_other_steel")
PROPERTY_FIELDS = (
    "project-id", "name", "owner", "owner-gem-id", "parent", "parent-gem-id",
    "subnational", "country-area1", "location-accuracy", "url", "Latitude", "Longitude",
    "capacity-by-status",
)


def request_bytes(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Steel-story-public-data-audit/1.0"})
    for attempt in range(8):
        try:
            with urllib.request.urlopen(req, timeout=60) as response:
                return response.read()
        except urllib.error.HTTPError as exc:
            if exc.code not in (429, 503) or attempt == 7:
                raise
            time.sleep(min(2 ** attempt, 40))


def request_json(url):
    return json.loads(request_bytes(url))


def write_json(path, value):
    path.write_bytes(json.dumps(value, indent=2, ensure_ascii=False).encode("utf-8"))


def read_json(path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def fetch_map():
    data_bytes = request_bytes(MAP_URL)
    data = json.loads(data_bytes)
    plants = []
    announced = []
    for feature in data["features"]:
        p = feature["properties"]
        if any(item.get("status") == "construction" and item.get("method") in STEEL_METHODS
               for item in p.get("capacity-by-status", [])):
            plants.append({key: p.get(key) for key in PROPERTY_FIELDS})
        if any(item.get("status") == "announced" and item.get("method") in STEEL_METHODS
               for item in p.get("capacity-by-status", [])):
            announced.append({key: p.get(key) for key in PROPERTY_FIELDS})
    write_json(HERE / "raw-map-projects.json", plants)
    write_json(HERE / "raw-map-announced.json", announced)
    write_json(HERE / "map-source.json", {
        "url": MAP_URL,
        "retrieved_at_utc": datetime.now(timezone.utc).isoformat(),
        "full_geojson_sha256": hashlib.sha256(data_bytes).hexdigest(),
        "full_plant_count": len(data["features"]),
        "construction_steel_project_count_including_unquantified": len(plants),
        "announced_steel_project_count_including_unquantified": len(announced),
    })
    print(f"Map: {len(plants)} plants, SHA256 {hashlib.sha256(data_bytes).hexdigest()}", flush=True)


def fetch_entities():
    plants = read_json(HERE / "raw-map-projects.json", [])
    if not plants:
        raise RuntimeError("Run --map first")
    ids = sorted({x for p in plants for x in re.findall(r"E\d+", p.get("parent-gem-id") or "")})
    cache_path = HERE / "api-parent-entities.json"
    cache = read_json(cache_path, {})
    for i, entity_id in enumerate(ids, 1):
        if entity_id in cache:
            continue
        item = request_json(f"{API}/entities/{entity_id}")
        cache[entity_id] = {
            "entity_id": entity_id,
            "name": item.get("name"),
            "full_name": item.get("full_name"),
            "entity_type": item.get("entity_type"),
            "legal_entity_type": item.get("legal_entity_type"),
            "headquarters_country": item.get("headquarters_country"),
            "registration_country": item.get("registration_country"),
            "url": f"{API}/entities/{entity_id}",
        }
        write_json(cache_path, cache)
        if i % 25 == 0:
            print(f"Entities: {i}/{len(ids)}", flush=True)
    print(f"Entities: {len(cache)}/{len(ids)}", flush=True)


def fetch_graphs():
    plants = read_json(HERE / "raw-map-projects.json", [])
    if not plants:
        raise RuntimeError("Run --map first")
    ids = sorted({x for p in plants for x in re.findall(r"E\d+", p.get("owner-gem-id") or "")})
    cache_path = HERE / "api-owner-graphs.json"
    cache = read_json(cache_path, {})
    for i, entity_id in enumerate(ids, 1):
        if entity_id in cache:
            continue
        url = f"{API}/entities/{entity_id}/graph/up"
        try:
            item = request_json(url)
            cache[entity_id] = {
                "url": url,
                "root_entity_id": item.get("root_entity_id"),
                "nodes": item.get("nodes", []),
                "edges": item.get("edges", []),
            }
        except urllib.error.HTTPError as exc:
            cache[entity_id] = {"url": url, "error": f"HTTP {exc.code}"}
        write_json(cache_path, cache)
        if i % 20 == 0:
            print(f"Graphs: {i}/{len(ids)}", flush=True)
    print(f"Graphs: {len(cache)}/{len(ids)}", flush=True)


def fetch_units():
    params = [
        ("operating_sub_status", "construction"),
        ("asset_type", "iron-steel-plant"),
        *(("furnace_category", category) for category in API_CATEGORIES),
        ("limit", "500"),
    ]
    listing_url = f"{API}/assets?{urllib.parse.urlencode(params)}"
    listing = request_json(listing_url)
    if listing["total"] > len(listing["results"]):
        raise RuntimeError("Construction steel API query requires pagination")
    cache_path = HERE / "api-construction-steel-units.json"
    cache = read_json(cache_path, {"query_url": listing_url, "units": {}})
    for i, row in enumerate(listing["results"], 1):
        asset_id = row["asset_id"]
        if asset_id in cache["units"]:
            continue
        url = f"{API}/assets/{urllib.parse.quote(asset_id)}"
        detail = request_json(url)
        f = detail.get("iron_steel_plant_fields") or {}
        cache["units"][asset_id] = {
            "asset_id": asset_id,
            "location_id": detail.get("location_id"),
            "unit_id": detail.get("unit_id"),
            "plant": detail.get("project_name"),
            "unit": detail.get("unit_name"),
            "category": f.get("furnace_category"),
            "status": f.get("unit_status"),
            "capacity_ttpa": detail.get("capacity_value"),
            "country": detail.get("country"),
            "start_date": f.get("start_date"),
            "construction_date": f.get("construction_date"),
            "wiki_url": detail.get("wiki_url"),
            "url": url,
        }
        write_json(cache_path, cache)
        if i % 25 == 0:
            print(f"Units: {i}/{len(listing['results'])}", flush=True)
    print(f"Units: {len(cache['units'])}/{len(listing['results'])}", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--map", action="store_true")
    parser.add_argument("--entities", action="store_true")
    parser.add_argument("--graphs", action="store_true")
    parser.add_argument("--units", action="store_true")
    args = parser.parse_args()
    HERE.mkdir(parents=True, exist_ok=True)
    if args.map:
        fetch_map()
    if args.entities:
        fetch_entities()
    if args.graphs:
        fetch_graphs()
    if args.units:
        fetch_units()


if __name__ == "__main__":
    main()
