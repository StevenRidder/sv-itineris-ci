# Interactive planning map

The existing Tabler shell, colors, route markers and chat remain. MapLibre now
provides Coastal map, Satellite 2025, Streets & places and Simple overview.
Online basemaps load lazily and never replace the map style or route sources.
Switching layers preserves the camera, current proposal and active drawing.

EOX::Maps supplies terrain/coastal context, streets and bright/dark label layers.
EOxCloudless 2025 supplies a Sentinel-2 annual mosaic, with native satellite detail
limited to zoom 14. Higher zoom enlarges those pixels and is labelled accordingly;
this is not live imagery or a high-resolution harbor survey. A blend control puts
terrain context beneath the satellite layer. Labels are built into Streets;
Simple overview omits online labels and remains usable without a tile provider.
Optional OpenSeaMap seamarks have variable community coverage and do not provide
official chart depths or clearance. All provider credits remain visible on-map.

Layer switches show/hide source routes, draft routes and destination pins. Fit
voyage frames the current draft, or the source destinations when no draft exists.
Zoom to place focuses a known destination and displays its current scenario dates.
A free map click inspects coordinates. Ask about this point only prefills chat;
the user still sends the question explicitly. No device location is requested.

Sketch a route creates a preview. Edit draft points loads the existing line into
Terra Draw, with draggable vertices and midpoints. Preview edited route validates
and composes its geometry with the current proposal, preserving prior date edits.
Cancel sketch restores the preceding preview. Save new option remains explicit.
Manual changes, map edits and chat cannot overwrite source scenarios.

Measure accepts up to 100 clicked points and shows total nautical miles plus the
last segment's initial true bearing. Python computes spherical great-circle
distances. This is a direct point-to-point estimate, not a sea route, a clearance
check or an ETA. Measurements and inspected points are transient, not saved plans.
Fullscreen includes the layer and planning controls, and a nautical scale is shown.

Online data is a best-effort dependency. Failed tiles leave local map geometry and
planning controls usable; the status offers Simple overview. Late errors from
hidden tile layers do not replace the current basemap's status. There is no bulk
download or offline cache builder. CSP allows only the two named tile origins for
images/fetches and still permits scripts only from this application.

The personal local pilot uses the provider's non-commercial satellite permission.
Review licensing and service capacity before a commercial/public website rollout;
the public code CI mirror contains no tile bytes or private map evidence. Wind,
current, tide and official chart-depth feeds remain separate future adapters.

Provider references verified during implementation:
- https://maps.eox.at/
- https://tiles.maps.eox.at/wmts/1.0.0/WMTSCapabilities.xml
- https://cloudless.eox.at/documentation/license
- https://wiki.openseamap.org/wiki/h:En:OpenSeaMap_in_Website

Public CI substitutes deterministic synthetic tiles and checks interaction,
provider failure, date-preserving geometry edits, measurements and phone layout.
A separate local acceptance check must establish actual provider imagery loads.
