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
| Equity on gross capacity | 88.318876 Mt/yr host-country owners, 26.545400 Mt/yr overseas, 56.523724 Mt/yr unassigned |
| Net-capacity review | 74 project reviews cover 140.755 Mt/yr of gross capacity. Ten positive additions total 25.300 Mt/yr in five countries. Twenty-eight sites have zero eligible capacity and 69 have unresolved net capacity |
| Replacement sensitivity | Applying only measured corrections leaves 123.775 Mt/yr. Host-country owners account for 57.579713 Mt/yr in that conditional scenario |
| Stakes | Hazira allocates 60% to Luxembourg and 40% to Japan through AMNS Luxembourg Holding. Pesquería traces 89.25% to Ternium and leaves 10.75% grey. The Saudi sovereign fund holds 25% of BAP Al-Khair and stays outside the industrial sponsor allocation |
| Boundary cases | Port Talbot has zero positive additional capacity. Luleå adds 0.2 Mt/yr. Announcements and estimated stakes are excluded from both map measures |
| Interaction and layout | Chrome checks covered widths from 320 to 1920 pixels, both map views and measures, host-country filtering, country and plant selection, mobile inspection, relative circle areas, and conservation of total capacity. Local files and fragment targets were checked across all three pages |
| Editorial | An independent read flagged investor-role inconsistencies and ambiguity between gross furnace capacity and net additions. The role list, ledger and article were revised and the final narrative checked against the calculated figures |

The downloadable [project ledger](../data-story/steel/data/world-projects.csv), [equity ledger](../data-story/steel/data/world-equity.csv), [unit join](../data-story/steel/data/world-unit-plant-join.csv) and [calculation summary](../data-story/steel/data/world-summary.json) contain the figures underlying these checks.
