# Upstream register

| Material | Source | Use and changes |
|---|---|---|
| Map drawing adapter | StevenRidder/Helm, bf4a12bc6db6551b1dddf8d21cc6f26af5f1fc69, web/integrations/draw.js | Adapted into web/src/map-draw.ts. Retains Terra Draw setup and editable line modes; navigation send/activate and area-download globals removed. Emits a typed local draft event. Helm BSL 1.1 applies to this derived file; notices under third_party/helm |
| UI foundation | @tabler/core | MIT dependency. Original ocean theme follows the existing Taikun token pattern; no Books accounting or Switchboard product code copied |
| Map renderer | maplibre-gl 6.14.0 | BSD-3-Clause dependency; upgraded from Helm's 5.x baseline to resolve GHSA-jrc7-96c5-q579. Uses the bundled ESM worker. Drawing adapter is validated by browser tests |
| Geometry editing | terra-draw, terra-draw-maplibre-gl-adapter | MIT dependencies; locked versions |
| Markdown display | marked, dompurify | Their package licenses apply; all rendered source text is sanitized |
| Coastline geometry | Natural Earth 1:110m country boundaries | Public domain, regional subset with reduced coordinate precision. No private chart or imagery files. https://www.naturalearthdata.com/about/terms-of-use/ |
| Online coastal, street and label tiles | EOX::Maps public WMTS | Direct browser requests with visible EOX/OSM/other-data attribution. Best-effort public service; no tile pack or bulk download. https://maps.eox.at/ |
| Online satellite mosaic | EOxCloudless 2025 / Copernicus Sentinel-2 | Dynamic public-service tiles for personal non-commercial planning, with visible year and full attribution. CC BY-NC-SA 4.0 for this use; commercial use needs the provider's commercial license. No satellite imagery is committed. https://cloudless.eox.at/documentation/license |
| Community seamarks | OpenSeaMap public seamark tiles | Optional community overlay with OpenSeaMap/OSM attribution. Variable coverage; no official navigation-chart or depth claim. https://wiki.openseamap.org/wiki/h:En:OpenSeaMap_in_Website |

The original Helm license and Business Source License are retained verbatim.
The OpenCPN runtime is not copied. No Google, Bing or Navionics imagery URLs,
private chart packs, or third-party photo bytes are included.
