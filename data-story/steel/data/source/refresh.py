"""Refresh scoped GEM public feeds into a separate directory for review.

Run: python data/source/refresh.py --output-dir path/to/new-snapshot

This uses GEM's public map config, map GeoJSON and current API. It does not
submit the form for GEM's bulk workbook. Do not replace the frozen September
2026 files without comparing the new snapshot and updating its citation.
"""

import argparse
import csv
import hashlib
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


CONFIG_URL = "https://globalenergymonitor.github.io/interim-maps/trackers/gist/config.js"
API = "https://api.globalenergymonitor.org"
STEEL_METHODS = {"BOF", "EAF", "IF", "OHF", "Other/unspecified steel"}
API_STEEL_CATEGORIES = {"bof", "eaf", "induction", "open_hearth", "unknown_other_steel"}
PLANT_FIELDS = (
    "project-id", "name", "owner", "owner-gem-id", "parent", "parent-gem-id",
    "subnational", "location-accuracy", "url", "Latitude", "Longitude", "capacity-by-status",
)
UNIT_FIELDS = (
    "asset_id", "location_id", "unit_id", "project_name", "unit_name", "furnace_category",
    "unit_status", "capacity_ttpa", "latitude", "longitude", "owner", "owner_gem_entity_id",
    "parent", "parent_gem_entity_id", "construction_date", "start_date", "wiki_url", "api_url",
)


def fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": "Steel-story-source-audit/1.0"})
    for attempt in range(7):
        try:
            with urllib.request.urlopen(request, timeout=40) as response:
                return response.read()
        except urllib.error.HTTPError as exc:
            if exc.code not in (429, 503) or attempt == 6:
                raise
            time.sleep(min(2 ** attempt, 30))


def fetch_json(url):
    return json.loads(fetch(url))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    output = args.output_dir.resolve()
    output.mkdir(parents=True, exist_ok=True)
    if any(output.iterdir()):
        parser.error("Use an empty output directory for a new snapshot.")

    config_text = fetch(CONFIG_URL).decode("utf-8")
    match = re.search(r"\bgeojson\s*:\s*['\"](https?://[^'\"]+)['\"]", config_text)
    if not match:
        raise RuntimeError("GEM map configuration has no GeoJSON URL")
    map_url = match.group(1)
    map_bytes = fetch(map_url)
    map_data = json.loads(map_bytes)
    plants = []
    for feature in map_data["features"]:
        p = feature["properties"]
        if p.get("country-area1") != "India":
            continue
        if not any(
            x.get("status") in {"construction", "announced"} and x.get("method") in STEEL_METHODS
            for x in p.get("capacity-by-status", [])
        ):
            continue
        plants.append({field: p.get(field) for field in PLANT_FIELDS})
    (output / "gem-india.json").write_text(json.dumps(plants, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")

    query = urllib.parse.urlencode({
        "country": "India", "operating_sub_status": "construction",
        "asset_type": "iron-steel-plant", "limit": 500,
    })
    api_query_url = f"{API}/assets?{query}"
    listing = fetch_json(api_query_url)
    if listing["total"] > len(listing["results"]):
        raise RuntimeError("API listing exceeds one page; pagination required")
    detail_urls = [f"{API}/assets/{urllib.parse.quote(asset['asset_id'])}" for asset in listing["results"]]
    details = [fetch_json(url) for url in detail_urls]
    with (output / "gem-current-api-india-construction-steel-units.csv").open(
        "w", newline="", encoding="utf-8"
    ) as out:
        writer = csv.DictWriter(out, fieldnames=UNIT_FIELDS, lineterminator="\n")
        writer.writeheader()
        for detail in details:
            f = detail.get("iron_steel_plant_fields") or {}
            if f.get("furnace_category") not in API_STEEL_CATEGORIES:
                continue
            writer.writerow({
                "asset_id": detail.get("asset_id"),
                "location_id": detail.get("location_id"),
                "unit_id": detail.get("unit_id"),
                "project_name": detail.get("project_name"),
                "unit_name": detail.get("unit_name"),
                "furnace_category": f.get("furnace_category"),
                "unit_status": f.get("unit_status"),
                "capacity_ttpa": detail.get("capacity_value"),
                "latitude": detail.get("latitude"),
                "longitude": detail.get("longitude"),
                "owner": f.get("owner"),
                "owner_gem_entity_id": f.get("owner_gem_entity_id"),
                "parent": f.get("parent"),
                "parent_gem_entity_id": f.get("parent_gem_entity_id"),
                "construction_date": f.get("construction_date"),
                "start_date": f.get("start_date"),
                "wiki_url": detail.get("wiki_url"),
                "api_url": f"{API}{detail.get('url', '')}",
            })

    entity_ids = {
        token
        for plant in plants
        for token in re.findall(r"E\d+", plant.get("parent-gem-id") or "")
    }
    entity_details = [fetch_json(f"{API}/entities/{entity_id}") for entity_id in sorted(entity_ids)]
    entities = {
        item["entity_id"]: {
            "entity_id": item["entity_id"],
            "name": item.get("name"),
            "entity_type": item.get("entity_type"),
            "headquarters_country": item.get("headquarters_country"),
            "api_url": f"{API}/entities/{item['entity_id']}",
        }
        for item in entity_details
    }
    (output / "gem-entity-hq.json").write_text(json.dumps(entities, indent=2), encoding="utf-8", newline="\n")

    provenance = {
        "retrieved_at_utc": datetime.now(timezone.utc).isoformat(),
        "official_map_config_url": CONFIG_URL,
        "map_url": map_url,
        "map_geojson_sha256": hashlib.sha256(map_bytes).hexdigest(),
        "map_global_plant_count": len(map_data["features"]),
        "scoped_india_plant_count": len(plants),
        "api_query_url": api_query_url,
        "api_construction_unit_count_all_methods": len(details),
        "entity_count": len(entities),
        "files": {
            name: hashlib.sha256((output / name).read_bytes()).hexdigest()
            for name in (
                "gem-india.json", "gem-current-api-india-construction-steel-units.csv", "gem-entity-hq.json"
            )
        },
    }
    (output / "refresh-provenance.json").write_text(json.dumps(provenance, indent=2), encoding="utf-8")
    print(json.dumps(provenance, indent=2))


if __name__ == "__main__":
    main()
