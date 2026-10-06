# Measuring the geography of public GitHub activity

*Methodology note for “The World Is Coding More. What’s Changing Geographically?”*

Source: GitHub Innovation Graph · Period: 2020 Q1–2026 Q1 · Analysis dated 6 October 2026

## Source and scope

The analysis draws on quarterly CSV files from [GitHub Innovation Graph at commit `078fb62ee4395d321bec9f4f06694cca68f6b6cb`](https://github.com/github/innovationgraph/tree/078fb62ee4395d321bec9f4f06694cca68f6b6cb/data). This fixed version of the source files, together with the selection rules and calculations below, makes the figures reproducible if GitHub later changes the dataset. Metric definitions and collection limits follow [GitHub’s datasheet at the same commit](https://github.com/github/innovationgraph/blob/078fb62ee4395d321bec9f4f06694cca68f6b6cb/docs/datasheet.md).

The observations are calendar quarters, ending in 2026 Q1. They describe activity that GitHub reports for *public* repositories, not all software development. This note covers pushes, developer accounts, repositories, organisations, language participation and directed cross-border contributions. The population-adjusted figure has an additional population source and is outside this note’s scope. Tool-launch dates and external research are likewise separate from the GitHub data.

## The comparable push panel

The principal comparison includes economies with two-letter codes and a reported `git_pushes` value in **each of the 25 quarters** from 2020 Q1 through 2026 Q1. GitHub’s `EU` aggregate is excluded. These rules leave 149 economies. The world total, country and regional shares, and country growth rates all refer to this fixed panel. Without a fixed membership, a change in which economies appear in the dataset could be mistaken for a change in activity.

For each quarter, the panel total is the sum of published push counts across those 149 economies. It rises from **80,814,468 in 2020 Q1** to **319,243,451 in 2026 Q1**. Each economy’s share divides its pushes by that quarter’s panel total; a region’s share sums the pushes of its member economies before dividing by the same total. Thus “world” in these figures means the comparison panel, not every push on GitHub. The panel accounts for approximately 99.995% of reported pushes from individual two-letter economies outside `EU` at the first endpoint and 99.813% at the last.

A push records an upload of changes to a repository. One push can contain several commits; it is not a measure of lines of code, accepted pull requests, releases or finished products. The records do not say whether a coding assistant or agent helped produce a change. GitHub filters accounts it identifies as automated or inauthentic, but the remaining count cannot be interpreted as a measure of human-written code.

## Growth, ranks and regional summaries

Year-on-year growth compares each quarter with the same quarter a year earlier: `(pushes_t / pushes_t−4 − 1) × 100`. The first available year-on-year observation is therefore 2021 Q1. For the comparison of growth periods, each two-year rate is annualised as `[(end / start)^(1/2) − 1] × 100`. This calculation compares 2020 Q1–2022 Q1 with 2024 Q1–2026 Q1 for each of the 149 economies. The later rate is higher in **110** economies and lower in **39**. A slower rate does not necessarily mean that the number of pushes fell.

The latest-year comparison runs from 2025 Q1 to 2026 Q1. To form the quintiles, economies are ranked by their **2025 Q1** push counts and divided into groups of **30, 30, 29, 30 and 30**. The total for each fixed group is then compared across the two quarters. Within-region concentration is the sum of squared economy shares *within a region*, a Herfindahl-type index. Each region’s value is indexed to 100 in 2023 Q1. A rise means that pushes within that region became more concentrated among its member economies; it does not mean the region gained world share.

GitHub supplies economy codes, not the six region labels in the article. Commenda assigned economies to those regions for aggregation, placing `MV` in Asia and `RE` in Africa. The African group consequently contains 34 reporting economies, including Réunion. The complete assignment and the plotted economy-quarter values appear in [`figure-03-quarterly.csv`](https://github.com/yashveeeeeer/commenda-media-dashboard-site/blob/main/articles/geography-of-code/figure-03-quarterly.csv). These are editorial groupings, not GitHub’s regional classifications.

## Other GitHub measures

The comparisons of developer accounts, repositories and organisations sum their respective GitHub series over the same 149 economies and quarters. A developer-account count includes accounts that may no longer be active, so its growth is not a measure of productivity per person.

The TypeScript–Java comparison draws on GitHub’s `num_pushers` measure, which counts developers who pushed to repositories containing each language. The sample retains two-letter economy codes other than `EU` where **both** language counts are reported in **2020 Q1 and 2026 Q1**. It contains 93 economies; a count in every intervening quarter is *not* required. This is participation in repositories associated with a language, not a push count or proof that each contributor wrote that language.

## Cross-border contributions: a separate denominator

GitHub’s `economy_collaborators.csv` records directed links from the contributor’s economy to the repository’s economy. Its *contribution weight* is the sum of pushes sent and pull requests opened to repositories owned by someone else, under GitHub’s definitions. India → US, for example, denotes recorded activity by contributors assigned to India on repositories assigned to the US. It does not quantify code transferred, work accepted or economic trade.

The article’s **US destination share** is calculated from every *published* directed link at each endpoint. Eligible links have two-letter contributor and repository codes; `EU` and same-economy links are excluded. The numerator is the weight directed to repositories assigned to the US, and the denominator is the weight of all eligible cross-border links in that quarter. The result is **2,145,025 / 4,516,494 = 47.5% in 2020 Q1** and **5,972,820 / 12,715,023 = 47.0% in 2026 Q1**. This denominator is the set of eligible *published links*, **not** the 149-economy push panel.

The number of eligible links grows from 2,138 to 3,934 between the endpoints. As a result, the change in share may reflect both activity and which links met the conditions for publication; the extract cannot separate the two. For the 1,352 links reported in **all 25 quarters**, the US destination shares are 49.7% and 51.1%. The article presents the full published-link measure. The balanced-link result is provided here because the small difference between the full-panel endpoints should not be read as a precise change in the geography of collaboration.

The ribbon figure shows a narrower part of this network; its displayed flows do not define the denominator above. Origins are ranked by **total outbound weight across eligible published links in 2026 Q1**. The six largest are the US, Germany, the United Kingdom, Canada, India and France. Among their destinations, the seven with the largest combined incoming weight are the US, India, Germany, the United Kingdom, Canada, France and Hong Kong. All remaining destinations appear as “Other.” The figure shows where these leading recorded senders contributed, not the entire international network. Comparing India → US with US → India compares two published directions, not national deficits or ownership of code.

## Reporting limits and interpretation

GitHub reports an economy-level metric only when at least 100 relevant developers meet its publication threshold. A missing economy-quarter observation cannot be treated as zero activity. The absence of a directed link likewise does not establish that no collaboration occurred; this extract does not identify why an individual link is missing. The fixed push panel, the endpoint language sample and the published-link set have different inclusion rules and denominators.

According to [GitHub’s datasheet](https://github.com/github/innovationgraph/blob/078fb62ee4395d321bec9f4f06694cca68f6b6cb/docs/datasheet.md), a user’s economy is the most frequent location in daily IP observations during the quarter. GitHub carries the last known location forward on inactive days. Repository geography reflects the most frequent location among members with triage access or higher. VPNs and multinational teams can make these assignments imperfect proxies for where work took place. Filtering identified automated accounts means the data cannot enumerate all agent output. Nor do they distinguish an uploaded change from its acceptance, release or eventual impact.

The two measures therefore answer different questions. Pushes indicate **where reported public uploads originated**; directed links indicate **where recorded cross-border contributions were directed**, according to GitHub’s economy assignments. Neither measures how much code was written, establishes that AI tools caused the growth, or captures all software work within an economy.

## Source files

The quantitative sources are GitHub Innovation Graph files at the pinned commit: [`git_pushes.csv`](https://github.com/github/innovationgraph/blob/078fb62ee4395d321bec9f4f06694cca68f6b6cb/data/git_pushes.csv), [`developers.csv`](https://github.com/github/innovationgraph/blob/078fb62ee4395d321bec9f4f06694cca68f6b6cb/data/developers.csv), [`repositories.csv`](https://github.com/github/innovationgraph/blob/078fb62ee4395d321bec9f4f06694cca68f6b6cb/data/repositories.csv), [`organizations.csv`](https://github.com/github/innovationgraph/blob/078fb62ee4395d321bec9f4f06694cca68f6b6cb/data/organizations.csv), [`languages.csv`](https://github.com/github/innovationgraph/blob/078fb62ee4395d321bec9f4f06694cca68f6b6cb/data/languages.csv) and [`economy_collaborators.csv`](https://github.com/github/innovationgraph/blob/078fb62ee4395d321bec9f4f06694cca68f6b6cb/data/economy_collaborators.csv). GitHub’s [repository README](https://github.com/github/innovationgraph/blob/078fb62ee4395d321bec9f4f06694cca68f6b6cb/README.md) and [datasheet](https://github.com/github/innovationgraph/blob/078fb62ee4395d321bec9f4f06694cca68f6b6cb/docs/datasheet.md) describe the metrics and their collection limits.
