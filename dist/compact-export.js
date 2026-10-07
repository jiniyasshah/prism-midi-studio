export const COMPACT_PRESETS={small:{color:4000000,matte:1000000},balanced:{color:8000000,matte:2000000},high:{color:16000000,matte:4000000}};
export function compactBudget(duration,quality='balanced',audio=true){
 const preset=COMPACT_PRESETS[quality]||COMPACT_PRESETS.balanced;
 const colorBytes=duration*(preset.color+(audio?320000:0))/8,matteBytes=duration*preset.matte/8;
 const colorLimit=Math.ceil(colorBytes*1.35+4*1024**2),matteLimit=Math.ceil(matteBytes*1.35+4*1024**2);
 return {...preset,estimatedBytes:colorBytes+matteBytes,colorBytes,matteBytes,colorLimit,matteLimit,maxBytes:colorLimit+matteLimit+65536};
}
// getImageData returns straight RGB. Extract from a separate readback surface so
// the preview/render canvas is not switched into frequent-readback mode.
export function splitStraightRgba(color,matte){
 if(color.length!==matte.length||color.length%4)throw Error('Invalid color/matte buffers.');
 for(let i=0;i<color.length;i+=4){const a=color[i+3];matte[i]=a;matte[i+1]=a;matte[i+2]=a;matte[i+3]=255;color[i+3]=255;}
}
export function createMatteSurfaces(width,height){
 const make=()=>{const c=document.createElement('canvas');c.width=width;c.height=height;return c;};
 const read=make(),color=make(),matte=make(),readCtx=read.getContext('2d',{willReadFrequently:true}),colorCtx=color.getContext('2d'),matteCtx=matte.getContext('2d');
 if(!readCtx||!colorCtx||!matteCtx)throw Error('Canvas compositing is unavailable.');
 const mask=matteCtx.createImageData(width,height);readCtx.globalCompositeOperation='copy';
 return {color,matte,draw(source){readCtx.drawImage(source,0,0,width,height);const image=readCtx.getImageData(0,0,width,height);splitStraightRgba(image.data,mask.data);colorCtx.putImageData(image,0,0);matteCtx.putImageData(mask,0,0);},close(){for(const c of [read,color,matte]){c.width=1;c.height=1;}}};
}
export function compactInstructions({width,height,fps,duration}){
 return `PRISM COMPACT ADOBE PACKAGE

This ZIP contains TWO opaque H.264 MP4 files. Neither MP4 has an embedded alpha
channel. Combine color.mp4 with alpha.mp4 to reconstruct transparency.
Compression is lossy: fine edges and color may differ slightly from the preview.

Frame: ${width} x ${height}, ${fps} fps, ${duration.toFixed(3)} seconds.
Both clips start at time zero. Optional sound is only in color.mp4.
Do not move, retime, or scale one clip independently of the other.

AFTER EFFECTS
1. Extract this entire ZIP to a folder.
2. File > Scripts > Run Script File: choose Import into After Effects.jsx.
3. The script imports both clips and creates a transparent composition using
   the grayscale alpha clip as a Luma Track Matte for the color clip.
4. Place that composition above your background footage.
The script adds items to the open project; it does not save or replace projects.
Manual alternative: import both MP4s into a matching composition, put alpha.mp4
above color.mp4, and set color.mp4's Track Matte to Luma Matte alpha.mp4.
Turn off the matte layer's own visibility.

PREMIERE PRO
1. Import both MP4s and put your background on V1.
2. Align color.mp4 on V2 and alpha.mp4 on V3 at the same starting time.
3. Apply Track Matte Key to color.mp4. Set Matte to Video 3, Composite Using to
   Matte Luma, and leave Reverse off. Keep the matte clip as the effect's source
   while suppressing its own visible output using Premiere's track-matte workflow.
4. Use color.mp4 for sound. The alpha clip is silent.
If importing into an existing sequence, keep both clips at identical scale and
position. A sequence matching the exported frame avoids scaling mismatches.

The alpha clip is opaque grayscale: use LUMA, not its always-opaque alpha channel.
White = visible, black = transparent; gray retains partial glows/edges.
Do not apply color grading, LUTs, or contrast adjustments to alpha.mp4.
Both clips use display-referred SDR; use a matching SDR workflow for the matte.
For exact lossless pixels or a single file with embedded alpha, select PNG MOV
or ProRes 4444 in Prism instead (much larger files).
`;
}
export function afterEffectsImport({width,height,fps,duration}){
 // Only validated numeric metadata is embedded. Filenames are fixed and relative
 // to this script; MIDI filenames cannot inject executable script text.
 if(![width,height,fps,duration].every(Number.isFinite)||width<1||height<1||fps<1||duration<=0)throw Error('Invalid composition settings.');
 return `/* Prism: import the two adjacent MP4s as one transparent composition. */
(function () {
 var folder = File($.fileName).parent;
 var colorFile = new File(folder.fsName + "/color.mp4");
 var matteFile = new File(folder.fsName + "/alpha.mp4");
 if (!colorFile.exists || !matteFile.exists) { alert("Extract the entire Prism ZIP before running this script."); return; }
 app.beginUndoGroup("Import Prism compact video");
 try {
  if (!app.project) app.newProject();
  var color = app.project.importFile(new ImportOptions(colorFile));
  var matte = app.project.importFile(new ImportOptions(matteFile));
  var comp = app.project.items.addComp("Prism transparent video", ${width}, ${height}, 1, ${duration}, ${fps});
  var fillLayer = comp.layers.add(color);
  var matteLayer = comp.layers.add(matte);
  fillLayer.startTime = 0; matteLayer.startTime = 0;
  fillLayer.outPoint = ${duration}; matteLayer.outPoint = ${duration};
  if (fillLayer.setTrackMatte) fillLayer.setTrackMatte(matteLayer, TrackMatteType.LUMA);
  else fillLayer.trackMatteType = TrackMatteType.LUMA;
  matteLayer.enabled = false;
  comp.openInViewer();
 } catch (error) { alert("Prism import failed: " + error.toString()); }
 finally { app.endUndoGroup(); }
})();
`;
}
