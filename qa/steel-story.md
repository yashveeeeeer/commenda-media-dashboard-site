# Steel story verification

The worldwide article and dashboard share a single September 2026 v1 population of 107 GEM plants. The map and methods page preserve a North Korean site with an unquantified rating. Both the plant and owner views use the 171.388 Mt/yr recorded at the other 106 plants.

## Rebuild from the frozen files

From the repository root, run the following with Python 3.10 or later.

```sh
python data-story/steel/data/global/build.py
python data-story/steel/data/build-world.py
python data-story/steel/data/render-findings.py
```

The first step reconstructs project and equity records from the release map, GEM entity and unit snapshots, the industry-owner list and cited issuer disclosures. The second adds the project decisions, reconciles the totals, writes the downloadable ledgers and rebuilds the linked method cards. The third refreshes the figures and numeric passages in the article and method. Its narrative was written for the September 2026 release. A later vintage requires fresh reporting.

## Release checks

| Check | Result |
| --- | --- |
| Gross population | 106 measured plants in 30 host countries, plus one unquantified plant |
| Independent unit join | 160 current API steelmaking units. Ras al-Khair accounts for the 0.2 Mt/yr difference between the November unit sum and the September release |
| Equity on gross capacity | 87.668876 Mt/yr host-country owners, 25.545400 Mt/yr overseas, 58.173724 Mt/yr unassigned |
| Net-capacity review | All 107 sites received a project-level review. Twelve positive additions total 26.700 Mt/yr in six countries. Thirty sites contribute zero eligible additions and 65 have unresolved net capacity |
| Replacement sensitivity | Applying measured corrections and retaining unresolved projects at their full tracker rating leaves 121.875 Mt/yr. Host-country owners account for 56.429713 Mt/yr in this conditional scenario |
| Stakes | Hazira allocates 60% to Luxembourg and 40% to Japan through AMNS Luxembourg Holding. Pesquería traces 89.25% to Ternium and leaves 10.75% grey. The Saudi sovereign fund holds 25% of BAP Al-Khair and stays outside the industrial sponsor allocation |
| Boundary cases | Port Talbot has zero positive additional capacity. Luleå adds 0.2 Mt/yr. Meghna was built before the cutoff. Mianeh and Abarkouh add 1.4 Mt/yr combined. GEM announcement-only units and imputed stakes are excluded from all three measures |
| Ownership review | The Kazakhstan operating company, the developer of Tete and the disputed Singapore match for Rashakai have no attributable industrial stake. Arian Steel's head-office disclosure places its 0.55 Mt/yr in Iran |
| Interaction and layout | Chrome checks covered widths from 320 to 1920 pixels, both map views, all three measures, shareable plant and owner links, host filtering, mobile inspection, circle areas and conservation of total capacity. Internal links and fragment targets were checked across all three pages |
| Editorial | An independent read flagged investor-role inconsistencies and ambiguity between gross furnace capacity and net additions. The role list, ledger and article were revised and the final narrative checked against the calculated figures |

The [display regression check](check-steel-display.py) measures digit advances in the actual loaded fonts, exercises both ownership views and checks host filtering, keyboard inspection, zoom and reset at seven viewport sizes. Serve the repository locally and run it with Python Playwright and Chromium.

```sh
python qa/check-steel-display.py --channel chrome http://localhost:8842/data-story/steel/
python qa/check-steel-story.py --channel chrome http://localhost:8842/data-story/steel/
```

The [map build](../data-story/steel/dashboard/build-map.py) checks the source checksum and validates the shared country coverage. All 241 country fills, the land surface and the single border layer come from that coverage. The dashboard projects the points and polygons in the same coordinate system.

The [article regression check](check-steel-story.py) compares the printed geography and ownership figures with the map and both downloadable CSVs. It also tests filtering the project ledger and opening a cited project from the article.

The downloadable [project ledger](../data-story/steel/data/world-projects.csv), [equity ledger](../data-story/steel/data/world-equity.csv), [unit join](../data-story/steel/data/world-unit-plant-join.csv) and [calculation summary](../data-story/steel/data/world-summary.json) contain the figures underlying these checks.
