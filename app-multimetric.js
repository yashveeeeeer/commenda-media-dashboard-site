import * as maplibregl from "https://unpkg.com/maplibre-gl@6.7.0/dist/maplibre-gl.mjs";
import { numeric, changePercent, competitionRank, supportedPeriods, coverageFor, observationStatus, validatePayload } from "./data-model.mjs";

const DATA_VERSION = "2026-09-10-r1";
const GEOMETRY_URL = `data/country-geometry-complete.geojson?v=${DATA_VERSION}`;
const METRICS_URL = `data/country-metrics.json?v=${DATA_VERSION}`;
const UNDERLAY_URL = `data/world-country-underlay.geojson?v=${DATA_VERSION}`;
const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/fiord";
const SOURCE_ID = "github-countries";
const UNDERLAY_SOURCE_ID = "world-country-underlay";
const UNAVAILABLE_SOURCE_ID = "unavailable-countries";
const LABEL_SOURCE_ID = "github-country-labels";
const HIT_LAYERS = ["country-fill-in", "country-fill"];
const NO_VALUE = -9999;
const DEFAULT_METRIC = "git_pushes";
const DEFAULT_BASELINE = "2020_q1";
const FRAME_DURATION = 560;

// One signed-log percentage-change scale is deliberately shared across measures and quarters.
const colourValue = value => Math.sign(value) * Math.log1p(Math.abs(value) / 50);
const RAMP = [
  colourValue(-100), "#003b73",
  colourValue(-25), "#3981f1",
  colourValue(0), "#f5f2e7",
  colourValue(50), "#fcebc5",
  colourValue(150), "#edc89b",
  colourValue(300), "#f19254",
  colourValue(600), "#f8684d",
  colourValue(1200), "#ca6780",
];

const MAP_LABEL_ALIASES = new Map([
  ["Bahamas, The", "Bahamas"],
  ["Congo, Dem. Rep.", "DR Congo"],
  ["Congo, Rep.", "Congo"],
  ["Egypt, Arab Rep.", "Egypt"],
  ["Gambia, The", "Gambia"],
  ["Hong Kong SAR, China", "Hong Kong"],
  ["Iran, Islamic Rep.", "Iran"],
  ["Korea, Rep.", "South Korea"],
  ["Kyrgyz Republic", "Kyrgyzstan"],
  ["Lao PDR", "Laos"],
  ["Macao SAR, China", "Macao"],
  ["Micronesia, Fed. Sts.", "Micronesia"],
  ["Russian Federation", "Russia"],
  ["Slovak Republic", "Slovakia"],
  ["Somalia, Fed. Rep.", "Somalia"],
  ["Syrian Arab Republic", "Syria"],
  ["United Arab Emirates", "UAE"],
  ["Venezuela, RB", "Venezuela"],
  ["Yemen, Rep.", "Yemen"],
]);

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
  infoCoverage: $("#info-coverage"),
};

let geography;
let underlay;
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
const asNumber = numeric;

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
  return changePercent(currentValue, baselineValue);
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
  return competitionRank(metric.perMillionPeople[currentIndex], codeIndex.get(iso2));
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
    rank: valueMode === "population" ? "per-person rank" : "reported rank",
    share: "reported share",
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
  const coverage = coverageFor(metric, currentIndex, baselineIndex, valueMode === "population");
  elements.note.hidden = false;
  elements.note.textContent = `${currentPeriod().label}: ${coverage.available} ${valueMode === "population" ? "rates" : "published"}; ${coverage.comparable} comparable.`;
  elements.infoCoverage.textContent = `${coverage.reported} economies have published ${metric.shortLabel.toLowerCase()} values in ${currentPeriod().label}. ${coverage.comparable} have both endpoints needed for the selected growth comparison. Missing values are not zero.`;
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
  const status = observationStatus(payload, metrics.primary, currentIndex, baselineIndex, codeIndex.get(iso2), valueMode === "population");
  const context = {
    current_not_published: `No published ${metrics.primary.shortLabel.toLowerCase()} value for ${currentPeriod().label}`,
    current_population_missing: `No ${currentPeriod().label.slice(0, 4)} population denominator`,
    baseline_not_published: `No published ${baselinePeriod().label} baseline for ${metrics.primary.shortLabel.toLowerCase()}`,
    baseline_population_missing: `No ${baselinePeriod().label.slice(0, 4)} population denominator for the baseline`,
    zero_baseline: `Zero baseline in ${baselinePeriod().label}; percentage growth is undefined`,
    comparable: `${metrics.primary.shortLabel} change from ${baselinePeriod().label} to ${currentPeriod().label}`,
  };
  elements.context.textContent = context[status];
  elements.primaryCount.textContent = valueMode === "population" ? rate(metrics.primaryCurrent) : compactNumber(metrics.primaryCurrent);
  elements.comparatorCount.textContent = valueMode === "population" ? rate(metrics.comparatorCurrent) : compactNumber(metrics.comparatorCurrent);
  elements.share.textContent = share(metrics.primaryShare);
  elements.rank.textContent = Number.isFinite(reportedRank) ? `#${reportedRank}` : "Not ranked";
  elements.primarySummaryLabel.textContent = text.primaryCount;
  elements.comparatorSummaryLabel.textContent = text.comparatorCount;
  elements.rankKind.textContent = text.rank;
  elements.shareKind.textContent = text.share;

  const warnings = [];
  if (status === "current_not_published") warnings.push("An unpublished observation is not zero. GitHub withholds some small counts.");
  if (status === "baseline_not_published") {
    const comparable = supportedPeriods(metrics.primary, valueMode === "population").filter(index => index < currentIndex && displayValue(metrics.primary, index, iso2) > 0);
    if (comparable.length) warnings.push(`First available baseline: ${payload.periods[comparable[0]].label}.`);
    else warnings.push("No earlier published value supports a growth comparison.");
  }
  if (status.includes("population_missing")) warnings.push("The GitHub count is published. Select Total to view it without a population denominator.");
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
    const state = {
      growth: Number.isFinite(change) ? change : NO_VALUE,
      colour: Number.isFinite(change) ? colourValue(change) : NO_VALUE,
    };
    map.setFeatureState({ source: SOURCE_ID, id: iso2 }, state);
    if (map.getSource(LABEL_SOURCE_ID)) map.setFeatureState({ source: LABEL_SOURCE_ID, id: iso2 }, state);
  }
}

function placeCrosshair(point) {
  if (mobile.matches) {
    const mapBounds = map.getContainer().getBoundingClientRect();
    elements.crosshair.style.left = `${mapBounds.left + point.x}px`;
    elements.crosshair.style.top = `${mapBounds.top + point.y}px`;
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
  const index = supportedPeriods(metric, valueMode === "population")[0] ?? -1;
  return index < 0 ? 0 : index;
}

function populateBaselineOptions(preferredIndex = baselineIndex) {
  const metric = activeMetric();
  const first = firstReportedIndex(metric);
  elements.baseline.replaceChildren();
  for (let index = first; index < finalIndex; index += 1) {
    if (!supportedPeriods(metric, valueMode === "population").includes(index)) continue;
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
  if (!available.length) {
    baselineIndex = finalIndex;
    const option = new Option(payload.periods[finalIndex].label, payload.periods[finalIndex].key);
    elements.baseline.append(option);
  }
  elements.baseline.disabled = available.length === 0;
  elements.play.disabled = available.length === 0;
  elements.baseline.value = payload.periods[baselineIndex].key;
}

function setEndpointForMode() {
  finalIndex = supportedPeriods(activeMetric(), valueMode === "population").at(-1);
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
    setEndpointForMode();
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
      if (layer.id.startsWith("place_country")) {
        map.setLayoutProperty(layer.id, "visibility", "none");
      } else if (layer.id === "water_name") {
        map.setLayoutProperty(layer.id, "text-field", ["coalesce", ["get", "name:en"], ["get", "name:latin"], ["get", "name"]]);
        map.setLayoutProperty(layer.id, "text-transform", "none");
        map.setLayoutProperty(layer.id, "text-letter-spacing", 0.04);
        map.setPaintProperty(layer.id, "text-color", "rgba(231, 230, 221, 0.66)");
        map.setPaintProperty(layer.id, "text-halo-color", "rgba(46, 41, 39, 0.84)");
        map.setPaintProperty(layer.id, "text-halo-width", 0.9);
        map.setPaintProperty(layer.id, "text-halo-blur", 0.25);
      } else {
        map.setLayoutProperty(layer.id, "visibility", "none");
      }
    }
  }
  if (map.getLayer("background")) map.setPaintProperty("background", "background-color", "#57524d");
  if (map.getLayer("water")) map.setPaintProperty("water", "fill-color", "#2e2927");
}

function addNoDataPattern() {
  const size = 8;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if ((x + y) % size > 0) continue;
      const offset = (y * size + x) * 4;
      data[offset] = 245;
      data[offset + 1] = 242;
      data[offset + 2] = 231;
      data[offset + 3] = 184;
    }
  }
  map.addImage("no-data-hatch", { width: size, height: size, data });
}

function appendUnavailableCountries() {
  const mappedCodes = new Set(geography.features.map(feature => feature.properties.economy_iso2));
  for (const feature of underlay.features) {
    const iso2 = feature.properties.ISO_A2;
    if (!iso2 || iso2 === "-99" || mappedCodes.has(iso2) || !feature.geometry) continue;
    geography.features.push({
      type: "Feature",
      id: iso2,
      properties: {
        economy_iso2: iso2,
        economy_iso3: feature.properties.ISO_A3,
        economy_name: feature.properties.NAME_EN || feature.properties.NAME,
        region: feature.properties.SUBREGION || feature.properties.CONTINENT,
        income_level: null,
        boundary_source: "Natural Earth 1:110m map units v5.1.2 (public domain)",
        label_lng: feature.properties.LABEL_X,
        label_lat: feature.properties.LABEL_Y,
        zoom_hint: feature.properties.MIN_ZOOM || 3,
        data_status: "No comparable GitHub baseline",
      },
      geometry: feature.geometry,
    });
    mappedCodes.add(iso2);
  }
}

function addDataLayers() {
  addNoDataPattern();
  const firstSymbol = map.getStyle().layers.find(layer => layer.type === "symbol")?.id;
  const metricCodes = new Set(payload.codes);
  const unavailableGeography = {
    type: "FeatureCollection",
    features: underlay.features.filter(feature => {
      const iso2 = feature.properties.ISO_A2;
      return iso2 && iso2 !== "-99" && !metricCodes.has(iso2);
    }),
  };
  map.addSource(UNDERLAY_SOURCE_ID, { type: "geojson", data: underlay });
  map.addLayer({ id: "country-underlay-fill", type: "fill", source: UNDERLAY_SOURCE_ID, paint: { "fill-color": "#958b85", "fill-opacity": 1 } }, firstSymbol);
  map.addLayer({ id: "country-underlay-hatch", type: "fill", source: UNDERLAY_SOURCE_ID, paint: { "fill-pattern": "no-data-hatch", "fill-opacity": 0.82 } }, firstSymbol);
  map.addLayer({ id: "country-underlay-line", type: "line", source: UNDERLAY_SOURCE_ID, paint: { "line-color": "rgba(245, 242, 231, 0.24)", "line-width": 0.45 } }, firstSymbol);

  map.addSource(SOURCE_ID, { type: "geojson", data: geography, promoteId: "economy_iso2" });
  const change = ["coalesce", ["feature-state", "growth"], NO_VALUE];
  const colour = ["coalesce", ["feature-state", "colour"], NO_VALUE];
  const fillColor = [
    "case",
    ["==", change, NO_VALUE], "#958b85",
    ["interpolate", ["linear"], colour, ...RAMP],
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
  map.addLayer({ id: "country-line", type: "line", source: SOURCE_ID, filter: notIndia, paint: { "line-color": "rgba(245, 242, 231, 0.3)", "line-width": lineWidth } }, firstSymbol);
  map.addLayer({ id: "country-fill-in", type: "fill", source: SOURCE_ID, filter: isIndia, paint: fillPaint }, firstSymbol);
  map.addLayer({ id: "country-line-in", type: "line", source: SOURCE_ID, filter: isIndia, paint: { "line-color": "rgba(245, 242, 231, 0.3)", "line-width": lineWidth } }, firstSymbol);
  map.addLayer({
    id: "country-no-data-hatch",
    type: "fill",
    source: SOURCE_ID,
    paint: {
      "fill-pattern": "no-data-hatch",
      "fill-opacity": ["case", ["==", change, NO_VALUE], 0.74, 0],
    },
  }, firstSymbol);
  map.addSource(UNAVAILABLE_SOURCE_ID, { type: "geojson", data: unavailableGeography });
  map.addLayer({
    id: "country-unavailable-fill",
    type: "fill",
    source: UNAVAILABLE_SOURCE_ID,
    paint: { "fill-color": "#958b85", "fill-opacity": 1 },
  }, firstSymbol);
  map.addLayer({
    id: "country-unavailable-hatch",
    type: "fill",
    source: UNAVAILABLE_SOURCE_ID,
    paint: { "fill-pattern": "no-data-hatch", "fill-opacity": 0.82 },
  }, firstSymbol);
  map.addLayer({
    id: "country-unavailable-line",
    type: "line",
    source: UNAVAILABLE_SOURCE_ID,
    paint: { "line-color": "rgba(245, 242, 231, 0.48)", "line-width": lineWidth },
  }, firstSymbol);
  map.addLayer({
    id: "country-selected-glow",
    type: "line",
    source: SOURCE_ID,
    filter: ["==", ["get", "economy_iso2"], ""],
    paint: { "line-color": "rgba(248, 104, 77, 0.22)", "line-width": 4, "line-blur": 1 },
  }, firstSymbol);
  map.addLayer({
    id: "country-selected-line",
    type: "line",
    source: SOURCE_ID,
    filter: ["==", ["get", "economy_iso2"], ""],
    paint: { "line-color": "#f5f2e7", "line-width": ["interpolate", ["linear"], ["zoom"], 1, 1.2, 6, 1.75] },
  }, firstSymbol);

  const geographyCodes = new Set(geography.features.map(feature => feature.properties.economy_iso2));
  const metricLabels = geography.features
    .filter(feature => Number.isFinite(feature.properties.label_lng) && Number.isFinite(feature.properties.label_lat))
    .map(feature => ({
      type: "Feature",
      properties: {
        ...feature.properties,
        economy_name: MAP_LABEL_ALIASES.get(feature.properties.economy_name) || feature.properties.economy_name,
      },
      geometry: { type: "Point", coordinates: [feature.properties.label_lng, feature.properties.label_lat] },
    }));
  const uncoveredLabels = underlay.features
    .filter(feature => feature.properties.ISO_A2 && feature.properties.ISO_A2 !== "-99" && !geographyCodes.has(feature.properties.ISO_A2))
    .filter(feature => Number.isFinite(feature.properties.LABEL_X) && Number.isFinite(feature.properties.LABEL_Y))
    .map(feature => ({
      type: "Feature",
      properties: {
        economy_iso2: `underlay-${feature.properties.ISO_A2}`,
        economy_name: feature.properties.NAME_EN || feature.properties.NAME,
        zoom_hint: feature.properties.MIN_ZOOM || 3,
      },
      geometry: { type: "Point", coordinates: [feature.properties.LABEL_X, feature.properties.LABEL_Y] },
    }));
  map.addSource(LABEL_SOURCE_ID, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [...metricLabels, ...uncoveredLabels] },
    promoteId: "economy_iso2",
  });
  const labelGrowth = ["coalesce", ["feature-state", "growth"], NO_VALUE];
  const lightLabel = ["any", ["==", labelGrowth, NO_VALUE], ["<=", labelGrowth, -35]];
  map.addLayer({
    id: "country-data-labels",
    type: "symbol",
    source: LABEL_SOURCE_ID,
    layout: {
      "text-field": ["get", "economy_name"],
      "text-font": ["Noto Sans Regular"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 1.25, 9.5, 4, 12.5, 7, 15],
      "text-letter-spacing": 0.01,
      "text-line-height": 1.05,
      "text-max-width": 8,
      "text-padding": 6,
      "text-allow-overlap": false,
      "symbol-sort-key": ["coalesce", ["get", "zoom_hint"], 4],
    },
    paint: {
      "text-color": ["case", lightLabel, "rgba(248, 246, 242, 0.96)", "rgba(0, 0, 0, 0.88)"],
      "text-halo-color": ["case", lightLabel, "rgba(46, 41, 39, 0.76)", "rgba(245, 242, 231, 0.78)"],
      "text-halo-width": 0.9,
      "text-halo-blur": 0.25,
    },
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

  const [geometryResponse, metricsResponse, underlayResponse] = await Promise.all([fetch(GEOMETRY_URL), fetch(METRICS_URL), fetch(UNDERLAY_URL)]);
  if (!geometryResponse.ok) throw new Error(`Country geometry failed to load: ${geometryResponse.status}`);
  if (!metricsResponse.ok) throw new Error(`Metric data failed to load: ${metricsResponse.status}`);
  if (!underlayResponse.ok) throw new Error(`Country underlay failed to load: ${underlayResponse.status}`);
  geography = await geometryResponse.json();
  payload = await metricsResponse.json();
  underlay = await underlayResponse.json();
  validatePayload(payload, geography);
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
  appendUnavailableCountries();

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

function showLoadError(error) {
  console.error(error);
  document.body.dataset.storyReady = "error";
  elements.lens.classList.remove("is-empty");
  elements.place.textContent = "Data could not load";
  elements.context.textContent = "Reload the page. If this continues, check the published data files.";
  elements.warning.textContent = error.message;
  elements.metric.disabled = true;
  elements.baseline.disabled = true;
  elements.play.disabled = true;
}

if (map.isStyleLoaded()) initialise().catch(showLoadError);
else map.once("style.load", () => initialise().catch(showLoadError));

map.on("error", event => {
  console.error(event.error || event);
});
