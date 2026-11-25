"""Browser regressions for steel-dashboard figures, shared map surfaces and camera controls.

Run with Python Playwright and Chromium, for example:
python qa/check-steel-display.py --channel chrome http://localhost:8842/data-story/steel/
"""
import argparse
from urllib.parse import urljoin

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


def verify_dashboard(page, base, width, height):
    page.set_viewport_size({"width":width, "height":height})
    page.goto(urljoin(base, "dashboard/"))
    page.locator(".mark.selected").wait_for()
    page.evaluate("document.fonts.ready")
    assert page.locator("#capacity-total").inner_text() == "171.388"
    assert page.locator("#equity-values b").all_text_contents() == ["51.5%","15.5%","33.0%"]
    assert page.locator(".rank .value").first.inner_text() == "42.325"
    assert page.locator(".rank .value").nth(1).inner_text() == "37.550"
    for selector in ["#capacity-total","#equity-values b",".rank .value",".rank .portion",".selection-label"]:
        verify_digits(page, selector)
    assert page.locator(".land-base").count() == 1 and page.locator(".country-borders").count() == 1
    assert page.locator(".country").count() == 241
    assert page.locator(".country").evaluate_all("paths=>paths.every(p=>getComputedStyle(p).stroke==='none')")
    assert page.locator(".mark").count() == 106

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
        for dimensions in [(320,720),(390,844),(768,1024),(1024,768),(1280,720),(1440,900),(1920,1080)]:
            verify_dashboard(page, base, *dimensions)
        page.goto(base)
        page.evaluate("document.fonts.ready")
        assert "lining-nums" in page.locator(".prose>p").first.evaluate("el=>getComputedStyle(el).fontVariantNumeric")
        verify_digits(page, ".split-total b")
        page.goto(urljoin(base,"method/"))
        page.evaluate("document.fonts.ready")
        verify_digits(page, ".numbers tbody td:nth-child(2)")
        assert not errors, errors
        browser.close()
    print("Passed font, map, navigation, empty-state and layout checks at seven viewport sizes.")
