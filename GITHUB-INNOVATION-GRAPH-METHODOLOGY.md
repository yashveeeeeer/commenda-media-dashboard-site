# Data and methods: the geography of public GitHub activity

*Methodology note for “The World Is Coding More. What’s Changing Geographically?”*

Source: GitHub Innovation Graph · Observation period: 2020 Q1–2026 Q1 · Analysis dated 6 October 2026

## 1. Research design and scope

This study describes how the volume and geographic distribution of reported public GitHub activity changed between early 2020 and early 2026. Its main outcomes are quarterly Git pushes by economy and the destinations of recorded cross-border contributions. The comparisons are descriptive. They do not estimate how much of the change was caused by coding assistants, agents or any other particular development. Tool-launch dates in the article mark chronology, not the start of a treatment in a causal research design.

The primary source is [GitHub Innovation Graph at commit 078fb62ee4395d321bec9f4f06694cca68f6b6cb](https://github.com/github/innovationgraph/tree/078fb62ee4395d321bec9f4f06694cca68f6b6cb/data). Pinning the commit fixes the source release for this analysis. GitHub publishes the underlying metrics as quarterly aggregates, not individual activity records. Most files report one observation per economy and quarter; the collaboration file reports one observation per directed pair of economies and quarter. GitHub’s [datasheet for this release](https://github.com/github/innovationgraph/blob/078fb62ee4395d321bec9f4f06694cca68f6b6cb/docs/datasheet.md) supplies the metric definitions and collection limits.

The analysis concerns activity in public repositories. It cannot represent private development or all software work within an economy. The population-adjusted figure in the article also draws on a population source and is not covered here. External research and the dates of public tool launches are not part of the GitHub dataset.

## 2. Sample construction

### Fixed panel for public pushes

The longitudinal push analysis has an economy-quarter unit of observation. An economy enters the comparison panel if its code contains two letters and GitHub reports a value for Git pushes in every quarter from 2020 Q1 through 2026 Q1. GitHub’s EU aggregate is excluded to avoid mixing an aggregate with its constituent economies. The resulting balanced panel contains **149 economies observed over 25 quarters**.

The same set of economies underlies the reported panel total, economy and regional shares, and economy growth rates. Fixing the set matters because a change in reporting coverage should not be mistaken for a change in pushes. At the endpoints, this panel accounts for approximately **99.995%** and **99.813%**, respectively, of pushes reported for individual two-letter economies outside the EU aggregate.

For quarter *t*, the panel total is the sum of reported pushes across the 149 economies. It rises from **80,814,468 in 2020 Q1** to **319,243,451 in 2026 Q1**. An economy’s share divides its push count by that quarter’s panel total. Regional shares first sum the pushes of the economies assigned to a region, then divide by the same panel total. Accordingly, “world” in these figures means the fixed 149-economy comparison panel, not every push on GitHub.

### Other analysis samples

The comparisons of developer accounts, repositories and organisations aggregate the corresponding GitHub series over the same 149 economies and quarters. Their definitions differ from the push measure: a developer-account count, for example, includes accounts that may no longer be active.

The TypeScript–Java comparison draws on GitHub’s language variable, *num_pushers*: the number of developers who pushed to repositories associated with a given language. It retains two-letter economy codes other than EU where GitHub reports **both** language counts in **2020 Q1 and 2026 Q1**. This yields **93 economies**. An observation in every intervening quarter is not required. The measure identifies participation in repositories containing a language; it does not count pushes in that language or establish which language an individual contributor wrote.

## 3. Construction of the reported measures

### Growth and composition

Year-on-year push growth compares a quarter with the same quarter one year earlier:

$$
\text{YoY growth}_{e,t}=100\left(\frac{P_{e,t}}{P_{e,t-4}}-1\right),
$$

where $P_{e,t}$ is reported pushes for economy $e$ in quarter $t$. The first year-on-year observation is 2021 Q1.

To compare the two growth periods, the change over each two-year interval is annualised:

$$
\text{Annualised growth}_{e}=100\left[\left(\frac{P_{e,\mathrm{end}}}{P_{e,\mathrm{start}}}\right)^{1/2}-1\right].
$$

The intervals are **2020 Q1–2022 Q1** and **2024 Q1–2026 Q1**, calculated separately for each economy in the fixed panel. The later annualised rate is higher in **110 economies** and lower in **39**. A lower rate does not necessarily imply a fall in the number of pushes.

The latest-year comparison covers **2025 Q1 to 2026 Q1**. For the quintile analysis, economies are ranked once by their 2025 Q1 push counts and divided into groups of **30, 30, 29, 30 and 30**. Each group’s total is then compared across the two quarters. Holding group membership at its 2025 Q1 ranking avoids reclassifying economies after their growth has been measured.

Within-region concentration is the sum of squared economy shares of regional pushes, a Herfindahl-type measure. Each region’s series is indexed so that its **2023 Q1 value equals 100**. An increase means that a larger share of that region’s pushes is concentrated in fewer member economies. It does not indicate an increase in the region’s share of the world panel.

### Regional assignment

GitHub reports economy codes, not the six editorial region groups in the article. Commenda assigned economies to regions before aggregating their pushes. The assignment places **MV in Asia** and **RE in Africa**; the African group therefore contains **34 reporting economies**, including Réunion. The complete code-to-region assignment and plotted economy-quarter values appear in [figure-03-quarterly.csv](https://github.com/yashveeeeeer/commenda-media-dashboard-site/blob/main/articles/geography-of-code/figure-03-quarterly.csv). These regional labels are an analytical choice, not classifications supplied by GitHub.

## 4. Directed cross-border contributions

### Measure and direction

The unit of observation in [economy_collaborators.csv](https://github.com/github/innovationgraph/blob/078fb62ee4395d321bec9f4f06694cca68f6b6cb/data/economy_collaborators.csv) is a directed contributor-economy to repository-economy link in a quarter. GitHub defines *contribution weight* as the sum of Git pushes sent and pull requests opened by a developer to a repository owned by another developer or organisation. For example, India → US denotes activity by contributors assigned to India on repositories assigned to the US. It is not a quantity of code transferred, accepted work, monetary value or a trade balance.

### US destination share

The article’s US destination share takes all **published directed links** at each endpoint for which both source and destination have two-letter economy codes. It excludes the EU aggregate and same-economy links. The numerator is the contribution weight directed to repositories assigned to the US. The denominator is total weight across all eligible published cross-border links in that quarter.

This produces **2,145,025 / 4,516,494 = 47.5% in 2020 Q1** and **5,972,820 / 12,715,023 = 47.0% in 2026 Q1**. These percentages describe the eligible *published-link universe*. They do not share the denominator of the 149-economy push panel.

The number of eligible published links rises from **2,138** to **3,934** between the endpoints. A change in the reported destination share can therefore reflect both underlying activity and changes in which links appear in the published data. As a sensitivity check, the same calculation on the **1,352 links reported in all 25 quarters** gives US shares of **49.7%** and **51.1%**. The article reports the full published-link comparison; the balanced-link result is disclosed because the small difference between its endpoints does not support a precise claim that the US destination share declined.

### Selection for the ribbon figure

The ribbon figure is a selected view of the network, not the denominator for the destination-share calculation. Origins are ranked by **total outbound weight across eligible published links in 2026 Q1**. The six largest are the US, Germany, the United Kingdom, Canada, India and France. Among their destinations, the seven with the largest combined incoming weight are the US, India, Germany, the United Kingdom, Canada, France and Hong Kong. Other destinations are grouped as “Other.” The figure therefore describes links from leading recorded senders, not the complete cross-border network. A comparison such as India → US versus US → India is a comparison of two published directions, not a national deficit or a statement about ownership of code.

## 5. Measurement and interpretation

GitHub reports an economy-level metric only when at least **100 relevant developers** meet its publication threshold. A missing economy-quarter observation is not a zero. Nor does an absent directed link establish that no collaboration occurred; the extract does not identify why an individual link is missing. The fixed push panel, endpoint language sample and published-link universe have distinct inclusion rules and denominators.

GitHub assigns a user’s economy from the most frequent location in daily IP observations during a quarter, carrying the last known location through inactive days. Repository geography reflects the most frequent location among members with triage access or higher. VPNs, travel and multinational teams can weaken the correspondence between an assigned economy and where work physically occurred. GitHub also notes that assigning each repository one economy can undercount the geographic reach of collaboration. These limits matter especially for interpreting country-to-country links.

A Git push is an upload of changes and may contain multiple commits. It is not a measure of lines of code, accepted pull requests, releases or economic output. GitHub excludes activity from accounts it identifies as automated or inauthentic, including activity above a threshold it regards as implausible for a human. The published series therefore cannot enumerate all agent output. It also does not identify whether an assistant helped a person produce a given push.

The figures describe reported public activity and its assigned geography. They do not establish the effect of AI tools, measure the amount of code written, or capture all development within an economy. No causal effect or sampling uncertainty interval is estimated in this descriptive analysis.

## 6. Source files and replication

The input data are GitHub Innovation Graph CSV files from the commit specified in Section 1:

| Source file | Role in this analysis |
| --- | --- |
| [git_pushes.csv](https://github.com/github/innovationgraph/blob/078fb62ee4395d321bec9f4f06694cca68f6b6cb/data/git_pushes.csv) | Quarterly public pushes by economy |
| [developers.csv](https://github.com/github/innovationgraph/blob/078fb62ee4395d321bec9f4f06694cca68f6b6cb/data/developers.csv) | Developer-account comparison |
| [repositories.csv](https://github.com/github/innovationgraph/blob/078fb62ee4395d321bec9f4f06694cca68f6b6cb/data/repositories.csv) | Repository comparison |
| [organizations.csv](https://github.com/github/innovationgraph/blob/078fb62ee4395d321bec9f4f06694cca68f6b6cb/data/organizations.csv) | Organisation comparison |
| [languages.csv](https://github.com/github/innovationgraph/blob/078fb62ee4395d321bec9f4f06694cca68f6b6cb/data/languages.csv) | TypeScript–Java participation comparison |
| [economy_collaborators.csv](https://github.com/github/innovationgraph/blob/078fb62ee4395d321bec9f4f06694cca68f6b6cb/data/economy_collaborators.csv) | Directed cross-border contribution weights |

The sample rules, denominators, calculations and regional assignment above specify how the published aggregates become the article’s measures. GitHub’s [repository README](https://github.com/github/innovationgraph/blob/078fb62ee4395d321bec9f4f06694cca68f6b6cb/README.md) and [datasheet](https://github.com/github/innovationgraph/blob/078fb62ee4395d321bec9f4f06694cca68f6b6cb/docs/datasheet.md) provide the source definitions and collection caveats.
