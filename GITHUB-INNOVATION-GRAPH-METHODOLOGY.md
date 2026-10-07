# Data and methods: the geography of public GitHub activity

*Methods for [“The World Is Coding More. What’s Changing Geographically?”](https://yashveeeeeer.github.io/commenda-media-dashboard-site/data-story/the-changing-geography-of-code/)*

Source: GitHub Innovation Graph · Observation period: 2020 Q1–2026 Q1 · Analysis dated 6 October 2026

## 1. Research design and scope

This study describes how the volume and geographic distribution of reported public GitHub activity changed between early 2020 and early 2026. Its main outcomes are quarterly Git pushes by economy and the destinations of recorded cross-border contributions. The comparisons are descriptive. They do not estimate how much of the change was caused by coding assistants, agents or any other particular development. Tool-launch dates in the article mark chronology, not the start of a treatment in a causal research design.

The primary source is [GitHub Innovation Graph at commit 078fb62ee4395d321bec9f4f06694cca68f6b6cb](https://github.com/github/innovationgraph/tree/078fb62ee4395d321bec9f4f06694cca68f6b6cb/data). Pinning the commit fixes the source release for this analysis. GitHub publishes the underlying metrics as quarterly aggregates, not individual activity records. Most files report one observation per economy and quarter; the collaboration file reports one observation per directed pair of economies and quarter. GitHub’s [datasheet for this release](https://github.com/github/innovationgraph/blob/078fb62ee4395d321bec9f4f06694cca68f6b6cb/docs/datasheet.md) supplies the metric definitions and collection limits.

The analysis concerns activity in public repositories. It cannot represent private development or all software work within an economy. Population data enter only where the article adjusts push counts for population; those inputs are identified separately in Section 3. External research and the dates of public tool launches are not part of the GitHub dataset.

## 2. Sample construction

### Fixed panel for public pushes

The longitudinal push analysis has an economy-quarter unit of observation. An economy enters the comparison panel if its code contains two letters and GitHub reports a value for Git pushes in every quarter from 2020 Q1 through 2026 Q1. GitHub’s EU aggregate is excluded to avoid mixing an aggregate with its constituent economies. The resulting balanced panel contains **149 economies observed over 25 quarters**.

The same set of economies underlies the reported panel total, economy and regional shares, and economy growth rates. Fixing the set matters because a change in reporting coverage should not be mistaken for a change in pushes. At the endpoints, this panel accounts for approximately **99.995%** and **99.813%**, respectively, of pushes reported for individual two-letter economies outside the EU aggregate.

Let $E$ denote the fixed set of 149 economies and $P_{e,t}$ the number of pushes GitHub reports for economy $e$ in quarter $t$. The panel total $T_t$ and economy share $s_{e,t}$ are

$$
T_t=\sum_{e\in E}P_{e,t}
$$

$$
s_{e,t}=\frac{P_{e,t}}{T_t}.
$$

The total rises from **80,814,468 in 2020 Q1** to **319,243,451 in 2026 Q1**. Regional shares first sum the pushes of economies assigned to a region, then divide by $T_t$. Accordingly, “world” in these figures means the fixed 149-economy comparison panel, not every push on GitHub.

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

The latest-year comparison covers **2025 Q1 to 2026 Q1**. For Figure 5, economies are ranked once by their 2025 Q1 push counts and divided into groups of **30, 30, 29, 30 and 30**. If $G$ is one of those fixed groups, $a$ is 2025 Q1 and $b$ is 2026 Q1, its share of the panel’s added pushes is

$$
\text{Contribution}_{G}=100\frac{\sum_{e\in G}(P_{e,b}-P_{e,a})}{T_b-T_a}.
$$

Holding group membership at its 2025 Q1 ranking avoids reclassifying economies after their growth has been measured. Figure 8 instead reports changes in economy shares, measured in percentage points:

$$
\Delta s_e=100(s_{e,b}-s_{e,a}).
$$

Here $a$ and $b$ are the two quarters being compared, and $s_{e,t}$ is the fraction defined above. A percentage-point change is not the percentage growth rate of an economy’s pushes.

Within-region concentration is the sum of squared economy shares of regional pushes, a Herfindahl-type measure. Let $q_{e,t}$ be economy $e$’s fraction of the pushes in its assigned region $r$ at quarter $t$. The concentration measure $H_{r,t}$ and the index shown in Figure 7 are

$$
H_{r,t}=\sum_{e\in r}q_{e,t}^{2}
$$

$$
I_{r,t}=100\frac{H_{r,t}}{H_{r,\mathrm{2023\ Q1}}}.
$$

Each region therefore starts at **100 in 2023 Q1**. An increase means that its pushes became more concentrated among member economies. It does not indicate an increase in the region’s share of the world panel.

### Regional assignment

GitHub reports economy codes, not the six editorial region groups in the article. Commenda assigned economies to regions before aggregating their pushes. The assignment places **MV in Asia** and **RE in Africa**; the African group therefore contains **34 reporting economies**, including Réunion. The complete code-to-region assignment and plotted economy-quarter values appear in [figure-03-quarterly.csv](https://github.com/yashveeeeeer/commenda-media-dashboard-site/blob/main/articles/geography-of-code/figure-03-quarterly.csv). These regional labels are an analytical choice, not classifications supplied by GitHub.

### Population adjustment

Figure 10 compares selected economies with their own starting rates, not with a full international ranking. Let $N_{e,t}$ denote population for economy $e$ at endpoint $t$. Public pushes per million residents are

$$
\text{Pushes per million}_{e,t}=10^{6}\frac{P_{e,t}}{N_{e,t}}.
$$

Population at the two endpoints comes from [UN World Population Prospects 2024](https://population.un.org/wpp/): a January 2020 estimate and a January 2026 medium-variant projection. The separate 2025 ranking mentioned in the article draws on [World Bank population data](https://data.worldbank.org/indicator/SP.POP.TOTL) and includes 155 reporting economies with at least one million residents. These two population comparisons have different samples and should not be read as the same ranking.

### Other GitHub measures

Figure 11 sums developer accounts, repositories and organisations over the same 149-economy panel as pushes. Each of its longer-view lines is an index, not a count. If $X_{m,t}$ denotes the panel total for measure $m$ in quarter $t$, the displayed index is

$$
I_{m,t}=100\frac{X_{m,t}}{X_{m,\mathrm{2020\ Q1}}}.
$$

All four series therefore begin at 100 in 2020 Q1. The lines compare proportional changes in measures with different units; they do not equate accounts with pushes or repositories.

Figure 12 compares TypeScript and Java participation. If $C_{e,t,l}$ is GitHub’s *num_pushers* count for economy $e$, quarter $t$ and language $l$, the plotted ratio is

$$
R_{e,t}=\frac{C_{e,t,\mathrm{TypeScript}}}{C_{e,t,\mathrm{Java}}}.
$$

A ratio above one means that more developers pushed to TypeScript-associated than Java-associated repositories in that economy and quarter. A developer can appear in both counts, and neither count measures the amount of code written in that language.

## 4. Directed cross-border contributions

### Measure and direction

The unit of observation in [economy_collaborators.csv](https://github.com/github/innovationgraph/blob/078fb62ee4395d321bec9f4f06694cca68f6b6cb/data/economy_collaborators.csv) is a directed contributor-economy to repository-economy link in a quarter. GitHub defines *contribution weight* as the sum of Git pushes sent and pull requests opened by a developer to a repository owned by another developer or organisation. For example, India → US denotes activity by contributors assigned to India on repositories assigned to the US. It is not a quantity of code transferred, accepted work, monetary value or a trade balance.

### US destination share

The article’s US destination share takes all **published directed links** at each endpoint for which both source and destination have two-letter economy codes. It excludes the EU aggregate and same-economy links. The numerator is the contribution weight directed to repositories assigned to the US. The denominator is total weight across all eligible published cross-border links in that quarter.

Let $L_t$ be the set of these eligible links in quarter $t$, and let $W_{i,j,t}$ be the published contribution weight from contributor economy $i$ to repository economy $j$. Then the US destination share is

$$
D_{\mathrm{US},t}=\frac{\sum_{(i,\mathrm{US})\in L_t}W_{i,\mathrm{US},t}}{\sum_{(i,j)\in L_t}W_{i,j,t}}.
$$

This produces **2,145,025 / 4,516,494 = 47.5% in 2020 Q1** and **5,972,820 / 12,715,023 = 47.0% in 2026 Q1**. These percentages describe the eligible *published-link universe*. They do not share the denominator of the 149-economy push panel.

The number of eligible published links rises from **2,138** to **3,934** between the endpoints. A change in the reported destination share can therefore reflect both underlying activity and changes in which links appear in the published data. As a sensitivity check, the same calculation on the **1,352 links reported in all 25 quarters** gives US shares of **49.7%** and **51.1%**. The article reports the full published-link comparison, but the balanced-link check moves in the opposite direction. The slight decline in the full published-link share is therefore not robust to holding link membership fixed.

### Selection for the ribbon figure

The ribbon figure is a selected view of the network, not the denominator for the destination-share calculation. Origins are ranked by **total outbound weight across eligible published links in 2026 Q1**. The six largest are the US, Germany, the United Kingdom, Canada, India and France. Among their destinations, the seven with the largest combined incoming weight are the US, India, Germany, the United Kingdom, Canada, France and Hong Kong. Other destinations are grouped as “Other.” The figure therefore describes links from leading recorded senders, not the complete cross-border network. A comparison such as India → US versus US → India is a comparison of two published directions, not a national deficit or a statement about ownership of code.

## 5. Measurement and interpretation

GitHub reports an economy-level metric only when at least **100 relevant developers** meet its publication threshold. A missing economy-quarter observation is not a zero. Nor does an absent directed link establish that no collaboration occurred; the extract does not identify why an individual link is missing. The fixed push panel, endpoint language sample and published-link universe have distinct inclusion rules and denominators.

GitHub assigns a user’s economy from the most frequent location in daily IP observations during a quarter, carrying the last known location through inactive days. Repository geography reflects the most frequent location among members with triage access or higher. VPNs, travel and multinational teams can weaken the correspondence between an assigned economy and where work physically occurred. GitHub also notes that assigning each repository one economy can undercount the geographic reach of collaboration. These limits matter especially for interpreting country-to-country links.

A Git push is an upload of changes and may contain multiple commits. It is not a measure of lines of code, accepted pull requests, releases or economic output. GitHub excludes activity from accounts it identifies as automated or inauthentic, including activity above a threshold it regards as implausible for a human. The published series therefore cannot enumerate all agent output. It also does not identify whether an assistant helped a person produce a given push.

The figures describe reported public activity and its assigned geography. They do not establish the effect of AI tools, measure the amount of code written, or capture all development within an economy. The analysis reports no causal estimates or statistical confidence intervals; uncertainty from reporting thresholds, account filtering and geographic assignment remains.

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

The population adjustment uses the UN and World Bank sources identified in Section 3; neither is a GitHub measure. Map boundaries are presentation assets from [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/) and an adapted [DataMeet India boundary](https://github.com/datameet/maps/blob/master/Country/india-soi.geojson). They do not enter the calculated push or contribution measures.
