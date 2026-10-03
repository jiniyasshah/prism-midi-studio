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

## Adobe editing export (current)

Choose **Export → Transparent background → ProRes 4444 MOV · Adobe editing**, then **Export ProRes MOV**. This adds a dedicated software ProRes 4444 (`ap4h`) path with full-resolution color and alpha, plus optional 48 kHz, 24-bit stereo PCM. It reads straight RGBA directly from the canvas and avoids the WebCodecs VP9 color/alpha path. MP4 and WebM remain available for delivery. MOV uses fixed profile quality; the MP4/WebM bitrate selector is disabled for it. ProRes is a high-quality editing codec, not a mathematically lossless image format. The source canvas remains 8-bit RGBA.

Rendering is frame-by-frame with the existing timing, imported-audio alignment, five-second audio windows, progress, cancellation, and disk-backed export. The encoder uses at most two workers where supported. ProRes files are substantially larger than delivery videos; a short loop is useful to check your Adobe setup before rendering a full song. Import the MOV directly into Premiere Pro or After Effects. If alpha is interpreted incorrectly, use **Interpret Footage → Alpha → Straight (Unmatted)**. A black background in a player does not itself mean alpha is missing.

The replaceable vendored `prores-wasm-encoder` 1.0.1 package includes its LGPL license and exact corresponding source archive under `dist/vendor/prores`. No CDN, API key, server, or Vercel build change is required. The service worker version is updated for these new modules.

## Finding settings and saving scenes (current)

- **Find a setting** searches across Visuals, Scene, and Tracks. Selecting a result opens the correct group and focuses the control; style-specific results also switch to the appropriate visual style.
- **Visuals → Show / hide** contains independent switches for notes, keyboard, key/note labels, pitch/octave/beat grids, playhead, hit particles, floating particles, image, ambient light, title, and time. **Hide all guides & labels** hides annotations together. Turning a layer off retains its detailed settings.
- Smaller collapsible groups separate note appearance, glow, note-hit particles, keyboard/pitch, guides, and each style's parameters. Style controls appear for the selected style. Synth sound controls are in Tracks.
- **Scene** separates background/ambient, image motion, image finishing, floating-particle appearance, movement, and beat sync.
- **Fire flakes** and **Cherry petals** presets add warm rising flakes and pink falling petals, with editable flutter and tumbling speed, alongside the existing particle controls and presets.
- **Visuals → Export scene settings / Import scene settings** saves versioned JSON with every visual/particle setting, layer visibility, custom palette, matching track colors/mix, audio offset/rate/gain, playback/loop settings, exact resolution, and export options. Imported media remains separate and is referenced by name. After reselecting the matching MIDI/audio, its saved track settings/alignment are restored. Previous `prism-look` version 1 files remain supported.

Validation: 28 checks cover the previous exports/audio/frames plus grouped-control completeness, scene JSON validation/round trips, deterministic new particle shapes, and actual software ProRes MOV encoding/demuxing. FFmpeg decoding of a gradient sample preserved RGB with zero mean error in that test and alpha within one 8-bit level. PCM stereo muxing and duration were checked separately. A native-canvas/DOM integration check exercised all nine styles, search, quick switches and scene restoration. Full browser worker/file-picker export and opening the MOV inside Adobe have not been verified in this environment.
