import { describe, expect, it } from "vitest";
import { classifyUploadedArtifacts } from "../src/lib/migration/input-classifier";
const f=(path:string,text:string|null="")=>({path,name:path.split('/').pop()!,extension:'.'+path.split('.').pop()!.toLowerCase(),sizeKb:1,text,parsedAsText:text!==null});
describe('input classification branch engine',()=>{
 it('classifies one QVS as ScriptOnly',()=>expect(classifyUploadedArtifacts([f('Sales.qvs','Sales: LOAD * FROM x.csv;')]).packageType).toBe('ScriptOnly'));
 it('classifies QVW plus PRJ as QlikViewProject',()=>expect(classifyUploadedArtifacts([f('Sales.qvw',null),f('Sales-prj/DocProperties.xml','<doc/>')]).packageType).toBe('QlikViewProject'));
 it('classifies QVD-only package',()=>expect(classifyUploadedArtifacts([f('Sales.qvd',null)]).packageType).toBe('QvdPackage'));
 it('classifies full package',()=>expect(classifyUploadedArtifacts([f('App.qvw',null),f('App-prj/CH01.xml','<x/>'),f('scripts/main.qvs','LOAD * FROM data.csv;'),f('data/data.csv','a,b\n1,2')]).packageType).toBe('FullEnterprisePackage'));
 it('does not claim visual readiness for script only',()=>expect(classifyUploadedArtifacts([f('a.qvs','LOAD * FROM x;')]).readiness.find(x=>x.key==='visual')?.score).toBe(5));
});
