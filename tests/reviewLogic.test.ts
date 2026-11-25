import test from "node:test";
import assert from "node:assert/strict";
import { decisionOf, filterPhotos, nextSelection, fileName } from "../src/reviewLogic.ts";
import type { Photo } from "../src/types.ts";
const photos=[{id:"a",group_id:"one"},{id:"b",group_id:"one"},{id:"c",group_id:"two"}] as Photo[];
test("decisions default to unreviewed and filters combine with groups",()=>{
  assert.equal(decisionOf({},"a"),"unreviewed");
  assert.deepEqual(filterPhotos(photos,{a:"keep",b:"reject"},"keep","one").map(photo=>photo.id),["a"]);
  assert.deepEqual(filterPhotos(photos,{a:"keep",b:"reject"},"unreviewed","all").map(photo=>photo.id),["c"]);
});
test("navigation is clamped and handles empty or filtered selections",()=>{
  assert.equal(nextSelection([],null,1),null);
  assert.equal(nextSelection(["a","b"],"b",1),"b");
  assert.equal(nextSelection(["a","b"],"a",-1),"a");
  assert.equal(nextSelection(["a","b"],"missing",1),"a");
});
test("file names work with Windows and macOS separators",()=>{
  assert.equal(fileName("C:\\Foto\\test.ARW"),"test.ARW");
  assert.equal(fileName("/Users/foto/test.NEF"),"test.NEF");
});
