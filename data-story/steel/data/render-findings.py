"""Insert the verified numeric findings into the authored global story and method."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
stats = json.loads((ROOT/'data/world-summary.json').read_text(encoding='utf-8'))
countries = {r['iso3']:r['name'] for r in json.loads((ROOT/'dashboard/countries.json').read_text(encoding='utf-8'))['countries']}
countries.update(CHN='China', USA='United States')
gross,net = stats['gross'],stats['net']

def insert(path,key,html):
    path=ROOT/path
    before,rest=path.read_text(encoding='utf-8').split(f'<!-- {key}-start -->')
    _,after=rest.split(f'<!-- {key}-end -->')
    path.write_text(before+f'<!-- {key}-start -->\n'+html+f'\n<!-- {key}-end -->'+after,encoding='utf-8',newline='\n')

def weights(scope):
    return [scope['equity'][key] for key in ("Domestic","Overseas","Unassigned")]

def equity_chart(scope):
    values=weights(scope)
    labels=["Based in the host country","Based overseas","Unassigned"]
    fills=['var(--coral)','var(--blue)','#958b85']
    bars=''.join(f'<span style="width:{100*v/scope["mt"]:.7f}%"></span>' for v in values)
    key=''.join(f'<span><i style="background:{c}" aria-hidden="true"></i>{n}<b>{v:.1f} Mt/yr</b></span>' for n,v,c in zip(labels,values,fills))
    return f'<div class="equity-chart"><div class="equity-strip" aria-hidden="true">{bars}</div><div class="equity-key">{key}</div></div>'

rank=list(gross['hosts'].items())[:5]
host_chart='\n'.join(f'<div class="compare-row"><div>{countries[c]} <b>{mt:.1f} Mt/yr</b></div><div class="track" aria-hidden="true"><span style="width:{100*mt/rank[0][1]:.5f}%"></span></div></div>' for c,mt in rank)
insert('index.html','hosts',host_chart)
dom,abroad,missing=weights(gross)
nd,na,nu=weights(net)
partial=stats["reviewedCorrectionsOnly"]
pd,pa,pu=weights(partial)
domshare=100*dom/gross['mt']
projects=json.loads((ROOT/'data/world.json').read_text(encoding='utf-8'))['projects']
def host_dom(host):
    return sum((p["grossMt"] or 0)*o["stake"] for p in projects if p["country"]==host for o in p["owners"] if o["country"]==host and o["stake"])
china,india=host_dom('CHN'),host_dom('IND')

rank_hq=[(c,v) for c,v in gross['headquarters'].items() if c!='Unassigned'][:3]
top=', '.join(countries[c] for c,v in rank_hq[:2])+' and '+countries[rank_hq[2][0]]
majority=f'Even if every unassigned tonne belonged to an overseas company, domestic owners would still account for a majority of the construction list.' if dom>gross['mt']/2 else 'The unresolved share is large enough to change whether domestic owners hold a majority.'
text=f"""<p>Companies based in the country where a furnace is being built account for <strong>{dom:.1f} million tonnes a year, or {domshare:.1f}% of the tracker’s measured construction capacity</strong>. Companies based overseas account for {abroad:.1f} million. The remaining {missing:.1f} million tonnes combine stakes held by financial investors with shares whose industrial owner, percentage or headquarters we could not establish. {majority} <a class="ref" href="method/#ownership" aria-label="Ownership rules and allocations">2a</a></p>
<figure class="figure"><div class="figure-heading"><span>Fig. 03</span><h2>Who owns the capacity under construction?</h2></div>{equity_chart(gross)}
<figcaption>Each plant’s capacity is split according to disclosed equity. Domestic and overseas are relative to each furnace’s host country. Grey keeps missing shares, uncertain ownership chains and financial investors visible.</figcaption></figure>
<p>Of the 42.3 million tonnes being built in China, {china:.1f} million trace to owners based there. In India, local companies account for {india:.1f} million of 37.6 million. Two projects account for India’s entire 14.2 million tonnes of identified overseas ownership. One is Hazira. The other is Anakapalle, where the same two partners propose another 8.2 million tonnes. GEM counts it as under construction. ArcelorMittal still called it announced in its September-quarter report, so we leave it out of the checked additions. <a class="ref" href="method/#site-P100001025671" aria-label="Anakapalle status and ownership evidence">2b</a></p>
<p>Among the headquarters we can locate, {top} have the largest totals. Luxembourg illustrates what an ownership map can reveal. Companies based there account for {gross['headquarters']['LUX']:.1f} million tonnes of annual capacity in other countries. Luxembourg itself has no furnace on the tracker’s construction list.</p>"""
insert('index.html','equity',text)
text=f"""<p>We documented <strong>{net['mt']:g} million tonnes of positive additions at {net['plants']} plants in {len(net['hosts'])} countries</strong>. Companies based in the host country account for {nd:.2f} million tonnes of that total, overseas companies for {na:.2f} million, and {nu:.2f} million remain unassigned. India alone accounts for {net['hosts']['IND']:.2f} million of the checked additions. Across the tracker, {stats['zeroSites']} sites contribute zero to the checked additions and {stats['pendingSites']} still have an unresolved net amount.</p>
<p>How much does the ownership result depend on those old furnaces? Apply only the capacity corrections we could measure and leave every unresolved site at its full tracker rating. The share traced to domestic owners falls from {domshare:.1f}% to {100*pd/partial["mt"]:.1f}%. Domestic companies own a narrow majority of the measured capacity on the construction list. We cannot yet say they own a majority of the steelmaking capacity the world will gain. <a class="ref" href="method/#checks" aria-label="Checked additions and unresolved capacity">8</a></p>"""
insert('index.html','net',text)
insert('method/index.html','join','<p>The frozen API includes 160 steelmaking units. Grouping them by plant and furnace method gives one numerical difference from the release. At BAP Al-Khair, the API gives 1.5 Mt/yr and the September file gives 1.7. The map keeps the September figure. The resulting worldwide totals are 171.188 and 171.388 Mt/yr respectively. <a href="../data/global/audit.json">Unit reconciliation and source checksums</a></p>')
text=f"""<p>We made {stats['checks']} site-specific checks covering {stats['checkedGrossMt']:.3f} Mt/yr of the September list. Across all 107 records, {net['plants']} have positive measured additions, {stats['zeroSites']} have zero eligible additions and {stats['pendingSites']} have unresolved net capacity. Of the {stats['pendingSites']} unresolved sites, {stats['checks']-stats['zeroSites']-net['plants']} had an inconclusive project-level review and {len(projects)-stats['checks']} have no separate project-level ruling. The checked positives total {net['mt']:g} Mt/yr. The source evidence is uneven across countries, so this subset cannot estimate ownership of all net additions worldwide.</p>
<p>Allocating every unresolved gross stake overseas would raise the overseas total from {abroad:.2f} to {abroad+missing:.2f} Mt/yr and leave {dom:.2f} Mt/yr attributed domestically. Allocating every unresolved stake domestically would raise domestic capacity to {dom+missing:.2f} Mt/yr. These are extreme bounds. Both maps use the disclosed allocations only.</p>
<p>One further test applies each measured project correction while leaving every unresolved project at its full tracker rating. This gives {partial["mt"]:.2f} Mt/yr, of which {pd:.2f} Mt/yr ({100*pd/partial["mt"]:.1f}%) is assigned domestically. This scenario shows how corrections affect the gross majority. It is conditional on all unresolved capacity counting in full.</p>
<div class="numbers"><table><caption>Equity-weighted annual capacity, Mt/yr</caption><thead><tr><th>Construction measure</th><th>Domestic</th><th>Overseas</th><th>Unassigned</th><th>Total</th></tr></thead><tbody><tr><td>GEM gross</td><td>{dom:.2f}</td><td>{abroad:.2f}</td><td>{missing:.2f}</td><td>{gross['mt']:.2f}</td></tr><tr><td>Measured corrections only</td><td>{pd:.2f}</td><td>{pa:.2f}</td><td>{pu:.2f}</td><td>{partial["mt"]:.2f}</td></tr><tr><td>Checked positive additions</td><td>{nd:.2f}</td><td>{na:.2f}</td><td>{nu:.2f}</td><td>{net['mt']:.2f}</td></tr></tbody></table></div>"""
insert('method/index.html','check',text)
