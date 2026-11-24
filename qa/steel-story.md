# Steel story verification

The article, dashboard and project audit use the September 2026 v1 snapshot. The research starts from the 13 Indian plants where GEM recorded quantified crude-steel capacity under construction. The dashboard shows the four additions whose integrated project phase, additional steelmaking capacity and industrial ownership could be corroborated.

## Reproduce the figures

From the repository root, run these commands with Python 3.10 or later. Both operate on the checked-in source extracts.

```sh
python data-story/steel/data/source/check.py
python data-story/steel/data/build.py
```

The first calculation reconciles 42 unit records to dated map totals by GEM plant ID and furnace type. The second generates the four dashboard records, the decision ledger, the downloadable CSV and the 13 expandable records on the methods page. The [source manifest](../data-story/steel/data/source/source-manifest.json) gives the original release hash and the public-feed retrieval instructions.

| Check | Result |
| --- | --- |
| Construction | 37.550 Mt/yr in the September release, public unit API cross-check and official country table |
| Scope | 18.500 Mt/yr at nine withheld sites and a 2.000 Mt/yr Utkal phase adjustment reconcile 37.550 gross to 17.050 included |
| Plant ownership | 11.050 India-backed, 6.000 overseas-backed, zero mixed or unresolved across four projects |
| Country allocation | India 11.050, Luxembourg 3.600, Japan 2.400 Mt/yr |
| Largest disputed site | Adding Anakapalle changes the overseas share to 56.24% |
| Competing domestic case | Adding both Anakapalle and Neelachal puts the India-based share at 50.59% |
| Other phases | Removing Utkal leaves 6.05 India-backed and 6.00 overseas-backed |
| Missing stakes | The four-project result requires no imputation. In the raw extract, overfull shares stay unresolved and incomplete shares retain a grey residual |

## Editorial and browser checks

A separate project reviewer checked issuer disclosures, the status conflicts, the 60/40 chain and the arithmetic. An independent reader assessment of the revised article scored sentence ease 8.5/10, orientation 8.5, mental load 7.5 and payoff 9.0. Its composite scores were 8.2 for reading comfort and 8.4 overall. These are model-reader judgments on the reviewed text. Subsequent copy edits identify the environmental clearance at Anakapalle, simplify the national overview and clarify the return to Tata in Wales. The earlier story’s deterministic writing checker passed.

Chrome checks covered the article, methods and both map views at 320, 390, 768, 1024, 1440 and 1920 pixels. Checks included local links and fragment targets, all 13 audit cards, mobile project detail, keyboard access, reduced motion, the Hazira split, selection after toggling, and conservation of capacity. A separate partial-ownership input exercised the nonzero grey residual. That input was used only in testing.
