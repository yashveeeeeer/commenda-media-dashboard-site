"""Publish article figures and methodology from the same records as the map."""
import json
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def number(value, places=1):
    step = Decimal(1).scaleb(-places)
    return str(Decimal(str(value)).quantize(step, rounding=ROUND_HALF_UP))


def insert(path, key, html):
    target = ROOT / path
    start, end = f"<!-- {key}-start -->", f"<!-- {key}-end -->"
    before, rest = target.read_text(encoding="utf-8").split(start)
    _, after = rest.split(end)
    target.write_text(before + start + "\n" + html + "\n" + end + after,
                      encoding="utf-8", newline="\n")


stats = read("data/world-summary.json")
projects = read("data/world.json")["projects"]
countries = {r["iso3"]: r["name"] for r in read("dashboard/countries.json")["countries"]}
countries.update(CHN="China", USA="United States")
gross, adjusted, net = stats["gross"], stats["reviewedCorrectionsOnly"], stats["net"]
categories = ("Domestic", "Overseas", "Unassigned")
labels = ("Domestic", "Overseas", "Unassigned")


def share(scope, category):
    return 100 * scope["equity"][category] / scope["mt"]


def host_and_owner_chart():
    hosts, owners = gross["hosts"], gross["headquarters"]
    top_hosts = list(hosts)[:5]
    top_owners = [c for c in owners if c != "Unassigned"][:4]
    shown = list(dict.fromkeys(top_hosts + top_owners))
    maximum = max(max(hosts.values()), max(owners[c] for c in top_owners))
    rows = []
    for code in shown:
        cells = []
        for data in (hosts, owners):
            value = data.get(code, 0)
            cells.append(f'<td><span>{number(value)}</span><div class="geo-track" aria-hidden="true"><i style="width:{100*value/maximum:.5f}%"></i></div></td>')
        rows.append(f'<tr><th scope="row">{countries[code]}</th>{"".join(cells)}</tr>')
    return ('<table class="geo-table"><caption>Annual capacity, million tonnes</caption>'
            '<thead><tr><th scope="col">Country</th><th scope="col">At its mills</th>'
            '<th scope="col">Held by its companies</th></tr></thead>'
            f'<tbody>{"".join(rows)}</tbody></table>')


insert("index.html", "hosts", host_and_owner_chart())
dom, abroad, missing = (gross["equity"][c] for c in categories)
host_dom = {}
for p in projects:
    domestic = sum(o["stake"] or 0 for o in p["owners"] if o["country"] == p["country"])
    host_dom[p["country"]] = host_dom.get(p["country"], 0) + domestic * (p["grossMt"] or 0)

equity_text = f"""<p>Companies based in the country where the steel is being built account for <strong>{number(dom)} million tonnes a year, or {number(share(gross, "Domestic"))}% of the construction total</strong>. That clears the halfway mark by just {number(dom - gross["mt"]/2)} million tonnes. Overseas industrial owners account for {number(abroad)} million. For the other {number(missing)} million, the available ownership records stop short of an industrial sponsor, a percentage or a headquarters country. <a class="ref" href="method/#ownership" aria-label="Ownership sources and allocation rules">2a</a></p>
<p>China and India lead on both sides of the map. Of the {number(gross["hosts"]["CHN"])} million tonnes being built in China, {number(host_dom["CHN"])} million trace to Chinese companies. In India, local companies account for {number(host_dom["IND"])} million of {number(gross["hosts"]["IND"])} million. Hazira and Anakapalle account for India’s identified overseas share. GEM includes both sites in its construction list. At Anakapalle, ArcelorMittal still described the 8.2 million tonne project as announced in its September-quarter report. Its rating counts in the construction figure, while the timing of the new capacity remains unconfirmed. <a class="ref" href="method/#site-P100001025671" aria-label="Anakapalle status and ownership evidence">2b</a></p>
<p>Luxembourg ranks third among the headquarters countries we can identify. Its steel companies account for {number(gross["headquarters"]["LUX"])} million tonnes of annual furnace capacity under construction, all of it abroad. Japan’s {number(gross["headquarters"]["JPN"])} million tonnes are also entirely overseas. Neither country has a furnace on this construction list.</p>"""
insert("index.html", "equity", equity_text)

scopes = [
    (gross, "Construction list", "All rated furnaces", "dashboard/?view=owners"),
    (adjusted, "After measured corrections", "Unresolved sites keep their full rating", "dashboard/?measure=adjusted&amp;view=owners"),
    (net, "Confirmed additions only", "Only documented positive gains", "dashboard/?measure=net&amp;view=owners"),
]


def scope_chart():
    rows = []
    for scope, name, note, link in scopes:
        cells = "".join(f'<span style="width:{share(scope, c):.6f}%"></span>' for c in categories)
        shares = "".join(f'<span><i aria-hidden="true"></i>{label} <b>{number(share(scope, c))}%</b></span>'
                         for c, label in zip(categories, labels))
        rows.append(f'<div class="scope-row"><div class="scope-title"><h3><a href="{link}">{name}</a></h3>'
                    f'<b>{number(scope["mt"])} Mt/yr</b></div><p>{note}</p>'
                    f'<div class="scope-bar" aria-hidden="true">{cells}</div>'
                    f'<div class="scope-key">{shares}</div></div>')
    return "".join(rows)


net_text = f"""<p>Timing matters, too. In Bangladesh, a reporter for <i>Prothom Alo</i> visited in June and found Meghna’s steel plant already built and waiting for gas. Its 1.4 million tonnes remain on the September tracker list, but the construction was finished before the cutoff. <a class="ref" href="method/#site-P100001042845" aria-label="Meghna project scope and site reporting">8</a></p>
<p>Apply the corrections we could measure and leave every unresolved project at its full furnace rating. Under that assumption, the construction total falls from {number(gross['mt'])} to {number(adjusted['mt'])} million tonnes a year. The share attributable to owners based in the host country falls from <strong>{number(share(gross,"Domestic"))}% to {number(share(adjusted,"Domestic"))}%</strong>. On this measure another {number(adjusted["mt"]/2-adjusted["equity"]["Domestic"])} million of the {number(adjusted["equity"]["Unassigned"])} million unassigned tonnes would have to trace to domestic owners for their share to reach half. <a class="ref" href="method/#checks" aria-label="Capacity corrections and sensitivity checks">9</a></p>
<figure class="figure scope-figure" id="replacement-check"><div class="figure-heading"><span>Fig. 03</span><h2>Does the domestic majority hold?</h2></div>
{scope_chart()}
<figcaption>Each bar divides the annual capacity shown above it among owners. The centre mark is 50%. Select a measure to inspect its projects and owners on the dashboard. Percentages may differ from 100% by rounding.</figcaption></figure>
<p>We checked all {stats['checks']} plants. At {net['plants']} in {len(net['hosts'])} countries we could document an increase. Together they add {number(net['mt'])} million tonnes a year. Plants in India account for {number(net['hosts']['IND'])} million of that total. In Iran we could trace {number(net['hosts']['IRN'])} million to new billet furnaces at Mianeh and Abarkouh. <a class="ref" href="method/#site-P100000120601" aria-label="Mianeh furnace evidence">10</a> <a class="ref" href="method/#site-P100000120615" aria-label="Abarkouh furnace evidence">11</a> At {stats['zeroSites']} sites we found zero eligible additions. At the remaining {stats['pendingSites']}, the evidence leaves the net amount open.</p>
<p>Hazira’s six million tonnes count in every measure. Port Talbot’s 3.2 million appear on the construction list and drop out once its old works are counted. Both projects move tonnes across borders on the ownership map. Only one expands steelmaking capacity. That distinction, still unresolved at dozens of sites, keeps the global ownership of the gains an open question.</p>"""
insert("index.html", "net", net_text)

insert("method/index.html", "join", '<p>The frozen API includes 160 steelmaking units. Grouping them by plant and furnace method gives one numerical difference from the release. At BAP Al-Khair, the API gives 1.5 Mt/yr and the September file gives 1.7. The map keeps the September figure. The resulting worldwide totals are 171.188 and 171.388 Mt/yr respectively. <a href="../data/global/audit.json">Unit reconciliation and source checksums</a></p>')

rows = []
for scope, title, _, link in scopes:
    values = [scope["equity"][c] for c in categories] + [scope["mt"]]
    cells = "".join(f'<td class="num">{number(v, 2)}</td>' for v in values)
    rows.append(f'<tr><th scope="row"><a href="../{link}">{title}</a></th>{cells}</tr>')
unreviewed = len(projects) - stats["checks"]
coverage = (f"That includes {unreviewed} with no separate project-level ruling." if unreviewed
            else "Each unresolved site has a project-level note explaining the missing evidence.")
counts = f"""<p>We made {stats['checks']} site-specific checks covering {number(stats['checkedGrossMt'], 3)} Mt/yr of the September list. Of {len(projects)} sites, {net['plants']} have a measured positive addition and {stats['zeroSites']} contribute zero. At {stats['pendingSites']} sites the net amount is unresolved. {coverage} The checked positives total {number(net['mt'])} Mt/yr. Project evidence varies by country, so this subset cannot estimate worldwide ownership of net additions.</p>
<p>Holding every unresolved project at its full rating and applying all measured corrections gives {number(adjusted['mt'], 3)} Mt/yr. Domestic owners account for {number(adjusted['equity']['Domestic'], 2)} Mt/yr in that scenario. It is one way to test the effect of the documented corrections.</p>
<div class="numbers"><table><caption>Equity-weighted annual capacity, Mt/yr</caption><thead><tr><th scope="col">Capacity measure</th><th scope="col" class="num">Domestic</th><th scope="col" class="num">Overseas</th><th scope="col" class="num">Unassigned</th><th scope="col" class="num">Total</th></tr></thead><tbody>{''.join(rows)}</tbody></table></div>
<p>The figures above keep each unassigned stake in grey. On the construction list, assigning all {number(missing,2)} unassigned Mt/yr overseas would lift overseas capacity to {number(abroad+missing,2)} Mt/yr, against {number(dom,2)} attributed domestically. Assigning all of it domestically would lift domestic capacity to {number(dom+missing,2)} Mt/yr. These extremes test the effect of missing shares. Neither allocation enters the maps.</p>"""
insert("method/index.html", "check", counts)
