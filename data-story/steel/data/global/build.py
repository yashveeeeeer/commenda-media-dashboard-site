"""Build a conservative global construction-steel project set from frozen feeds.

Run: python data-story/steel/data/global/build.py
This is offline. `fetch.py` refreshes source files from GEM's public feeds.
"""

import hashlib
import json
import re
from collections import defaultdict, deque
from pathlib import Path


HERE = Path(__file__).resolve().parent
STEEL_METHODS = {"BOF", "EAF", "IF", "OHF", "Other/unspecified steel"}
API_METHODS = {
    "bof": "BOF", "eaf": "EAF", "induction": "IF", "open_hearth": "OHF",
    "unknown_other_steel": "Other/unspecified steel",
}
PARENT_RE = re.compile(r"^\s*(E\d+)(?:\s*\[(\d+(?:\.\d+)?)%\])?\s*$")
NAME_SHARE_RE = re.compile(r"\s*\[(\d+(?:\.\d+)?)%\]\s*$")
FINANCIAL_RE = re.compile(
    r"\b(bank|financial|finance|fund|investments?|investors?|capital|securities|"
    r"custody|trustee|insurance|advisors?|credit|asset management)\b", re.I
)
ALIASES = {
    "China": "CHN", "Türkiye": "TUR", "United States": "USA",
}
ROLE_SOURCES = {
    "E100000131187": "https://region9.mgb.gov.ph/images/Mineral_Statistics/2025/Directory_of_Producing_Mines_and_Quarries_2025.pdf",
    "E100000124688": "https://www.rizhaosteel.com/en/introduce/",
    "E100001016199": "https://gruppobeltrame.com/",
}


def load(name):
    return json.loads((HERE / name).read_text(encoding="utf-8"))


def write(name, value):
    (HERE / name).write_bytes(json.dumps(value, indent=2, ensure_ascii=False).encode("utf-8"))


def hash_file(name):
    return hashlib.sha256((HERE / name).read_bytes()).hexdigest()


def country_crosswalk(plants, entities):
    # Dashboard geometry was derived from Natural Earth 50m admin-0 boundaries.
    dashboard = HERE.parent.parent / "dashboard" / "countries.json"
    ne = json.loads(dashboard.read_text(encoding="utf-8"))
    by_name = {c["name"]: c["iso3"] for c in ne["countries"] if c.get("iso3")}
    names = {p.get("country-area1") for p in plants}
    names |= {e.get("headquarters_country") for e in entities.values()}
    names.discard(None)
    crosswalk = {}
    missing = []
    for name in sorted(names):
        iso3 = ALIASES.get(name) or by_name.get(name)
        if not iso3:
            missing.append(name)
        crosswalk[name] = {
            "iso3": iso3,
            "basis": "explicit alias to Natural Earth ISO_A3_EH" if name in ALIASES else "Natural Earth name and ISO_A3_EH",
        }
    if missing:
        raise ValueError(f"Unmatched country names: {missing}")
    write("country-crosswalk.json", {
        "source": ne.get("source"), "rule": ne.get("crosswalk"),
        "local_dashboard_geometry_sha256": hashlib.sha256(dashboard.read_bytes()).hexdigest(),
        "names": crosswalk,
    })
    return {name: item["iso3"] for name, item in crosswalk.items()}


def numeric_steel_capacity(plant, status):
    by_method = defaultdict(float)
    unknown = []
    for item in plant.get("capacity-by-status", []):
        if item.get("status") != status or item.get("method") not in STEEL_METHODS:
            continue
        try:
            by_method[item["method"]] += float(item["capacity"])
        except (ValueError, TypeError):
            unknown.append({"method": item.get("method"), "capacity": item.get("capacity")})
    return dict(by_method), unknown


def parse_parents(plant):
    ids = [x.strip() for x in (plant.get("parent-gem-id") or "").split(";") if x.strip()]
    names = [x.strip() for x in (plant.get("parent") or "").split(";") if x.strip()]
    if len(ids) != len(names):
        raise ValueError(f"Parent name/ID count differs for {plant['project-id']}")
    parsed = []
    for raw_id, raw_name in zip(ids, names):
        match = PARENT_RE.match(raw_id)
        if not match:
            raise ValueError(f"Bad parent ID {raw_id} at {plant['project-id']}")
        parsed.append({
            "entityId": match.group(1),
            "mapName": NAME_SHARE_RE.sub("", raw_name),
            "mapStake": float(match.group(2)) / 100 if match.group(2) else None,
        })
    return parsed


def shortest_chain(start_ids, parent_id, graphs):
    best = None
    for start in start_ids:
        graph = graphs.get(start, {})
        if graph.get("error"):
            continue
        node_names = {node["entity_id"]: node.get("entity_name") for node in graph.get("nodes", [])}
        upstream = defaultdict(list)
        for edge in graph.get("edges", []):
            upstream[edge["to_entity_id"]].append(edge)
        queue = deque([(start, [{
            "entityId": start, "name": node_names.get(start), "ownershipOfPrevious": None,
        }])])
        visited = {start}
        while queue:
            current, path = queue.popleft()
            if current == parent_id:
                if best is None or len(path) < len(best):
                    best = path
                break
            for edge in upstream.get(current, []):
                parent = edge["from_entity_id"]
                if parent in visited:
                    continue
                visited.add(parent)
                pct = edge.get("ownership_percentage")
                queue.append((parent, path + [{
                    "entityId": parent,
                    "name": node_names.get(parent) or edge.get("from_entity_name"),
                    "ownershipOfPrevious": float(pct) / 100 if pct is not None else None,
                }]))
    return best or []


def map_owners(plant, entities, iso3, graphs, industrial_allow):
    parts = parse_parents(plant)
    start_ids = re.findall(r"E\d+", plant.get("owner-gem-id") or "")
    known = sum(x["mapStake"] or 0 for x in parts)
    flags = []
    if known > 1.000001:
        flags.append("overfull-map-stakes")
        return [{
            "name": "Unresolved overlapping parent stakes", "entityId": None,
            "country": None, "reportedCountry": None, "stake": 1.0,
            "role": "unknown", "chain": [], "chainStatus": "GEM parent shares sum above 100%; no normalization",
            "basis": "GEM map parent record excluded from allocation",
        }], flags

    owners = []
    for part in parts:
        entity_id = part["entityId"]
        entity = entities.get(entity_id, {})
        name = entity.get("full_name") or entity.get("name") or part["mapName"]
        reported_country = iso3.get(entity.get("headquarters_country"))
        chain = shortest_chain(start_ids, entity_id, graphs)
        explicit_unknown = entity.get("entity_type") in ("unknown entity", "person") or name.lower() in ("unknown", "small shareholder(s)", "natural person(s)")
        financial = bool(FINANCIAL_RE.search(name)) or name == "Public Investment Fund (Saudi Arabia)"
        untraced_holding = not chain and bool(re.search(r"\bholdings?\b", name, re.I))
        if explicit_unknown:
            role = "unresolved shareholder pool"
        elif financial:
            role = "financial or investment entity; industrial role unverified"
        elif untraced_holding:
            role = "untraced holding company"
        elif entity_id in industrial_allow:
            role = "GEM-listed industrial parent; editorial role screen"
        else:
            role = "unverified parent or pass-through entity"
        assign_country = bool(
            part["mapStake"] is not None and reported_country and entity_id in industrial_allow
            and not explicit_unknown and not financial and not untraced_holding
        )
        if part["mapStake"] is None:
            flags.append("unquantified-parent-stake")
        if not reported_country:
            flags.append("parent-HQ-unavailable")
        if financial:
            flags.append("financial-parent-omitted-from-industrial-location")
        if untraced_holding:
            flags.append("untraced-holding-omitted-from-industrial-location")
        if entity_id not in industrial_allow and not explicit_unknown:
            flags.append("parent-not-in-reviewed-industrial-allowlist")
        if not chain:
            flags.append("no-live-GEM-chain-to-parent")
        owners.append({
            "name": name, "entityId": entity_id,
            "country": reported_country if assign_country else None,
            "reportedCountry": reported_country,
            "stake": part["mapStake"], "role": role, "chain": chain,
            "chainStatus": "shortest path in live GEM owner graph" if chain else "no path in live GEM owner graph",
            "basis": "GEM September 2026 map parent stake and current GEM entity HQ",
            "mapName": part["mapName"], "entitySource": entity.get("url"),
        })
    residual = max(0, 1 - known)
    if residual > 0.000001:
        flags.append("undisclosed-residual-stake")
        owners.append({
            "name": "Unreported remaining equity", "entityId": None,
            "country": None, "reportedCountry": None, "stake": round(residual, 6),
            "role": "unknown", "chain": [], "chainStatus": "residual to 100%",
            "basis": "arithmetic residual of GEM map parent stakes",
        })
    return owners, sorted(set(flags))


def allocation(projects, use_reported=False):
    totals = defaultdict(float)
    by_host = defaultdict(lambda: defaultdict(float))
    by_project = []
    for project in projects:
        gross = project["grossMt"]
        if gross is None:
            continue
        host = project["country"]
        group = defaultdict(float)
        known = sum(o["stake"] or 0 for o in project["owners"])
        if known > 1.000001:
            group["unknown"] += gross
        else:
            for owner in project["owners"]:
                share = owner["stake"] or 0
                loc = (owner.get("reportedCountry") or owner.get("country")) if use_reported else owner.get("country")
                category = "unknown" if not loc else "domestic" if loc == host else "cross-border"
                group[category] += gross * share
            if known < 0.999999:
                group["unknown"] += gross * (1 - known)
        for key, value in group.items():
            totals[key] += value
            by_host[host][key] += value
        by_project.append({"id": project["id"], "host": host, **{k: round(group[k], 6) for k in ("domestic", "cross-border", "unknown")}})
    return {
        "globalMt": {k: round(totals[k], 6) for k in ("domestic", "cross-border", "unknown")},
        "byHostMt": {h: {k: round(v[k], 6) for k in ("domestic", "cross-border", "unknown")} for h, v in sorted(by_host.items())},
        "byProjectMt": by_project,
    }


def main():
    plants = load("raw-map-projects.json")
    announced = load("raw-map-announced.json")
    entities = load("api-parent-entities.json")
    graphs = load("api-owner-graphs.json")
    units_data = load("api-construction-steel-units.json")
    overrides = load("issuer-overrides.json")
    role_review = load("industry-owner-allowlist.json")
    industrial_allow = set(role_review["allow"])
    unresolved_parents = role_review["unresolvedParents"]
    headquarters = role_review["headquartersDisclosures"]
    assert industrial_allow.isdisjoint(unresolved_parents)
    assert headquarters.keys() <= industrial_allow
    map_source = load("map-source.json")
    iso3 = country_crosswalk(plants, entities)

    projects = []
    map_by_method = defaultdict(float)
    for plant in plants:
        method_cap, nonnumeric = numeric_steel_capacity(plant, "construction")
        gross_ttpa = sum(method_cap.values())
        gross = gross_ttpa / 1000 if gross_ttpa else None
        plant_id = plant["project-id"]
        for method, cap in method_cap.items():
            map_by_method[(plant_id, method)] += cap
        owners, flags = map_owners(plant, entities, iso3, graphs, industrial_allow)
        if nonnumeric:
            flags.append("unquantified-steel-capacity")
        sources = [
            {"label": "GEM September 2026 (V1) public map GeoJSON", "url": map_source["url"]},
            {"label": "GEM plant dossier", "url": plant["url"]},
        ]
        override = overrides.get(plant_id)
        basis = "GEM September 2026 map parent stakes and current GEM entity HQ"
        for owner in owners:
            disclosure = headquarters.get(owner["entityId"])
            if disclosure:
                assert not owner["reportedCountry"] and owner["stake"] is not None
                owner["country"] = disclosure["country"]
                owner["basis"] = basis = disclosure["reason"]
                sources.append({"label": disclosure["label"], "url": disclosure["url"]})
            ruling = unresolved_parents.get(owner["entityId"])
            if ruling:
                assert owner["country"] is None
                owner["role"] = ruling["role"]
                owner["basis"] = basis = ruling["reason"]
                sources.append({"label": ruling["label"], "url": ruling["url"]})
        operator = plant.get("owner")
        operator_status = "GEM map first owner/operator; role not independently verified"
        operator_ids = re.findall(r"E\d+", plant.get("owner-gem-id") or "")
        if operator and FINANCIAL_RE.search(operator):
            operator = None
            operator_status = "GEM owner field names an investment or financial entity; plant operator not independently verified"
            flags.append("operator-not-verified-financial-or-holding-name")
        if override:
            owners = override["owners"]
            operator = override["operator"]
            operator_status = override["operatorStatus"]
            operator_ids = override.get("operatorEntityIds", operator_ids)
            sources.extend(override["sources"])
            flags.append(override.get("flag", "issuer-owner-override"))
            basis = override["reason"]
        project = {
            "id": plant_id,
            "name": plant["name"],
            "state": plant.get("subnational"),
            "country": iso3[plant["country-area1"]],
            "hostName": plant["country-area1"],
            "lat": plant.get("Latitude"),
            "lon": plant.get("Longitude"),
            "operator": operator,
            "grossMt": round(gross, 6) if gross is not None else None,
            "owners": owners,
            "sources": sources,
            "operatorEntityIds": operator_ids,
            "operatorStatus": operator_status,
            "capacityByMethodTtpa": method_cap,
            "nonnumericConstructionSteel": nonnumeric,
            "coordinateAccuracy": plant.get("location-accuracy"),
            "rawGemOwner": plant.get("owner"),
            "rawGemOwnerIds": plant.get("owner-gem-id"),
            "rawGemParent": plant.get("parent"),
            "rawGemParentIds": plant.get("parent-gem-id"),
            "ownershipBasis": basis,
            "flags": sorted(set(flags)),
        }
        projects.append(project)
    projects.sort(key=lambda p: (p["grossMt"] is None, -(p["grossMt"] or 0), p["id"]))
    write("projects.json", {"projects": projects})

    # Every source-listed parent gets a visible editorial role decision, even
    # if an issuer override later replaces its stake in projects.json.
    role_usage = defaultdict(lambda: {"projectIds": set(), "grossMapStakeMt": 0.0})
    for plant in plants:
        gross = sum(numeric_steel_capacity(plant, "construction")[0].values()) / 1000
        for parent in parse_parents(plant):
            usage = role_usage[parent["entityId"]]
            usage["projectIds"].add(plant["project-id"])
            usage["grossMapStakeMt"] += gross * (parent["mapStake"] or 0)
    decisions = []
    for entity_id, entity in sorted(entities.items()):
        name = entity.get("full_name") or entity.get("name") or ""
        if entity_id in industrial_allow:
            decision = "reviewed industrial parent"
            reason = "Named steelmaker, steel manufacturing group, or industrial mineral/metal producer behind a GEM-mapped plant; issuer equity path not certified unless separately overridden."
        elif entity_id in unresolved_parents:
            decision = "grey"
            reason = unresolved_parents[entity_id]["reason"]
        elif entity.get("entity_type") in ("unknown entity", "person"):
            decision = "grey"
            reason = "Unidentified shareholder pool or natural persons; no country assigned."
        elif re.search(r"labor|trade union", name, re.I):
            decision = "grey"
            reason = "Worker or trade-union committee, not established steelmaking sponsor."
        elif FINANCIAL_RE.search(name):
            decision = "grey"
            reason = "Financial, advisory, custody or investment entity; not identified as steelmaking operator."
        elif re.search(r"trad(e|ing)|sales|commo|consult|SPV|foundation|stiftung|holdings?", name, re.I):
            decision = "grey"
            reason = "Trading, consultancy, foundation or holding/pass-through role is not resolved to an industrial sponsor."
        else:
            decision = "grey"
            reason = "Industrial sponsor role not established by this review."
        usage = role_usage[entity_id]
        decisions.append({
            "entityId": entity_id, "name": name,
            "GEMHeadquartersCountry": entity.get("headquarters_country"),
            "iso3": iso3.get(entity.get("headquarters_country")),
            "decision": decision, "reason": reason,
            "projectIds": sorted(usage["projectIds"]),
            "grossMapStakeMt": round(usage["grossMapStakeMt"], 6),
            "GEMEntitySource": entity.get("url"),
            "additionalRoleSource": (unresolved_parents.get(entity_id) or headquarters.get(entity_id) or {}).get("url", ROLE_SOURCES.get(entity_id)),
        })
    write("owner-role-review.json", {
        "method": "Manual allowlist of named industrial groups, default grey for every other source-listed parent. Role decisions are distinct from issuer-verified equity overrides.",
        "reviewedEntityCount": len(decisions),
        "industrialAllowlistCount": len(industrial_allow),
        "decisions": decisions,
    })

    api_by_method = defaultdict(float)
    for unit in units_data["units"].values():
        method = API_METHODS.get(unit.get("category"))
        if method and unit.get("capacity_ttpa") is not None:
            api_by_method[(unit["location_id"], method)] += float(unit["capacity_ttpa"])
    differences = [
        {"plantId": k[0], "method": k[1], "mapTtpa": round(map_by_method.get(k, 0), 3),
         "apiTtpa": round(api_by_method.get(k, 0), 3)}
        for k in sorted(map_by_method.keys() | api_by_method.keys())
        if abs(map_by_method.get(k, 0) - api_by_method.get(k, 0)) > 0.01
    ]
    announced_numeric = [
        (p, sum(numeric_steel_capacity(p, "announced")[0].values())) for p in announced
    ]
    announced_numeric = [(p, cap) for p, cap in announced_numeric if cap > 0]
    known = allocation(projects)
    raw_hq = allocation(projects, use_reported=True)
    summary = {
        "fixedMap": map_source,
        "construction": {
            "quantifiedPlants": sum(p["grossMt"] is not None for p in projects),
            "unquantifiedPlants": [p["id"] for p in projects if p["grossMt"] is None],
            "quantifiedHostCount": len({p["country"] for p in projects if p["grossMt"] is not None}),
            "grossMt": round(sum(p["grossMt"] or 0 for p in projects), 6),
        },
        "announcedOnly": {
            "quantifiedPlants": len(announced_numeric),
            "grossMt": round(sum(cap for _, cap in announced_numeric) / 1000, 6),
            "note": "Announced steelmaking entries only, including at plants also under construction; plans are not part of the construction total.",
        },
        "reviewedIndustryRoleParentHQ": known,
        "reportedParentHQAfterIssuerOverridesIncludingFinancialEntities": raw_hq,
        "liveApiUnitCheck": {
            "unitCount": len(units_data["units"]),
            "unitGrossMt": round(sum(float(u["capacity_ttpa"]) for u in units_data["units"].values() if u.get("capacity_ttpa") is not None) / 1000, 6),
            "plantMethodDifferences": differences,
            "caveat": "Live GEM API units may differ from the fixed September 2026 map; these are a cross-check, not the release source.",
        },
        "inputSha256": {name: hash_file(name) for name in (
            "raw-map-projects.json", "raw-map-announced.json", "api-parent-entities.json",
            "api-owner-graphs.json", "api-construction-steel-units.json", "issuer-overrides.json",
            "country-crosswalk.json",
            "industry-owner-allowlist.json",
            "owner-role-review.json",
        )},
        "notes": [
            "Capacity is nominal crude steelmaking, not ironmaking, output or net new capacity after replacements.",
            "GEM map parent shares and current entity headquarters are source-reported; issuer overrides are listed project by project.",
            "Financial/investment parents, unknown HQs, missing stakes and untraced holding entities have owner.country=null; reportedCountry retains GEM HQ separately.",
            "The conservative HQ layer assigns GEM-listed parents only from a manually reviewed industrial-role allowlist, with issuer overrides where available; it is not a certification of each equity chain.",
            "No fund manager or financial owner is labeled the plant operator.",
        ],
    }
    write("audit.json", summary)
    for project in projects:
        assert len(project["country"]) == 3
        assert not (project["operator"] and FINANCIAL_RE.search(project["operator"]))
        assert sum(owner.get("stake") or 0 for owner in project["owners"]) <= 1.000001
        for owner in project["owners"]:
            if owner["country"]:
                assert len(owner["country"]) == 3
                assert owner["role"] in (
                    "GEM-listed industrial parent; editorial role screen", "industrial sponsor"
                )
            if owner["role"] in ("unknown", "sovereign financial owner"):
                assert owner["country"] is None
    assert abs(sum(known["globalMt"].values()) - 171.388) < 0.00001
    assert abs(sum(raw_hq["globalMt"].values()) - 171.388) < 0.00001
    write("source-manifest.json", {
        "title": "Global construction crude-steel project source package",
        "citation": "Global Iron and Steel Tracker, Global Energy Monitor, September 2026 (V1) release.",
        "mapTrackerPage": "https://globalenergymonitor.org/projects/global-iron-steel-tracker",
        "mapConfig": "https://globalenergymonitor.github.io/interim-maps/trackers/gist/config.js",
        "mapGeojson": map_source["url"],
        "fullMapSha256": map_source["full_geojson_sha256"],
        "mapGlobalPlantCount": map_source["full_plant_count"],
        "mapRetrievedAtUTC": map_source["retrieved_at_utc"],
        "apiDocs": "https://api.globalenergymonitor.org/redoc",
        "entityEndpoint": "https://api.globalenergymonitor.org/entities/{entity_id}",
        "operatorGraphEndpoint": "https://api.globalenergymonitor.org/entities/{entity_id}/graph/up",
        "currentSteelUnitQuery": units_data["query_url"],
        "naturalEarthBoundaries": "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_admin_0_countries.geojson",
        "naturalEarthCrosswalk": "country-crosswalk.json",
        "license": "https://globalenergymonitor.org/creative-commons-license",
        "measure": "Nominal crude steelmaking furnace capacity, million tonnes per year; ironmaking is excluded. Construction and announced are GEM status categories, not a time series.",
        "construction": summary["construction"],
        "announcedOnly": summary["announcedOnly"],
        "liveApiCaveat": "GEM's public API is live; it is a cross-check and may have changed since the frozen September map. The BAP Al-Khair EAF unit is 1.5 Mtpa live versus 1.7 Mtpa in the September map.",
        "rolePolicy": "Only manually allowlisted industrial parents and explicit issuer overrides have owner.country assigned. Unquantified shares, unknown HQs, financial managers, custody, unions, opaque trading/consultancy/holding entities remain grey with country=null; reportedCountry preserves GEM HQ evidence.",
        "industrialRoleReview": "owner-role-review.json",
        "issuerOverrides": "issuer-overrides.json",
        "issuerOverrideProjectCount": sum(not record.get("flag") for record in overrides.values()),
        "officialEntityMatchReviewCount": sum(record.get("flag") == "official-entity-match-review" for record in overrides.values()),
        "reviewedParentEntityCount": len(decisions),
        "industrialRoleAllowlistCount": len(industrial_allow),
        "reproduceOffline": "python data-story/steel/data/global/build.py",
        "refreshPublicFeeds": "python data-story/steel/data/global/fetch.py --map --entities --graphs --units",
        "localFileSha256": {name: hash_file(name) for name in (
            "raw-map-projects.json", "raw-map-announced.json", "map-source.json",
            "api-parent-entities.json", "api-owner-graphs.json", "api-construction-steel-units.json",
            "country-crosswalk.json", "industry-owner-allowlist.json", "owner-role-review.json",
            "issuer-overrides.json", "projects.json", "audit.json",
        )},
    })
    print(json.dumps({
        "construction": summary["construction"],
        "announcedOnly": summary["announcedOnly"],
        "roleFilteredHQ": known["globalMt"],
        "reportedHQ": raw_hq["globalMt"],
        "liveApiUnits": summary["liveApiUnitCheck"]["unitCount"],
        "liveApiMapDifferenceCount": len(differences),
    }, indent=2))
    assert summary["construction"]["quantifiedPlants"] == 106
    assert summary["construction"]["quantifiedHostCount"] == 30
    assert summary["construction"]["grossMt"] == 171.388


if __name__ == "__main__":
    main()
