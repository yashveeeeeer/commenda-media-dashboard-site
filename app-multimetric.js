import * as maplibregl from "https://unpkg.com/maplibre-gl@6.7.0/dist/maplibre-gl.mjs";

const GEOMETRY_URL = "data/country-geometry.geojson";
const METRICS_URL = "data/country-metrics.json";
const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/fiord";
const SOURCE_ID = "github-countries";
const HIT_LAYERS = ["country-fill-in", "country-fill"];
const NO_VALUE = -9999;
const DEFAULT_METRIC = "git_pushes";
const DEFAULT_BASELINE = "2020_q4";
const FRAME_DURATION = 560;

// One percentage-change scale is deliberately shared across measures and quarters.
const RAMP = [0, "#514a4d", 50, "#7a5320", 150, "#a67420", 300, "#cf9535", 600, "#f0b65a", 1200, "#ffd99b"];

const $ = selector => document.querySelector(selector);
const elements = {
  lens: $("#lens"),
  crosshair: $("#crosshair"),
  bars: $("#metric-bars"),
  place: $("#place-name"),
  context: $("#place-context"),
  search: $("#country-search"),
  options: $("#country-options"),
  clear: $("#clear-search"),
  primaryCount: $("#push-count"),
  comparatorCount: $("#developer-count"),
  share: $("#global-share"),
  shareKind: $("#share-kind"),
  rank: $("#reported-rank"),
  rankKind: $("#rank-kind"),
  warning: $("#summary-warning"),
  metric: $("#metric-select"),
  baseline: $("#baseline-period"),
  segmented: document.querySelectorAll(".segmented button"),
  note: $("#denominator-note"),
  legendMetric: $("#legend-metric"),
  legendBaseline: $("#legend-baseline"),
  primarySummaryLabel: $("#push-summary-label"),
  comparatorSummaryLabel: $("#developer-summary-label"),
  play: $("#play-change"),
  zoomIn: $("#zoom-in"),
  zoomOut: $("#zoom-out"),
  infoButton: $("#info-button"),
  infoPanel: $("#info-panel"),
  infoPeriod: $("#info-period"),
  infoRankKind: $("#info-rank-kind"),
  infoMetricDefinition: $("#info-metric-definition"),
  infoMetricCaveat: $("#info-metric-caveat"),
};

let geography;
let payload;
let metricsById;
let codeIndex;
let periodIndex;
let selectedIso2 = null;
let valueMode = "absolute";
let activeMetricId = DEFAULT_METRIC;
let baselineIndex = 0;
let currentIndex = 0;
let finalIndex = 0;
let releaseFinalIndex = 0;
let populationFinalIndex = 0;
let scheduled = false;
let playing = false;
let playbackTimer = 0;

const mobile = window.matchMedia("(max-width: 580px)");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const asNumber = value => value === null || value === undefined || value === "" ? Number.NaN : Number(value);

const map = new maplibregl.Map({
  container: "map",
  style: BASEMAP_STYLE,
  center: [80, 22],
  zoom: 2.45,
  minZoom: 1.25,
  maxZoom: 7,
  pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
  maxPitch: 0,
  pitchWithRotate: false,
  dragRotate: false,
  touchPitch: false,
  attributionControl: false,
  fadeDuration: 0,
  renderWorldCopies: true,
  cooperativeGestures: false,
});
map.touchZoomRotate.disableRotation();
map.keyboard.disableRotation();
window.__storyMap = map;

const compactNumber = value => {
  if (!Number.isFinite(value)) return "Not published";
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
};

const percent = value => {
  if (!Number.isFinite(value)) return "Not comparable";
  if (Math.abs(value) < 0.05) return "0.0%";
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(Math.abs(value) >= 100 ? 0 : 1)}%`;
};

const share = value => {
  if (!Number.isFinite(value)) return "Not published";
  return `${value.toFixed(value < 0.1 ? 3 : value < 1 ? 2 : 1)}%`;
};

const rate = value => {
  if (!Number.isFinite(value)) return "Not available";
  return new Intl.NumberFormat("en", { maximumFractionDigits: value < 100 ? 1 : 0 }).format(value);
};

const activeMetric = () => metricsById.get(activeMetricId);
const comparatorMetric = () => metricsById.get(activeMetricId === "developers" ? "git_pushes" : "developers");
const currentPeriod = () => payload.periods[currentIndex];
const baselinePeriod = () => payload.periods[baselineIndex];

function metricValue(metric, field, index, iso2) {
  const countryIndex = codeIndex.get(iso2);
  if (countryIndex === undefined || index < 0 || !metric[field]?.[index]) return Number.NaN;
  return asNumber(metric[field][index][countryIndex]);
}

function displayValue(metric, index, iso2) {
  return metricValue(metric, valueMode === "population" ? "perMillionPeople" : "value", index, iso2);
}

function growth(currentValue, baselineValue) {
  if (!Number.isFinite(currentValue) || !Number.isFinite(baselineValue) || baselineValue <= 0) return Number.NaN;
  return 100 * (currentValue / baselineValue - 1);
}

function metricsFor(iso2) {
  const primary = activeMetric();
  const comparator = comparatorMetric();
  const primaryCurrent = displayValue(primary, currentIndex, iso2);
  const primaryBaseline = displayValue(primary, baselineIndex, iso2);
  const comparatorCurrent = displayValue(comparator, currentIndex, iso2);
  const comparatorBaseline = displayValue(comparator, baselineIndex, iso2);
  return {
    primary,
    comparator,
    primaryCurrent,
    comparatorCurrent,
    primaryGrowth: growth(primaryCurrent, primaryBaseline),
    comparatorGrowth: growth(comparatorCurrent, comparatorBaseline),
    primaryShare: metricValue(primary, "globalSharePct", currentIndex, iso2),
    populationCurrentYear: asNumber(payload.populationYear[currentIndex]?.[codeIndex.get(iso2)]),
    populationBaselineYear: asNumber(payload.populationYear[baselineIndex]?.[codeIndex.get(iso2)]),
  };
}

function currentRank(metric, iso2) {
  if (valueMode === "absolute") return metricValue(metric, "rank", currentIndex, iso2);
  const ranked = payload.codes
    .map(code => ({ code, value: displayValue(metric, currentIndex, code) }))
    .filter(item => Number.isFinite(item.value))
    .sort((a, b) => b.value - a.value);
  const index = ranked.findIndex(item => item.code === iso2);
  return index < 0 ? Number.NaN : index + 1;
}

function metricQuantityLabel(metric, periodLabel) {
  if (valueMode === "population") return `${metric.shortLabel.toLowerCase()} / 1M`;
  return `${metric.shortLabel.toLowerCase()}, ${periodLabel}`;
}

function modeLabels() {
  const primary = activeMetric();
  const comparator = comparatorMetric();
  return {
    primaryBar: valueMode === "population" ? `${primary.shortLabel} rate` : primary.label,
    comparatorBar: valueMode === "population" ? `${comparator.shortLabel} rate` : comparator.label,
    primaryCount: metricQuantityLabel(primary, currentPeriod().label),
    comparatorCount: metricQuantityLabel(comparator, currentPeriod().label),
    rank: valueMode === "population"
      ? `global ${primary.shortLabel.toLowerCase()}-rate rank`
      : `global ${primary.shortLabel.toLowerCase()} rank`,
    share: `global ${primary.shortLabel.toLowerCase()} share`,
  };
}

function renderBars(metrics) {
  const text = modeLabels();
  const rows = [
    { className: "push", label: text.primaryBar, value: metrics.primaryGrowth },
    { className: "developer", label: text.comparatorBar, value: metrics.comparatorGrowth },
  ];
  const largest = Math.max(1, ...rows.map(row => Number.isFinite(row.value) ? Math.abs(row.value) : 0));
  elements.bars.replaceChildren();

  for (const row of rows) {
    const finite = Number.isFinite(row.value);
    const negative = finite && row.value < 0;
    const width = finite ? Math.max(1.5, Math.abs(row.value) / largest * 100) : 0;
    const rowElement = document.createElement("div");
    rowElement.className = "bar-row";

    const top = document.createElement("div");
    top.className = "bar-top";
    const name = document.createElement("span");
    name.className = "bar-name";
    name.textContent = row.label;
    const value = document.createElement("span");
    value.className = finite ? "bar-value" : "bar-value muted";
    value.textContent = percent(row.value);
    top.append(name, value);

    const track = document.createElement("div");
    track.className = "track";
    const fill = document.createElement("div");
    fill.className = `fill ${negative ? "negative" : row.className}`;
    fill.style.width = `${width}%`;
    track.append(fill);
    rowElement.append(top, track);
    elements.bars.append(rowElement);
  }
}

function applySelectionFilters(iso2) {
  const filter = ["==", ["get", "economy_iso2"], iso2 || ""];
  for (const layer of ["country-selected-glow", "country-selected-line"]) {
    if (map.getLayer(layer)) map.setFilter(layer, filter);
  }
}

function showEmpty() {
  if (selectedIso2 === null && elements.lens.classList.contains("is-empty")) return;
  selectedIso2 = null;
  applySelectionFilters(null);
  elements.lens.classList.add("is-empty");
  elements.place.textContent = "Open water";
  elements.context.textContent = "Drag the map until a country sits under the crosshair.";
  elements.warning.textContent = "";
}

function updateModeLabels() {
  if (!payload) return;
  const metric = activeMetric();
  const text = modeLabels();
  elements.legendMetric.textContent = `${metric.shortLabel} growth`;
  elements.legendBaseline.textContent = baselinePeriod().label;
  elements.infoPeriod.textContent = `${currentPeriod().label}, the selected comparison quarter`;
  elements.infoMetricDefinition.textContent = `${metric.definition}.`;
  elements.infoMetricCaveat.textContent = metric.caveat;
  elements.primarySummaryLabel.textContent = text.primaryCount;
  elements.comparatorSummaryLabel.textContent = text.comparatorCount;
  elements.rankKind.textContent = text.rank;
  elements.shareKind.textContent = text.share;
  elements.infoRankKind.textContent = valueMode === "population"
    ? "The displayed rank uses the per-person rate; global share still uses the reported total."
    : "Ranks use the selected reported measure in that quarter.";
  elements.note.hidden = valueMode !== "population";
  elements.note.textContent = `Population data through ${currentPeriod().label}.`;
  elements.play.textContent = reducedMotion.matches
    ? currentIndex >= finalIndex ? "Start" : "End"
    : playing ? "Pause" : currentIndex < finalIndex ? "Resume" : "Play";
  elements.play.setAttribute(
    "aria-label",
    reducedMotion.matches
      ? `Show ${currentIndex >= finalIndex ? baselinePeriod().label : payload.periods[finalIndex].label} comparison state`
      : "Play quarterly change from the selected baseline",
  );
  elements.play.setAttribute("aria-pressed", String(playing));
}

function selectFeature(feature, force = false) {
  const properties = feature.properties;
  const iso2 = properties.economy_iso2;
  if (!iso2) return showEmpty();
  if (!force && iso2 === selectedIso2) return;

  selectedIso2 = iso2;
  applySelectionFilters(iso2);
  elements.lens.classList.remove("is-empty");
  const metrics = metricsFor(iso2);
  const reportedRank = currentRank(metrics.primary, iso2);
  const text = modeLabels();

  elements.place.textContent = properties.economy_name;
  elements.context.textContent = Number.isFinite(metrics.primaryGrowth)
    ? `${metrics.primary.shortLabel} change from ${baselinePeriod().label} to ${currentPeriod().label}`
    : `No comparable ${baselinePeriod().label} value for ${metrics.primary.shortLabel.toLowerCase()}`;
  elements.primaryCount.textContent = valueMode === "population" ? rate(metrics.primaryCurrent) : compactNumber(metrics.primaryCurrent);
  elements.comparatorCount.textContent = valueMode === "population" ? rate(metrics.comparatorCurrent) : compactNumber(metrics.comparatorCurrent);
  elements.share.textContent = share(metrics.primaryShare);
  elements.rank.textContent = Number.isFinite(reportedRank) ? `#${reportedRank}` : "Not ranked";
  elements.primarySummaryLabel.textContent = text.primaryCount;
  elements.comparatorSummaryLabel.textContent = text.comparatorCount;
  elements.rankKind.textContent = text.rank;
  elements.shareKind.textContent = text.share;

  const warnings = [];
  if (!Number.isFinite(metrics.primaryCurrent)) warnings.push("GitHub did not publish this country-measure observation.");
  if (iso2 === "CN") warnings.push("China: the main series assigns location by IP; the separate profile-weighted snapshot produces a very different rank.");
  if (valueMode === "population") {
    const baselineYear = Number.isFinite(metrics.populationBaselineYear) ? metrics.populationBaselineYear : "unavailable";
    const currentYear = Number.isFinite(metrics.populationCurrentYear) ? metrics.populationCurrentYear : "unavailable";
    warnings.push(`Population: ${baselineYear} baseline · ${currentYear} current.`);
  }
  elements.warning.textContent = warnings.join(" ");
  renderBars(metrics);
}

function refreshFeatureStates() {
  if (!payload || !map.getSource(SOURCE_ID)) return;
  const metric = activeMetric();
  for (const feature of geography.features) {
    const iso2 = feature.properties.economy_iso2;
    const change = growth(displayValue(metric, currentIndex, iso2), displayValue(metric, baselineIndex, iso2));
    map.setFeatureState(
      { source: SOURCE_ID, id: iso2 },
      { growth: Number.isFinite(change) ? change : NO_VALUE },
    );
  }
}

function placeCrosshair(point) {
  if (mobile.matches) {
    elements.crosshair.style.left = `${point.x}px`;
    elements.crosshair.style.top = `${point.y}px`;
  } else {
    elements.crosshair.style.removeProperty("left");
    elements.crosshair.style.removeProperty("top");
  }
}

function selectionAtCenter() {
  scheduled = false;
  const point = map.project(map.getCenter());
  placeCrosshair(point);
  if (!map.getLayer("country-fill")) return;
  const box = [[point.x - 3, point.y - 3], [point.x + 3, point.y + 3]];
  const features = map.queryRenderedFeatures(box, { layers: HIT_LAYERS });
  if (features.length) selectFeature(features[0]);
  else showEmpty();
}

let lastMoveSelection = 0;
function scheduleSelection() {
  if (scheduled) return;
  const now = performance.now();
  if (now - lastMoveSelection < 120) return;
  lastMoveSelection = now;
  scheduled = true;
  requestAnimationFrame(selectionAtCenter);
}

function selectNow() {
  scheduled = false;
  selectionAtCenter();
}

function refreshSelection() {
  updateModeLabels();
  refreshFeatureStates();
  if (!geography) return;
  const feature = geography.features.find(item => item.properties.economy_iso2 === selectedIso2);
  if (feature) selectFeature(feature, true);
}

function applyPadding() {
  map.setPadding(mobile.matches
    ? { top: 300, bottom: 350, left: 0, right: 0 }
    : { top: 0, bottom: 0, left: 0, right: 0 });
  scheduleSelection();
}

function setupSearch() {
  const features = [...geography.features]
    .filter(feature => feature.properties.economy_name)
    .sort((a, b) => a.properties.economy_name.localeCompare(b.properties.economy_name));
  elements.options.replaceChildren();
  for (const feature of features) {
    const option = document.createElement("option");
    option.value = feature.properties.economy_name;
    elements.options.append(option);
  }

  const findCountry = () => {
    const query = elements.search.value.trim().toLocaleLowerCase();
    const feature = features.find(item => item.properties.economy_name.toLocaleLowerCase() === query);
    if (!feature) return;
    map.stop();
    selectFeature(feature, true);
    document.body.dataset.mapSettled = "false";
    map.easeTo({
      center: [Number(feature.properties.label_lng), Number(feature.properties.label_lat)],
      zoom: Math.max(map.getZoom(), feature.properties.zoom_hint || 3.2),
      duration: reducedMotion.matches ? 0 : 900,
    });
    map.once("moveend", () => {
      selectFeature(feature, true);
      document.body.dataset.mapSettled = "true";
    });
    elements.search.blur();
  };

  const toggleClear = () => {
    elements.clear.hidden = elements.search.value.length === 0;
  };
  elements.search.addEventListener("input", toggleClear);
  elements.search.addEventListener("change", findCountry);
  elements.search.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      findCountry();
    }
  });
  elements.clear.addEventListener("click", () => {
    elements.search.value = "";
    toggleClear();
    elements.search.focus();
  });
}

function setupMetricOptions() {
  elements.metric.replaceChildren();
  const groups = new Map();
  for (const metric of payload.metrics) {
    if (!groups.has(metric.group)) {
      const group = document.createElement("optgroup");
      group.label = metric.group;
      groups.set(metric.group, group);
      elements.metric.append(group);
    }
    const option = document.createElement("option");
    option.value = metric.id;
    option.textContent = metric.id === "cross_border_collaboration_outbound"
      ? "Cross-border collaboration"
      : metric.label;
    groups.get(metric.group).append(option);
  }
  elements.metric.value = activeMetricId;
}

function firstReportedIndex(metric) {
  const index = metric.value.findIndex(row => row.some(value => value !== null));
  return index < 0 ? 0 : index;
}

function populateBaselineOptions(preferredIndex = baselineIndex) {
  const metric = activeMetric();
  const first = firstReportedIndex(metric);
  elements.baseline.replaceChildren();
  for (let index = first; index < finalIndex; index += 1) {
    if (!metric.value[index].some(value => value !== null)) continue;
    const option = document.createElement("option");
    option.value = payload.periods[index].key;
    option.textContent = payload.periods[index].label;
    elements.baseline.append(option);
  }

  const defaultIndex = periodIndex.get(DEFAULT_BASELINE);
  const available = [...elements.baseline.options].map(option => periodIndex.get(option.value));
  baselineIndex = available.includes(preferredIndex)
    ? preferredIndex
    : available.includes(defaultIndex)
      ? defaultIndex
      : available[0];
  elements.baseline.value = payload.periods[baselineIndex].key;
}

function setEndpointForMode() {
  finalIndex = valueMode === "population" ? populationFinalIndex : releaseFinalIndex;
}

function stopPlayback() {
  window.clearTimeout(playbackTimer);
  playing = false;
  elements.lens.setAttribute("aria-live", "polite");
  updateModeLabels();
}

function playbackStep() {
  if (!playing) return;
  if (currentIndex >= finalIndex) {
    stopPlayback();
    return;
  }
  currentIndex += 1;
  refreshSelection();
  playbackTimer = window.setTimeout(playbackStep, FRAME_DURATION);
}

function togglePlayback() {
  if (playing) {
    stopPlayback();
    return;
  }
  if (reducedMotion.matches) {
    currentIndex = currentIndex >= finalIndex ? baselineIndex : finalIndex;
    refreshSelection();
    return;
  }
  if (currentIndex >= finalIndex) currentIndex = baselineIndex;
  playing = true;
  elements.lens.setAttribute("aria-live", "off");
  refreshSelection();
  playbackTimer = window.setTimeout(playbackStep, FRAME_DURATION);
}

function setupControls() {
  setupMetricOptions();
  populateBaselineOptions(periodIndex.get(DEFAULT_BASELINE));

  elements.metric.addEventListener("change", () => {
    stopPlayback();
    activeMetricId = elements.metric.value;
    currentIndex = finalIndex;
    populateBaselineOptions(baselineIndex);
    refreshSelection();
  });
  elements.baseline.addEventListener("change", () => {
    stopPlayback();
    baselineIndex = periodIndex.get(elements.baseline.value);
    currentIndex = finalIndex;
    refreshSelection();
  });
  for (const button of elements.segmented) {
    button.addEventListener("click", () => {
      stopPlayback();
      valueMode = button.dataset.mode;
      setEndpointForMode();
      populateBaselineOptions(baselineIndex);
      currentIndex = finalIndex;
      for (const other of elements.segmented) other.setAttribute("aria-checked", String(other === button));
      refreshSelection();
    });
  }
  elements.play.addEventListener("click", togglePlayback);
}

function quietBasemap() {
  for (const layer of map.getStyle().layers) {
    if (layer.id.startsWith("boundary") || layer.id.startsWith("landcover") || layer.id.startsWith("landuse") || layer.id.startsWith("park")) {
      map.setLayoutProperty(layer.id, "visibility", "none");
      continue;
    }
    if (layer.type === "symbol") {
      if (layer.id.startsWith("place_country") || layer.id === "water_name") {
        map.setLayoutProperty(layer.id, "text-field", ["coalesce", ["get", "name:en"], ["get", "name:latin"], ["get", "name"]]);
        map.setPaintProperty(layer.id, "text-color", "rgba(245, 242, 234, 0.62)");
        map.setPaintProperty(layer.id, "text-halo-color", "rgba(24, 30, 46, 0.85)");
        map.setPaintProperty(layer.id, "text-halo-width", 1.2);
      } else {
        map.setLayoutProperty(layer.id, "visibility", "none");
      }
    }
  }
  if (map.getLayer("background")) map.setPaintProperty("background", "background-color", "#2f3a4f");
  if (map.getLayer("water")) map.setPaintProperty("water", "fill-color", "#2a3447");
}

function addDataLayers() {
  map.addSource(SOURCE_ID, { type: "geojson", data: geography, promoteId: "economy_iso2" });
  const firstSymbol = map.getStyle().layers.find(layer => layer.type === "symbol")?.id;
  const change = ["coalesce", ["feature-state", "growth"], NO_VALUE];
  const fillColor = [
    "case",
    ["==", change, NO_VALUE], "rgba(255, 255, 255, 0.06)",
    ["<", change, 0], "#3f4757",
    ["interpolate", ["linear"], change, ...RAMP],
  ];
  const isIndia = ["==", ["get", "economy_iso2"], "IN"];
  const notIndia = ["!=", ["get", "economy_iso2"], "IN"];
  const lineWidth = ["interpolate", ["linear"], ["zoom"], 1, 0.5, 6, 1.3];
  const fillPaint = {
    "fill-color": fillColor,
    "fill-opacity": 1,
    "fill-color-transition": { duration: reducedMotion.matches ? 0 : 320 },
  };

  map.addLayer({ id: "country-fill", type: "fill", source: SOURCE_ID, filter: notIndia, paint: fillPaint }, firstSymbol);
  map.addLayer({ id: "country-line", type: "line", source: SOURCE_ID, filter: notIndia, paint: { "line-color": "rgba(255, 255, 255, 0.24)", "line-width": lineWidth } }, firstSymbol);
  map.addLayer({ id: "country-fill-in", type: "fill", source: SOURCE_ID, filter: isIndia, paint: fillPaint }, firstSymbol);
  map.addLayer({ id: "country-line-in", type: "line", source: SOURCE_ID, filter: isIndia, paint: { "line-color": "rgba(255, 255, 255, 0.24)", "line-width": lineWidth } }, firstSymbol);
  map.addLayer({
    id: "country-selected-glow",
    type: "line",
    source: SOURCE_ID,
    filter: ["==", ["get", "economy_iso2"], ""],
    paint: { "line-color": "rgba(255, 255, 255, 0.28)", "line-width": 9, "line-blur": 4 },
  }, firstSymbol);
  map.addLayer({
    id: "country-selected-line",
    type: "line",
    source: SOURCE_ID,
    filter: ["==", ["get", "economy_iso2"], ""],
    paint: { "line-color": "#f5f2ea", "line-width": ["interpolate", ["linear"], ["zoom"], 1, 1.4, 6, 2.4] },
  }, firstSymbol);
}

function setInfoOpen(open) {
  elements.infoPanel.hidden = !open;
  elements.infoButton.setAttribute("aria-expanded", String(open));
}

elements.infoButton.addEventListener("click", () => setInfoOpen(elements.infoPanel.hidden));
document.addEventListener("click", event => {
  if (elements.infoPanel.hidden) return;
  if (elements.infoPanel.contains(event.target) || elements.infoButton.contains(event.target)) return;
  setInfoOpen(false);
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !elements.infoPanel.hidden) setInfoOpen(false);
});
elements.zoomIn.addEventListener("click", () => map.zoomIn({ duration: reducedMotion.matches ? 0 : 300 }));
elements.zoomOut.addEventListener("click", () => map.zoomOut({ duration: reducedMotion.matches ? 0 : 300 }));
mobile.addEventListener("change", applyPadding);

async function initialise() {
  try {
    quietBasemap();
  } catch (error) {
    console.error("Basemap tweaks failed", error);
  }

  const [geometryResponse, metricsResponse] = await Promise.all([fetch(GEOMETRY_URL), fetch(METRICS_URL)]);
  if (!geometryResponse.ok) throw new Error(`Country geometry failed to load: ${geometryResponse.status}`);
  if (!metricsResponse.ok) throw new Error(`Metric data failed to load: ${metricsResponse.status}`);
  geography = await geometryResponse.json();
  payload = await metricsResponse.json();
  metricsById = new Map(payload.metrics.map(metric => [metric.id, metric]));
  codeIndex = new Map(payload.codes.map((code, index) => [code, index]));
  periodIndex = new Map(payload.periods.map((period, index) => [period.key, index]));
  releaseFinalIndex = payload.periods.length - 1;
  populationFinalIndex = payload.populationYear.findLastIndex(row => row.some(value => value !== null));
  if (populationFinalIndex < 0) throw new Error("Population normalization has no supported quarter");
  setEndpointForMode();
  currentIndex = finalIndex;

  if (!metricsById.has(DEFAULT_METRIC)) throw new Error(`Default metric ${DEFAULT_METRIC} is missing`);
  if (geography.features.length !== payload.codes.length) throw new Error("Geometry and metric economy counts differ");
  for (const metric of payload.metrics) {
    if (metric.value.length !== payload.periods.length || metric.value.some(row => row.length !== payload.codes.length)) {
      throw new Error(`Metric matrix is incomplete for ${metric.id}`);
    }
  }

  window.__storyDataset = geography;
  window.__storyMetricData = payload;
  window.__storyState = () => ({
    metric: activeMetricId,
    baseline: baselinePeriod().source,
    current: currentPeriod().source,
    scale: valueMode,
    selectedIso2,
    playing,
  });

  setupControls();
  updateModeLabels();
  addDataLayers();
  refreshFeatureStates();
  setupSearch();

  map.on("move", scheduleSelection);
  map.on("moveend", selectNow);
  map.on("idle", selectNow);
  map.on("resize", selectNow);

  let settleTimer = 0;
  map.on("movestart", () => {
    window.clearTimeout(settleTimer);
    document.body.classList.add("is-moving");
  });
  map.on("moveend", () => {
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => document.body.classList.remove("is-moving"), 160);
  });
  map.on("idle", () => document.body.classList.remove("is-moving"));
  map.on("click", event => {
    const features = map.queryRenderedFeatures(event.point, { layers: HIT_LAYERS });
    if (!features[0]) return;
    map.easeTo({ center: event.lngLat, duration: reducedMotion.matches ? 0 : 550 });
  });

  applyPadding();
  const india = geography.features.find(feature => feature.properties.economy_iso2 === "IN");
  if (india) map.jumpTo({ center: [india.properties.label_lng, india.properties.label_lat], zoom: 2.45 });
  map.resize();
  selectNow();
  document.body.dataset.storyReady = "true";
  document.body.dataset.mapSettled = "true";
  map.once("load", () => {
    map.resize();
    selectNow();
  });
}

if (map.isStyleLoaded()) initialise();
else map.once("style.load", initialise);

map.on("error", event => {
  console.error(event.error || event);
});
