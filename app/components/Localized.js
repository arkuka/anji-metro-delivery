'use client';
import {Children,cloneElement,isValidElement} from 'react';
import {translate} from '../../lib/i18n.mjs';
// Centralize localization of the existing form labels and accessible attributes.
// Values, event handlers and imported business data remain untouched.
export default function Localized({language,children}){
 function visit(node){
  if(typeof node==='string')return translate(node,language);
  if(!isValidElement(node)||node.props.translate==='no')return node;
  const props={};for(const key of ['aria-label','placeholder','title','data-label','data-short-label'])if(typeof node.props[key]==='string')props[key]=translate(node.props[key],language);
  if(node.props.children!==undefined)props.children=Children.map(node.props.children,visit);
  return cloneElement(node,props);
 }
 return Children.map(children,visit);
}
