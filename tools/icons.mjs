// Generate self-contained PNG app icons without dependencies.
import {deflateSync} from 'node:zlib';
import {writeFileSync} from 'node:fs';
function crc(buffer){let c=0xffffffff;for(const byte of buffer){c^=byte;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function chunk(type,data){const tag=Buffer.from(type),size=Buffer.alloc(4),sum=Buffer.alloc(4);size.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([tag,data])));return Buffer.concat([size,tag,data,sum]);}
for(const size of [192,512]){
  const pixels=Buffer.alloc((size*4+1)*size);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const px=x/size*512,py=y/size*512;
    let color=[50,103,223];
    const frame=px>=148&&px<=364&&py>=128&&py<=384&&!(px>172&&px<340&&py>152&&py<360);
    const middle=px>=160&&px<=352&&Math.abs(py-256)<=12;
    if(frame||middle)color=[255,255,255];
    if((px-372)**2+(py-133)**2<=21**2)color=[180,204,255];
    const i=y*(size*4+1)+1+x*4;pixels[i]=color[0];pixels[i+1]=color[1];pixels[i+2]=color[2];pixels[i+3]=255;
  }
  const header=Buffer.alloc(13);header.writeUInt32BE(size);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
  const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
  writeFileSync(new URL(`../icons/icon-${size}.png`,import.meta.url),png);
}
