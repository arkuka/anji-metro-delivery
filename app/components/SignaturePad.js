'use client';
import {forwardRef,useEffect,useImperativeHandle,useRef} from 'react';

// Keep normalized strokes so rotating/resizing a phone never erases the signature.
const SignaturePad=forwardRef(function SignaturePad(_,ref){
  const canvas=useRef(null),strokes=useRef([]),pointer=useRef(null);
  function draw(){
    const c=canvas.current;if(!c)return;
    const context=c.getContext('2d');context.clearRect(0,0,c.width,c.height);
    context.strokeStyle='#142e2b';context.fillStyle='#142e2b';
    context.lineWidth=2.5*(window.devicePixelRatio||1);context.lineCap='round';context.lineJoin='round';
    for(const stroke of strokes.current){
      if(stroke.length===1){context.beginPath();context.arc(stroke[0][0]*c.width,stroke[0][1]*c.height,context.lineWidth/2,0,2*Math.PI);context.fill();continue;}
      context.beginPath();stroke.forEach(([x,y],i)=>i?context.lineTo(x*c.width,y*c.height):context.moveTo(x*c.width,y*c.height));context.stroke();
    }
  }
  useEffect(()=>{
    const c=canvas.current;
    const resize=()=>{const bounds=c.getBoundingClientRect();const ratio=window.devicePixelRatio||1;c.width=Math.max(1,Math.round(bounds.width*ratio));c.height=Math.max(1,Math.round(bounds.height*ratio));draw();};
    const observer=new ResizeObserver(resize);observer.observe(c);resize();return()=>observer.disconnect();
  },[]);
  useImperativeHandle(ref,()=>({hasInk:()=>strokes.current.length>0,toDataURL:()=>canvas.current.toDataURL('image/png'),clear:()=>{strokes.current=[];pointer.current=null;draw();}}));
  function point(e){const r=canvas.current.getBoundingClientRect();return [Math.min(1,Math.max(0,(e.clientX-r.left)/r.width)),Math.min(1,Math.max(0,(e.clientY-r.top)/r.height))];}
  function start(e){if(pointer.current!==null||e.button!==0)return;e.preventDefault();pointer.current=e.pointerId;e.currentTarget.setPointerCapture(e.pointerId);strokes.current.push([point(e)]);draw();}
  function move(e){if(pointer.current!==e.pointerId)return;e.preventDefault();strokes.current.at(-1).push(point(e));draw();}
  function stop(e){if(pointer.current===e.pointerId)pointer.current=null;}
  return <canvas ref={canvas} aria-label="客户签名区域" onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}/>;
});
export default SignaturePad;
