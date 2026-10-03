export function resolveFrame(aspect,customWidth,customHeight,longEdge){
 const widthPart=Number(customWidth),heightPart=Number(customHeight);
 const ratio=aspect==='custom'?widthPart/heightPart:Number(aspect);
 if(aspect==='custom'&&(!Number.isFinite(widthPart)||!Number.isFinite(heightPart)||widthPart<=0||heightPart<=0))throw Error('Enter a positive width and height for the custom ratio.');
 if(!Number.isFinite(ratio)||ratio<=0||!Number.isFinite(longEdge)||longEdge<2)throw Error('Choose a valid aspect ratio and resolution.');
 const edge=Math.round(longEdge/2)*2;
 const width=ratio>=1?edge:Math.round(edge*ratio/2)*2;
 const height=ratio>=1?Math.round(edge/ratio/2)*2:edge;
 if(width<2||height<2)throw Error('This ratio is too narrow at the selected resolution. Increase the shorter ratio value.');
 return {width,height,ratio:width/height};
}
export function fitFrame(width,height,ratio){
 if(width/height>ratio)return {width:height*ratio,height};
 return {width,height:width/ratio};
}

// Exact pixel dimensions are never silently rounded or clamped.
export function resolveCustomResolution(width,height){
 width=Number(width);height=Number(height);
 if(![width,height].every(n=>Number.isInteger(n)&&n>=2&&n<=8192))throw Error('Enter whole-pixel dimensions from 2 to 8192.');
 if(width%2||height%2)throw Error('Use even pixel dimensions (for example, 1920 × 1080).');
 if(width*height>33554432)throw Error('Choose a resolution of 32 megapixels or less.');
 return {width,height,ratio:width/height};
}
