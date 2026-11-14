# Physical Office lift — final implementation

The original painted underground rooms, garden, soil and character assets remain. Basement lift sills meet the .79H walking plane; the garden entrance remains .74H above the soil edge. One visible timber car carries the observed agent through the cutaway shaft. Boarding, closing, riding, opening and alighting share one timeline; empty pickup travel and garden calls use that same car. Same-floor work remains independent. Private rest-room doors stay on the rear wall.

The controller is in office-lift.ts; motion creates phased paths and garden fades; arrivals serialize, retarget and rebuild canceled reservations without jumping the car. Construction freezes actor and car time together. Old floors remain while their people wait for the car and leave; newly admitted floors append below them. Departure eligibility uses the last visible source actor, held badges use current source counts, and source task/status/result data is never mutated.

Claude's second review found that mergeOfficeEvents still expired waiting departures after15seconds. Eligible departures now persist across repeated snapshots and have capacity before transient work; invalidated departures still drop. Pending garden calls survive itinerary rebuilds. Arrival destination comparisons use layoutTarget rather than tweening visual coordinates. Manual doors no longer have a separate sticky visual flag: physical timeline commands open/close, preserve partial door position on reversal, and cannot close on reserved passengers.

The renderer draws one moving cabin and passenger, not copies at each stop. Landing leaves slide during the timed phases. Passenger names hide only during travel and are selectable at stops. Sill colour/overhang and garden pointer bounds follow the review. The closed-ground image patch covers the pit in the original garden asset; its unused opacity animation was removed.

The watcher schedules again in finally if an observer throws. Host-level uncaught-exception policy is unchanged. No freshness threshold or SSE cap was raised. Real replay measurement:2,354,302bytes for20teams, below the4,194,304byte queue cap, and the stream continued to another heartbeat. Cumulative stream bytes were measured separately.

## Verification

- Full web289/289; final focused45/45; watcher5/5; TypeScript; desktop build and Electron packaging passed.
- Three regressions first failed before the review fixes, then passed: repeated20/40second departure merging/capacity, a pending garden call across retarget, and stable target geometry against eight visual tween frames. Door reversal/passenger safety and accurate held-floor badges also have regressions.
- Production OfficeView ran in a clearly labelled native-app QA overlay with mock snapshots, never changing live T3 jobs. Two newcomers were delivered through one car with an empty return. A second55second scenario made a third team quiet at4seconds while arrivals waited; its person stayed until the ride home completed, then its floor disappeared.
- The final scenario refreshed snapshots every2seconds and opened the garden door manually at0.5seconds. It recorded1269 car positions, y187.3125..883.40625 and three direction reversals; visible people4→5→4, the third floor absent at55seconds, garden door closed at the end. Overlay removed afterwards. Evidence: artifacts.local/office-verification/lift-review-snapshot-*.png and result/trace JSON. The fixture did not emulate a live T3 job or a user clicking a garden call during retarget; the latter has a model regression.
- Native packaged-app checks: Office visible/Connected, station panel opens, private peek opens/focuses, Back closes it and restores door focus. Canonical package hash matched the built output and the normal user profile was reopened.

Changes are local; no push or external release.
