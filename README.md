# Prism MIDI Studio

An independent, dependency-free browser MIDI visualizer inspired by MiVi.

Serve `dist/` over HTTPS (or localhost). No build or external dependencies are required. MIDI data stays in the browser. The app includes a generated demo composition.

## Features

- Horizontal piano roll, vertical falling notes, and comet trails
- 40+ visual and sound parameters, four palettes, track/pitch/velocity colors
- MIDI 0/1 import with running status, tempo maps, sustain, note velocities, program changes, channel volume and pan at note onset
- Play/pause, seek, speed, transpose, adjustable loops, track mute/solo/visibility/volume/pan/voice
- Built-in synthesized audio (GM family approximations, not sampled instruments)
- Real-time video recording with synchronized audio, 720p/1080p/4K settings, three aspect ratios, quality and frame-rate selection, full-song or loop range
- PNG capture, fullscreen, keyboard shortcuts, mobile layout, local preferences, offline service worker and installation manifest

## Limits

No SMPTE or format 2 MIDI, SysEx instruments, pitch bend, aftertouch, imported SoundFonts, or external MIDI devices. MIDI controller values are captured at note onset rather than automated during held notes. Synth voices approximate instrument families. Recording needs MediaRecorder and canvas.captureStream; format, frame rate, and recording performance depend on the browser and device. Very dense files may exceed the 256 simultaneous audio voice limit or 16,000 visible note limit. The parser caps imports at 50 MB in the UI and 300,000 notes. Installation/offline behavior depends on browser support and the hosting context.

Inspired by https://sunya9.github.io/mivi/ . No MiVi source code is included.

## Direct MP4 export

The original Prism interface is retained. Export MP4 draws every frame at an explicit MIDI timestamp, uses OfflineAudioContext with the same Synth graph, and encodes H.264 video plus optional 48 kHz stereo AAC at 320 kbps. Resolution (up to 4K), 30/60 fps, 5–80 Mbps, aspect, selected range, speed, visuals, and track mix are respected. Live MediaRecorder export remains a separate fallback.

Mediabunny 1.55.6 is vendored from its published bundle under dist/vendor with its MIT license. No CDN is required. The export checks encoder support before processing, supports cancellation and restores the paused preview, and writes video progressively to a chosen file or temporary browser storage. Bitrate is an encoder target, not lossless output. A cut selection restarts notes held at its beginning and applies brief audio edge fades. Audio renders in five-second sections with earlier note onsets and effect history included. Exceptionally long held notes retain a per-section audio memory guard. Only browsers blocking both direct file saving and temporary storage fall back to memory, capped at a 192 MiB estimate.

Validation: `node --test tests/export.test.mjs` checks frame timing, speed/range boundaries, encoder preflight, memory rejection, cancellation cleanup, and offline note scheduling with muted/solo/held notes. Encoder tests use controlled doubles; actual browser codec encoding and long-duration end-to-end exports have not been browser-tested.

## AAC and large-file repair

When native AAC is unavailable, Prism lazily registers the vendored @mediabunny/aac-encoder 1.55.6 WebAssembly worker. Audio and video are interleaved in five-second sections and standard MP4 metadata is finalized at the end. The user's selected file is only committed after successful finalization; cancellation aborts it. OPFS exports retain a download link, release temporary data on the next export/page exit, and remove abandoned files older than 24 hours in Prism's own export directory.

`node --test tests/*.test.mjs` includes real software AAC encoding and MP4 demuxing without native AudioEncoder, actual StreamTarget integration with a simulated file transaction, range/section timing, and cancellation. Native browser video encoding, picker permissions, and OPFS have not been tested end to end in a browser.

## Expanded visual studio

Six note styles: piano roll, falling notes, comet, ribbon flow, orbit, and MIDI pulse bars. Sixteen built-in six-color palettes plus a custom palette. The Scene panel accepts local images (resized to a maximum 4096-pixel edge), with deterministic pan/zoom, MIDI-hit pulse, blur, brightness, saturation, dimming, tint, vignette and dust, including three scene presets. Particle amount is 0–120 per hit with optional velocity scaling, burst/held emission, and dots/sparks/confetti. A 6,000-particle per-frame budget bounds dense MIDI work. Save/load look JSON contains settings and track colors, excluding imported media.

The Tracks panel imports a browser-decodable recording, exposes source selection (recording/synth/blend), volume, signed start offset, timing-rate adjustment, 10 ms nudges, duration fitting, and a seekable waveform with MIDI onset marks. The same audioPlacement/scheduleAudioBuffer functions schedule native playback and offline export, including looping and speed changes. Positive offset delays audio; negative offset skips its beginning. Rate changes pitch as well as timing. MIDI synth transposition does not transpose a recording. Export length follows the MIDI or loop range. Media is session-local and must be reselected after reload. Files up to 150 MiB compressed and 512 MiB decoded audio are accepted.

Validation adds audio mapping, preview/offline clock equivalence, recording-only/blended export selection, particle density/velocity/budget, and deterministic background/new scene drawing tests. These are code-level checks; browser import dialogs, decoding formats, visual rendering, and long combined-media exports remain unverified end to end in an actual browser.

## Floating atmosphere and creative styles

Background particles now render in their own shared canvas layer, after image/ambient effects and before the notes. They no longer depend on an image. The old 1–3 physical-pixel dots are replaced by resolution-scaled sizes and normalized coordinates, preserving relative appearance between 720p and 4K. A fixed seed plus MIDI timestamps makes seeking and export deterministic.

Scene controls cover count, palette/custom/rainbow colors, dots/bokeh/rings/stars/diamonds/streaks, size variation, opacity, glow, blending, twinkle, directional drift/swirl/outward radiation, clockwise swirl, speed, heading, wandering and seed. Optional beat pulses change size, opacity and glow using the MIDI tempo map, including tempo changes and subdivisions. They do not analyze beats from an imported recording. Stardust, Snow, Embers and Fireflies are independent particle presets; image-effect presets no longer reset their count.

New MIDI styles: Spiral Galaxy, Neon Tunnel and Ripple Field, bringing the total to nine. Their parameters include turns/rotation, tunnel depth, and ripple size/lifetime.

Validation includes scale parity, tempo changes, deterministic seeking, no-image rendering, all particle shapes and zero count. Optional tests/raster.test.mjs uses @napi-rs/canvas 1.0.9 and FFmpeg via PRISM_CANVAS_MODULE and PRISM_RASTER_DIR. Actual H.264 encodes retained visible particle pixels at 720p and 2160p; native-canvas frames for the three new styles were distinct and repeatable. This validates rasterization/compression independently of browser WebCodecs; end-to-end browser export remains untested.

## Custom viewing and export ratio

Export panel → Preview & export aspect ratio → Custom ratio accepts positive width and height proportions, including decimals. The selected longest-edge size determines the output resolution; the shorter edge rounds to even pixels for video encoding. The stage contains the same effective ratio without stretching, including in fullscreen. MP4 and live recording both use resolveFrame(); canvas snapshots also exclude surrounding stage margins. Valid frame selections are remembered locally under prism-frame. Invalid ratios show an inline error and block export. Tests cover custom/standard ratios, even dimensions, invalid entries, and preview containment.

## Transparent video and exact resolutions

In Export, enable **Transparent background · WebM** to render VP9 video with an alpha channel and optional stereo Opus audio. This is direct frame-by-frame rendering with the same range, speed, audio alignment, progress, cancellation, and disk-backed destination handling as MP4. H.264 MP4 remains the default opaque format and retains its native/software AAC fallback.

Transparent mode removes the solid fill, background image and its effects, and ambient wash. Notes, trails, hit particles, floating particles, keyboard, guides, and text remain; disable individual elements in Visuals or Scene when desired. A CSS checkerboard shows transparency in the preview and is never encoded. PNG snapshots also preserve alpha when this mode is selected. Live recording is disabled in this mode because its alpha preservation is not guaranteed. VP9 and Opus availability are checked before rendering. Some media players show transparent pixels as black; use an alpha-capable editor or compositor. Transparency requires a separate alpha stream, so it can take longer and produce larger files than opaque export at the same quality setting.

Choose **Export size → Custom pixel dimensions** for exact width and height. These dimensions set the preview aspect ratio and both direct/live export resolution. Use even integer dimensions from 2 to 8192 pixels, with a maximum total of 33,554,432 pixels. This is an allocation guard, not a guarantee your browser can encode every accepted size: codec support is checked separately. Invalid dimensions are rejected instead of silently resized. Standard longest-edge presets and custom aspect-ratio mode remain available. Valid choices persist locally.

Validation: encoder-routing tests verify VP9 alpha/WebM versus opaque AVC/MP4, early failure on unsupported Opus, exact dimensions, and previous audio/cancellation paths. A native-canvas integration check exercised all nine scene styles with transparent backgrounds. A real VP9 packet round trip through Mediabunny's WebM writer preserved transparent, semitransparent, and opaque pixels. These checks do not replace end-to-end browser WebCodecs, file-picker, or long-duration testing.

## Deploy to Vercel

1. Import this repository into Vercel as a new project.
2. Keep the repository root as **Root Directory**. The checked-in `vercel.json` selects **Other**, no install/build command, and **dist** as the output directory.
3. Deploy. No server, API key, database, environment variables, or runtime dependencies are needed.

The app uses relative asset URLs and works at the root of the Vercel domain. Vercel supplies HTTPS, required by browser encoding and storage APIs. `sw.js` is served with revalidation so future versions can update the offline cache. The `.openai/hosting.json` file is metadata for the existing Sites deployment; Vercel ignores it. Keep all files under `dist/vendor`, including licenses and the corresponding AAC source archive.

For local use, run `python3 -m http.server 8080 --directory dist`, then open `http://localhost:8080`. With Node.js 22 or newer, run `node --test tests/*.test.mjs` for the source checks. Optional raster checks require FFmpeg and `@napi-rs/canvas`, configured via `PRISM_CANVAS_MODULE` and `PRISM_RASTER_DIR` as described above. Runtime code is static browser JavaScript and needs no npm install.

## ProRes Adobe editing export

Choose **Export → Transparent background → ProRes 4444 MOV · Adobe editing**, then **Export ProRes MOV**. This adds a dedicated software ProRes 4444 (`ap4h`) path with full-resolution color and alpha, plus optional 48 kHz, 24-bit stereo PCM. It reads straight RGBA directly from the canvas and avoids the WebCodecs VP9 color/alpha path. MP4 and WebM remain available for delivery. MOV uses fixed profile quality; the MP4/WebM bitrate selector is disabled for it. ProRes is a high-quality editing codec, not a mathematically lossless image format. The source canvas remains 8-bit RGBA.

Rendering is frame-by-frame with the existing timing, imported-audio alignment, five-second audio windows, progress, cancellation, and disk-backed export. The encoder chooses up to eight workers from CPU count, frame dimensions, and the browser’s approximate memory hint. It reserves a CPU for drawing on machines with more than two logical CPUs and reduces concurrency for large frames or low-memory devices. ProRes files are substantially larger than delivery videos; a short loop is useful to check your Adobe setup before rendering a full song. Import the MOV directly into Premiere Pro or After Effects. If alpha is interpreted incorrectly, use **Interpret Footage → Alpha → Straight (Unmatted)**. A black background in a player does not itself mean alpha is missing.

The replaceable vendored `prores-wasm-encoder` 1.0.1 package includes its LGPL license and exact corresponding source archive under `dist/vendor/prores`. No CDN, API key, server, or Vercel build change is required. The service worker version is updated for these new modules.

## Finding settings and saving scenes (current)

- **Find a setting** searches across Visuals, Scene, and Tracks. Selecting a result opens the correct group and focuses the control; style-specific results also switch to the appropriate visual style.
- **Visuals → Show / hide** contains independent switches for notes, keyboard, key/note labels, pitch/octave/beat grids, playhead, hit particles, floating particles, image, ambient light, title, and time. **Hide all guides & labels** hides annotations together. Turning a layer off retains its detailed settings.
- Smaller collapsible groups separate note appearance, glow, note-hit particles, keyboard/pitch, guides, and each style's parameters. Style controls appear for the selected style. Synth sound controls are in Tracks.
- **Scene** separates background/ambient, image motion, image finishing, floating-particle appearance, movement, and beat sync.
- **Fire flakes** and **Cherry petals** presets add warm rising flakes and pink falling petals, with editable flutter and tumbling speed, alongside the existing particle controls and presets.
- **Visuals → Export scene settings / Import scene settings** saves versioned JSON with every visual/particle setting, layer visibility, custom palette, matching track colors/mix, audio offset/rate/gain, playback/loop settings, exact resolution, and export options. Imported media remains separate and is referenced by name. After reselecting the matching MIDI/audio, its saved track settings/alignment are restored. Previous `prism-look` version 1 files remain supported.

Validation: 28 checks cover the previous exports/audio/frames plus grouped-control completeness, scene JSON validation/round trips, deterministic new particle shapes, and actual software ProRes MOV encoding/demuxing. FFmpeg decoding of a gradient sample preserved RGB with zero mean error in that test and alpha within one 8-bit level. PCM stereo muxing and duration were checked separately. A native-canvas/DOM integration check exercised all nine styles, search, quick switches and scene restoration. Full browser worker/file-picker export and opening the MOV inside Adobe have not been verified in this environment.

## Browser storage estimate repair

Disk-backed exports no longer reject a render based on the estimated video size versus `navigator.storage.estimate()`. In particular, the uncompressed RGBA estimate for ProRes can be much larger than the encoded MOV. Temporary-storage writes now enforce the real quota; actual quota failures still cancel the output, abort the transaction, and remove the partial file. The conservative limit remains for the memory-only fallback when neither direct file saving nor temporary storage is available. The progress label identifies direct disk, browser storage, or memory. The Export panel includes a full-tab link for contexts that cannot show the save-location picker.

`tests/storage.test.mjs` reproduces the false rejection with a huge estimate/tiny quota, performs a real software ProRes write through the temporary-storage path, verifies cleanup on an actual quota failure, and confirms that direct file saving bypasses browser quota checks.


### Export performance

ProRes export now selects a bounded parallel worker pool per export instead of always limiting it to two workers. Frame submission still uses the encoder’s bounded queue, preserving ordered frames and backpressure. Export skips preview-only DOM updates and canvas layout measurements. UI yields occur after 50 ms of work, with progress updates at most four times a second, instead of adding a timer after every ProRes frame. Resolution, frame rate, ProRes 4444 profile, and alpha handling are unchanged.

**Export 3-second test** renders a sample near the playhead inside the selected range at the current quality, sound, and playback speed, with a separate `-test` filename. Full export still renders the selected song/loop range. Progress shows observed processing fps and an approximate remaining time once enough samples are available; scene complexity, audio rendering, and final disk writes can change the estimate. 1080p at 30 fps processes one eighth of the pixels of 4K at 60 fps for the same duration and aspect ratio; choose it explicitly when that output size is sufficient.

Validation: parallel encoding in real Node worker threads produced byte-identical ProRes packets to the single-thread path, preserving all 30 frames and timestamps. Cancellation closed the worker pool. Existing FFmpeg color/alpha decoding, audio, storage, and timing tests pass. Native-canvas/DOM checks cover all nine visual modes, the test export’s speed-adjusted range, and full export’s original range. The worker bridge is a test harness, not an actual browser test.

An encoder-only benchmark on this environment (30 frames, 1280×720 RGBA gradient, no scene drawing or audio) took 1.14 s cold / 1.09 s warm before and 0.90 s cold / 0.48 s warm after. It used a Node worker bridge for the same vendored encoder. This is not an end-to-end browser speed guarantee; complicated particles/glows, high resolutions, and slower devices can still take substantial time.



### Separate instrument MIDI files

**Open MIDI files** accepts a multi-selection and starts a new arrangement. **Tracks → Add MIDI files**, or dropping files onto the app, adds one or more parts to the current arrangement (replacing the demo on the first import). Existing track mix, colors, visibility, and playhead survive additions. With several files loaded, collapsible sections in Tracks group controls by source instrument/file. Internal MIDI tracks and channels remain individually controllable.

Each file is parsed separately before its notes are combined on the shared timeline. Original seconds, tempo changes, leading silence, note lengths, programs, and percussion channels are preserved. Files are not concatenated or automatically beat-matched. Parts exported from the same song origin/tempo map align naturally. If tempo maps differ, a persistent note explains that timing stays as exported and identifies the file used for beat guides (the first filename in deterministic sort order).

Filename plus content hash gives stable source/track identities regardless of selection order. Re-adding an unchanged, identically named file skips it; changed content or differently named files are distinct sources. Scene JSON includes all MIDI filenames and stable track IDs; select the original media again to restore it. Existing single-file scene mixes remain compatible. Files stay on the device.

Imports are transactional: a damaged or unsupported file leaves the loaded arrangement intact and reports the filename. Limits are 64 source files, 50 MB per file, 100 MB combined source data, and 300,000 combined notes. Both `.mid` and `.midi` are accepted.

Validation: `node tests/midi-import.test.mjs`, `node tests/midi-app.test.mjs`, and `node tests/scene-settings.test.mjs`. Optional `PRISM_MIDI_FIXTURES=/path/to/attachments node tests/midi-import.test.mjs` checks the supplied 12 instrument files locally: 65 distinct tracks, 7,706 notes, matching variable-tempo maps, and every original note timestamp intact. The attachments are not included in the repository. App workflow tests exercise the production picker/drop handlers, append/replace behavior, grouped controls, saved filenames, legacy mix restoration, duplicate handling, and failed-import preservation using a minimal DOM fixture. Full browser rendering was not verified in this environment.

### PNG MOV for lossless transparent editing files

The optional **PNG MOV** format uses native PNG compression in a single QuickTime video, preserving the canvas's 8-bit RGBA losslessly. This is a video file, not a folder/image sequence. Adobe documents native PNG-in-QuickTime import in Premiere Pro and After Effects: https://blog.adobe.com/en/publish/2016/08/03/after-effects-cc-2015-3-13-8-1-bug-fix-update-is-now-available . ProRes 4444 and VP9 WebM remain selectable. PNG and ProRes do not use the MP4/WebM bitrate selector.

The PNG path submits a bounded queue of up to four native canvas encodes, writes frames in order, and avoids the ProRes WASM encoder and explicit main-canvas `getImageData` calls. Output streams to a chosen file or browser temporary storage. The MOV writer retains sample tables only and uses 64-bit media lengths/chunk offsets. Memory-only fallback enforces a 192 MiB actual-size limit. Cancellation and failures abort the destination; bounded native compression jobs may finish in the background but cannot write further output. Optional audio uses the same five-second offline-render windows and alignment, encoded as 48 kHz, 16-bit stereo PCM. ProRes keeps its existing 24-bit PCM path.

The **3-second test** now reports actual output bytes and elapsed render time, plus an approximate full-range size/time projection. Complex sections can differ, so the projection is not a guarantee. Selecting PNG does not reduce resolution or frame rate. It is an optional lossless format; the current compact preset below controls the recommended export workflow.

Measured on the supplied 12-file arrangement, default falling-note visuals with particles, at 55–58 seconds (90 frames, no audio), using native Skia canvas and Node worker threads in this environment:

| Export | File size | Render time |
| --- | ---: | ---: |
| ProRes, 1920×1080 / 30 | 332,111,658 bytes (316.7 MiB) | 8.90 s |
| PNG MOV, 1920×1080 / 30 | 80,512,201 bytes (76.8 MiB) | 8.45 s |
| PNG MOV, 1280×720 / 30 | 53,811,243 bytes (51.3 MiB) | 6.28 s |

This benchmark includes scene drawing and codec work, but discards streamed bytes instead of exercising disk I/O. Native-canvas/Node results do not establish browser or Adobe performance. The measured benefit at the same resolution was primarily file size (4.1× smaller), not a dramatic speed increase. Lossless transparent videos can still be large and slower computers can still take substantial time.

Validation: `tests/png-mov.test.mjs` checks native-encode export routing, FFmpeg-decoded exact RGBA, audio sample values/channel order, frame timing, out-of-order encode completion, 64-bit offsets, cancellation, quota failures, and actual-cost reports. `tests/export-ui.test.mjs` checks MOV filename/picker selection, full/test ranges, result reporting, and preference migration. Existing ProRes alpha, export, storage, scene, and MIDI workflow tests remain in use. Actual opening inside Adobe and full browser performance have not been verified here.


## Compact Adobe package (current transparent default)

Choose **Use compact Adobe · 1080p / 30 fps**, then **Export compact Adobe package**. This explicitly selects 1920px longest edge at 30 fps, preserving the current aspect ratio. Other custom sizes and frame rates still work subject to native encoder support. The ZIP contains **two opaque H.264 videos**: `color.mp4` and grayscale `alpha.mp4`. Neither has embedded alpha. Extract the entire ZIP, then combine them using its `Import into After Effects.jsx` helper or the included Premiere Pro Track Matte Key instructions (Matte Luma). Optional AAC sound is only in `color.mp4`. Keep both clips aligned and identically scaled. Compression can soften fine edges and change colors; use a matching SDR workflow and do not grade the matte.

| Compact preset | Color + matte target | 193.5 seconds with audio | Package hard limit |
| --- | --- | ---: | ---: |
| Smaller | 4 + 1 Mbps | ~129 MB | ~183 MB |
| Balanced (default) | 8 + 2 Mbps | ~250 MB | ~346 MB |
| High detail | 16 + 4 Mbps | ~492 MB | ~672 MB |

MB in this table means 1,000,000 bytes. These are target sizes, not measured exports. Both clip writes and ZIP writes enforce limits; if the encoder exceeds its allowance, export fails and partial files are discarded. Actual output varies with scene complexity. The panel updates the estimate with range, playback speed, audio and quality. The three-second test reports actual size and time on the user's device. Old browser-local PNG/ProRes defaults migrate once to compact; explicit new choices and imported scene formats remain respected. Compact quality is included in scene JSON.

The scene is drawn once per frame, split into straight RGB and a full-resolution grayscale opacity mask, then fed to two native H.264 encoders at identical timestamps. This avoids per-frame lossless PNG and software ProRes compression; it does not guarantee real-time rendering or hardware acceleration. Canvas drawing, pixel extraction, audio synthesis and browser encoder performance still affect speed. Temporary clips use browser disk storage where available, then stream into a stored ZIP without another compression pass. Cancellation aborts all destinations and cleans temporary files. Memory-only environments retain a 192 MiB per-destination limit; long exports need temporary browser storage even when the final ZIP saves directly to disk. Packages over the classic ZIP 4 GB limit are rejected up front.

PNG MOV and ProRes remain available for single-file embedded alpha; both can be extremely large. The standard opaque MP4 path is unchanged. All new modules are static files, cached by the service worker; Vercel needs no additional configuration or dependencies.

Validation: compact tests cover paired timestamps and frame counts, audio-only-in-color routing, encoder preflight, cancellation/failure cleanup, enforced file limits, straight color/matte reconstruction, CRC-checked ZIP extraction, UI filename/preferences, and the generated After Effects helper in mocked modern/legacy scripting hosts. Existing PNG/ProRes decoding, storage, MIDI import and scene tests also run. Browser WebCodecs performance and actual import inside Adobe have not been verified in this environment.

Adobe workflow references:
- https://helpx.adobe.com/premiere/desktop/add-video-effects/effects-and-transitions-library/keying-effects.html
- https://helpx.adobe.com/after-effects/desktop/work-with-transparency-and-compositing/work-with-track-mattes-and-traveling-mattes/track-mattes-and-traveling-mattes.html
