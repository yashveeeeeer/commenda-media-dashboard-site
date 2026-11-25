"""Check the public article, three downloadable measures and plant evidence links."""
import argparse
import csv
from decimal import Decimal, ROUND_HALF_UP
from io import StringIO
from math import isclose
from urllib.parse import urljoin

from playwright.sync_api import sync_playwright

MEASURES = (("gross", "gross"), ("reviewedCorrectionsOnly", "adjusted"), ("net", "checked_net"))
CATEGORIES = ("Domestic", "Overseas", "Unassigned")


def display(value):
    return str(Decimal(str(value)).quantize(Decimal(".1"), rounding=ROUND_HALF_UP))


def verify_downloads(page, base, totals, projects):
    def download(name):
        response = page.request.get(urljoin(base, "data/" + name))
        assert response.ok, response.status
        return list(csv.DictReader(StringIO(response.text())))

    sites = download("world-projects.csv")
    equity = download("world-equity.csv")
    assert {s["gem_plant_id"] for s in sites} == set(projects)
    for name, stem in MEASURES:
        column = stem + "_mt_per_year"
        site_column = "gem_" + column if stem == "gross" else column
        assert isclose(sum(float(s[site_column] or 0) for s in sites), totals[name]["mt"])
        for category in CATEGORIES:
            amount = sum(float(s[column] or 0) for s in equity if s["allocation"] == category)
            assert isclose(amount, totals[name]["equity"][category], abs_tol=1e-6)
    for site in sites:
        project = projects[site["gem_plant_id"]]
        expected = project["grossMt"] if project["netMt"] is None else project["netMt"]
        reported = site["adjusted_mt_per_year"]
        assert (None if reported == "" else float(reported)) == expected, project["id"]


def verify_article(page, base, totals):
    page.goto(base)
    figures = page.locator(".geo-table tbody tr")
    assert figures.count() == 7
    names = {"China":"CHN", "India":"IND", "Iran":"IRN", "Sweden":"SWE", "Mexico":"MEX", "Luxembourg":"LUX", "Japan":"JPN"}
    for row in figures.all():
        code = names[row.locator("th").inner_text()]
        expected = [display(totals["gross"][group].get(code, 0)) for group in ("hosts", "headquarters")]
        assert row.locator("td span").all_text_contents() == expected
    links = []
    for row, (name, _) in zip(page.locator(".scope-row").all(), MEASURES, strict=True):
        scope = totals[name]
        assert row.locator(".scope-title > b").inner_text() == display(scope["mt"]) + " Mt/yr"
        expected = [display(100 * scope["equity"][c] / scope["mt"]) + "%" for c in CATEGORIES]
        assert row.locator(".scope-key b").all_text_contents() == expected
        links.append((urljoin(base, row.locator("a").get_attribute("href")), scope["mt"]))
    for link, total in links:
        page.goto(link)
        page.locator(".workspace").wait_for()
        assert float(page.locator("#capacity-total").inner_text()) == total


def verify_ledger(page, base, projects):
    page.goto(urljoin(base, "method/#ledger"))
    sites = page.locator("details[id^=site-]")
    assert sites.count() == len(projects)
    for outcome in ("positive", "zero", "unresolved"):
        page.select_option("#ledger-outcome", outcome)
        def matches(net):
            if outcome == "unresolved":
                return net is None
            return net is not None and (net > 0 if outcome == "positive" else net == 0)
        assert page.locator("details[id^=site-]:visible").count() == sum(matches(p["netMt"]) for p in projects.values())
    page.fill("#ledger-query", "no matching project xyz")
    assert page.locator("details[id^=site-]:visible").count() == 0
    assert "No matching" in page.locator(".ledger-count").inner_text()
    hazira = "P100000120513"
    page.evaluate("(id) => {location.hash = 'site-' + id}", hazira)
    card = page.locator("#site-" + hazira)
    card.locator(".links a").first.wait_for()
    assert card.get_attribute("open") is not None
    card.locator(".links a").first.click()
    page.locator("#map-detail[open]").wait_for()
    assert "Hazira" in page.locator("#dialog-name").inner_text()
    assert "60%" in page.locator("#project-card").inner_text()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("story_url")
    parser.add_argument("--channel")
    args = parser.parse_args()
    base = args.story_url.rstrip("/") + "/"
    with sync_playwright() as driver:
        browser = driver.chromium.launch(channel=args.channel)
        page = browser.new_page(viewport={"width":390, "height":844})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        summary = page.request.get(urljoin(base, "data/world-summary.json")).json()
        projects = {p["id"]:p for p in page.request.get(urljoin(base, "data/world.json")).json()["projects"]}
        verify_downloads(page, base, summary, projects)
        verify_article(page, base, summary)
        verify_ledger(page, base, projects)
        assert not errors, errors
        browser.close()
    print("Article figures, map links, project filter and three CSV measures agree.")
