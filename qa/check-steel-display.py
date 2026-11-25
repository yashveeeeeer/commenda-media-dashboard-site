"""Browser regressions for steel-dashboard figures, shared map surfaces and camera controls.

Run with Python Playwright and Chromium, for example:
python qa/check-steel-display.py --channel chrome http://localhost:8842/data-story/steel/
"""
import argparse
from decimal import Decimal, ROUND_HALF_UP
from urllib.parse import parse_qs, urlencode, urljoin, urlsplit

from playwright.sync_api import sync_playwright


def verify_digits(page, selector):
    """Measure the actual webfont on each surface, including proportional fonts."""
    metrics = page.locator(selector).first.evaluate("""el => {
        const style = getComputedStyle(el);
        const probe = document.createElement("span");
        probe.style.cssText = "position:fixed;visibility:hidden;display:inline-block;letter-spacing:0";
        probe.style.fontFamily = style.fontFamily;
        probe.style.fontSize = "100px";
        probe.style.fontVariantNumeric = style.fontVariantNumeric;
        document.body.append(probe);
        const widths = Array.from("0123456789", digit => {
            probe.textContent = digit;
            return probe.getBoundingClientRect().width;
        });
        probe.remove();
        return {widths, family: style.fontFamily, feature: style.fontVariantNumeric};
    }""")
    assert "lining-nums" in metrics["feature"] and "tabular-nums" in metrics["feature"], (selector,metrics)
    assert max(metrics["widths"]) - min(metrics["widths"]) < .03, (selector, metrics)
    return metrics["widths"][0]


def assert_figures(page, stats):
    assert float(page.locator("#capacity-total").inner_text().replace(",", "")) == stats["mt"]
    expected = []
    for category in ("Domestic", "Overseas", "Unassigned"):
        share = Decimal(str(stats["equity"].get(category, 0))) * 100 / Decimal(str(stats["mt"]))
        expected.append(str(share.quantize(Decimal(".1"), rounding=ROUND_HALF_UP)) + "%")
    assert page.locator("#equity-values b").all_text_contents() == expected
    ranks = sorted(stats["hosts"].values(), reverse=True)
    assert page.locator(".rank .value").all_text_contents()[:2] == [f"{n:.3f}" for n in ranks[:2]]


def verify_dashboard(page, base, stats, country_shapes, width, height):
    page.set_viewport_size({"width":width, "height":height})
    page.goto(urljoin(base, "dashboard/"))
    page.locator(".mark.selected").wait_for()
    page.evaluate("document.fonts.ready")
    assert_figures(page, stats["gross"])
    logo = page.locator(".masthead img").bounding_box()
    nav = page.locator(".masthead nav").bounding_box()
    assert logo["x"] + logo["width"] + 6 <= nav["x"], (width, logo, nav)
    measure_fits = page.locator("#measure").evaluate("""el => {
        const style = getComputedStyle(el), ctx = document.createElement("canvas").getContext("2d");
        ctx.font = style.font;
        const available = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        return [...el.options].every(o => ctx.measureText(o.text).width <= available);
    }""")
    assert measure_fits, ("Clipped capacity measure", width)
    for selector in ["#capacity-total","#equity-values b",".rank .value",".rank .portion",".selection-label"]:
        verify_digits(page, selector)
    assert page.locator(".land-base").count() == 1 and page.locator(".country-borders").count() == 1
    assert page.locator(".country").count() == country_shapes
    assert page.locator(".country").evaluate_all("paths=>paths.every(p=>getComputedStyle(p).stroke==='none')")
    assert page.locator(".mark").count() == stats["gross"]["plants"]

    camera = page.locator("#geography")
    initial = camera.get_attribute("transform")
    page.get_by_role("button",name="Zoom in",exact=True).click()
    assert camera.get_attribute("transform") != initial
    page.get_by_role("button",name="Reset map view").click()
    assert camera.get_attribute("transform") == initial
    page.locator("#inspect").click()
    assert "60%" in page.locator("#map-detail").inner_text() and "40%" in page.locator("#map-detail").inner_text()
    page.keyboard.press("Escape")
    page.locator("#owners").click()
    assert page.locator("#project").input_value() == "LUX"
    page.locator("#measure").select_option("net")
    page.locator("#host").select_option("GBR")
    assert page.locator("#capacity-total").inner_text() == "0"
    assert page.locator("#inspect").is_disabled()
    page.locator("#plants").click()
    assert page.locator("#inspect").is_enabled()
    page.locator("#host").select_option("PRK")
    page.locator("#measure").select_option("gross")
    assert page.locator("#capacity-total").inner_text() == "—" and "unreported" in page.locator("#coverage").inner_text()
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")


def verify_shared_views(page, base, stats, projects):
    dashboard = urljoin(base, "dashboard/")
    def open_view(**state):
        page.goto(dashboard + "?" + urlencode(state))
        page.locator(".workspace").wait_for()
    def query():
        return {k: v[0] for k, v in parse_qs(urlsplit(page.url).query).items()}

    open_view(measure="adjusted")
    assert_figures(page, stats["reviewedCorrectionsOnly"])
    assert "assumes the full construction rating" in page.locator("#coverage").inner_text()
    assert page.locator(".mark").count() == stats["reviewedCorrectionsOnly"]["plants"]
    assert page.evaluate("""async () => {
        const {formatCapacity} = await import("./capacity.mjs");
        return formatCapacity(3.2004999999999995, true) === "3.201";
    }""")
    page.select_option("#measure", "net")
    assert_figures(page, stats["net"])
    assert query() == {"measure":"net"}
    page.go_back()
    assert page.locator("#measure").input_value() == "adjusted"
    page.go_forward()
    assert page.locator("#measure").input_value() == "net"

    # A positive gross rating, an unknown net addition and a reviewed zero each have distinct states.
    pending = next(p for p in projects if p["netMt"] is None and p["grossMt"] and p["country"] == "IND")
    open_view(host=pending["country"], plant=pending["id"], measure="adjusted", detail="1")
    assert page.locator("#map-detail").is_visible()
    assert "retains the full construction rating" in page.locator("#project-card").inner_text()
    assert page.locator(".ledger-link").get_attribute("href").endswith("#site-" + pending["id"])
    page.keyboard.press("Escape")
    page.wait_for_function("!location.search.includes('detail=')")
    page.select_option("#measure", "net")
    assert page.locator("#project").input_value() == pending["id"]
    assert page.locator(".mark.selected").count() == 0
    assert "Capacity unresolved" in page.locator("#selection-caption").inner_text()
    page.reload()
    page.locator(".workspace").wait_for()
    assert page.locator("#project").input_value() == pending["id"]
    assert not page.locator("#map-detail").is_visible()

    talbot = next(p for p in projects if p["id"] == "P100000120482")
    open_view(plant=talbot["id"], measure="adjusted")
    assert "0 Mt/yr" in page.locator("#selection-caption").inner_text()
    page.click("#inspect")
    assert "checked net addition of 0 Mt/yr" in page.locator("#project-card").inner_text()
    page.keyboard.press("Escape")
    page.wait_for_function("!location.search.includes('detail=')")

    hazira = next(p for p in projects if p["id"] == "P100000120513")
    open_view(host="IND", view="owners", owner="LUX", measure="adjusted", detail="1")
    assert page.locator("#project").input_value() == "LUX"
    source = page.locator(".owner-row a").filter(has_text=hazira["name"])
    allocation = source.locator("xpath=../..")
    stake = next(o["stake"] for o in hazira["owners"] if o["country"] == "LUX")
    assert f"{stake:.0%} of {hazira['netMt']:g} Mt/yr" in allocation.inner_text()
    source.click()
    assert page.locator("#dialog-name").inner_text() == hazira["name"]
    assert page.locator("#project").input_value() == hazira["id"]
    assert query()["host"] == "IND" and query()["measure"] == "adjusted"
    assert "view" not in query() and "owner" not in query()
    page.go_back()
    page.locator("#map-detail").wait_for()
    assert page.locator("#owners").get_attribute("aria-pressed") == "true"
    assert page.locator("#project").input_value() == "LUX"
    page.keyboard.press("Escape")
    page.select_option("#breakdown", "equity")
    page.reload()
    page.locator(".workspace").wait_for()
    assert page.locator("#breakdown").input_value() == "equity"
    page.select_option("#host", "all")
    hosts = {p["country"]:p["hostName"] for p in projects}
    for code in ("CHN", "USA", "TUR"):
        page.select_option("#project", code)
        assert page.locator("#project option:checked").inner_text() == hosts[code]
        assert hosts[code] in page.locator(".selection-label").text_content()
    open_view(host="invalid", measure="invalid", plant="missing", view="invalid")
    assert query() == {} and page.locator("#project").input_value() == hazira["id"]


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("story_url", help="Article URL ending in /steel/")
    parser.add_argument("--channel", help="Use an installed browser, e.g. chrome")
    args = parser.parse_args()
    base = args.story_url.rstrip("/") + "/"
    with sync_playwright() as browser_driver:
        browser = browser_driver.chromium.launch(channel=args.channel)
        page = browser.new_page(reduced_motion="reduce")
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        stats = page.request.get(urljoin(base, "data/world-summary.json")).json()
        projects = page.request.get(urljoin(base, "data/world.json")).json()["projects"]
        countries = page.request.get(urljoin(base, "dashboard/countries.json")).json()["countries"]
        for dimensions in [(320,720),(390,844),(768,1024),(1024,768),(1280,720),(1440,900),(1920,1080)]:
            verify_dashboard(page, base, stats, len(countries), *dimensions)
        verify_shared_views(page, base, stats, projects)
        page.goto(base)
        page.evaluate("document.fonts.ready")
        assert "lining-nums" in page.locator(".prose>p").first.evaluate("el=>getComputedStyle(el).fontVariantNumeric")
        verify_digits(page, ".split-total b")
        page.goto(urljoin(base,"method/"))
        page.evaluate("document.fonts.ready")
        verify_digits(page, ".numbers tbody td:nth-child(2)")
        assert not errors, errors
        browser.close()
    print("Passed three-measure figures, ownership drilldowns, URL restoration, font, map and responsive checks.")
