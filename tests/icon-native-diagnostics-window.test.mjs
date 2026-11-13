import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const rust=readFileSync(new URL('src-tauri/src/lib.rs',root),'utf8');
test('obsolete native diagnostic window is excluded from production',()=>{
  assert.equal(existsSync(new URL('web/diagnostics.html',root)),false);
  assert.equal(existsSync(new URL('web/js/icon-interaction/native-diagnostics.mjs',root)),false);
  assert.doesNotMatch(rust,/WebviewUrl::App\("diagnostics.html"/);
  assert.doesNotMatch(rust,/"icon_diagnostics"/);
});
