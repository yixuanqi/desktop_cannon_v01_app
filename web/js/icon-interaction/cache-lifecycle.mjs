/**
 * Desktop Icon Cache lifecycle, V0.6.2.
 * No pixels or filesystem data stored here; only environment/snapshot identities.
 * Browser-neutral, deterministic, testable without Explorer.
 */
export function iconSnapshotKey(snapshot) {
  if(!snapshot || !Array.isArray(snapshot.icons))return '';
  return [snapshot.explorerEpoch??'?',snapshot.icons.length,
    ...snapshot.icons.map(c=>[c.token,c.screenX,c.screenY,c.cellWidth,c.cellHeight,c.imageSize??0].join(':'))].join('|');
}
export function environmentKey(env) {
  if(!env || typeof env.fingerprint!=='string' || !env.fingerprint)return '';
  return env.fingerprint;
}
export class IconCacheLifecycle {
  constructor(){this.revision=0;this.environment='';this.snapshot='';this.reason='initial';}
  invalidate(reason){this.revision++;this.snapshot='';this.reason=reason;return this.revision;}
  observeEnvironment(environment) {
    const key=environmentKey(environment);
    if(!key) {this.invalidate('environment-unavailable');return true;}
    if(this.environment===key)return false;
    this.environment=key;this.invalidate('environment-changed');return true;
  }
  observeSnapshot(snapshot) {
    const key=iconSnapshotKey(snapshot);
    if(!key){this.invalidate('snapshot-unavailable');return true;}
    if(this.snapshot===key)return false;
    this.snapshot=key;this.revision++;this.reason='icon-layout-changed';return true;
  }
  isCurrent(revision, snapshotKey, environmentKeyValue) {
    return revision===this.revision&&snapshotKey===this.snapshot&&
      environmentKeyValue===this.environment;
  }
}
