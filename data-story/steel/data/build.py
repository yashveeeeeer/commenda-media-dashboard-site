"""Build the original India evidence and 13-site decision ledger, offline."""

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
STEEL = {"BOF", "EAF", "IF", "OHF", "Other/unspecified steel"}


def source(label, url):
    return {"label": label, "url": url}


AM_FILING = source("ArcelorMittal, 2025 financial statements, joint ventures", "https://www.sec.gov/Archives/edgar/data/1243429/000124342926000020/R12.htm")
AM_PLAN = source("Nippon Steel, August 2026, slide 27", "https://www.nipponsteel.com/en/ir/library/settlement/pdf/20260804_200.pdf")
AM_Q2 = source("ArcelorMittal, second-quarter 2026 results", "https://corporate.arcelormittal.com/media/news/regulatory-news/arcelormittal-reports-second-quarter-2026-results")
JSW_PLAN = source("JSW Steel, FY2025–26 expansion programme", "https://www.jswsteel.in/jsw-steel-annual-report-2025-26/grow.html")
TATA_Q1 = source("Tata Steel, June-quarter results, 30 July 2026", "https://www.tatasteel.com/newsroom/press-releases/india/2026/tata-steel-reports-consolidated-ebitda-of-rs-9-370-crores-for-the-quarter-ended-june-30-2026/")
JSW = "JSW Steel"
AMNS = "AM/NS India"
LLOYDS = "Lloyds Metals and Energy"


def owner(name, gem_id, country, stake, chain):
    return dict(name=name, entityId=gem_id, country=country, stake=stake, chain=chain)


sponsors = {
    "P100000120513": [
        owner("ArcelorMittal", "E100000000687", "LUX", .60, [AMNS, "AMNS Luxembourg Holding", "ArcelorMittal"]),
        owner("Nippon Steel", "E100000000652", "JPN", .40, [AMNS, "AMNS Luxembourg Holding", "Nippon Steel"]),
    ],
    "P100000120517": [owner(JSW, "E100001000516", "IND", 1, ["Dolvi Works", JSW])],
    "P100000120539": [owner(JSW, "E100001000516", "IND", 1, ["JSW Utkal Steel", JSW])],
    "P100000120522": [owner(LLOYDS, "E100001012204", "IND", 1, ["Ghugus works", LLOYDS])],
}

# Nominal capacities are read from the release, never from these decisions.
# A blank accepted amount withholds a candidate. It does not assert zero capacity.
decisions = {
    "P100001025671": ("Anakapalle", None, "Status disputed",
        "The 8.2 is the environmental clearance. After the March foundation ceremony, ArcelorMittal called the project announced in both its June- and September-quarter results. Both steel sponsors are identified.", [
        AM_Q2, source("ArcelorMittal, September-quarter results", "https://corporate.arcelormittal.com/media/news/regulatory-news/arcelormittal-reports-third-quarter-2026-results"), AM_PLAN,
        source("AM/NS India, 23 March foundation ceremony", "https://www.amns.in/press-releases/arcelormittal-nippon-steel-india-lays-foundation-for-greenfield-steel-plant-in-andhra-pradesh")]),
    "P100000120539": ("Utkal", 5000, "Phase capped",
        "JSW identifies a 5 Mt/yr greenfield first phase. GEM lists 7 in converters and JSW lists a 6 Mt/yr melt shop. The approved site addition sets the cap. The September-quarter call confirms work on phase one, with phase two approved in October.", [
        JSW_PLAN, source("JSW, phase-one plans and site, June 2026", "https://jsw-steel-s3.s3.ap-south-1.amazonaws.com/jsw-steel-images/uploads/2025/12/JSWSteel_Investor-Presentation_June26_vF.pdf"),
        source("JSW, July site update, slide 42", "https://jsw-steel-s3.s3.ap-south-1.amazonaws.com/jsw-steel-images/uploads/2026/07/Q1_FY27_ppt-vf.pdf#page=42"),
        source("L&T, melt-shop piling contract", "https://www.larsentoubro.com/pressreleases/2026/2026-05-26-lt-wins-orders-significant-for-geostructure-business"),
        source("JSW, September-quarter earnings call", "https://jsw-steel-s3.s3.ap-south-1.amazonaws.com/jsw-steel-images/uploads/2026/10/JSWSL-Q2FY27-Earnings-Oct23-2026.pdf"),
        source("JSW, wholly owned Utkal subsidiary", "https://www.jswsteel.in/sites/default/files/assets/industry/steel/IR/stock-exchange-releases/Regulation_30_05_01_2024.pdf")]),
    "P100000120513": ("Hazira", 6000, "Included",
        "The three 2 Mt/yr converters match the disclosed site expansion from about 9 to 15. The earlier equipment-substitution proposal adds no separate tonnes. The joint venture owns the Indian business through a Luxembourg holding company.", [
        AM_PLAN, AM_FILING, source("AM/NS India, equipment reconciliation", "https://www.amns.in/storage/statutory-documents/January2023/qnfxv43cHwc5zTCb8V1n.pdf"),
        source("Hazira expansion clearance", "https://www.amns.in/storage/statutory-documents/October2022/6GnmFvhzMscsSdpEev87.pdf")]),
    "P100000120517": ("Dolvi", 5000, "Included",
        "Phase III takes the works from 10 to 15 Mt/yr. JSW documents converter installation. Blast-furnace iron capacity and rolling capacity are separate stages of the same works.", [
        JSW_PLAN, source("JSW, May 2026 construction photographs", "https://nsearchives.nseindia.com/corporate/jessydenny_14052026164431_JSW_Steel_Q4_FY26_vF.pdf"),
        source("JSW Steel, Dolvi expansion clearance", "https://www.jswsteel.in/sites/default/files/assets/downloads/steel/IR/Environmental%20Clearances/Environment-Clearance-of-JSW-Steel-Dolvi-Works-10-to-15-MTPA.pdf")]),
    "P100000120540": ("Neelachal", None, "Stage uncertain",
        "Tata approved a broader 4.8 Mt/yr addition in July. Its September-quarter account describes roads, grading and equipment orders. The stage of the two GEM construction converters could not be reconciled. Tata had already bought the remaining minority stake in 2025.", [
        TATA_Q1, source("Tata Steel, September-quarter earnings call", "https://www.tatasteel.com/media/26645/2qfy27-transcript.pdf"),
        source("Tata Steel, full ownership of NINL", "https://www.tatasteel.com/media/24356/tata-steel-limited-announcement-acquisition-neelachal-ltd.pdf")]),
    "P100000120556": ("Jamuria", None, "Stage uncertain",
        "GEM links the two units to an earlier planned build. The operator group has several businesses at Jamuria. The available compliance filing covers a differently named 1 Mt/yr project and cannot confirm this 2.5 Mt/yr package at the cutoff.", [
        source("Operator group, Jamuria compliance filing", "https://orissametaliks.com/data/qehs-2025/OSPPL-%28Jamuria%29-EC-Compliance-June-25-1.pdf")]),
    "P100000121188": ("Orissa Alloy, Kharagpur", None, "Net amount uncertain",
        "GEM flags 1.243 Mt/yr of induction capacity. The site's earlier compliance return already records billet production and operating consent for 0.7714 Mt/yr of billets. The remaining crude-steel increment cannot be matched unit by unit. Ownership also passes through several private entities.", [
        source("Orissa Alloy, compliance return, product table item 11", "https://orissametaliks.com/data/qehs-2025/EC-Compliance-DEC-2025-OASPL.pdf")]),
    "P100000120522": ("Ghugus", 1050, "Included",
        "Lloyds documents construction of a new steelmaking operation at its ironmaking site. Use GEM's 1.05 Mt/yr of steelmaking furnaces. The 1.2 Mt/yr long-products project has a different equipment boundary.", [
        source("Lloyds, FY2025–26 annual report, pp. 70–71", "https://lloyds.in/wp-content/uploads/2026/05/Annual-Report-for-Financial-Year-2025-26.pdf"),
        source("Ghugus clearance, steel melting shop and rolling mill", "https://lloyds.in/wp-content/uploads/2025/03/Phase-III-Lloyds-EC-issued-Dated.20.03.2025.pdf"),
        source("Lloyds, September-quarter project update", "https://lloyds.in/wp-content/uploads/2026/11/20261103_Intimation_regarding_Earnings_Presentation.pdf")]),
    "P100000120569": ("Dhenkanal", None, "Unit overlap uncertain",
        "GEM separately lists 0.206 Mt/yr already operating. The state consent covering April 2025 to March 2027 lists five induction furnaces with 0.539 Mt/yr. The permits and GEM records do not identify the same outstanding set of furnaces.", [
        source("Odisha State Pollution Control Board, operating consent, pp. 1–2", "https://www.ocmms.nic.in/OCMMS_NEW/download.action?applicationId=6051916&industryFor=bothAW&industryState=Odisha&industryType=CTO")]),
    "P100000120576": ("Ludhiana", None, "Already operating",
        "Tata inaugurated its electric arc furnace in March and reported ramping up production in July. Its 0.75 Mt/yr falls outside the September construction cohort.", [
        TATA_Q1, source("Tata Steel, March inauguration", "https://www.tatasteel.com/newsroom/press-releases/india/2026/tata-steel-inaugurates-its-first-scrap-based-electric-arc-furnace-in-india/")]),
    "P100000120553": ("Ramsarup, Kharagpur", None, "Stage uncertain",
        "The site is being revived. Ramsarup describes a 0.70 Mt/yr billet shop under implementation. The dated May 2026 approval is for a specialty bar mill with a furnace. It does not establish how much of the older electric steelmaking project was under construction in September.", [
        source("Ramsarup, plant and equipment", "https://www.ramsarup.com/lohh.html"),
        source("Shyam Metalics, May 2026 capex filing", "https://nsearchives.nseindia.com/corporate/SHYAMMETL_11052026131548_OutcomeofBM__2_.pdf"),
        source("Shyam Metalics, 60/40 industrial sponsor chain", "https://nsearchives.nseindia.com/corporate/SHYAMMETL_14022023182949_SMELInvestorPresentationQ3FY23.pdf")]),
    "P100000121185": ("Karakhendra", None, "Phase uncertain",
        "An earlier application raised crude-steel capacity from 0.127 to 0.681 Mt/yr, matching the GEM increment. A later application instead describes a smaller phase reaching 0.289. The date and extent of the larger construction phase remain unresolved.", [
        source("Environment ministry, original project scope, item 20.13", "https://environmentclearance.nic.in/writereaddata/Form-1A/Minutes/06072020UJKCTN98FINALMOM.pdf"),
        source("Rungta, revised application", "https://environmentclearance.nic.in/auth/ECGeneral_Report.aspx?pid=40162")]),
    "P100000120536": ("Raigarh", None, "Net amount uncertain",
        "GEM lists an additional electric arc furnace. JSW reports current capacity of 0.95 Mt/yr and identifies a structural rolling mill in its expansion programme. The site's future crude-steel increment is unconfirmed.", [
        JSW_PLAN, source("JSW Steel, Raigarh operations", "https://www.jswsteel.in/jsw-steel-annual-report-2025-26/mda.html")]),
}


def build():
    inputs = json.loads((ROOT / "gem-india.json").read_text(encoding="utf-8"))
    plants = {p["project-id"]: p for p in inputs}
    with (ROOT / "source/gem-current-api-india-construction-steel-units.csv").open(encoding="utf-8", newline="") as f:
        units = list(csv.DictReader(f))
    assert len({u["unit_id"] for u in units}) == len(units) == 42
    with (ROOT / "unit-plant-join.csv").open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f, lineterminator="\n")
        writer.writerow(["unit_id","plant_id","plant","furnace","steelmaking_method","unit_status","unit_kt_per_year",
                         "september_map_lat","september_map_lon","coordinate_accuracy","gem_asset_url"])
        for unit in sorted(units, key=lambda u: (u["location_id"], u["unit_id"])):
            plant = plants[unit["location_id"]]
            assert unit["unit_status"] == "construction"
            writer.writerow([unit["unit_id"], unit["location_id"], plant["name"], unit["unit_name"],
                             unit["furnace_category"], unit["unit_status"], unit["capacity_ttpa"],
                             plant["Latitude"], plant["Longitude"], plant["location-accuracy"], unit["api_url"]])
    ledger, projects = [], []
    for p in inputs:
        rows = [r for r in p["capacity-by-status"] if r["method"] in STEEL and r["status"] == "construction"]
        if not rows:
            continue
        plant_id = p["project-id"]
        name, accepted, decision, rationale, sources = decisions[plant_id]
        gross = sum(int(r["capacity"]) for r in rows)
        project_units = [u for u in units if u["location_id"] == plant_id]
        assert sum(float(u["capacity_ttpa"]) for u in project_units) == gross
        ledger.append(dict(id=plant_id, name=name, grossKt=gross, acceptedKt=accepted,
                           decision=decision, rationale=rationale, sources=sources, gem=p["url"]))
        if accepted is None:
            continue
        assert 0 < accepted <= gross
        owners = sponsors[plant_id]
        assert abs(sum(o["stake"] for o in owners) - 1) < 1e-9
        projects.append(dict(id=plant_id, name=name, state=p["subnational"], lat=p["Latitude"],
                             lon=p["Longitude"], coordinateAccuracy=p["location-accuracy"], operator=p["owner"],
                             operatorId=p["owner-gem-id"], gemConstructionKt=gross,
                             unitIds=[u["unit_id"] for u in project_units], netMt=accepted/1000, owners=owners,
                             sources=sources + [source("GEM plant record", p["url"])]))
    ledger.sort(key=lambda r: -r["grossKt"])
    assert {r["id"] for r in ledger} == set(decisions)
    assert sum(r["grossKt"] for r in ledger) == 37550
    assert sum(r["acceptedKt"] or 0 for r in ledger) == 17050
    output = dict(scopeLabel="Four corroborated projects",
                  coverageNote="Four of 13 GEM sites. See the audit for the other nine and the Utkal phase adjustment.",
                  asOf="September 2026", projects=sorted(projects, key=lambda r: -r["netMt"]))
    for filename, data in [("projects.json", output), ("audit.json", ledger)]:
        (ROOT / filename).write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    with (ROOT / "project-audit.csv").open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["gem_plant_id","project","construction_kt_per_year","included_net_kt_per_year","decision","rationale","source_urls"])
        for row in ledger:
            w.writerow([row["id"], row["name"], row["grossKt"], row["acceptedKt"], row["decision"],
                        row["rationale"], " | ".join([row["gem"]] + [s["url"] for s in row["sources"]])])


if __name__ == "__main__":
    build()
