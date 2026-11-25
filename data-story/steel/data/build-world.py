"""Join the frozen global plant file to the reporting ledger and publish the audit."""
import csv
import json
from collections import Counter
from html import escape
from math import isclose
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def read(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def emit_json(path, obj):
    (ROOT / path).write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")


def emit_csv(path, headers, rows):
    with (ROOT / path).open("w", newline="", encoding="utf-8") as handle:
        w = csv.writer(handle, lineterminator="\n")
        w.writerow(headers)
        w.writerows(rows)


def shares(project):
    """Retain a partial disclosure. Pool only its unassigned remainder."""
    weight = 0
    for owner in project["owners"]:
        fraction = owner["stake"]
        if fraction is None or fraction == 0:
            continue
        assert 0 < fraction <= 1, project["id"]
        weight += fraction
        yield owner, fraction
    assert weight <= 1 + 1e-9, project["id"]
    if weight < 1 - 1e-9:
        yield {"name":"Unallocated remainder", "country":None, "entityId":None}, 1-weight


def classify(project, country):
    if not country:
        return "Unassigned"
    return "Domestic" if country == project["country"] else "Overseas"


def summary(projects, field):
    host, hq, kind = Counter(), Counter(), Counter()
    population = [p for p in projects if p[field] is not None and p[field] > 0]
    for p in population:
        host[p["country"]] += p[field]
        for owner, fraction in shares(p):
            amount = p[field] * fraction
            hq[owner["country"] or "Unassigned"] += amount
            kind[classify(p, owner["country"])] += amount
    total = sum(host.values())
    assert isclose(sum(hq.values()), total) and isclose(sum(kind.values()), total)
    tidy = lambda c: {k:round(v, 8) for k,v in c.most_common()}
    return dict(mt=round(total, 8), plants=len(population), hosts=tidy(host), headquarters=tidy(hq), equity=tidy(kind))


def site_card(p, countries):
    gross = "Undisclosed" if p["grossMt"] is None else f'{p["grossMt"]:g} Mt/yr'
    net = "Unresolved" if p["netMt"] is None else f'{p["netMt"]:g} Mt/yr'
    refs = " · ".join(f'<a href="{escape(s["url"],quote=True)}">{escape(s["label"])}</a>' for s in p["sources"])
    stakes = []
    for owner, fraction in shares(p):
        name = escape(owner["name"])
        place = escape(countries.get(owner["country"], "Unassigned"))
        if not owner["country"] and owner.get("reportedCountry"):
            place += f'; reported office in {escape(countries.get(owner["reportedCountry"], owner["reportedCountry"]))}'
        stakes.append(f"{name} ({fraction*100:.4f}".rstrip("0").rstrip(".") + f"%, {place})")
    unstaked = [escape(o["name"]) for o in p["owners"] if o["stake"] is None]
    named = f'<p>Listed without a percentage: {", ".join(unstaked)}.</p>' if unstaked else ''
    return (f'<details id="site-{p["id"]}"><summary><strong>{escape(p["name"])}</strong>'
            f'<span>{gross}</span><small>{escape(p["decision"])}</small></summary><div>'
            f'<p><b>Checked addition: {net}.</b> {escape(p["reviewNote"])}</p>'
            f'<p>Equity allocation: {" · ".join(stakes)}.</p>{named}'
            f'<p class="links">{p["id"]} · {refs}</p></div></details>')


def build():
    plants = read("global/projects.json")["projects"]
    checks = read("global-review/review.json")
    extra = read("extra-project-checks.json")
    assert not (checks.keys() & extra.keys())
    checks.update(extra)
    assert checks.keys() <= {p["id"] for p in plants}
    world, plant_csv, equity_csv = [], [], []
    fallback = dict(decision="Net addition unverified", netMt=None,
                    reason="The September tracker establishes a construction record. This investigation has no separate project-level determination of the additional steelmaking capacity at the cutoff.", sources=[])
    countries = {r["iso3"]:r["name"] for r in read("../dashboard/countries.json")["countries"] if r["iso3"]}
    for p in plants:
        r = checks.get(p["id"], fallback)
        net = r["netMt"]
        assert net is None or (net >= 0 and p["grossMt"] is not None and net <= p["grossMt"] + 1e-8)
        unique = {s["url"]:s for s in [*p["sources"], *r["sources"]]}
        row = dict(p, netMt=net, decision=r["decision"], reviewNote=r["reason"], sources=list(unique.values()),
                   reviewed=p["id"] in checks)
        assert p["country"] in countries and all(not o["country"] or o["country"] in countries for o in p["owners"])
        world.append(row)
        plant_csv.append([p["id"], p["name"], p["country"], p["lat"], p["lon"], p["operator"], p["grossMt"], net,
                          row["reviewed"], r["decision"], r["reason"], " | ".join(unique)])
        for o, fraction in shares(p):
            allocate = lambda n: None if n is None else round(fraction*n, 9)
            equity_csv.append([p["id"], p["name"], p["country"], o.get("entityId"), o["name"], o["country"],
                               classify(p,o["country"]), round(fraction,9), allocate(p["grossMt"]), allocate(net)])
    world.sort(key=lambda p:(p["grossMt"] is None,-(p["grossMt"] or 0),p["id"]))
    gross, net = summary(world,"grossMt"), summary(world,"netMt")
    # Stress test: apply measured corrections, then retain full GEM ratings at every unresolved site.
    partial = summary([dict(p, adjustedMt=p["grossMt"] if p["netMt"] is None else p["netMt"]) for p in world], "adjustedMt")
    assert len(world) == len({p["id"] for p in world}) == 107 and isclose(gross["mt"],171.388)
    emit_json("world.json",dict(asOf="September 2026",projects=world))
    stats = dict(gross=gross, net=net, reviewedCorrectionsOnly=partial, checks=len(checks), checkedGrossMt=round(sum(p["grossMt"] or 0 for p in world if p["reviewed"]),6),
                 zeroSites=sum(p["netMt"] == 0 for p in world),pendingSites=sum(p["netMt"] is None for p in world))
    emit_json("world-summary.json",stats)
    emit_csv("world-projects.csv",["gem_plant_id","plant","host_iso3","latitude","longitude","operator","gem_gross_mt_per_year",
             "checked_net_mt_per_year","project_reviewed","decision","evidence_note","source_urls"],plant_csv)
    emit_csv("world-equity.csv",["gem_plant_id","plant","host_iso3","gem_entity_id","owner_or_residual","hq_iso3",
             "allocation","share","gross_mt_per_year","checked_net_mt_per_year"],equity_csv)
    by_id = {p["id"]:p for p in world}
    unit_rows = []
    for unit in read("global/api-construction-steel-units.json")["units"].values():
        p = by_id[unit["location_id"]]
        unit_rows.append([unit["unit_id"], p["id"], p["name"], p["country"], p["lat"], p["lon"], unit["unit"],
                          unit["category"], unit["status"],unit["capacity_ttpa"],unit["url"]])
    assert len({r[0] for r in unit_rows}) == len(unit_rows) == 160
    emit_csv("world-unit-plant-join.csv",["gem_unit_id","gem_plant_id","plant","host_iso3","latitude","longitude","furnace",
             "method","november_api_status","november_api_kt_per_year","gem_asset_url"], sorted(unit_rows,key=lambda r:(r[1],r[0])))
    method = ROOT.parent / "method/index.html"
    start,end = "<!-- audit-start -->","<!-- audit-end -->"
    before,rest = method.read_text(encoding="utf-8").split(start)
    _,after = rest.split(end)
    groups, links = [], []
    for host in sorted({p["hostName"] for p in world}):
        sites = [p for p in world if p["hostName"] == host]
        links.append(f'<a href="#host-{sites[0]["country"]}">{escape(host)}</a>')
        groups.append(f'<h3 id="host-{sites[0]["country"]}">{escape(host)}</h3>\n' + "\n".join(site_card(p,countries) for p in sites))
    jump = '<details class="host-nav"><summary>Jump to a country</summary><nav aria-label="Jump to host country">' + " ".join(links) + '</nav></details>'
    method.write_text(before+start+"\n"+jump+"\n"+"\n".join(groups)+"\n"+end+after, encoding="utf-8", newline="\n")
    return stats


if __name__ == "__main__":
    print(json.dumps(build(), indent=2))
