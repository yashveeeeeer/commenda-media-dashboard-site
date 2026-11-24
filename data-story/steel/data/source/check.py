"""Reproduce the fixed GEM India map totals and audit the live unit API cross-check.

Run: python data/source/check.py
No network access is required. The full map is represented by ../gem-india.json.
This computes gross furnace capacity, not independently verified net additions.
"""

import csv
import hashlib
import json
import re
from collections import defaultdict
from pathlib import Path


HERE = Path(__file__).resolve().parent
DATA = HERE.parent
STEEL_METHODS = {"BOF", "EAF", "IF", "OHF", "Other/unspecified steel"}
API_METHODS = {"bof": "BOF", "eaf": "EAF", "induction": "IF", "open_hearth": "OHF", "unknown_other_steel": "Other/unspecified steel"}


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def parse_parent(part):
    match = re.fullmatch(r"\s*(E\d+)(?:\s*\[(\d+(?:\.\d+)?)%\])?\s*", part)
    if not match:
        raise ValueError(f"Cannot parse parent: {part}")
    return match.group(1), float(match.group(2)) if match.group(2) else None


def main():
    map_rows = json.loads((DATA / "gem-india.json").read_text(encoding="utf-8-sig"))
    entities = json.loads((HERE / "gem-entity-hq.json").read_text(encoding="utf-8-sig"))
    with (HERE / "gem-current-api-india-construction-steel-units.csv").open(encoding="utf-8-sig", newline="") as inp:
        api_rows = list(csv.DictReader(inp))

    summary = {}
    map_construction_by_plant_method = defaultdict(float)
    unknown_projects = []
    for status in ("construction", "announced"):
        totals = defaultdict(float)
        plant_count = 0
        for plant in map_rows:
            by_method = defaultdict(float)
            for item in plant.get("capacity-by-status", []):
                if item.get("status") != status or item.get("method") not in STEEL_METHODS:
                    continue
                try:
                    by_method[item["method"]] += float(item["capacity"])
                except (ValueError, TypeError):
                    continue
            capacity = sum(by_method.values())
            if not capacity:
                continue
            plant_count += 1
            if status == "construction":
                for method, value in by_method.items():
                    map_construction_by_plant_method[(plant["project-id"], method)] += value

            parts = [p.strip() for p in plant.get("parent-gem-id", "").split(";") if p.strip()]
            parents = [parse_parent(part) for part in parts]
            known_sum = sum(share for _, share in parents if share is not None)
            if known_sum > 100.000001:
                totals["unknown"] += capacity
                unknown_projects.append({
                    "status": status, "plant_id": plant["project-id"], "plant": plant["name"],
                    "capacity_ttpa": capacity,
                    "reason": f"overfull parent shares ({known_sum:g}%)",
                    "parent": plant.get("parent", ""),
                })
                continue
            for entity_id, share in parents:
                if share is None:
                    continue
                country = entities.get(entity_id, {}).get("headquarters_country")
                key = "Indian HQ" if country == "India" else "overseas HQ" if country else "unknown"
                totals[key] += capacity * share / 100
                if key == "unknown":
                    unknown_projects.append({
                        "status": status, "plant_id": plant["project-id"], "plant": plant["name"],
                        "capacity_ttpa": round(capacity * share / 100, 3),
                        "reason": f"no HQ country for {entity_id}", "parent": plant.get("parent", ""),
                    })
            residual_pct = max(0, 100 - known_sum)
            if residual_pct:
                residual_capacity = capacity * residual_pct / 100
                totals["unknown"] += residual_capacity
                unknown_projects.append({
                    "status": status, "plant_id": plant["project-id"], "plant": plant["name"],
                    "capacity_ttpa": round(residual_capacity, 3),
                    "reason": "unquantified stake" if any(share is None for _, share in parents) or not parents else f"unreported residual stake ({residual_pct:g}%)",
                    "parent": plant.get("parent", ""),
                })
        summary[status] = {
            "plants": plant_count,
            "total_ttpa": round(sum(totals.values()), 3),
            "Indian_HQ_ttpa": round(totals["Indian HQ"], 3),
            "overseas_HQ_ttpa": round(totals["overseas HQ"], 3),
            "unknown_ttpa": round(totals["unknown"], 3),
        }

    api_by_plant_method = defaultdict(float)
    for row in api_rows:
        method = API_METHODS.get(row["furnace_category"])
        if method:
            api_by_plant_method[(row["location_id"], method)] += float(row["capacity_ttpa"])
    differences = [
        {"plant_id": key[0], "method": key[1], "map_ttpa": round(map_construction_by_plant_method.get(key, 0), 3),
         "live_api_ttpa": round(api_by_plant_method.get(key, 0), 3)}
        for key in sorted(map_construction_by_plant_method.keys() | api_by_plant_method.keys())
        if abs(map_construction_by_plant_method.get(key, 0) - api_by_plant_method.get(key, 0)) > 0.01
    ]

    result = {
        "snapshot": "GEM September 2026 (V1) public map",
        "measure": "gross crude steelmaking furnace capacity in India, ttpa",
        "methods": sorted(STEEL_METHODS),
        "status": summary,
        "current_api_construction_steel_unit_count": len(api_rows),
        "current_api_construction_steel_ttpa": round(sum(float(r["capacity_ttpa"]) for r in api_rows), 3),
        "plant_method_api_map_differences": differences,
        "unknown_projects": unknown_projects,
        "sensitivity": {
            "construction_only_disclosed_stakes": {
                "Indian_HQ_percent_of_all": round(100 * summary["construction"]["Indian_HQ_ttpa"] / 37550, 2),
                "overseas_HQ_percent_of_all": round(100 * summary["construction"]["overseas_HQ_ttpa"] / 37550, 2),
                "unknown_percent_of_all": round(100 * summary["construction"]["unknown_ttpa"] / 37550, 2),
            },
            "construction_if_sole_shyam_parent_imputed_at_100_percent": {
                "Indian_HQ_ttpa": round(summary["construction"]["Indian_HQ_ttpa"] + 690, 3),
                "overseas_HQ_ttpa": summary["construction"]["overseas_HQ_ttpa"],
                "unknown_ttpa": round(summary["construction"]["unknown_ttpa"] - 690, 3),
            },
            "construction_if_all_unknown_allocated_overseas": {
                "Indian_HQ_ttpa": summary["construction"]["Indian_HQ_ttpa"],
                "overseas_HQ_max_ttpa": round(summary["construction"]["overseas_HQ_ttpa"] + summary["construction"]["unknown_ttpa"], 3),
                "overseas_HQ_max_percent": round(100 * (summary["construction"]["overseas_HQ_ttpa"] + summary["construction"]["unknown_ttpa"]) / 37550, 2),
            },
            "construction_plus_announced_gross_map_entries": {
                "total_ttpa": round(summary["construction"]["total_ttpa"] + summary["announced"]["total_ttpa"], 3),
                "Indian_HQ_ttpa": round(summary["construction"]["Indian_HQ_ttpa"] + summary["announced"]["Indian_HQ_ttpa"], 3),
                "overseas_HQ_ttpa": round(summary["construction"]["overseas_HQ_ttpa"] + summary["announced"]["overseas_HQ_ttpa"], 3),
                "unknown_ttpa": round(summary["construction"]["unknown_ttpa"] + summary["announced"]["unknown_ttpa"], 3),
                "warning": "Announced entries are plans, include uncertain timing, a 200% proposed JV parent record and financial investment managers; do not interpret as under-construction capacity or industrial-sponsor ownership.",
            },
        },
        "input_sha256": {
            "gem-india.json": sha256(DATA / "gem-india.json"),
            "gem-entity-hq.json": sha256(HERE / "gem-entity-hq.json"),
            "gem-current-api-india-construction-steel-units.csv": sha256(HERE / "gem-current-api-india-construction-steel-units.csv"),
        },
        "limitations": [
            "Map capacity is gross furnace capacity; replacement and current construction status require project checks.",
            "Map parent percentages are GEM-reported, not each issuer's independently corroborated disclosure.",
            "Live GEM API unit and entity records are a cross-check and may be updated after the frozen map.",
            "Entity HQ totals describe GEM's listed parent entities; they are not a certified industrial-sponsor breakdown.",
            "Investment managers such as AB CarVal are present among announced-project parent entities and are not plant operators.",
        ],
    }
    output = HERE / "checks.json"
    output.write_text(json.dumps(result, indent=2), encoding="utf-8", newline="\n")
    print(json.dumps({"status": summary, "api_unit_count": len(api_rows), "api_map_differences": differences}, indent=2))
    assert summary["construction"]["total_ttpa"] == 37550
    assert summary["announced"]["total_ttpa"] == 315506
    assert not differences


if __name__ == "__main__":
    main()
